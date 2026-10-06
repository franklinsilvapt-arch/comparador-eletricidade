#!/usr/bin/env python3
"""Fontes complementares ao ficheiro da ERSE, lidas todos os dias dos sites dos comercializadores.

1. Ofertas em falta: algumas ofertas em vigor nao estao no ficheiro da ERSE (a ERSE ainda nao publicou
   a renovacao, ou o comercializador nunca a comunicou). Para essas, os precos sao lidos da pagina ou da
   ficha de precos do proprio comercializador. Uma oferta so entra se a leitura passar nas verificacoes
   (numero de potencias, valores plausiveis, ordem dos descontos ou o preco total que a propria ficha indica).
   Se a ERSE voltar a publicar a oferta, fica a versao da ERSE.
2. Validacao: para ofertas da ERSE cujo preco ja se verificou estar diferente do site, o preco da ERSE e
   comparado com o do site. Se nao bater, a oferta sai do comparador ate a diferenca desaparecer.

Tudo o que falhar fica registado em `erros` e o workflow termina com erro (aviso por email), mas as
restantes ofertas sao publicadas na mesma. Nunca entra uma oferta com precos por confirmar.
"""
import io, re, urllib.request
from datetime import date
from html.parser import HTMLParser

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "pt-PT,pt;q=0.9"}
NPOT = 13  # 1,15 a 41,4 kVA, a mesma ordem do ofertas.json
POTS = [1.15, 2.3, 3.45, 4.6, 5.75, 6.9, 10.35, 13.8, 17.25, 20.7, 27.6, 34.5, 41.4]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def num(s):
    s = (s or "").replace("\xa0", " ").strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def compacta(rows, n):
    """Igual ao compacta() do atualizar_ofertas.py: [termosFixos, p1, ...], cada preco numero unico ou lista."""
    out = [[(r[0] if r else 0) for r in rows]]
    for j in range(1, n):
        vals = [r[j] for r in rows if r]
        out.append(vals[0] if len(set(vals)) == 1 else [(r[j] if r else 0) for r in rows])
    return out


# ---------------------------------------------------------------------------
# Tabelas HTML
# ---------------------------------------------------------------------------
class Tabelas(HTMLParser):
    """Extrai as tabelas de uma pagina: lista de tabelas, cada uma lista de linhas, cada linha lista de textos."""
    def __init__(self):
        super().__init__()
        self.tabs, self.tab, self.lin, self.cel = [], None, None, None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tab = []
        elif tag == "tr" and self.tab is not None:
            self.lin = []
        elif tag in ("td", "th") and self.lin is not None:
            self.cel = ""

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cel is not None:
            self.lin.append(re.sub(r"\s+", " ", self.cel).strip())
            self.cel = None
        elif tag == "tr" and self.lin is not None:
            self.tab.append(self.lin)
            self.lin = None
        elif tag == "table" and self.tab is not None:
            self.tabs.append(self.tab)
            self.tab = None

    def handle_data(self, data):
        if self.cel is not None:
            self.cel += data


def tabelas(html):
    p = Tabelas()
    p.feed(html)
    return p.tabs


# ---------------------------------------------------------------------------
# Ibelectra: Solucao Conforto e Solucao Segura (tabelas na pagina de cada oferta)
# ---------------------------------------------------------------------------
IBELECTRA = [
    ("Conforto", "https://ibelectra.com/casa/eletricidade/solucao-conforto/",
     "https://ibelectra.com/wp-content/uploads/Ficha_Padronizada_Solucao_Conforto.pdf"),
    ("Segura", "https://ibelectra.com/casa/eletricidade/solucao-segura/",
     "https://ibelectra.com/wp-content/uploads/Ficha_Padronizada_Solucao_SEGURA.pdf"),
]
# Variantes pela ordem das colunas das tabelas: desconto DD+FE, desconto DD ou FE, preco base
IBELECTRA_VAR = [
    ("(DD + FE)", "100", "10", "Débito direto e fatura eletrónica"),
    ("(DD ou FE)", "111", "11", "Débito direto ou fatura eletrónica"),
    ("", "011", "01", "Não requer débito direto nem fatura eletrónica"),
]


