"use strict";
// ---------------------------------------------------------------- premissas de transportadora (receita e custo direto; alimenta as linhas de transportes da DRE)
function htmlTransportadora() {
  const d = estado.transp;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  const n = d.anos.length + 2;
  const secao = (t) => `<tr><td colspan="${n}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${esc(t)}</td></tr>`;
  const casas = (u) => (u === "R$/km" ? 4 : u === "uni" ? 0 : u === "km/caminhão" ? 0 : 2);
  const linha = (l) => `<tr><td>${esc(l.nome)} <span class="dim">· ${esc(l.unidade)}</span></td>
      ${d.anos.map((y) => `<td><input type="number" step="any" min="0" ${dis} data-tr="${l.campo}" data-ano="${y}" value="${l.valores[y] === null || l.valores[y] === undefined ? "" : l.valores[y]}"></td>`).join("")}
      <td>${trava() ? "" : `<select id="rtr-${l.campo}">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
        <button class="sec" data-tr-replicar="${l.campo}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>`}</td></tr>`;
  const corpo = d.grupos.map((g) => secao(g.titulo) + g.linhas.map(linha).join("")).join("");
  const r = d.resultado;
  const res = (nome, k, est = "") => `<tr class="${est}"><td>${nome} </td>${d.anos.map((y) => `<td>${r[k][y] ? rs(r[k][y] * 1000) : "–"}</td>`).join("")}</tr>`;
  const todos = trava() ? "" : `<div class="linha"><strong>Replicar todos os campos:</strong> a partir de
      <select id="rtr-todos">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" id="btn-tr-todos" title="Copia todos os campos do ano escolhido para os anos seguintes">Replicar todos →</button></div>`;
  return `${aviso}<div class="card">${cabecaCartaoGrande("caixa", "Premissas de transportadora")}
    <p class="dim">Receita = caminhões × km por caminhão × preço por km. Custo direto (CPV) = km rodado × rubricas em R$/km, incluindo as despesas. O resultado alimenta as linhas de transportes da DRE;
      depreciação, compra e venda de caminhões ficam em Premissas de investimento.</p>${todos}
    <div class="scroll"><table><thead><tr><th>Premissa</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${corpo}</tbody></table></div></div>
    <div class="card"><h2>Resultado da transportadora</h2><p class="dim">Calculado pelas premissas acima; é o que a DRE recebe.</p>
    <div class="scroll"><table><thead><tr><th>Linha</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      <tr><td>Km rodado total <span class="dim">· km</span></td>${d.anos.map((y) => `<td>${r.km_total[y] ? num(r.km_total[y], 0) : "–"}</td>`).join("")}</tr>
      ${res("Receita bruta", "receita_bruta")}${res("(-) Deduções", "deducoes")}${res("Receita líquida", "receita_liquida", "total")}
      ${res("(-) Custos variáveis", "custo_variavel")}${res("(-) Custos fixos", "custo_fixo")}${res("(-) Despesas (também no CPV)", "despesas")}${res("Resultado bruto da transportadora", "resultado_bruto", "total")}
      <tr class="dim"><td>Margem bruta <span class="dim">· %</span></td>${d.anos.map((y) => `<td>${r.receita_liquida[y] ? num(r.margem[y], 1) + "%" : "–"}</td>`).join("")}</tr>
    </tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "transp" || t.dataset.tr === undefined) return;
  seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/transportadora/${t.dataset.tr}/${t.dataset.ano}`, { valor: Number(t.value || 0) }); await recarregar(); });
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "transp") return;
  seguro(async () => {
    if (t.dataset.trReplicar) {
      const campo = t.dataset.trReplicar, ano = Number(document.getElementById(`rtr-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/transportadora/${campo}/replicar`, { ano });
      await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.id === "btn-tr-todos") {
      const ano = Number($("#rtr-todos").value);
      if (!await confirmar(`Copiar todos os campos de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/transportadora/replicar-todos`, { ano });
      await recarregar(); mostrar(`${r.campos} campo(s) replicado(s) para ${r.anos_alterados} ano(s).`, true);
    }
  });
});
