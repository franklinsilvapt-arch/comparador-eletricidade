// Testes do leitor de faturas (fatura.js) com linhas de texto sinteticas, nos formatos descritos no README.
// Correr com: node scripts/testar_fatura.mjs   (a partir da pasta comparador-eletricidade; nao precisa de pdf.js nem de browser)
// As faturas reais usadas no desenvolvimento tem dados pessoais e nao estao no repositorio.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LF = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fatura.js')).LF_FATURA;

let falhas = 0;
function igual(nome, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) falhas++;
  console.log((ok ? 'OK  ' : 'ERRO') + ' ' + nome + (ok ? '' : ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)));
}

/* 1. EDP: desconto na linha do preco ("10% (-3,34 €)") e cabecalho "desconto para sempre": o preco pago e a base, nao ha campanha com prazo */
const edpSempre = [
  'EDP Comercial - Comercialização de Energia, S.A.',
  'Período de faturação: 1 de setembro a 30 de setembro 2026',
  'Eletricidade',
  '10% desconto (Campanha desconto para sempre + débito direto + fatura eletrónica)',
  'Descrição Quantidade x Preço = Valor Desconto Total s/IVA IVA',
  '1 set a 30 set 2026 200 kWh 0,1671 € 33,42 € 10% (-3,34 €) 30,08 € 6%',
  'Potência (5,75 kVA)',
  '1 set a 30 set 2026 30 dias 0,5203 € 15,61 € 10% (-1,56 €) 14,05 € 23%',
  'IEC 200 kWh 0,001 € 0,20 € 0,20 € 23%',
  'Quanto tenho a pagar? 55,39 €'
];
let r = LF.analisar(edpSempre);
igual('sempre: preco pago', r.precoEnergia, [0.1504]);
igual('sempre: preco de tabela', r.precoEnergiaTabela, [0.1671]);
igual('sempre: potencia paga e de tabela', [r.precoPotencia, r.precoPotenciaTabela], [0.4683, 0.5203]);
igual('sempre: descontos das linhas', [r.descEnergiaPct, r.descPotenciaPct], [10, 10]);
igual('sempre: sem campanha com prazo', r.campanha, null);
igual('sempre: dias e total', [r.dias, r.total], [30, 55.39]);

/* 2. EDP: campanha com data de fim, com os blocos do codigo QR misturados no texto (como o pdf.js os le) */
const edpCampanha = [
  'EDP Comercial - Comercialização de Energia, S.A.',
  'Período de faturação: 19 de agosto a 24 de outubro 2026',
  'Eletricidade',
  'Fatura nº FT2026 K3426/340037724401 De: 27 de outubro 2026 Valor: 107,73 € ATCUD:J6JTR3XB-340037724401',
  'jcbZksWQrSyEbbYnEomzzbKg0jcbZ',
  '35% desconto (Campanha Jovem sub-35 + débito direto + fatura eletrónica até 18 de ZlXZpj51ZkPkZrvxwUuygXRF0ZlXZ',
  'bacSRwSWuPwWXuSZYVSxVUTSYzbcR',
  'novembro 2026) IkA8rjkI;eJwQaSP4m9UQRYujwpJ:',
  'Descrição Quantidade x Preço = Valor Desconto Total s/IVA IVA',
  'Consumo real',
  'Simples',
  '19 ago a 24 out 2026 447 kWh 0,1671 € 74,69 € 48,55 € 6%',
  '35% (-26,14 €)',
  '19 ago a 24 out 2026 94 kWh 0,1671 € 15,71 € 10,21 € 23%',
  '35% (-5,50 €)',
  'Assim, o seu consumo real entre estas datas foi 118 kWh (7337 - 7219) em vazio, 140 kWh (6717 - 6577) em ponta e 283 kWh (12599 - 12316) em cheias.',
  'Potência (5,75 kVA)',
  '19 ago a 24 out 2026 67 dias 0,5203 € 34,86 € 34,86 € 23%',
  'O total da fatura inclui os encargos relativos ao acesso às redes no valor de 52,03 € (antes de IVA), dos quais:',
  'IEC 541 kWh 0,001 € 0,54 € 0,54 € 23%',
  'Quanto tenho',
  'a pagar?',
  '113,77 €'
];
r = LF.analisar(edpCampanha);
igual('campanha: precos pagos e de tabela', [r.precoEnergia, r.precoEnergiaTabela, r.descEnergiaPct, r.precoPotencia, r.precoPotenciaTabela, r.descPotenciaPct], [[0.1086], [0.1671], 35, 0.5203, 0.5203, 0]);
igual('campanha: data de fim e texto limpo', r.campanha, { pct: 35, texto: 'Campanha Jovem sub-35 + débito direto + fatura eletrónica até 18 de novembro 2026', ate: '2026-11-18', meses: null });
igual('campanha: periodo e consumo', [r.dias, r.de, r.ate, r.kwh, r.kwhMes, r.vazioPct, r.pontaPct], [67, '2026-08-19', '2026-10-24', 541, 246, 22, 26]);
igual('campanha: total da fatura', [r.total, r.totalMes], [113.77, 51.68]);

