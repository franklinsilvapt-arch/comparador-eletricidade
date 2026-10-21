/* Preco do kWh - literaciafinanceira.pt (artigo /artigos/preco-kwh)
   Tabelas e textos com o preco do kWh de cada comercializador, gerados a partir dos mesmos dados do comparador de eletricidade
   (data/ofertas.json, atualizado todos os dias a partir do ficheiro da ERSE, e data/omie.json).
   O calculo da fatura e o mesmo do comparador (metodologia do simulador da ERSE mais a taxa da DGEG).

   Uso no artigo: cada bloco e um embed com <div data-lf-kwh="CHAVE"> e o HTML de reserva la dentro (o mesmo que este
   script gera, ja com valores). O script substitui o conteudo pelos valores do dia. Chaves: resumo, simples, bi, regulada,
   indexadas, exemplo, pequena, faq, data.
   Em Node, module.exports = { construir } gera o HTML de reserva (ver scripts/gerar_preco_kwh.js). */
(function () {
  'use strict';

  var NOMES = {
    TUR: 'Mercado regulado', ALFAENERGIA: 'Alfa Energia', AUDAX: 'Audax', COOP: 'Coopérnico', EDPC: 'EDP',
    END: 'Endesa', ENIPLENITUDE: 'Plenitude', EZUENERGIA: 'EZU Energia', GALP: 'Galp', GOLD: 'Goldenergy',
    IBD: 'Iberdrola', IBELECTRA: 'Ibelectra', JAFPLUS: 'JAFplus', LUZBOA: 'Luzboa', LUZIGAS: 'Luzigás', MUON: 'MUON',
    MEOENERGIA: 'MEO Energia', NABALIAENERGIA: 'Nabalia Energia', NOSSAENERGIA: 'Nossa Energia', OENEO: 'Oeneo',
    PORTULOGOS: 'Portulogos', REPSOL: 'Repsol', YESENERGY: 'Yes Energy', ACCIONA: 'Acciona', ELERGONE: 'Elergone',
    LOGICA: 'Logica Energy', 'ZUG POWER': 'Zug Power', G9: 'G9', ROCKWATT: 'Rockwatt'
  };
  /* Perfis da ERSE: casal com 2 filhos (6,9 kVA, 5.000 kWh/ano) e casal sem filhos (3,45 kVA, 1.900 kWh/ano) */
  var CASA = { i: 5, kwh: 5000 }, PEQ = { i: 2, kwh: 1900 };
  var VAZIO = 0.4, PONTA = 0.2;
  /* Perguntas frequentes por comercializador (os mais pesquisados) */
  var FAQ_COMS = ['EDPC', 'END', 'IBD', 'GOLD', 'GALP', 'REPSOL', 'MEOENERGIA'];
  var COMPARADOR = 'https://www.literaciafinanceira.pt/comparador-eletricidade';

  /* ---------- Calculo (copiado do comparador-eletricidade.js, nao alterar sem alterar la) ---------- */
  var POTS, TAR_POT, IEC, CAV, KWH_IVA6, CAV_MIN_KWH, DGEG = 0.07, PERDAS = 1.16, OMIE_REF, OMIE;
  function params(d) {
    var P = d.params || {};
    POTS = d.pots || [1.15, 2.3, 3.45, 4.6, 5.75, 6.9, 10.35, 13.8, 17.25, 20.7, 27.6, 34.5, 41.4];
    TAR_POT = P.TAR_POT || [0.0573, 0.1145, 0.1718];
    IEC = P.IEC != null ? P.IEC : 0.001;
    CAV = P.CAV != null ? P.CAV : 2.85;
    KWH_IVA6 = P.KWH_IVA6 || 200;
    CAV_MIN_KWH = P.CAV_MIN_KWH != null ? P.CAV_MIN_KWH : 400;
    OMIE_REF = d.omie_ref;
  }
  function expandir(o) {
    function v(x, i) { return typeof x === 'number' ? x : x[i]; }
    var tfS = o.s && Array.isArray(o.s[0]) ? o.s[0].slice() : null;
    ['s', 'b', 't'].forEach(function (k) {
      var a = o[k];
      if (!a) return;
      var tfs = a[0] === 1 ? tfS : a[0];
      if (!Array.isArray(tfs) || Array.isArray(tfs[0])) return;
      o[k] = tfs.map(function (tf, i) {
        if (!tf) return 0;
        var row = [tf];
        for (var j = 1; j < a.length; j++) { var x = v(a[j], i); if (!x) return 0; row.push(x); }
        return row;
      });
    });
  }
  function calc(o, i, kwh, k) {
    var p = o[k] && o[k][i];
    if (!p) return null;
    if (o.f.charAt(3) === '1' && OMIE && OMIE_REF) {
      var per = OMIE.d || {};
      var om = k === 's' ? [OMIE.media] : k === 'b' ? [per.fv, per.vz] : [per.p, per.c, per.vz];
      if (!om.some(function (x) { return x == null; }))
        p = p.map(function (v, j) { return j === 0 ? v : Math.round((v + PERDAS * (om[j - 1] - OMIE_REF) / 1000) * 1e5) / 1e5; });
    }
    var pot = POTS[i], tarDia = TAR_POT[i] || 0, cavMes = kwh < CAV_MIN_KWH ? 0 : CAV;
    var lim = KWH_IVA6 * 365 / 30;
    var sh6 = pot <= 6.9 && kwh > 0 ? Math.min(1, lim / kwh) : 0;
    var ivaE = sh6 * 1.06 + (1 - sh6) * 1.23;
    var en;
    if (k === 's') en = p[1] * kwh;
    else if (k === 'b') en = p[1] * kwh * (1 - VAZIO) + p[2] * kwh * VAZIO;
    else { var pt = Math.min(PONTA, 1 - VAZIO); en = p[1] * kwh * pt + p[2] * kwh * (1 - VAZIO - pt) + p[3] * kwh * VAZIO; }
    var tf = p[0] * 365, tar = tarDia * 365;
    var tfIva = pot <= 3.45 ? tar * 1.06 + (tf - tar) * 1.23 : tf * 1.23;
    function desc(a) { return a ? a[0] + a[1] * tf * 1.23 + (a[2] * (en + kwh * IEC) + a[3] * kwh) * ivaE : 0; }
    var reemb = desc(o.r);
    var total = en * ivaE + tfIva + kwh * IEC * 1.23 + cavMes * 12 * 1.06 + DGEG * 12 * 1.23 + (o.cs || 0) - reemb;
    return { total: total, mes: total / 12, p: p, reemb: reemb };
  }

  /* ---------- Selecao ---------- */
  function fixa(o) { return o.c !== 'TUR' && o.f.charAt(3) === '0' && o.f.charAt(2) === '0'; }
  function indexada(o) { return o.c !== 'TUR' && o.f.charAt(3) === '1' && o.f.charAt(2) === '0'; }
  /* a oferta mais barata (fatura anual) de cada comercializador, ordenadas da mais barata para a mais cara */
  function melhores(d, filtro, perfil, k) {
    var por = {};
    d.ofertas.forEach(function (o) {
      if (!filtro(o)) return;
      var r = calc(o, perfil.i, perfil.kwh, k);
      if (!r) return;
      if (!por[o.c] || r.total < por[o.c].r.total) por[o.c] = { o: o, r: r };
    });
    return Object.keys(por).map(function (c) { return por[c]; }).sort(function (a, b) { return a.r.total - b.r.total; });
  }

  /* ---------- Formatacao ---------- */
  function esc(a) { return String(a == null ? '' : a).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function milhar(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function eur(v) { var p = Math.abs(v).toFixed(2).split('.'); return (v < 0 ? '-' : '') + milhar(p[0]) + ',' + p[1] + '€'; }
  function kwhEur(v) { return v.toFixed(4).replace('.', ',') + '€'; }
  function num(v, n) { return v.toFixed(n).replace('.', ','); }
  function data(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; }
  function nome(c, d) { return NOMES[c] || (d.nomes && d.nomes[c]) || c; }
  function link(o, txt) {
    var u = /^https?:\/\//i.test(o.u || '') ? o.u : '';
    return u ? '<a href="' + esc(u) + '" target="_blank" rel="nofollow noopener">' + esc(txt) + '</a>' : esc(txt);
  }
  function tabela(cab, linhas) {
    return '<div class="table-content"><table><thead><tr>' + cab.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + linhas.map(function (l) { return '<tr>' + l.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function nota(t) { return '<p><sup>' + t + '</sup></p>'; }
  function fonte(d) {
    return 'Fonte: <a href="https://simuladorprecos.erse.pt/" target="_blank">ERSE, ofertas comerciais</a> e sites dos comercializadores, dados de ' + data(d.atualizado);
  }

  /* ---------- Blocos ---------- */
  function construir(d, omie) {
    d.ofertas.forEach(expandir);
    params(d);
    OMIE = omie && omie.media ? omie : null;
    var out = {};
    var simples = melhores(d, fixa, CASA, 's');
    var bi = melhores(d, fixa, CASA, 'b');
    var idx = melhores(d, indexada, CASA, 's');
    var peq = melhores(d, fixa, PEQ, 's');
    var tur = null;
    d.ofertas.forEach(function (o) { if (o.c === 'TUR') tur = o; });
    var turS = tur && calc(tur, CASA.i, CASA.kwh, 's');
    var turB = tur && calc(tur, CASA.i, CASA.kwh, 'b');
    var turT = tur && calc(tur, CASA.i, CASA.kwh, 't');
    var temReemb = false;

    function linhaCom(x, k) {
      var r = x.r, est = r.reemb > 0.5 ? '*' : '';
      if (est) temReemb = true;
      var cel = [link(x.o, nome(x.o.c, d)) + est + '<br>' + esc(x.o.n), eur(r.mes)];
      if (k === 's') cel.push(kwhEur(r.p[1]));
      else cel.push(kwhEur(r.p[1]) + ' / ' + kwhEur(r.p[2]));
      cel.push(kwhEur(r.p[0]));
      return cel;
    }

    /* Resumo (paragrafo de abertura) */
    var m = simples[0];
    if (m && turS) {
      out.resumo = '<p>Hoje, a oferta de preço fixo mais barata para uma família de quatro pessoas é a ' + esc(m.o.n) + ', da ' + esc(nome(m.o.c, d)) +
        ': o kWh custa ' + kwhEur(m.r.p[1]) + ' sem IVA e a fatura fica em ' + eur(m.r.mes) + ' por mês. No mercado regulado, o kWh custa ' +
        kwhEur(turS.p[1]) + ' e a mesma família paga ' + eur(turS.mes) + ' por mês.</p>';
    }

    /* Tarifa simples */
    temReemb = false;
    var ls = simples.map(function (x) { return linhaCom(x, 's'); });
    out.simples = tabela(['Fornecedor', 'Fatura/mês', 'Preço kWh', 'Potência/dia'], ls) +
      nota((temReemb ? '*A fatura já conta com o desconto ou reembolso permanente da oferta<br>' : '') +
        'Preços do kWh e da potência sem IVA. Fatura mensal com IVA, impostos e taxas, para 6,9 kVA e 5.000 kWh por ano. Oferta de preço fixo mais barata de cada fornecedor, sem restrições de adesão nem descontos de boas-vindas<br>' + fonte(d));

    /* Bi-horaria */
    temReemb = false;
    var lb = bi.slice(0, 10).map(function (x) { return linhaCom(x, 'b'); });
    out.bi = tabela(['Fornecedor', 'Fatura/mês', 'Fora de vazio / vazio', 'Potência/dia'], lb) +
      nota((temReemb ? '*A fatura já conta com o desconto ou reembolso permanente da oferta<br>' : '') +
        'Preços sem IVA. Fatura mensal com IVA, impostos e taxas, para 6,9 kVA, 5.000 kWh por ano e 40% do consumo em vazio. As 10 ofertas de preço fixo mais baratas, uma por fornecedor<br>' + fonte(d));

    /* Mercado regulado */
    if (turS) {
      var lr = [['Simples', eur(turS.mes), kwhEur(turS.p[1])]];
      if (turB) lr.push(['Bi-horária', eur(turB.mes), kwhEur(turB.p[1]) + ' fora de vazio<br>' + kwhEur(turB.p[2]) + ' em vazio']);
      if (turT) lr.push(['Tri-horária', eur(turT.mes), kwhEur(turT.p[1]) + ' ponta<br>' + kwhEur(turT.p[2]) + ' cheias<br>' + kwhEur(turT.p[3]) + ' vazio']);
      out.regulada = tabela(['Opção horária', 'Fatura/mês', 'Preço kWh'], lr) +
        nota('Preços sem IVA. Potência de 6,9 kVA a ' + kwhEur(turS.p[0]) + ' por dia sem IVA. Fatura com IVA, impostos e taxas, para 5.000 kWh por ano (40% em vazio e 20% em ponta nas opções bi e tri-horária). Preços em vigor de ' +
          esc(tur.ini || '') + (tur.fim ? ' a ' + esc(tur.fim) : '') + '<br>Fonte: <a href="https://www.erse.pt/atividade/regulacao/tarifas-e-precos-eletricidade/" target="_blank">ERSE</a>, dados de ' + data(d.atualizado));
    }

    /* Indexadas */
    if (OMIE && idx.length && m) {
      var bi0 = idx[0];
      var li = idx.slice(0, 5).map(function (x) { return [link(x.o, nome(x.o.c, d)) + '<br>' + esc(x.o.n), eur(x.r.mes), kwhEur(x.r.p[1])]; });
      var dif = bi0.r.mes - m.r.mes;
      out.indexadas = '<p>Entre ' + data(OMIE.de) + ' e ' + data(OMIE.ate) + ', o preço médio da eletricidade no mercado grossista (OMIE) para Portugal foi de ' +
        num(OMIE.media, 2).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '€ por MWh, isto é, ' + kwhEur(OMIE.media / 1000) + ' por kWh antes de perdas na rede, margem do comercializador e tarifas de acesso. ' +
        'Com esse preço, a tarifa indexada mais barata (' + esc(bi0.o.n) + ', da ' + esc(nome(bi0.o.c, d)) + ') daria uma fatura de ' + eur(bi0.r.mes) + ' por mês, ' +
        (dif >= 0 ? eur(dif) + ' acima' : eur(-dif) + ' abaixo') + ' da oferta de preço fixo mais barata.</p>' +
        tabela(['Tarifa indexada', 'Fatura/mês', 'Preço kWh'], li) +
        nota('Preço do kWh estimado com a média do OMIE dos últimos 30 dias, sem IVA. Fatura com IVA, impostos e taxas, para 6,9 kVA e 5.000 kWh por ano na tarifa simples. O valor real muda todos os meses<br>Fonte: <a href="https://www.omie.es/pt/market-results/daily/daily-market/day-ahead-price" target="_blank">OMIE</a> e ' +
          '<a href="https://simuladorprecos.erse.pt/" target="_blank">ERSE</a>, dados de ' + data(OMIE.ate));
    }

    /* Exemplo: kWh mais barato mas fatura mais cara */
    var par = null;
    for (var a = 0; a < simples.length && a < 10; a++) for (var b = 0; b < simples.length && b < 10; b++) {
      var A = simples[a], B = simples[b];
      if (A.r.p[1] < B.r.p[1] && A.r.mes > B.r.mes + 1 && A.r.reemb < 0.5 && B.r.reemb < 0.5 && (!par || A.r.mes - B.r.mes > par[0].r.mes - par[1].r.mes)) par = [A, B];
    }
    if (par) {
      var A1 = par[0], B1 = par[1];
      out.exemplo = '<p>Por exemplo, na tabela acima, a ' + esc(nome(A1.o.c, d)) + ' cobra ' + kwhEur(A1.r.p[1]) + ' por kWh e a ' + esc(nome(B1.o.c, d)) + ' cobra ' +
        kwhEur(B1.r.p[1]) + '. Mesmo assim, com 6,9 kVA e 5.000 kWh por ano, a fatura da ' + esc(nome(B1.o.c, d)) + ' fica ' + eur(A1.r.mes - B1.r.mes) +
        ' mais barata por mês. A diferença está na potência: ' + kwhEur(B1.r.p[0]) + ' por dia contra ' + kwhEur(A1.r.p[0]) + '.</p>';
    }

    /* Casa pequena (3,45 kVA) */
    if (peq.length && turS && tur) {
      var tp = calc(tur, PEQ.i, PEQ.kwh, 's');
      out.pequena = '<p>Numa casa mais pequena, com 3,45 kVA e 1.900 kWh por ano (o perfil de um casal sem filhos), a oferta de preço fixo mais barata é a ' + esc(peq[0].o.n) + ', da ' +
        esc(nome(peq[0].o.c, d)) + ', com uma fatura de ' + eur(peq[0].r.mes) + ' por mês. No mercado regulado, a mesma casa paga ' + (tp ? eur(tp.mes) : '') + ' por mês.</p>';
    }

    /* Perguntas frequentes por comercializador */
    var porComS = {}, porComB = {};
    simples.forEach(function (x) { porComS[x.o.c] = x; });
    bi.forEach(function (x) { porComB[x.o.c] = x; });
    var faq = '';
    if (m && turS) {
      faq += '<p><strong>Quanto custa 1 kWh em Portugal?</strong></p><p>Na tarifa simples, o kWh de eletricidade custa entre ' + kwhEur(Math.min.apply(null, simples.map(function (x) { return x.r.p[1]; }))) +
        ' e ' + kwhEur(Math.max.apply(null, simples.map(function (x) { return x.r.p[1]; }))) + ' sem IVA nas ofertas de preço fixo do mercado livre, e ' + kwhEur(turS.p[1]) +
        ' no mercado regulado. Com IVA a 23%, 1 kWh ao preço do mercado regulado custa ' + kwhEur(turS.p[1] * 1.23) + '. Nos primeiros 200 kWh de cada 30 dias, com IVA a 6%, custa ' + kwhEur(turS.p[1] * 1.06) + '.</p>';
    }
    FAQ_COMS.forEach(function (c) {
      var s = porComS[c];
      if (!s) return;
      var n = nome(c, d), bb = porComB[c];
      faq += '<p><strong>Quanto custa 1 kWh na ' + esc(n) + '?</strong></p><p>Na oferta mais barata da ' + esc(n) + ' (' + esc(s.o.n) + '), o kWh custa ' + kwhEur(s.r.p[1]) +
        ' sem IVA na tarifa simples, ou ' + kwhEur(s.r.p[1] * 1.23) + ' com IVA a 23%' +
        (s.r.reemb > 0.5 ? ', antes do desconto permanente que a oferta dá na fatura' : '') +
        (bb ? '. Na bi-horária' + (bb.o.id === s.o.id ? '' : ' (' + esc(bb.o.n) + ')') + ', custa ' + kwhEur(bb.r.p[1]) + ' fora de vazio e ' + kwhEur(bb.r.p[2]) + ' em vazio' : '') +
        '. Com 6,9 kVA, a potência custa ' + kwhEur(s.r.p[0]) + ' por dia e uma família que gasta 5.000 kWh por ano paga ' + eur(s.r.mes) + ' por mês.</p>';
    });
    out.faq = faq;
    out.data = data(d.atualizado);
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { construir: construir }; return; }

  /* ---------- Browser ---------- */
  var SRC = (document.currentScript && document.currentScript.src) || '';
  var BASE = SRC ? SRC.replace(/[^\/]*(\?.*)?$/, '') : 'https://franklinsilvapt-arch.github.io/comparador-eletricidade/comparador-eletricidade/';
  var BASE_ALT = 'https://cdn.jsdelivr.net/gh/franklinsilvapt-arch/comparador-eletricidade@main/comparador-eletricidade/';
  var dia = new Date().toISOString().slice(0, 10);
  function obter(ficheiro, fim) {
    var urls = [BASE + ficheiro, BASE_ALT + ficheiro], n = 0;
    (function tentar() {
      if (n >= urls.length) return fim(null);
      var x = new XMLHttpRequest();
      x.open('GET', urls[n++] + '?d=' + dia);
      x.onload = function () { if (x.status >= 400) return tentar(); try { fim(JSON.parse(x.responseText)); } catch (e) { tentar(); } };
      x.onerror = tentar;
      x.send();
    })();
  }
  function aplicar() {
    obter('data/ofertas.json', function (d) {
      if (!d || !d.ofertas || !d.ofertas.length) return; /* fica o HTML de reserva */
      obter('data/omie.json', function (omie) {
        var out;
        try { out = construir(d, omie); } catch (e) { if (window.console) console.error('preco-kwh:', e); return; }
        var els = document.querySelectorAll('[data-lf-kwh]');
        for (var i = 0; i < els.length; i++) {
          var k = els[i].getAttribute('data-lf-kwh');
          if (out[k]) { if (k === 'data') els[i].textContent = out[k]; else els[i].innerHTML = out[k]; }
        }
      });
    });
  }
  if (window.__lfKwhInit) return;
  window.__lfKwhInit = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar); else aplicar();
})();
