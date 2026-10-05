"""Sonda temporaria: testa o acesso do GitHub Actions aos sites dos comercializadores."""
import io, re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "pt-PT,pt;q=0.9"}
URLS = [
    "https://www.endesa.pt/content/dam/endesa-pt/precos/tarifa-digital.pdf",
    "https://www.endesa.pt/content/dam/endesa-pt/precos/tarifa-quero-mais.pdf",
    "https://ibelectra.com/casa/eletricidade/solucao-conforto/",
    "https://www.luzigas.pt/eletricidade-adesao-online/",
    "https://www.meoenergia.pt/eletricidade",
    "https://www.muon.pt/tarifas",
    "https://jafplus.pt/particulares/tarifarios/",
    "https://www.yesenergy.pt/pt/tarifas-luz/tarifa-fixa",
]
for u in URLS:
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
            b = r.read(); print("==", u, r.status, r.headers.get("Content-Type"), len(b))
            if b[:4] == b"%PDF":
                from pypdf import PdfReader
                t = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(b)).pages[:2])
                print(t[:6000])
            else:
                t = b.decode("utf-8", "replace")
                nums = re.findall(r"0[,.]\d{3,5}", t)
                print("numeros:", len(nums), nums[:40])
                print("excerto:", re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t))[:300])
    except Exception as e:
        print("==", u, "ERRO", repr(e)[:200])
