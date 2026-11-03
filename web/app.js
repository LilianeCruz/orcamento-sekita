"use strict";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PERIODOS = ["mensal", "bimestral", "trimestral", "semestral", "anual"];

// ---------------------------------------------------------------- menu lateral: grupos e telas
// Arrendamentos: tela oculta por enquanto. Para voltar, acrescente ["arrendamentos", "Arrendamentos"] aos itens do grupo Orçamento.
const NAV = [
  { id: "inicio", nome: "Início", icone: "home" },
  { id: "orcamentos", nome: "Orçamentos", icone: "lista" },
  { id: "premissas-grupo", nome: "Premissas", icone: "sprout", itens: [["premorc", "Premissas de produção", "sprout"], ["invest", "Premissas de investimento"], ["premdem", "Premissas da DRE"], ["transp", "Premissas de transportadora"], ["capgiro", "Premissas de balanço"], ["patrimonio", "Premissas de dividendos"], ["dividas", "Premissas de dívidas"]] },     // outras premissas entram aqui
  { id: "orcamento", nome: "Cadastros", icone: "orcamento", itens: [["culturas", "Produtos"], ["custos", "Rubricas de custo"], ["cadpremissas", "Tipos de premissas da DRE"], ["cadinvest", "Tipos de investimento"]] },
  "sep",
  { id: "demonstrativos-grupo", nome: "Demonstrativos", icone: "arquivo", itens: [["dre", "DRE", "arquivo"], ["balanco", "Balanço", "balanca"], ["fluxo", "Fluxo de caixa", "caixa"], ["usosfontes", "Usos e fontes", "trocas"], ["indicadores", "Indicadores", "alvo"]] },
  { id: "realizado", nome: "Realizado", icone: "ok" },                                 // importações, DRE, balanço e orçado × realizado (abas)
  { id: "anotacoes", nome: "Anotações", icone: "lista" },
];
const TITULO_TELA = { resultado: "Resultado por produto" };
const MODULO_INFO = {};
NAV.forEach((n) => {
  if (n === "sep") return;
  if (n.itens) n.itens.forEach(([id, nome]) => { MODULO_INFO[id] = { nome, grupo: n.nome, titulo: TITULO_TELA[id] || nome }; });
  else MODULO_INFO[n.id] = { nome: n.nome, grupo: "", titulo: TITULO_TELA[n.id] || n.nome };
});

function montarMenu() {
  $("#nav-modulos").innerHTML = NAV.map((n) => {
    if (n === "sep") return `<div class="nav-sep"></div>`;
    if (!n.itens) return `<button class="nav-top" data-modulo="${n.id}" title="${esc(n.nome)}">${icone(n.icone)}<span>${esc(n.nome)}</span></button>`;
    return `<div class="nav-group aberto"><button class="nav-top nav-grupo-btn" data-grupo-toggle aria-expanded="true" title="${esc(n.nome)}">${icone(n.icone)}<span>${esc(n.nome)}</span><span class="nav-seta">${icone("seta", 16)}</span></button>
      <div class="nav-sub">${n.itens.map(([id, nome, ic]) => `<button class="nav-tab" data-modulo="${id}">${ic ? icone(ic, 18) : ""}<span>${esc(nome)}</span></button>`).join("")}</div></div>`;
  }).join("");
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-grupo-toggle]");
  if (!t) return;
  const g = t.closest(".nav-group");
  const abrir = !g.classList.contains("aberto");
  g.classList.toggle("aberto", abrir);
  t.setAttribute("aria-expanded", String(abrir));
});

const estado = {
  versoes: [], vid: null, dados: null, aba: "cadastro", modulo: "inicio", pomAba: "areas", custoSel: null, custoAno: null, divBaseAberta: false, divMensalAno: null,
  culturas: null, grupos: [], areas: null, produtividade: null, cmpProd: null, cmpProdB: null, cmpProdAno: null,
  precosVenda: null, cmpPreco: null, cmpPrecoB: null, cmpPrecoAno: null,
  gruposCusto: null, classificacoesCusto: {}, resultado: null, resCultura: "resumo", resAno: null, resBusca: "", resRankModo: "total", resBolhasModo: "ha", resSecFechadas: {}, resAnosOcultos: [], resSemTendencia: false, cmpRes: null, cmpResB: null, cmpResAno: null, premissas: null, cmpPrem: null, cmpPremB: null, cmpPremAno: null, custos: null, cmpCustos: null, cmpCustosB: null, cmpCustosAno: null,
  resAjuda: {}, dreAjuda: {}, realizado: null, realQtd: null, realAba: "imp", realPeriodo: null, realImps: null, cmpOrc: null, cmpImp: null, cgPrevia: null, cgSel: null, invest: null, fluxo: null, fluxoAba: "indireto", usosFontes: null, indic: null, indAba: "tabela", pat: null, cmpPat: null, cmpPatB: null, cmpPatAno: null, capt: null, cmpCap: null, cmpCapB: null, cmpCapAno: null, cmpInv: null, cmpInvB: null, cmpInvAno: null, cg: null, cmpCg: null, cmpCgB: null, cmpCgAno: null, cgAjuda: {}, pecuaria: null, rebanho: null, cmpPec: null, cmpPecB: null, cmpPecAno: null, prodAba: "agricola", bp: null, notasBp: {}, cmpBp: null, cmpBpB: null, cmpBpAno: null, bpAjuda: {}, premDem: null, pdAba: "dre", cmpPremDem: null, cmpPremDemB: null, cmpPremDemAno: null, notas: {}, notasDre: {}, anotacoes: null, anotCor: "", anotTela: "", anotStatus: "",
  dre: null, cmpDre: null, cmpDreB: null, cmpDreAno: null, dreArquivo: null,
  dividas: null, divImportacoes: null, divEmpresas: "",
  divMensalAnos: null, divMedida: "principal", divMesesAbertos: {},
  divAba: "resumo", divAnoFiltro: "", divGrupo: "", divContratos: null, divBalanco: null, divAbertos: { curto: true, longo: false, juros: false }, cmpAreas: null, cmpAreasAno: null, cmpAreasB: null,
  anoResumo: null, rascunhos: {},          // rascunhos de parcelas por fazenda
  cmpA: null, cmpB: null, cmpAno: null, cmp: null,
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 0) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const brl = (v) => (v ? num(v, 2) : "–");
const trava = () => estado.dados && estado.dados.versao.status === "aprovado";

function mostrar(msg, ok = false) {
  const el = $("#msg");
  el.hidden = !msg;
  el.textContent = msg || "";
  el.className = "msg" + (ok ? " ok" : "");
  if (msg && ok) setTimeout(() => { if (el.textContent === msg) el.hidden = true; }, 3000);
}

