"use strict";
// ---------------------------------------------------------------- resultado por produto (cálculo; somente leitura)
const CASAS = { "R$ mil": 0, "R$/ha": 0, kg: 0, litro: 0, uni: 0, "uni/ha": 0, ha: 0, "%": 1, "R$/kg": 2, "R$/litro": 2, "R$/uni": 2, "kg/ha": 0, "litro/ha": 0 };

const AJUDA_RESULTADO = {
  area: "Hectares plantados do produto no ano, da tela Áreas por produto.",
  produtividade: "Produtividade do produto no ano, da tela Produtividade (kg, litro ou unidade por hectare).",
  producao: "Área plantada × produtividade.",
  descarte: "% de descarte do ano, da tela Premissas de produtos. Só aparece se houver descarte lançado.",
  perda_safra: "Volume produzido × % de descarte.",
  sementes: "Quantidade de sementes salvas no ano (Premissas de produtos). Sai da produção depois do descarte.",
  comerc_safra: "Volume produzido − perda por descarte − sementes salvas.",
  preco: "Preço de venda por kg (ou litro / unidade, conforme a medida do produto) do ano, da tela Preços.",
  receita_bruta_safra: "Quantidade disponível para venda × preço.",
  deducoes_safra: "Receita bruta × % da receita (dedução), em negativo.",
  deducoes_pct: "% de dedução de receita do ano, da tela Premissas de produtos.",
  receita_liquida_safra: "Receita bruta de produção − deduções.",
  receita_ha: "Receita líquida ÷ área plantada (R$ por hectare).",
  custo_total: "Custo total de produção por hectare × área × (volume produzido − sementes) ÷ volume produzido. Ou seja, o custo da safra descontada a semente. Só entram os grupos de custo classificados como diretos.",
  custo_ha: "Soma dos custos variáveis diretos por hectare do produto no ano (tela Custos variáveis).",
  margem_contribuicao: "Receita líquida − custos variáveis diretos totais.",
  margem_ha: "Margem de contribuição ÷ área plantada.",
  margem_contribuicao_pct: "Margem de contribuição ÷ receita líquida.",
  producao_anual: "Mesma quantidade disponível da safra: volume produzido − sementes salvas.",
  estoque_pct: "Quantidade estocada ÷ quantidade disponível para venda.",
  estocada: "Quantidade que fica para vender no ano seguinte (premissa Quantidade estocada, limitada ao disponível).",
  custo_medio: "Custo total de produção do ano (custo por hectare × área) ÷ volume produzido.",
  vendida_pct: "100% − estoque de passagem.",
  perda: "(Produção − estocada + estoque do ano anterior) × % de descarte do ano da venda.",
  comercializada: "Da produção do ano: (produção − estocada) × (1 − descarte do ano) − sementes salvas.",
  receita_producao: "Produção vendida no ano × preço do ano.",
  cpv_producao: "(Quantidade disponível − estocada) × custo médio do ano.",
  receita_estoque: "Estoque do ano anterior × (1 − descarte do ano) × preço do ano da venda.",
  cpv_estoque: "Estoque do ano anterior × custo médio do ano em que foi produzido.",
  custo_semente_ant: "Sementes salvas no ano anterior × custo médio do ano anterior. Só informativo: não entra no custo do produto vendido.",
  receita_bruta_anual: "Receita de produção do ano + receita do estoque do ano anterior.",
  deducoes_anual: "Receita bruta anual × % de dedução do ano da venda (inclusive para o estoque vendido).",
  receita_liquida_anual: "Receita bruta anual − deduções.",
  cpv: "Custo da produção vendida no ano + custo do estoque do ano anterior.",
  margem_bruta: "Receita líquida anual − custo do produto vendido.",
  margem_bruta_pct: "Margem bruta ÷ receita líquida anual.",
  estoque_valor: "Quantidade estocada × custo médio do ano, a custo.",
  estoque_semente: "Sementes salvas no ano × custo médio do ano.",
  vendida_anterior: "Quantidade estocada no ano anterior, vendida neste ano.",
  vendida_corrente: "Produção do ano vendida no próprio ano (igual a Produção vendida no ano).",
  comerc_total: "Produção vendida no ano + estoque do ano anterior após o descarte.",
};