/* 3. EDP: campanha "durante 12 meses" (sem data), so na potencia */
const edpMeses = edpSempre.slice();
edpMeses[3] = '20% desconto (Campanha 20% na potência durante 12 meses + débito direto)';
edpMeses[5] = '1 set a 30 set 2026 200 kWh 0,1671 € 33,42 € 33,42 € 6%';
edpMeses[7] = '1 set a 30 set 2026 30 dias 0,5203 € 15,61 € 20% (-3,12 €) 12,49 € 23%';
r = LF.analisar(edpMeses);
igual('meses: energia sem desconto', [r.precoEnergia, r.descEnergiaPct], [[0.1671], 0]);
igual('meses: potencia com 20%', [r.precoPotencia, r.precoPotenciaTabela, r.descPotenciaPct], [0.4162, 0.5203, 20]);
igual('meses: campanha', r.campanha, { pct: 20, texto: 'Campanha 20% na potência durante 12 meses + débito direto', ate: null, meses: 12 });

/* 4. Endesa: descontos "x 7,00%" em linhas proprias e acesso as redes em linhas separadas; sem campanha */
const endesa = [
  'Endesa Energia S.A. - Sucursal em Portugal 980245974',
  'Período de faturação: 05/09/2026 a 04/10/2026',
  'Potência contratada 6,90 kVA',
  'Termo de potência 30 dias 0,2500 € 7,50 €',
  'Acesso às redes - potência 30 dias 0,3600 € 10,80 €',
  'Termo de energia 250 kWh 0,0900 € 22,50 €',
  'Acesso às redes - energia 250 kWh 0,0607 € 15,18 €',
  'Desconto Débito Direto (11,27 € x 7,00%) + Desconto Fatura Digital (11,27 € x 7,00%) -1,58 €',
  'Imposto Especial de Consumo 250 kWh 0,001 € 0,25 €',
  'Total com IVA 60,10 €'
];
r = LF.analisar(endesa);
igual('endesa: energia com redes somadas', [r.precoEnergia, r.precoEnergiaTabela], [[0.1507], [0.1507]]);
igual('endesa: potencia com redes somadas', [r.precoPotencia, r.redesSeparadas], [0.61, true]);
igual('endesa: descontoPct e sem campanha', [r.descontoPct, r.campanha], [14, null]);
igual('endesa: total', r.total, 60.1);

/* 5. Desconto com data em formato numerico ("até ao dia 31/03/2027") */
const numerica = edpSempre.slice();
numerica[3] = 'Desconto de 15% (Promoção de boas-vindas válida até ao dia 31/03/2027)';
numerica[5] = '1 set a 30 set 2026 200 kWh 0,1671 € 33,42 € 15% (-5,01 €) 28,41 € 6%';
numerica[7] = '1 set a 30 set 2026 30 dias 0,5203 € 15,61 € 15,61 € 23%';
r = LF.analisar(numerica);
igual('data numerica: campanha', r.campanha, { pct: 15, texto: 'Promoção de boas-vindas válida até ao dia 31/03/2027', ate: '2027-03-31', meses: null });
igual('data numerica: precos', [r.precoEnergia, r.precoEnergiaTabela, r.descEnergiaPct], [[0.142], [0.1671], 15]);

/* 6. Publicidade na fatura ("20% de desconto ... até ...") sem nenhum desconto aplicado nos precos: nao e campanha */
const publicidade = edpSempre.slice();
publicidade[3] = 'Aproveite 20% de desconto em serviços de assistência até 31 de dezembro 2026';
publicidade[5] = '1 set a 30 set 2026 200 kWh 0,1671 € 33,42 € 33,42 € 6%';
publicidade[7] = '1 set a 30 set 2026 30 dias 0,5203 € 15,61 € 15,61 € 23%';
r = LF.analisar(publicidade);
igual('publicidade: sem campanha', r.campanha, null);
igual('publicidade: precos de tabela', [r.precoEnergia, r.descEnergiaPct, r.precoPotencia, r.descPotenciaPct], [[0.1671], 0, 0.5203, 0]);

/* 7. Bi-horaria sem descontos: os campos novos repetem os precos */
const bi = [
  'Galp Power, S.A. 509148247',
  'Período de faturação: 01/09/2026 a 30/09/2026',
  'Potência contratada 6,90 kVA bi-horária ciclo diário',
  'Termo de potência 30 dias 0,4500 € 13,50 €',
  'Energia fora de vazio 180 kWh 0,1900 € 34,20 €',
  'Energia vazio 120 kWh 0,1100 € 13,20 €',
  'Imposto Especial de Consumo 300 kWh 0,001 € 0,30 €',
  'Total a pagar 70,00 €'
];
r = LF.analisar(bi);
igual('bi-horaria: precos', [r.tarifa, r.ciclo, r.precoEnergia, r.precoEnergiaTabela, r.precoPotencia, r.campanha], ['b', 'd', [0.19, 0.11], [0.19, 0.11], 0.45, null]);

console.log(falhas ? '\n' + falhas + ' teste(s) com erro' : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