// ---------------------------------------------------------------- indicador de salvamento (topo da página)
// Toda gravação (PUT/POST/DELETE) passa por aqui: mostra "Salvando…", "Salvo automaticamente · hh:mm" ou o erro, com "Tentar de novo".
const salvamento = { pendentes: 0, ultimo: null, erro: null };
function desenharSalvamento() {
  const el = document.getElementById("status-salvo");
  if (!el) return;
  const hora = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  let cls = "ok", icone_ = icone("ok", 18), dica;
  if (salvamento.pendentes > 0) { cls = "salvando"; icone_ = `<span class="spin"></span>`; dica = "Salvando…"; }
  else if (salvamento.erro) { cls = "erro"; icone_ = icone("alerta", 18); dica = `Não foi possível salvar (${salvamento.erro.mensagem}). Clique para tentar de novo.`; }
  else if (salvamento.ultimo) dica = `Salvo automaticamente às ${hora(salvamento.ultimo)}`;
  else dica = "Salvamento automático: tudo o que você preenche é gravado na hora";
  el.className = `status-salvo ${cls}`;
  el.innerHTML = icone_;
  el.dataset.dica = dica; el.setAttribute("aria-label", dica); el.setAttribute("role", "status");
  if (cls === "erro") { el.setAttribute("data-salvar-de-novo", ""); el.tabIndex = 0; } else { el.removeAttribute("data-salvar-de-novo"); el.removeAttribute("tabindex"); }
}

async function api(metodo, url, corpo) {
  const grava = metodo !== "GET";
  if (grava) { salvamento.pendentes++; desenharSalvamento(); }
  try {
    const r = await fetchApi(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const txt = await r.text();
    let dados = null;
    try { dados = txt ? JSON.parse(txt) : null; } catch (_) { /* ignore */ }
    if (!r.ok) {
      const detalhe = dados && (dados.erro || (Array.isArray(dados.detail) ? dados.detail.map((d) => d.msg).join("; ") : dados.detail));
      throw new Error(detalhe || `Erro ${r.status}`);
    }
    if (grava) { salvamento.ultimo = new Date(); salvamento.erro = null; }
    return dados;
  } catch (e) {
    if (grava) salvamento.erro = { metodo, url, corpo, mensagem: e.message || "Falha de conexão" };
    throw e;
  } finally {
    if (grava) { salvamento.pendentes--; desenharSalvamento(); }
  }
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-salvar-de-novo]") || !salvamento.erro) return;
  const { metodo, url, corpo } = salvamento.erro;
  seguro(async () => { await api(metodo, url, corpo); await recarregar(); });
});

async function seguro(fn) {
  try { mostrar(""); await fn(); } catch (e) { mostrar(e.message); if (estado.dados) desenhar(); }
}

// ---------------------------------------------------------------- dados
async function carregarVersoes(selecionar) {
  estado.versoes = await api("GET", "/api/versoes");
  if (selecionar) estado.vid = selecionar;
  if (!estado.versoes.find((v) => v.id === estado.vid)) estado.vid = estado.versoes.length ? estado.versoes[0].id : null;
  const sel = $("#sel-versao");
  sel.innerHTML = estado.versoes.map((v) =>
    `<option value="${v.id}" ${v.id === estado.vid ? "selected" : ""}>${esc(v.nome)}${v.tipo !== "orcado" ? " — " + v.tipo : ""}${v.status === "aprovado" ? " 🔒" : ""}</option>`).join("");
}

async function recarregar(renderizar = true) {
  await carregarVersoes();
  estado.dados = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/arrendamentos`) : null;
  if (estado.dados && !estado.dados.anos.includes(estado.anoResumo)) estado.anoResumo = estado.dados.anos[0];
  estado.rascunhos = {};
  await carregarModulo();
  if (renderizar !== false) desenhar();
}

async function carregarModulo() {
  if (estado.modulo === "inicio") {
    estado.culturas = (await api("GET", "/api/culturas")).culturas;
    estado.gruposCusto = (await api("GET", "/api/grupos-custo")).grupos;
    estado.inicio = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/inicio`) : null;
  } else if (estado.modulo === "culturas") {
    const r = await api("GET", "/api/culturas");
    estado.culturas = r.culturas; estado.grupos = r.grupos;
  } else if (modAtivo() === "areas") {
    estado.areas = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/areas`) : null;
  } else if (modAtivo() === "produtividade") {
    estado.produtividade = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/produtividade`) : null;
    estado.pecuaria = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/pecuaria`) : null;
    estado.rebanho = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/rebanho`) : null;
  } else if (modAtivo() === "resultado") {
    estado.resultado = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/resultado`) : null;
    estado.notas = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/anotacoes?tela=resultado`) : {};
  } else if (modAtivo() === "premissas") {
    estado.premissas = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/premissas`) : null;
  } else if (modAtivo() === "variaveis") {
    estado.custos = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/custos`) : null;
  } else if (estado.modulo === "custos") {
    const r = await api("GET", "/api/grupos-custo");
    estado.gruposCusto = r.grupos; estado.classificacoesCusto = r.classificacoes;
  } else if (estado.modulo === "dividas") {
    await carregarDividas();
  } else if (estado.modulo === "usosfontes") {
    estado.usosFontes = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/usos-fontes`) : null;
  } else if (estado.modulo === "indicadores") {
    estado.indic = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/indicadores`) : null;
  } else if (estado.modulo === "fluxo") {
    estado.fluxo = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/fluxo-caixa`) : null;
  } else if (estado.modulo === "patrimonio") {
    estado.pat = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/patrimonio`) : null;
  } else if (estado.modulo === "captacoes") {
    estado.capt = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/captacoes`) : null;
  } else if (estado.modulo === "invest" || estado.modulo === "cadinvest") {
    estado.invest = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/investimentos`) : null;
    estado.capt = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/captacoes`) : null;      // premissas e cronograma do financiamento
  } else if (estado.modulo === "realizado") {
    estado.realizado = await api("GET", "/api/realizado");
    estado.realPeriodo = await api("GET", "/api/realizado/periodo");
    estado.realQtd = estado.realAba === "qtd" ? await api("GET", "/api/realizado/quantidades") : null;
    if (estado.realAba === "comp") {
      estado.realImps = await api("GET", "/api/realizado/importacoes");
      if (!estado.cmpOrc && estado.versoes.length) estado.cmpOrc = estado.vid || estado.versoes[0].id;
      if (!estado.cmpImp && estado.realImps.length) estado.cmpImp = estado.realImps[estado.realImps.length - 1].ano;
    }
  } else if (estado.modulo === "transp") {
    estado.transp = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/transportadora`) : null;
  } else if (estado.modulo === "capgiro") {
    estado.cg = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/capital-giro`) : null;
    estado.cgPrevia = estado.cg && estado.cg.realizado.anos.length ? await api("GET", `/api/versoes/${estado.vid}/capital-giro/previa-prazos`) : null;
    if (estado.cgPrevia && (!estado.cgSel || estado.cgSel.some((y) => !estado.cgPrevia.anos.includes(y)))) estado.cgSel = estado.cgPrevia.padrao.slice();
  } else if (estado.modulo === "balanco") {
    estado.bp = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/balanco-patrimonial`) : null;
    estado.notasBp = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/anotacoes?tela=balanco`) : {};
  } else if (estado.modulo === "premdem" || estado.modulo === "cadpremissas") {
    estado.premDem = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/premissas-dem`) : null;
    estado.dreP = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/dre-padrao`) : null;
    estado.drePrev = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/dre-padrao/previa`) : null;
  } else if (estado.modulo === "anotacoes") {
    estado.anotacoes = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/anotacoes/todas`) : null;
  } else if (estado.modulo === "dre") {
    estado.dre = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/dre`) : null;
    estado.notasDre = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/anotacoes?tela=dre`) : {};
    estado.dreArquivo = await api("GET", "/api/dre/arquivo-padrao");
  } else if (modAtivo() === "precos") {
    estado.precosVenda = estado.vid ? await api("GET", `/api/versoes/${estado.vid}/precos-venda`) : null;
  }
}

function desenharTopo() {
  const d = estado.dados;
  const b = $("#badge-status");
  if (!d) { b.textContent = ""; } else {
    b.textContent = d.versao.status === "aprovado" ? "Aprovado · travado" : "Em elaboração";
    b.className = "badge" + (d.versao.status === "aprovado" ? " trava" : "");
  }
  const m = estado.modulo;
  const mMenu = m;
  document.querySelectorAll("#nav-modulos [data-modulo]").forEach((x) => x.classList.toggle("ativa", x.dataset.modulo === mMenu));
  document.querySelectorAll("#nav-modulos .nav-group").forEach((g) => g.classList.toggle("tem-ativo", !!g.querySelector(".ativa")));
  const info = MODULO_INFO[mMenu];
  // trilha: Orçamento › [grupo, quando não for o próprio Orçamento] › tela
  $("#breadcrumb").innerHTML = info ? [...(m === "orcamentos" ? [] : ["Orçamento"]), ...(info.grupo && info.grupo !== "Orçamento" ? [info.grupo] : []), info.titulo]
    .map((t, i, v) => `<span class="${i < v.length - 1 ? "grupo" : ""}">${esc(t)}</span>`).join('<span class="sep">›</span>') : "";
  document.querySelectorAll("#nav-modulos .nav-group").forEach((g) => { if (g.classList.contains("tem-ativo")) g.classList.add("aberto"); });
  $("#barra-pagina").hidden = m === "inicio";
  $("#abas-arr").hidden = m !== "arrendamentos";
  const vb = document.querySelector(".versao-bar");
  vb.classList.toggle("enxuta", m === "premorc" || m === "dividas" || m === "invest" || m === "capgiro" || m === "transp" || m === "patrimonio" || m === "premdem" || m === "cadpremissas" || m === "cadinvest");      // sem Reprojetado/Aprovar nesta tela
  vb.classList.toggle("sem-controles", m === "culturas" || m === "custos" || m === "realizado" || m === "orcamentos");
  const av = m === "arrendamentos" ? ((d && d.calculo.avisos) || []) : m === "produtividade" ? ((estado.produtividade && estado.produtividade.avisos) || []) : [];
  const el = $("#avisos");
  el.hidden = !av.length;
  el.innerHTML = av.length ? `<strong>Atenção</strong><ul>${av.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : "";
}

