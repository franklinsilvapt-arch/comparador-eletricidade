"""Corrige descontos do ficheiro da ERSE que, lidos a letra, dao uma fatura do 1.o ano melhor do que a real.

Os comercializadores comunicam a ERSE o desconto de novo cliente e os reembolsos em EUR/ano, mas as condicoes
(texto da oferta) dizem por vezes outra coisa. As regras abaixo leem esse texto e ajustam os valores:

A. Credito pago em parcelas para la de 12 meses (ex.: EDP "100EUR em parcelas mensais de 5EUR durante 20 meses"):
   no 1.o ano so entram 12 parcelas (60EUR).
B. Ofertas unicas de boas-vindas e de "amigo" registadas como reembolso anual (ex.: Iberdrola "oferta de boas-vindas
   de 40EUR", "desconto amigo de 30EUR"): passam a desconto de novo cliente, que so conta no 1.o ano.
C. Beneficio de "traga um amigo" que e de quem recomenda e nao do novo cliente (ex.: OENEO "5% por cada novo cliente
   recomendado"): sai da fatura.
D. Ofertas "Amigo" que exigem ser recomendado por um cliente atual: ficam marcadas com restricoes de adesao.

Cada oferta ajustada guarda os valores originais em "aj" (para a validacao contra a ERSE) e uma nota para o leitor.
"""
import re

N = r"(\d+(?:[.,]\d+)?)"


def _num(s):
    return float(s.replace(",", "."))


def _texto(o):
    return " ".join(str(o.get(k) or "") for k in ("to", "trb", "tos", "ob", "m", "tr", "ts"))


def ajustar(ofertas):
    """Ajusta as ofertas no lugar. Devolve a lista de (id, nota) para o registo."""
    feitos = []
    for o in ofertas:
        t = _texto(o)
        notas = []
        r = list(o["r"]) if o.get("r") else None
        d = list(o["d"]) if o.get("d") else None
        orig = {"r": o.get("r"), "d": o.get("d")}

        # A. parcelas mensais para la de 12 meses
        if d and d[0] > 0:
            pares = []
            for m in re.finditer(N + r"\s*€[^.]{0,90}?parcelas\s+mensais\s+de\s+" + N + r"\s*€[^.]{0,60}?(\d{1,2})\s*meses", t, re.I):
                total, parcela, meses = _num(m.group(1)), _num(m.group(2)), int(m.group(3))
                if total > 0 and parcela * meses >= total * 0.95:
                    pares.append((total, parcela, meses))
            if pares:
                total, parcela, meses = max(pares, key=lambda x: x[2])
                if meses > 12 and total <= d[0] + 0.01:
                    corte = round(total * (1 - 12 / meses), 2)
                    d[0] = round(d[0] - corte, 2)
                    notas.append(f"O crédito de {total:g}€ é pago em {meses} parcelas de {parcela:g}€ por mês. "
                                 f"No 1.º ano contam só 12 parcelas ({parcela * 12:g}€), por isso a fatura do 1.º ano é mais alta do que no simulador da ERSE.")

        # B. ofertas unicas registadas como reembolso anual
        if r and r[0] > 0:
            unicos = {}
            for m in re.finditer(r"boas-vindas\s+(?:de|no\s+valor\s+de)\s+" + N + r"\s*€", t, re.I):
                unicos["bv" + m.group(1)] = _num(m.group(1))
            for m in re.finditer(r"(?:desconto|benef[íi]cio)\s*\+?\s*amigo\s+(?:no\s+valor\s+)?de\s+" + N + r"\s*€", t, re.I):
                unicos["am" + m.group(1)] = _num(m.group(1))
            for m in re.finditer(r"(?:recomendado|angariado)[^.]{0,160}?num\s+total\s+de\s+" + N + r"\s*€", t, re.I):
                unicos["rc" + m.group(1)] = _num(m.group(1))
            mover = round(min(sum(unicos.values()), r[0]), 2)
            if mover > 0:
                r[0] = round(r[0] - mover, 2)
                d = d or [0.0, 0.0, 0.0, 0.0]
                d[0] = round(d[0] + mover, 2)
                notas.append(f"{mover:g}€ de ofertas únicas (boas-vindas ou campanha amigo) são pagos uma só vez. O simulador conta-os só no 1.º ano, "
                             "como desconto de novo cliente, e não todos os anos.")

        # C. beneficio de quem recomenda, nao do novo cliente
        if r and r[0] == 0 and any(r[1:]) and re.search(r"por\s+cada\s+(?:novo\s+)?cliente\s+recomendado", t, re.I):
            r = None
            notas.append("O desconto do programa \"traga um amigo\" é para quem recomenda outros clientes, não para quem adere, "
                         "por isso não entra na fatura.")

        if notas:
            if r and any(r):
                o["r"] = r
            else:
                o.pop("r", None)
            if d and any(d):
                o["d"] = d
            else:
                o.pop("d", None)
            o["aj"] = {"r": orig["r"], "d": orig["d"], "n": notas}
            feitos.extend((o["id"], n) for n in notas)

        # D. ofertas "Amigo" exigem ser recomendado por um cliente atual
        if re.search(r"\bamigo\b", o.get("n") or "", re.I) and o.get("f") and o["f"][2] != "1":
            o["f"] = o["f"][:2] + "1" + o["f"][3:]
            extra = "Exige ser recomendado por um cliente atual (campanha amigo)."
            o["tr"] = (o.get("tr") + " " + extra) if o.get("tr") else extra
            feitos.append((o["id"], "marcada com restrições de adesão (campanha amigo)"))
    return feitos
