"use strict";
// ---------------------------------------------------------------- Novas captações e financiamento dos investimentos
// Novas captações (custeio e capital de giro, cadastradas aqui) e o financiamento dos investimentos (nasce na tela Investimentos).
// Cada parte é desenhada na sua tela; o que foi financiado em Investimentos aparece também no Resumo geral de Premissas de dívidas.
function htmlCaptacoes() { return partesCaptacoes().novas; }
function htmlFinanciamentoInvestimentos(tid) { return estado.capt ? partesCaptacoes(tid).invest : ""; }
function partesCaptacoes(tid) {
  const d = estado.capt;
  if (!d) return { novas: `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`, invest: "" };
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong></div>` : "";
  const fmt = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "–" : rs(v * 1000));
  const cad = d.captacoes.filter((c) => c.origem === "cadastro");
  const nova = (cls) => (trava() ? "" : `<button class="${cls}" data-cap-nova>${icone("plus", 16)} Nova captação</button>`);
  const lista = `<div class="card">${cabecaCartaoGrande("moedas", "Novas captações", "", nova("prim"))}
    <div class="scroll"><table class="grade cap"><thead><tr><th>Descrição</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th class="acoes">Ações</th></tr></thead>
    ${cad.length ? `<tbody>${cad.map((c) => `<tr><td><strong>${esc(c.nome)}</strong> <span class="chip">${esc(c.tipo_nome)}</span><div class="dim peq-txt">${num(c.taxa, 2)}% a.a. · ${c.prazo} parcela(s) · carência ${c.carencia} ano(s)</div></td>
        ${d.anos.map((y) => `<td>${y === c.ano ? `<strong>${fmtMoeda(c.valor * 1000)}</strong>` : '<span class="dim">–</span>'}</td>`).join("")}
        <td class="acoes">${trava() ? "" : `<button class="btn-ico" data-cap-editar="${c.id}" title="Editar" aria-label="Editar">${icone("editar", 17)}</button>${btnLixo(`data-cap-excluir="${c.id}"`, "Excluir captação")}`}</td></tr>`).join("")}</tbody>` : "<tbody></tbody>"}</table></div>
    ${cad.length ? "" : `<div class="vazio-pontilhado">${icone("moedas", 34)}<p>Nenhuma captação cadastrada.</p>${nova("sec")}</div>`}</div>`;
  const ICONE_PREMISSA = { taxa: "percentual", prazo: "calendar", carencia: "ampulheta" };
  const avisosFin = [...new Set(d.captacoes.filter((c) => c.origem !== "cadastro").flatMap((c) => c.avisos || []))];
  const prem = `<div class="card">${cabecaCartaoGrande("calculadora", "Financiamento dos investimentos")}
    ${avisosFin.length ? `<div class="avisos" style="margin:0 0 12px"><ul>${avisosFin.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
    <div class="scroll"><table class="grade hov"><thead><tr><th>Premissa</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th class="acoes"></th></tr></thead><tbody>
      ${d.premissas.map((p) => `<tr><td><span class="prem-nome"><span class="prem-ic">${icone(ICONE_PREMISSA[p.campo] || "lista", 20)}</span><span><strong>${esc(p.nome)}</strong> <span class="un">(${esc(p.unidade)})</span></span></span></td>
        ${d.anos.map((y) => `<td><input type="number" step="any" min="0" ${dis} data-fin="${p.campo}" data-ano="${y}" value="${p.valores[y] || ""}"></td>`).join("")}
        <td class="acoes hover">${trava() ? "" : `<div class="acoes-in"><select id="rfin-${p.campo}">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select><button class="sec" data-fin-replicar="${p.campo}">Replicar →</button></div>`}</td></tr>`).join("")}</tbody></table></div></div>`;
  const reset = (c) => (!trava() && c.linhas.some((l) => l.alterado && Object.values(l.alterado).some(Boolean)) ? `<button class="link" data-cap-reset="${esc(c.chave)}" title="Descartar as alterações e voltar ao calculado">↺ calculado</button>` : "");
  const bloco = (c) => `<tr><td colspan="${d.anos.length + 2}" style="background:var(--fundo);font-weight:600">${esc(c.nome)}
      <span class="dim" style="font-weight:400"> · ${esc(c.tipo_nome)} · R$ ${fmt(c.valor)}${c.percentual ? ` (${num(c.percentual, 0)}% do investido do ano)` : ""} em ${c.ano} · ${num(c.taxa, 2)}% a.a. · ${c.prazo} parcela(s) · carência ${c.carencia} ano(s)</span> ${reset(c)}</td></tr>
    ${c.linhas.map((l) => `<tr><td style="padding-left:24px" class="${l.id === "curto" || l.id === "longo" ? "dim" : ""}">${esc(l.nome)}</td>${d.anos.map((y) => l.editavel
      ? `<td><input type="number" step="any" min="0" ${dis} data-moeda data-cap="${esc(c.chave)}" data-campo="${l.campo}" data-ano="${y}" value="${l.valores[y] * 1000}" class="${l.alterado[y] ? "alterado" : ""}" title="${l.alterado[y] ? `Alterado. O calculado seria ${num(l.calculado[y] * 1000, 0)}.` : "Calculado. Digite para alterar."}"></td>`
      : `<td class="${l.id === "curto" || l.id === "longo" ? "dim" : ""}">${fmt(l.valores[y])}</td>`).join("")}<td></td></tr>`).join("")}
    ${c.avisos.map((a) => `<tr><td colspan="${d.anos.length + 2}" class="pos" style="text-align:left;white-space:normal">${esc(a)}</td></tr>`).join("")}`;
  const cronDe = (lista, titulo) => lista.length ? `<div class="card">${cabecaCartaoGrande("layers", titulo)}
    <div class="scroll"><table><thead><tr><th>Captação</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${lista.map(bloco).join("")}</tbody></table></div></div>` : "";
  const r = d.resumo;
  const grupo = (titulo, g) => `<tr><td colspan="${d.anos.length + 1}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${titulo}</td></tr>
    ${[["captado", "Captado no ano"], ["amort", "Amortização do principal"], ["saldo", "Saldo da dívida em 31/12"], ["curto", "  curto prazo"], ["longo", "  longo prazo"], ["juros", "Juros do ano"]]
      .map(([k, n]) => `<tr class="${k === "saldo" ? "total" : ""}"><td>${esc(n)}</td>${d.anos.map((y) => `<td>${fmt(g[k][y])}</td>`).join("")}</tr>`).join("")}`;
  const cronGeral = (lista) => {                       // um cronograma só, somando todas as captações do projeto
    if (!lista.length) return "";
    const soma = (id) => Object.fromEntries(d.anos.map((y) => [y, lista.reduce((t, c) => t + ((c.linhas.find((l) => l.id === id) || { valores: {} }).valores[y] || 0), 0)]));
    const linhas = [["captado", "Captado no ano"], ["amort", "Amortização do principal"], ["saldo", "Saldo da dívida em 31/12"], ["curto", "curto prazo (vence no ano seguinte)"], ["longo", "longo prazo"], ["juros", "Juros do ano"]];
    return `<div class="card">${cabecaCartaoGrande("layers", "Cronograma do financiamento")}
      <div class="scroll"><table><thead><tr><th></th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${linhas.map(([id, nome]) => { const v = soma(id); return `<tr class="${id === "saldo" ? "total" : ""}"><td class="${id === "curto" || id === "longo" ? "dim" : ""}">${nome}</td>${d.anos.map((y) => `<td>${fmt(v[y])}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div></div>`;
  };
  const financ = d.captacoes.filter((c) => c.origem !== "cadastro" && (tid === undefined || String(c.chave).startsWith(`inv-${tid}-`)));
  const resumo = cad.length ? `<div class="card">${cabecaCartaoGrande("resultados", "Resumo da dívida nova")}
    <div class="scroll"><table><thead><tr><th></th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${grupo("Custeio e capital de giro", r.giro)}</tbody></table></div>
    <p class="dim">O saldo (curto e longo prazo) soma nas contas de dívida do <a href="#" data-modulo="balanco">Balanço</a> e os juros somam na despesa financeira da <a href="#" data-modulo="dre">DRE</a>, junto com o Endividamento importado.</p></div>` : "";
  return { novas: `${aviso}${lista}${cronDe(cad, "Cronograma")}${resumo}${htmlCompararCaptacoes()}`, invest: `${prem}${tid === undefined ? cronDe(financ, "Cronograma do financiamento") : cronGeral(financ)}` };
}

function htmlCompararCaptacoes() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length || !estado.capt || !estado.capt.captacoes.length) return "";
  const sel = estado.cmpCapB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmcap-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmcap">Comparar</button></div>`;
  const c = estado.cmpCap;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base). Compara o total da dívida nova.</p></div>`;
  const ano = c.anos.includes(estado.cmpCapAno) ? estado.cmpCapAno : c.anos[0];
  const cel = (o) => `<td>${rs(o.a * 1000)}</td><td>${rs(o.b * 1000)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${rs(o.delta * 1000)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmcap-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Linha</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.linhas.map((l) => `<tr><td>${esc(l.nome)}</td>${cel(l.anos[ano])}</tr>`).join("")}</tbody></table></div></div>`;
}

function modalCaptacao(c) {
  const d = estado.capt, edit = !!c;
  const v = c || { nome: "", tipo: "custeio", ano: d.anos[0], valor: "", taxa: "", prazo: 1, carencia: 0 };
  abrirModal(edit ? "Editar captação" : "Nova captação", `
    <label class="campo">Nome<input id="mc-nome" value="${esc(v.nome)}" placeholder="Ex.: Custeio safra 2027"></label>
    <label class="campo">Tipo<select id="mc-tipo">${d.tipos.map((t) => `<option value="${t.id}" ${t.id === v.tipo ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></label>
    <div class="linha"><label class="campo" style="flex:1">Ano da captação<select id="mc-ano">${d.anos.map((y) => `<option ${y === v.ano ? "selected" : ""}>${y}</option>`).join("")}</select></label>
      <label class="campo" style="flex:1">Valor (R$)<input type="text" inputmode="decimal" class="moeda" id="mc-valor" placeholder="R$ 0,00" value="${v.valor === "" ? "" : fmtMoeda(v.valor * 1000)}"></label></div>
    <div class="linha"><label class="campo" style="flex:1">Taxa média de juros (% a.a.)<input type="number" min="0" step="any" id="mc-taxa" value="${v.taxa}"></label>
      <label class="campo" style="flex:1">Prazo (parcelas anuais)<input type="number" min="1" step="1" id="mc-prazo" value="${v.prazo}"></label>
      <label class="campo" style="flex:1">Carência (anos)<input type="number" min="0" step="1" id="mc-car" value="${v.carencia}"></label></div>
    <div id="md-erro" class="msg" style="margin:8px 0 0" hidden></div>
    <div class="linha" style="margin-top:12px"><button class="prim" data-mc="salvar" ${edit ? `data-id="${c.id}"` : ""}>${edit ? "Salvar" : "Cadastrar captação"}</button><button class="sec" data-md="fechar">Cancelar</button></div>`);
  document.getElementById("mc-nome").focus();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mc]");
  if (!b || !document.getElementById("modal-pd")) return;
  const erro = (txt) => { const el = document.getElementById("md-erro"); if (el) { el.textContent = txt; el.hidden = !txt; } };
  seguro(async () => {
    const nome = document.getElementById("mc-nome").value;
    if (!nome.trim()) return erro("Informe o nome da captação.");
    const corpo = { nome, tipo: document.getElementById("mc-tipo").value, ano: Number(document.getElementById("mc-ano").value), valor: lerNumero(document.getElementById("mc-valor").value) / 1000,           // o sistema guarda em R$ mil; aqui se digita em reais
      taxa: Number(document.getElementById("mc-taxa").value || 0), prazo: Number(document.getElementById("mc-prazo").value || 0), carencia: Number(document.getElementById("mc-car").value || 0) };
    try {
      if (b.dataset.id) await api("PUT", `/api/versoes/${estado.vid}/captacoes/${b.dataset.id}`, corpo);
      else await api("POST", `/api/versoes/${estado.vid}/captacoes`, corpo);
    } catch (x) { return erro(x.message); }
    fecharModal(); await recarregar(); mostrar(b.dataset.id ? "Captação salva." : "Captação cadastrada.", true);
  });
});

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (!["captacoes", "invest"].includes(modAtivo())) return;
  if (t.dataset.cap !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/cronograma-captacao/${t.dataset.cap}/${t.dataset.campo}/${t.dataset.ano}`, { valor: Number(t.value || 0) / 1000 }); await recarregar(); });
  } else if (t.dataset.fin !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/financiamento/${t.dataset.fin}/${t.dataset.ano}`, { valor: Number(t.value || 0) }); await recarregar(); });
  } else if (t.id === "cmcap-b") { estado.cmpCapB = Number(t.value); estado.cmpCap = null; }
  else if (t.id === "cmcap-ano") { estado.cmpCapAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || !["captacoes", "invest"].includes(modAtivo())) return;
  seguro(async () => {
    if (t.hasAttribute("data-cap-nova")) modalCaptacao(null);
    else if (t.dataset.capEditar) modalCaptacao(estado.capt.captacoes.find((x) => x.id === Number(t.dataset.capEditar)));
    else if (t.dataset.capExcluir) {
      const x = estado.capt.captacoes.find((y) => y.id === Number(t.dataset.capExcluir));
      if (!await confirmar(`Excluir a captação "${x.nome}"?`)) return;
      await api("DELETE", `/api/versoes/${estado.vid}/captacoes/${x.id}`); await recarregar(); mostrar("Captação excluída.", true);
    } else if (t.dataset.capReset) {
      await api("DELETE", `/api/versoes/${estado.vid}/cronograma-captacao/${t.dataset.capReset}`); await recarregar(); mostrar("Voltou ao valor calculado.", true);
    } else if (t.dataset.finReplicar) {
      const campo = t.dataset.finReplicar, ano = Number(document.getElementById(`rfin-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/financiamento/${campo}/replicar`, { ano }); await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.id === "btn-cmcap") {
      const outra = estado.cmpCapB || Number($("#cmcap-b").value);
      estado.cmpCapB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpCap = await api("GET", `/api/comparar-captacoes?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
