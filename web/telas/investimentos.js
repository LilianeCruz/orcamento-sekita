"use strict";
// ---------------------------------------------------------------- Investimentos e desinvestimentos
function htmlInvestimentos() {
  const d = estado.invest;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  if (!d.estrutura) {
    return `<div class="card"><h2>Investimentos</h2><p class="dim">A conta padrão de cada tipo é uma conta do ativo do balanço, que vem da estrutura do Fechamento Contábil.
      Importe-a na tela <a href="#" data-modulo="dre">DRE</a> antes de cadastrar os tipos.</p></div>`;
  }
  const fmt = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "–" : "R$ " + num(v * 1000, 0));
  const nAnos = d.anos.length;
  if (estado.modulo === "cadinvest") return aviso + htmlTiposInvestimento(d, dis, true);          // em Cadastros: só o cadastro dos tipos
  if (estado.invTela === "tipos") return aviso + htmlTiposInvestimento(d, dis);
  const geral = estado.invAba === "geral";
  const modos = `<div class="res-modos"><button class="modo ${geral ? "" : "ativa"}" data-inv-modo="projetos">Projeto por projeto</button>
    <button class="modo ${geral ? "ativa" : ""}" data-inv-modo="geral">Visão geral</button></div>`;
  const barra = `<div class="inv-barra">${modos}</div>`;
  const ic = (l) => (l.explicacao ? ` <button class="link ajuda-i" style="color:var(--verde);padding:0 4px" data-pop="${esc(l.explicacao)}" title="Como é calculado">ⓘ</button>` : "");
  const linha = (t, l) => {
    const cel = (y) => (l.editavel[y] ? `<td><input type="number" step="any" min="0" ${dis} data-moeda data-inv="${t.id}" data-campo="${l.campo}" data-ano="${y}" value="${l.valores[y] || ""}"></td>` : `<td class="${l.estilo === "total" ? "total" : "dim"}">${fmt(l.valores[y])}</td>`);
    const repl = l.campo && l.campo !== "saldo_ini" && !trava()
      ? `<td><select id="rinv-${t.id}-${l.campo}">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select> <button class="sec" data-inv-replicar="${t.id}|${l.campo}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button></td>` : "<td></td>";
    return `<tr class="${l.estilo === "total" ? "total" : ""}"><td style="padding-left:24px">${esc(l.nome)}${ic(l)}</td>${d.anos.map(cel).join("")}${repl}</tr>`;
  };
  const bloco = (t) => `<tr><td colspan="${nAnos + 2}" style="background:var(--fundo);font-weight:600">${esc(t.nome)}
      <span class="dim" style="font-weight:400"> · ${esc(t.classificacao)} · ${esc(t.conta_caminho.join(" › ") || t.conta_nome)}</span></td></tr>
      ${t.linhas.map((l) => linha(t, l)).join("")}
      ${t.avisos.map((a) => `<tr><td colspan="${nAnos + 2}" class="pos" style="text-align:left;white-space:normal">${esc(a)}</td></tr>`).join("")}`;
  const secao = (titulo, lista) => (lista.length ? `<tr><td colspan="${nAnos + 2}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${titulo}</td></tr>${lista.map(bloco).join("")}` : "");
  const inv = d.tipos.filter((t) => t.natureza === "investimento"), des = d.tipos.filter((t) => t.natureza === "desinvestimento");
  const todos = trava() || !d.tipos.length ? "" : `<div class="linha"><strong>Replicar todos os tipos:</strong> a partir de
      <select id="rinv-todos">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" id="btn-inv-todos" title="Copia o novo orçamento e o saldo a carregar do ano escolhido para os anos seguintes">Replicar todos →</button></div>`;
  const orcamento = d.tipos.length ? `<div class="card"><h2>Orçamento por ano</h2>
    <p class="dim">Digite o que será investido (ou desinvestido) em cada ano. Nos investimentos que carregam saldo, o <strong>saldo a carregar</strong> é o que fica a realizar e vira o saldo do ano seguinte.</p>${todos}
    <div class="scroll"><table><thead><tr><th>Tipo</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${secao("Investimentos", inv)}${secao("Desinvestimentos", des)}</tbody></table></div></div>`
    : `<div class="card"><p class="dim">Nenhum tipo no orçamento. Abra <strong>Tipos de investimento</strong> para cadastrar e adicionar.</p></div>`;
  const r = d.resumo, fin = estado.capt ? estado.capt.resumo.invest : null;
  const linhasRes = (lista, campos) => lista.map((x) => `<tr><td>${esc(x.nome)}</td>${d.anos.map((y) => `<td>${fmt(campos(x)[y])}</td>`).join("")}</tr>`).join("");
  const resumo = d.tipos.length ? `<div class="card"><h2>Resumo</h2>
    <div class="scroll"><table class="inv-res-tab"><thead><tr><th></th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      <tr class="total"><td>Total investido</td>${d.anos.map((y) => `<td>${fmt(r.totais.investido[y])}</td>`).join("")}</tr>
      <tr><td>Total desinvestido</td>${d.anos.map((y) => `<td>${fmt(r.totais.desinvestido[y])}</td>`).join("")}</tr>
      <tr class="total"><td>Líquido (investimentos − desinvestimentos)</td>${d.anos.map((y) => `<td>${fmt(r.totais.liquido[y])}</td>`).join("")}</tr>
      ${fin ? `<tr><td>Valor financiado</td>${d.anos.map((y) => `<td>${fmt(fin.captado[y])}</td>`).join("")}</tr>
      <tr><td>Juros do financiamento</td>${d.anos.map((y) => `<td>${fmt(fin.juros[y])}</td>`).join("")}</tr>` : ""}</tbody></table></div>
    <div class="scroll" style="margin-top:14px"><table class="inv-res-tab"><thead><tr><th>Movimento líquido por conta do balanço</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${linhasRes(r.por_conta, (x) => x.liquido)}</tbody></table></div></div>` : `<div class="card"><p class="dim">Nenhum tipo no orçamento. Use <strong>Projeto por projeto</strong> para cadastrar e adicionar.</p></div>`;
  if (!geral) return aviso + htmlInvProjetos(d, dis, modos);
  return `${aviso}${barra}${resumo}${htmlDepreciacao(d, dis)}${htmlCompararInvestimentos()}`;
}