function desenhar() {
  desenharTopo();
  document.querySelectorAll(".abas button").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === estado.aba));
  const c = $("#conteudo");
  if (estado.modulo === "inicio") { c.innerHTML = htmlInicio(); return; }
  if (estado.modulo === "premorc") { c.innerHTML = htmlPremOrc(); return; }
  if (estado.modulo === "culturas") { c.innerHTML = htmlCulturas(); return; }
  if (modAtivo() === "areas") { c.innerHTML = htmlAreas(); return; }
  if (modAtivo() === "produtividade") { c.innerHTML = htmlProdutividade(); return; }
  if (modAtivo() === "precos") { c.innerHTML = htmlPrecosVenda(); return; }
  if (estado.modulo === "dividas") { c.innerHTML = htmlDividas(); return; }
  if (estado.modulo === "custos") { c.innerHTML = htmlGruposCusto(); return; }
  if (modAtivo() === "variaveis") { c.innerHTML = htmlCustosVariaveis(); return; }
  if (modAtivo() === "premissas") { c.innerHTML = htmlPremissas(); return; }
  if (modAtivo() === "resultado") { c.innerHTML = htmlResultado(); return; }
  if (estado.modulo === "dre") { c.innerHTML = htmlDre(); return; }
  if (estado.modulo === "anotacoes") { c.innerHTML = htmlAnotacoes(); return; }
  if (estado.modulo === "premdem") { c.innerHTML = htmlPremDem(); return; }
  if (estado.modulo === "cadpremissas") { c.innerHTML = htmlCadPremissas(); return; }
  if (estado.modulo === "orcamentos") { c.innerHTML = htmlOrcamentos(); return; }
  if (estado.modulo === "balanco") { c.innerHTML = htmlBalanco(); return; }
  if (estado.modulo === "fluxo") { c.innerHTML = htmlFluxo(); return; }
  if (estado.modulo === "usosfontes") { c.innerHTML = htmlUsosFontes(); return; }
  if (estado.modulo === "indicadores") { c.innerHTML = htmlIndicadores(); return; }
  if (estado.modulo === "patrimonio") { c.innerHTML = htmlPatrimonio(); return; }
  if (estado.modulo === "captacoes") { c.innerHTML = htmlCaptacoes(); return; }
  if (estado.modulo === "invest" || estado.modulo === "cadinvest") { c.innerHTML = htmlInvestimentos(); return; }
  if (estado.modulo === "realizado") { c.innerHTML = htmlRealizado(); return; }
  if (estado.modulo === "transp") { c.innerHTML = htmlTransportadora(); return; }
  if (estado.modulo === "capgiro") { c.innerHTML = htmlCapitalGiro(); return; }
  if (!estado.dados && estado.aba !== "comparar") {
    c.innerHTML = `<div class="card vazio">Nenhum orçamento ainda. Clique em <strong>Novo orçamento</strong> para começar.</div>`;
    return;
  }
  if (estado.aba === "cadastro") c.innerHTML = htmlCadastro();
  else if (estado.aba === "resumo") c.innerHTML = htmlResumo();
  else c.innerHTML = htmlComparar();
}

