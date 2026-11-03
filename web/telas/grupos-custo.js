"use strict";
// ---------------------------------------------------------------- grupos de custos
function htmlGruposCusto() {
  const grupos = estado.gruposCusto || [], cls = estado.classificacoesCusto;
  const opcoes = (sel) => Object.entries(cls).map(([k, nome]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(nome)}</option>`).join("");
  const nDireto = grupos.filter((g) => g.classificacao === "direto").length, nIndireto = grupos.length - nDireto;
  const linhas = grupos.map((g) => `<tr data-grupo-row="${g.id}">
      <td><input data-k="nome" value="${esc(g.nome)}"></td>
      <td><select data-k="classificacao">${opcoes(g.classificacao)}</select></td>
      <td><label><input type="checkbox" data-k="ativa" ${g.ativa ? "checked" : ""}> ativo</label></td>
      <td><button class="sec" data-grupo-salvar="${g.id}">Salvar</button> <button class="link" data-grupo-excluir="${g.id}">excluir</button></td></tr>`).join("");
  return `<div class="card"><h2>Novo grupo de custos</h2>
      <div class="cab"><label>Nome do grupo<input id="ng-nome" style="width:320px" placeholder="Ex.: Insumos, Mão de obra, Administrativo"></label>
        <label>Classificação<select id="ng-class"><option value="">— escolha —</option>${opcoes("")}</select></label>
        <button class="prim" id="btn-add-grupo">Adicionar grupo</button></div>
      <p class="dim"><strong>Custo direto:</strong> pode ser atribuído diretamente a um produto ou atividade (por exemplo, insumos e mão de obra da lavoura).
      <strong>Custo indireto:</strong> não é identificável a um produto e precisa de rateio (por exemplo, administração).</p></div>
    <div class="card"><div class="linha"><h2 style="margin:0">Grupos cadastrados</h2>
      <span class="dim">${grupos.length ? `${nDireto} direto(s) · ${nIndireto} indireto(s)` : ""}</span></div>
      <div class="scroll"><table class="cult-tabela"><thead><tr><th>Grupo</th><th>Classificação</th><th></th><th></th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="4" class="dim">Nenhum grupo cadastrado ainda. Use o formulário acima.</td></tr>`}</tbody></table></div>
      <p class="dim">Para esconder um grupo sem perder o histórico, desmarque <em>ativo</em>.</p></div>`;
}

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "custos") return;
  seguro(async () => {
    if (t.id === "btn-add-grupo") {
      await api("POST", "/api/grupos-custo", { nome: $("#ng-nome").value, classificacao: $("#ng-class").value, ativa: true });
      await recarregar(); mostrar("Grupo cadastrado.", true);
    } else if (t.dataset.grupoSalvar) {
      const row = document.querySelector(`[data-grupo-row="${t.dataset.grupoSalvar}"]`), v = (k) => row.querySelector(`[data-k="${k}"]`);
      await api("PUT", `/api/grupos-custo/${t.dataset.grupoSalvar}`, { nome: v("nome").value, classificacao: v("classificacao").value, ativa: v("ativa").checked });
      await recarregar(); mostrar("Grupo salvo.", true);
    } else if (t.dataset.grupoExcluir) {
      if (!await confirmar("Excluir este grupo de custos?")) return;
      await api("DELETE", `/api/grupos-custo/${t.dataset.grupoExcluir}`);
      await recarregar(); mostrar("Grupo excluído.", true);
    }
  });
});