const RES_SECOES = [["safra", "Resultado da safra"], ["anual", "Resultado anual"], ["estoque", "Estoque"]];
const RES_UNIDADE = { ha: "hectares" };

// linhas visíveis do detalhamento (busca, produto sem área, linhas opcionais zeradas e as de % que viram subtítulo); usado na tela e na exportação
function resContexto(r) {
  const escolha = estado.resCultura;
  const cu = escolha === "todas" || escolha === "resumo" ? null : r.culturas.find((x) => String(x.id) === String(escolha));
  const blocos = cu || r.consolidado, titulo = cu ? cu.nome : "Todos os produtos";
  const mostrar = (l) => !(cu && cu.sem_area && (l.id === "area" || /\/ha$/.test(l.unidade))) && (!l.opcional || r.anos.some((a) => Math.abs(l.valores[a]) > 1e-9));
  const secoes = RES_SECOES.map(([id, nome]) => ({ id, nome, linhas: (blocos[id] || []).filter(mostrar) })).filter((x) => x.linhas.length);
  return { cu, blocos, titulo, secoes, anosVis: r.anos.filter((a) => !estado.resAnosOcultos.includes(a)) };
}

function sparkResultado(l, anos) {
  const v = anos.map((a) => l.valores[a] || 0), mn = Math.min(...v), mx = Math.max(...v), W = 120, H = 26, pad = 3;
  const cor = Math.abs(v[v.length - 1] - v[0]) < 1e-9 ? "#8d9a92" : v[v.length - 1] > v[0] ? "#2f7d5b" : "#c0463a";
  const pts = v.map((x, i) => `${pad + (v.length > 1 ? (i * (W - 2 * pad)) / (v.length - 1) : 0)},${mx === mn ? H / 2 : H - pad - ((x - mn) / (mx - mn)) * (H - 2 * pad)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function htmlResultado() {
  const r = estado.resultado;
  if (!r) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para ver o resultado.</div>`;
  if (!r.culturas.length) {
    return `<div class="card vazio">Nenhum produto em <a href="#" data-modulo="areas">Áreas por produto</a>. O resultado é calculado para os produtos com área e para os que têm produtividade lançada (pecuária e leite).</div>`;
  }
  const escolha = estado.resCultura, resumo = escolha === "resumo";
  if (!resumo && !r.culturas.some((x) => String(x.id) === String(escolha))) estado.resCultura = String(r.culturas[0].id);
  const { cu, blocos, titulo, secoes, anosVis } = resContexto(r);
  const modos = `<div class="res-modos"><button class="modo ${resumo ? "ativa" : ""}" data-res-prod="resumo">Resumo</button>
    <button class="modo ${!resumo ? "ativa" : ""}" data-res-prod="${resumo ? r.culturas[0].id : estado.resCultura}">Detalhes</button></div>`;
  if (resumo) return htmlResumoResultado(r, modos);

  const chips = `<div class="prod-abas chips">
    ${r.culturas.map((c) => `<button class="prod-aba ${cu && cu.id === c.id ? "ativa" : ""}" data-res-prod="${c.id}">${iconeProduto(c.nome, c.grupo)}<span>${esc(c.nome)}</span></button>`).join("")}</div>`;

  const fmtV = (l, v) => (Math.abs(v) < 0.5 * Math.pow(10, -(CASAS[l.unidade] ?? 1)) ? "–" : l.unidade === "R$ mil" ? rs(v * 1000) : /^R\$/.test(l.unidade) ? rs(v, CASAS[l.unidade] ?? 1) : num(v, CASAS[l.unidade] ?? 1));
  const chaveNota = (l, a) => `${cu ? cu.id : "todas"}|${l.id}|${a}`;
  const celNota = (l, a) => { const k = chaveNota(l, a), n = (estado.notas || {})[k], atual = l.valores[a];
    return `<td class="nota-cel${n && n.cor ? " m-" + n.cor : ""}${n && n.comentario ? " tem-nota" : ""}${valorMudou(n, fmtV(l, atual), fmtV(l, n ? n.valor : 0)) ? " mudou" : ""}"
      data-nota="${esc(k)}" data-valor="${atual}" data-agora="${esc(fmtV(l, atual))}" data-era="${esc(n && n.valor != null ? fmtV(l, n.valor) : "")}">${fmtV(l, atual)}</td>`; };
  const linhaHtml = (l) => {
    const texto = AJUDA_RESULTADO[l.id];
    const ic = texto ? ` <button class="link ajuda-i" style="color:var(--verde);padding:0 4px" data-pop="${esc(texto)}" title="Como é calculado">ⓘ</button>` : "";
    return `<tr class="${l.estilo === "total" ? "total" : l.estilo === "dim" ? "dim" : ""}"><td class="res-ind"><span class="res-nome">${esc(l.nome)}</span> <span class="dim">· ${esc(RES_UNIDADE[l.unidade] || l.unidade)}</span>${ic}</td>
      ${anosVis.map((a) => celNota(l, a)).join("")}<td class="res-tend">${sparkResultado(l, r.anos)}</td></tr>`;
  };
  const ncols = anosVis.length + 2, buscando = false;
  const corpo = secoes.map((sc) => { const aberta = buscando || !estado.resSecFechadas[sc.nome];
    return `<tr class="res-sec" data-res-sec="${esc(sc.nome)}"><td colspan="${ncols}"><span class="chev ${aberta ? "" : "fechada"}">${icone("seta", 16)}</span>${sc.nome}</td></tr>${aberta ? sc.linhas.map(linhaHtml).join("") : ""}`; }).join("");
  return `<div class="res-topo">${modos}</div>${chips}
    <div class="card res-card"><div class="res-card-cab"><h2>${esc(titulo)}</h2></div>
      <div class="scroll"><table class="grade res res2"><thead><tr><th>Indicador</th>${anosVis.map((a) => `<th>${a}</th>`).join("")}<th>Tendência</th></tr></thead>
      <tbody>${corpo || `<tr><td colspan="${ncols}" class="dim">Nenhum indicador encontrado.</td></tr>`}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("click", (e) => {
  if (modAtivo() !== "resultado") return;
  const sec = e.target.closest("[data-res-sec]");
  if (sec) { const n = sec.dataset.resSec; estado.resSecFechadas[n] = !estado.resSecFechadas[n]; desenhar(); return; }
});

function htmlCompararResultado() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpResB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmres-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmres">Comparar</button></div>`;
  const c = estado.cmpRes;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpResAno) ? estado.cmpResAno : c.anos[0];
  const cel = (o) => `<td>${rs(o.a * 1000)}</td><td>${rs(o.b * 1000)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${rs(o.delta * 1000)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  const linhas = Object.entries(c.resultados).map(([n, d]) => `<tr class="total"><td colspan="5">${esc(n)}</td></tr>`
    + Object.entries(d).map(([nome, v]) => `<tr><td style="padding-left:24px" class="dim">${esc(nome)}</td>${cel(v[ano])}</tr>`).join("")).join("");
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmres-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Produto / linha</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (modAtivo() !== "resultado") return;
  if (t.id === "sel-res-cultura") { estado.resCultura = t.value; desenhar(); }
  else if (t.id === "cmres-b") { estado.cmpResB = Number(t.value); estado.cmpRes = null; }
  else if (t.id === "cmres-ano") { estado.cmpResAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || modAtivo() !== "resultado" || t.id !== "btn-cmres") return;
  seguro(async () => {
    const outra = estado.cmpResB || Number($("#cmres-b").value);
    estado.cmpResB = outra;
    const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
    const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
    estado.cmpRes = await api("GET", `/api/comparar-resultado?a=${base}&b=${comp}`);
    desenhar();
  });
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("[data-res-prod]");
  if (!t || modAtivo() !== "resultado") return;
  estado.resCultura = t.dataset.resProd; desenhar();
});

// ---------------------------------------------------------------- aba Resumo (visão executiva)
const rsMi = (v) => `R$ ${num(v * 1000, 0)}`;                         // v em R$ mil, mostrado em reais
const rsMilHa = (v) => `R$ ${num(v, 0)}`;                              // v em R$/ha

function graficoLinhasResumo(anos, series) {
  const mx = Math.max(...series.flatMap((s) => anos.map((a) => s.valores[a])), 1) / 1000, mn = 0;               // R$ mi
  const passo = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((p) => mx / p <= 5) || 10000, topo = Math.ceil(mx / passo) * passo, ticks = [];
  for (let t = mn; t <= topo; t += passo) ticks.push(t);
  const L = 110, R = 14, T = 12, B = 28, W = Math.max(380, Math.round((larguraConteudo() - 14) * 0.63 - 48)), H = 250, area = H - T - B, dx = anos.length > 1 ? (W - L - R) / (anos.length - 1) : 0;
  const X = (i) => (anos.length > 1 ? L + i * dx : (L + W - R) / 2), Y = (v) => T + area - (v / 1000 / topo) * area;
  const grade = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t * 1000)}" y2="${Y(t * 1000)}" stroke="#e6ece8"/><text x="${L - 8}" y="${Y(t * 1000) + 4}" text-anchor="end" font-size="11" fill="#5d6f66">${num(t * 1e6, 0)}</text>`).join("");
  const eixo = anos.map((a, i) => `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5d6f66">${a}</text>`).join("");
  const preenche = (s) => `<path d="M${X(0)},${Y(0)} ${anos.map((a, i) => `L${X(i)},${Y(s.valores[a])}`).join(" ")} L${X(anos.length - 1)},${Y(0)} Z" fill="${s.cor}" opacity=".08"/>`;
  const linhas = series.map((s) => `<polyline fill="none" stroke="${s.cor}" stroke-width="2.4" points="${anos.map((a, i) => `${X(i)},${Y(s.valores[a])}`).join(" ")}"/>
    ${anos.map((a, i) => `<circle cx="${X(i)}" cy="${Y(s.valores[a])}" r="4" fill="${s.cor}"><title>${s.nome} ${a}: ${rsMi(s.valores[a])}</title></circle>`).join("")}`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto" role="img" aria-label="Evolução do resultado">${grade}${preenche(series[0])}${linhas}${eixo}</svg>`;
}