// ---------------------------------------------------------------- cadastro
function culturaDe(id) { return (estado.dados.culturas || []).find((c) => c.id === id); }
function opcoesCultura(sel) {
  const d = estado.dados;
  return `<option value="">— escolha —</option>` + d.culturas.filter((c) => c.ativa || c.id === sel)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.nome)}</option>`).join("");
}

function htmlPrecos() {
  const d = estado.dados, dis = trava() ? "disabled" : "";
  const linhas = d.culturas.map((c) => `<tr><td>${esc(c.nome)}${c.ativa ? "" : ' <span class="chip arr">inativa</span>'}
    <span class="dim">· R$ por ${esc(c.rotulo)}</span></td>${d.anos.map((a) =>
    `<td><input type="number" step="0.01" min="0" ${dis} data-preco="${c.id}" data-ano="${a}" value="${(d.precos[c.id] || {})[a] ?? ""}"></td>`).join("")}
    <td>${trava() ? "" : `<select id="rp-${c.id}" title="Ano de origem">${d.anos.map((a) => `<option>${a}</option>`).join("")}</select>
      <button class="sec" data-replicar-preco="${c.id}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>`}</td></tr>`).join("");
  const vazio = `<tr><td colspan="${d.anos.length + 2}" class="dim">Nenhum produto cadastrado.
    <a href="#" data-modulo="culturas">Cadastre em Produtos</a> e volte aqui para informar o valor padrão.</td></tr>`;
  return `<div class="card"><h2>Valor padrão por produto (R$) — por ano</h2>
    <p class="dim">Os produtos vêm do cadastro de <a href="#" data-modulo="culturas">Produtos</a>. O valor é por embalagem padrão (ex.: saco) ou por kg/litro, se o produto não tiver embalagem.
    É usado nos arrendamentos pagos em produto e, depois, na venda. Alterar aqui recalcula todos os arrendamentos daquele produto.</p>
    <div class="scroll"><table><thead><tr><th>Produto</th>${d.anos.map((a) => `<th>${a}</th>`).join("")}<th></th></tr></thead>
    <tbody>${linhas || vazio}</tbody></table></div></div>`;
}

function htmlParcelas(f) {
  const dis = trava() ? "disabled" : "";
  const rasc = estado.rascunhos[f.id] || f.parcelas;
  const soma = rasc.reduce((s, p) => s + Number(p.percentual || 0), 0);
  const ok = Math.abs(soma - 100) < 0.01;
  const itens = rasc.map((p, i) => `<div class="parcela">
      <select ${dis} data-parc-mes="${f.id}:${i}">${MESES.map((m, k) => `<option value="${k + 1}" ${k + 1 === p.mes ? "selected" : ""}>${m}</option>`).join("")}</select>
      <input type="number" step="0.01" min="0" ${dis} data-parc-pct="${f.id}:${i}" value="${p.percentual}"> %
      ${trava() ? "" : `<button class="link" data-parc-del="${f.id}:${i}">×</button>`}</div>`).join("");
  const gerador = trava() ? "" : `<div class="gerador"><strong>Gerar parcelas iguais:</strong>
      <input type="number" min="1" max="12" value="4" id="g-n-${f.id}"> parcelas
      <select id="g-p-${f.id}">${PERIODOS.map((p) => `<option ${p === "trimestral" ? "selected" : ""}>${p}</option>`).join("")}</select>
      a partir de <select id="g-m-${f.id}">${MESES.map((m, k) => `<option value="${k + 1}" ${k === 2 ? "selected" : ""}>${m}</option>`).join("")}</select>
      <button class="sec" data-gerar="${f.id}">Gerar</button></div>`;
  return `<div style="margin-top:12px"><h3>Vencimentos (valem para todos os anos)</h3>
    <div class="parcelas">${itens || `<span class="dim">Sem vencimentos.</span>`}
      ${trava() ? "" : `<button class="sec" data-parc-add="${f.id}">+ vencimento</button>`}
      <span class="${ok ? "dim" : "pos"}">Total: ${num(soma, 2)}%</span>
      ${trava() ? "" : `<button class="prim" data-parc-salvar="${f.id}">Salvar vencimentos</button>`}</div>${gerador}</div>`;
}

function htmlFazenda(f) {
  const d = estado.dados, dis = trava() ? "disabled" : "";
  const calc = d.calculo.fazendas.find((x) => x.id === f.id);
  const arr = f.tipo === "arrendada";
  const cult = culturaDe(f.cultura_id) || { nome: "…", rotulo: "unidade" };
  const rotValor = f.forma === "produto" ? `${esc(cult.rotulo)} por hectare (${esc(cult.nome)})` : "R$ por hectare";
  const precoDe = (a) => (d.precos[f.cultura_id] || {})[a];
  const cab = `<div class="cab" data-faz="${f.id}">
      <label>Fazenda<input ${dis} data-f="nome" value="${esc(f.nome)}"></label>
      <label>Tipo<select ${dis} data-f="tipo"><option value="propria" ${!arr ? "selected" : ""}>Própria</option><option value="arrendada" ${arr ? "selected" : ""}>Arrendada</option></select></label>
      ${arr ? `<label>Arrendador<input ${dis} data-f="arrendador" value="${esc(f.arrendador)}"></label>
      <label>Pagamento<select ${dis} data-f="forma"><option value="reais" ${f.forma === "reais" ? "selected" : ""}>Em reais</option><option value="produto" ${f.forma === "produto" ? "selected" : ""}>Em produto</option></select></label>
      ${f.forma === "produto" ? `<label>Produto do pagamento<select ${dis} data-f="cultura_id">${opcoesCultura(f.cultura_id)}</select></label>` : ""}` : ""}
      ${trava() ? "" : `<button class="sec" data-salvar-faz="${f.id}">Salvar dados</button><button class="link" data-del-faz="${f.id}">excluir fazenda</button>`}</div>`;
  const linhaAno = (rot, fn, cls = "") => `<tr class="${cls}"><td>${rot}</td>${d.anos.map((a) => `<td>${fn(a)}</td>`).join("")}</tr>`;
  const tabela = `<div class="scroll"><table><thead><tr><th></th>${d.anos.map((a) => `<th>${a}</th>`).join("")}</tr></thead><tbody>
    ${linhaAno("Área (ha)", (a) => `<input type="number" step="0.01" min="0" ${dis} data-ano-f="${f.id}" data-ano="${a}" data-campo="area_ha" value="${(f.anos[a] || {}).area_ha ?? 0}">`)}
    ${arr ? linhaAno(rotValor, (a) => `<input type="number" step="0.01" min="0" ${dis} data-ano-f="${f.id}" data-ano="${a}" data-campo="valor" value="${(f.anos[a] || {}).valor ?? 0}">`) : ""}
    ${arr && f.forma === "produto" ? linhaAno(`Total (${esc(cult.rotulo)})`, (a) => num(calc.anos[a].sacas, 0), "dim") : ""}
    ${arr && f.forma === "produto" ? linhaAno(`Valor padrão (R$ por ${esc(cult.rotulo)}) — da tabela acima`, (a) => (precoDe(a) ? num(precoDe(a), 2) : `<span class="pos">sem valor</span>`), "dim") : ""}
    ${arr ? linhaAno("Custo anual (R$)", (a) => brl(calc.anos[a].custo), "total") : ""}</tbody></table></div>`;
  const replicar = trava() ? "" : `<div class="gerador"><strong>Replicar para os anos seguintes:</strong>
      a partir de <select id="rf-ano-${f.id}">${d.anos.map((a) => `<option>${a}</option>`).join("")}</select>
      <label><input type="checkbox" id="rf-area-${f.id}" checked> Área</label>
      ${arr ? `<label><input type="checkbox" id="rf-valor-${f.id}" checked> ${f.forma === "produto" ? esc(cult.rotulo) + "/ha" : "R$/ha"}</label>` : ""}
      <button class="sec" data-replicar-faz="${f.id}">Replicar →</button></div>`;
  return `<div class="card"><h3>${esc(f.nome)} <span class="chip ${arr ? "arr" : ""}">${arr ? "arrendada" : "própria"}</span></h3>
    <div style="height:8px"></div>${cab}${tabela}${replicar}${arr ? htmlParcelas(f) : ""}</div>`;
}

function htmlCadastro() {
  const d = estado.dados;
  const nova = trava() ? "" : `<div class="card"><h2>Nova fazenda</h2><div class="cab" id="nova-faz">
      <label>Fazenda<input id="nf-nome" placeholder="Nome"></label>
      <label>Tipo<select id="nf-tipo"><option value="arrendada">Arrendada</option><option value="propria">Própria</option></select></label>
      <label>Arrendador<input id="nf-arr" placeholder="Quem recebe"></label>
      <label>Pagamento<select id="nf-forma"><option value="reais">Em reais</option><option value="produto">Em produto</option></select></label>
      <label>Produto do pagamento<select id="nf-cult">${opcoesCultura(null)}</select></label>
      <button class="prim" id="btn-add-faz">Adicionar</button></div></div>`;
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar valores durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  const ult = d.anos[d.anos.length - 1];
  const hz = `<div class="card"><div class="linha"><h2 style="margin:0">Horizonte</h2>
      <span>Projetar</span><input type="number" min="1" max="15" id="inp-horizonte" value="${d.versao.horizonte}" ${trava() ? "disabled" : ""} style="width:70px">
      <span>anos: de <strong>${d.anos[0]}</strong> até <strong>${ult}</strong></span>
      ${trava() ? "" : `<button class="sec" id="btn-horizonte">Aplicar</button>`}
      <span class="dim">Reduzir só esconde os anos finais; os valores continuam guardados.</span></div></div>`;
  return `${aviso}${htmlPrecos()}
    ${d.fazendas.map(htmlFazenda).join("") || `<div class="card vazio">Nenhuma fazenda cadastrada.</div>`}${nova}`;
}

// ---------------------------------------------------------------- resumo
function htmlResumo() {
  const c = estado.dados.calculo, anos = c.anos;
  const produtos = [...new Set(anos.flatMap((a) => Object.keys(c.resumo[a].sacas)))];
  const linha = (rot, fn, cls = "") => `<tr class="${cls}"><td>${rot}</td>${anos.map((a) => `<td>${fn(c.resumo[a])}</td>`).join("")}</tr>`;
  const anual = `<div class="card"><h2>Resumo anual</h2><div class="scroll"><table><thead><tr><th></th>${anos.map((a) => `<th>${a}</th>`).join("")}</tr></thead><tbody>
    ${linha("Área própria (ha)", (r) => num(r.area_propria, 2))}
    ${linha("Área arrendada (ha)", (r) => num(r.area_arrendada, 2))}
    ${linha("Área total (ha)", (r) => num(r.area_total, 2), "total")}
    ${produtos.map((p) => linha(`Quantidade paga em ${esc(p)}`, (r) => num(r.sacas[p] || 0, 0))).join("")}
    ${linha("Custo de arrendamento (R$)", (r) => brl(r.custo), "total")}</tbody></table></div></div>`;
  const ano = estado.anoResumo, r = c.resumo[ano];
  const fz = c.fazendas.filter((f) => f.anos[ano].custo);
  const mensal = `<div class="card"><div class="linha"><h2 style="margin:0">Fluxo de caixa mensal — arrendamentos</h2>
    <select id="sel-ano">${anos.map((a) => `<option ${a === ano ? "selected" : ""}>${a}</option>`).join("")}</select></div>
    <div class="scroll"><table><thead><tr><th>Fazenda</th>${MESES.map((m) => `<th>${m}</th>`).join("")}<th>Total</th></tr></thead><tbody>
    ${fz.map((f) => `<tr><td>${esc(f.nome)}</td>${f.anos[ano].mensal.map((v) => `<td>${brl(v)}</td>`).join("")}<td>${brl(f.anos[ano].custo)}</td></tr>`).join("") || `<tr><td colspan="14" class="dim">Sem pagamentos em ${ano}.</td></tr>`}
    <tr class="total"><td>Total</td>${r.mensal.map((v) => `<td>${brl(v)}</td>`).join("")}<td>${brl(r.custo)}</td></tr></tbody></table></div>
    <p class="dim">Este total alimenta a linha de Arrendamentos do fluxo de caixa direto.</p></div>`;
  return anual + mensal;
}

// ---------------------------------------------------------------- comparar
function classeDelta(x) { return x > 0 ? "pos" : x < 0 ? "neg" : "dim"; }
function celulaDelta(o, d = 2) {
  if (!o) return "<td></td><td></td><td></td><td></td>";
  const pct = o.pct === null ? "–" : `${num(o.pct, 1)}%`;
  return `<td>${num(o.a, d)}</td><td>${num(o.b, d)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, d)}</td><td class="${classeDelta(o.delta)}">${pct}</td>`;
}

function htmlComparar() {
  const vs = estado.versoes;
  if (vs.length < 2) return `<div class="card vazio">Para comparar, crie pelo menos duas versões (por exemplo, o Orçado aprovado e um Reprojetado).</div>`;
  const opt = (sel) => vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("");
  const barra = `<div class="card"><div class="linha"><label>Base <select id="cmp-a">${opt(estado.cmpA)}</select></label>
    <label>Comparar com <select id="cmp-b">${opt(estado.cmpB)}</select></label>
    <button class="prim" id="btn-comparar">Comparar</button></div>`;
  const c = estado.cmp;
  if (!c) return barra + `<p class="dim">Escolha as duas versões e clique em Comparar.</p></div>`;
  const ano = estado.cmpAno && c.anos.includes(estado.cmpAno) ? estado.cmpAno : c.anos[0];
  const r = c.resumo[ano];
  const cab = `<th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th>`;
  const resumo = `<div class="linha"><label>Ano <select id="cmp-ano">${c.anos.map((a) => `<option ${a === ano ? "selected" : ""}>${a}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th></th>${cab}</tr></thead><tbody>
    <tr><td>Área total (ha)</td>${celulaDelta(r.area_total, 2)}</tr>
    ${Object.entries(r.sacas).map(([p, o]) => `<tr><td>Quantidade paga em ${esc(p)}</td>${celulaDelta(o, 0)}</tr>`).join("")}
    <tr class="total"><td>Custo de arrendamento (R$)</td>${celulaDelta(r.custo, 2)}</tr></tbody></table></div>`;
  const mensal = `<h2 style="margin-top:18px">Pagamento por mês — ${ano}</h2><div class="scroll"><table><thead><tr><th>Mês</th>${cab}</tr></thead><tbody>
    ${r.mensal.map((o, i) => (o.a || o.b) ? `<tr><td>${MESES[i]}</td>${celulaDelta(o, 2)}</tr>` : "").join("")}</tbody></table></div>`;
  const faz = `<h2 style="margin-top:18px">Por fazenda — ${ano}</h2><div class="scroll"><table><thead><tr><th>Fazenda</th><th colspan="4">Área (ha)</th><th colspan="4">Custo (R$)</th></tr></thead><tbody>
    ${Object.entries(c.fazendas).map(([n, a]) => `<tr><td>${esc(n)}</td>${celulaDelta(a[ano].area_ha, 2)}${celulaDelta(a[ano].custo, 2)}</tr>`).join("")}</tbody></table></div>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>${resumo}${mensal}${faz}</div>`;
}

// ---------------------------------------------------------------- eventos
$("#sel-versao").addEventListener("change", (e) => { estado.vid = Number(e.target.value); recarregar(); });
document.addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-modulo]");
  if (!alvo) return;
  e.preventDefault();
  seguro(async () => {
    estado.modulo = alvo.dataset.modulo;
    if (POM_ABAS.some(([id]) => id === estado.modulo)) { estado.pomAba = estado.modulo; estado.modulo = "premorc"; }     // links antigos caem na aba certa
    if (estado.modulo === "captacoes") { estado.divAba = "captacoes"; estado.modulo = "dividas"; }
    await carregarModulo();
    desenhar();
    window.scrollTo(0, 0);
  });
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pom-aba]");
  if (!b) return;
  seguro(async () => { estado.pomAba = b.dataset.pomAba; await carregarModulo(); desenhar(); });
});
document.querySelectorAll(".abas button").forEach((b) => b.addEventListener("click", () => {
  estado.aba = b.dataset.aba;
  if (estado.aba === "comparar" && !estado.cmpA) padroesComparar();
  desenhar();
}));