// ---------------------------------------------------------------- projeto por projeto (lista à esquerda, passos à direita)
const INV_PASSOS = ["Dados básicos", "Orçamento anual", "Financiamento", "Revisão"];
function invLinhas(t) { return Object.fromEntries(t.linhas.map((l) => [l.id, l])); }
function invPassos(t, d) {                                    // passos que existem para o tipo e quais já têm conteúdo
  const L = invLinhas(t), soma = (l) => (l ? d.anos.reduce((x, y) => x + (l.valores[y] || 0), 0) : 0);
  const orcou = soma(L.novo) + soma(L.saldo_ini) > 0, financiou = soma(L.financiado) > 0;
  return t.natureza === "investimento"
    ? [["Dados básicos", true], ["Orçamento anual", orcou], ["Financiamento", financiou], ["Revisão", orcou]]
    : [["Dados básicos", true], ["Orçamento anual", orcou], ["Revisão", orcou]];
}
function htmlInvProjetos(d, dis, modos) {
  const novo = trava() ? "" : `<button class="inv-novo" id="btn-inv-novo-proj">${icone("plus", 18)} Novo investimento</button>`;
  const adicionando = !trava() && (estado.invAdd || !d.tipos.length);
  if (d.tipos.length && !d.tipos.some((x) => x.id === estado.invSel)) estado.invSel = d.tipos[0].id;
  const t = d.tipos.find((x) => x.id === estado.invSel);
  const item = (x) => `<div class="inv-item ${!adicionando && t && x.id === t.id ? "ativa" : ""}"><button class="inv-sel" data-inv-sel="${x.id}"><span class="inv-ico ${x.natureza === "investimento" ? "" : "des"}">${icone(x.natureza === "investimento" ? "moedas" : "atualizar", 22)}</span>
      <span class="inv-item-txt"><b>${esc(x.nome)}</b><small>${esc(x.classificacao)}${x.natureza === "investimento" ? "" : " · Desinvestimento"}</small><i class="inv-prog"><u style="width:${(invPassos(x, d).filter((p) => p[1]).length / invPassos(x, d).length) * 100}%"></u></i></span></button>
    ${trava() ? "" : btnLixo(`data-inv-retirar="${x.id}"`, "Excluir deste orçamento")}</div>`;
  let detalhe;
  if (adicionando) detalhe = htmlInvAdicionar(d);
  else {
    const passos = invPassos(t, d), passo = Math.min(Math.max(estado.invPasso || 1, 1), passos.length);
    const stepper = `<div class="inv-passos">${passos.map(([nome, feito], i) => `<button class="${i + 1 === passo ? "ativa" : ""} ${feito ? "feito" : ""}" data-inv-passo="${i + 1}"><span>${feito && i + 1 !== passo ? icone("ok", 14) : i + 1}</span>${nome}</button>`).join("")}</div>`;
    const nome = passos[passo - 1][0];
    let corpo = "";
    if (nome === "Dados básicos") corpo = htmlInvDados(d, t);
    else if (nome === "Orçamento anual") corpo = htmlInvAnual(d, t, dis, passos);
    else if (nome === "Financiamento") corpo = `<div class="inv-fin">${htmlFinanciamentoInvestimentos(t.id)}</div>${invProximo(passo, passos)}`;
    else corpo = htmlInvRevisao(d, t);
    detalhe = `<div class="inv-cab"><span class="inv-ico grande ${t.natureza === "investimento" ? "" : "des"}">${icone(t.natureza === "investimento" ? "moedas" : "atualizar", 28)}</span>
      <div><h2>${esc(t.nome)}</h2><p class="dim">${esc(t.classificacao)} · ${esc(t.conta_caminho.slice(-1)[0] || t.conta_nome)}</p></div></div>${stepper}${corpo}`;
  }
  return `<div class="inv-barra">${modos}</div><div class="inv-mestre"><aside class="inv-lista"><div class="inv-lista-cab"><div><h2>Projetos</h2><p class="dim">${d.tipos.length} cadastrado${d.tipos.length === 1 ? "" : "s"}</p></div>
      ${trava() ? "" : `<button class="inv-mais" id="btn-inv-novo-proj" title="Adicionar investimento" aria-label="Adicionar investimento">${icone("plus", 20)}</button>`}</div>
      <button class="link inv-tipos-link" id="btn-inv-tipos">${icone("editar", 14)} Tipos de investimento</button>
      ${d.tipos.map(item).join("")}${novo}</aside>
    <section class="inv-detalhe">${detalhe}</section></div>`;
}
function htmlInvAdicionar(d) {                                // escolher um tipo já cadastrado (com busca) ou criar um novo
  const livres = d.cadastro.filter((x) => !x.ativo);
  const linha = (x) => `<div class="inv-opcao" data-busca="${esc((x.nome + " " + x.classificacao + " " + x.natureza).toLowerCase())}"><span class="inv-ico ${x.natureza === "investimento" ? "" : "des"}">${icone(x.natureza === "investimento" ? "moedas" : "atualizar", 20)}</span>
      <span class="inv-item-txt"><b>${esc(x.nome)}</b><small>${esc(x.classificacao)} · ${x.natureza === "investimento" ? "Investimento" : "Desinvestimento"}</small></span>
      <button class="sec" data-inv-incluir="${x.id}">Adicionar</button></div>`;
  return `<div class="inv-cab"><div><h2>Adicionar investimento</h2><p class="dim">Escolha um tipo já cadastrado ou crie um novo.</p></div></div>
    ${livres.length ? `<div class="inv-busca">${icone("busca", 16)}<input id="inv-busca" type="search" placeholder="Buscar tipo de investimento" autocomplete="off"></div>
      <div class="inv-opcoes">${livres.map(linha).join("")}<p class="dim inv-sem" hidden>Nenhum tipo encontrado.</p></div>` : `<p class="dim">Todos os tipos cadastrados já estão neste orçamento.</p>`}
    <div class="inv-rodape">${d.tipos.length ? `<button class="sec" data-inv-cancelar-add>Cancelar</button>` : "<span></span>"}<button class="prim" data-inv-criar>${icone("plus", 16)} Criar novo tipo</button></div>`;
}
function invProximo(passo, passos) {
  return passo < passos.length ? `<div class="inv-rodape"><span></span><button class="prim" data-inv-passo="${passo + 1}">Continuar para ${passos[passo][0].toLowerCase()} →</button></div>` : "";
}
function htmlInvDados(d, t) {
  if (estado.invForm === t.id) return htmlFormTipoInv(d, d.cadastro.find((x) => x.id === t.id));
  const cel = (r, v) => `<div class="inv-dado"><span>${r}</span><b>${v}</b></div>`;
  return `<div class="inv-dados">${cel("Natureza", t.natureza === "investimento" ? "Investimento" : "Desinvestimento")}${cel("Classificação", esc(t.classificacao))}
    ${cel("Conta do balanço", esc(t.conta_caminho.join(" › ") || t.conta_nome))}
    ${t.natureza === "investimento" ? `${cel("Saldo do ano anterior", t.carrega_saldo ? "Carrega o saldo a realizar" : "Não carrega")}
      ${cel("Depreciação", t.vida_util > 0 ? `${num(t.vida_util, 0)} ano(s) · residual ${num(t.residual_pct, 0)}%${t.carencia ? ` · carência ${t.carencia}` : ""}` : "Não deprecia")}` : ""}</div>
    <div class="inv-rodape">${trava() ? "<span></span>" : `<span class="inv-acoes"><button class="sec" data-inv-editar-aqui="${t.id}">${icone("editar", 16)} Editar dados</button>
      ${btnLixo(`data-inv-retirar="${t.id}"`, "Excluir deste orçamento")}</span>`}<button class="prim" data-inv-passo="2">Continuar para orçamento anual →</button></div>`;
}
function htmlInvAnual(d, t, dis, passos) {
  const L = invLinhas(t), ehInv = t.natureza === "investimento", carrega = !!L.saldo_ini;
  const fm = (v) => fmtMoeda((v || 0) * 1000);
  const campo = (l, y) => (l.editavel[y] ? `<input class="moeda" type="text" inputmode="decimal" ${dis} data-invr="${t.id}|${l.campo}|${y}" value="${fm(l.valores[y])}">` : `<b class="inv-calc">${fm(l.valores[y])}</b>`);
  const cols = [];
  if (carrega) cols.push(["Saldo anterior", (y, i) => `<td>${campo(L.saldo_ini, y)}<small>${L.saldo_ini.editavel[y] ? "" : `de ${d.anos[i - 1]}`}</small></td>`]);
  cols.push([carrega ? "Novo orçamento" : ehInv ? "Orçamento do ano (investido)" : "Desinvestimento do ano", (y) => `<td>${campo(L.novo, y)}</td>`]);
  if (carrega) cols.push(["Saldo a carregar", (y) => `<td>${campo(L.a_carregar, y)}</td>`], ["Investido no ano", (y) => `<td class="inv-res"><b>${fm(L.investido.valores[y])}</b><small>calculado</small></td>`]);
  if (ehInv) cols.push(["Valor financiado", (y) => { const inv = carrega ? L.investido.valores[y] : L.novo.valores[y];
    return `<td>${campo(L.financiado, y)}${inv > 0 && L.financiado.valores[y] > 0 ? `<small>${num((L.financiado.valores[y] / inv) * 100, 0)}% do investido</small>` : ""}</td>`; }]);
  const barraRep = dis ? "" : `<button class="sec" data-inv-replicar-linha="${t.id}">${icone("replicar", 16)} Replicar ${d.anos[0]} nos anos seguintes</button>`;
  const erros = [];
  d.anos.forEach((y) => { if (ehInv) { const inv = carrega ? L.investido.valores[y] : L.novo.valores[y]; if (L.financiado.valores[y] > inv + 0.5) erros.push(`${y}: o valor financiado passa do investido.`); } });
  const ok = !erros.length && !t.avisos.length;
  return `<div class="inv-legenda">${barraRep}</div>
    <div class="scroll"><table class="inv-tab"><thead><tr><th>Ano</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>
      ${d.anos.map((y, i) => `<tr><td class="inv-ano"><b>${y}</b></td>${cols.map((c) => c[1](y, i)).join("")}</tr>`).join("")}</tbody></table></div>
    ${ok ? "" : `<div class="inv-valida alerta"><span class="inv-valida-ic">${icone("alerta", 20)}</span><div><b>Atenção</b><p>${[...erros, ...t.avisos].map(esc).join(" ")}</p></div></div>`}${invProximo(2, passos)}`;
}
function htmlInvRevisao(d, t) {
  const L = invLinhas(t), fm = (v) => fmtMoeda((v || 0) * 1000), ehInv = t.natureza === "investimento", carrega = !!L.saldo_ini;
  const dep = ehInv ? d.depreciacao.linhas.find((l) => l.tipo_id === t.id) : null;
  const val = (y) => (ehInv ? (carrega ? L.investido.valores[y] : L.novo.valores[y]) : L.novo.valores[y]);
  const tot = (f) => d.anos.reduce((a, y) => a + (f(y) || 0), 0);
  const cab = ehInv ? ["Investido", "Financiado", "Recursos próprios", ...(dep ? ["Depreciação"] : [])] : ["Desinvestido"];
  const lin = (y) => (ehInv ? [val(y), L.financiado.valores[y], val(y) - L.financiado.valores[y], ...(dep ? [dep.valores[y]] : [])] : [val(y)]);
  const totais = ehInv ? [tot(val), tot((y) => L.financiado.valores[y]), tot((y) => val(y) - L.financiado.valores[y]), ...(dep ? [tot((y) => dep.valores[y])] : [])] : [tot(val)];
  return `<div class="scroll"><table class="inv-tab"><thead><tr><th>Ano</th>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
    ${d.anos.map((y) => `<tr><td class="inv-ano"><b>${y}</b></td>${lin(y).map((v) => `<td><b class="inv-calc">${fm(v)}</b></td>`).join("")}</tr>`).join("")}
    <tr class="total"><td class="inv-ano"><b>Total</b></td>${totais.map((v) => `<td><b>${fm(v)}</b></td>`).join("")}</tr></tbody></table></div>
    ${t.avisos.length ? `<div class="inv-valida alerta"><span class="inv-valida-ic">${icone("alerta", 20)}</span><div><b>Atenção</b><p>${t.avisos.map(esc).join(" ")}</p></div></div>` : ""}`;
}

