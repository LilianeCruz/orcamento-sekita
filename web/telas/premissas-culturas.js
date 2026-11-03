"use strict";
// ---------------------------------------------------------------- premissas de produtos
function htmlPremissas() {
  const p = estado.premissas;
  if (!p) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para lançar as premissas.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  // barra fina para acrescentar produto (os produtos de Áreas por produto) e replicar tudo
  let escolher = "";
  if (!trava()) {
    if (!p.total_culturas_areas) escolher = `<div class="barra-add fina"><span class="dim">Ainda não há produtos com área ou produtividade.</span></div>`;
    else if (!p.culturas_escolhiveis.length) escolher = `<div class="barra-add fina"><span class="dim">Todos os produtos com área ou produtividade já estão aqui.</span></div>`;
    else escolher = `<div class="barra-add fina"><select class="peq" id="sel-add-cultura-prem" aria-label="Produto a adicionar">${p.culturas_escolhiveis.map((x) => `<option value="${x.id}">${esc(x.nome)} – ${esc(x.grupo)}</option>`).join("")}</select>
        <button class="btn-mais" id="btn-add-cultura-prem" title="Adicionar produto" aria-label="Adicionar produto">${icone("plus", 16)}</button>@@REPL@@</div>`;
  }
  if (!p.culturas.length) {
    return `${aviso}${escolher.replace("@@REPL@@", "")}<div class="card vazio">${trava() ? "Nenhum produto foi adicionado nesta versão." : "Nenhum produto adicionado ainda. Escolha um produto acima para vincular as premissas."}</div>`;
  }
  const repl = trava() ? "" : `<div class="dir"><select id="rpm-todas">${p.anos.map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" id="btn-rep-todas-prem" title="Copia o valor de cada linha do ano escolhido para os anos seguintes">Replicar todas →</button></div>`;
  escolher = escolher.includes("@@REPL@@") ? escolher.replace("@@REPL@@", repl) : (trava() ? "" : escolher.replace("</div>", `${repl}</div>`));
  const cartao = (cu) => {
    const temUnico = cu.premissas.some((x) => x.unico);                       // estoque do ano anterior: coluna extra, só com essas linhas preenchíveis
    const linhas = cu.premissas.map((pr) => pr.unico ? `<tr><td>${esc(pr.nome)} <span class="chip arr">${esc(pr.unidade)}</span></td>
        <td class="ano-ant"><input type="number" step="0.01" min="0" ${dis} data-prem-c="${cu.id}" data-prem-t="${pr.tipo}" data-ano="${p.ano_anterior}" value="${pr.anos[p.ano_anterior]}"></td>
        <td colspan="${p.anos.length}" class="dim">Saldo em 31/12/${p.ano_anterior}, que entra no orçamento de ${p.anos[0]}. Não se replica.</td>
        <td class="acoes">${trava() ? "" : btnLixo(`data-rem-prem="${cu.id}:${pr.tipo}"`, "Tirar esta premissa do produto")}</td></tr>`
      : `<tr><td>${esc(pr.nome)} <span class="chip ${pr.unidade === "%" ? "" : "arr"}">${esc(pr.unidade)}</span></td>${temUnico ? "<td class=\"ano-ant\"></td>" : ""}
        ${p.anos.map((y) => `<td><input type="number" step="0.01" min="0" ${pr.unidade === "%" ? 'max="100"' : ""} ${dis} data-prem-c="${cu.id}" data-prem-t="${pr.tipo}" data-ano="${y}" value="${pr.anos[y]}"></td>`).join("")}
        <td class="acoes">${trava() ? "" : `<select class="peq" id="rp-${cu.id}-${pr.tipo}">${p.anos.map((y) => `<option>${y}</option>`).join("")}</select>
          <button class="sec peq" data-rep-prem="${cu.id}:${pr.tipo}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>
          ${btnLixo(`data-rem-prem="${cu.id}:${pr.tipo}"`, "Tirar esta premissa do produto")}`}</td></tr>`).join("");
    const adicionar = trava() ? "" : (cu.adicionaveis.length
      ? `<select class="peq" id="sel-pt-${cu.id}" aria-label="Premissa a vincular">${cu.adicionaveis.map((t) => `<option value="${t.tipo}">${esc(t.nome)}</option>`).join("")}</select>
          <button class="prim peq" data-add-prem="${cu.id}">${icone("plus", 14)} Premissa</button>
          <button class="sec peq" data-add-prem-todas="${cu.id}" title="Vincula a premissa escolhida a todos os produtos desta tela">Para todos</button>`
      : "");
    return `<div class="card"><div class="prod-cab mini"><span class="emoji-grande">${emojiProduto(cu.nome, cu.grupo)}</span><h2>${esc(cu.nome)}</h2><span class="chip">${esc(cu.grupo)}</span>
        <div class="dir">${adicionar}${trava() ? "" : btnLixo(`data-rem-cultura-prem="${cu.id}"`, "Tirar o produto desta tela e apagar as premissas dele")}</div></div>
      <div class="scroll"><table class="grade"><thead><tr><th>Premissa</th>${temUnico ? `<th class="ano-ant">${p.ano_anterior}<br><small>ano anterior</small></th>` : ""}${p.anos.map((y) => `<th>${y}</th>`).join("")}<th class="acoes">Ações</th></tr></thead><tbody>
        ${linhas || `<tr><td colspan="${p.anos.length + 2}" class="dim">Nenhuma premissa ainda. Escolha o tipo e clique em + Premissa.</td></tr>`}</tbody></table></div></div>`;
  };
  return `${aviso}${escolher}${p.culturas.map(cartao).join("")}`;
}