function padroesComparar() {
  const vs = estado.versoes;
  const rep = vs.find((v) => v.tipo !== "orcado" && v.origem_id);
  estado.cmpB = rep ? rep.id : (vs[0] && vs[0].id);
  estado.cmpA = rep ? rep.origem_id : (vs[1] ? vs[1].id : (vs[0] && vs[0].id));
}

// ---------------------------------------------------------------- janela "Novo orçamento"
// O orçamento é anual: o período é só o ano inicial e o ano final.
const ORC_MAX_ANOS = 30;

function resumoPeriodo(ini, fim) {
  if (!ini || !fim) return { ok: false, txt: "Informe o ano inicial e o ano final." };
  if (fim < ini) return { ok: false, txt: "O ano final não pode ser antes do inicial." };
  const n = fim - ini + 1;
  if (n > ORC_MAX_ANOS) return { ok: false, txt: `O período passa de ${ORC_MAX_ANOS} anos.` };
  return { ok: true, txt: `${n} ${n === 1 ? "ano" : "anos"}: de ${ini}${n > 1 ? " a " + fim : ""}` };
}

function fecharNovoOrcamento() {
  const m = document.getElementById("modal-orc");
  if (!m) return;
  m.classList.add("saindo");
  setTimeout(() => m.remove(), 130);
}

