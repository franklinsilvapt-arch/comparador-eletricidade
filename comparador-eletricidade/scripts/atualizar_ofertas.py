#!/usr/bin/env python3
"""Gera data/ofertas.json a partir do ficheiro oficial de ofertas comerciais da ERSE
(o mesmo que alimenta o simulador de precos da ERSE).

Fonte: https://simuladorprecos.erse.pt/ -> "Ofertas comerciais (CSV)".
O caminho do zip muda a cada atualizacao e e lido de /config/Settings.json.
So usa a biblioteca padrao do Python.

Uso normal:        python3 scripts/atualizar_ofertas.py
Teste com um zip:  python3 scripts/atualizar_ofertas.py --zip CSV.zip --data 2026-09-29
"""
import csv, io, json, os, re, sys, urllib.parse, urllib.request, zipfile
from datetime import date, datetime

BASE = "https://simuladorprecos.erse.pt"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ofertas.json")
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
    dados = {
        "v": 3, "fonte": "ERSE - Ofertas comerciais (CSV)", "ficheiro": caminho if caminho.startswith("http") else "",
        "atualizado": atualizado, "pots": [float(p.replace(",", ".")) for p in POTS], "ofertas": ofertas,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(ofertas)} ofertas de {len(coms)} comercializadores ({expiradas} expiradas ignoradas), ficheiro ERSE de {atualizado}")


if __name__ == "__main__":
    main()
