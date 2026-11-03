"use strict";
// ---------------------------------------------------------------- produtividade
function htmlProdutividade() {
  const aba = estado.prodAba, n = (estado.produtividade || { culturas: [] }).culturas.length;
  const abas = `<nav class="abas" id="abas-prod"><button class="${aba === "agricola" ? "ativa" : ""}" data-prod-aba="agricola">Produtividade agrícola <span class="dim">(${n})</span></button>
    <button class="${aba === "pecuaria" ? "ativa" : ""}" data-prod-aba="pecuaria">Produtividade pecuária</button></nav>`;
  return abas + (aba === "pecuaria" ? htmlProdutividadePecuaria() : htmlProdutividadeAgricola());
}

function htmlProdutividadeAgricola() {
  const p = estado.produtividade;
  if (!p) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para lançar a produtividade.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  const culturas = p.culturas.filter((c) => c.grupo !== "Pecuária");
  if (!culturas.length) {
    return `${aviso}<div class="card">${cabecaCartao("chart", "Produtividade por hectare")}
      <div class="vazio">Nenhum produto ainda. Os produtos adicionados em <a href="#" data-modulo="areas">Áreas por produto</a> aparecem aqui automaticamente.</div></div>`;
  }
  const un = (u) => `${u || "kg"}/ha`;
  const linhas = culturas.map((c) => `<tr><td><span class="prod-nome">${iconeProduto(c.nome, c.grupo)}${esc(c.nome)}</span> <span class="dim">· ${un(c.unidade)}</span>${c.ativa ? "" : ' <span class="chip arr">inativo</span>'}${c.removivel ? ` <span class="chip" title="Adicionado à mão, sem área">sem área</span>` : ""}</td>
      ${p.anos.map((y) => `<td class="${c.anos[y] > 0 ? "preenchido" : ""}"><input type="number" step="0.01" min="0" ${dis} data-prod-c="${c.id}" data-ano="${y}" value="${c.anos[y]}"></td>`).join("")}
      <td class="acoes">${trava() ? "" : `<select class="peq" id="rpd-${c.id}" aria-label="Replicar a partir do ano">${p.anos.map((y) => `<option>${y}</option>`).join("")}</select>
        <button class="sec peq" data-replicar-prod="${c.id}" title="Copia a produtividade do ano escolhido para os anos seguintes">Replicar →</button>`}
        ${c.removivel && !trava() ? btnLixo(`data-mx="remover" data-tela="produtividade" data-cid="${c.id}"`, "Tirar o produto desta lista (ele não tem área)") : ""}</td></tr>`).join("");
  const todas = trava() ? "" : replicarMini("rpd-todas", "btn-replicar-todas-prod", p.anos, "Copia a produtividade de cada produto do ano escolhido para os anos seguintes", "Replicar todas");
  return `${aviso}<div class="card">${cabecaCartao("chart", "Produtividade por hectare", todas)}
    <div class="scroll"><table class="grade"><thead><tr><th>Produto</th>${p.anos.map((y) => `<th>${y}</th>`).join("")}<th class="acoes">Ações</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

function htmlCompararProd() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpProdB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmprod-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmprod">Comparar</button></div>`;
  const c = estado.cmpProd;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpProdAno) ? estado.cmpProdAno : c.anos[0];
  const cel = (o) => `<td>${num(o.a, 2)}</td><td>${num(o.b, 2)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, 2)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmprod-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Produto</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${Object.entries(c.culturas).map(([n, d]) => `<tr><td>${esc(n)} <span class="dim">· ${d.unidade || "kg"}/ha</span></td>${cel(d.anos[ano])}</tr>`).join("")}
    </tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (modAtivo() !== "produtividade") return;
  if (t.dataset.prodC !== undefined) {
    seguro(async () => {
      await api("PUT", `/api/versoes/${estado.vid}/produtividade/${t.dataset.prodC}/${t.dataset.ano}`, { valor: Number(t.value || 0) });
      await recarregar();
    });
  } else if (t.id === "cmprod-b") { estado.cmpProdB = Number(t.value); estado.cmpProd = null; }
  else if (t.id === "cmprod-ano") { estado.cmpProdAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || modAtivo() !== "produtividade") return;
  seguro(async () => {
    if (t.id === "btn-replicar-todas-prod") {
      const ano = Number($("#rpd-todas").value);
      if (!await confirmar(`Copiar a produtividade de TODOS os produtos de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/produtividade/replicar-todas`, { ano });
      await recarregar(); mostrar(`Produtividade de ${r.culturas} cultura(s) replicada para ${r.anos_alterados} ano(s).`, true);
    } else if (t.dataset.replicarProd) {
      const cid = t.dataset.replicarProd, ano = Number(document.getElementById(`rpd-${cid}`).value);
      const nome = estado.produtividade.culturas.find((c) => c.id === Number(cid)).nome;
      if (!await confirmar(`Copiar a produtividade de ${nome} de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/produtividade/${cid}/replicar`, { ano });
      await recarregar(); mostrar("Produtividade replicada.", true);
    } else if (t.id === "btn-cmprod") {
      const outra = estado.cmpProdB || Number($("#cmprod-b").value);
      estado.cmpProdB = outra;
      const tipo = (id) => (estado.versoes.find((v) => v.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpProd = await api("GET", `/api/comparar-produtividade?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