function htmlDepreciacao(d, dis) {
  const dp = d.depreciacao, ex = dp.existente;
  if (!d.tipos.length && !ex) return "";
  const fmt = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "–" : "R$ " + num(v * 1000, 0));
  const existe = ex ? `<div class="card"><h2>O que existe hoje · realizado ${ex.ano}${ex.meses ? ` (balanço de ${fimPeriodo(ex)})` : ""}</h2>
    <div class="scroll"><table><thead><tr><th>Conta do imobilizado</th><th>Saldo</th></tr></thead><tbody>
      ${ex.contas.map((c) => `<tr><td>${esc(c.nome)}</td><td>${c.saldo === null || c.saldo === undefined ? "–" : fmt(c.saldo)}</td></tr>`).join("")}
      <tr class="total"><td>Imobilizado bruto (sem a depreciação acumulada)</td><td>${fmt(ex.bruto)}</td></tr>
      <tr><td>Depreciação acumulada</td><td>${fmt(ex.acumulada)}</td></tr>
      <tr class="total"><td>Imobilizado líquido</td><td>${fmt(ex.liquido)}</td></tr>
      <tr><td>Depreciação do ano ${ex.ano} (DRE realizada${ex.meses ? `, janeiro a ${MESES[ex.meses - 1].toLowerCase()} anualizada` : ""})</td><td>${fmt(ex.depreciacao_ano)}</td></tr>
      <tr><td>Taxa média de depreciação (depreciação do ano ÷ imobilizado bruto)</td><td>${ex.taxa_calculada === null ? "–" : num(ex.taxa_calculada, 2) + "%"}</td></tr></tbody></table></div></div>` : "";
  const inputDep = (l, y) => `<td><input type="number" step="any" min="0" ${dis} data-moeda data-dep="${l.chave}" data-ano="${y}" value="${l.valores[y] * 1000}" class="${l.alterado[y] ? "alterado" : ""}"
      title="${l.alterado[y] ? `Valor alterado. O calculado seria ${fmtMoeda(l.calculado[y] * 1000)}. Use ↺ para voltar.` : "Calculado. Digite para alterar (0 zera o ano)."}"></td>`;
  const reset = (l) => (!dis && Object.values(l.alterado).some(Boolean) ? `<button class="link" data-dep-reset="${l.chave}" title="Descartar as alterações e voltar ao calculado">↺ calculado</button>` : "");
  const linha = (l) => `<tr><td>${esc(l.nome)}</td>${d.anos.map((y) => inputDep(l, y)).join("")}<td>${reset(l)}</td></tr>`;
  const taxa = `<div class="linha"><label>Taxa média de depreciação dos bens existentes (% ao ano)
      <input type="number" step="any" min="0" max="100" ${dis} data-dep="taxa" data-ano="0" value="${Math.round(dp.taxa * 100) / 100}" class="${dp.taxa_alterada ? "alterado" : ""}" style="width:90px"></label>
      <span class="dim">${dp.taxa_alterada ? `calculada do realizado: ${num(dp.taxa_calculada, 2)}%` : "calculada do realizado"}</span>
      ${dp.taxa_alterada && !dis ? `<button class="link" data-dep-reset="taxa">↺ calculada</button>` : ""}</div>`;
  const calc = `<div class="card"><h2>Depreciação</h2>
    ${taxa}
    <div class="scroll"><table class="dep-tab"><thead><tr><th>Depreciação</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>
      <tr class="dim"><td>Base depreciável dos bens existentes</td>${d.anos.map((y) => `<td>${fmt(dp.base_depreciavel[y])}</td>`).join("")}<td></td></tr>
      ${dp.linhas.map(linha).join("")}
      <tr class="total"><td>Total da depreciação</td>${d.anos.map((y) => `<td>${fmt(dp.total[y])}</td>`).join("")}<td></td></tr></tbody></table></div></div>`;
  return calc;
}

