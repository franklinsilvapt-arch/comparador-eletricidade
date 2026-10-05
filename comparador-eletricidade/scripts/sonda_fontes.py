"""Sonda temporaria: colunas do ficheiro da ERSE e ofertas indexadas; ficheiros OMIE; Settings da ERSE."""
import io, json, re, zipfile, csv, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (compatible; LF-eletricidade/1.0; +https://www.literaciafinanceira.pt)"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(urllib.parse.quote(u, safe=":/?=&%"), headers=UA), timeout=90) as r:
        return r.read()
import urllib.parse
st = json.loads(get("https://simuladorprecos.erse.pt/config/Settings.json").decode("utf-8-sig"))
print("#### SETTINGS", json.dumps(st, ensure_ascii=False)[:3000])
zf = zipfile.ZipFile(io.BytesIO(get(st["csvPath"])))
print("#### ZIP", zf.namelist())
def ler(nome):
    alvo = [n for n in zf.namelist() if n.replace("\\", "/").split("/")[-1] == nome][0]
    t = zf.read(alvo).decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(t), delimiter=";", quoting=csv.QUOTE_NONE))
cond = ler("CondComerciais.csv"); precos = ler("Precos_ELEGN.csv")
print("#### COND COLS", list(cond[0].keys()))
print("#### PRECOS COLS", list(precos[0].keys()))
idx = [o for o in cond if o.get("FiltroPrecosIndex_ELE") == "S" and o.get("Fornecimento") == "ELE" and o.get("Segmento") in ("Dom", "Tod")]
print("#### N INDEXADAS", len(idx))
for o in idx[:40]:
    print("#### IDX", json.dumps({k: v for k, v in o.items() if v and v.strip() not in ("-", "N/A")}, ensure_ascii=False)[:2500])
for n in zf.namelist():
    if not n.endswith(("CondComerciais.csv", "Precos_ELEGN.csv")):
        t = zf.read(n).decode("utf-8-sig", errors="replace")
        print("#### FILE", n, t[:1500])
# OMIE
for u in ["https://www.omie.es/pt/file-download?parents%5B0%5D=marginalpdbcpt&filename=marginalpdbcpt_20261004.1",
          "https://www.omie.es/sites/default/files/dados/AGNO_2026/MES_10/TXT/INT_PBC_EV_H_1_04_10_2026_04_10_2026.TXT"]:
    try:
        b = get(u); print("#### OMIE", u, len(b)); print(b.decode("latin-1")[:1200])
    except Exception as e:
        print("#### OMIE ERRO", u, e)