def linhas_precos(tab):
    """Linhas de dados de uma tabela: (potencia, [valores]) com a potencia na 1.a coluna."""
    out = []
    for lin in tab:
        if not lin:
            continue
        p = num(lin[0])
        if p in POTS:
            out.append((p, [num(x) for x in lin[1:]]))
    return out


def unico(vals, ctx):
    v = sorted({x for x in vals if x})
    if len(v) != 1:
        raise ValueError(f"{ctx}: esperava um so valor, encontrei {v}")
    return v[0]


def ibelectra_ofertas(html, produto, url, ficha):
    tabs = [linhas_precos(t) for t in tabelas(html)]
    tabs = [t for t in tabs if t]
    if len(tabs) < 6:
        raise ValueError(f"Ibelectra {produto}: esperava 6 tabelas de precos, encontrei {len(tabs)}")
    simples, bi, tf_alta = tabs[0], tabs[1], tabs[2]
    tri_var = tabs[3:6]
    if [p for p, _ in simples] != POTS[:10] or [p for p, _ in bi] != POTS[:10] or [p for p, _ in tf_alta] != POTS[10:]:
        raise ValueError(f"Ibelectra {produto}: potencias inesperadas")
    # Termo de potencia: aparece na tabela da simples e na da bi-horaria. Se as duas tabelas discordarem
    # (gralha numa delas), fica o valor coerente com o desconto das outras potencias face ao preco base.
    base = []
    for (_, rs), (_, rb) in zip(simples, bi):
        if rs[2] is None or rb[2] is None or abs(rs[2] - rb[2]) > 0.00005:
            raise ValueError(f"Ibelectra {produto}: preco base do termo de potencia diferente entre tabelas")
        base.append(rs[2])
    tfv = {2: base}
    for v in (0, 1):
        rat = sorted(rs[v] / b for (_, rs), b in zip(simples, base) if rs[v])
        med = rat[len(rat) // 2]
        col = []
        for (_, rs), (_, rb), b in zip(simples, bi, base):
            cand = [x for x in (rs[v], rb[v]) if x is not None]
            if not cand:
                raise ValueError(f"Ibelectra {produto}: termo de potencia em falta")
            x = min(cand, key=lambda x: abs(x / b - med))
            if abs(x / b - med) > 0.002:
                raise ValueError(f"Ibelectra {produto}: termo de potencia incoerente com o desconto ({x} face a {b})")
            col.append(x)
        tfv[v] = col
    ofertas = []
    for v, (suf, pg, ft, modal) in enumerate(IBELECTRA_VAR):
        tf = tf_bi = tfv[v]
        e = unico([r[3 + v] for _, r in simples], f"Ibelectra {produto} energia simples")
        fv = unico([r[3 + v] for _, r in bi], f"Ibelectra {produto} fora de vazio")
        vz = unico([r[6 + v] for _, r in bi], f"Ibelectra {produto} vazio")
        tf_t = [r[v] for _, r in tf_alta]
        pt, ch, vt = (unico([r[k] for _, r in tri_var[v]], f"Ibelectra {produto} tri {k}") for k in range(3))
        valores = tf + tf_t + [e, fv, vz, pt, ch, vt]
        if any(x is None for x in valores) or not all(0.05 < x < 3 for x in tf + tf_t) or not all(0.05 < x < 0.6 for x in (e, fv, vz, pt, ch, vt)):
            raise ValueError(f"Ibelectra {produto}: valores fora do plausivel")
        if not (vz < e < fv and vt < ch < pt):
            raise ValueError(f"Ibelectra {produto}: ordem dos periodos horarios inesperada")
        s = [[tf[i], e] if i < 10 else 0 for i in range(NPOT)]
        b = [[tf_bi[i], fv, vz] if i < 10 else 0 for i in range(NPOT)]
        t = [[tf_t[i - 10], pt, ch, vt] if i >= 10 else 0 for i in range(NPOT)]
        ofertas.append({
            "id": f"SITE_IBELECTRA_{produto.upper()}_{v + 1}", "c": "IBELECTRA",
            "n": f"Solução {produto} {suf}".strip(), "f": "00000100", "pg": pg, "ft": ft, "ct": "111", "at": "1111",
            "u": url, "fp": ficha, "m": modal, "to": "Tarifário fixo sem fidelização.",
            "s": compacta(s, 2), "b": compacta(b, 3), "t": compacta(t, 4),
        })
    # Os descontos tem de baixar o preco: DD+FE < DD ou FE < base, em todas as potencias
    for a, b2 in ((0, 1), (1, 2)):
        A, B = ofertas[a]["s"], ofertas[b2]["s"]
        if not all(x < y for x, y in zip(A[0][:10], B[0][:10])) or not A[1] < B[1]:
            raise ValueError(f"Ibelectra {produto}: a ordem das colunas de desconto nao e a esperada")
    return ofertas


# ---------------------------------------------------------------------------
# Endesa: ficha de precos em PDF de cada tarifa
# ---------------------------------------------------------------------------
ENDESA = [
    # (chave, ficheiro PDF, pagina da oferta, nome, renovavel, pagamento, fatura, contratacao, modalidade)
    ("digital", "tarifa-digital", "https://www.endesa.pt/particulares/planos/luz/digital-luz", "Tarifa Digital Luz",
     "1", "100", "10", "100", "Contratação online, débito direto e fatura digital (desconto de 20% para sempre)", ""),
    ("aniversario", "tarifa-aniversario", "https://www.endesa.pt/particulares/planos/luz/aniversario-luz", "Tarifa Aniversário Luz",
     "0", "111", "11", "111", "", ""),
    ("queromais", "tarifa-quero-mais", "https://www.endesa.pt/particulares/planos/luz/quero-mais-luz", "Tarifa Quero+ Luz",
     "0", "111", "11", "111", "", "Com débito direto, fatura digital, gás ou serviços de assistência o desconto sobe até 20%."),
]
PDF_BASE = "https://www.endesa.pt/content/dam/endesa-pt/precos/"
MESES = {m: i + 1 for i, m in enumerate(["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                                         "agosto", "setembro", "outubro", "novembro", "dezembro"])}


def endesa_texto(pdf_bytes):
    from pypdf import PdfReader
    pags = [p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages]
    for t in pags:
        if re.search(r"abela\s*de\s*pre", t):
            return t
    raise ValueError("Endesa: nao encontrei a tabela de precos no PDF")


def endesa_precos(texto, desconto_min=True):
    """Le a tabela de precos da luz. Os numeros vem em blocos (um por potencia). Uma combinacao de termo de
    potencia e energia so e aceite se reproduzir um 'Preco Total (Eur/100kWh/mes)' da propria ficha, calculado
    com 30 dias e 100 kWh (na bi-horaria, 50 kWh em cada periodo). Alem das colunas publicadas, experimenta
    descontos de 1% a 30% sobre os precos base, porque algumas fichas so mostram o total de cada cenario.
    Quando ha varios cenarios (ex.: so luz, luz e gas, com servicos), fica o de menor desconto, que e o preco
    sem condicoes extra. Devolve (n potencias, (simples, bi), desconto)."""
    corpo = texto[re.search(r"abela\s*de\s*pre", texto).end():]
    vals = [num(t) for t in re.findall(r"(?<![\d,])\d+,\d+(?![\d,])", corpo)]
    melhor = None
    for n in (10, 6, 4):
        jan = [vals[i:i + n] for i in range(len(vals) - n + 1)]
        cresc = [w for w in jan if all(a < b for a, b in zip(w, w[1:]))]
        totais = [w for w in cresc if all(x > 5 for x in w)]
        tfs = [w for w in cresc if all(0.03 < x < 4 for x in w)]
        ens = sorted({w[0] for w in jan if len(set(w)) == 1 and 0.05 < w[0] < 0.6})
        if not totais or not tfs or not ens:
            continue
        # Ficam so as colunas "base": uma coluna que e um desconto de 1% a 30% de outra coluna e descartada,
        # para que o desconto encontrado seja sempre medido em relacao ao preco base da ficha
        def derivada(c, outras, tol):
            return any(o is not c and any(all(abs(oi * (1 - d / 100) - ci) <= tol for oi, ci in zip(o, c)) for d in range(1, 31)) for o in outras)
        tfs = [tf for tf in tfs if not derivada(tf, tfs, 0.00051)]
        ens = [e for e in ens if not derivada((e,), [(x,) for x in ens], 0.0000051)]
        cand_tf = {(d, tuple(round(x * (1 - d / 100), 4) for x in tf)) for tf in tfs for d in range(0, 31)}
        cand_e = {(d, round(e * (1 - d / 100), 6)) for e in ens for d in range(0, 31)}
        ok = lambda T, f: all(abs(f(i) - T[i]) <= 0.011 for i in range(n))
        for T in totais:
            achados = []
            for d, tf in cand_tf:
                for d2, e in cand_e:
                    if d == d2 and ok(T, lambda i: tf[i] * 30 + 100 * e):
                        achados.append((d, tf, e))
            if not achados:
                continue
            d, tf, e = min(achados)
            bi = None
            for d3, tfb in cand_tf:
                if d3 != d:
                    continue
                for T2 in totais:
                    if T2 is T:
                        continue
                    for d4, e1 in cand_e:
                        for d5, e2 in cand_e:
                            if d4 == d5 == d and e1 > e2 and ok(T2, lambda i: tfb[i] * 30 + 50 * e1 + 50 * e2):
                                bi = bi or (list(tfb), e1, e2)
            sol = (n, ((list(tf), e), bi), d)
            if melhor is None or (n, -d) > (melhor[0], -melhor[2]):
                melhor = sol
        if melhor:
            break
    if not melhor:
        raise ValueError("Endesa: nenhuma combinacao de precos reproduz o preco total da ficha")
    return melhor


def endesa_campanha(html):
    """Credito de novo cliente anunciado na pagina da oferta (ex.: '50€ de desconto na fatura' em '10 créditos de 5€'),
    e a data-limite da campanha. Devolve (euros, 'dd/mm/aaaa') ou None."""
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    m = re.search(r"(\d+)\s*€\s*de desconto na fatura", t)
    c = re.search(r"(\d+)\s*créditos de\s*(\d+)\s*€", t)
    f = re.search(r"[Aa]té\s*(?:dia\s*)?(\d{1,2})\s*de\s*([a-zç]+)", t)
    if not (m and c and f) or int(c.group(1)) * int(c.group(2)) != int(m.group(1)) or f.group(2) not in MESES:
        return None
    hoje = date.today()
    fim = date(hoje.year, MESES[f.group(2)], int(f.group(1)))
    if fim < hoje:
        return None
    return int(m.group(1)), fim.strftime("%d/%m/%Y")


def endesa_ofertas(chave, ficheiro, url, nome, renov, pg, ft, ct, modal, nota_desc, pdf_bytes, html):
    n, (simples, bi), desc = endesa_precos(endesa_texto(pdf_bytes))
    tf, e = simples
    s = [[tf[i], e] if i < n else 0 for i in range(NPOT)]
    x = {"id": f"SITE_END_{chave.upper()}", "c": "END", "n": nome, "f": f"0{renov}000100", "pg": pg, "ft": ft,
         "ct": ct, "at": "1111", "u": url, "fp": PDF_BASE + ficheiro + ".pdf", "to": "Tarifário fixo sem fidelização.",
         "s": compacta(s, 2)}
    if modal:
        x["m"] = modal
    if desc and nota_desc:
        x["to"] = f"Tarifário fixo sem fidelização. Preço com {desc}% de desconto sobre o preço base, sem outras condições. " + nota_desc
    if bi:
        tfb, fv, vz = bi
        x["b"] = compacta([[tfb[i], fv, vz] if i < n else 0 for i in range(NPOT)], 3)
    camp = endesa_campanha(html) if html else None
    if camp:
        euros, fim = camp
        # O regulamento da Endesa diz que o credito "e aplicado sobre o total da fatura, antes da aplicacao do IVA".
        # Na fatura final vale por isso euros x 1,23 (IVA da energia). O comparador trata d[0] como valor final.
        com_iva = round(euros * 1.23, 2)
        x["d"] = [com_iva, 0.0, 0.0, 0.0]
        x["f"] = x["f"][:7] + "1"
        txt_iva = f"{com_iva:.2f}".replace(".", ",")
        x["ob"] = (f"Campanha para novos clientes: {euros}€ de desconto nas primeiras 10 faturas, para adesões até {fim}. "
                   f"O desconto é aplicado antes do IVA, por isso vale {txt_iva}€ na fatura final.")
    return [x]


# ---------------------------------------------------------------------------
# Tarifas de acesso as redes em BTN 2026 (ERSE, Diretiva n.o 10/2025), EUR/kWh, sem IVA.
# Usadas nas ofertas indexadas por formula, em que o comercializador soma a TAR ao preco de mercado.
# Fonte: https://www.erse.pt/media/lamnmp31/diretiva-erse-10-2025-tep-se-2026.pdf (tabela "Tarifa de acesso as redes em BTN").
# ---------------------------------------------------------------------------
TAR_KWH = {"s": [0.0607], "b": [0.0835, 0.0158], "t": [0.2452, 0.0412, 0.0158], "t_alta": [0.2457, 0.0524, 0.0150]}
PERDAS_ERSE = 0.16  # coeficiente medio de perdas em BTN usado nas formulas (a MUON fixa 16,39% na ficha)


def preco_formula(omie_ref, k_kwh, cgs_kwh, perdas, extra_kwh, tar):
    """Preco de energia (EUR/kWh) de uma formula (OMIE + CGS + K) x (1 + perdas) [+ extras] + TAR, ao OMIE de referencia
    da ERSE (EUR/MWh). O comparador ajusta depois ao OMIE real, como faz com as indexadas da ERSE."""
    return [round((omie_ref / 1000 + cgs_kwh) * (1 + perdas) + k_kwh + extra_kwh + t, 5) for t in tar]


# ---------------------------------------------------------------------------
# MUON: a pagina de tarifas e uma aplicacao Angular; os precos vem da API JSON do site (POST /api/contrato/get).
# Formula da ficha de informacao normalizada: PE = (OMIE + CGS) x (1 + perdas) + K + FTS + TAR, com perdas 16,39%
# e FTS (financiamento da tarifa social) 0,002067 EUR/kWh. K e CGS vem da API, em EUR/MWh.
# ---------------------------------------------------------------------------
MUON_API = "https://muon.pt/api/contrato/get"
MUON_URL = "https://muon.pt/tarifas/domestico/0?social=0"
MUON_FIN = "https://muon.pt/pdfs/2026/2025_02_04_FIN_indexado_casa.pdf"
MUON_PERDAS, MUON_FTS = 0.1639, 0.002067


def muon_api():
    import json
    corpo = json.dumps({"tipoAdesao": "DOMESTICO", "tipo_pe": 0, "social": 0, "bancos": False, "tarifas": True,
                        "zonas": False, "ciclos": False, "opcoes_imi": False, "cur": False, "consentimentos": False}).encode()
    req = urllib.request.Request(MUON_API, data=corpo, headers={**UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def muon_ofertas(dados, omie_ref):
    if dados.get("status") != "ok" or not dados.get("tarifas"):
        raise ValueError("MUON: resposta da API sem tarifas")
    ofertas = []
    for t in dados["tarifas"]:
        if not t.get("ativa") or t.get("tipoAdesao") != "DOMESTICO" or t.get("social"):
            continue
        nome = re.sub(r"\s+", " ", t["nomeTarifa"]).strip()
        if not t.get("indexada"):
            raise ValueError(f"MUON {nome}: tarifa de preco fixo sem precos de energia na API (formato novo?)")
        var = {v["codigo"]: num(v["valor"]) for v in t.get("variaveisIndexadas") or []}
        k, cgs = var.get("K"), var.get("CGS", 0.0)
        if k is None or not (0 < k < 100) or not (0 <= cgs < 20):
            raise ValueError(f"MUON {nome}: K ou CGS fora do plausivel ({var})")
        hor = t.get("horarios") or {}
        pots = (hor.get("SIMPLES") or {}).get("potencias") or {}
        tf = []
        for p in POTS:
            x = pots.get(str(p)) or {}
            v = num(((x.get("precosPotencia") or {}).get("POTENCIA") or {}).get("valor"))
            tf.append(v)
        if any(v is None or not (0.05 < v < 4) for v in tf):
            raise ValueError(f"MUON {nome}: termos de potencia em falta ou fora do plausivel: {tf}")
        if not all(a < b for a, b in zip(tf, tf[1:])):
            raise ValueError(f"MUON {nome}: termos de potencia nao crescem com a potencia")
        if not t.get("incluiRedes"):
            raise ValueError(f"MUON {nome}: termo de potencia sem redes incluidas (formato novo?)")
        es = preco_formula(omie_ref, k / 1000, cgs / 1000, MUON_PERDAS, MUON_FTS, TAR_KWH["s"])
        eb = preco_formula(omie_ref, k / 1000, cgs / 1000, MUON_PERDAS, MUON_FTS, TAR_KWH["b"])
        et = preco_formula(omie_ref, k / 1000, cgs / 1000, MUON_PERDAS, MUON_FTS, TAR_KWH["t"])
        et_alta = preco_formula(omie_ref, k / 1000, cgs / 1000, MUON_PERDAS, MUON_FTS, TAR_KWH["t_alta"])
        pag = [p["id"] for p in t.get("tiposPagamento") or []]
        pg = "100" if "DDC" in pag or "DD" in pag else "010"
        pag_txt = "débito direto" if pg == "100" else "pagamento por multibanco"
        chave = re.sub(r"[^A-Z0-9]+", "_", nome.upper()).strip("_")
        ofertas.append({
            "id": f"SITE_MUON_{chave}", "c": "MUON", "n": nome, "f": "01010000", "pg": pg, "ft": "10", "ct": "100", "at": "0011",
            "u": MUON_URL, "fp": MUON_FIN, "m": f"Fatura eletrónica e {pag_txt}",
            "to": f"Preço indexado ao mercado: energia = (OMIE + CGS) × (1 + perdas de {MUON_PERDAS * 100:.2f}%) + {k:g} €/MWh de margem "
                  f"+ financiamento da tarifa social + tarifa de acesso às redes. Contrato de 12 meses com renovação automática, sem fidelização.",
            "tap": "O preço da energia muda todos os meses com o preço médio do mercado OMIE.",
            "s": compacta([[tf[i], es[0]] for i in range(NPOT)], 2),
            "b": compacta([[tf[i], eb[0], eb[1]] for i in range(NPOT)], 3),
            "t": compacta([[tf[i]] + (et if i < 10 else et_alta) for i in range(NPOT)], 4),
            "ix": {"k": k, "cgs": cgs, "perdas": MUON_PERDAS, "extra": MUON_FTS, "fonte": "api"},
        })
    if not ofertas:
        raise ValueError("MUON: nenhuma tarifa domestica ativa na API")
    return ofertas


# ---------------------------------------------------------------------------
# Luzigas (Lusiadaenergia): tres planos "Dinamico" (Poupanca +, Poupanca e Base), cada um com termo de potencia proprio
# e energia "Indexado ou Fixo". Os precos fixos vem da tabela da pagina. A indexada segue
# PE = (OMIE + K + CGS) x (1 + perdas) + TAR (ficha de informacao normalizada), com K = 10 EUR/MWh e CGS lido da pagina;
# so entra quando a pagina indica o K.
# ---------------------------------------------------------------------------
LUZIGAS = [
    ("poupancamais", "Dinâmico Poupança +", "https://www.luzigas.pt/plano-luz-tarifario-dinamico-poupanca-mais/"),
    ("poupanca", "Dinâmico Poupança", "https://www.luzigas.pt/plano-luz-tarifario-dinamico-poupanca/"),
    ("base", "Dinâmico Base", "https://www.luzigas.pt/plano-luz-tarifario-dinamico-base/"),
]
LUZIGAS_FIN = "https://www.luzigas.pt/wp-content/uploads/2026/06/Ficha-FIN-Poupanc%CC%A7a-.pdf"


def luzigas_tabela(tab, n_energia):
    """(termos de potencia por kVA, precos fixos de energia) de uma tabela 'Potencia | ... | Indexado ou Fixo x'."""
    tf, fixos = {}, []
    for lin in tab:
        if not lin or num(lin[0]) not in POTS:
            continue
        tf[num(lin[0])] = num(lin[1])
        for cel in lin[2:]:
            m = re.search(r"Fixo\s*([\d,]+)", cel)
            if m:
                fixos.append(num(m.group(1)))
    if len(fixos) != n_energia or any(x is None or not (0.03 < x < 0.6) for x in fixos):
        raise ValueError(f"Luzigás: precos fixos de energia inesperados: {fixos}")
    if any(v is None or not (0.05 < v < 4) for v in tf.values()):
        raise ValueError(f"Luzigás: termos de potencia fora do plausivel: {tf}")
    return tf, fixos


def luzigas_ofertas(html, chave, nome, url, omie_ref):
    tabs = [t for t in tabelas(html) if any(lin and num(lin[0]) in POTS for lin in t)]
    if len(tabs) < 3:
        raise ValueError(f"Luzigás {nome}: esperava 3 tabelas de precos (simples, bi, tri), encontrei {len(tabs)}")
    tf_s, (e,) = luzigas_tabela(tabs[0], 1)
    tf_b, (fv, vz) = luzigas_tabela(tabs[1], 2)
    tf_t, (pt, ch, vt) = luzigas_tabela(tabs[2], 3)
    if sorted(tf_s) != POTS[:10] or sorted(tf_b) != POTS[2:10] or sorted(tf_t) != POTS[10:]:
        raise ValueError(f"Luzigás {nome}: potencias inesperadas nas tabelas")
    if any(abs(tf_s[p] - tf_b[p]) > 0.00005 for p in tf_b):
        raise ValueError(f"Luzigás {nome}: termo de potencia diferente entre simples e bi-horaria")
    if not (vz < e < fv and vt < ch < pt):
        raise ValueError(f"Luzigás {nome}: ordem dos periodos horarios inesperada")
    tf = {**tf_s, **tf_t}
    texto = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    m_cgs = re.search(r"CGS\s*\(h\)[^0-9]*([\d,]+)\s*€/kWh", texto)
    m_k = re.search(r"K\s*=\s*([\d,]+)\s*€/kWh", texto)
    base = {"c": "LUZIGAS", "pg": "100", "ft": "10", "ct": "100", "at": "0011", "u": url, "fp": LUZIGAS_FIN,
            "m": "Fatura eletrónica e débito direto",
            "tfi": "Contrato com período inicial de 12 meses, com renovação automática (ficha de informação normalizada)."}
    ofertas = [{
        **base, "id": f"SITE_LUZIGAS_{chave.upper()}_FIXO", "n": f"{nome} (preço fixo)", "f": "10000000",
        "to": "Preço fixo. A página do tarifário permite escolher entre preço fixo e preço indexado ao mercado.",
        "s": compacta([[tf[p], e] if i < 10 else 0 for i, p in enumerate(POTS)], 2),
        "b": compacta([[tf[p], fv, vz] if 2 <= i < 10 else 0 for i, p in enumerate(POTS)], 3),
        "t": compacta([[tf[p], pt, ch, vt] if i >= 10 else 0 for i, p in enumerate(POTS)], 4),
    }]
    if m_cgs and m_k:
        cgs, k = num(m_cgs.group(1)), num(m_k.group(1))
        if not (0 <= cgs < 0.05 and 0 < k < 0.1):
            raise ValueError(f"Luzigás {nome}: K ou CGS fora do plausivel ({k}, {cgs})")
        es = preco_formula(omie_ref, k, cgs, PERDAS_ERSE, 0, TAR_KWH["s"])
        eb = preco_formula(omie_ref, k, cgs, PERDAS_ERSE, 0, TAR_KWH["b"])
        et = preco_formula(omie_ref, k, cgs, PERDAS_ERSE, 0, TAR_KWH["t_alta"])
        ofertas.append({
            **base, "id": f"SITE_LUZIGAS_{chave.upper()}_INDEX", "n": f"{nome} (preço indexado)", "f": "10010000",
            "to": f"Preço indexado ao mercado: energia = (OMIE + {k * 1000:g} €/MWh de margem + {cgs * 1000:g} €/MWh de custos do gestor do sistema) "
                  f"× (1 + perdas) + tarifa de acesso às redes. A página do tarifário permite escolher entre preço fixo e preço indexado.",
            "tap": "O preço da energia tem como referência o preço médio do OMIE no mês de faturação.",
            "s": compacta([[tf[p], es[0]] if i < 10 else 0 for i, p in enumerate(POTS)], 2),
            "b": compacta([[tf[p], eb[0], eb[1]] if 2 <= i < 10 else 0 for i, p in enumerate(POTS)], 3),
            "t": compacta([[tf[p]] + et if i >= 10 else 0 for i, p in enumerate(POTS)], 4),
            "ix": {"k": k * 1000, "cgs": cgs * 1000, "perdas": PERDAS_ERSE, "extra": 0, "fonte": "pagina"},
        })
    return ofertas


# ---------------------------------------------------------------------------
# Validacao de ofertas da ERSE contra o site do comercializador
# ---------------------------------------------------------------------------
def yes_site(html):
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
    e = re.search(r"Consumo de energia\s*([\d.,]+)\s*€/kWh", t)
    p = re.search(r"Potência \(3,45 kVA\)\s*(?:Preço fixo\s*)?([\d.,]+)\s*€/dia", t)
    if not (e and p):
        raise ValueError("YES Energy: nao encontrei os precos na pagina")
    return num(p.group(1)), num(e.group(1))


VALIDAR = [
    # (comercializador, texto no nome da oferta, pagina, leitor -> (termo de potencia a 3,45 kVA, energia simples))
    ("YESENERGY", "SMARTLIVING", "https://www.yesenergy.pt/pt/tarifas-luz/tarifa-fixa", yes_site),
]


def preco_345(o):
    s = o.get("s")
    if not s:
        return None
    tf = s[0][2] if isinstance(s[0], list) else s[0]
    e = s[1][2] if isinstance(s[1], list) else s[1]
    return tf, e


# ---------------------------------------------------------------------------
def aplicar(ofertas, pedir=get, log=print, omie_ref=None, pedir_json=None):
    """Junta as ofertas em falta e retira as que nao batem com o site. Devolve (ofertas, erros)."""
    erros, extra = [], []
    nomes_erse = {(o["c"], o["n"].lower()) for o in ofertas}

    def ja_na_erse(c, chave):
        return any(cc == c and chave.lower() in n for cc, n in nomes_erse)

    for produto, url, ficha in IBELECTRA:
        if ja_na_erse("IBELECTRA", produto):
            continue
        try:
            novas = ibelectra_ofertas(pedir(url).decode("utf-8", "replace"), produto, url, ficha)
            extra += novas
            log(f"site: Ibelectra Solução {produto} ({len(novas)} ofertas)")
        except Exception as e:
            erros.append(f"Ibelectra {produto}: {e}")

    for chave, ficheiro, url, nome, *resto in ENDESA:
        if ja_na_erse("END", nome.split()[1]):
            continue
        try:
            pdf = pedir(PDF_BASE + ficheiro + ".pdf")
            try:
                html = pedir(url).decode("utf-8", "replace")
            except Exception as e:
                html = None
                log(f"site: Endesa {nome}: pagina sem campanha lida ({e})")
            novas = endesa_ofertas(chave, ficheiro, url, nome, *resto, pdf, html)
            extra += novas
            log(f"site: Endesa {nome}")
        except Exception as e:
            erros.append(f"Endesa {nome}: {e}")

    if omie_ref:
        if not any(o["c"] == "MUON" for o in ofertas):
            try:
                novas = muon_ofertas((pedir_json or muon_api)(), omie_ref)
                extra += novas
                log(f"site: MUON ({len(novas)} ofertas indexadas, pela API do site)")
            except Exception as e:
                erros.append(f"MUON: {e}")
        for chave, nome, url in LUZIGAS:
            if ja_na_erse("LUZIGAS", nome):
                continue
            try:
                novas = luzigas_ofertas(pedir(url).decode("utf-8", "replace"), chave, nome, url, omie_ref)
                extra += novas
                log(f"site: Luzigás {nome} ({len(novas)} ofertas)")
            except Exception as e:
                erros.append(f"Luzigás {nome}: {e}")
    else:
        log("site: sem OMIE de referencia, MUON e Luzigás ficam de fora")

    hoje = date.today().strftime("%d/%m/%Y")
    for x in extra:
        x["src"] = "site"
        x["ini"] = hoje

    retirar = set()
    for c, chave, url, leitor in VALIDAR:
        alvo = [o for o in ofertas if o["c"] == c and chave.lower() in o["n"].lower()]
        if not alvo:
            continue
        try:
            tf_site, e_site = leitor(pedir(url).decode("utf-8", "replace"))
            for o in alvo:
                p = preco_345(o)
                if not p or abs(p[0] - tf_site) > 0.0006 or abs(p[1] - e_site) > 0.0006:
                    retirar.add(o["id"])
                    log(f"validacao: {o['id']} {o['n']} retirada (ERSE {p}, site {tf_site} / {e_site})")
        except Exception as e:
            erros.append(f"validacao {c}: {e}")
            retirar.update(o["id"] for o in alvo)  # sem confirmacao, a oferta nao aparece
    ofertas = [o for o in ofertas if o["id"] not in retirar] + extra
    return ofertas, erros
