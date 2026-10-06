#!/usr/bin/env python3
"""Precos do mercado diario OMIE para Portugal, lidos dos ficheiros oficiais do OMIE.

Fonte: https://www.omie.es/pt/file-download?parents[0]=marginalpdbcpt&filename=marginalpdbcpt_AAAAMMDD.1
Formato: uma linha por periodo de 15 minutos: ano;mes;dia;periodo;preco Portugal;preco Espanha (EUR/MWh).

Gera data/omie.json com:
- a media dos ultimos 30 dias com dados (EUR/MWh) e as medias por periodo horario, para o ciclo diario e
  para o ciclo semanal (bi-horaria: fora de vazio e vazio; tri-horaria: ponta, cheias e vazio);
- a media de cada dia dos ultimos 90 dias.
Os precos de cada periodo de 15 minutos ficam em cache em data/omie_qh.json para so pedir ao OMIE os dias em falta.

Periodos horarios de Portugal continental (BTN, ate 20,7 kVA) segundo a ERSE, em hora legal:
https://www.erse.pt/media/wijn0vgt/periodos-hor%C3%A1rios-de-energia-el%C3%A9trica-em-portugal.pdf
Os dias de mudanca da hora (92 ou 100 periodos) ficam fora das medias por periodo.
"""
import json, os, sys, urllib.request
from datetime import date, datetime, timedelta

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(RAIZ, "data", "omie.json")
CACHE = os.path.join(RAIZ, "data", "omie_qh.json")
URL = "https://www.omie.es/pt/file-download?parents%5B0%5D=marginalpdbcpt&filename=marginalpdbcpt_{d}.1"
UA = {"User-Agent": "Mozilla/5.0 (compatible; LF-eletricidade/1.0; +https://www.literaciafinanceira.pt)"}
JANELA = 30      # dias da media usada no comparador
HISTORICO = 90   # dias guardados na serie diaria


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode("latin-1")


def ler_dia(d):
    """Precos de 15 em 15 minutos (EUR/MWh) para Portugal no dia d, ou None se o OMIE ainda nao publicou."""
    try:
        t = get(URL.format(d=d.strftime("%Y%m%d")))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    if not t.startswith("MARGINALPDBCPT"):
        return None
    precos = []
    for lin in t.splitlines()[1:]:
        c = lin.strip().split(";")
        if len(c) < 5 or not c[3].isdigit():
            continue
        if (int(c[0]), int(c[1]), int(c[2])) != (d.year, d.month, d.day):
            raise ValueError(f"OMIE {d}: data inesperada na linha {lin!r}")
        precos.append(float(c[4]))
    if len(precos) not in (92, 96, 100):
        raise ValueError(f"OMIE {d}: {len(precos)} periodos")
    return precos


# ---------------------------------------------------------------------------
# Periodos horarios (ERSE). Cada funcao devolve 'p', 'c' ou 'v' para um quarto de hora que comeca em `h` horas (float).
# ---------------------------------------------------------------------------
def em(h, *intervalos):
    return any(a <= h < b for a, b in intervalos)


def verao(d):
    """Hora legal de verao em Portugal: do ultimo domingo de marco ao ultimo domingo de outubro."""
    def ultimo_domingo(mes):
        x = date(d.year, mes + 1, 1) - timedelta(days=1) if mes < 12 else date(d.year, 12, 31)
        return x - timedelta(days=(x.weekday() + 1) % 7)
    return ultimo_domingo(3) <= d < ultimo_domingo(10)


def periodo_diario(d, h):
    if em(h, (22, 24), (0, 8)):
        return "v"
    if verao(d):
        return "p" if em(h, (10.5, 13), (19.5, 21)) else "c"
    return "p" if em(h, (9, 10.5), (18, 20.5)) else "c"


def periodo_semanal(d, h):
    wd = d.weekday()  # 0 = segunda
    if wd == 6:
        return "v"
    if verao(d):
        if wd == 5:
            return "c" if em(h, (9, 14), (20, 22)) else "v"
        if em(h, (0, 7)):
            return "v"
        return "p" if em(h, (9.25, 12.25)) else "c"
    if wd == 5:
        return "c" if em(h, (9.5, 13), (18.5, 22)) else "v"
    if em(h, (0, 7)):
        return "v"
    return "p" if em(h, (9.5, 12), (18.5, 21)) else "c"