function htmlCompararPremissas() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpPremB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmprem-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmprem">Comparar</button></div>`;
  const c = estado.cmpPrem;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpPremAno) ? estado.cmpPremAno : c.anos[0];
  const cel = (o) => `<td>${num(o.a, 2)}</td><td>${num(o.b, 2)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, 2)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  const linhas = Object.entries(c.culturas).map(([n, d]) => `<tr class="total"><td colspan="5">${esc(n)}</td></tr>`
    + Object.entries(d).map(([nome, v]) => `<tr><td style="padding-left:24px" class="dim">${esc(nome)} <span class="dim">(${esc(v.unidade)})</span></td>${cel(v.anos[ano])}</tr>`).join("")).join("");
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmprem-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Produto / premissa</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (modAtivo() !== "premissas") return;
  if (t.dataset.premC !== undefined) {
    seguro(async () => {
      await api("PUT", `/api/versoes/${estado.vid}/premissas/${t.dataset.premC}/${t.dataset.premT}/${t.dataset.ano}`, { valor: Number(t.value || 0) });
      await recarregar();
    });
  } else if (t.id === "cmprem-b") { estado.cmpPremB = Number(t.value); estado.cmpPrem = null; }
  else if (t.id === "cmprem-ano") { estado.cmpPremAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || modAtivo() !== "premissas") return;
  seguro(async () => {
    const d = t.dataset, v = estado.vid;
    if (t.id === "btn-add-cultura-prem") {
      await api("POST", `/api/versoes/${v}/premissas/culturas`, { cultura_id: Number($("#sel-add-cultura-prem").value) });
      await recarregar(); mostrar("Produto adicionado. Agora vincule as premissas a ele.", true);
    } else if (d.remCulturaPrem) {
      const cu = estado.premissas.culturas.find((x) => x.id === Number(d.remCulturaPrem));
      if (!await confirmar(`Remover ${cu.nome} de Premissas de produtos?${cu.premissas.length ? " As premissas lançadas nele serão apagadas." : ""}`)) return;
      await api("DELETE", `/api/versoes/${v}/premissas/culturas/${cu.id}`);
      await recarregar(); mostrar("Produto removido.", true);
    } else if (d.addPrem) {
      await api("POST", `/api/versoes/${v}/premissas/${d.addPrem}/tipos`, { tipo: document.getElementById(`sel-pt-${d.addPrem}`).value });
      await recarregar(); mostrar("Premissa adicionada.", true);
    } else if (d.addPremTodas) {
      const sel = document.getElementById(`sel-pt-${d.addPremTodas}`), nome = sel.selectedOptions[0].text;
      const r = await api("POST", `/api/versoes/${v}/premissas/tipos-todas`, { tipo: sel.value });
      await recarregar();
      mostrar(`${nome} vinculada a ${r.adicionadas} cultura(s)${r.ja_tinham ? ` (${r.ja_tinham} já tinha(m))` : ""}.`, true);
    } else if (d.remPrem) {
      const [cid, tipo] = d.remPrem.split(":");
      const cu = estado.premissas.culturas.find((x) => x.id === Number(cid)), pr = cu.premissas.find((x) => x.tipo === tipo);
      if (!await confirmar(`Remover ${pr.nome} de ${cu.nome}?${Object.values(pr.anos).some((x) => x) ? " Os valores lançados serão apagados." : ""}`)) return;
      await api("DELETE", `/api/versoes/${v}/premissas/${cid}/tipos/${tipo}`);
      await recarregar(); mostrar("Premissa removida.", true);
    } else if (d.repPrem) {
      const [cid, tipo] = d.repPrem.split(":"), ano = Number(document.getElementById(`rp-${cid}-${tipo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para todos os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${v}/premissas/${cid}/${tipo}/replicar`, { ano });
      await recarregar(); mostrar("Premissa replicada.", true);
    } else if (t.id === "btn-rep-todas-prem") {
      const ano = Number($("#rpm-todas").value);
      if (!await confirmar(`Copiar as premissas de TODAS as linhas de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${v}/premissas/replicar-todas`, { ano });
      await recarregar(); mostrar(`Premissas de ${r.linhas} linha(s) replicadas para ${r.anos_alterados} ano(s).`, true);
    } else if (t.id === "btn-cmprem") {
      const outra = estado.cmpPremB || Number($("#cmprem-b").value);
      estado.cmpPremB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(v) !== "orcado" ? [outra, v] : [v, outra];
      estado.cmpPrem = await api("GET", `/api/comparar-premissas?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
