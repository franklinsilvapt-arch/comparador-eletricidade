#!/usr/bin/env python3
"""Gera data/ofertas.json a partir do ficheiro oficial de ofertas comerciais da ERSE
(o mesmo que alimenta o simulador de precos da ERSE).

Fonte: https://simuladorprecos.erse.pt/ -> "Ofertas comerciais (CSV)".
O caminho do zip muda a cada atualizacao e e lido de /config/Settings.json.
So usa a biblioteca padrao do Python.

Alem das ofertas, o script calibra sozinho os parametros regulados (IVA reduzido, imposto especial
de consumo, contribuicao audiovisual, tarifa de acesso, tarifa social): pede ao simulador da ERSE a
fatura do mercado regulado em 18 casos, resolve os parametros e confirma que a nossa formula da o
mesmo total. Tambem vai buscar ao simulador os nomes e os logotipos de comercializadores novos.
Se a calibracao falhar, as ofertas sao atualizadas na mesma, ficam os parametros anteriores e o
workflow termina com erro para o GitHub avisar por email.

Uso normal:        python3 scripts/atualizar_ofertas.py
Teste com um zip:  python3 scripts/atualizar_ofertas.py --zip CSV.zip --data 2026-09-29
"""
import csv, io, json, os, re, subprocess, sys, urllib.parse, urllib.request, zipfile
from datetime import date, datetime

BASE = "https://simuladorprecos.erse.pt"
RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(RAIZ, "data", "ofertas.json")
LOGOS = os.path.join(RAIZ, "logos")
SIM = BASE + "/connectors/simular_eletricidade/"
POTS = ["1,15", "2,3", "3,45", "4,6", "5,75", "6,9", "10,35", "13,8", "17,25", "20,7", "27,6", "34,5", "41,4"]
UA = {"User-Agent": "Mozilla/5.0 (compatible; LF-eletricidade/1.0; +https://www.literaciafinanceira.pt)"}
MIN_OFERTAS = 100
TXT_MAX = 600


def get(url):
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/?=&%"), headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def num(s):
    if s is None or str(s).strip() == "":
        return 0.0
    try:
        return float(str(s).replace(",", "."))
    except ValueError:
        return 0.0


def r5(s):
    n = num(s)
    return round(n, 5) if n else 0


def txt(o, k, n=TXT_MAX):
    t = re.sub(r"\s+", " ", (o.get(k) or "")).strip()
    if t in ("", "-", "N/A", "n/a", "NA", "Não aplicável", "Não Aplicável"):
        return ""
    return t if len(t) <= n else t[: n - 1].rstrip() + "…"


def link(o, k):
    t = (o.get(k) or "").strip()
    m = re.findall(r"https?://[^\s]+", t)
    if m:
        return m[-1]
    if re.match(r"^www\.[^\s]+$", t):
        return "https://" + t
    return ""


def ler(zf, nome):
    alvo = [n for n in zf.namelist() if n.replace("\\", "/").split("/")[-1] == nome][0]
    t = zf.read(alvo).decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(t), delimiter=";", quoting=csv.QUOTE_NONE))


def compacta(rows, n):
    """rows: lista por potencia de [tf, p1, ...] ou 0 -> [termosFixos, p1, p2, ...]; cada preco e numero unico ou lista."""
    out = [[(r[0] if r else 0) for r in rows]]
    for j in range(1, n):
        vals = [r[j] for r in rows if r]
        out.append(vals[0] if len(set(vals)) == 1 else [(r[j] if r else 0) for r in rows])
    return out


