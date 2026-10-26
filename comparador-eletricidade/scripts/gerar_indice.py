#!/usr/bin/env python3
"""Índice da eletricidade do Literacia Financeira: custo anual de duas casas-tipo da ERSE no mercado livre.

Lê data/ofertas.json e escreve data/indice.json (estado atual mais a série, que vai sendo acrescentada a
cada execução). Corre no fim de atualizar_ofertas.py, por isso o publicar() desse script grava o ficheiro.
O cálculo replica calcOpcao() de comparador-eletricidade.js (metodologia do simulador da ERSE mais a taxa
da DGEG). Regras do índice:
- Tarifa simples, sem tarifa social e sem IVA familiar. Contam as ofertas para novos clientes (quem muda de
  comercializador é cliente novo), mas não os descontos de adesão à parte (campo "d"). Reembolsos e serviços
  obrigatórios contam.
- Ficam de fora as ofertas indexadas ao OMIE (o preço muda todos os meses).
- Mediana: entre a oferta mais barata de cada comercializador, para cada um contar uma vez.
Uso: python3 gerar_indice.py [--ofertas caminho] [--saida caminho] [--sem-serie]
"""
import json, os, statistics as st, sys

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PERFIS = [
    {"id": "p1", "label": "Casal sem filhos", "pot": 2, "kwh": 1900},
    {"id": "p2", "label": "Casal com 2 filhos", "pot": 5, "kwh": 5000},
    {"id": "p3", "label": "Casal com 4 filhos", "pot": 7, "kwh": 10900},  # consumidor-tipo 3 da ERSE: 13,8 kVA
]
DGEG = 0.07
NOMES = {"TUR": "Mercado regulado", "ALFAENERGIA": "Alfa Energia", "AUDAX": "Audax", "COOP": "Coopérnico", "EDPC": "EDP",
         "END": "Endesa", "ENIPLENITUDE": "Plenitude", "EZUENERGIA": "EZU Energia", "GALP": "Galp", "GOLD": "Goldenergy",
         "IBD": "Iberdrola", "IBELECTRA": "Ibelectra", "JAFPLUS": "JAFplus", "LUZBOA": "Luzboa", "LUZIGAS": "Luzigás", "MUON": "MUON",
         "MEOENERGIA": "MEO Energia", "NABALIAENERGIA": "Nabalia Energia", "NOSSAENERGIA": "Nossa Energia", "OENEO": "Oeneo",
         "PORTULOGOS": "Portulogos", "REPSOL": "Repsol", "YESENERGY": "Yes Energy", "ACCIONA": "Acciona", "ELERGONE": "Elergone",
         "LOGICA": "Logica Energy", "ZUG POWER": "Zug Power", "G9": "G9", "ROCKWATT": "Rockwatt"}


def custo(d, o, i, kwh, k="s", novo=False):
    P = d.get("params", {})
    pots = d["pots"]
    arr = o.get(k)
    if not arr:
        return None
    # Igual a expandir() do comparador: termo fixo por potencia (1 = o mesmo da tarifa simples) e energia por potencia ou fixa.
    tfs = o["s"][0] if arr[0] == 1 and o.get("s") else arr[0]
    if not isinstance(tfs, list) or i >= len(tfs) or not tfs[i]:
        return None
    vals = [tfs[i]]
    for a in arr[1:]:
        x = a[i] if isinstance(a, list) else a
        if not x:
            return None  # sem preco nesta potencia: a oferta nao existe aqui
        vals.append(x)
    TAR = P.get("TAR_POT", [0.0573, 0.1145, 0.1718]); IEC = P.get("IEC", 0.001); CAV = P.get("CAV", 2.85)
    KIVA = P.get("KWH_IVA6", 200); CAVMIN = P.get("CAV_MIN_KWH", 400)
    pot = pots[i]
    tar_dia = TAR[i] if i < len(TAR) else 0
    cav_mes = 0 if kwh < CAVMIN else CAV
    lim = KIVA * 365 / 30
    sh6 = min(1, lim / kwh) if pot <= 6.9 and kwh > 0 else 0
    iva_e = sh6 * 1.06 + (1 - sh6) * 1.23
    if k == "s":
        en = vals[1] * kwh
    else:
        return None
    tf = vals[0] * 365; tar = tar_dia * 365
    tf_iva = tar * 1.06 + (tf - tar) * 1.23 if pot <= 3.45 else tf * 1.23
    def desc(a):
        return a[0] + a[1] * tf * 1.23 + (a[2] * (en + kwh * IEC) + a[3] * kwh) * iva_e if a else 0
    total = en * iva_e + tf_iva + kwh * IEC * 1.23 + cav_mes * 12 * 1.06 + DGEG * 12 * 1.23 + (o.get("cs") or 0) - desc(o.get("r")) - (desc(o.get("d")) if novo else 0)
    return total