function abrirEditarOrcamento(v) {
  if (document.getElementById("modal-orc")) return;
  const m = document.createElement("div");
  m.id = "modal-orc"; m.className = "orc-overlay";
  m.innerHTML = `<div class="orc-caixa" role="dialog" aria-modal="true">
    <header class="orc-cab"><span class="orc-icone">${icone("editar", 18)}</span><div><h2>Editar orçamento</h2></div>
      <button class="orc-x" data-orc="fechar" aria-label="Fechar">✕</button></header>
    <div class="orc-corpo">
      <label class="orc-campo">Nome do orçamento<input id="orc-nome" type="text" maxlength="80" value="${esc(v.nome)}" autocomplete="off"></label>
      <div class="orc-par">
        <label class="orc-campo">Ano inicial<input id="orc-ini" type="number" min="2000" max="2100" step="1" value="${v.ano_base}"></label>
        <label class="orc-campo">Ano final<input id="orc-fim" type="number" min="2000" max="2130" step="1" value="${v.ano_base + (v.horizonte || 5) - 1}"></label>
      </div>
      <div id="orc-resumo" class="orc-resumo"></div>
      <p class="dim peq-txt">Os dados de anos que saem do período ficam guardados e voltam se o ano for incluído de novo.</p>
      <div id="orc-erro" class="orc-erro" hidden></div>
    </div>
    <footer class="orc-rodape"><button class="sec" data-orc="fechar">Cancelar</button><button class="prim" data-orc="salvar" id="orc-criar">Salvar</button></footer></div>`;
  document.body.appendChild(m);
  const ini = m.querySelector("#orc-ini"), fim = m.querySelector("#orc-fim");
  const atualizar = () => {
    const r = resumoPeriodo(parseInt(ini.value, 10) || 0, parseInt(fim.value, 10) || 0);
    const el = m.querySelector("#orc-resumo"); el.textContent = r.txt; el.classList.toggle("invalido", !r.ok);
    m.querySelector("#orc-criar").disabled = !r.ok;
  };
  ini.addEventListener("input", atualizar); fim.addEventListener("input", atualizar);
  m.addEventListener("click", async (e) => {
    if (e.target.closest('[data-orc="fechar"]')) { fecharNovoOrcamento(); return; }
    if (!e.target.closest('[data-orc="salvar"]')) return;
    const erro = m.querySelector("#orc-erro"); erro.hidden = true;
    const btn = m.querySelector("#orc-criar"); btn.disabled = true;
    try {
      await api("PUT", `/api/versoes/${v.id}/periodo`, { nome: m.querySelector("#orc-nome").value.trim(), ano_inicial: parseInt(ini.value, 10), ano_final: parseInt(fim.value, 10) });
      fecharNovoOrcamento();
      await carregarVersoes(estado.vid); await recarregar();
      mostrar("Orçamento atualizado.", true);
    } catch (err) { erro.textContent = err.message; erro.hidden = false; btn.disabled = false; }
  });
  atualizar();
  m.querySelector("#orc-nome").focus();
}

