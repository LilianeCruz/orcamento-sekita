"use strict";
// ---------------------------------------------------------------- premissas dos demonstrativos (DRE e Balanço)
const NOME_DEM = { dre: "DRE", balanco: "Balanço" };

function htmlPremDem() {
  const aba2 = DP_ABAS.some((x) => x[0] === estado.dreAba) ? estado.dreAba : "realizado";
  const abas = `<nav class="abas pom-abas">${DP_ABAS.map(([id, nome]) => `<button data-dp-aba="${id}" class="${aba2 === id ? "ativa" : ""}">${nome}</button>`).join("")}</nav>`;
  if (aba2 === "realizado") return abas + htmlDreRealizado();
  if (aba2 !== "outras") return abas + htmlDrePadrao(aba2);
  return abas + htmlOutrasPremissas();
}

function htmlOutrasPremissas() {
  const d = estado.premDem;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const aba = "dre", dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Os valores e a lista de premissas só mudam no Reprojetado. O cadastro de novas premissas continua liberado.</div>` : "";
  const semEstrutura = !d.estrutura.dre
    ? `<div class="avisos" style="margin:12px 0 0"><strong>Atenção</strong><ul><li>A estrutura da DRE ainda não foi importada.</li></ul>
       Importe o banco do Fechamento Contábil na tela <a href="#" data-modulo="dre">DRE</a> (em "Atualizar a estrutura").</div>` : "";
  const lista = d.blocos[aba];
  const optConta = (contas, sel) => `<option value="">— escolha a conta —</option>` + contas.map((c) =>
    `<option value="${esc(c.codigo)}" title="${esc(c.caminho.join(" › "))}" ${c.codigo === sel ? "selected" : ""}>${esc(c.caminho.slice(-2).join(" › "))}</option>`).join("");
  const optSinal = (sel) => `<option value="1" ${sel === 1 ? "selected" : ""}>Soma (+)</option><option value="-1" ${sel === -1 ? "selected" : ""}>Subtrai (−)</option>`;
  const linhas = lista.map((p) => `<tr>
      <td><input data-pd-nome="${p.id}" value="${esc(p.nome)}" style="width:170px"></td>
      <td><select data-pd-conta="${p.id}" style="width:280px" title="${esc((p.caminho || []).join(" › "))}">${p.conta_existe ? "" : `<option value="">(conta removida da estrutura)</option>`}${optConta(d.contas[aba], p.conta_codigo)}</select></td>
      <td><select data-pd-sinal="${p.id}">${optSinal(p.sinal)}</select></td>
      <td>${p.tipo === "percentual"
        ? `<span class="dim">% sobre</span> <select data-pd-base="${p.id}" style="width:200px" title="${esc((p.base_caminho || []).join(" › "))}">${(d.bases[aba].some((b) => b.codigo === p.base_codigo) ? "" : `<option value="">(campo removido)</option>`)}${d.bases[aba].map((b) => `<option value="${esc(b.codigo)}" title="${esc(b.caminho.join(" › "))}" ${b.codigo === p.base_codigo ? "selected" : ""}>${esc(b.caminho.slice(-2).join(" › "))}</option>`).join("")}</select>
          <br><span class="dim" style="font-size:11px">base negativa:</span> <select data-pd-neg="${p.id}" style="font-size:12px"><option value="zerar" ${p.base_negativa === "zerar" ? "selected" : ""}>zera</option><option value="calcular" ${p.base_negativa !== "zerar" ? "selected" : ""}>calcula</option></select>`
        : "Valor"}</td>
      ${d.anos.map((y) => `<td><input type="number" step="any" ${dis} ${p.tipo === "percentual" ? "" : "data-moeda data-pd-reais"} data-pd-valor="${p.id}" data-ano="${y}" value="${p.tipo === "percentual" ? (p.valores[y] || "") : (p.valores[y] * 1000 || "")}" ${p.tipo === "percentual" ? 'placeholder="%"' : ""}>${p.tipo === "percentual" ? ' <span class="dim">%</span>' : ""}</td>`).join("")}
      <td>${trava() ? "" : `<select id="rpd-${p.id}">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
        <button class="sec" data-pd-replicar="${p.id}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>
        <button class="link" data-pd-tirar="${p.id}" title="Tira a premissa desta versão (o cadastro continua)">Remover</button>`}</td></tr>`).join("");
  const todas = trava() || !lista.length ? "" : `<div class="linha"><strong>Replicar todas:</strong> a partir de
      <select id="rpd-todas">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" data-pd-replicar-todas="${aba}">Replicar todas →</button></div>`;
  const aba_ = (id, nome) => `<button class="${aba === id ? "ativa" : ""}" data-pd-aba="${id}">${nome} <span class="dim">(${d.blocos[id].length})</span></button>`;
  return `${aviso}${semEstrutura}
    <div class="card"><div class="linha" style="justify-content:space-between"><div><h2 style="margin:0">Premissas da DRE</h2>
      <p class="dim" style="margin:4px 0 0">Cadastre a premissa uma vez (nome, conta e sinal) e depois adicione-a às premissas desta versão.</p></div>
      <button class="prim" id="btn-pd-nova">+ Nova premissa</button></div></div>
    <div class="card"><div class="linha" style="justify-content:space-between"><h2 style="margin:0">Premissas adicionadas a esta versão</h2>
      ${trava() ? "" : `<button class="prim" id="btn-pd-adicionar">+ Adicionar premissa</button>`}</div>
      ${todas}
      ${lista.length ? `<div class="scroll"><table class="cult-tabela"><thead><tr><th>Premissa</th><th>Conta</th><th>Na conta</th><th>Tipo</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : `<div class="vazio">Nenhuma premissa ${aba === "dre" ? "da DRE" : "de balanço"} nesta versão. Clique em <strong>Adicionar premissa</strong> e escolha uma já cadastrada, ou crie uma em <strong>Nova premissa</strong>.</div>`}</div>
    ${htmlCompararPremDem()}`;
}

function htmlCompararPremDem() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpPremDemB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmpd-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmpd">Comparar</button></div>`;
  const c = estado.cmpPremDem;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpPremDemAno) ? estado.cmpPremDemAno : c.anos[0];
  const cel = (o, k = 1) => { const f = (v) => (k === 1 ? num(v, 1) : rs(v * k)); return `<td>${f(o.a)}</td><td>${f(o.b)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${f(o.delta)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`; };
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmpd-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Premissa</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.premissas.filter((p) => p.demonstrativo === "dre").map((p) => `<tr><td>${esc(p.nome)} <span class="dim">· ${NOME_DEM[p.demonstrativo]} › ${esc(p.conta)}</span></td>${cel(p.anos[ano], p.tipo === "percentual" ? 1 : 1000)}</tr>`).join("")}</tbody></table></div></div>`;
}

// ---- janelinhas (sobrepostas)
function fecharModal() { const m = document.getElementById("modal-pd"); if (m) m.remove(); }
function abrirModal(titulo, corpo) {
  fecharModal();
  const m = document.createElement("div");
  m.id = "modal-pd"; m.className = "modal-fundo";
  m.innerHTML = `<div class="modal-caixa" role="dialog" aria-modal="true"><header class="orc-cab"><h2>${titulo}</h2><button class="orc-x" data-md="fechar" aria-label="Fechar">✕</button></header><div class="orc-corpo">${corpo}</div></div>`;
  document.body.appendChild(m);
  return m;
}

function modalNovaPremissa() {
  const m = abrirModal("Nova premissa", `
    <label class="campo">Nome da premissa<input id="md-nome" placeholder="Ex.: Aluguel do escritório"></label>
    <input type="hidden" id="md-dem" value="dre">
    <div id="md-conta-bloco">
      <label class="campo">Tipo da premissa<select id="md-tipo"><option value="valor">Valor (eu digito o valor)</option><option value="percentual">Percentual (% sobre um campo)</option></select></label>
      <div id="md-base-bloco" hidden>
        <label class="campo">Percentual sobre qual campo?<select id="md-base"></select></label>
        <label class="campo">E se o campo base for negativo (ex.: prejuízo antes do imposto)?<select id="md-neg">
          <option value="">— escolha —</option><option value="zerar">Zerar: não gera valor na conta</option>
          <option value="calcular">Calcular normalmente: o % incide e o efeito inverte o sinal (como um crédito)</option></select></label>
      </div>
      <label class="campo">Conta a vincular (obrigatória)<select id="md-conta"></select></label>
      <label class="campo">Na conta<select id="md-sinal"><option value="1">Soma (+)</option><option value="-1">Subtrai (−)</option></select></label>
    </div>
    <div id="md-erro" class="msg" style="margin:8px 0 0" hidden></div>
    <div class="linha" style="margin-top:12px"><button class="prim" data-md="criar">Cadastrar premissa</button><button class="sec" data-md="fechar">Cancelar</button></div>`);
  m.querySelector("#md-dem").dispatchEvent(new Event("change", { bubbles: true }));       // só a DRE: já carrega as contas
  m.querySelector("#md-nome").focus();
}

function modalAdicionar() {
  const d = estado.premDem, aba = "dre";
  const disponiveis = d.cadastradas[aba].filter((p) => !p.na_versao);
  const nome = aba === "dre" ? "DRE" : "balanço";
  const corpo = disponiveis.length
    ? `<p class="dim">Escolha uma premissa já cadastrada para trazê-la para as premissas de ${nome} desta versão.</p>
       <label class="campo">Premissa<select id="md-pick">${disponiveis.map((p) => `<option value="${p.id}">${esc(p.nome)} — ${esc((p.caminho || []).slice(-2).join(" › ") || "conta removida")} (${p.sinal === 1 ? "+" : "−"})${p.tipo === "percentual" ? ` · % sobre ${esc(p.base || "campo removido")}` : ""}</option>`).join("")}</select></label>
       <div class="linha" style="margin-top:12px"><button class="prim" data-md="adicionar">Adicionar</button><button class="sec" data-md="fechar">Cancelar</button></div>`
    : `<p>Não há premissas de ${nome} cadastradas que ainda não estejam nesta versão.</p>
       <div class="linha" style="margin-top:12px"><button class="prim" data-md="nova">+ Nova premissa</button><button class="sec" data-md="fechar">Fechar</button></div>`;
  return abrirModal(`Adicionar premissa ${aba === "dre" ? "da DRE" : "de balanço"}`, corpo);
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "premdem") return;
  const editar = (id, corpo) => seguro(async () => { await api("PUT", `/api/premissas-dem/${id}`, corpo); await recarregar(); });
  if (t.dataset.pdValor !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/premissas-dem/${t.dataset.pdValor}/${t.dataset.ano}`, { valor: Number(t.value || 0) / (t.dataset.pdReais !== undefined ? 1000 : 1) }); await recarregar(); });
  } else if (t.dataset.pdNome !== undefined) editar(t.dataset.pdNome, { nome: t.value });
  else if (t.dataset.pdConta !== undefined) editar(t.dataset.pdConta, { conta_codigo: t.value });
  else if (t.dataset.pdSinal !== undefined) editar(t.dataset.pdSinal, { sinal: Number(t.value) });
  else if (t.dataset.pdBase !== undefined) editar(t.dataset.pdBase, { base_codigo: t.value });
  else if (t.dataset.pdNeg !== undefined) editar(t.dataset.pdNeg, { base_negativa: t.value });
  else if (t.id === "cmpd-b") { estado.cmpPremDemB = Number(t.value); estado.cmpPremDem = null; }
  else if (t.id === "cmpd-ano") { estado.cmpPremDemAno = Number(t.value); desenhar(); }
});

