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

## Ofertas lidas dos sites (scripts/fontes_extra.py)

O ficheiro da ERSE às vezes não tem ofertas em vigor: quando uma oferta termina e o comercializador ainda não comunicou a renovação, ou quando a oferta nunca foi comunicada. Para essas, o script lê os preços todos os dias no site do próprio comercializador:

- Ibelectra, Solução Conforto e Solução Segura: tabelas da página de cada oferta (três variantes: DD + FE, DD ou FE, preço base).
- Endesa, Tarifa Digital Luz e Tarifa Aniversário Luz: ficha de preços em PDF. Uma combinação de preços só é aceite se reproduzir o "Preço Total (Eur/100kWh/mês)" da própria ficha. O crédito de campanha (ex.: 50€ em 10 faturas) vem da página da oferta e só conta enquanto a campanha estiver válida.

Se a ERSE voltar a publicar a oferta, fica a versão da ERSE. As ofertas lidas dos sites têm `"src": "site"` no `ofertas.json` e o comparador mostra essa fonte.

O script também compara algumas ofertas da ERSE com o site (hoje: YES Energy #SMARTLIVING). Se o preço não bater, a oferta sai do comparador até a diferença desaparecer.

Qualquer falha de leitura deixa essa oferta de fora e faz o workflow terminar com erro (aviso por email do GitHub). As restantes ofertas são publicadas na mesma.

## Cálculo da fatura

Segue a metodologia do simulador da ERSE, validada ao cêntimo nos consumidores-tipo (tarifa regulada bi-horária, 3,45 kVA e 1.900 kWh por ano: 441,79€; 6,9 kVA e 5.000 kWh: 1.140,32€).

Ao total da ERSE junta-se a taxa de exploração da DGEG (0,07€ por mês mais IVA a 23%, cerca de 1,03€ por ano), que o simulador da ERSE não conta mas vem em todas as faturas. Por isso o nosso total fica 1,03€ por ano acima do da ERSE em todas as ofertas (a ordem do ranking não muda).

Parâmetros a rever no topo do `comparador-eletricidade.js` quando mudarem: termo fixo das tarifas de acesso (`TAR_POT`), imposto especial de consumo (`IEC`), contribuição audiovisual (`CAV`), taxa da DGEG (`DGEG`) e limites de IVA a 6% (`KWH_IVA6`).

## Novo comercializador

1. Juntar o nome em `NOMES` no JS (a chave é o código `COM` da ERSE).
2. Juntar `logos/<código em minúsculas>.png` e o código em `LOGOS`. Sem logótipo aparecem as iniciais.

## Testar o script com um zip local

```
python3 scripts/atualizar_ofertas.py --zip CSV.zip --data 2026-09-29
```