def estado(d):
    out = {"ofertas": None, "perfis": []}
    validas = [o for o in d["ofertas"] if o.get("f", "0000")[3] != "1"]
    for pf in PERFIS:
        res = []
        for o in validas:
            t = custo(d, o, pf["pot"], pf["kwh"])
            if t is not None:
                res.append((t, o))
        reg = next((t for t, o in res if o["c"] == "TUR"), None)
        livre = [(t, o) for t, o in res if o["c"] != "TUR"]
        por_com = {}
        for t, o in livre:
            if o["c"] not in por_com or t < por_com[o["c"]][0]:
                por_com[o["c"]] = (t, o)
        best_t, best_o = min(livre, key=lambda x: x[0])
        med = st.median([t for t, _ in por_com.values()])
        abaixo = sum(1 for t, _ in por_com.values() if reg is not None and t < reg)
        out["perfis"].append({
            "id": pf["id"], "label": pf["label"], "potencia": d["pots"][pf["pot"]], "kwh": pf["kwh"],
            "regulado": round(reg, 2) if reg is not None else None,
            "melhor": {"total": round(best_t, 2), "comercializador": NOMES.get(best_o["c"], best_o["c"]), "oferta": best_o.get("n"), "id": best_o.get("id")},
            "mediana": round(med, 2),
            "comercializadores": len(por_com), "ofertas": len(livre),
            "abaixo_regulado": abaixo,
        })
    out["ofertas"] = len(validas)
    out["comercializadores"] = len({o["c"] for o in validas if o["c"] != "TUR"})
    return out


def main():
    args = sys.argv[1:]
    src = args[args.index("--ofertas") + 1] if "--ofertas" in args else os.path.join(RAIZ, "data", "ofertas.json")
    dst = args[args.index("--saida") + 1] if "--saida" in args else os.path.join(RAIZ, "data", "indice.json")
    d = json.load(open(src, encoding="utf-8"))
    data = d.get("atualizado")
    antigo = {}
    if os.path.exists(dst):
        antigo = json.load(open(dst, encoding="utf-8"))
    e = estado(d)
    serie = [x for x in antigo.get("serie", []) if x["data"] != data]
    serie.append({"data": data, **{p["id"]: {"melhor": p["melhor"]["total"], "mediana": p["mediana"], "regulado": p["regulado"]} for p in e["perfis"]}})
    serie.sort(key=lambda x: x["data"])
    edicoes, vistos = [], set()
    for x in serie:
        if x["data"][:7] not in vistos:
            vistos.add(x["data"][:7]); edicoes.append({"mes": x["data"][:7], **x})
    out = {"atualizado": data, "fonte": "ERSE, ofertas comerciais comunicadas pelos comercializadores", **e,
           "metodo": "Tarifa simples, sem tarifa social, sem ofertas indexadas e sem descontos de adesão à parte. Inclui IVA, IEC, contribuição audiovisual e taxa da DGEG.",
           "serie": serie, "edicoes": edicoes}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("indice.json", data, [(p["id"], p["melhor"]["total"], p["mediana"], p["regulado"]) for p in e["perfis"]])


if __name__ == "__main__":
    main()