document.addEventListener("change", (e) => {                            // campos da janelinha "Nova premissa"
  const t = e.target;
  if (t.id !== "md-dem" || !estado.premDem) return;
  const bloco = document.getElementById("md-conta-bloco"), contas = estado.premDem.contas[t.value] || [];
  bloco.hidden = !t.value;
  document.getElementById("md-conta").innerHTML = `<option value="">— escolha a conta —</option>` + contas.map((c) =>
    `<option value="${esc(c.codigo)}">${esc(c.caminho.join(" › "))}</option>`).join("");
  document.getElementById("md-sinal").value = "1";
  document.getElementById("md-tipo").value = "valor";
  document.getElementById("md-base-bloco").hidden = true;
  document.getElementById("md-neg").value = "";
  document.getElementById("md-base").innerHTML = `<option value="">— escolha o campo —</option>` + (estado.premDem.bases[t.value] || []).map((b) =>
    `<option value="${esc(b.codigo)}">${esc(b.caminho.join(" › "))}</option>`).join("");
});
document.addEventListener("change", (e) => {                            // tipo percentual: pergunta sobre qual campo
  if (e.target.id !== "md-tipo") return;
  document.getElementById("md-base-bloco").hidden = e.target.value !== "percentual";
});
document.addEventListener("change", (e) => {                            // sugere soma/subtrai conforme a natureza da conta
  const t = e.target;
  if (t.id !== "md-conta" || !estado.premDem) return;
  const c = (estado.premDem.contas[document.getElementById("md-dem").value] || []).find((x) => x.codigo === t.value);
  if (c) document.getElementById("md-sinal").value = String(c.sinal_padrao);
});