function htmlCompararInvestimentos() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length || !estado.invest || !estado.invest.tipos.length) return "";
  const sel = estado.cmpInvB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cminv-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cminv">Comparar</button></div>`;
  const c = estado.cmpInv;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base). Compara o investido (ou desinvestido) de cada tipo.</p></div>`;
  const ano = c.anos.includes(estado.cmpInvAno) ? estado.cmpInvAno : c.anos[0];
  const cel = (o) => `<td>${fmtMoeda(o.a * 1000)}</td><td>${fmtMoeda(o.b * 1000)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${fmtMoeda(o.delta * 1000)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cminv-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Tipo</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.linhas.map((l) => `<tr class="${l.natureza === "total" ? "total" : ""}"><td>${esc(l.nome)}${l.natureza === "desinvestimento" ? ' <span class="dim">· desinvestimento</span>' : ""}</td>${cel(l.anos[ano])}</tr>`).join("")}</tbody></table></div></div>`;
}

function htmlTiposInvestimento(d, dis, solo) {
  const f = estado.invForm;                                   // null | "novo" | id do tipo em edição
  const lista = d.cadastro.length ? `<div class="scroll"><table><thead><tr><th>Tipo</th><th>Natureza</th><th>Classificação</th><th>Conta padrão do balanço</th><th>Saldo do ano anterior</th><th>Depreciação</th>${solo ? "" : "<th>No orçamento</th>"}<th></th></tr></thead><tbody>
      ${d.cadastro.map((t) => `<tr class="${t.ativo ? "" : "dim"}"><td>${esc(t.nome)}</td><td>${t.natureza === "investimento" ? "Investimento" : "Desinvestimento"}</td>
        <td>${esc(t.classificacao)}</td><td>${esc(t.conta_caminho.join(" › ") || t.conta_nome)}</td><td>${t.carrega_saldo ? "Carrega" : "–"}</td>
        <td>${t.vida_util > 0 ? `${num(t.vida_util, 0)} ano(s) · residual ${num(t.residual_pct, 0)}%${t.carencia ? ` · carência ${t.carencia}` : ""}` : "–"}</td>
        ${solo ? "" : `<td><label class="inv-adic"><input type="checkbox" ${t.ativo ? "checked" : ""} ${dis} data-inv-adicionar="${t.id}"> ${t.ativo ? "Adicionado" : "Adicionar"}</label></td>`}
        <td><button class="link" data-inv-editar="${t.id}">Editar</button> ${btnLixo(`data-inv-excluir="${t.id}"`, "Excluir tipo")}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="dim">Nenhum tipo cadastrado. Clique em <strong>+ Novo tipo</strong> para começar.</p>`;
  const edit = f && f !== "novo" ? d.cadastro.find((x) => x.id === f) : null;
  return `<div class="inv-barra">${solo ? "<span></span>" : `<button class="sec" id="btn-inv-voltar">← Voltar às premissas de investimento</button>`}
      ${f ? "" : `<button class="prim" id="btn-inv-novo">+ Novo tipo</button>`}</div>
    ${f ? htmlFormTipoInv(d, edit, solo) : ""}
    <div class="card"><h2>Tipos de investimento</h2>
    <p class="dim">Cada tipo vincula uma <strong>conta do ativo do balanço</strong>, tem uma classificação e é <strong>investimento</strong> (aumenta a conta) ou <strong>desinvestimento</strong> (reduz a conta).${solo ? "" : " Marque <strong>Adicionar</strong> para o tipo entrar no orçamento."}</p>${lista}</div>`;
}

function htmlFormTipoInv(d, t, solo) {
  const edit = !!t;
  const v = t || { nome: "", natureza: "investimento", conta_codigo: "", classificacao_id: (d.classificacoes[0] || {}).id, carrega_saldo: true, ativo: !!estado.invAdicionar };
  return `<div class="card" id="inv-form"><h2>${edit ? "Editar tipo" : "Novo tipo de investimento"}</h2>
    <div class="orc-par">
      <label class="campo">Nome do tipo<input id="mi-nome" value="${esc(v.nome)}" placeholder="Ex.: Obras em andamento"></label>
      <label class="campo">Natureza<select id="mi-natureza"><option value="investimento" ${v.natureza === "investimento" ? "selected" : ""}>Investimento (aumenta a conta)</option>
        <option value="desinvestimento" ${v.natureza === "desinvestimento" ? "selected" : ""}>Desinvestimento (reduz a conta)</option></select></label></div>
    <div class="orc-par">
      <label class="campo">Conta padrão do balanço (obrigatória)<select id="mi-conta"><option value="">— escolha —</option>
        ${d.contas.map((c) => `<option value="${esc(c.codigo)}" ${c.codigo === v.conta_codigo ? "selected" : ""}>${esc(c.caminho.join(" › "))}</option>`).join("")}</select></label>
      <div class="campo"><span>Classificação</span><div class="linha"><select id="mi-class" style="flex:1">${d.classificacoes.map((c) => `<option value="${c.id}" ${c.id === v.classificacao_id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
        <button class="sec" data-mi="nova-class" title="Criar uma classificação nova">+</button></div></div></div>
    <div id="mi-dep-bloco"><div class="campo"><span>Depreciação dos novos investimentos deste tipo</span></div>
      <div class="linha" style="align-items:flex-end">
        <label class="campo" style="margin-top:4px;flex:1">Vida útil (anos)<input type="number" min="0" step="any" id="mi-vida" value="${v.vida_util || ""}" placeholder="0 = não deprecia"></label>
        <label class="campo" style="margin-top:4px;flex:1">Valor residual (%)<input type="number" min="0" max="99" step="any" id="mi-residual" value="${v.residual_pct || ""}" placeholder="0"></label>
        <label class="campo" style="margin-top:4px;flex:1">Carência (anos)<input type="number" min="0" step="1" id="mi-carencia" value="${v.carencia || ""}" placeholder="0"></label></div>
      <p class="dim" style="font-size:12px;margin:4px 0 0">Linear: investido × (1 − residual) ÷ vida útil, depois da carência. Dá para alterar o valor de cada ano na tela.</p></div>
    <label class="campo" id="mi-carrega-bloco" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="mi-carrega" ${v.carrega_saldo ? "checked" : ""} style="width:auto"> Carrega o saldo a realizar do ano anterior</label>
    ${edit || solo ? "" : `<label class="campo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="mi-ativo" ${v.ativo ? "checked" : ""} style="width:auto"> Adicionar a este orçamento</label>`}
    <div id="md-erro" class="msg" style="margin:8px 0 0" hidden></div>
    <div class="linha" style="margin-top:12px;justify-content:flex-end"><button class="sec" data-mi="cancelar">Cancelar</button><button class="prim" data-mi="salvar" ${edit ? `data-id="${t.id}"` : ""}>${edit ? "Salvar" : "Cadastrar tipo"}</button></div></div>`;
}

function ajustarFormTipoInv() {
  const n = document.getElementById("mi-natureza"); if (!n) return;
  const inv = n.value === "investimento";
  document.getElementById("mi-carrega-bloco").hidden = !inv; document.getElementById("mi-dep-bloco").hidden = !inv;
}
document.querySelector("#conteudo").addEventListener("change", (e) => { if (e.target.id === "mi-natureza") ajustarFormTipoInv(); });
new MutationObserver(ajustarFormTipoInv).observe(document.querySelector("#conteudo"), { childList: true });

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mi]");
  if (!b || !document.getElementById("inv-form")) return;
  const erro = (txt) => { const el = document.getElementById("md-erro"); if (el) { el.textContent = txt; el.hidden = !txt; } };
  seguro(async () => {
    if (b.dataset.mi === "cancelar") { estado.invForm = null; desenhar(); return; }
    if (b.dataset.mi === "nova-class") {
      const nome = prompt("Nome da nova classificação:");
      if (!nome || !nome.trim()) return;
      let id;
      try { id = (await api("POST", "/api/investimentos/classificacoes", { nome })).id; } catch (x) { return erro(x.message); }
      estado.invest = await api("GET", `/api/versoes/${estado.vid}/investimentos`);
      const sel = document.getElementById("mi-class");
      sel.innerHTML = estado.invest.classificacoes.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
      sel.value = String(id);
      return;
    }
    const nome = document.getElementById("mi-nome").value;
    if (!nome.trim()) return erro("Informe o nome do tipo.");
    if (!document.getElementById("mi-conta").value) return erro("Escolha a conta padrão do balanço: todo tipo precisa estar vinculado a uma conta.");
    const corpo = { nome, natureza: document.getElementById("mi-natureza").value, conta_codigo: document.getElementById("mi-conta").value,
      classificacao_id: Number(document.getElementById("mi-class").value), carrega_saldo: document.getElementById("mi-carrega").checked,
      vida_util: Number(document.getElementById("mi-vida").value || 0), residual_pct: Number(document.getElementById("mi-residual").value || 0), carencia: Number(document.getElementById("mi-carencia").value || 0),
      ativo: b.dataset.id ? estado.invest.cadastro.find((x) => x.id === Number(b.dataset.id)).ativo_cadastro : true };
    if (!b.dataset.id) { corpo.versao_id = estado.vid; const chk = document.getElementById("mi-ativo"); corpo.adicionar = chk ? chk.checked : false; }
    try {
      if (b.dataset.id) await api("PUT", `/api/investimentos/tipos/${b.dataset.id}`, corpo);
      else await api("POST", "/api/investimentos/tipos", corpo);
    } catch (x) { return erro(x.message); }
    estado.invForm = null; await recarregar(); mostrar(b.dataset.id ? "Tipo salvo." : corpo.adicionar ? "Tipo cadastrado e adicionado ao orçamento." : "Tipo cadastrado.", true);
  });
});

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "invest" && estado.modulo !== "cadinvest") return;
  if (t.dataset.dep !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/depreciacao/${t.dataset.dep}/${t.dataset.ano}`, { valor: Number(t.value || 0) / (t.dataset.dep === "taxa" ? 1 : 1000) }); await recarregar(); });
  } else if (t.dataset.inv !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/investimentos/${t.dataset.inv}/${t.dataset.campo}/${t.dataset.ano}`, { valor: Number(t.value || 0) }); await recarregar(); });
  } else if (t.dataset.invAdicionar !== undefined) {
    const x = estado.invest.cadastro.find((y) => y.id === Number(t.dataset.invAdicionar));
    seguro(async () => {
      if (t.checked) { await api("POST", `/api/versoes/${estado.vid}/investimentos/${x.id}/incluir`); await recarregar(); return mostrar(`"${x.nome}" adicionado ao orçamento.`, true); }
      if (!await confirmar(`Remover "${x.nome}" deste orçamento? Os valores lançados nele serão apagados. O tipo continua cadastrado.`)) { t.checked = true; return; }
      await api("POST", `/api/versoes/${estado.vid}/investimentos/${x.id}/retirar`); await recarregar(); mostrar(`"${x.nome}" removido deste orçamento.`, true);
    });
  } else if (t.dataset.invr !== undefined) {
    const [tid, campo, ano] = t.dataset.invr.split("|");
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/investimentos/${tid}/${campo}/${ano}`, { valor: lerNumero(t.value) / 1000 }); await recarregar(); });
  } else if (t.id === "cminv-b") { estado.cmpInvB = Number(t.value); estado.cmpInv = null; }
  else if (t.id === "cminv-ano") { estado.cmpInvAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || (estado.modulo !== "invest" && estado.modulo !== "cadinvest")) return;
  seguro(async () => {
    if (t.dataset.depReset) { await api("DELETE", `/api/versoes/${estado.vid}/depreciacao/${t.dataset.depReset}`); await recarregar(); mostrar("Voltou ao valor calculado.", true); }
    else if (t.dataset.invModo) { estado.invAba = t.dataset.invModo; estado.invAdd = false; desenhar(); }
    else if (t.dataset.invSel) { estado.invAdd = false; estado.invSel = Number(t.dataset.invSel); estado.invPasso = 1; estado.invForm = null; desenhar(); }
    else if (t.dataset.invPasso) { estado.invPasso = Number(t.dataset.invPasso); desenhar(); }
    else if (t.dataset.invRetirar) {
      const x = estado.invest.cadastro.find((y) => y.id === Number(t.dataset.invRetirar));
      if (!await confirmar(`Remover "${x.nome}" deste orçamento? Os valores lançados nele serão apagados. O tipo continua cadastrado e as outras versões não mudam.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/investimentos/${x.id}/retirar`);
      estado.invPasso = 1; await recarregar(); mostrar(`"${x.nome}" removido deste orçamento.`, true);
    }
    else if (t.dataset.invEditarAqui) { estado.invForm = Number(t.dataset.invEditarAqui); desenhar(); }
    else if (t.id === "btn-inv-novo-proj") { estado.invAdd = true; desenhar(); }
    else if (t.dataset.invCriar !== undefined) { estado.invAdd = false; estado.invTela = "tipos"; estado.invForm = "novo"; estado.invAdicionar = true; desenhar(); }
    else if (t.dataset.invCancelarAdd !== undefined) { estado.invAdd = false; desenhar(); }
    else if (t.dataset.invIncluir) {
      await api("POST", `/api/versoes/${estado.vid}/investimentos/${t.dataset.invIncluir}/incluir`);
      estado.invAdd = false; estado.invSel = Number(t.dataset.invIncluir); estado.invPasso = 1; await recarregar(); mostrar("Investimento adicionado ao orçamento.", true);
    }
    else if (t.dataset.invReplicarLinha) {
      const ano = estado.invest.anos[0], tp = estado.invest.tipos.find((x) => x.id === Number(t.dataset.invReplicarLinha));
      if (!await confirmar(`Copiar os valores de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      for (const l of tp.linhas.filter((l) => l.campo && l.campo !== "saldo_ini")) await api("POST", `/api/versoes/${estado.vid}/investimentos/${tp.id}/${l.campo}/replicar`, { ano });
      await recarregar(); mostrar("Valores replicados.", true);
    }
    else if (t.id === "btn-inv-tipos") { estado.invTela = "tipos"; estado.invForm = null; desenhar(); }
    else if (t.id === "btn-inv-voltar") { estado.invTela = null; estado.invForm = null; desenhar(); }
    else if (t.id === "btn-inv-novo") { estado.invForm = "novo"; estado.invAdicionar = false; desenhar(); }
    else if (t.dataset.invEditar) { estado.invForm = Number(t.dataset.invEditar); desenhar(); }
    else if (t.dataset.invExcluir) {
      const x = estado.invest.cadastro.find((y) => y.id === Number(t.dataset.invExcluir));
      if (!await confirmar(`Excluir o tipo "${x.nome}"?`)) return;
      await api("DELETE", `/api/investimentos/tipos/${x.id}`); await recarregar(); mostrar("Tipo excluído.", true);
    } else if (t.dataset.invReplicar) {
      const [tid, campo] = t.dataset.invReplicar.split("|"), ano = Number(document.getElementById(`rinv-${tid}-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/investimentos/${tid}/${campo}/replicar`, { ano });
      await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.id === "btn-inv-todos") {
      const ano = Number($("#rinv-todos").value);
      if (!await confirmar(`Copiar todos os tipos de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/investimentos/replicar-todos`, { ano });
      await recarregar(); mostrar(`${r.campos} campo(s) replicado(s) para ${r.anos_alterados} ano(s).`, true);
    } else if (t.id === "btn-cminv") {
      const outra = estado.cmpInvB || Number($("#cminv-b").value);
      estado.cmpInvB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpInv = await api("GET", `/api/comparar-investimentos?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});

document.querySelector("#conteudo").addEventListener("input", (e) => {          // busca na lista de tipos para adicionar
  if (e.target.id !== "inv-busca") return;
  const q = e.target.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll(".inv-opcao").forEach((o) => { const ok = !q || o.dataset.busca.includes(q); o.hidden = !ok; if (ok) n++; });
  const sem = document.querySelector(".inv-sem"); if (sem) sem.hidden = n > 0;
});
