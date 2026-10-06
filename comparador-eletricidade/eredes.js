/* Leitor do ficheiro de consumos da E-REDES (diagrama de carga de 15 em 15 minutos), para o comparador de eletricidade.
   Corre no browser: o ficheiro nunca sai do computador da pessoa.

   Formato (Balcao Digital da E-REDES > Consumos > exportar): Excel (.xlsx) ou CSV, com algumas linhas de cabecalho
   (CPE, funcoes, mes) e depois uma tabela com as colunas Data | Hora | Consumo medido na IC, Ativa (kW) | Estado |
   Injecao na rede ... | Consumo registado (kW) | Estado | Injecao registada (kW) | Estado.
   - Os valores sao potencia media em kW em cada quarto de hora: energia (kWh) = kW x 0,25.
   - A hora marca o FIM do quarto de hora (00:15 e o intervalo 00:00-00:15; 00:00 do dia seguinte e 23:45-24:00).
   - Usa-se o "Consumo registado" (o que e faturado; em autoconsumo coletivo ja desconta a energia partilhada) e,
     se nao existir, o "Consumo medido na IC".

   Expoe window.LF_EREDES = { ler(file) -> Promise<resultado>, omiePerfil(resultado, omieQh) -> medias OMIE pesadas pelo consumo }.
   Os periodos horarios seguem a ERSE (BTN), em hora legal portuguesa, iguais aos de scripts/omie.py. */