# ---------------------------------------------------------------------------
# Calibracao dos parametros regulados com o simulador da ERSE
# ---------------------------------------------------------------------------
def simular(p, k, social=False, fam=False):
    """Fatura anual no simulador da ERSE: potencia de indice p, k kWh por ano em tarifa simples."""
    corpo = ("idioma=1&filtro_IndexacaoSpot=1&filtro_ServicosAdicionais=0&filtro_SemRestricoesAdicionais=1"
             "&filtro_SemPrecosIndexados=1&filtro_SemReembolsos=1&filtro_energia100Renovavel=0&filtro_Fidelizacao=1"
             f"&filtro_FamiliasNumerosas={1 if fam else 0}&filtro_NovosClientes=1&pageStartIndex=0&pageStep=500"
             "&filtro_comercializadores=&filtro_contratacao=1&filtro_faturacao=1&filtro_pagamento=1"
             "&filtro_TipoOfertaELE=1&filtro_TipoOfertaGas=1&filtro_gas100Renovavel=0&caseType=3&electFastEuro=&electFastDays="
             f"&electSupply={p}&cycle=1&electCalendar=3&electCalendarPeriodStart=&electCalendarPeriodEnd="
             f"&electPonta={k}&electCheias=&electVazio=&electFaturaPonta=&electFaturaCheias=&electFaturaVazio=&electFaturaFixo="
             f"&socialOffer={2 if social else 1}")
    req = urllib.request.Request(SIM, data=corpo.encode(), headers={**UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8-sig"))


def regulado(j):
    """Linha do mercado regulado numa resposta do simulador."""
    for r in j.get("Resultados") or []:
        o = r["Oferta"][0]
        if o.get("CodOferta") == "TUR" and str(o.get("TipoContagem")) == "1":
            return {"total": float(r["PrecoTotal"]), "tf": num(o["PrecoTermoFixo"]), "e": num(o["PrecoTermoenergia"])}
    raise RuntimeError("mercado regulado em falta na resposta do simulador")


def fatura(P, tf, e, i, k, social=False, fam=False):
    """A mesma formula do comparador-eletricidade.js, para a tarifa simples."""
    pot = float(POTS[i].replace(",", "."))
    tar = P["TAR_POT"][i] if i < len(P["TAR_POT"]) else 0
    iec, cav = P["IEC"], P["CAV"]
    if social:
        tf, e, tar = tf - P["TS_POT"][i], e - P["TS_KWH"], tar - P["TS_POT"][i]
        iec, cav = P["IEC_TS"], P["CAV_TS"]
    lim = (P["KWH_IVA6_FAM"] if fam else P["KWH_IVA6"]) * 365 / 30
    sh6 = min(1, lim / k) if pot <= 6.9 and k > 0 else 0
    iva_e = sh6 * 1.06 + (1 - sh6) * 1.23
    tfa, tara = tf * 365, tar * 365
    tf_iva = tara * 1.06 + (tfa - tara) * 1.23 if pot <= 3.45 else tfa * 1.23
    if k < CAV_MIN_KWH:
        cav = 0  # isencao da contribuicao audiovisual abaixo de 400 kWh por ano
    return e * k * iva_e + tf_iva + k * iec * 1.23 + cav * 12 * 1.06


CAV_MIN_KWH = 400
CASOS = [(3, 1000, 0, 0), (3, 1000, 1, 0), (3, 390, 0, 0), (3, 100, 0, 0), (3, 2400, 0, 0), (3, 5000, 0, 0), (3, 5000, 0, 1), (0, 1900, 0, 0), (1, 1900, 0, 0), (2, 1900, 0, 0),
         (6, 5000, 0, 0), (0, 1900, 1, 0), (1, 1900, 1, 0), (2, 1900, 1, 0), (3, 1900, 1, 0), (4, 1900, 1, 0), (5, 1900, 1, 0), (3, 100, 1, 0)]


def calibrar(TF, PK, pedir=simular):
    """TF e PK: termo fixo (EUR/dia) e preco do kWh do mercado regulado por potencia, tirados do CSV.
    Devolve (parametros, desvio maximo em EUR, respostas do simulador)."""
    resp = {c: pedir(c[0], c[1], bool(c[2]), bool(c[3])) for c in CASOS}
    R = {c: regulado(j) for c, j in resp.items()}
    T = lambda c: R[c]["total"]
    tf, p = TF[3] * 365, PK[3]
    iec = round(((T((3, 2400, 0, 0)) - T((3, 1000, 0, 0))) / 1400 - p * 1.06) / 1.23, 4)
    cav = round((T((3, 1000, 0, 0)) - tf * 1.23 - 1000 * (p * 1.06 + iec * 1.23)) / 12 / 1.06, 2)

    def limite(c):
        en_iva = T(c) - tf * 1.23 - 5000 * iec * 1.23 - cav * 12 * 1.06
        return round((p * 5000 * 1.23 - en_iva) / (p * 0.17) * 30 / 365)
    kwh6, kwh6_fam = limite((3, 5000, 0, 0)), limite((3, 5000, 0, 1))
    tar = []
    for i in range(3):
        tf_iva = T((i, 1900, 0, 0)) - 1900 * (PK[i] * 1.06 + iec * 1.23) - cav * 12 * 1.06
        tar.append(round((TF[i] * 365 * 1.23 - tf_iva) / (365 * 0.17), 4))
    ts_pot = [round(TF[i] - R[(i, 1900, 1, 0)]["tf"], 4) for i in range(6)]
    ts_kwh = round(PK[2] - R[(2, 1900, 1, 0)]["e"], 4)
    ps, tfs = p - ts_kwh, (TF[3] - ts_pot[3]) * 365
    iec_ts = round(((T((3, 1900, 1, 0)) - T((3, 1000, 1, 0))) / 900 - ps * 1.06) / 1.23, 4)
    iec_ts = 0.0 if abs(iec_ts) < 0.00015 else iec_ts
    cav_ts = round((T((3, 1000, 1, 0)) - tfs * 1.23 - 1000 * (ps * 1.06 + iec_ts * 1.23)) / 12 / 1.06, 2)
    P = {"TAR_POT": tar, "IEC": iec, "CAV": cav, "KWH_IVA6": kwh6, "KWH_IVA6_FAM": kwh6_fam,
         "TS_POT": ts_pot, "TS_KWH": ts_kwh, "IEC_TS": iec_ts, "CAV_TS": cav_ts, "CAV_MIN_KWH": CAV_MIN_KWH}
    desvio = max(abs(fatura(P, TF[c[0]], PK[c[0]], c[0], c[1], bool(c[2]), bool(c[3])) - T(c)) for c in CASOS)
    plaus = (0 <= iec < 0.02 and 0 < cav < 10 and 0 <= cav_ts <= cav and 50 <= kwh6 <= 1000 and kwh6 <= kwh6_fam <= 2000
             and all(0 < x < TF[i] for i, x in enumerate(ts_pot)) and 0 < ts_kwh < p and all(0 < x < TF[i] for i, x in enumerate(tar)))
    if not plaus:
        raise RuntimeError(f"parametros fora do plausivel: {P}")
    return P, round(desvio, 4), resp


def nomes_e_logos(resp):
    """Nomes dos comercializadores e logotipos em falta, a partir das respostas do simulador."""
    nomes, urls = {}, {}
    for j in resp.values():
        por_nome = {c["name"]: c["code"] for c in j.get("Comercializadores") or []}
        nomes.update({c["code"]: c["name"] for c in j.get("Comercializadores") or []})
        for r in j.get("Resultados") or []:
            o = r["Oferta"][0]
            cod = por_nome.get(o.get("Comercializador"))
            if cod and (o.get("Logotipo") or "").startswith("http"):
                urls[cod] = o["Logotipo"]
    return nomes, urls


def baixar_logos(urls, codigos):
    os.makedirs(LOGOS, exist_ok=True)
    for cod in codigos:
        destino = os.path.join(LOGOS, cod.lower().replace(" ", "") + ".png")
        if os.path.exists(destino) or cod not in urls:
            continue
        try:
            dados = get(urls[cod])
            if dados[:4] in (b"\x89PNG", b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xe1", b"GIF8", b"RIFF") and len(dados) < 400000:
                with open(destino, "wb") as f:
                    f.write(dados)
                print("logotipo novo:", cod)
        except Exception as e:
            print("logotipo de", cod, "falhou:", e, file=sys.stderr)


def publicar(mensagem):
    """No GitHub Actions, grava as alteracoes no repositorio mesmo que o script termine com erro a seguir."""
    if not os.environ.get("GITHUB_ACTIONS"):
        return
    git = lambda *a: subprocess.run(["git", "-C", RAIZ, *a], check=False)
    git("config", "user.name", "lf-bot")
    git("config", "user.email", "bot@literaciafinanceira.pt")
    git("add", "-A", "data", "logos")
    if subprocess.run(["git", "-C", RAIZ, "diff", "--cached", "--quiet"]).returncode:
        git("commit", "-m", mensagem)
        git("pull", "--rebase")
        git("push")


def main():
    args = sys.argv[1:]
    if "--zip" in args:
        caminho = args[args.index("--zip") + 1]
        zf = zipfile.ZipFile(caminho)
        atualizado = args[args.index("--data") + 1] if "--data" in args else date.today().isoformat()
    else:
        settings = json.loads(get(BASE + "/config/Settings.json").decode("utf-8-sig"))
        caminho = settings["csvPath"]
        if not caminho.startswith("http"):
            caminho = BASE + "/" + caminho.lstrip("/")
        zf = zipfile.ZipFile(io.BytesIO(get(caminho)))
        m = re.search(r"/(\d{4})(\d{2})(\d{2})[ _%]", caminho)
        atualizado = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else date.today().isoformat()
    ref = datetime.strptime(atualizado, "%Y-%m-%d").date()
    cond = ler(zf, "CondComerciais.csv")
    precos = ler(zf, "Precos_ELEGN.csv")

    por_cod = {}
    for p in precos:
        por_cod.setdefault(p["COD_Proposta"], {})[(p["Pot_Cont"], p["Contagem"])] = p

    flags = ["FiltroFidelização", "FiltroRenovavel_ELE", "FiltroRestrições", "FiltroPrecosIndex_ELE",
             "FiltroServicosAdic", "FiltroTarifaSocial", "FiltroReembolsos", "FiltroNovosClientes"]
    ofertas, expiradas = [], 0
    for o in cond:
        if o.get("Fornecimento") != "ELE" or o.get("Segmento") not in ("Dom", "Tod"):
            continue
        fim = (o.get("Data fim") or "").strip()
        if fim:
            try:
                if datetime.strptime(fim, "%d/%m/%Y").date() < ref:
                    expiradas += 1
                    continue
            except ValueError:
                pass
        ps = por_cod.get(o["COD_Proposta"], {})
        s, b, t = [], [], []
        for pot in POTS:
            p1, p2, p3 = ps.get((pot, "1")), ps.get((pot, "2")), ps.get((pot, "3"))
            s.append([r5(p1["TF"]), r5(p1["TV|TVFV|TVP"])] if p1 and num(p1["TF"]) and num(p1["TV|TVFV|TVP"]) else 0)
            b.append([r5(p2["TF"]), r5(p2["TV|TVFV|TVP"]), r5(p2["TVV|TVC"])]
                     if p2 and num(p2["TF"]) and num(p2["TV|TVFV|TVP"]) and num(p2["TVV|TVC"]) else 0)
            t.append([r5(p3["TF"]), r5(p3["TV|TVFV|TVP"]), r5(p3["TVV|TVC"]), r5(p3["TVVz"])]
                     if p3 and num(p3["TF"]) and num(p3["TV|TVFV|TVP"]) and num(p3["TVV|TVC"]) and num(p3["TVVz"]) else 0)
        if not any(s) and not any(b) and not any(t):
            continue
        x = {
            "id": o["COD_Proposta"], "c": o["COM"], "n": re.sub(r"\s+", " ", o["NomeProposta"]).strip(),
            "f": "".join("1" if o.get(k) == "S" else "0" for k in flags),
            "pg": o.get("FiltroPagamento", ""), "ft": o.get("Filtrofaturacao", ""),
            "ct": o.get("FiltroContratacao", ""), "at": o.get("FiltroAtendimento", ""),
            "u": link(o, "LinkOfertaCom") or link(o, "LinkCOM"),
        }
        for k, col in (("fp", "LinkFichaPadrao"), ("cg", "LinkCondicoesGerais"), ("ce", "Contrat_Elect")):
            v = link(o, col)
            if v:
                x[k] = v
        for k, col, n in (("m", "TxTModalidade", 160), ("tel", "ContactoComercialTel", 40), ("web", "ContactoWEBouMAIL", 120),
                          ("to", "TxTOferta", TXT_MAX), ("tfi", "TxTFidelização", TXT_MAX), ("tr", "TxTRestricoesAdic", TXT_MAX),
                          ("dr", "Detalhe restrições", TXT_MAX), ("ts", "TxTServicoAdic", TXT_MAX), ("tos", "TxToutrosServicoAdic", TXT_MAX),
                          ("trb", "TxTReembolsos", TXT_MAX), ("ob", "DetalheOutrosDesc/benefi", TXT_MAX),
                          ("tap", "TxTAtualizaPrecos", TXT_MAX), ("tfa", "TxTFaturacao", 200)):
            v = txt(o, col, n)
            if v:
                x[k] = v
        if (o.get("DuracaoContrato") or "").strip().isdigit():
            x["du"] = int(o["DuracaoContrato"])
        ini = (o.get("Data ini") or "").strip()
        if ini:
            x["ini"] = ini
        if fim:
            x["fim"] = fim
        cs = num(o.get("CustoServicos_c/IVA (€/ano)"))
        if cs:
            x["cs"] = round(cs, 2)
        R = [num(o.get("ReembFixo (€/ano)")), num(o.get("ReembTF_ELE (%)")), num(o.get("ReembTW_ELE (%)")), num(o.get("ReembW_ELE (€/kWh)"))]
        if any(R):
            x["r"] = R
        D = [num(o.get("DescontNovoCliente_c/IVA (€/ano)")), num(o.get("Desc. TF_ELE (%) - Novo Cliente")),
             num(o.get("Desc. TW_ELE (%) - Novo Cliente")), num(o.get("Desc. W_ELE (€/kWh) - Novo Cliente"))]
        if any(D):
            x["d"] = D
        # Formato compacto: s = [termosFixos, kWh]; b = [termosFixos, foraVazio, vazio]; t = [termosFixos, ponta, cheias, vazio].
        if any(s):
            x["s"] = compacta(s, 2)
        if any(b):
            x["b"] = compacta(b, 3)
        if any(t):
            x["t"] = compacta(t, 4)
        ofertas.append(x)

    coms = sorted({o["c"] for o in ofertas})
    if len(ofertas) < MIN_OFERTAS or "TUR" not in coms:
        sys.exit(f"Apenas {len(ofertas)} ofertas ou sem tarifa regulada: o formato da ERSE pode ter mudado. Nada foi escrito.")
    anteriores = {}
    try:
        with open(OUT, encoding="utf-8") as f:
            anteriores = json.load(f)
    except Exception:
        pass
    dados = {
        "v": 3, "fonte": "ERSE - Ofertas comerciais (CSV)", "ficheiro": caminho if caminho.startswith("http") else "",
        "atualizado": atualizado, "pots": [float(p.replace(",", ".")) for p in POTS],
    }
    for k in ("params", "params_data", "params_desvio", "nomes"):
        if k in anteriores:
            dados[k] = anteriores[k]

    # Calibracao: parametros regulados, nomes e logotipos a partir do simulador da ERSE
    erro = None
    if "--sem-simulador" not in args:
        try:
            tur = [o for o in ofertas if o["id"] == "TUR"][0]
            TF = tur["s"][0]
            PK = tur["s"][1] if isinstance(tur["s"][1], list) else [tur["s"][1]] * len(TF)
            P, desvio, resp = calibrar(TF, PK, PEDIR)
            nomes, urls = nomes_e_logos(resp)
            dados["nomes"] = {**dados.get("nomes", {}), **nomes}
            baixar_logos(urls, coms)
            if desvio > 0.03:
                raise RuntimeError(f"a formula desvia {desvio} EUR do simulador da ERSE com os parametros {P}")
            dados.update({"params": P, "params_data": date.today().isoformat(), "params_desvio": desvio})
            print(f"parametros calibrados (desvio maximo {desvio} EUR): {P}")
        except Exception as e:
            erro = e
            print("CALIBRACAO FALHOU, ficam os parametros anteriores:", e, file=sys.stderr)
    # Ofertas em falta no ficheiro da ERSE, lidas do site do comercializador, e validacao contra o site
    if "--sem-sites" not in args:
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import fontes_extra
            ofertas, erros_sites = fontes_extra.aplicar(ofertas)
            for e in erros_sites:
                print("FONTE DO SITE FALHOU:", e, file=sys.stderr)
            if erros_sites and not erro:
                erro = RuntimeError("; ".join(erros_sites))
        except Exception as e:
            print("FONTES DOS SITES FALHARAM:", e, file=sys.stderr)
            erro = erro or e
        coms = sorted({o["c"] for o in ofertas})
    dados["logos"] = sorted(c for c in coms if os.path.exists(os.path.join(LOGOS, c.lower().replace(" ", "") + ".png")))
    dados["ofertas"] = ofertas
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    n_site = sum(1 for o in ofertas if o.get("src") == "site")
    print(f"{len(ofertas)} ofertas de {len(coms)} comercializadores ({n_site} lidas dos sites, {expiradas} expiradas ignoradas), ficheiro ERSE de {atualizado}")
    publicar("Ofertas da ERSE atualizadas")
    if erro:
        sys.exit(1)


PEDIR = simular

if __name__ == "__main__":
    main()
