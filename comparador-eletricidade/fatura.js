/* Leitura de faturas de eletricidade em PDF, inteiramente no browser (pdf.js). Nada e enviado para servidor nenhum.
   Devolve o que conseguiu ler: comercializador, potencia, tarifa, ciclo, dias e kWh do periodo, repartição por periodo
   horario e precos. O comparador preenche o formulario com isto e a pessoa confirma.
   Carregado pelo comparador-eletricidade.js so quando alguem escolhe um ficheiro. Expoe window.LF_FATURA. */
(function (root) {
  'use strict';
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* Padroes que identificam o comercializador (nome, NIPC ou dominio). Conta-se o numero de ocorrencias e ganha o que tiver mais. */
  var COMS = [
    ['EDPC', /EDP Comercial|503504564|edp\.pt/gi],
    ['TUR', /SU Eletricidade|Servi[çc]o Universal|EDP Servi[çc]o Universal|507846044/gi],
    ['END', /Endesa|980245974/gi],
    ['G9', /G9 Energy|519326857|g9energy/gi],
    ['GALP', /Galp Power|Galp Comercializa|galp\.(?:pt|com)|509148247/gi],
    ['IBD', /Iberdrola/gi],
    ['GOLD', /Gold ?[Ee]nergy/gi],
    ['REPSOL', /Repsol/gi],
    ['ENIPLENITUDE', /Plenitude/gi],
    ['LUZBOA', /Luz ?[Bb]oa/gi],
    ['LUZIGAS', /Luzig[aá]s/gi],
    ['MEOENERGIA', /MEO Energia/gi],
    ['COOP', /Coop[ée]rnico/gi],
    ['AUDAX', /Audax/gi],
    ['IBELECTRA', /Ibelectra/gi],
    ['YESENERGY', /YES ?Energy/gi],
    ['ALFAENERGIA', /Alfa ?Energia/gi],
    ['EZUENERGIA', /EZU Energia/gi],
    ['JAFPLUS', /JAF ?plus/gi],
    ['NABALIAENERGIA', /Nabalia/gi],
    ['NOSSAENERGIA', /Nossa Energia/gi],
    ['OENEO', /Oeneo/gi],
    ['PORTULOGOS', /Portulogos/gi],
    ['MUON', /Muon/g],
    ['ROCKWATT', /Rockwatt/gi]
  ];
  var MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

  function num(s) { return parseFloat(String(s).replace(/\./g, '').replace(',', '.')); }
  function dec(s) { return parseFloat(String(s).replace(',', '.')); }

  var lib = null;
  function carregarPdfjs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    if (lib) return lib;
    lib = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = PDFJS; s.async = true;
      s.onload = function () { root.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; ok(root.pdfjsLib); };
      s.onerror = function () { lib = null; ko(new Error('Não foi possível carregar o leitor de PDF.')); };
      document.head.appendChild(s);
    });
    return lib;
  }

  /* Agrupa os pedacos de texto do pdf.js por linha (mesma coordenada y, com tolerancia) e ordena-os da esquerda para a direita. */
  function linhasDaPagina(conteudo) {
    var itens = conteudo.items.filter(function (it) { return it.str && it.str.trim(); })
      .map(function (it) { return { x: it.transform[4], y: it.transform[5], s: it.str }; })
      .sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var linhas = [], atual = null;
    itens.forEach(function (it) {
      if (!atual || Math.abs(atual.y - it.y) > 3) { atual = { y: it.y, itens: [] }; linhas.push(atual); }
      atual.itens.push(it);
    });
    return linhas.map(function (l) {
      return l.itens.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
    });
  }

  function lerTexto(pdfjs, dados) {
    return pdfjs.getDocument({ data: dados }).promise.then(function (doc) {
      var ps = [];
      for (var i = 1; i <= doc.numPages; i++) ps.push(doc.getPage(i).then(function (p) { return p.getTextContent(); }).then(linhasDaPagina));
      return Promise.all(ps).then(function (pags) { return [].concat.apply([], pags); });
    });
  }

  /* ---------- Datas ---------- */
  function data(d, m, a) { return new Date(Date.UTC(a, m - 1, d)); }
  function mes(nome) { var k = nome.toLowerCase().slice(0, 3); return MESES[k] || null; }
  /* Devolve as datas (ate duas) encontradas num texto curto, em varios formatos portugueses. */
  function datasEm(t) {
    var out = [], m, re;
    re = /(\d{4})-(\d{2})-(\d{2})/g;
    while ((m = re.exec(t))) out.push(data(+m[3], +m[2], +m[1]));
    re = /(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/g;
    while ((m = re.exec(t))) out.push(data(+m[1], +m[2], +m[3]));
    if (out.length >= 2) return out;
    /* "25 de outubro a 24 de novembro 2024", "21 dez 2023 a 20 jan 2024", "25 de outubro de 2024" */
    re = /(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\.?\s*(?:de\s+)?(\d{4})?/gi;
    var parciais = [];
    while ((m = re.exec(t))) { var mm = mes(m[2]); if (mm) parciais.push({ d: +m[1], m: mm, a: m[3] ? +m[3] : null }); }
    if (parciais.length >= 2) {
      var b = parciais[1], a = parciais[0];
      if (!b.a) return [];
      if (!a.a) a.a = a.m > b.m ? b.a - 1 : b.a;
      return [data(a.d, a.m, a.a), data(b.d, b.m, b.a)];
    }
    return out;
  }
  function diasEntre(ds) {
    if (!ds || ds.length < 2) return null;
    var n = Math.round((ds[1] - ds[0]) / 86400000) + 1;
    return n >= 7 && n <= 400 ? n : null;
  }

  /* ---------- Leitura ---------- */
  function moda(vals) {
    var c = {}, best = null;
    vals.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (best === null || c[v] > c[best]) best = v; });
    return best === null ? null : +best;
  }

  function analisar(linhas) {
    var T = linhas.join('\n'), flat = linhas.join(' '), r = { avisos: [] }, m, re;

    /* Comercializador */
    var melhor = null, nMelhor = 0;
    COMS.forEach(function (c) { var n = (flat.match(c[1]) || []).length; if (n > nMelhor) { nMelhor = n; melhor = c[0]; } });
    r.com = melhor;

    /* Potencia contratada */
    var pots = [];
    re = /(\d{1,2}[.,]\d{1,2})\s*kVA/gi;
    while ((m = re.exec(flat))) pots.push(dec(m[1]));
    r.pot = pots.length ? moda(pots) : null;

    /* Tarifa e ciclo */
    r.tarifa = /tri-?\s?hor[áa]ri/i.test(flat) ? 't' : /bi-?\s?hor[áa]ri/i.test(flat) ? 'b' : /\bsimples\b|sem\s+ciclo/i.test(flat) ? 's' : null;
    r.ciclo = /ciclo\s+semanal/i.test(flat) ? 's' : /ciclo\s+di[áa]rio/i.test(flat) ? 'd' : null;

    /* Dias do periodo de faturacao. Guarda-se tambem o intervalo de datas da linha da potencia, para filtrar acertos de periodos anteriores. */
    r.dias = null;
    var periodo = null;
    m = /per[íi]odo\s+de\s+fatura[çc][ãa]o:?\s*([^\n]{6,60})/i.exec(T);
    if (m) { var dsP = datasEm(m[1]); r.dias = diasEntre(dsP); if (r.dias) periodo = dsP; }
    var dPot = [];
    linhas.forEach(function (l, i) {
      if (/kVA/i.test(l) && /\bpot[êe]ncia\b/i.test(l) || (/\d\s*dias\b/i.test(l) && /\bpot[êe]ncia\b/i.test(linhas[i - 1] || ''))) {
        var d = /(\d{1,3})\s*dias/i.exec(l); if (d) dPot.push(+d[1]);
        var ds = datasEm(l), n = diasEntre(ds); if (n) { dPot.push(n); if (!periodo) periodo = ds; }
      }
    });
    if (!r.dias && dPot.length) r.dias = Math.max.apply(null, dPot);
    if (!r.dias) {
      var dAll = [];
      re = /(\d{1,3})\s*dias\b/gi;
      while ((m = re.exec(flat))) { var n = +m[1]; if (n >= 25 && n <= 70) dAll.push(n); }
      if (dAll.length) r.dias = Math.max.apply(null, dAll);
    }
    /* Uma linha com datas fora do periodo de faturacao e um acerto de um periodo anterior */
    function foraDoPeriodo(l) {
      if (!periodo) return false;
      var ds = datasEm(l); if (ds.length < 2) return false;
      return ds[1] < periodo[0] || ds[0] > periodo[1];
    }

    /* kWh do periodo: o Imposto Especial de Consumo incide sobre todos os kWh, por isso e a melhor fonte */
    var kwhIec = 0, temIec = false;
    linhas.forEach(function (l) {
      if (/imposto\s+especial|\bIEC\b/i.test(l) && !/0,001\s*€\s*por\s*kWh/i.test(l) && !/abate|acerto|estorno/i.test(l) && !foraDoPeriodo(l)) {
        var k = /(\d[\d.]*)\s*kWh/i.exec(l);
        if (k && !/-\s*\d[\d.]*\s*kWh/.test(l)) { kwhIec += num(k[1]); temIec = true; }
      }
    });
    r.kwh = temIec && kwhIec > 0 ? Math.round(kwhIec) : null;
    if (!r.kwh) {
      var soma = 0, tem = false;
      linhas.forEach(function (l) {
        if (/termo\s+de\s+energia|energia\s+ativa|^\s*eletricidade\s*-\s*energia|consumo\s+(?:real|estimado)/i.test(l) && !/redes|acesso|abate|acerto|estorno/i.test(l) && !foraDoPeriodo(l)) {
          var k = /(\d[\d.]*)\s*kWh/i.exec(l); if (k && !/-\s*\d[\d.]*\s*kWh/.test(l)) { soma += num(k[1]); tem = true; }
        }
      });
      if (tem && soma > 0) r.kwh = Math.round(soma);
    }
    r.kwhMes = r.kwh && r.dias ? Math.round(r.kwh / r.dias * 365.25 / 12) : null;

    /* Repartição por periodo horario (vazio, ponta, cheias) */
    var rep = null;
    m = /Cheias?:\s*([\d.]+)\s*kWh\s*\|\s*Ponta:\s*([\d.]+)\s*kWh\s*\|\s*Vazio:\s*([\d.]+)\s*kWh/i.exec(flat);
    if (m) rep = { c: num(m[1]), p: num(m[2]), v: num(m[3]) };
    if (!rep) {
      m = /(\d[\d.]*)\s*kWh\s*\([^)]*\)\s*em\s*vazio,?\s*(\d[\d.]*)\s*kWh\s*\([^)]*\)\s*em\s*ponta\s*e\s*(\d[\d.]*)\s*kWh\s*\([^)]*\)\s*em\s*cheias/i.exec(flat);
      if (m) rep = { v: num(m[1]), p: num(m[2]), c: num(m[3]) };
    }
    if (!rep) {
      var acc = { v: 0, fv: 0, p: 0, c: 0 }, achou = false;
      linhas.forEach(function (l) {
        var k = /(\d[\d.]*)\s*kWh\b.*?\d[,.]\d{3,}/i.exec(l);
        if (!k) return;
        var lab = /fora\s+(?:de\s+)?vazio/i.test(l) ? 'fv' : /\bvazio\b/i.test(l) ? 'v' : /\bponta\b/i.test(l) ? 'p' : /\bcheias?\b/i.test(l) ? 'c' : null;
        if (lab && !/redes|acesso/i.test(l)) { acc[lab] += num(k[1]); achou = true; }
      });
      if (achou && acc.v > 0) rep = { v: acc.v, p: acc.p, c: acc.c + acc.fv };
    }
    if (rep) {
      var tot = rep.v + rep.p + rep.c;
      if (tot > 0) { r.vazioPct = Math.round(rep.v / tot * 100); r.pontaPct = rep.p ? Math.round(rep.p / tot * 100) : null; }
    }

    /* Precos: energia por kWh (sem IVA) e potencia por dia */
    var pe = [], pp = [];
    linhas.forEach(function (l, i) {
      var k = /\d[\d.]*\s*kWh\s+(\d[,.]\d{3,6})\s*€?/i.exec(l);
      if (k && !/redes|acesso|imposto|IEC|tarifa social|regula[çc]/i.test(l)) { var v = dec(k[1]); if (v > 0.03 && v < 0.6) pe.push(v); }
      var d = /\d{1,3}\s*dias\s+(\d[,.]\d{3,6})\s*€?/i.exec(l);
      if (d && /pot[êe]ncia/i.test(l + ' ' + (linhas[i - 1] || '')) && !/redes|acesso|audiovisual/i.test(l)) { var w = dec(d[1]); if (w > 0.03 && w < 6) pp.push(w); }
    });
    r.precoEnergia = pe.filter(function (v, i, a) { return a.indexOf(v) === i; });
    r.precoPotencia = pp.length ? pp[pp.length - 1] : null;

    /* Nome do plano, quando a fatura o diz */
    m = /(?:Plano|Tarif[áa]rio|Oferta)\s*:\s*([^\n|]{2,40})/i.exec(T);
    r.plano = m ? m[1].trim() : null;
    r.indexada = /indexad[ao]|OMIE|mercado\s+spot/i.test(flat);

    if (!r.pot) r.avisos.push('potência contratada');
    if (!r.kwhMes) r.avisos.push(r.kwh ? 'dias do período de faturação' : 'consumo em kWh');
    return r;
  }

  function ler(ficheiro) {
    return carregarPdfjs().then(function (pdfjs) {
      return new Promise(function (ok, ko) {
        var fr = new FileReader();
        fr.onload = function () { ok(new Uint8Array(fr.result)); };
        fr.onerror = function () { ko(new Error('Não foi possível ler o ficheiro.')); };
        fr.readAsArrayBuffer(ficheiro);
      }).then(function (dados) { return lerTexto(pdfjs, dados); });
    }).then(function (linhas) {
      if (linhas.join('').replace(/\s/g, '').length < 200) throw new Error('Este PDF não tem texto que se possa ler (parece uma digitalização ou uma fotografia). Experimenta a fatura eletrónica descarregada da área de cliente.');
      return analisar(linhas);
    });
  }

  root.LF_FATURA = { ler: ler, analisar: analisar, linhasDaPagina: linhasDaPagina };
})(typeof window !== 'undefined' ? window : (typeof module !== 'undefined' ? module.exports : this));
