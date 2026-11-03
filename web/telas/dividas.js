"use strict";
// ---------------------------------------------------------------- endividamento (base)
async function carregarDividas() {
  estado.divEmpresas = "todas";                                  // sempre a soma de todas as empresas; não há filtro por empresa
  estado.divImportacoes = await api("GET", "/api/dividas/importacoes");
  estado.dividas = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/dividas?empresas=${estado.divEmpresas}`) : null;
  if (estado.dividas) estado.divEmpresas = estado.dividas.empresas;     // vazio = começa pela empresa de maior dívida
  estado.divContratos = null;
  const d = estado.dividas;
  estado.capt = estado.vid && ["investimentos", "captacoes", "geral"].includes(estado.divAba) ? await api("GET", `/api/versoes/${estado.vid}/captacoes`) : null;
  estado.fluxo = estado.vid && ["capital", "geral"].includes(estado.divAba) ? await api("GET", `/api/versoes/${estado.vid}/fluxo-caixa`) : estado.fluxo;      // dívida de giro automática (necessidade de capital de giro)
  estado.divBalanco = null;
  estado.divMensalAnos = null;
  if (d && d.importacao && ["resumo", "geral"].includes(estado.divAba)) {
    estado.divBalanco = await api("GET", `/api/versoes/${estado.vid}/dividas/balanco?empresas=${estado.divEmpresas}`);
    estado.divPorEmpresa = [];                                  // saldo de cada empresa na primeira data (independe das marcadas)
    for (const e of d.empresas_disponiveis || []) {
      const b = await api("GET", `/api/versoes/${estado.vid}/dividas/balanco?empresas=${encodeURIComponent(e.sigla)}`);
      const y0 = b.anos[0];
      estado.divPorEmpresa.push({ sigla: e.sigla, total: b.total[y0] || 0, curto: b.curto_total[y0] || 0, longo: b.longo_total[y0] || 0 });
    }
  }
}

function htmlDividas() {
  const d = estado.dividas, im = estado.divImportacoes;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para ligar uma base de dívidas.</div>`;
  const dt = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const m0 = (v) => (v ? rs(v) : "–");
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> A base de dívidas desta versão não muda.</div>` : "";
  const atual = d.importacao;
  const opcoes = im.importacoes.map((i) => `<option value="${i.id}" ${atual && i.id === atual.id ? "selected" : ""}>#${i.id} · ${esc(i.arquivo)} · ${dt(i.importado_em)} · ${i.qtd_abertos} abertos</option>`).join("");
  const acoes = trava() ? "" : `<div class="linha">
      <button class="prim" id="btn-div-padrao" ${im.arquivo_padrao_existe ? "" : "disabled"} title="${esc(im.arquivo_padrao)}">Importar do sistema de Endividamento</button>
      <button class="sec" id="btn-div-arquivo">Escolher arquivo…</button>
      <input type="file" id="inp-div-arquivo" accept=".xlsx" hidden>
      ${im.arquivo_padrao_existe ? "" : `<span class="dim">Arquivo padrão não encontrado: ${esc(im.arquivo_padrao)}</span>`}</div>`;
  const base = `<div class="card"><h2>Base de dívidas</h2>
    <p class="dim">Vem do arquivo <em>Endividamento alterado.xlsx</em>, gerado pelo sistema de Endividamento. Cada importação é guardada, e a versão usa uma delas.</p>${acoes}
    ${atual ? `<div class="linha"><label>Base usada nesta versão <select id="sel-div-base" ${trava() ? "disabled" : ""}>${opcoes}</select></label>
      <span class="dim">${atual.qtd_titulos} títulos (${atual.qtd_abertos} em aberto) · importada em ${dt(atual.importado_em)}</span></div>
      ${atual.avisos.length ? `<ul class="dim" style="margin:6px 0 0">${atual.avisos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`
      : `<p class="pos">Esta versão ainda não tem base de dívidas.${trava() ? "" : " Clique em Importar."}</p>
      ${im.importacoes.length ? `<div class="linha"><label>Usar uma importação anterior <select id="sel-div-base"><option value="">— escolha —</option>${opcoes}</select></label></div>` : ""}`}</div>`;
  if (!atual) return aviso + base;          // sem base: só esta tela, a importação é obrigatória
  // com base: a tela da base some; fica um botão discreto no topo que a reabre para reimportar
  const barra = `<div class="div-barra"><span class="dim">Base #${atual.id} · ${esc(atual.arquivo)} · importada em ${dt(atual.importado_em)}</span>
    ${trava() ? "" : `<button class="sec peq" data-div-base-toggle>${icone("atualizar", 14)} ${estado.divBaseAberta ? "Fechar" : "Atualizar base"}</button>`}</div>`;
  const abas = `<div class="abas" style="padding:12px 0 0">
      <button data-div-aba="resumo" class="${estado.divAba === "resumo" ? "ativa" : ""}">Dívidas vigentes</button>
      <button data-div-aba="investimentos" class="${estado.divAba === "investimentos" ? "ativa" : ""}">Novas captações para investimentos</button>
      <button data-div-aba="captacoes" class="${estado.divAba === "captacoes" ? "ativa" : ""}">Novas captações</button>
      <button data-div-aba="capital" class="${estado.divAba === "capital" ? "ativa" : ""}">Necessidade de capital de giro</button>
      <button data-div-aba="geral" class="${estado.divAba === "geral" ? "ativa" : ""}">Resumo geral</button></div>`;
  const corpo = { resumo: () => htmlDividasResumo(d), investimentos: htmlDividasInvestimentos, captacoes: htmlCaptacoes, capital: htmlDividasCapitalGiro, geral: () => htmlDividasGeral(d) }[["investimentos", "captacoes", "capital", "geral"].includes(estado.divAba) ? estado.divAba : "resumo"]();
  return aviso + barra + (estado.divBaseAberta && !trava() ? base : "") + abas + corpo;
}

function empresasSelecionadas(d) {
  const disp = (d.empresas_disponiveis || []).map((e) => e.sigla);
  if (d.empresas === "todas") return new Set(disp);
  return new Set(String(d.empresas).split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
}

function rotuloEmpresas(d) {
  const disp = (d.empresas_disponiveis || []).map((e) => e.sigla), sel = [...empresasSelecionadas(d)];
  if (disp.length && disp.every((x) => sel.includes(x))) return "Todas as empresas (soma)";
  return sel.length > 1 ? `${sel.join(" + ")} (soma)` : `Empresa ${sel[0] || ""}`;
}

const dvMi = (v) => rs(v);
const dvMil = (v) => (Math.abs(v) < 500 ? "–" : rs(v));

// gráfico de barras do saldo por ano (SVG): eixo em R$ mi
function graficoEvolucaoDivida(anos, saldo, rot = (y) => y, dica = (y, v) => `31/12/${y}: ${dvMi(v)}`) {
  const mx = Math.max(...anos.map((y) => saldo[y]), 1) / 1e6, passo = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find((p) => mx / p <= 5) || 5000;
  const topo = Math.ceil(mx / passo) * passo, ticks = []; for (let t = 0; t <= topo; t += passo) ticks.push(t);
  const L = 62, R = 8, T = 10, B = 26, W = 520, H = 230, area = H - T - B, larg = (W - L - R) / anos.length;
  const y = (v) => T + area - (v / topo) * area;
  const grade = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e6ece8"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5d6f66">R$ ${t} mi</text>`).join("");
  const barras = anos.map((a, i) => { const v = saldo[a] / 1e6, h = Math.max((v / topo) * area, v > 0 ? 2 : 0), x = L + i * larg + larg * 0.18;
    return `<rect x="${x}" y="${y(v)}" width="${larg * 0.64}" height="${h}" rx="2" fill="#0f6a43"><title>${dica(a, saldo[a])}</title></rect>
      <text x="${x + larg * 0.32}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5d6f66">${rot(a)}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolução do saldo da dívida">${grade}${barras}</svg>`;
}

function htmlDividasResumo(d) {
  const b = estado.divBalanco;
  const filtro = "";
  if (!b || !b.anos.length) return filtro + `<div class="card vazio">Nenhum título em aberto com vencimento para estas empresas.</div>`;
  const y0 = b.anos[0], y1 = b.anos[1];
  const ultimo = Math.max(b.anos[b.anos.length - 1], ...(d.anos_versao || [y0]));         // a tabela cobre todo o horizonte do orçamento; depois do último vencimento o saldo é zero
  const anosTodos = Array.from({ length: ultimo - y0 + 1 }, (_, i) => y0 + i), proj = anosTodos.slice(1);
  const tot = (y) => b.total[y] || 0;
  const saldoIni = (y) => tot(y - 1), amort = (y) => tot(y - 1) - tot(y), juros = (y) => b.juros_total[y] || 0;
  const curto0 = b.curto_total[y0], longo0 = b.longo_total[y0], tot0 = b.total[y0], pct = (v) => (tot0 > 0 ? (v / tot0) * 100 : 0);

  const kpis = `<div class="dv-kpis">
    <div class="kpi-grafico">${cabecaCartao("layers", `Composição da dívida (31/12/${y0})`)}
      <div class="faixa">
        <div class="trecho" style="flex:${curto0} 1 0;background:#0e5c3f;color:#fff"><span class="trecho-rot">${pct(curto0) >= 9 ? num(pct(curto0), 1) + "%" : ""}</span><div class="trecho-dica"><b><i style="background:#0e5c3f"></i>Curto prazo</b><span>${dvMi(curto0)} (${num(pct(curto0), 1)}%)</span></div></div>
        <div class="trecho tip-dir" style="flex:${longo0} 1 0;background:#b7e36a;color:#17261f"><span class="trecho-rot">${pct(longo0) >= 9 ? num(pct(longo0), 1) + "%" : ""}</span><div class="trecho-dica"><b><i style="background:#b7e36a"></i>Longo prazo</b><span>${dvMi(longo0)} (${num(pct(longo0), 1)}%)</span></div></div>
      </div>
      <div class="legenda-faixa"><span><i style="background:#0e5c3f"></i>Curto prazo: ${dvMi(curto0)}</span><span><i style="background:#b7e36a"></i>Longo prazo: ${dvMi(longo0)}</span></div></div></div>`;

  const linhas = proj.map((y, i) => `<tr class="${i === 0 ? "faixa-verde" : ""}"><td>${y}</td><td>${dvMil(saldoIni(y))}</td><td>${dvMil(amort(y))}</td><td>${dvMil(juros(y))}</td><td>${dvMil(tot(y))}</td></tr>`).join("");
  const somaAm = proj.reduce((t, y) => t + amort(y), 0), somaJu = proj.reduce((t, y) => t + juros(y), 0);
  const projecao = `<div class="card">${cabecaCartao("arquivo", "Projeção da dívida e juros por ano")}
    <div class="scroll"><table class="grade dv"><thead><tr><th>Ano</th><th>Saldo inicial</th><th>Amortizações (principal)</th><th>Juros</th><th>Saldo final</th></tr></thead>
    <tbody>${linhas}<tr class="total"><td>Total</td><td>–</td><td>${dvMil(somaAm)}</td><td>${dvMil(somaJu)}</td><td>–</td></tr></tbody></table></div></div>`;

  const emp = estado.divPorEmpresa || [], soma = (k) => emp.reduce((t, e) => t + e[k], 0), totEmp = soma("total");
  const porEmpresa = emp.length ? `<div class="card">${cabecaCartao("orcamento", `Endividamento por empresa (31/12/${y0})`)}
    <div class="scroll"><table class="grade dv"><thead><tr><th>Empresa</th><th>Saldo total</th><th>Curto prazo</th><th>Longo prazo</th><th>Part.</th></tr></thead><tbody>
      ${emp.map((e) => `<tr><td><strong>${esc(e.sigla)}</strong></td><td>${dvMi(e.total)}</td><td>${dvMi(e.curto)}</td><td>${dvMi(e.longo)}</td><td>${num(totEmp > 0 ? (e.total / totEmp) * 100 : 0, 1)}%</td></tr>`).join("")}
      <tr class="total"><td>Total</td><td>${dvMi(totEmp)}</td><td>${dvMi(soma("curto"))}</td><td>${dvMi(soma("longo"))}</td><td>100,0%</td></tr></tbody></table></div></div>` : "";

  const porTipo = `<div class="card">${cabecaCartao("layers", "Detalhamento da dívida por prazo e tipo")}${htmlBalancoDividas()}</div>`;
  return filtro + kpis + `<div class="dv-grade"><div>${projecao}</div></div>${porTipo}${porEmpresa ? `<div class="dv-linha-emp">${porEmpresa}</div>` : ""}`;
}

function htmlBalancoDividas() {
  const b = estado.divBalanco;
  if (!b || !b.anos.length) return "";
  const m0 = (v) => (Math.abs(v) < 0.5 ? "–" : rs(v));
  const ab = estado.divAbertos;
  const celulas = (f) => b.anos.map((y) => `<td>${m0(f(y))}</td>`).join("");
  const icTipo = (t) => { const n = String(t).toLowerCase(); return /giro/.test(n) ? "atualizar" : /invest/.test(n) ? "chart" : "layers"; };
  const seta = (aberto) => `<svg class="dv-seta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${aberto ? '<path d="M6 9l6 6 6-6"/>' : '<path d="M9 6l6 6-6 6"/>'}</svg>`;
  // linha do grupo com seta para abrir a abertura por tipo
  const grupo = (chave, rotulo, tot, porTipo, dica = "") => {
    const aberto = !!ab[chave];
    const cab = `<tr class="dv-grupo"><td><button class="dv-toggle" data-div-toggle="${chave}" title="${aberto ? "Fechar" : "Abrir"} por tipo">${seta(aberto)}<span>${rotulo}</span></button>${dica ? ` <span class="dim peq-txt">${dica}</span>` : ""}</td>${celulas((y) => tot[y])}</tr>`;
    const filhas = aberto ? b.tipos.map((t) => `<tr class="dv-filha"><td><span class="dv-ic">${icone(icTipo(t), 18)}</span>${esc(t)}</td>${celulas((y) => porTipo[t][y])}</tr>`).join("") : "";
    return cab + filhas;
  };
  const cab = `<thead><tr><th>Tipo / Detalhamento</th>${b.anos.map((y) => `<th>31/12/${y}</th>`).join("")}</tr></thead>`;
  const jab = !!ab.juros;
  const jfilhas = jab ? b.tipos.map((t) => `<tr class="dv-filha"><td><span class="dv-ic">${icone(icTipo(t), 18)}</span>${esc(t)}</td>${celulas((y) => b.juros[t][y])}</tr>`).join("") : "";
  return `<div class="dv-det"><div class="scroll"><table class="dv-tab">${cab}<tbody>
      ${grupo("curto", "Curto prazo", b.curto_total, b.curto)}
      ${grupo("longo", "Longo prazo", b.longo_total, b.longo)}
      <tr class="dv-total"><td>Total da dívida</td>${celulas((y) => b.total[y])}</tr></tbody></table></div>
    <div class="scroll"><table class="dv-tab dv-juros"><tbody>
      <tr class="dv-grupo dv-jur"><td><button class="dv-toggle" data-div-toggle="juros" title="${jab ? "Fechar" : "Abrir"} por tipo"><span class="dv-ic dv-ic-g">${icone("percentual", 22)}</span><span>Juros do ano<small>(custo da dívida)</small></span>${seta(jab)}</button></td>${celulas((y) => b.juros_total[y])}</tr>${jfilhas}</tbody></table></div>
    ${b.sem_vencimento ? `<p class="pos peq-txt">${b.sem_vencimento.titulos} título(s) sem vencimento (${rs(b.sem_vencimento.valor)}) ficaram de fora.</p>` : ""}</div>`;
}

// Resumo geral: o que será pago por ano somando as dívidas vigentes (base importada) e as novas captações (R$ mil)
function graficoPagamentos(anos, principal, juros) {
  const tot = anos.map((y) => principal[y] + juros[y]), mx = Math.max(...tot, 1), passo = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000].find((p) => mx / p <= 5) || 1000000;
  const topo = Math.ceil(mx / passo) * passo, ticks = []; for (let t = 0; t <= topo; t += passo) ticks.push(t);
  const L = 104, R = 8, T = 10, B = 26, W = 560, H = 230, area = H - T - B, larg = (W - L - R) / anos.length, y = (v) => T + area - (v / topo) * area;
  const grade = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e6ece8"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5d6f66">${rs(t * 1000)}</text>`).join("");
  const barras = anos.map((a, i) => { const x = L + i * larg + larg * 0.18, w = larg * 0.64, hp = (principal[a] / topo) * area, hj = (juros[a] / topo) * area;
    return `<rect x="${x}" y="${y(principal[a])}" width="${w}" height="${hp}" fill="#0f6a43"><title>${a} · principal: ${rs(principal[a] * 1000)}</title></rect>
      <rect x="${x}" y="${y(principal[a]) - hj}" width="${w}" height="${hj}" rx="2" fill="#b7e36a"><title>${a} · juros: ${rs(juros[a] * 1000)}</title></rect>
      <text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5d6f66">${a}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Pagamento por ano">${grade}${barras}</svg>
    <div class="legenda-faixa"><span><i style="background:#0f6a43"></i>Principal</span><span><i style="background:#b7e36a"></i>Juros</span></div>`;
}

function htmlDividasGeral(d) {
  const b = estado.divBalanco, c = estado.capt, fx = estado.fluxo;
  const filtro = "";
  if (!b || !c) return filtro + `<div class="card vazio">Carregando…</div>`;
  const anos = c.anos, y0 = b.anos[0], mil = (v) => v / 1000;                         // a base importada vem em R$; o resto, em R$ mil
  const giro = (id) => { const l = fx && fx.linhas ? fx.linhas.flatMap((sc) => sc.linhas).find((x) => x.id === id) : null; return (y) => (l ? l.valores[y] || 0 : 0); };
  const varGiro = giro("variacao"), jurGiro = giro("juros");
  const linhasP = [["Dívidas vigentes", (y) => (y <= y0 ? 0 : mil((b.total[y - 1] || 0) - (b.total[y] || 0)))], ["Financiamento dos investimentos", (y) => c.resumo.invest.amort[y] || 0],
                   ["Novas captações", (y) => c.resumo.giro.amort[y] || 0], ["Necessidade de capital de giro", (y) => Math.max(-varGiro(y), 0)]];
  const linhasJ = [["Dívidas vigentes", (y) => mil(b.juros_total[y] || 0)], ["Financiamento dos investimentos", (y) => c.resumo.invest.juros[y] || 0],
                   ["Novas captações", (y) => c.resumo.giro.juros[y] || 0], ["Necessidade de capital de giro", (y) => jurGiro(y)]];
  const f0 = (v) => (Math.abs(v) < 0.5 ? "–" : rs(v * 1000));
  const tot = (lista) => (y) => lista.reduce((t, [, f]) => t + f(y), 0);
  const totP = tot(linhasP), totJ = tot(linhasJ);
  const bloco = (titulo, lista, totalNome, total) => `<tr><td colspan="${anos.length + 1}" class="dv-secao">${titulo}</td></tr>
    ${lista.map(([n, f]) => `<tr><td style="padding-left:20px">${esc(n)}</td>${anos.map((y) => `<td>${f0(f(y))}</td>`).join("")}</tr>`).join("")}
    <tr class="total"><td>${totalNome}</td>${anos.map((y) => `<td>${f0(total(y))}</td>`).join("")}</tr>`;
  return filtro + `<div class="card">${cabecaCartao("arquivo", "Resumo geral · o que será pago por ano")}
    <div class="scroll"><table class="grade"><thead><tr><th></th>${anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${bloco("Principal a pagar", linhasP, "Total do principal", totP)}
      ${bloco("Juros a pagar", linhasJ, "Total dos juros", totJ)}
      <tr class="total dv-total-geral"><td>Total a pagar (principal + juros)</td>${anos.map((y) => `<td>${f0(totP(y) + totJ(y))}</td>`).join("")}</tr></tbody></table></div></div>`;
}

// novas captações para investimentos: o que foi lançado nas Premissas de investimento, resumido
function htmlDividasInvestimentos() {
  const c = estado.capt;
  if (!c) return `<div class="card vazio">Carregando…</div>`;
  const f0 = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "–" : rs(v * 1000));
  const lista = c.captacoes.filter((x) => x.origem !== "cadastro");
  const prem = c.premissas.filter((p) => p.campo !== "efetiva" || true);
  const porTipo = {};                                              // uma linha por tipo de investimento, somando os financiamentos de cada ano
  for (const x of lista) { const n = x.nome.replace(/ · financiamento \d+$/, ""); (porTipo[n] = porTipo[n] || {})[x.ano] = (porTipo[n][x.ano] || 0) + x.valor; }
  const tranches = lista.length ? `<div class="scroll"><table class="grade cap"><thead><tr><th>Financiamento</th>${c.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${Object.entries(porTipo).map(([n, v]) => `<tr><td><strong>${esc(n)}</strong></td>${c.anos.map((y) => `<td>${v[y] ? `<strong>${f0(v[y])}</strong>` : '<span class="dim">–</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<div class="vazio-pontilhado">${icone("moedas", 34)}<p>Nenhum financiamento lançado. Digite o valor financiado em <a href="#" data-modulo="invest">Premissas de investimento</a>.</p></div>`;
  const r = c.resumo.invest;
  const linhas = [["Captado no ano", r.captado], ["Amortização do principal", r.amort], ["Saldo da dívida em 31/12", r.saldo, true], ["curto prazo", r.curto, false, true], ["longo prazo", r.longo, false, true], ["Juros do ano", r.juros]];
  const premissas = c.premissas.filter((p) => ["taxa", "prazo", "carencia"].includes(p.campo));
  return `<div class="card">${cabecaCartaoGrande("moedas", "Novas captações para investimentos", "", `<a class="sec" href="#" data-modulo="invest" style="padding:8px 14px;border-radius:10px">Editar em Premissas de investimento</a>`)}${tranches}</div>
    ${lista.length ? `<div class="card">${cabecaCartaoGrande("calculadora", "Premissas do financiamento")}
      <div class="scroll"><table class="grade"><thead><tr><th></th>${c.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${premissas.map((p) => `<tr><td>${esc(p.nome)} <span class="dim">(${esc(p.unidade)})</span></td>${c.anos.map((y) => `<td>${p.valores[y] ? num(p.valores[y], p.campo === "taxa" ? 2 : 0) : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
    <div class="card">${cabecaCartaoGrande("layers", "Cronograma do financiamento")}
      <div class="scroll"><table class="grade"><thead><tr><th></th>${c.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${linhas.map(([n, v, tot, dim]) => `<tr class="${tot ? "total" : ""}"><td style="padding-left:${dim ? 20 : 8}px" class="${dim ? "dim" : ""}">${n}</td>${c.anos.map((y) => `<td class="${dim ? "dim" : ""}">${f0(v[y])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>` : ""}`;
}

// necessidade de capital de giro: o que o sistema precisa captar no banco para o caixa não ficar abaixo do mínimo
// Necessidade de captação: do caixa disponível, desconta o caixa mínimo; o que faltar é o que o sistema capta na dívida de giro
function htmlNecessidadeCaptacao(d, sc) {
  if (!sc) return "";
  const L = Object.fromEntries(sc.linhas.map((l) => [l.id, l])), anos = d.anos, v = (id, y) => L[id].valores[y] || 0;
  const disp = (y) => v("caixa_ini", y) + v("antes", y), folga = (y) => disp(y) - v("minimo", y);
  const capt = (y) => Math.max(0, v("variacao", y)), amort = (y) => Math.max(0, -v("variacao", y));
  const anosCapt = anos.filter((y) => capt(y) > 0.5), maior = anosCapt.reduce((m, y) => (capt(y) > capt(m) ? y : m), anosCapt[0]);
  const ult = anos[anos.length - 1], menor = anos.reduce((m, y) => (folga(y) < folga(m) ? y : m), anos[0]);
  const total = anosCapt.reduce((t, y) => t + capt(y), 0);
  const msg = anosCapt.length
    ? `<div class="cg-msg cg-alerta"><strong>Haverá necessidade de captar ${rs(total * 1000)} no horizonte</strong>, em ${anosCapt.join(", ")}. A maior é em ${maior}: ${rs(capt(maior) * 1000)}.</div>`
    : `<div class="cg-msg cg-ok"><strong>Não há necessidade de captar capital de giro.</strong> O caixa fica acima do mínimo em todos os anos; a menor folga é de ${rs(folga(menor) * 1000)} em ${menor}.</div>`;
  const num0 = (x) => (Math.abs(x) < 0.5 ? "–" : rs(x * 1000));
  const lin = (nome, f, cls = "", ajuda = "") => `<tr class="${cls}"><td style="padding-left:20px">${nome}${ajuda ? icPop({ explicacao: ajuda }) : ""}</td>${anos.map((y) => `<td class="${f(y) < -0.5 ? "pos" : ""}">${num0(f(y))}</td>`).join("")}</tr>`;
  return `<div class="card">${cabecaCartaoGrande("layers", "Necessidade de captação de capital de giro")}${msg}
    <div class="scroll"><table><thead><tr><th>Como se chega à necessidade (R$)</th>${anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${lin("Caixa no início do ano", (y) => v("caixa_ini", y))}
      ${lin("(+/−) Variação do caixa antes da dívida de giro", (y) => v("antes", y), "", L.antes.explicacao)}
      ${lin("Caixa disponível antes da captação", disp, "total")}
      ${lin("(−) Caixa mínimo exigido", (y) => -v("minimo", y), "", L.minimo.explicacao)}
      ${lin("Folga (+) / falta (−) de caixa", folga, "total")}
      ${lin("Necessidade de captação no ano", capt, "cg-destaque", "Valor que o sistema capta como dívida de giro quando o caixa ficaria abaixo do mínimo.")}
      ${lin("(−) Amortização da dívida de giro", (y) => -amort(y), "", "Quando há sobra de caixa, ela amortiza o saldo da dívida de giro.")}
      ${lin("Caixa no fim do ano", (y) => v("caixa_fim", y), "total", L.caixa_fim.explicacao)}
      ${lin("Saldo da dívida de giro em 31/12", (y) => v("divida", y), "", L.divida.explicacao)}
      ${lin("Juros da dívida de giro", (y) => v("juros", y), "", L.juros.explicacao)}
    </tbody></table></div></div>`;
}

function htmlDividasCapitalGiro() {
  const d = estado.fluxo;
  if (!d) return `<div class="card vazio">Carregando…</div>`;
  if (!d.estrutura) return `<div class="card vazio">O fluxo de caixa usa as contas do balanço. Importe a estrutura do Fechamento Contábil na tela <a href="#" data-modulo="dre">DRE</a>.</div>`;
  const dis = trava() ? "disabled" : "";
  const origem = d.premissas.find((p) => p.campo === "origem"), taxa = d.premissas.find((p) => p.campo === "taxa"), efetiva = d.premissas.find((p) => p.campo === "efetiva");
  const secao = d.linhas.filter((sc) => sc.titulo === "Caixa e dívida de giro automática");
  return `<div class="card">${cabecaCartaoGrande("calculadora", "Taxa de juros da necessidade de capital de giro")}
      <div class="scroll"><table><thead><tr><th>Premissa</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>
        <tr><td>${esc(origem.nome)}</td>${d.anos.map((y) => `<td><select ${dis} data-fx="origem" data-ano="${y}" style="max-width:190px">${origem.opcoes.map((o) => `<option value="${o.id}" ${origem.valores[y] === o.id ? "selected" : ""}>${esc(o.nome)}</option>`).join("")}</select></td>`).join("")}
          <td>${trava() ? "" : `<select id="rfx-origem">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select> <button class="sec" data-fx-replicar="origem">Replicar →</button>`}</td></tr>
        <tr><td>${esc(taxa.nome)}</td>${d.anos.map((y) => `<td><input type="number" step="any" min="0" max="100" ${dis} data-fx="taxa" data-ano="${y}" value="${taxa.valores[y] || ""}" ${origem.valores[y] ? "disabled" : ""}></td>`).join("")}
          <td>${trava() ? "" : `<select id="rfx-taxa">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select> <button class="sec" data-fx-replicar="taxa">Replicar →</button>`}</td></tr>
        <tr class="total"><td>${esc(efetiva.nome)}</td>${d.anos.map((y) => `<td>${num(efetiva.valores[y], 2)}%</td>`).join("")}<td></td></tr></tbody></table></div></div>
    ${htmlNecessidadeCaptacao(d, secao[0])}`;
}

function htmlDividasContratos() {
  const c = estado.divContratos;
  if (!c) return `<div class="card vazio">Carregando contratos…</div>`;
  const d = estado.dividas;
  const m0 = (v) => (v ? rs(v) : "–");
  const data = (iso) => (iso ? iso.split("-").reverse().join("/") : "–");
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const comMeses = !!estado.divAnoFiltro;                 // grade mensal só quando um ano está escolhido
  const filtros = `<div class="linha">
      
      <label>Ano de vencimento <select id="sel-ctr-ano"><option value="">Todos</option>
        ${c.anos.map((a) => `<option ${String(a) === String(estado.divAnoFiltro) ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <label>Dívida <select id="sel-ctr-grupo"><option value="">Todas</option>
        <option value="capital_giro" ${estado.divGrupo === "capital_giro" ? "selected" : ""}>Capital de giro / custeio</option>
        <option value="investimento" ${estado.divGrupo === "investimento" ? "selected" : ""}>Investimento</option></select></label>
      <span class="dim">${c.linhas.length} título(s) em aberto${comMeses ? " · grade mensal do ano escolhido à direita" : " · escolha um ano para ver a grade mensal"}</span></div>`;
  const nCols = 13 + (comMeses ? 12 : 0);
  const soma = (ls) => ({ p: ls.reduce((s, l) => s + l.principal, 0), j: ls.reduce((s, l) => s + l.juros, 0), b: ls.reduce((s, l) => s + l.bruto, 0) });
  const mesesDe = (ls) => { const v = new Array(12).fill(0); ls.forEach((l) => { if (l.data_vencimento) v[Number(l.data_vencimento.slice(5, 7)) - 1] += l.bruto; }); return v; };
  const celMeses = (l) => { if (!comMeses) return ""; const m = l.data_vencimento ? Number(l.data_vencimento.slice(5, 7)) - 1 : -1;
    return MESES.map((_, i) => `<td>${i === m ? m0(l.bruto) : ""}</td>`).join(""); };
  const linhaTotal = (rot, ls, cls) => { const t = soma(ls);
    return `<tr class="${cls}"><td colspan="10">${rot}</td><td>${m0(t.p)}</td><td>${m0(t.j)}</td><td>${m0(t.b)}</td>${comMeses ? mesesDe(ls).map((v) => `<td>${m0(v)}</td>`).join("") : ""}</tr>`; };
  const grupos = new Map();
  c.linhas.forEach((l) => { const k = l.data_vencimento ? l.data_vencimento.slice(0, 4) : "sem"; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(l); });
  const corpo = [...grupos.entries()].map(([k, ls]) => ls.map((l) => `<tr>
      <td>${esc(l.empresa)}</td><td>${esc(l.tipo)}</td><td>${l.taxa === null ? "–" : num(l.taxa * 100, 2) + "%"}</td><td>${esc(l.banco)}</td><td title="${esc(l.linha_credito)}">${esc(l.linha_credito)}</td>
      <td title="${esc(l.produto)}">${esc(l.produto)}</td><td title="${esc(l.documento)}">${esc(l.documento)}</td><td>${data(l.data_operacao)}</td><td>${data(l.data_vencimento)}</td><td>${k === "sem" ? "–" : k}</td>
      <td>${m0(l.principal)}</td><td>${m0(l.juros)}</td><td>${m0(l.bruto)}</td>${celMeses(l)}</tr>`).join("")
      + linhaTotal(k === "sem" ? "Sem vencimento · Total" : `${Number(k).toLocaleString("pt-BR")} · Total`, ls, "total")).join("");
  const rodape = c.linhas.length ? linhaTotal("Total geral", c.linhas, "total") : `<tr><td colspan="${nCols}" class="dim">Nenhum título em aberto com estes filtros.</td></tr>`;
  return `<div class="card"><h2>Contratos em aberto</h2>
    <p class="dim">No formato da aba Endividamento da planilha de orçamento: uma linha por título, com totais por ano de vencimento. Principal e juros vêm do sistema de Endividamento; <strong>Valor futuro</strong> = principal + juros + outras despesas.</p>${filtros}
    <div class="scroll" style="max-height:70vh;overflow:auto"><table class="planilha"><thead><tr><th>Empresa</th><th>Dívida</th><th>% Juros</th><th>Banco</th><th>Linha Cred.</th><th>Descrição do bem</th><th>Contrato</th><th>Data oper.</th><th>Vencimento</th><th>Ano venc.</th>
      <th>Vr. Principal</th><th>Juros</th><th>Valor futuro</th>${comMeses ? MESES.map((m) => `<th>${m}/${String(estado.divAnoFiltro).slice(2)}</th>`).join("") : ""}</tr></thead>
    <tbody>${corpo}${rodape}</tbody></table></div></div>`;
}

async function enviarArquivoDividas(arquivo) {
  const url = `/api/dividas/importar?arquivo=${encodeURIComponent(arquivo.name)}&versao_id=${estado.vid}`;
  const r = await fetchApi(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: arquivo });
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new Error((dados && (dados.erro || dados.detail)) || `Erro ${r.status}`);
  return dados;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "dividas") return;
  seguro(async () => {
    if (t.id === "inp-div-arquivo") {
      const f = t.files[0]; if (!f) return;
      const r = await enviarArquivoDividas(f);
      estado.divBaseAberta = false;
      await recarregar(); mostrar(`Base importada: ${r.titulos} títulos (${r.abertos} em aberto).`, true);
    } else if (t.id === "sel-div-base") {
      await api("PUT", `/api/versoes/${estado.vid}/divida-importacao`, { importacao_id: t.value ? Number(t.value) : null });
      estado.divBaseAberta = false;
      await recarregar(); mostrar("Base de dívidas da versão atualizada.", true);
    }
    else if (t.id === "sel-div-medida") { estado.divMedida = t.value; desenhar(); }
    else if (t.id === "sel-ctr-ano") { estado.divAnoFiltro = t.value; await recarregar(); }
    else if (t.id === "sel-ctr-grupo") { estado.divGrupo = t.value; await recarregar(); }
  });
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "dividas") return;
  seguro(async () => {
    if (t.id === "btn-div-padrao") {
      const r = await api("POST", `/api/dividas/importar-padrao?versao_id=${estado.vid}`);
      estado.divBaseAberta = false;
      await recarregar(); mostrar(`Base importada: ${r.titulos} títulos (${r.abertos} em aberto).`, true);
    } else if (t.dataset.divAno) { estado.divMensalAno = Number(t.dataset.divAno); desenhar();
    } else if (t.hasAttribute("data-div-base-toggle")) { estado.divBaseAberta = !estado.divBaseAberta; desenhar();
    } else if (t.id === "btn-div-arquivo") { document.querySelector("#inp-div-arquivo").click(); }
    else if (t.dataset.divAba) { estado.divAba = t.dataset.divAba; await recarregar(); }
    else if (t.dataset.divMesToggle) { const k = t.dataset.divMesToggle; estado.divMesesAbertos[k] = !estado.divMesesAbertos[k]; desenhar(); }
    else if (t.dataset.divMesTodos) { const abrir = t.dataset.divMesTodos === "abrir"; for (let i = 1; i <= 12; i++) estado.divMesesAbertos[i] = abrir; desenhar(); }
    else if (t.dataset.divToggle) { const k = t.dataset.divToggle; estado.divAbertos[k] = !estado.divAbertos[k]; desenhar(); }
  });
});
