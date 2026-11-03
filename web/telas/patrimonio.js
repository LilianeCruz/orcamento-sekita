"use strict";
// ---------------------------------------------------------------- Patrimônio líquido (distribuição de lucros, aportes, ajustes)
function htmlPatrimonio() {
  const d = estado.pat;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  const fmt = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "–" : rs(v * 1000));      // guardado em R$ mil, mostrado em reais
  const ic = (l) => (l.explicacao ? ` <button class="link ajuda-i" style="color:var(--verde);padding:0 4px" data-pop="${esc(l.explicacao)}" title="Como é calculado">ⓘ</button>` : "");
  const todos = trava() ? "" : `<div class="linha"><strong>Replicar todos os campos:</strong> a partir de <select id="rpat-todos">${[...d.anos_extras, ...d.anos].map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" id="btn-pat-todos" title="Copia todas as premissas do ano escolhido para os anos seguintes">Replicar todos →</button></div>`;
  const ext = [...d.anos_extras, ...d.anos];
  const cab = (lista) => lista.map((y) => `<th>${y}${d.anos_extras.includes(y) ? ' <span class="dim" style="font-weight:400">(ano anterior)</span>' : ""}</th>`).join("");
  const prem = `<div class="card"><h2>Distribuição de lucros</h2>
    ${todos}
    <div class="scroll"><table><thead><tr><th>Regra por ano do lucro</th>${cab(ext)}<th></th></tr></thead><tbody>
      ${d.premissas.map((p) => `<tr><td>${esc(p.nome)} <span class="dim">· ${esc(p.unidade === "R$ mil" ? "R$" : p.unidade)}</span></td>${ext.map((y) => `<td><input type="number" step="any" min="0" ${dis} ${p.unidade === "R$ mil" ? "data-moeda data-pat-reais" : ""} data-pat="${p.campo}" data-ano="${y}" value="${p.unidade === "R$ mil" ? (p.valores[y] * 1000 || "") : (p.valores[y] || "")}"></td>`).join("")}
        <td>${trava() ? "" : `<select id="rpat-${p.campo}">${ext.map((y) => `<option>${y}</option>`).join("")}</select> <button class="sec" data-pat-replicar="${p.campo}">Replicar →</button>`}</td></tr>`).join("")}</tbody></table></div>
</div>`;
  const avisos = d.avisos.length ? `<div class="card"><strong>Atenção</strong><ul>${d.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "";
  const celula = (l, y) => (l.editavel
    ? `<td><input type="number" step="any" ${dis} data-moeda data-pat-saldo="${l.campo}" data-ano="${y}" value="${l.valores[y] * 1000}" class="${l.alterado[y] ? "alterado" : ""}" title="${l.alterado[y] ? `Alterado. Sem a alteração seria ${num(l.calculado[y] * 1000, 0)}.` : "Traz o saldo do ano anterior. Digite para alterar."}"></td>`
    : `<td class="${l.valores[y] < 0 ? "pos" : ""}">${fmt(l.valores[y])}</td>`);
  const secoes = (lista, colunas) => lista.map((sc) => `<tr><td colspan="${colunas.length + 1}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${esc(sc.titulo)}</td></tr>
    ${sc.linhas.map((l) => `<tr class="${l.estilo === "total" ? "total" : ""}"><td style="padding-left:20px">${esc(l.nome)}${ic(l)}${l.editavel && !trava() && Object.values(l.alterado).some(Boolean) ? ` <button class="link" data-pat-reset="${l.campo}" title="Descartar as alterações e voltar ao que vem do ano anterior">↺ calculado</button>` : ""}</td>
      ${colunas.map((y) => celula(l, y)).join("")}</tr>`).join("")}`).join("");
  const estendidas = d.resultado.filter((sc) => sc.estendida), normais = d.resultado.filter((sc) => !sc.estendida);
  const resultado = `<div class="card"><h2>Patrimônio líquido projetado</h2>
    ${estendidas.length ? `<div class="scroll"><table><thead><tr><th>Conta</th>${cab(ext)}</tr></thead><tbody>${secoes(estendidas, ext)}</tbody></table></div><div style="height:14px"></div>` : ""}
    <div class="scroll"><table><thead><tr><th>Conta</th>${cab(d.anos)}</tr></thead><tbody>${secoes(normais, d.anos)}</tbody></table></div></div>`;
  return `${aviso}${prem}${avisos}${resultado}${htmlCompararPatrimonio()}`;
}

function htmlCompararPatrimonio() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpPatB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmpat-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmpat">Comparar</button></div>`;
  const c = estado.cmpPat;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpPatAno) ? estado.cmpPatAno : c.anos[0];
  const cel = (o) => `<td>${rs(o.a * 1000)}</td><td>${rs(o.b * 1000)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${rs(o.delta * 1000)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmpat-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Linha</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.linhas.map((l) => `<tr><td>${esc(l.nome)}</td>${cel(l.anos[ano])}</tr>`).join("")}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "patrimonio") return;
  if (t.dataset.patSaldo !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/patrimonio/${t.dataset.patSaldo}/${t.dataset.ano}`, { valor: Number(t.value || 0) / 1000 }); await recarregar(); });
  } else if (t.dataset.pat !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/patrimonio/${t.dataset.pat}/${t.dataset.ano}`, { valor: Number(t.value || 0) / (t.dataset.patReais !== undefined ? 1000 : 1) }); await recarregar(); });
  } else if (t.id === "cmpat-b") { estado.cmpPatB = Number(t.value); estado.cmpPat = null; }
  else if (t.id === "cmpat-ano") { estado.cmpPatAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "patrimonio") return;
  seguro(async () => {
    if (t.dataset.patReset) {
      await api("DELETE", `/api/versoes/${estado.vid}/patrimonio/${t.dataset.patReset}`); await recarregar(); mostrar("Voltou ao valor calculado.", true);
    } else if (t.dataset.patReplicar) {
      const campo = t.dataset.patReplicar, ano = Number(document.getElementById(`rpat-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/patrimonio/${campo}/replicar`, { ano }); await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.id === "btn-pat-todos") {
      const ano = Number($("#rpat-todos").value);
      if (!await confirmar(`Copiar todas as premissas de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/patrimonio/replicar-todos`, { ano });
      await recarregar(); mostrar(`${r.campos} campo(s) replicado(s) para ${r.anos_alterados} ano(s).`, true);
    } else if (t.id === "btn-cmpat") {
      const outra = estado.cmpPatB || Number($("#cmpat-b").value);
      estado.cmpPatB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpPat = await api("GET", `/api/comparar-patrimonio?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
