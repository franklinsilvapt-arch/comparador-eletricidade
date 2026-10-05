# Comparador de eletricidade (Literacia Financeira)

Ferramenta da página `/comparador-eletricidade` do literaciafinanceira.pt.

## Ficheiros

- `comparador-eletricidade.js` e `comparador-eletricidade.css`: a ferramenta. O CSS é um suplemento ao `comparador-depositos.css` (repositório `depositos-comparator`), que tem o design system comum.
- `data/ofertas.json`: todas as ofertas de eletricidade para clientes domésticos (simples, bi-horária e tri-horária, de 1,15 a 41,4 kVA).
- `data/omie.json` e `data/omie_qh.json`: preços OMIE (ver abaixo).
- `logos/`: logótipos dos comercializadores, um PNG por código da ERSE em minúsculas.
- `scripts/atualizar_ofertas.py`: gera o `ofertas.json` a partir do ficheiro oficial da ERSE.
- `.github/workflows/atualizar-ofertas.yml`: corre o script todos os dias às 06:17 UTC.

## Fonte dos dados

Ficheiro "Ofertas comerciais (CSV)" do [simulador de preços da ERSE](https://simuladorprecos.erse.pt/). O caminho do zip muda a cada atualização e é lido de `https://simuladorprecos.erse.pt/config/Settings.json`.

## Ofertas lidas dos sites (scripts/fontes_extra.py)

O ficheiro da ERSE às vezes não tem ofertas em vigor: quando uma oferta termina e o comercializador ainda não comunicou a renovação, ou quando a oferta nunca foi comunicada. Para essas, o script lê os preços todos os dias no site do próprio comercializador:

- Ibelectra, Solução Conforto e Solução Segura: tabelas da página de cada oferta (três variantes: DD + FE, DD ou FE, preço base).
- Endesa, Tarifa Digital Luz, Tarifa Aniversário Luz e Tarifa Quero+ Luz: ficha de preços em PDF. Uma combinação de preços só é aceite se reproduzir o "Preço Total (Eur/100kWh/mês)" da própria ficha. Quando a ficha tem vários cenários (só luz, luz e gás, com serviços), fica o de menor desconto sobre o preço base, que é o preço sem condições extra; na Quero+ é hoje 14%. O crédito de campanha (ex.: 50€ em 10 faturas) vem da página da oferta e só conta enquanto a campanha estiver válida.
- Fora do comparador por não terem preço fixo publicado: Endesa Tranquilidade e Happy (os totais da ficha não se reproduzem a partir dos preços da tabela), MUON (só tem tarifas indexadas definidas por fórmula, sem preço de energia por kWh) e Luzigás Super Lig Fixo (sem preço público).

Se a ERSE voltar a publicar a oferta, fica a versão da ERSE. As ofertas lidas dos sites têm `"src": "site"` no `ofertas.json` e o comparador mostra essa fonte.

O script também compara algumas ofertas da ERSE com o site (hoje: YES Energy #SMARTLIVING). Se o preço não bater, a oferta sai do comparador até a diferença desaparecer.

Qualquer falha de leitura deixa essa oferta de fora e faz o workflow terminar com erro (aviso por email do GitHub). As restantes ofertas são publicadas na mesma.

## Tarifas indexadas e preços OMIE (scripts/omie.py)

A ERSE calcula os preços das ofertas indexadas com um preço OMIE de referência (a média dos futuros para os próximos 3 meses, indicada no texto da ERSE e guardada em `omie_ref` no `ofertas.json`, em EUR/MWh). O comparador ajusta esses preços ao OMIE real: `preço = preço ERSE + PERDAS × (OMIE do período − referência)`, com `PERDAS = 1,16` (coeficiente médio de perdas em BTN usado nas fórmulas dos comercializadores).

O `omie.py` lê todos os dias os ficheiros oficiais do OMIE (`marginalpdbcpt_AAAAMMDD.1`, preço de 15 em 15 minutos para Portugal) e escreve `data/omie.json` com a média dos últimos 30 dias e as médias por período horário (fora de vazio e vazio, ponta, cheias e vazio) nos ciclos diário e semanal, segundo os períodos horários da ERSE em hora legal. Os preços brutos ficam em cache em `data/omie_qh.json`. Sem `omie.json`, o comparador mostra a estimativa da ERSE.

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

## Leitura de faturas em PDF (fatura.js)

O botão "Carregar fatura em PDF" lê a fatura no browser com o pdf.js (cdnjs) e preenche o formulário. Nada sai do computador da pessoa. O `fatura.js` só é descarregado quando alguém escolhe um ficheiro.

O que se lê, por ordem de prioridade:
- Comercializador: nome, NIPC ou domínio com mais ocorrências no texto.
- Potência: valor "x,xx kVA" mais frequente.
- Tarifa: "tri-horária", "bi-horária", "simples" ou "sem ciclo"; ciclo diário ou semanal quando a fatura o diz.
- Dias: "Período de faturação: ... a ...", senão as datas ou os "N dias" da linha do termo de potência.
- kWh: soma das linhas do Imposto Especial de Consumo (incide sobre todos os kWh), ignorando acertos ("abate") e linhas com datas fora do período. Se não houver, soma das linhas de energia.
- Repartição vazio/ponta/cheias: a Endesa imprime "Cheia: x kWh | Ponta: y kWh | Vazio: z kWh" e a EDP descreve as leituras por período. Com isto, uma fatura simples passa a comparar simples com bi-horária com a repartição real.
- Preços sem IVA (energia por kWh e potência por dia), para tentar reconhecer o tarifário atual entre as ofertas do mesmo comercializador. Só é escolhido se houver uma única oferta com esses preços. Quando não há correspondência (tarifário antigo ou não comunicado), os preços da própria fatura dão origem a uma oferta virtual "O teu tarifário (preços da fatura)", que passa a ser a base das poupanças. Termos de acesso às redes faturados em linhas separadas (Endesa) são somados aos preços e os descontos percentuais da fatura (ex.: débito direto 7% + fatura digital 7%) são aplicados.

Formatos testados: EDP Comercial, Endesa e G9 Energy (indexada). Faturas digitalizadas sem texto dão erro com indicação para usar a fatura eletrónica. As faturas usadas nos testes têm dados pessoais e não estão no repositório.
