#!/usr/bin/env python3
"""Compara a fatura anual que o comparador calcula para cada oferta com o total do simulador da ERSE.

Serve para apanhar erros de metodologia (IVA nos descontos, reembolsos, servicos, etc.) em todas as ofertas,
nao so no mercado regulado. Para cada caso (potencia, kWh por ano, com ou sem descontos de novo cliente)
pede ao simulador da ERSE a tarifa simples e compara com a nossa formula (a mesma do comparador-eletricidade.js),
sem a taxa da DGEG, que a ERSE nao conta.

Uso: python3 scripts/validar_erse.py [--tol 0.05]
Imprime as ofertas com diferenca acima da tolerancia e termina com erro se houver alguma.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atualizar_ofertas as A  # noqa: E402

RAIZ = A.RAIZ
POTS = [float(p.replace(",", ".")) for p in A.POTS]


def preco(o, k, i, j):
    """Preco j (0 = termo fixo, 1.. = energia) da opcao k para a potencia i, no formato compacto."""
    v = o[k][j]
    return v[i] if isinstance(v, list) else v


def nossa(P, o, i, kwh, novo):
    """Porta de calcOpcao() do comparador-eletricidade.js para a tarifa simples, sem DGEG."""
    if "s" not in o or not preco(o, "s", i, 0):
        return None
    pot = POTS[i]
    tf_dia, e = preco(o, "s", i, 0), preco(o, "s", i, 1)
    tar_dia = P["TAR_POT"][i] if i < len(P["TAR_POT"]) else 0
    cav = 0 if kwh < P["CAV_MIN_KWH"] else P["CAV"]
    lim = P["KWH_IVA6"] * 365 / 30
    sh6 = min(1, lim / kwh) if pot <= 6.9 and kwh > 0 else 0
    iva_e = sh6 * 1.06 + (1 - sh6) * 1.23
    en = e * kwh
    tf, tar = tf_dia * 365, tar_dia * 365
    tf_iva = tar * 1.06 + (tf - tar) * 1.23 if pot <= 3.45 else tf * 1.23

    def desc(a):
        return a[0] + a[1] * tf * 1.23 + (a[2] * en + a[3] * kwh) * iva_e if a else 0

    reemb = desc(o.get("r"))
    d_novo = desc(o.get("d")) if novo else 0
    serv = o.get("cs") or 0
    total = en * iva_e + tf_iva + kwh * P["IEC"] * 1.23 + cav * 12 * 1.06 + serv - reemb - d_novo
    return {"total": total, "reemb": reemb, "dNovo": d_novo, "serv": serv, "en": en, "tf": tf}


def main():
    tol = float(sys.argv[sys.argv.index("--tol") + 1]) if "--tol" in sys.argv else 0.05
    with open(A.OUT, encoding="utf-8") as f:
        dados = json.load(f)
    P = dados["params"]
    ofertas = {o["id"]: o for o in dados["ofertas"] if o["f"][3] == "0" and "s" in o}
    casos = [(2, 1900), (5, 5000), (3, 3000), (0, 1000)]
    problemas, vistos, com_novo = [], 0, 0
    for i, kwh in casos:
        j = A.simular(i, kwh)
        res = j.get("Resultados") or []
        if not res:
            sys.exit("simulador sem resultados")
        if vistos == 0:
            print("campos do resultado:", sorted(res[0].keys()))
            print("campos da oferta:", sorted(res[0]["Oferta"][0].keys()))
        for r in res:
            of = r["Oferta"][0]
            cod = of.get("CodOferta")
            if str(of.get("TipoContagem")) != "1" or cod not in ofertas:
                continue
            o = ofertas[cod]
            erse = float(r["PrecoTotal"])
            n0, n1 = nossa(P, o, i, kwh, False), nossa(P, o, i, kwh, True)
            if not n0:
                continue
            vistos += 1
            d0, d1 = n0["total"] - erse, n1["total"] - erse
            if o.get("d") and abs(d1) < abs(d0):
                com_novo += 1
            dif = d0 if abs(d0) <= abs(d1) else d1
            if abs(dif) > tol:
                problemas.append((i, kwh, cod, o["c"], o["n"][:40], round(erse, 2), round(n0["total"], 2), round(n1["total"], 2),
                                  {k: round(v, 2) for k, v in n1.items() if k in ("reemb", "dNovo", "serv", "en", "tf")},
                                  {k: o.get(k) for k in ("r", "d", "cs") if o.get(k)},
                                  {k: r.get(k) for k in r if k != "Oferta"}))
    print(f"ofertas com desconto de novo cliente em que a ERSE conta o desconto: {com_novo}")
    print(f"{vistos} comparacoes, {len(problemas)} fora da tolerancia de {tol}€")
    for p in problemas:
        print(json.dumps(p, ensure_ascii=False))
    if problemas:
        sys.exit(1)


if __name__ == "__main__":
    main()