function abrirNovoOrcamento() {
  if (document.getElementById("modal-orc")) return;
  const a = new Date().getFullYear() + 1;
  const m = document.createElement("div");
  m.id = "modal-orc"; m.className = "orc-overlay";
  m.innerHTML = `<div class="orc-caixa" role="dialog" aria-modal="true" aria-labelledby="orc-titulo">
    <header class="orc-cab">
      <span class="orc-icone">＋</span>
      <div><h2 id="orc-titulo">Novo orçamento</h2></div>
      <button class="orc-x" data-orc="fechar" aria-label="Fechar">✕</button>
    </header>
    <div class="orc-corpo">
      <label class="orc-campo">Nome do orçamento
        <input id="orc-nome" type="text" maxlength="80" placeholder="Ex.: Orçamento ${a}" autocomplete="off">
      </label>
      ${estado.versoes.length ? `<label class="orc-campo">Copiar os dados de (opcional)
        <select id="orc-origem"><option value="">— começar um orçamento em branco —</option>${estado.versoes.map((v) => `<option value="${v.id}">${esc(v.nome)}</option>`).join("")}</select>
      </label>` : ""}
      <div class="orc-par">
        <label class="orc-campo">Ano inicial<input id="orc-ini" type="number" min="2000" max="2100" step="1" value="${a}"></label>
        <label class="orc-campo">Ano final<input id="orc-fim" type="number" min="2000" max="2130" step="1" value="${a + 4}"></label>
      </div>
      <div class="orc-atalhos">Estender o fim:
        ${[1, 3, 5, 10].map((n) => `<button type="button" class="orc-atalho" data-orc-anos="${n}">+ ${n} ${n === 1 ? "ano" : "anos"}</button>`).join("")}
      </div>
      <div id="orc-resumo" class="orc-resumo"></div>
      <div id="orc-erro" class="orc-erro" hidden></div>
    </div>
    <footer class="orc-rodape">
      <button class="sec" data-orc="fechar">Cancelar</button>
      <button class="prim" data-orc="criar" id="orc-criar">Criar orçamento</button>
    </footer>
  </div>`;
  document.body.appendChild(m);
  const ini = m.querySelector("#orc-ini"), fim = m.querySelector("#orc-fim");
  const anos = () => [parseInt(ini.value, 10) || 0, parseInt(fim.value, 10) || 0];
  const atualizar = () => {
    const [i, f] = anos();
    const r = resumoPeriodo(i, f);
    const el = m.querySelector("#orc-resumo");
    el.textContent = r.txt; el.classList.toggle("invalido", !r.ok);
    m.querySelector("#orc-criar").disabled = !r.ok;
  };
  ini.addEventListener("input", atualizar); fim.addEventListener("input", atualizar);
  const origem = m.querySelector("#orc-origem");
  if (origem) origem.addEventListener("change", () => {           // copiar de outro orçamento: o período é o dele
    const v = estado.versoes.find((x) => x.id === Number(origem.value));
    m.querySelector(".orc-atalhos").hidden = !!v;
    ini.disabled = fim.disabled = !!v;
    if (v) { ini.value = v.ano_base; fim.value = v.ano_base + (v.horizonte || 5) - 1; if (!m.querySelector("#orc-nome").value) m.querySelector("#orc-nome").placeholder = `Cenário de ${v.nome}`; }
    atualizar();
  });
  m.querySelectorAll("[data-orc-anos]").forEach((b) => b.addEventListener("click", () => {      // soma anos ao ano final; cliques acumulam
    const [i, f] = anos();
    if (!i) ini.value = a;
    fim.value = (f || (parseInt(ini.value, 10) - 1)) + Number(b.dataset.orcAnos);
    atualizar();
  }));
  m.addEventListener("click", async (e) => {
    if (e.target.closest('[data-orc="fechar"]')) { fecharNovoOrcamento(); return; }       // só fecha pelo botão: clicar fora não apaga o que foi digitado
    if (!e.target.closest('[data-orc="criar"]')) return;
    const erro = m.querySelector("#orc-erro");
    erro.hidden = true;
    const btn = m.querySelector("#orc-criar"); btn.disabled = true;
    try {
      const nome = m.querySelector("#orc-nome").value.trim();
      const [i, f] = anos();
      const orig = origem && origem.value ? estado.versoes.find((x) => x.id === Number(origem.value)) : null;
      const r = orig ? await api("POST", `/api/versoes/${orig.id}/copiar`, { nome: nome || `Cenário de ${orig.nome}`, tipo: "revisao" })       // cenário: cópia de outro orçamento
                     : await api("POST", "/api/versoes", { nome: nome || null, ano_base: i, horizonte: f - i + 1 });
      fecharNovoOrcamento();
      estado.modulo = "premorc"; estado.pomAba = "areas";      // abre em Premissas de produção, na aba Áreas por produto
      await carregarVersoes(r.id); await recarregar();
      mostrar(orig ? `Cenário "${estado.dados.versao.nome}" criado com os dados de "${orig.nome}".` : `Você está no orçamento "${estado.dados.versao.nome}". Preencha as premissas de produção nas abas abaixo.`, true);
    } catch (err) { erro.textContent = err.message; erro.hidden = false; btn.disabled = false; }
  });
  atualizar();
  m.querySelector("#orc-nome").focus();
}
document.addEventListener("click", (e) => { if (e.target.closest("#btn-nova-inicio, #btn-novo-topo")) abrirNovoOrcamento(); });

// janela de pergunta no mesmo estilo (substitui prompt/confirm do navegador); resolve com o texto/true ou null se cancelar
function dialogo({ titulo, texto, campo, valor = "", confirmar = "Confirmar", perigo = false }) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "orc-overlay";
    m.innerHTML = `<div class="orc-caixa orc-pequena" role="dialog" aria-modal="true">
      <header class="orc-cab"><h2>${esc(titulo)}</h2></header>
      <div class="orc-corpo">${texto ? `<p class="orc-texto">${esc(texto)}</p>` : ""}
        ${campo ? `<label class="orc-campo">${esc(campo)}<input type="text" maxlength="80" value="${esc(valor)}"></label>` : ""}</div>
      <footer class="orc-rodape"><button class="sec" data-r="0">Cancelar</button><button class="prim" data-r="1">${esc(confirmar)}</button></footer></div>`;
    document.body.appendChild(m);
    const inp = m.querySelector("input");
    const fim = (ok) => { document.removeEventListener("keydown", tecla, true); m.remove(); resolve(ok ? (campo ? inp.value.trim() || null : true) : null); };
    const tecla = (e) => { if (e.key === "Enter") fim(true); };      // fecha só pelos botões (ou Enter para confirmar); Esc e clique fora não fecham
    document.addEventListener("keydown", tecla, true);
    m.addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) fim(b.dataset.r === "1"); });
    (inp || m.querySelector('[data-r="1"]')).focus();
    if (inp) inp.select();
  });
}

// confirmação simples no estilo do app: o título e o botão saem do começo do texto (Excluir/Remover/Copiar)
function confirmar(texto) {
  const verbo = (/^(Excluir|Remover|Copiar)/.exec(texto) || [])[1];
  const titulo = verbo === "Copiar" ? "Copiar para os anos seguintes?" : verbo ? `${verbo}?` : "Confirmar";
  return dialogo({ titulo, texto, confirmar: verbo || "Confirmar" });
}

function linhaFaz(fid) { return document.querySelector(`[data-faz="${fid}"]`); }

$("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  seguro(async () => {
    if (t.dataset.preco !== undefined) {
      await api("PUT", `/api/versoes/${estado.vid}/precos`, [{ cultura_id: Number(t.dataset.preco), ano: Number(t.dataset.ano), preco: Number(t.value || 0) }]);
      await recarregar();
    } else if (t.dataset.anoF !== undefined) {
      const fid = Number(t.dataset.anoF), ano = Number(t.dataset.ano);
      const f = estado.dados.fazendas.find((x) => x.id === fid);
      const atual = f.anos[ano] || { area_ha: 0, valor: 0 };
      const novo = { area_ha: atual.area_ha, valor: atual.valor, [t.dataset.campo]: Number(t.value || 0) };
      await api("PUT", `/api/fazendas/${fid}/anos/${ano}`, novo);
      await recarregar();
    } else if (t.dataset.parcMes !== undefined || t.dataset.parcPct !== undefined) {
      const [fid, i] = (t.dataset.parcMes || t.dataset.parcPct).split(":").map(Number);
      const rasc = rascunho(fid);
      if (t.dataset.parcMes !== undefined) rasc[i].mes = Number(t.value); else rasc[i].percentual = Number(t.value || 0);
      desenhar();
    } else if (t.id === "sel-ano") { estado.anoResumo = Number(t.value); desenhar(); }
    else if (t.id === "cmp-a") estado.cmpA = Number(t.value);
    else if (t.id === "cmp-b") estado.cmpB = Number(t.value);
    else if (t.id === "cmp-ano") { estado.cmpAno = Number(t.value); desenhar(); }
    else if (t.dataset.f === "tipo" || t.dataset.f === "forma") {
      // muda a estrutura do cartão: mostra os campos certos; só grava em "Salvar dados"
      capturarFazenda(Number(t.closest("[data-faz]").dataset.faz));
      desenhar();
    }
  });
});