// gráficos do Resumo são desenhados no tamanho real do espaço (texto e bolhas em pixels de verdade, sem esticar com a tela)
const larguraConteudo = () => { const c = document.getElementById("conteudo"); return c ? c.clientWidth : 1000; };

function graficoBolhasResumo(cfg) {
  const { itens, media, fmtY, tituloX, ticksY } = cfg;
  const W = Math.max(560, Math.min(1180, larguraConteudo() - 72)), H = 340, L = 82, R = 30, T = 14, B = 46, aw = W - L - R, ah = H - T - B, base = 18;
  const maxX = Math.max(...itens.map((i) => i.x), 1), maxY = Math.max(...itens.map((i) => i.y), media, 1), maxS = Math.max(...itens.map((i) => i.s), 1);
  const passo = (m, lista) => lista.find((p) => (m * 1.12) / p <= 5) || lista[lista.length - 1] * 2;
  const passoY = passo(maxY, ticksY), topoY = Math.ceil((maxY * 1.12) / passoY) * passoY;
  const passoX = passo(maxX, [10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000]), topoX = Math.ceil((maxX * 1.12) / passoX) * passoX;
  const X = (v) => L + 16 + (v / topoX) * (aw - 32), Y = (v) => T + ah - base - (v / topoY) * (ah - base);
  let grade = "";
  for (let t = 0; t <= topoY; t += passoY) grade += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e8eeea"/><text x="${L - 10}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#6b7d73">${fmtY(t)}</text>`;
  for (let t = passoX; t <= topoX; t += passoX) grade += `<text x="${X(t)}" y="${H - 24}" text-anchor="middle" font-size="11" fill="#6b7d73">R$ ${num(t * 1000, 0)}</text>`;
  const pos = itens.map((i) => ({ ...i, cx: X(i.x), cy: Y(i.y), r: 8 + 14 * Math.sqrt(i.s / maxS) })).sort((u, v) => u.cy - v.cy);
  const caixas = [];                                                                   // evita rótulos um em cima do outro: empurra para baixo quem colidir
  pos.forEach((i) => { let ty = i.cy - 2; for (let k = 0; k < 8; k++) { if (caixas.some((c) => Math.abs(c.x - i.cx) < 118 && Math.abs(c.y - ty) < 27)) ty += 27; else break; } i.ty = ty; caixas.push({ x: i.cx, y: ty }); });
  const bolhas = pos.map((i) => { const acima = i.y >= media;
    return `<g><circle cx="${i.cx}" cy="${i.cy}" r="${i.r}" fill="${acima ? "#2f7d5b" : "#a9b4ad"}" fill-opacity=".45" stroke="${acima ? "#2f7d5b" : "#8d9a92"}" stroke-width="1.4"><title>${esc(i.nome)}: ${i.dica}</title></circle>
      <text x="${i.cx + i.r + 7}" y="${i.ty}" font-size="12" font-weight="700" fill="#17261f">${esc(i.nome)}</text><text x="${i.cx + i.r + 7}" y="${i.ty + 13}" font-size="11" fill="#5d6f66">${i.rotulo}</text></g>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto" role="img" aria-label="${tituloX}">${grade}
    <line x1="${L}" x2="${W - R}" y1="${Y(media)}" y2="${Y(media)}" stroke="#cf9a3c" stroke-width="1.4" stroke-dasharray="6 5"/><text x="${W - R}" y="${Y(media) - 6}" text-anchor="end" font-size="11" fill="#8a6a2a">${cfg.rotMedia}</text>
    ${bolhas}<text x="${L + aw / 2}" y="${H - 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#5d6f66">${tituloX}</text></svg>`;
}

function htmlResumoResultado(r, modos) {
  const anos = r.anos, ano = anos.includes(estado.resAno) ? estado.resAno : anos[0], tot = r.consolidado;
  const val = (b, id, a) => { const l = [...b.safra, ...b.anual].find((x) => x.id === id); return l ? (l.valores[a] || 0) : 0; };
  const rlT = (a) => val(tot, "receita_liquida_safra", a), mcT = (a) => val(tot, "margem_contribuicao", a);
  const todos = r.culturas.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, semArea: !!c.sem_area, un: c.unidade, area: val(c, "area", ano), qtd: val(c, "producao", ano),
    rl: val(c, "receita_liquida_safra", ano), mc: val(c, "margem_contribuicao", ano), mha: val(c, "margem_ha", ano) })).filter((i) => i.rl || i.mc || i.area);
  const itens = todos.filter((i) => !i.semArea && i.area > 0);                       // por hectare: só os produtos com área
  const areaTot = itens.reduce((t, i) => t + i.area, 0), mcArea = itens.reduce((t, i) => t + i.mc, 0), mediaHa = areaTot > 0 ? (mcArea * 1000) / areaTot : 0;
  const lider = [...itens].sort((a, b) => b.mha - a.mha)[0];                         // melhor margem por hectare
  const liderTotal = [...todos].sort((a, b) => b.mc - a.mc)[0];                      // maior margem de contribuição (inclui pecuária e leite)
  const ant = anos[anos.indexOf(ano) - 1], varRec = ant !== undefined && rlT(ant) ? ((rlT(ano) - rlT(ant)) / Math.abs(rlT(ant))) * 100 : null;
  const pills = `<div class="anos-pills dv-anos" role="group" aria-label="Ano">${anos.map((y) => `<button class="${y === ano ? "ativa" : ""}" data-res-ano="${y}">${y}</button>`).join("")}</div>`;

  const kpis = `<div class="rs-kpis">
    <div class="rs-kpi"><div class="rs-kpi-topo"><span>Receita líquida</span><em class="chip-ano">${ano}</em></div><strong>${rsMi(rlT(ano))}</strong>
      ${varRec === null ? "" : `<p class="${varRec >= 0 ? "pos-bom" : "neg-ruim"}">${icone("tendencia", 16)} ${varRec >= 0 ? "+" : ""}${num(varRec, 1)}% vs. ${ant}</p>`}</div>
    <div class="rs-kpi"><div class="rs-kpi-topo"><span>Margem de contribuição</span></div><strong>${rsMi(mcT(ano))}</strong><p>${num(rlT(ano) ? (mcT(ano) / rlT(ano)) * 100 : 0, 1)}% da receita líquida</p></div>
    <div class="rs-kpi"><div class="rs-kpi-topo"><span>Margem por hectare</span></div><strong>${rsMilHa(mediaHa)}</strong><p>${num(areaTot, 0)} ha plantados</p></div>
    <div class="rs-kpi destaque"><div class="rs-kpi-topo"><span>Melhor desempenho</span></div><strong>${lider ? esc(lider.nome) : "–"}</strong>${lider ? `<p class="pos-bom">${icone("trofeu", 16)} Maior margem por hectare</p>` : ""}</div></div>`;

  const serie = (f) => Object.fromEntries(anos.map((a) => [a, f(a)]));
  const evolucao = `<div class="card">${cabecaCartao("tendencia", "Evolução do resultado", `<span class="leg"><i style="background:#2f7d5b"></i>Receita <i style="background:#cf9a3c"></i>Margem</span>`)}
    <p class="dim rs-sub">Receita líquida e margem de contribuição</p>${graficoLinhasResumo(anos, [{ nome: "Receita", cor: "#2f7d5b", valores: serie(rlT) }, { nome: "Margem", cor: "#cf9a3c", valores: serie(mcT) }])}</div>`;
  const modoRank = estado.resRankModo === "ha" ? "ha" : "total";
  const baseRank = modoRank === "ha" ? [...itens].sort((x, y) => y.mha - x.mha) : [...todos].sort((x, y) => y.mc - x.mc);
  const valRank = (i) => (modoRank === "ha" ? i.mha : i.mc), maxRank = Math.max(...baseRank.map(valRank), 1);
  const alterna = (nome, rot, atual, attr) => `<span class="rs-alt">${[["total", "R$"], ["ha", "R$/ha"]].map(([v, t]) => `<button class="${atual === v ? "ativa" : ""}" ${attr}="${v}">${t}</button>`).join("")}</span>`;
  const ranking = `<div class="card">${cabecaCartao("chart", "Margem por produto", alterna("rank", "", modoRank, "data-rs-rank"))}<p class="dim rs-sub">${modoRank === "ha" ? `R$/ha · ${ano} · só produtos com área` : `Margem de contribuição · ${ano}`}</p>
    <ul class="rs-rank">${baseRank.map((i) => `<li><span>${iconeProduto(i.nome, i.grupo)}${esc(i.nome)}</span><div class="rs-trilho"><div style="width:${Math.max((valRank(i) / maxRank) * 100, 0)}%"></div></div><b>${modoRank === "ha" ? `R$ ${num(i.mha, 0)}` : rsMi(i.mc)}</b></li>`).join("") || '<li class="dim">Sem produtos neste ano.</li>'}</ul></div>`;

  // segunda visão: tira de números, bolhas e cartões por produto
  const tira = `<div class="rs-tira"><div><span>Resultado consolidado</span><strong>${rsMi(mcT(ano))}</strong></div><div><span>Área total</span><strong>${num(areaTot, 0)} ha</strong></div>
    <div><span>Margem média</span><strong>${num(rlT(ano) ? (mcT(ano) / rlT(ano)) * 100 : 0, 1)}%</strong></div><div class="destaque"><span>Produto líder</span><strong>${liderTotal ? esc(liderTotal.nome) : "–"}</strong></div></div>`;
  const modoB = estado.resBolhasModo === "pct" ? "pct" : "ha";
  const altB = `<span class="rs-alt">${[["ha", "Por hectare"], ["pct", "Por margem %"]].map(([v, t]) => `<button class="${modoB === v ? "ativa" : ""}" data-rs-bolhas="${v}">${t}</button>`).join("")}</span>`;
  let graficoB, subB, legB = `<span class="leg"><i style="background:#2f7d5b"></i>Acima da média <i style="background:#9aa89f"></i>Abaixo da média</span>`;
  if (modoB === "ha") {
    const sem = todos.filter((i) => i.semArea).map((i) => i.nome);
    subB = `O tamanho do círculo representa a área plantada${sem.length ? ` · sem hectare, ficam de fora: ${sem.map(esc).join(", ")} (veja em "Por margem %")` : ""}`;
    graficoB = itens.length ? graficoBolhasResumo({ itens: itens.map((i) => ({ nome: i.nome, x: i.rl, y: i.mha, s: i.area, rotulo: `R$ ${num(i.mha, 0)}/ha`, dica: `receita ${rsMi(i.rl)} · ${rsMilHa(i.mha)}/ha · ${num(i.area, 0)} ha` })),
      media: mediaHa, rotMedia: `Média: R$ ${num(mediaHa, 0)}/ha`, tituloX: "Receita líquida", ticksY: [10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000], fmtY: (t) => `R$ ${num(t, 0)}` }) : '<p class="dim">Sem produtos com área neste ano.</p>';
  } else {
    const mm = rlT(ano) ? (mcT(ano) / rlT(ano)) * 100 : 0, cp = todos.filter((i) => i.rl > 0);
    subB = "Todos os produtos, inclusive pecuária e leite · o tamanho do círculo representa a receita líquida";
    graficoB = cp.length ? graficoBolhasResumo({ itens: cp.map((i) => ({ nome: i.nome, x: i.rl, y: (i.mc / i.rl) * 100, s: i.rl, rotulo: `${num((i.mc / i.rl) * 100, 1)}%`, dica: `receita ${rsMi(i.rl)} · margem ${num((i.mc / i.rl) * 100, 1)}%` })),
      media: mm, rotMedia: `Média: ${num(mm, 1)}%`, tituloX: "Receita líquida", ticksY: [5, 10, 20, 25, 50], fmtY: (t) => `${num(t, 0)}%` }) : '<p class="dim">Sem receita neste ano.</p>';
  }
  const bolhas = `<div class="card">${cabecaCartao("chart", modoB === "ha" ? "Receita × margem por hectare" : "Receita × margem (%)", altB + legB)}<p class="dim rs-sub">${subB}</p>${graficoB}</div>`;
  const ordenados = [...todos].sort((x, y) => y.mc - x.mc);
  const cartoes = `<div class="rs-cartoes">${ordenados.map((i) => `<div class="rs-cartao ${liderTotal && i.id === liderTotal.id ? "lider" : ""}">
      <div class="rs-cartao-topo"><span class="emoji-grande">${emojiProduto(i.nome, i.grupo)}</span><div><b>${esc(i.nome)}</b><small>${i.semArea ? `${num(i.qtd, 0)} ${esc(i.un)}/ano · sem área` : `${num(i.area, 0)} ha · ${num(areaTot ? (i.area / areaTot) * 100 : 0, 1)}% da área`}</small></div>${liderTotal && i.id === liderTotal.id ? `<span class="selo-lider">${icone("trofeu", 16)} Líder</span>` : ""}</div>
      <div class="rs-cartao-num"><div><span>Receita</span><b>${rsMi(i.rl)}</b></div><div><span>Margem</span><b>${num(i.rl ? (i.mc / i.rl) * 100 : 0, 1)}%</b></div>${i.semArea ? `<div><span>Margem R$</span><b>${rsMi(i.mc)}</b></div>` : `<div><span>R$/ha</span><b>R$ ${num(i.mha, 0)}</b></div>`}</div></div>`).join("")}</div>`;
  return `<div class="res-topo">${modos}${pills}</div>` + kpis + `<div class="rs-grade">${evolucao}${ranking}</div>` + tira + bolhas + cartoes;
}

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("[data-res-ano]");
  if (!t || modAtivo() !== "resultado") return;
  estado.resAno = Number(t.dataset.resAno); desenhar();
});

let resRedim = null;                                    // ao mudar o tamanho da janela, o Resumo redesenha os gráficos na nova largura
window.addEventListener("resize", () => { clearTimeout(resRedim); resRedim = setTimeout(() => { if (typeof modAtivo === "function" && modAtivo() === "resultado" && estado.resCultura === "resumo") desenhar(); }, 250); });

document.querySelector("#conteudo").addEventListener("click", (e) => {
  if (modAtivo() !== "resultado") return;
  const r1 = e.target.closest("[data-rs-rank]"), r2 = e.target.closest("[data-rs-bolhas]");
  if (r1) { estado.resRankModo = r1.dataset.rsRank; desenhar(); } else if (r2) { estado.resBolhasModo = r2.dataset.rsBolhas; desenhar(); }
});