(function () {
  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var xlsxLib = null;
  function carregarXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLib) return xlsxLib;
    xlsxLib = new Promise(function (ok, ko) {
      var sc = document.createElement('script'); sc.src = XLSX_URL; sc.async = true;
      sc.onload = function () { ok(window.XLSX); };
      sc.onerror = function () { xlsxLib = null; ko(new Error('Não foi possível carregar o leitor de Excel.')); };
      document.head.appendChild(sc);
    });
    return xlsxLib;
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).replace(/\s/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  /* Data em 'AAAA/MM/DD', 'AAAA-MM-DD', 'DD/MM/AAAA', 'DD-MM-AAAA' ou numero de serie do Excel */
  function lerData(v) {
    if (typeof v === 'number' && v > 30000 && v < 80000) {
      var dt = new Date(Math.round((v - 25569) * 864e5));
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    var s = String(v == null ? '' : v).trim(), m;
    if ((m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) return iso(+m[3], +m[2], +m[1]);
    return null;
  }
  /* Hora 'HH:MM' (ou fracao de dia do Excel) -> minutos desde a meia-noite */
  function lerHora(v) {
    if (typeof v === 'number' && v >= 0 && v <= 1) return Math.round(v * 1440);
    var m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function diaAnterior(d) {
    var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 1);
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function diaSeguinte(d) {
    var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1);
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function diaSemana(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); } /* 0 = domingo */

  /* ---------- Periodos horarios da ERSE (iguais a scripts/omie.py) ---------- */
  function em(h, ints) { for (var i = 0; i < ints.length; i++) if (h >= ints[i][0] && h < ints[i][1]) return true; return false; }
  function ultimoDomingo(ano, mes) { /* mes 1-12 */
    var t = new Date(Date.UTC(ano, mes, 0)); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t;
  }
  function verao(d) {
    var y = +d.slice(0, 4), t = new Date(d + 'T00:00:00Z');
    return t >= ultimoDomingo(y, 3) && t < ultimoDomingo(y, 10);
  }
  function periodoDiario(d, h) {
    if (em(h, [[22, 24], [0, 8]])) return 'v';
    if (verao(d)) return em(h, [[10.5, 13], [19.5, 21]]) ? 'p' : 'c';
    return em(h, [[9, 10.5], [18, 20.5]]) ? 'p' : 'c';
  }
  function periodoSemanal(d, h) {
    var wd = diaSemana(d);
    if (wd === 0) return 'v';
    if (verao(d)) {
      if (wd === 6) return em(h, [[9, 14], [20, 22]]) ? 'c' : 'v';
      if (em(h, [[0, 7]])) return 'v';
      return em(h, [[9.25, 12.25]]) ? 'p' : 'c';
    }
    if (wd === 6) return em(h, [[9.5, 13], [18.5, 22]]) ? 'c' : 'v';
    if (em(h, [[0, 7]])) return 'v';
    return em(h, [[9.5, 12], [18.5, 21]]) ? 'p' : 'c';
  }

  /* ---------- Leitura ---------- */
  function linhasDeCSV(texto) {
    var ls = texto.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var amostra = ls.slice(0, 30).join('\n');
    var sep = (amostra.match(/;/g) || []).length >= (amostra.match(/,/g) || []).length ? ';' : (amostra.indexOf('\t') >= 0 ? '\t' : ',');
    return ls.map(function (l) { return l.split(sep).map(function (c) { return c.replace(/^["']|["']$/g, '').trim(); }); });
  }

  function processar(rows, nome) {
    var hi = -1, cab = null;
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var low = (rows[r] || []).map(function (c) { return String(c == null ? '' : c).trim().toLowerCase(); });
      if (low.indexOf('data') >= 0 && low.indexOf('hora') >= 0) { hi = r; cab = low; break; }
    }
    if (hi < 0) throw new Error('Este ficheiro não parece o ficheiro de consumos da E-REDES (não encontrámos as colunas Data e Hora).');
    var cD = cab.indexOf('data'), cH = cab.indexOf('hora'), cReg = -1, cMed = -1, cAny = -1;
    cab.forEach(function (h, i) {
      if (/consumo registado/.test(h)) cReg = i;
      else if (/consumo medido/.test(h)) cMed = i;
      else if (/consumo/.test(h) && cAny < 0) cAny = i;
    });
    var cC = cReg >= 0 ? cReg : (cMed >= 0 ? cMed : cAny);
    if (cC < 0) throw new Error('Não encontrámos a coluna de consumo no ficheiro da E-REDES.');
    var hc = cab[cC], fator = /kwh/.test(hc) ? 1 : 0.25; /* kW de 15 em 15 minutos -> kWh */
    var cEst = -1; for (var e = cC + 1; e < cab.length && e <= cC + 1; e++) if (/estado/.test(cab[e])) cEst = e;

    var dias = {}, n = 0, estimados = 0;
    for (var i = hi + 1; i < rows.length; i++) {
      var row = rows[i]; if (!row) continue;
      var d = lerData(row[cD]), mi = lerHora(row[cH]), v = num(row[cC]);
      if (!d || mi == null || v == null) continue;
      /* a hora marca o fim do quarto de hora */
      var ini = mi - 15;
      if (ini < 0) { d = diaAnterior(d); ini += 1440; }
      var q = Math.floor(ini / 15);
      if (q < 0 || q > 95) continue;
      if (!dias[d]) dias[d] = new Array(96);
      dias[d][q] = (dias[d][q] || 0) + Math.max(0, v) * fator;
      n++;
      if (cEst >= 0 && /estim/i.test(String(row[cEst] || ''))) estimados++;
    }
    /* So contam dias completos (pelo menos 92 quartos de hora com leitura); os dias da mudanca da hora ficam */
    var lista = Object.keys(dias).sort().filter(function (k) {
      var c = 0; for (var j = 0; j < 96; j++) if (dias[k][j] != null) c++;
      return c >= 88;
    });
    if (lista.length < 7) throw new Error('O ficheiro da E-REDES tem menos de 7 dias completos de leituras. Exporta pelo menos um mês.');

    var kwh = 0, acc = { d: { p: 0, c: 0, v: 0 }, s: { p: 0, c: 0, v: 0 } };
    var perfil = [], cont = [];
    for (var w = 0; w < 7; w++) { perfil.push(new Array(96).fill(0)); cont.push(0); }
    lista.forEach(function (k) {
      var wd = diaSemana(k); cont[wd]++;
      for (var j = 0; j < 96; j++) {
        var x = dias[k][j] || 0, h = j / 4;
        kwh += x;
        acc.d[periodoDiario(k, h)] += x;
        acc.s[periodoSemanal(k, h)] += x;
        perfil[wd][j] += x;
      }
    });
    for (w = 0; w < 7; w++) if (cont[w]) for (var j2 = 0; j2 < 96; j2++) perfil[w][j2] /= cont[w];
    var pct = function (a) { return kwh > 0 ? Math.round(a / kwh * 100) : null; };
    var cpe = (String(nome || '').match(/PT\d{16}[A-Z]{2}/i) || [null])[0];
    if (!cpe) for (var t = 0; t < hi && !cpe; t++) (rows[t] || []).forEach(function (c) { var mm = String(c || '').match(/PT\d{16}[A-Z]{2}/i); if (mm) cpe = mm[0]; });

    /* Pico de potencia: o maior consumo medio de 15 minutos (kW), para avisar se a potencia contratada parece alta */
    var pico = 0;
    lista.forEach(function (k) { for (var j = 0; j < 96; j++) { var kw = (dias[k][j] || 0) / 0.25; if (kw > pico) pico = kw; } });

    return {
      eredes: true, cpe: cpe ? cpe.toUpperCase() : null, de: lista[0], ate: lista[lista.length - 1], dias: lista.length,
      kwh: Math.round(kwh), kwhMes: Math.round(kwh / lista.length * 365.25 / 12),
      vz: { d: pct(acc.d.v), s: pct(acc.s.v) }, pt: { d: pct(acc.d.p), s: pct(acc.s.p) },
      perfil: perfil, picoKw: Math.round(pico * 100) / 100, estimados: estimados, leituras: n
    };
  }

  function ler(file) {
    var nome = file.name || '';
    if (/\.csv$/i.test(nome) || file.type === 'text/csv') {
      return file.text().then(function (t) { return processar(linhasDeCSV(t), nome); });
    }
    return Promise.all([carregarXLSX(), file.arrayBuffer()]).then(function (a) {
      var X = a[0], wb = X.read(new Uint8Array(a[1]), { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      return processar(X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }), nome);
    });
  }

  /* Medias do OMIE (EUR/MWh) por periodo horario, pesadas pelo perfil de consumo da pessoa (dia da semana x quarto de hora),
     com o mesmo formato de data/omie.json. omieQh: { 'AAAA-MM-DD': [96 precos em hora espanhola] } (data/omie_qh.json).
     Usa os ultimos 30 dias completos; os ficheiros do OMIE estao uma hora a frente de Portugal. */
  function omiePerfil(res, omieQh) {
    if (!res || !res.perfil || !omieQh) return null;
    var ks = Object.keys(omieQh).sort().filter(function (k) { return omieQh[k] && omieQh[k].length === 96 && omieQh[diaSeguinte(k)] && omieQh[diaSeguinte(k)].length === 96; });
    ks = ks.slice(-30);
    if (ks.length < 7) return null;
    var acc = { d: { p: [0, 0], c: [0, 0], v: [0, 0] }, s: { p: [0, 0], c: [0, 0], v: [0, 0] } }, tot = [0, 0];
    ks.forEach(function (k) {
      var a = omieQh[k], b = omieQh[diaSeguinte(k)], pt = a.slice(4).concat(b.slice(0, 4)), wd = diaSemana(k);
      for (var j = 0; j < 96; j++) {
        var w = res.perfil[wd][j] || 0, x = pt[j], h = j / 4;
        tot[0] += w * x; tot[1] += w;
        var A = acc.d[periodoDiario(k, h)]; A[0] += w * x; A[1] += w;
        var B = acc.s[periodoSemanal(k, h)]; B[0] += w * x; B[1] += w;
      }
    });
    var m = function (a) { return a[1] > 0 ? Math.round(a[0] / a[1] * 100) / 100 : null; };
    var out = { perfil: true, de: ks[0], ate: ks[ks.length - 1], ndias: ks.length, media: m(tot) };
    ['d', 's'].forEach(function (c) {
      var p = acc[c].p, ch = acc[c].c;
      out[c] = { fv: m([p[0] + ch[0], p[1] + ch[1]]), vz: m(acc[c].v), p: m(p), c: m(ch) };
    });
    return out;
  }

  window.LF_EREDES = { ler: ler, omiePerfil: omiePerfil, _processar: processar };
})();
