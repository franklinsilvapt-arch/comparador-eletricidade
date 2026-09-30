# Comparador de eletricidade (Literacia Financeira)

Ferramenta da página `/comparador-eletricidade` do literaciafinanceira.pt.

## Ficheiros

- `comparador-eletricidade.js` e `comparador-eletricidade.css`: a ferramenta. O CSS é um suplemento ao `comparador-depositos.css` (repositório `depositos-comparator`), que tem o design system comum.
- `data/ofertas.json`: todas as ofertas de eletricidade para clientes domésticos (simples, bi-horária e tri-horária, de 1,15 a 41,4 kVA).
- `logos/`: logótipos dos comercializadores, um PNG por código da ERSE em minúsculas.
- `scripts/atualizar_ofertas.py`: gera o `ofertas.json` a partir do ficheiro oficial da ERSE.
- `.github/workflows/atualizar-ofertas.yml`: corre o script todos os dias às 06:17 UTC.

## Fonte dos dados

Ficheiro "Ofertas comerciais (CSV)" do [simulador de preços da ERSE](https://simuladorprecos.erse.pt/). O caminho do zip muda a cada atualização e é lido de `https://simuladorprecos.erse.pt/config/Settings.json`.

## Cálculo da fatura

Segue a metodologia do simulador da ERSE, validada ao cêntimo nos consumidores-tipo (tarifa regulada bi-horária, 3,45 kVA e 1.900 kWh por ano: 441,79€; 6,9 kVA e 5.000 kWh: 1.140,32€).

Parâmetros a rever no topo do `comparador-eletricidade.js` quando mudarem: termo fixo das tarifas de acesso (`TAR_POT`), imposto especial de consumo (`IEC`), contribuição audiovisual (`CAV`) e limites de IVA a 6% (`KWH_IVA6`).

## Novo comercializador

1. Juntar o nome em `NOMES` no JS (a chave é o código `COM` da ERSE).
2. Juntar `logos/<código em minúsculas>.png` e o código em `LOGOS`. Sem logótipo aparecem as iniciais.

## Testar o script com um zip local

```
python3 scripts/atualizar_ofertas.py --zip CSV.zip --data 2026-09-29
```
