"use strict";
// ---------------------------------------------------------------- preços
function htmlPrecosVenda() {
  const p = estado.precosVenda;
  if (!p) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para lançar os preços.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  if (!p.culturas.length) {
    return `${aviso}<div class="card">${cabecaCartao("tag", "Preço de venda por produto")}
      <div class="vazio">Nenhum produto ainda. Os produtos de <a href="#" data-modulo="areas">Áreas por produto</a> e os da produtividade pecuária aparecem aqui automaticamente.</div></div>`;
  }
  const linhas = p.culturas.map((c) => `<tr><td><span class="prod-nome">${iconeProduto(c.nome, c.grupo)}${esc(c.nome)}</span> <span class="dim">· R$/${esc(c.unidade)}</span>${c.ativa ? "" : ' <span class="chip arr">inativo</span>'}${c.removivel ? ` <span class="chip" title="Adicionado à mão, sem área">sem área</span>` : ""}</td>
      ${p.anos.map((y) => `<td class="${c.anos[y] > 0 ? "preenchido" : ""}"><input type="number" step="0.01" min="0" ${dis} data-preco-v="${c.id}" data-ano="${y}" value="${c.anos[y] ?? ""}"></td>`).join("")}
      <td class="acoes">${trava() ? "" : `<select class="peq" id="rpv-${c.id}" aria-label="Replicar a partir do ano">${p.anos.map((y) => `<option>${y}</option>`).join("")}</select>
        <button class="sec peq" data-replicar-preco-v="${c.id}" title="Copia o preço do ano escolhido para os anos seguintes">Replicar →</button>`}
        ${c.removivel && !trava() ? btnLixo(`data-mx="remover" data-tela="precos" data-cid="${c.id}"`, "Tirar o produto desta lista (ele não tem área)") : ""}</td></tr>`).join("");
  const todas = trava() ? "" : replicarMini("rpv-todas", "btn-replicar-todos-precos", p.anos, "Copia o preço de cada produto do ano escolhido para os anos seguintes", "Replicar todos");
  return `${aviso}<div class="card">${cabecaCartao("tag", "Preço de venda por produto", todas)}
    <div class="scroll"><table class="grade"><thead><tr><th>Produto</th>${p.anos.map((y) => `<th>${y}</th>`).join("")}<th class="acoes">Ações</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

function htmlCompararPrecos() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpPrecoB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmpv-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmpv">Comparar</button></div>`;
  const c = estado.cmpPreco;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpPrecoAno) ? estado.cmpPrecoAno : c.anos[0];
  const cel = (o) => `<td>${num(o.a, 2)}</td><td>${num(o.b, 2)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, 2)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmpv-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Produto</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${Object.entries(c.culturas).map(([n, d]) => `<tr><td>${esc(n)} <span class="dim">· R$/${esc(d.unidade)}</span></td>${cel(d.anos[ano])}</tr>`).join("")}
    </tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (modAtivo() !== "precos") return;
  if (t.dataset.precoV !== undefined) {
    seguro(async () => {
      await api("PUT", `/api/versoes/${estado.vid}/precos-venda/${t.dataset.precoV}/${t.dataset.ano}`, { preco: Number(t.value || 0) });
      await recarregar();
    });
  } else if (t.id === "cmpv-b") { estado.cmpPrecoB = Number(t.value); estado.cmpPreco = null; }
  else if (t.id === "cmpv-ano") { estado.cmpPrecoAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || modAtivo() !== "precos") return;
  seguro(async () => {
    if (t.id === "btn-replicar-todos-precos") {
      const ano = Number($("#rpv-todas").value);
      if (!await confirmar(`Copiar o preço de TODOS os produtos de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/precos-venda/replicar-todas`, { ano });
      await recarregar(); mostrar(`Preço de ${r.culturas} cultura(s) replicado para ${r.anos_alterados} ano(s).`, true);
    } else if (t.dataset.replicarPrecoV) {
      const cid = Number(t.dataset.replicarPrecoV), ano = Number(document.getElementById(`rpv-${cid}`).value);
      const nome = estado.precosVenda.culturas.find((c) => c.id === cid).nome;
      if (!await confirmar(`Copiar o preço de ${nome} de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/precos-venda/${cid}/replicar`, { ano });
      await recarregar(); mostrar("Preço replicado.", true);
    } else if (t.id === "btn-cmpv") {
      const outra = estado.cmpPrecoB || Number($("#cmpv-b").value);
      estado.cmpPrecoB = outra;
      const tipo = (id) => (estado.versoes.find((v) => v.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpPreco = await api("GET", `/api/comparar-precos-venda?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
