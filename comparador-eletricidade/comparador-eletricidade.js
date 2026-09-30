/* Comparador de eletricidade - literaciafinanceira.pt
   Dados: ofertas comerciais comunicadas a ERSE (data/ofertas.json, gerado todos os dias por scripts/atualizar_ofertas.py).
   Calculo da fatura: mesma metodologia do simulador de precos da ERSE (validado ao centimo nos consumidores-tipo).
   Reutiliza o CSS do comparador de depositos (#lf-dp .dp-*) mais o suplemento comparador-eletricidade.css. */
(function () {
  'use strict';
  if (window.__lfElInit) return;
  window.__lfElInit = true;

  var SRC = (document.currentScript && document.currentScript.src) || '';
  var BASE = SRC ? SRC.replace(/[^\/]*(\?.*)?$/, '') : 'https://franklinsilvapt-arch.github.io/comparador-eletricidade/';
  var DATA_URL = BASE + 'data/ofertas.json';

  /* ---------- Parametros regulados (ERSE, 2026) ---------- */
  var POTS = [1.15, 2.3, 3.45, 4.6, 5.75, 6.9, 10.35, 13.8, 17.25, 20.7, 27.6, 34.5, 41.4];
  /* Termo fixo das tarifas de acesso as redes em BTN, EUR/dia (so e preciso ate 3,45 kVA, onde tem IVA a 6%) */
  var TAR_POT = [0.0573, 0.1145, 0.1718];
  var IEC = 0.001;            /* imposto especial de consumo, EUR/kWh */
  var CAV = 2.85;             /* contribuicao audiovisual, EUR/mes */
  var KWH_IVA6 = 200, KWH_IVA6_FAM = 300; /* kWh por 30 dias com IVA a 6%, potencias ate 6,9 kVA */
  /* Tarifa social 2026 (ERSE): desconto no termo fixo em EUR/dia por potencia (1,15 a 6,9 kVA) e na energia em EUR/kWh
     (igual em todos os periodos horarios), isencao do IEC e contribuicao audiovisual reduzida para 1 EUR/mes.
     Valores iguais aos que o simulador da ERSE aplica a todas as ofertas. */
  var TS_POT = [0.0361, 0.0722, 0.1083, 0.1444, 0.1806, 0.2166];
  var TS_KWH = 0.0468, CAV_TS = 1, IEC_TS = 0;
  var CAV_MIN_KWH = 400;      /* abaixo deste consumo anual nao se paga contribuicao audiovisual */
  /* Estes valores sao so a reserva: o ofertas.json traz os parametros calibrados todos os dias com o simulador da ERSE. */
  function aplicarParams(P) {
    if (!P) return;
    if (P.TAR_POT) TAR_POT = P.TAR_POT; if (P.TS_POT) TS_POT = P.TS_POT;
    if (P.IEC != null) IEC = P.IEC; if (P.CAV != null) CAV = P.CAV;
    if (P.KWH_IVA6) KWH_IVA6 = P.KWH_IVA6; if (P.KWH_IVA6_FAM) KWH_IVA6_FAM = P.KWH_IVA6_FAM;
    if (P.TS_KWH != null) TS_KWH = P.TS_KWH; if (P.CAV_TS != null) CAV_TS = P.CAV_TS; if (P.IEC_TS != null) IEC_TS = P.IEC_TS;
    if (P.CAV_MIN_KWH != null) CAV_MIN_KWH = P.CAV_MIN_KWH;
  }

  var NOMES = {
    TUR: 'Mercado regulado', ALFAENERGIA: 'Alfa Energia', AUDAX: 'Audax', COOP: 'Coopérnico', EDPC: 'EDP',
    END: 'Endesa', ENIPLENITUDE: 'Plenitude', EZUENERGIA: 'EZU Energia', GALP: 'Galp', GOLD: 'Goldenergy',
    IBD: 'Iberdrola', IBELECTRA: 'Ibelectra', JAFPLUS: 'JAFplus', LUZBOA: 'Luzboa', LUZIGAS: 'Luzigás',
    MEOENERGIA: 'MEO Energia', NABALIAENERGIA: 'Nabalia Energia', NOSSAENERGIA: 'Nossa Energia', OENEO: 'Oeneo',
    PORTULOGOS: 'Portulogos', REPSOL: 'Repsol', YESENERGY: 'Yes Energy', ACCIONA: 'Acciona', ELERGONE: 'Elergone',
    LOGICA: 'Logica Energy', 'ZUG POWER': 'Zug Power', G9: 'G9', ROCKWATT: 'Rockwatt'
  };
  /* Logotipos em logos/<codigo em minusculas>.png. LARGOS: logotipos horizontais, recortados por CSS para mostrar so o simbolo no quadrado. */
  var LOGOS = { TUR: 1, ALFAENERGIA: 1, AUDAX: 1, COOP: 1, EDPC: 1, END: 1, ENIPLENITUDE: 1, EZUENERGIA: 1, GALP: 1, GOLD: 1, IBD: 1,
    IBELECTRA: 1, JAFPLUS: 1, LUZBOA: 1, LUZIGAS: 1, MEOENERGIA: 1, NABALIAENERGIA: 1, NOSSAENERGIA: 1, OENEO: 1, PORTULOGOS: 1, REPSOL: 1, YESENERGY: 1 };
  var LARGOS = { COOP: 1, END: 1, IBD: 1 };
  var NOMES_ERSE = {};
  function nomeDe(c) { return NOMES[c] || NOMES_ERSE[c] || c; }
  function ficheiroLogo(c) { return c.toLowerCase().replace(/ /g, ''); }

  var PERFIS = [
    { k: 'p1', l: 'Casal sem filhos', kwh: 1900, pot: 2 },
    { k: 'p2', l: 'Casal com 2 filhos', kwh: 5000, pot: 5 },
    { k: 'p3', l: 'Casal com 4 filhos', kwh: 10900, pot: 7 }
  ];
  var TARIFAS = { s: 'Simples', b: 'Bi-horária', t: 'Tri-horária' };

  var FILTROS = [
    { k: 'semFid', i: 'unl', l: 'Sem fidelização', f: function (o) { return o.f.charAt(0) === '0'; } },
    { k: 'semServ', i: 'wal', l: 'Sem serviços adicionais', f: function (o) { return o.f.charAt(4) === '0'; } },
    { k: 'semCond', i: 'usr', l: 'Sem condições de acesso', f: function (o) { return o.f.charAt(2) === '0'; } },
    { k: 'verde', i: 'leaf', l: '100% renovável', f: function (o) { return o.f.charAt(1) === '1'; } },
    { k: 'mb', i: 'card', l: 'Sem débito direto obrigatório', f: function (o) { return !o.pg || o.pg !== '100'; } },
    { k: 'papel', i: 'doc', l: 'Fatura em papel', f: function (o) { return !o.ft || o.ft.charAt(1) === '1'; } }
  ];

  var S = {
    data: null, erro: false,
    unid: 'eur', valor: 37, kwhMes: 1900 / 12, pot: 2, tarifa: 'auto', vazio: 40, ponta: 20, fam: false, social: false, idx: false, mais: false,
    on: {}, novo: true, open: null, visible: 10, formOpen: false, perfil: null,
    ver: 'melhor', com: '', sort: 'total'
  };

  /* ---------- Helpers ---------- */
  function esc(a) { return String(a == null ? '' : a).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function url(u) { return /^https?:\/\//i.test(u || '') ? esc(u) : ''; }
  function milhar(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function eur(v) { var p = Math.abs(v).toFixed(2).split('.'); return (v < 0 ? '-' : '') + milhar(p[0]) + ',' + p[1] + '€'; }
  function eurInt(v) { return (v < 0 ? '-' : '') + milhar(String(Math.round(Math.abs(v)))) + '€'; }
  function num(v, d) { return v.toFixed(d).replace('.', ','); }
  function potTxt(p) { return String(p).replace('.', ',') + ' kVA'; }
  function meses(n) { return n + (n === 1 ? ' mês' : ' meses'); }
  function dataPT(iso) {
    var M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var p = String(iso || '').split('-'); if (p.length < 3) return '';
    return parseInt(p[2], 10) + ' de ' + M[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  }
  function ico(path) { return '<svg class="dp-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; }
  var IC = {
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unl: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    wal: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    usr: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-9 16-9 0 9-3 16-9 16Z"/><path d="M4 20c2-4 5-7 9-9"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    fam: '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M15 14h3a3 3 0 0 1 3 3v4"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
    wave: '<path d="M3 17l5-6 4 3 4-7 5 6"/>',
    out: '<path d="M7 17 17 7M7 7h10v10"/>'
  };
  var CARET = '<svg class="dp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  /* ---------- Calculo (metodologia do simulador da ERSE) ---------- */
  /* c = { kwh (ano), vz (parte em vazio), pt (parte em ponta), novo, fam } */
  function calcOpcao(o, i, c, k) {
    var p = o[k] && o[k][i];
    if (!p) return null;
    var pot = POTS[i], kwh = c.kwh, tarDia = TAR_POT[i] || 0, iecKwh = IEC, cavMes = CAV;
    if (c.social) {
      if (i >= TS_POT.length) return null; /* so ate 6,9 kVA */
      p = p.map(function (v, j) { return Math.round((v - (j === 0 ? TS_POT[i] : TS_KWH)) * 1e5) / 1e5; });
      tarDia -= TS_POT[i]; iecKwh = IEC_TS; cavMes = CAV_TS;
    }
    if (kwh < CAV_MIN_KWH) cavMes = 0;
    var lim = (c.fam ? KWH_IVA6_FAM : KWH_IVA6) * 365 / 30;
    var sh6 = pot <= 6.9 && kwh > 0 ? Math.min(1, lim / kwh) : 0;
    var ivaE = sh6 * 1.06 + (1 - sh6) * 1.23;
    var en;
    if (k === 's') en = p[1] * kwh;
    else if (k === 'b') en = p[1] * kwh * (1 - c.vz) + p[2] * kwh * c.vz;
    else { var pt = Math.min(c.pt, 1 - c.vz); en = p[1] * kwh * pt + p[2] * kwh * (1 - c.vz - pt) + p[3] * kwh * c.vz; }
    var tf = p[0] * 365, tar = tarDia * 365;
    var tfIva = pot <= 3.45 ? tar * 1.06 + (tf - tar) * 1.23 : tf * 1.23;
    var enIva = en * ivaE, iec = kwh * iecKwh * 1.23, cav = cavMes * 12 * 1.06;
    function desc(a) { return a ? a[0] + a[1] * tf * 1.23 + (a[2] * en + a[3] * kwh) * ivaE : 0; }
    var reemb = desc(o.r), dNovo = c.novo ? desc(o.d) : 0, serv = o.cs || 0;
    var total = enIva + tfIva + iec + cav + serv - reemb - dNovo;
    return {
      k: k, total: total, mes: total / 12, p: p,
      energia: en, potencia: tf, iva: (enIva - en) + (tfIva - tf) + kwh * iecKwh * 0.23 + cavMes * 12 * 0.06,
      iec: kwh * iecKwh, cav: cavMes * 12, serv: serv, reemb: reemb, dNovo: dNovo,
      precoMedio: kwh > 0 ? en / kwh : 0
    };
  }
  /* tarifa: 'auto' compara simples e bi-horaria (e usa tri-horaria se for a unica opcao, caso das potencias acima de 20,7 kVA) */
  function calc(o, i, c, tarifa) {
    if (tarifa !== 'auto') return calcOpcao(o, i, c, tarifa);
    var a = calcOpcao(o, i, c, 's'), b = calcOpcao(o, i, c, 'b');
    if (a && b) return a.total <= b.total ? a : b;
    return a || b || calcOpcao(o, i, c, 't');
  }
  function ctx() { return { kwh: S.kwhMes * 12, vz: S.vazio / 100, pt: S.ponta / 100, novo: S.novo, fam: S.fam, social: S.social }; }
  function regulada() { for (var i = 0; i < S.data.ofertas.length; i++) if (S.data.ofertas[i].c === 'TUR') return S.data.ofertas[i]; return null; }
  function faturaRegulada(kwhAno) {
    var t = regulada(), c = ctx(); c.kwh = kwhAno;
    if (!t) return null;
    return calcOpcao(t, S.pot, c, 's') || calcOpcao(t, S.pot, c, 't');
  }
  /* Quem so sabe quanto paga: estima o consumo que da essa fatura aos precos do mercado regulado */
  function kwhDaFatura(eurMes) {
    var alvo = eurMes * 12, a = 0, b = 250000, r0 = faturaRegulada(CAV_MIN_KWH);
    if (!r0 || alvo <= r0.total) return Math.min(CAV_MIN_KWH / 12, 33);
    for (var n = 0; n < 50; n++) { var m = (a + b) / 2, r = faturaRegulada(m); if (r.total < alvo) a = m; else b = m; }
    return (a + b) / 2 / 12;
  }
  function atualizarConsumo() { if (S.data) S.kwhMes = S.unid === 'eur' ? kwhDaFatura(S.valor) : S.valor; }

  function resultados() {
    var c = ctx(), todos = [], reg = null, coms = {}, nIdx = 0;
    S.data.ofertas.forEach(function (o) {
      var r = calc(o, S.pot, c, S.tarifa);
      if (!r) return;
      if (o.c === 'TUR') reg = r;
      if (!S.idx && o.f.charAt(3) === '1') { nIdx++; return; }
      for (var j = 0; j < FILTROS.length; j++) if (S.on[FILTROS[j].k] && !FILTROS[j].f(o)) return;
      coms[o.c] = 1;
      todos.push({ o: o, r: r });
    });
    var lista;
    if (S.com) lista = todos.filter(function (x) { return x.o.c === S.com; });
    else if (S.ver === 'todas') lista = todos;
    else {
      var porCom = {};
      todos.forEach(function (x) { if (!porCom[x.o.c] || x.r.total < porCom[x.o.c].r.total) porCom[x.o.c] = x; });
      lista = Object.keys(porCom).map(function (k) { return porCom[k]; });
    }
    var f = {
      total: function (a, b) { return a.r.total - b.r.total; },
      energia: function (a, b) { return a.r.precoMedio - b.r.precoMedio || a.r.total - b.r.total; },
      potencia: function (a, b) { return a.r.p[0] - b.r.p[0] || a.r.total - b.r.total; },
      nome: function (a, b) { return nomeDe(a.o.c).localeCompare(nomeDe(b.o.c), 'pt') || a.r.total - b.r.total; }
    }[S.sort] || null;
    lista.sort(f);
    var melhor = todos.slice().sort(function (a, b) { return a.r.total - b.r.total; })[0] || null;
    return { lista: lista, reg: reg, nOfertas: todos.length, coms: Object.keys(coms), melhor: melhor, nIdx: nIdx };
  }

  /* ---------- Render ---------- */
  function tags(o) {
    var t = [];
    if (o.c === 'TUR') t.push('<span class="dp-tag">Tarifa regulada</span>');
    if (o.f.charAt(3) === '1') t.push('<span class="dp-tag is-warn">Indexada ao mercado</span>');
    if (o.f.charAt(7) === '1') t.push('<span class="dp-tag is-warn">Só novos clientes</span>');
    if (o.f.charAt(0) === '1') t.push('<span class="dp-tag is-warn">Fidelização</span>');
    if (o.f.charAt(4) === '1') t.push('<span class="dp-tag is-warn">Serviços adicionais</span>');
    if (o.f.charAt(2) === '1') t.push('<span class="dp-tag">Condições de acesso</span>');
    if (o.f.charAt(1) === '1') t.push('<span class="dp-tag">100% renovável</span>');
    return t.join(' ');
  }
  function iniciais(nome) {
    var w = nome.replace(/[^A-Za-zÀ-ÿ ]/g, '').split(' ').filter(Boolean);
    return (w.length > 1 ? w[0].charAt(0) + w[1].charAt(0) : nome.slice(0, 2)).toUpperCase();
  }
  function logo(c, nome) {
    return '<span class="dp-logo el-logo' + (LARGOS[c] ? ' el-lg-' + c.toLowerCase() : '') + '"><span class="dp-logo-ini">' + esc(iniciais(nome)) + '</span>' +
      (LOGOS[c] ? '<img src="' + BASE + 'logos/' + ficheiroLogo(c) + '.png" alt="Logótipo ' + esc(c === 'TUR' ? 'SU Eletricidade' : nome) + '" loading="lazy" onload="this.classList.add(\'is-on\')">' : '') + '</span>';
  }
  function lista(bits, nomes, sep) {
    var t = [];
    for (var i = 0; i < nomes.length; i++) if (bits && bits.charAt(i) === '1') t.push(nomes[i]);
    return t.length ? t.join(sep || ', ') : 'Não indicado';
  }
  function energiaKpi(r) {
    if (r.k === 's') return [num(r.p[1], 4) + '€', 'por kWh, sem IVA'];
    if (r.k === 'b') return [num(r.p[1], 4) + '€', 'fora de vazio · ' + num(r.p[2], 4) + '€ em vazio'];
    return [num(r.p[1], 4) + '€', 'ponta · ' + num(r.p[2], 4) + '€ cheias · ' + num(r.p[3], 4) + '€ vazio'];
  }

  function cartao(it, idx, base, baseLabel) {
    var o = it.o, r = it.r, nome = nomeDe(o.c), aberto = S.open === o.id;
    var dif = base != null ? base - r.total : null, poup;
    if (o.c === 'TUR' && S.unid !== 'eur') poup = '<div class="dp-kpi-v is-plain" style="color:#697386">–</div><div class="dp-kpi-s">é a referência</div>';
    else if (dif == null) poup = '<div class="dp-kpi-v is-plain" style="color:#697386">–</div><div class="dp-kpi-s">&nbsp;</div>';
    else if (dif >= 0.5) poup = '<div class="dp-kpi-v el-pos">' + eurInt(dif) + '</div><div class="dp-kpi-s">a menos por ano</div>';
    else if (dif <= -0.5) poup = '<div class="dp-kpi-v is-plain el-neg">+' + eurInt(-dif) + '</div><div class="dp-kpi-s">a mais por ano</div>';
    else poup = '<div class="dp-kpi-v is-plain">Igual</div><div class="dp-kpi-s">&nbsp;</div>';

    var ek = energiaKpi(r), link = url(o.u);
    var cta = link ? '<a class="dp-btn" href="' + link + '" target="_blank" rel="nofollow noopener" data-stop>Ir para a ' + esc(o.c === 'TUR' ? 'SU Eletricidade' : nome) + ico(IC.out) + '</a>' : '';

    var h = '<div class="dp-c' + (aberto ? ' is-open' : '') + '" data-id="' + esc(o.id) + '"><div class="dp-c-main">' +
      '<div class="dp-rank">' + (idx + 1) + '</div>' +
      '<div class="dp-ent">' + logo(o.c, nome) + '<div>' +
      '<div class="dp-c-head"><span class="dp-name">' + esc(nome) + '</span></div>' +
      '<div class="dp-prod">' + esc(o.n) + '</div>' + tags(o) + '</div></div>' +
      '<div class="dp-kpis">' +
      '<div class="dp-kpi"><div class="dp-kpi-l">' + (o.f.charAt(3) === '1' ? 'Fatura estimada' : 'Fatura por mês') + '</div><div class="dp-kpi-v">' + eur(r.mes) + '</div><div class="dp-kpi-s">' + eurInt(r.total) + ' por ano</div></div>' +
      '<div class="dp-kpi"><div class="dp-kpi-l">Tarifa</div><div class="dp-kpi-v is-plain">' + TARIFAS[r.k] + '</div><div class="dp-kpi-s">' + (S.tarifa === 'auto' ? 'a mais barata para ti' : '&nbsp;') + '</div></div>' +
      '<div class="dp-kpi"><div class="dp-kpi-l">Energia</div><div class="dp-kpi-v is-plain">' + ek[0] + '</div><div class="dp-kpi-s">' + ek[1] + '</div></div>' +
      '<div class="dp-kpi"><div class="dp-kpi-l">Potência</div><div class="dp-kpi-v is-plain">' + num(r.p[0], 4) + '€</div><div class="dp-kpi-s">por dia, sem IVA</div></div>' +
      '<div class="dp-kpi"><div class="dp-kpi-l">' + esc(baseLabel) + '</div>' + poup + '</div>' +
      '</div>' +
      '<div class="dp-c-cta">' + cta + '<span class="dp-kpi-s">' + (o.f.charAt(3) === '1' ? 'Preço varia com o mercado' : (o.du ? 'Contrato de ' + meses(o.du) : '&nbsp;')) + '</span></div></div>';

    if (aberto) h += detalhe(o, r);
    return h + '<button type="button" class="dp-c-toggle" data-toggle>' + (aberto ? 'Menos detalhes' : 'Ver as contas e as condições') + CARET + '</button></div>';
  }

  function detalhe(o, r) {
    var c = ctx(), kwhAno = Math.round(c.kwh);
    var kv = function (a, b) { return '<div class="dp-kv"><span>' + a + '</span><span>' + b + '</span></div>'; };
    var a = function (u, t) { u = url(u); return u ? '<a href="' + u + '" target="_blank" rel="nofollow noopener" data-stop>' + t + '</a>' : ''; };
    var linhas = '<table class="dp-sub"><thead><tr><th>Parcela</th><th class="num">Por ano</th></tr></thead><tbody>' +
      '<tr><td>Energia (' + milhar(String(kwhAno)) + ' kWh)</td><td class="num">' + eur(r.energia) + '</td></tr>' +
      '<tr><td>Potência contratada (' + potTxt(POTS[S.pot]) + ')</td><td class="num">' + eur(r.potencia) + '</td></tr>' +
      '<tr><td>Imposto especial de consumo' + (S.social ? ' (isento)' : '') + '</td><td class="num">' + eur(r.iec) + '</td></tr>' +
      '<tr><td>Contribuição audiovisual' + (S.social ? ' (reduzida)' : '') + '</td><td class="num">' + eur(r.cav) + '</td></tr>' +
      '<tr><td>IVA</td><td class="num">' + eur(r.iva) + '</td></tr>' +
      (r.serv ? '<tr><td>Serviços adicionais obrigatórios</td><td class="num">' + eur(r.serv) + '</td></tr>' : '') +
      (r.reemb ? '<tr><td>Descontos e reembolsos</td><td class="num">-' + eur(r.reemb) + '</td></tr>' : '') +
      (r.dNovo ? '<tr><td>Desconto de novo cliente (1.º ano)</td><td class="num">-' + eur(r.dNovo) + '</td></tr>' : '') +
      '<tr class="is-on"><td>Total</td><td class="num">' + eur(r.total) + '</td></tr></tbody></table>';

    /* A mesma oferta nas tres tarifas, para o consumo e a potencia indicados */
    var ops = '';
    ['s', 'b', 't'].forEach(function (k) {
      var x = calcOpcao(o, S.pot, c, k);
      if (!x) return;
      var pr = k === 's' ? num(x.p[1], 4) + '€' : k === 'b' ? num(x.p[1], 4) + '€ · ' + num(x.p[2], 4) + '€' : num(x.p[1], 4) + '€ · ' + num(x.p[2], 4) + '€ · ' + num(x.p[3], 4) + '€';
      ops += '<tr' + (k === r.k ? ' class="is-on"' : '') + '><td>' + TARIFAS[k] + '</td><td>' + pr + '</td><td class="num">' + num(x.p[0], 4) + '€</td><td class="num">' + eur(x.mes) + '</td></tr>';
    });
    var tabOps = '<div class="dp-h">Esta oferta em cada tarifa, para ' + potTxt(POTS[S.pot]) + '</div><table class="dp-sub el-ops"><thead><tr><th>Tarifa</th><th>Energia por kWh</th><th class="num">Potência por dia</th><th class="num">Fatura por mês</th></tr></thead><tbody>' + ops + '</tbody></table>' +
      '<p class="el-mini">Preços sem IVA. Na bi-horária: fora de vazio e vazio. Na tri-horária: ponta, cheias e vazio.</p>';

    var cond = kv('Tipo de preço', o.c === 'TUR' ? 'Regulado pela ERSE' : (o.f.charAt(3) === '1' ? 'Indexado ao mercado grossista' : 'Fixo')) +
      kv('Fidelização', o.f.charAt(0) === '1' ? 'Sim' : 'Não') +
      kv('Duração do contrato', o.du ? meses(o.du) : 'Não indicada') +
      kv('Pagamento', esc(lista(o.pg, ['débito direto', 'multibanco', 'outros meios']))) +
      kv('Fatura', esc(lista(o.ft, ['eletrónica', 'em papel'], ' ou '))) +
      (o.tfa ? kv('Faturação', esc(o.tfa)) : '') +
      kv('Contratação', esc(lista(o.ct, ['online', 'presencial', 'por telefone']))) +
      kv('Atendimento', esc(lista(o.at, ['por escrito', 'presencial', 'telefónico', 'online']))) +
      kv('Energia 100% renovável', o.f.charAt(1) === '1' ? 'Sim' : 'Não') +
      (o.m ? kv('Modalidade', esc(o.m)) : '') +
      (o.tel ? kv('Telefone comercial', esc(o.tel)) : '') +
      (o.ini || o.fim ? kv('Validade dos preços', esc((o.ini ? 'de ' + o.ini + ' ' : '') + (o.fim ? 'até ' + o.fim : ''))) : '');
    var docs = [a(o.fp, 'Ficha padronizada'), a(o.cg, 'Condições gerais'), a(o.ce, 'Contratar online')].filter(Boolean);
    if (docs.length) cond += kv('Documentos', docs.join(' · '));

    var notas = [];
    if (o.f.charAt(3) === '1') notas.push('<b>Preço indexado.</b> O valor mostrado é uma estimativa da ERSE com base no preço esperado do mercado grossista para os próximos três meses. A fatura real sobe e desce com o mercado.');
    if (o.to) notas.push('<b>A oferta.</b> ' + esc(o.to));
    if (o.f.charAt(0) === '1' && o.tfi) notas.push('<b>Fidelização.</b> ' + esc(o.tfi));
    if (o.tr || o.dr) notas.push('<b>Condições de acesso.</b> ' + esc([o.tr, o.dr].filter(Boolean).join(' ')));
    if (o.ts || o.tos) notas.push('<b>Serviços adicionais.</b> ' + esc([o.ts, o.tos].filter(Boolean).join(' ')));
    if (o.trb) notas.push('<b>Descontos e reembolsos.</b> ' + esc(o.trb));
    if (o.ob) notas.push('<b>Outros benefícios.</b> ' + esc(o.ob));
    if (o.tap) notas.push('<b>Atualização de preços.</b> ' + esc(o.tap));
    if (o.d && !S.novo) notas.push('Esta oferta tem um desconto para novos clientes que não está contado.');

    return '<div class="dp-c-detail"><div class="dp-detail-grid"><div><div class="dp-h">Como se chega a ' + eur(r.total) + ' por ano</div>' + linhas + tabOps +
      '</div><div><div class="dp-h">Condições</div>' + cond + '</div></div>' +
      (notas.length ? '<div class="dp-h el-h-notas">O que o comercializador comunicou à ERSE</div><ul class="dp-notes el-notas"><li>' + notas.join('</li><li>') + '</li></ul>' : '') + '</div>';
  }

  var AR = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function cabecalho() {
    var n = S.data ? S.data.ofertas.length : 0, c = S.data ? Object.keys(S.data.ofertas.reduce(function (m, o) { m[o.c] = 1; return m; }, {})).length : 0;
    return '<div class="max-width-37-5 dp-lead"><div class="text-color-secondary"><div class="text-size-large"><div class="text-align-center">' +
      'Indica o teu consumo e vê quanto pagas por mês em ' + (n ? n + ' ofertas de ' + c + ' comercializadores' : 'cada comercializador') + '. Os preços são os que as empresas comunicam à ERSE, o regulador da energia, e são atualizados todos os dias.' +
      '</div></div></div></div>' +
      '<div class="dp-meta"><div class="dp-authors">' +
      '<a class="dp-author" href="https://www.literaciafinanceira.pt/autores/franklin-silva"><img class="dp-author-img" src="https://cdn.prod.website-files.com/67922c46c9da6bf5d9bfdf20/683ee0ae5bc67fe0ef48466e_franklin-silva.avif" alt="Franklin Silva"><span><span class="dp-author-l">Autor</span><span class="dp-author-n">Franklin Silva</span></span></a>' +
      '<a class="dp-author" href="https://www.literaciafinanceira.pt/autores/pedro-braz"><img class="dp-author-img" src="https://cdn.prod.website-files.com/67922c46c9da6bf5d9bfdf20/683ee0f9b80a20ec1767fab5_Pedro-Braz.avif" alt="Pedro Braz"><span><span class="dp-author-l">Revisor</span><span class="dp-author-n">Pedro Braz</span></span></a>' +
      '<span class="dp-author dp-author-date"><span class="dp-author-ico">' + ico(IC.cal) + '</span><span><span class="dp-author-l">Preços atualizados</span><span class="dp-author-n">' + (S.data ? dataPT(S.data.atualizado) : '...') + '</span></span></span>' +
      '</div></div>';
  }

  function tarifaDisponivel(k) {
    if (k === 'auto') return true;
    return S.data.ofertas.some(function (o) { return o[k] && o[k][S.pot]; });
  }

  function render() {
    var root = document.getElementById('lf-dp');
    if (!root) return;
    if (S.erro) { root.innerHTML = cabecalho() + '<div class="dp-empty">Não foi possível carregar os preços. Atualiza a página dentro de momentos.</div>'; return; }
    if (!S.data) { root.innerHTML = cabecalho() + '<div class="dp-empty">A carregar os preços...</div>'; return; }
    if (S.tarifa !== 'auto' && !tarifaDisponivel(S.tarifa)) S.tarifa = 'auto';

    var res = resultados(), lst = res.lista, vis = lst.slice(0, S.visible);
    var eurM = S.unid === 'eur' && S.valor > 0;
    var base = eurM ? S.valor * 12 : (res.reg ? res.reg.total : null);
    var baseLabel = eurM ? 'Face à tua fatura' : 'Face ao regulado';
    var tri = S.tarifa === 't' || (S.tarifa === 'auto' && POTS[S.pot] > 20.7);

    var potOpts = POTS.map(function (p, i) { return '<option value="' + i + '"' + (S.pot === i ? ' selected' : '') + '>' + potTxt(p) + '</option>'; }).join('');
    var tarifas = [['auto', 'Mais barata'], ['s', 'Simples'], ['b', 'Bi-horária'], ['t', 'Tri-horária']].map(function (t) {
      var ok = tarifaDisponivel(t[0]);
      return '<button type="button" class="dp-tab' + (S.tarifa === t[0] ? ' is-active' : '') + (ok ? '' : ' el-off') + '" data-tarifa="' + t[0] + '"' + (ok ? '' : ' disabled') + '>' + t[1] + '</button>';
    }).join('');
    var op = function (v, sel, txt) { return '<option value="' + v + '"' + (sel === v ? ' selected' : '') + '>' + txt + '</option>'; };
    var vzOpts = [10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80].map(function (v) { return op(v, S.vazio, v + '% em vazio'); }).join('');
    var ptOpts = [10, 15, 20, 25, 30, 35].map(function (v) { return op(v, S.ponta, v + '% em ponta'); }).join('');
    var perfis = PERFIS.map(function (p) {
      return '<button type="button" class="dp-irs-b' + (S.perfil === p.k ? ' is-on' : '') + '" data-perfil="' + p.k + '">' + p.l + '</button>';
    }).join('');
    var chips = '<button type="button" class="dp-chip' + (S.idx ? ' is-on' : '') + '" data-idx>' + ico(IC.wave) + 'Incluir tarifas indexadas' + (S.idx ? '' : ' (' + res.nIdx + ')') + '</button>' + FILTROS.map(function (f) {
      return '<button type="button" class="dp-chip' + (S.on[f.k] ? ' is-on' : '') + '" data-f="' + f.k + '">' + ico(IC[f.i]) + esc(f.l) + '</button>';
    }).join('');
    var caso = '<button type="button" class="dp-chip' + (S.novo ? ' is-on' : '') + '" data-novo>' + ico(IC.gift) + 'Contar descontos de novo cliente</button>' +
      '<button type="button" class="dp-chip' + (S.fam ? ' is-on' : '') + '" data-fam>' + ico(IC.fam) + 'Família numerosa</button>' +
      '<button type="button" class="dp-chip' + (S.social ? ' is-on' : '') + '" data-social>' + ico(IC.heart) + 'Tenho tarifa social</button>';

    var AD = '<div class="table-results_wrapper is-pub dp-ad-card"><a class="button-arrow is-trigger w-inline-block" href="https://www.literaciafinanceira.pt/visita/trade-republic" target="_blank" rel="nofollow sponsored" data-stop><div class="calc-banner_wrapper"><div class="pub_wrapper"><div class="pub-left_wrapper"><div class="pub-logo-text_wrapper"><div class="pub-logo_wrapper is-big"><div class="pub-text-logo_wrapper"><div class="text-size-caps"><div class="text-color-quarterary"><div class="text-weight-medium">Anúncio</div></div></div><img class="image-102" src="https://cdn.prod.website-files.com/67922c46c9da6bf5d9bfdf09/681e26cb7eaca82c7095d5c7_Trade_Republic_logo_2021.svg.avif" alt="logo Trade Republic" loading="lazy"></div><div class="pub-line-divider is-full-height"></div><div class="pub-title_wrapper"><div class="text-color-primary"><div class="text-size-large"><div class="text-weight-semibold">Ganha 3,00% em juros, até 50.000€ (novos clientes)</div></div></div><div class="max-width-31"><div class="text-color-tertiary"><div class="text-size-extra-extra-small is-0-75-mobile">Pagamentos mensais na tua conta. Flexibilidade total. Investir envolve risco. Este conteúdo é uma comunicação comercial da Trade Republic Bank GmbH.</div></div></div></div></div></div></div><div class="pub-right_wrapper"><div class="hide-mobile-landscape"><div class="button-arrow"><div class="text-weight-medium"><div class="text-size-small"><div class="text-weight-medium"><div>Sabe mais</div></div></div></div><div class="button-arrow_wrapper"><div class="button-arrow-icon w-embed">' + AR + '</div></div></div></div><div class="visible-mobile-landscape"><div class="banner-button-position"><div class="rotate-45"><div class="button-arrow_wrapper"><div class="button-arrow-icon w-embed">' + AR + '</div></div></div></div></div></div></div></div></a></div>';

    var cards = '';
    vis.forEach(function (it, i) { cards += cartao(it, i, base, baseLabel); if (i === 2) cards += AD; });
    if (vis.length && vis.length < 3) cards += AD;

    var tarTxt = S.tarifa === 'auto' ? 'Tarifa mais barata' : TARIFAS[S.tarifa];
    var resumo = (eurM ? eurInt(S.valor) : milhar(String(Math.round(S.kwhMes))) + ' kWh') + ' por mês · ' + potTxt(POTS[S.pot]) + ' · ' + tarTxt;

    /* Resumo: a oferta mais barata face a referencia */
    var mk = '';
    if (res.melhor) {
      var m = res.melhor, dm = base != null ? base - m.r.total : 0;
      mk = '<div class="dp-mk"><b>' + res.nOfertas + '</b> ofertas de <b>' + res.coms.length + '</b> comercializadores' + (S.idx ? '' : ', só de preço fixo') + '<span class="dp-mk-sep">·</span>A mais barata: <b>' + esc(nomeDe(m.o.c)) + '</b>, ' + eur(m.r.mes) + ' por mês' +
        (dm >= 0.5 ? '<span class="dp-mk-sep">·</span><b>' + eurInt(dm) + '</b> a menos por ano do que ' + (eurM ? 'a tua fatura' : 'o mercado regulado') : '') + (S.social ? '<span class="dp-mk-sep">·</span>Com tarifa social' : '') + '</div>';
    }

    var comOpts = op('', S.com, 'Todos os comercializadores') + res.coms.slice().sort(function (a, b) { return nomeDe(a).localeCompare(nomeDe(b), 'pt'); })
      .map(function (k) { return op(k, S.com, esc(nomeDe(k))); }).join('');
    if (S.com && res.coms.indexOf(S.com) < 0) comOpts += op(S.com, S.com, esc(nomeDe(S.com)));
    var ctl = '<div class="el-ctl"><span class="dp-count">' + lst.length + (lst.length === 1 ? ' resultado' : ' resultados') + '</span><div class="el-ctl-r">' +
      '<select class="dp-select" id="elVer" aria-label="O que mostrar"' + (S.com ? ' disabled' : '') + '>' + op('melhor', S.com ? 'todas' : S.ver, 'A melhor oferta de cada empresa') + op('todas', S.com ? 'todas' : S.ver, 'Todas as ofertas') + '</select>' +
      '<select class="dp-select" id="elCom" aria-label="Comercializador">' + comOpts + '</select>' +
      '<select class="dp-select" id="elSort" aria-label="Ordenar por">' + op('total', S.sort, 'Fatura mais baixa') + op('energia', S.sort, 'Energia mais barata') + op('potencia', S.sort, 'Potência mais barata') + op('nome', S.sort, 'Nome do comercializador') + '</select>' +
      '</div></div>';

    var horas = tri
      ? '<div class="el-duo"><div><label class="dp-label" for="elVazio">Consumo em vazio</label><select class="dp-input dp-input-select" id="elVazio">' + vzOpts + '</select></div><div><label class="dp-label" for="elPonta">Em ponta</label><select class="dp-input dp-input-select" id="elPonta">' + ptOpts + '</select></div></div>'
      : '<div' + (S.tarifa === 's' ? ' class="el-off"' : '') + '><label class="dp-label" for="elVazio">Consumo em vazio</label><select class="dp-input dp-input-select" id="elVazio"' + (S.tarifa === 's' ? ' disabled' : '') + '>' + vzOpts + '</select></div>';

    root.innerHTML = cabecalho() +
      '<div class="dp-card' + (S.formOpen ? ' is-open' : '') + '"><button type="button" class="dp-card-toggle" data-cardtoggle aria-expanded="' + (S.formOpen ? 'true' : 'false') + '"><span><span class="dp-card-toggle-t">Consumo, potência e tarifa</span><span class="dp-card-toggle-s">' + resumo + '</span></span>' + CARET + '</button>' +
      '<div class="dp-card-body"><div class="el-simples">' +
      '<div><label class="dp-label" for="elVal">Quanto gastas de luz por mês?</label><div class="dp-input-wrap el-val"><input id="elVal" class="dp-input" type="text" inputmode="decimal" autocomplete="off" value="' + (S.valor ? milhar(String(S.valor).replace('.', ',')) : '') + '">' +
      '<div class="el-unid" role="group" aria-label="Unidade"><button type="button" class="el-unid-b' + (S.unid === 'eur' ? ' is-on' : '') + '" data-unid="eur">€</button><button type="button" class="el-unid-b' + (S.unid === 'kwh' ? ' is-on' : '') + '" data-unid="kwh">kWh</button></div></div>' +
      '<p class="el-ajuda">' + (S.unid === 'eur' ? 'Põe o valor da fatura. Equivale a cerca de <b>' + milhar(String(Math.round(S.kwhMes))) + ' kWh</b> por mês aos preços do mercado regulado.' : 'O consumo em kWh está na tua fatura.') + '</p></div>' +
      '<div><label class="dp-label" for="elPot">Potência contratada</label><select class="dp-input dp-input-select" id="elPot">' + potOpts + '</select>' +
      '<p class="el-ajuda">Está na fatura. As mais comuns são 3,45 e 6,9 kVA.</p></div>' +
      '</div>' +
      '<div class="el-rapido"><span class="dp-label">Não sabes? Escolhe o caso mais parecido</span><div class="el-perfis">' + perfis + '</div></div>' +
      '<button type="button" class="el-mais' + (S.mais ? ' is-open' : '') + '" data-mais aria-expanded="' + (S.mais ? 'true' : 'false') + '">Mais opções: tarifa, consumo em vazio, tarifa social' + CARET + '</button>' +
      (S.mais ? '<div class="el-avancado"><div class="el-av-g">' +
        '<div><span class="dp-label">Tarifa</span><div class="dp-toggle el-toggle4">' + tarifas + '</div></div>' + horas + '</div>' +
        '<div class="el-caso"><span class="dp-label">O teu caso</span><div class="el-caso-c">' + caso + '</div></div>' +
        '<p class="dp-form-note">O vazio é o consumo à noite e, no ciclo semanal, ao fim de semana. ' + (S.tarifa === 'auto' ? 'Em "Mais barata" comparamos a tarifa simples com a bi-horária. ' : '') +
        'As famílias numerosas (cinco ou mais pessoas) têm IVA a 6% nos primeiros ' + KWH_IVA6_FAM + ' kWh por mês, em vez de ' + KWH_IVA6 + ' kWh. A tarifa social é um desconto para famílias com rendimentos baixos, atribuído de forma automática, e aplica-se em qualquer comercializador.</p></div>' : '') +
      '</div></div>' +
      '<div class="dp-bar"><div class="dp-chips">' + chips + '</div></div>' +
      mk + ctl +
      (lst.length ? '<div class="dp-cards">' + cards + '</div>' : '<div class="dp-empty">' + (S.social && S.pot >= TS_POT.length ? 'A tarifa social só existe para potências contratadas até 6,9 kVA.' : 'Nenhuma oferta cumpre estes filtros para ' + potTxt(POTS[S.pot]) + '. Tira um filtro ou muda a tarifa.') + '</div>') +
      (lst.length > vis.length ? '<div class="dp-more"><button type="button" class="dp-btn is-secondary" id="elMore">Mostrar mais ' + Math.min(10, lst.length - vis.length) + ' de ' + (lst.length - vis.length) + '</button></div>' : '') +
      '<p class="dp-foot">Preços de todas as ofertas de eletricidade para clientes domésticos comunicadas pelos comercializadores à <a href="https://simuladorprecos.erse.pt/" target="_blank" rel="noopener">ERSE</a>, atualizados a ' + dataPT(S.data.atualizado) + ', para Portugal continental. Ficam de fora os pacotes de eletricidade com gás. ' +
      'A fatura inclui energia, potência, IVA, imposto especial de consumo e contribuição audiovisual, segue a metodologia do simulador de preços da ERSE e não inclui a taxa de exploração da DGEG (0,07€ por mês). ' +
      'As tarifas indexadas ficam de fora por omissão, porque o preço muda todos os meses com o mercado grossista e o valor mostrado é só uma estimativa da ERSE. ' +
      'Com a opção "Tenho tarifa social", os preços levam o <a href="https://www.erse.pt/media/02gh5y04/tarifa-social-eletricidade-jan2026.pdf" target="_blank" rel="noopener">desconto fixado pela ERSE para 2026</a> (33,8% sobre a tarifa regulada), a isenção do imposto especial de consumo e a contribuição audiovisual reduzida. Os descontos de novo cliente valem só no primeiro ano. Confirma sempre as condições no site do comercializador antes de mudares.</p>';
  }

  /* ---------- Eventos ---------- */
  function refocus(id) {
    var el = document.getElementById(id);
    if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest || !t.closest('#lf-dp') || t.closest('[data-stop]')) return;
    if (t.closest('[data-cardtoggle]')) { S.formOpen = !S.formOpen; render(); return; }
    if (t.closest('[data-mais]')) { S.mais = !S.mais; render(); return; }
    if (t.closest('[data-idx]')) { S.idx = !S.idx; S.visible = 10; render(); return; }
    var un = t.closest('[data-unid]');
    if (un) {
      var nova = un.getAttribute('data-unid');
      if (nova !== S.unid) {
        /* converte o valor para a outra unidade, para os resultados nao saltarem */
        if (nova === 'kwh') S.valor = Math.round(S.kwhMes); else { var fr = faturaRegulada(S.kwhMes * 12); S.valor = fr ? Math.round(fr.mes) : S.valor; }
        S.unid = nova; S.perfil = null; atualizarConsumo(); S.visible = 10; render();
      }
      return;
    }
    var a = t.closest('[data-tarifa]');
    if (a) { if (a.disabled) return; S.tarifa = a.getAttribute('data-tarifa'); S.visible = 10; render(); return; }
    var p = t.closest('[data-perfil]');
    if (p) {
      var pf = PERFIS.filter(function (x) { return x.k === p.getAttribute('data-perfil'); })[0];
      if (pf) {
        S.perfil = pf.k; S.pot = pf.pot; S.kwhMes = pf.kwh / 12;
        if (S.unid === 'eur') { var f0 = faturaRegulada(pf.kwh); S.valor = f0 ? Math.round(f0.mes) : S.valor; } else S.valor = Math.round(pf.kwh / 12);
        S.visible = 10; render();
      }
      return;
    }
    if (t.closest('[data-novo]')) { S.novo = !S.novo; render(); return; }
    if (t.closest('[data-fam]')) { S.fam = !S.fam; atualizarConsumo(); render(); return; }
    if (t.closest('[data-social]')) { S.social = !S.social; atualizarConsumo(); S.visible = 10; render(); return; }
    var c = t.closest('.dp-chip');
    if (c) { var k = c.getAttribute('data-f'); if (S.on[k]) delete S.on[k]; else S.on[k] = true; S.visible = 10; render(); return; }
    if (t.closest('#elMore')) { S.visible += 10; render(); return; }
    var g = t.closest('[data-toggle]');
    if (g) { var id = g.closest('.dp-c').getAttribute('data-id'); S.open = S.open === id ? null : id; render(); }
  });
  document.addEventListener('input', function (e) {
    var id = e.target && e.target.id;
    if (id === 'elVal') {
      var raw = String(e.target.value).replace(/[^\d,]/g, '');
      e.target.value = raw;
      clearTimeout(window.__elT);
      window.__elT = setTimeout(function () {
        var n = parseFloat(raw.replace(',', '.'));
        S.valor = isNaN(n) || n < 0 ? 0 : Math.min(n, 20000); S.perfil = null;
        atualizarConsumo(); S.visible = 10;
        var foco = document.activeElement && document.activeElement.id === 'elVal';
        render(); if (foco) refocus('elVal');
      }, 450);
    }
  });
  document.addEventListener('change', function (e) {
    var id = e.target && e.target.id, v = e.target && e.target.value;
    if (id === 'elPot') { S.pot = parseInt(v, 10) || 0; S.perfil = null; atualizarConsumo(); S.visible = 10; render(); }
    if (id === 'elVazio') { S.vazio = parseInt(v, 10) || 40; render(); }
    if (id === 'elPonta') { S.ponta = parseInt(v, 10) || 20; render(); }
    if (id === 'elVer') { S.ver = v; S.visible = 10; render(); }
    if (id === 'elCom') { S.com = v; S.visible = 10; render(); }
    if (id === 'elSort') { S.sort = v; S.visible = 10; render(); }
  });

  /* Formato compacto do JSON (v3): s = [termosFixos, kWh], b = [termosFixos, foraVazio, vazio], t = [termosFixos, ponta, cheias, vazio].
     termosFixos e uma lista por potencia; cada preco de energia e um numero (igual em todas as potencias) ou uma lista por potencia.
     Expande para uma lista por potencia de [termoFixo, precos...] ou 0 quando a oferta nao existe nessa potencia. */
  function expandir(o) {
    function v(x, i) { return typeof x === 'number' ? x : x[i]; }
    var tfS = o.s && Array.isArray(o.s[0]) ? o.s[0].slice() : null;
    ['s', 'b', 't'].forEach(function (k) {
      var a = o[k];
      if (!a) return;
      var tfs = a[0] === 1 ? tfS : a[0];
      if (!Array.isArray(tfs) || Array.isArray(tfs[0])) return; /* ja expandido */
      o[k] = tfs.map(function (tf, i) {
        if (!tf) return 0;
        var row = [tf];
        for (var j = 1; j < a.length; j++) { var x = v(a[j], i); if (!x) return 0; row.push(x); }
        return row;
      });
    });
  }

  /* ---------- Arranque ---------- */
  function montar() {
    if (!document.getElementById('lf-dp')) {
      var alvo = document.getElementById('lf-pc-calc'), div = document.createElement('div');
      div.id = 'lf-dp';
      if (alvo) alvo.parentNode.replaceChild(div, alvo);
      else { var h1 = document.querySelector('h1.heading-style-h2'); if (h1 && h1.parentNode) h1.parentNode.appendChild(div); else return; }
    }
    render();
    var x = new XMLHttpRequest();
    x.open('GET', DATA_URL + '?d=' + new Date().toISOString().slice(0, 10));
    x.onload = function () {
      try {
        var d = JSON.parse(x.responseText);
        if (!d.ofertas || !d.ofertas.length) throw 0;
        if (d.pots && d.pots.length) POTS = d.pots;
        aplicarParams(d.params);
        if (d.nomes) NOMES_ERSE = d.nomes;
        if (d.logos) { LOGOS = {}; d.logos.forEach(function (c) { LOGOS[c] = 1; }); }
        d.ofertas.forEach(expandir); S.data = d;
        atualizarConsumo();
      } catch (err) { S.erro = true; }
      render();
    };
    x.onerror = function () { S.erro = true; render(); };
    x.send();
  }
  window.__lfElCalc = function (o, i, kwh, vz, novo, tarifa, pt, fam, social) { return calc(o, i, { kwh: kwh, vz: vz, pt: pt == null ? 0.2 : pt, novo: novo, fam: !!fam, social: !!social }, tarifa); };
  window.__lfElExpandir = expandir; window.__lfElState = S; /* expostos para testes */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
