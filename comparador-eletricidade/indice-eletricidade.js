/* Índice da eletricidade do Literacia Financeira.
   Lê data/indice.json (gerado todos os dias por scripts/gerar_indice.py, no fim de atualizar_ofertas.py)
   e desenha a página com o lf-kit do Diogo. Requer lf-kit.css e lf-kit.js carregados antes.
   Raiz: o div #lf-dp (ou #lf-indice) da página. */
(function () {
  var SRC = (document.currentScript && document.currentScript.src) || "";
  var BASE = SRC ? SRC.replace(/[^\/]*(\?.*)?$/, "") : "https://franklinsilvapt-arch.github.io/comparador-eletricidade/comparador-eletricidade/";
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function eur(v) { return LFK.fmt(v); }
  function eur0(v) { return LFK.fmt(v, { decimals: 0 }); }
  function n0(v) { return LFK.fmt(v, { currency: false, decimals: 0 }); }
  function kva(v) { return LFK.fmt(v, { currency: false }) + " kVA"; }
  function dataLonga(iso) { var p = iso.split("-"); return +p[2] + " de " + MESES[+p[1] - 1] + " de " + p[0]; }
  function dataCurta(iso) { var p = iso.split("-"); return +p[2] + " " + MES_CURTO[+p[1] - 1]; }
  function mesLongo(ym) { var p = ym.split("-"); return MESES[+p[1] - 1] + " de " + p[0]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sinal(v) { return (v > 0 ? "+" : v < 0 ? "-" : "") + eur(Math.abs(v)); }

  function autores(d) {
    function a(img, label, nome, href) {
      return '<a class="lfk-author" href="' + href + '"><span class="lfk-author-img"><img src="' + img + '" alt="' + nome + '"></span><span><span class="lfk-author-sub">' + label + '</span><span class="lfk-author-name">' + nome + "</span></span></a>";
    }
    return '<div class="lfk-row" style="justify-content:center;gap:1.5rem 2rem">' +
      a("https://cdn.prod.website-files.com/67922c46c9da6bf5d9bfdf20/683ee0ae5bc67fe0ef48466e_franklin-silva.avif", "Autor", "Franklin Silva", "https://www.literaciafinanceira.pt/autores/franklin-silva") +
      a("https://cdn.prod.website-files.com/67922c46c9da6bf5d9bfdf20/683ee0f9b80a20ec1767fab5_Pedro-Braz.avif", "Revisor", "Pedro Braz", "https://www.literaciafinanceira.pt/autores/pedro-braz") +
      '<div class="lfk-author"><span><span class="lfk-author-sub">Preços da ERSE de</span><span class="lfk-author-name">' + dataLonga(d.atualizado) + "</span></span></div></div>";
  }

  function numeros(d) {
    var p2 = d.perfis[1], p1 = d.perfis[0];
    var poup = p2.regulado - p2.melhor.total;
    return '<div class="lfk-kpis">' +
      '<div class="lfk-stat is-brand"><div class="lfk-stat-l">Oferta mais barata</div><div class="lfk-stat-v">' + eur0(p2.melhor.total) + '/ano</div><div class="lfk-stat-s">' + esc(p2.melhor.comercializador) + ". Menos " + eur0(poup) + " do que o regulado</div></div>" +
      '<div class="lfk-stat"><div class="lfk-stat-l">Mediana do mercado livre</div><div class="lfk-stat-v">' + eur0(p2.mediana) + '/ano</div><div class="lfk-stat-s">' + p2.comercializadores + " comercializadores. Regulado: " + eur0(p2.regulado) + "</div></div>" +
      '<div class="lfk-stat"><div class="lfk-stat-l">Abaixo do regulado</div><div class="lfk-stat-v">' + p2.abaixo_regulado + " de " + p2.comercializadores + '</div><div class="lfk-stat-s">Comercializadores mais baratos. Casal sem filhos: ' + p1.abaixo_regulado + " de " + p1.comercializadores + "</div></div>" +
      "</div>" +
      '<p class="lfk-foot">Casal com 2 filhos (6,9 kVA e 5.000 kWh por ano), custo anual. ' + esc(d.metodo) + "</p>";
  }

  /* Diz qual é a oferta mais barata: uma só frase se for a mesma nos três tipos de casa, senão uma por casa. */
  function notaMelhor(d) {
    var ids = d.perfis.map(function (p) { return p.melhor.id; });
    if (ids.every(function (x) { return x === ids[0]; })) return "Oferta mais barata nos " + (d.perfis.length === 3 ? "três" : "dois") + " casos: " + esc(d.perfis[0].melhor.comercializador) + ", " + esc(d.perfis[0].melhor.oferta) + ".";
    return "Oferta mais barata: " + d.perfis.map(function (p) { return esc(p.label.replace(/^Casal /, "")) + ", " + esc(p.melhor.comercializador); }).join("; ") + ".";
  }
  /* Como citar: cartão igual aos outros, com a referência numa caixa e o botão de copiar ao lado. */
  function cartaoCitar(cit) {
    return '<div class="lfk-card"><div class="lfk-stack is-sm"><div class="lfk-card-head"><h2 class="lfk-h-sm">Como citar</h2></div>' +
      '<p class="lfk-small lfk-muted">Se usares estes dados num artigo, trabalho ou publicação, indica a fonte assim:</p>' +
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#f9fafb;border:1px solid #e9ecf1;border-radius:12px;padding:12px 14px">' +
      '<p class="lfk-text" id="ix-cit" style="flex:1 1 260px;margin:0">' + esc(cit) + "</p>" +
      '<button type="button" class="lfk-btn is-secondary is-sm" id="ix-copy" style="flex:0 0 auto">Copiar citação</button></div></div></div>';
  }
  function desenhar(root, d) {
    var h = '<div class="lfk"><div class="lfk-calc"><div class="lfk-stack is-lg">' + autores(d) + numeros(d);
    h += '<div class="lfk-card" id="ix-casas"><div class="lfk-card-head"><h2 class="lfk-h-sm">Custo anual por tipo de casa</h2></div><div id="ix-t-casas"></div><p class="lfk-table-note"><sup>Os três consumidores-tipo da ERSE, na tarifa simples. ' + notaMelhor(d) + " " + d.perfis[1].ofertas + " ofertas de " + d.perfis[1].comercializadores + " comercializadores, mais o mercado regulado. A mediana usa a oferta mais barata de cada comercializador, para cada um contar uma vez.</sup></p></div>";

    h += '<div class="lfk-card" id="ix-evol"><div class="lfk-card-head"><h2 class="lfk-h-sm">Evolução do custo anual</h2>' +
      '<div class="lfk-segment is-sm" id="ix-perfil">' + d.perfis.map(function (p, i) { return '<button type="button" value="' + p.id + '"' + (i === 1 ? ' aria-pressed="true"' : "") + ">" + esc(p.label.replace(/^Casal (sem|com)/, function (m, x) { return x === "sem" ? "Sem" : "Com"; })) + "</button>"; }).join("") + "</div></div>" +
      '<div class="lfk-chart-head"><div class="lfk-toggle" role="tablist"><button type="button" class="lfk-tab is-active" data-lfk-tab="g">Gráfico</button><button type="button" class="lfk-tab" data-lfk-tab="t">Tabela</button></div>' +
      '<div class="lfk-menu" data-chart="#ix-c-evol" data-table="#ix-t-evol" data-file="indice-eletricidade"></div></div>' +
      '<div data-lfk-view="g"><div class="lfk-chart is-sm"><canvas id="ix-c-evol"></canvas></div></div><div data-lfk-view="t" hidden id="ix-t-evol"></div>' +
      '<p class="lfk-table-note"><sup>Um ponto por cada ficheiro de ofertas publicado pela ERSE. A mediana muda também quando entram ou saem ofertas.</sup></p></div>';

    if (d.edicoes && d.edicoes.length > 1) h += '<div class="lfk-card"><div class="lfk-card-head"><h2 class="lfk-h-sm">Edições mensais</h2></div><div id="ix-t-ed"></div><p class="lfk-table-note"><sup>Cada edição guarda os valores do primeiro ficheiro da ERSE do mês, para o casal com 2 filhos.</sup></p></div>';

    var cit = "Literacia Financeira, Índice da eletricidade, " + mesLongo(d.atualizado.slice(0, 7)) + " (preços da ERSE de " + d.atualizado.split("-").reverse().join("/") + "). literaciafinanceira.pt/indice-eletricidade";
    h += cartaoCitar(cit);
    h += '<div><a class="lfk-link-btn" href="https://www.literaciafinanceira.pt/comparador-eletricidade">Comparar com o teu consumo <span class="lfk-btn is-icon"><span class="lfk-ico-arrow"></span></span></a></div>';
    h += '<div id="lf-alerta-el"></div>';
    h += "</div></div></div>";
    root.innerHTML = h + '<style>@media (max-width:479px){#ix-t-casas .lfk-table th,#ix-t-casas .lfk-table td{padding:10px 4px}#ix-t-casas .lfk-table th .lfk-xs{font-size:11px}#ix-t-casas .lfk-table th,#ix-t-casas .lfk-table td{min-width:0}}</style>';

    var ped = d.perfis.map(function (p) { return p; });
    /* Rótulos podem partir em duas linhas: no telemóvel as duas colunas cabem sem deslizar. */
    function lab(t) { return '<span style="white-space:normal">' + t + "</span>"; }
    function cel(v, cls) { return '<span class="lfk-strong' + (cls ? " " + cls : "") + '">' + v + "</span>"; }
    LFK.table(document.getElementById("ix-t-casas"), {
      head: [""].concat(ped.map(function (p) { return esc(p.label.replace(/^Casal /, "").replace(/^s/, "S").replace(/^c/, "C")) + '<br><span class="lfk-xs lfk-muted">' + kva(p.potencia) + '<br><span style="white-space:nowrap">' + n0(p.kwh) + " kWh</span></span>"; })),
      num: [false].concat(ped.map(function () { return false; })),
      rows: [
        [lab("Oferta mais barata")].concat(ped.map(function (p) { return cel(eur0(p.melhor.total)); })),
        [lab("Mediana do mercado livre")].concat(ped.map(function (p) { return cel(eur0(p.mediana)); })),
        [lab("Mercado regulado")].concat(ped.map(function (p) { return cel(eur0(p.regulado)); })),
        [lab("Mediana face ao regulado")].concat(ped.map(function (p) { var x = p.mediana - p.regulado; return cel((x > 0 ? "+" : x < 0 ? "-" : "") + eur0(Math.abs(x)), x > 0 ? "lfk-neg" : "lfk-pos"); })),
        [lab("Poupança máxima")].concat(ped.map(function (p) { return cel(eur0(p.regulado - p.melhor.total), "lfk-pos"); }))
      ]
    });
    var ev = document.getElementById("ix-evol");
    LFK.views(ev);
    function grafico(pid) {
      var s = d.serie.filter(function (x) { return x[pid]; });
      var c = LFK.line(document.getElementById("ix-c-evol"), {
        labels: s.map(function (x) { return dataCurta(x.data); }), money: eur,
        datasets: [
          { label: "Mercado regulado", data: s.map(function (x) { return x[pid].regulado; }) },
          { label: "Mediana do mercado livre", data: s.map(function (x) { return x[pid].mediana; }) },
          { label: "Oferta mais barata", data: s.map(function (x) { return x[pid].melhor; }) }
        ]
      });
      if (c && c.then) c.then(function (ch) {
        ch.options.scales.y.ticks.callback = function (v) { return eur0(v); };
        ch.data.datasets.forEach(function (ds) { ds.pointRadius = 3; ds.tension = 0; });
        ch.update("none");
      });
      LFK.table(document.getElementById("ix-t-evol"), {
        head: ["Data", "Regulado", "Mediana", "Mais barata"], num: [false, true, true, true],
        rows: s.slice().reverse().map(function (x) { return [dataLonga(x.data), eur(x[pid].regulado), eur(x[pid].mediana), eur(x[pid].melhor)]; })
      });
    }
    grafico(d.perfis[1].id);
    document.getElementById("ix-perfil").addEventListener("change", function (e) { grafico(e.detail.value); });

    var ted = document.getElementById("ix-t-ed");
    if (ted) LFK.table(ted, {
      head: ["Edição", "Mais barata", "Mediana", "Regulado"], num: [false, true, true, true],
      rows: d.edicoes.slice().reverse().map(function (x) { var p = x.p2; return [mesLongo(x.mes), eur(p.melhor), eur(p.mediana), eur(p.regulado)]; })
    });

    LFK.menus(root);
    if (window.LFAlerta) window.LFAlerta();
    var b = document.getElementById("ix-copy");
    b.addEventListener("click", function () {
      var t = document.getElementById("ix-cit").textContent;
      function ok() { b.textContent = "Copiado"; setTimeout(function () { b.textContent = "Copiar citação"; }, 2000); }
      function sel() { var r = document.createRange(); r.selectNodeContents(document.getElementById("ix-cit")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      try { navigator.clipboard.writeText(t).then(ok, sel); } catch (e) { sel(); }
    });
    if (window.ScrollTrigger && window.ScrollTrigger.refresh) window.ScrollTrigger.refresh();
  }

  function iniciar() {
    var root = document.getElementById("lf-indice") || document.getElementById("lf-dp");
    if (!root || !window.LFK) return;
    root.innerHTML = '<div class="lfk"><div class="lfk-empty"><p>A carregar o índice...</p></div></div>';
    fetch(BASE + "data/indice.json?v=" + Math.floor(Date.now() / 600000))
      .then(function (r) { return r.json(); })
      .then(function (d) { desenhar(root, d); })
      .catch(function () { root.innerHTML = '<div class="lfk"><div class="lfk-alert is-err">Não foi possível carregar o índice. Atualiza a página dentro de alguns minutos.</div></div>'; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