document.addEventListener("click", (e) => {
  const mb = e.target.closest("[data-md]");
  if (mb && document.getElementById("modal-pd")) {
    const acao = mb.dataset.md;
    if (acao === "fechar") { fecharModal(); return; }
    if (acao === "nova") { modalNovaPremissa(); return; }
    const erro = (txt) => { const el = document.getElementById("md-erro"); if (el) { el.textContent = txt; el.hidden = !txt; } };
    seguro(async () => {
      if (acao === "criar") {
        const dem = document.getElementById("md-dem").value, conta = document.getElementById("md-conta").value, nome = document.getElementById("md-nome").value;
        if (!nome.trim()) return erro("Informe o nome da premissa.");
        if (!dem) return erro("Escolha a que demonstrativo a premissa se aplica.");
        if (!conta) return erro("Escolha a conta a vincular: toda premissa precisa estar vinculada a uma conta.");
        const tipo = document.getElementById("md-tipo").value, base = document.getElementById("md-base").value;
        if (tipo === "percentual" && !base) return erro("Escolha o campo sobre o qual o percentual incide.");
        const neg = document.getElementById("md-neg").value;
        if (tipo === "percentual" && !neg) return erro("Responda o que fazer quando o campo base for negativo.");
        try {
          await api("POST", "/api/premissas-dem", { nome, demonstrativo: dem, conta_codigo: conta, sinal: Number(document.getElementById("md-sinal").value),
            tipo, base_codigo: tipo === "percentual" ? base : "", base_negativa: tipo === "percentual" ? neg : "" });
        } catch (x) { return erro(x.message); }
        fecharModal(); estado.pdAba = dem; await recarregar();
        mostrar("Premissa cadastrada. Use Adicionar premissa para trazê-la para esta versão.", true);
      } else if (acao === "adicionar") {
        await api("POST", `/api/versoes/${estado.vid}/premissas-dem/itens`, { premissa_id: Number(document.getElementById("md-pick").value) });
        fecharModal(); await recarregar();
      }
    });
    return;
  }
  const t = e.target.closest("#conteudo button");
  if (!t || estado.modulo !== "premdem") return;
  seguro(async () => {
    if (t.id === "btn-pd-nova") modalNovaPremissa();
    else if (t.id === "btn-pd-adicionar") modalAdicionar();
    else if (t.dataset.pdAba) { estado.pdAba = t.dataset.pdAba; desenhar(); }
    else if (t.dataset.pdTirar) {
      if (!await confirmar("Tirar esta premissa da versão? Os valores dela nesta versão serão apagados (o cadastro continua).")) return;
      await api("DELETE", `/api/versoes/${estado.vid}/premissas-dem/itens/${t.dataset.pdTirar}`);
      await recarregar();
    } else if (t.dataset.pdReplicar) {
      const id = t.dataset.pdReplicar, ano = Number(document.getElementById(`rpd-${id}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/premissas-dem/${id}/replicar`, { ano });
      await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.dataset.pdReplicarTodas) {
      const dem = t.dataset.pdReplicarTodas, ano = Number(document.getElementById("rpd-todas").value);
      if (!await confirmar(`Copiar o valor de TODAS as premissas ${dem === "dre" ? "da DRE" : "de balanço"} de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/premissas-dem/replicar-todas`, { ano, demonstrativo: dem });
      await recarregar(); mostrar(`${r.premissas} premissa(s) replicada(s) para ${r.anos_alterados} ano(s).`, true);
    } else if (t.id === "btn-cmpd") {
      const outra = estado.cmpPremDemB || Number($("#cmpd-b").value);
      estado.cmpPremDemB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpPremDem = await api("GET", `/api/comparar-premissas-dem?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
