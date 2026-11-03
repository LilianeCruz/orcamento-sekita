"use strict";
// ---------------------------------------------------------------- Cadastros: premissas da DRE (os de produtos, rubricas de custo e tipos de investimento ficam nas telas deles)
function htmlCadPremissas() {
  const d = estado.premDem;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const lista = d.cadastradas.dre || [], contas = d.contas.dre || [];
  const optConta = (sel) => `<option value="">— escolha a conta —</option>` + contas.map((c) => `<option value="${esc(c.codigo)}" title="${esc(c.caminho.join(" › "))}" ${c.nome === sel ? "selected" : ""}>${esc(c.caminho.slice(-2).join(" › "))}</option>`).join("");
  const optSinal = (sel) => `<option value="1" ${sel === 1 ? "selected" : ""}>Soma (+)</option><option value="-1" ${sel === -1 ? "selected" : ""}>Subtrai (−)</option>`;
  const linhas = lista.map((p) => `<tr data-cadpd-row="${p.id}">
      <td><input data-k="nome" value="${esc(p.nome)}"></td>
      <td><select data-k="conta" style="width:280px">${optConta(p.conta)}</select></td>
      <td><select data-k="sinal">${optSinal(p.sinal)}</select></td>
      <td>${p.tipo === "percentual" ? `% ${esc(p.base ? "sobre " + p.base : "")}` : "Valor"}</td>
      <td>${p.na_versao ? '<span class="chip">neste orçamento</span>' : '<span class="dim">fora do orçamento</span>'}</td>
      <td><button class="sec" data-cadpd-salvar="${p.id}">Salvar</button> ${btnLixo(`data-cadpd-excluir="${p.id}"`, "Excluir premissa")}</td></tr>`).join("");
  return `<div class="card">${cabecaCartaoGrande("calculadora", "Tipos de premissas da DRE", "", `<button class="prim" id="btn-cadpd-nova">${icone("plus", 16)} Nova premissa</button>`)}
    ${lista.length ? `<div class="scroll"><table class="cult-tabela"><thead><tr><th>Premissa</th><th>Conta da DRE</th><th>Na conta</th><th>Tipo</th><th></th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : `<div class="vazio">Nenhuma premissa cadastrada. Clique em <strong>Nova premissa</strong>.</div>`}</div>`;
}

document.querySelector("#conteudo").addEventListener("click", (e) => {
  if (estado.modulo !== "cadpremissas") return;
  const t = e.target.closest("button");
  if (!t) return;
  seguro(async () => {
    if (t.id === "btn-cadpd-nova") modalNovaPremissa();
    else if (t.dataset.cadpdSalvar) {
      const row = document.querySelector(`[data-cadpd-row="${t.dataset.cadpdSalvar}"]`), v = (k) => row.querySelector(`[data-k="${k}"]`).value;
      await api("PUT", `/api/premissas-dem/${t.dataset.cadpdSalvar}`, { nome: v("nome"), conta_codigo: v("conta") || null, sinal: Number(v("sinal")) });
      await recarregar(); mostrar("Premissa salva.", true);
    } else if (t.dataset.cadpdExcluir) {
      const p = estado.premDem.cadastradas.dre.find((x) => x.id === Number(t.dataset.cadpdExcluir));
      if (!await confirmar(`Excluir a premissa "${p.nome}"?`)) return;
      await api("DELETE", `/api/premissas-dem/${p.id}`); await recarregar(); mostrar("Premissa excluída.", true);
    }
  });
});
