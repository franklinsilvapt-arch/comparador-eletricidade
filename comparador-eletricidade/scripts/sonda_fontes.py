"""Sonda temporaria: texto das tabelas de precos (pypdf) e excertos HTML."""
import io, re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "pt-PT,pt;q=0.9"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
        return r.read()
from pypdf import PdfReader
for nome in ["tarifa-digital", "tarifa-quero-mais", "tarifa-aniversario", "tarifa-tranquilidade", "tarifa-happy", "tarifa-simples"]:
    u = f"https://www.endesa.pt/content/dam/endesa-pt/precos/{nome}.pdf"
    try:
        pdf = PdfReader(io.BytesIO(get(u)))
        for i, p in enumerate(pdf.pages):
            t = p.extract_text() or ""
            if t.count(",") > 60 and re.search(r"\d,\d{4}", t):
                print(f"#### {nome} pagina {i+1}")
                print(t)
    except Exception as e:
        print("####", nome, "ERRO", repr(e)[:200])
h = get("https://www.meoenergia.pt/eletricidade").decode("utf-8", "replace")
for m in re.finditer(r"0,1[0-9]{4}", h):
    print("#### MEO", re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h[max(0, m.start()-700):m.end()+200])))