function rascunho(fid) {
  if (!estado.rascunhos[fid]) {
    const f = estado.dados.fazendas.find((x) => x.id === fid);
    estado.rascunhos[fid] = f.parcelas.map((p) => ({ ...p }));
  }
  return estado.rascunhos[fid];
}

function lerFazendaDaTela(fid) {
  const box = linhaFaz(fid);
  const f = estado.dados.fazendas.find((x) => x.id === fid);
  const v = (k) => { const el = box.querySelector(`[data-f="${k}"]`); return el ? el.value : f[k]; };
  const cid = v("cultura_id");
  return { nome: v("nome"), tipo: v("tipo"), arrendador: v("arrendador"), forma: v("forma"),
           cultura_id: cid ? Number(cid) : null, observacao: f.observacao || "" };
}

function capturarFazenda(fid) {      // guarda o que está digitado, sem gravar
  Object.assign(estado.dados.fazendas.find((x) => x.id === fid), lerFazendaDaTela(fid));
}

async function salvarFazenda(fid) {
  await api("PUT", `/api/fazendas/${fid}`, lerFazendaDaTela(fid));
  await recarregar();
}

$("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  seguro(async () => {
    if (t.dataset.salvarFaz) { await salvarFazenda(Number(t.dataset.salvarFaz)); mostrar("Dados salvos.", true); }
    else if (t.dataset.delFaz) {
      if (!await confirmar("Excluir esta fazenda e todos os seus valores?")) return;
      await api("DELETE", `/api/fazendas/${t.dataset.delFaz}`); await recarregar();
    } else if (t.id === "btn-add-faz") {
      await api("POST", `/api/versoes/${estado.vid}/fazendas`, {
        nome: $("#nf-nome").value, tipo: $("#nf-tipo").value, arrendador: $("#nf-arr").value,
        forma: $("#nf-forma").value, cultura_id: $("#nf-cult").value ? Number($("#nf-cult").value) : null,
      });
      await recarregar();
    } else if (t.dataset.gerar) {
      const fid = Number(t.dataset.gerar);
      const p = await api("POST", "/api/parcelas/gerar", {
        n: Number($(`#g-n-${fid}`).value), periodicidade: $(`#g-p-${fid}`).value, mes_inicio: Number($(`#g-m-${fid}`).value),
      });
      estado.rascunhos[fid] = p; desenhar();
      mostrar("Parcelas geradas. Ajuste se quiser e clique em Salvar vencimentos.", true);
    } else if (t.dataset.parcAdd) {
      const fid = Number(t.dataset.parcAdd), r = rascunho(fid);
      const usados = new Set(r.map((p) => p.mes));
      const livre = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((m) => !usados.has(m));
      if (!livre) throw new Error("Já há vencimento em todos os meses");
      r.push({ mes: livre, percentual: 0 }); desenhar();
    } else if (t.dataset.parcDel) {
      const [fid, i] = t.dataset.parcDel.split(":").map(Number);
      rascunho(fid).splice(i, 1); desenhar();
    } else if (t.dataset.parcSalvar) {
      const fid = Number(t.dataset.parcSalvar);
      const r = rascunho(fid).slice().sort((a, b) => a.mes - b.mes);
      await api("PUT", `/api/fazendas/${fid}/parcelas`, r);
      await recarregar(); mostrar("Vencimentos salvos.", true);
    } else if (t.id === "btn-horizonte") {
      await api("PUT", `/api/versoes/${estado.vid}/horizonte`, { horizonte: Number($("#inp-horizonte").value) });
      await recarregar(); mostrar("Horizonte atualizado.", true);
    } else if (t.dataset.replicarFaz) {
      const fid = Number(t.dataset.replicarFaz), ano = Number($(`#rf-ano-${fid}`).value);
      const campos = [];
      if ($(`#rf-area-${fid}`).checked) campos.push("area_ha");
      const v = $(`#rf-valor-${fid}`); if (v && v.checked) campos.push("valor");
      if (!campos.length) throw new Error("Marque pelo menos um item para replicar");
      if (!await confirmar(`Copiar ${campos.length > 1 ? "área e valor por hectare" : campos[0] === "area_ha" ? "a área" : "o valor por hectare"} de ${ano} para todos os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/fazendas/${fid}/replicar`, { ano, campos });
      await recarregar(); mostrar("Valores replicados.", true);
    } else if (t.dataset.replicarPreco) {
      const cid = Number(t.dataset.replicarPreco), ano = Number(document.getElementById(`rp-${cid}`).value);
      if (!await confirmar(`Copiar o valor de ${culturaDe(cid).nome} de ${ano} para todos os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/precos/replicar`, { cultura_id: cid, ano });
      await recarregar(); mostrar("Preços replicados.", true);
    } else if (t.id === "btn-comparar") {
      if (estado.cmpA === estado.cmpB) throw new Error("Escolha duas versões diferentes");
      estado.cmp = await api("GET", `/api/comparar?a=${estado.cmpA}&b=${estado.cmpB}`); desenhar();
    }
  });
});

montarMenu();
desenharSalvamento();
$("#btn-sair").addEventListener("click", () => Sekita.sair());
(async () => { try { if (!await Sekita.exigirLogin()) return; await recarregar(); } catch (e) { mostrar(e.message); } })();

// ---------------------------------------------------------------- menu lateral recolhível (a escolha fica guardada neste navegador)
const SB_CHAVE = "sekita.menu.recolhido";
function aplicarMenuRecolhido(recolhido) {
  document.body.classList.toggle("side-recolhida", recolhido);
  const b = $("#sb-toggle");
  b.innerHTML = icone(recolhido ? "seta" : "esquerda", 18);
  b.querySelector("svg").style.transform = recolhido ? "rotate(-90deg)" : "";
  b.title = recolhido ? "Expandir menu" : "Recolher menu"; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!recolhido));
  try { localStorage.setItem(SB_CHAVE, recolhido ? "1" : "0"); } catch (_) { /* sem armazenamento: só não lembra */ }
}
$("#sb-toggle").addEventListener("click", () => aplicarMenuRecolhido(!document.body.classList.contains("side-recolhida")));
// recolhido: os subitens de um grupo aparecem ao lado do ícone quando o mouse passa
$("#nav-modulos").addEventListener("mouseover", (e) => {
  if (!document.body.classList.contains("side-recolhida")) return;
  const g = e.target.closest(".nav-group"), sub = g && g.querySelector(".nav-sub");
  if (sub) sub.style.top = `${Math.max(8, Math.min(g.getBoundingClientRect().top, window.innerHeight - sub.offsetHeight - 8))}px`;
});
let recolhidoSalvo = false;
try { recolhidoSalvo = localStorage.getItem(SB_CHAVE) === "1"; } catch (_) { /* ignora */ }
aplicarMenuRecolhido(recolhidoSalvo);