def hora_portugal(dias, d):
    """Os ficheiros do OMIE estao em hora espanhola (CET/CEST), uma hora a frente de Portugal.
    Devolve os 96 precos do dia d em hora legal portuguesa (00:00 em Portugal = 01:00 em Espanha), ou None
    se faltar o dia seguinte ou algum dos dois tiver mudanca de hora."""
    a, b = dias.get(d), dias.get(d + timedelta(days=1))
    if not a or not b or len(a) != 96 or len(b) != 96:
        return None
    return a[4:] + b[:4]


def medias(dias):
    """dias: {date: [96 precos em hora espanhola]}. Devolve a media global e as medias por periodo em cada ciclo,
    com os periodos horarios em hora legal portuguesa."""
    tot, n = 0.0, 0
    acc = {"d": {"p": [0.0, 0], "c": [0.0, 0], "v": [0.0, 0]}, "s": {"p": [0.0, 0], "c": [0.0, 0], "v": [0.0, 0]}}
    for d, precos in dias.items():
        for x in precos:
            tot += x; n += 1
        pt = hora_portugal(dias, d)
        if pt is None:
            continue
        for i, x in enumerate(pt):
            h = i / 4
            for ciclo, f in (("d", periodo_diario), ("s", periodo_semanal)):
                a = acc[ciclo][f(d, h)]; a[0] += x; a[1] += 1
    def m(a):
        return round(a[0] / a[1], 2) if a[1] else None
    out = {"media": round(tot / n, 2) if n else None}
    for ciclo in ("d", "s"):
        p, c, v = (m(acc[ciclo][k]) for k in "pcv")
        np_, nc = acc[ciclo]["p"][1], acc[ciclo]["c"][1]
        fv = round((acc[ciclo]["p"][0] + acc[ciclo]["c"][0]) / (np_ + nc), 2) if np_ + nc else None
        out[ciclo] = {"fv": fv, "vz": v, "p": p, "c": c}
    return out


def atualizar(pedir=ler_dia, hoje=None, log=print):
    hoje = hoje or date.today()
    cache = {}
    try:
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    except Exception:
        pass
    inicio = hoje - timedelta(days=HISTORICO + 5)
    dias, pedidos = {}, 0
    # Do dia mais recente para o mais antigo: a primeira corrida pede no maximo 40 ficheiros e o resto fica para os dias seguintes
    for k in range(HISTORICO + 7):
        d = hoje + timedelta(days=1) - timedelta(days=k)
        if d < inicio:
            break
        ch = d.isoformat()
        if ch in cache:
            dias[d] = cache[ch]
            continue
        if pedidos >= 40:
            continue
        pedidos += 1
        p = pedir(d)
        if p is not None:
            dias[d] = p
            cache[ch] = p
    cache = {k: v for k, v in cache.items() if date.fromisoformat(k) >= inicio}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, separators=(",", ":"))

    completos = sorted(d for d in dias if d <= hoje + timedelta(days=1))
    if len(completos) < 7:
        raise RuntimeError(f"OMIE: so {len(completos)} dias com dados")
    janela = completos[-JANELA:]
    med = medias({d: dias[d] for d in janela})
    # o ultimo dia da janela precisa do dia seguinte para as primeiras horas em hora portuguesa
    seg = janela[-1] + timedelta(days=1)
    if seg in dias:
        med = medias({**{d: dias[d] for d in janela}, seg: dias[seg]})
    serie = [{"d": d.isoformat(), "m": round(sum(dias[d]) / len(dias[d]), 2)} for d in completos[-HISTORICO:]]
    dados = {"fonte": "OMIE - preco marginal do mercado diario, Portugal", "unidade": "EUR/MWh",
             "atualizado": hoje.isoformat(), "de": janela[0].isoformat(), "ate": janela[-1].isoformat(),
             "ndias": len(janela), **med, "serie": serie}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dados, f, separators=(",", ":"))
    log(f"OMIE: {len(janela)} dias de {dados['de']} a {dados['ate']}, media {med['media']} EUR/MWh "
        f"(diario: fora de vazio {med['d']['fv']}, vazio {med['d']['vz']}; semanal: {med['s']['fv']} / {med['s']['vz']}), {pedidos} ficheiros pedidos")
    return dados


if __name__ == "__main__":
    atualizar()
