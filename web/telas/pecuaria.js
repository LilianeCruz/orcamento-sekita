"use strict";
// ---------------------------------------------------------------- produtividade pecuária (leite)
function htmlProdutividadePecuaria() {
  const p = estado.pecuaria;
  if (!p) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para lançar a produtividade.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  const fmt = (l, v) => num(v, l.id === "kg_animal_dia" ? 2 : 0);
  const linhas = p.linhas.map((l) => l.entrada
    ? `<tr><td>${esc(l.nome)} <span class="dim">· ${esc(l.unidade)}</span></td>
        ${p.anos.map((y) => `<td><input type="number" step="${l.id === "animais" ? "1" : "0.01"}" min="0" ${dis} data-pec="${l.id}" data-ano="${y}" value="${l.valores[y] || ""}"></td>`).join("")}
        <td>${trava() ? "" : `<select id="rpec-${l.id}">${p.anos.map((y) => `<option>${y}</option>`).join("")}</select>
          <button class="sec" data-pec-replicar="${l.id}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>`}</td></tr>`
    : `<tr class="total"><td>${esc(l.nome)} <span class="dim">· ${esc(l.unidade)}</span></td>${p.anos.map((y) => `<td>${num(l.valores[y], 0)}</td>`).join("")}<td></td></tr>`).join("");
  const todos = trava() ? "" : `<div class="linha"><strong>Replicar todos os campos:</strong> a partir de
      <select id="rpec-todos">${p.anos.map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" id="btn-pec-todos" title="Copia os campos do ano escolhido para os anos seguintes">Replicar todos →</button></div>`;
  return `${aviso}<div class="card"><h2>Pecuária · ${esc(p.atividade)}</h2>
    ${todos}
    <div class="scroll"><table><thead><tr><th>${esc(p.atividade)}</th>${p.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${linhas}</tbody></table></div></div>
    ${htmlProdutosPecuaria(dis)}${htmlRebanho(dis)}`;
}

// movimentação do rebanho (gado de corte): saldo inicial, compras, nascimentos, mortes e vendas, em cabeças por ano
function htmlRebanho(dis) {
  const r = estado.rebanho;
  if (!r || !r.produtos.length) return "";
  const nf = (v) => num(v, 0);
  return r.produtos.map((pr) => {
    const linha = (l) => {
      const dinheiro = l.unidade === "R$";
      const cel = (y) => (l.editavel[y]
        ? `<td><input ${dinheiro ? 'class="moeda" type="text" inputmode="decimal"' : 'type="number" step="1" min="0"'} ${dis} data-reb="${pr.id}|${l.id}|${y}" value="${dinheiro ? fmtMoeda(l.valores[y]) : (l.valores[y] || "")}"></td>`
        : `<td class="${l.estilo === "total" ? "total" : "dim"}">${dinheiro ? fmtMoeda(l.valores[y]) : nf(l.valores[y])}</td>`);
      const rep = !dis && ["compras", "nascimentos", "mortes", "vendas"].includes(l.id)
        ? `<td><select id="rreb-${pr.id}-${l.id}">${r.anos.map((y) => `<option>${y}</option>`).join("")}</select> <button class="sec" data-reb-replicar="${pr.id}|${l.id}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button></td>` : "<td></td>";
      return `<tr class="${l.estilo === "total" ? "total" : ""}"><td>${esc(l.nome)} <span class="dim">· ${esc(dinheiro ? "R$" : "cabeças")}</span></td>${r.anos.map(cel).join("")}${rep}</tr>`;
    };
    return `<div class="card"><div class="linha" style="justify-content:space-between"><h2 style="margin:0">Movimentação do rebanho · ${esc(pr.nome)}</h2></div>
      <div class="scroll"><table><thead><tr><th>${esc(pr.nome)}</th>${r.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${pr.linhas.map(linha).join("")}</tbody></table></div></div>`;
  }).join("");
}

function htmlProdutosPecuaria(dis) {
  const p = estado.produtividade;
  if (!p) return "";
  const rebanhoIds = new Set(((estado.rebanho || {}).produtos || []).map((x) => x.id));        // gado de corte tem bloco próprio (movimentação do rebanho)
  const produtos = p.culturas.filter((c) => c.grupo === "Pecuária" && !rebanhoIds.has(c.id));
  const botao = trava() ? "" : `<button class="prim" data-mx="abrir" data-tela="produtividade" data-filtro="pecuaria">+ Adicionar produto</button>`;
  const linhas = produtos.map((c) => `<tr><td>${esc(c.nome)} <span class="dim">· ${esc(c.unidade)}/ano</span>${c.ativa ? "" : ' <span class="chip arr">inativa</span>'}</td>
      ${p.anos.map((y) => `<td><input type="number" step="0.01" min="0" ${dis} data-prod-c="${c.id}" data-ano="${y}" value="${c.anos[y]}"></td>`).join("")}
      <td>${trava() ? "" : `<select id="rpd-${c.id}">${p.anos.map((y) => `<option>${y}</option>`).join("")}</select>
        <button class="sec" data-replicar-prod="${c.id}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>
        ${c.removivel ? `<button class="link" data-mx="remover" data-tela="produtividade" data-cid="${c.id}" title="Tira o produto desta lista">Remover</button>` : ""}`}</td></tr>`).join("");
  return `<div class="card"><div class="linha" style="justify-content:space-between"><h2 style="margin:0">Outros produtos da pecuária</h2>${botao}</div>
    ${produtos.length ? `<div class="scroll"><table><thead><tr><th>Produto</th>${p.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : `<div class="vazio">Nenhum produto adicionado. Clique em <strong>+ Adicionar produto</strong> e escolha um produto do grupo Pecuária. Para controlar o gado por cabeças (compras, nascimentos, mortes e vendas), escolha <strong>Rebanho</strong> em <strong>Produtos › Controle</strong>.</div>`}</div>`;
}

function htmlCompararPecuaria() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpPecB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmpec-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmpec">Comparar</button></div>`;
  const c = estado.cmpPec;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpPecAno) ? estado.cmpPecAno : c.anos[0];
  const cel = (o) => `<td>${num(o.a, 2)}</td><td>${num(o.b, 2)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, 2)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmpec-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>${esc(c.atividade)}</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.linhas.map((l) => `<tr class="${l.entrada ? "" : "total"}"><td>${esc(l.nome)} <span class="dim">· ${esc(l.unidade)}</span></td>${cel(l.anos[ano])}</tr>`).join("")}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (modAtivo() !== "produtividade") return;
  if (t.dataset.reb !== undefined) {
    const [cid, campo, ano] = t.dataset.reb.split("|");
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/rebanho/${cid}/${campo}/${ano}`, { valor: Number(t.value || 0) }); await recarregar(); });
  } else if (t.dataset.pec !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/pecuaria/${t.dataset.pec}/${t.dataset.ano}`, { valor: Number(t.value || 0) }); await recarregar(); });
  } else if (t.id === "cmpec-b") { estado.cmpPecB = Number(t.value); estado.cmpPec = null; }
  else if (t.id === "cmpec-ano") { estado.cmpPecAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || modAtivo() !== "produtividade") return;
  if (t.dataset.prodAba) { estado.prodAba = t.dataset.prodAba; desenhar(); return; }
  seguro(async () => {
    if (t.dataset.rebReplicar) {
      const [cid, campo] = t.dataset.rebReplicar.split("|"), ano = Number(document.getElementById(`rreb-${cid}-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/rebanho/${cid}/${campo}/replicar`, { ano });
      await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.dataset.pecReplicar) {
      const campo = t.dataset.pecReplicar, ano = Number(document.getElementById(`rpec-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/pecuaria/${campo}/replicar`, { ano });
      await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.id === "btn-pec-todos") {
      const ano = Number($("#rpec-todos").value);
      if (!await confirmar(`Copiar todos os campos de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/pecuaria/replicar-todos`, { ano });
      await recarregar(); mostrar(`${r.campos} campo(s) replicado(s) para ${r.anos_alterados} ano(s).`, true);
    } else if (t.id === "btn-cmpec") {
      const outra = estado.cmpPecB || Number($("#cmpec-b").value);
      estado.cmpPecB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpPec = await api("GET", `/api/comparar-pecuaria?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});

// ---------------------------------------------------------------- botão "+": adicionar produto sem área (Produtividade e Preços)
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mx]");
  if (!b) return;
  const acao = b.dataset.mx;
  const dados = (tela) => (tela === "produtividade" ? estado.produtividade : estado.precosVenda);
  const rota = (tela) => (tela === "produtividade" ? "produtividade" : "precos-venda");
  if (acao === "fechar") { fecharModal(); return; }
  if (acao === "ir-culturas") { fecharModal(); document.querySelector('#nav-modulos [data-modulo="culturas"]').click(); return; }
  if (acao === "abrir") {
    const { tela, filtro } = b.dataset, d = dados(tela);
    const lista = d.disponiveis.filter((c) => filtro === "pecuaria" ? c.grupo === "Pecuária" : filtro === "agricola" ? c.grupo !== "Pecuária" : true);
    const o = filtro === "pecuaria" ? "produto da pecuária" : "produto";
    abrirModal(filtro === "pecuaria" ? "Adicionar produto da pecuária" : "Adicionar produto", lista.length
      ? `<label class="campo">Produto<select id="mx-pick">${lista.map((c) => `<option value="${c.id}">${esc(c.nome)} · ${esc(c.grupo)} · ${esc(ROTULO_UNIDADE[c.unidade] || c.unidade)}</option>`).join("")}</select></label>
         <div id="md-erro" class="msg" style="margin:8px 0 0" hidden></div>
         <div class="linha" style="margin-top:12px"><button class="prim" data-mx="confirmar" data-tela="${tela}">Adicionar</button><button class="sec" data-mx="fechar">Cancelar</button></div>`
      : `<p>Não há ${o} disponível para adicionar${filtro === "pecuaria" ? ". Cadastre o produto em <strong>Produtos</strong>, no grupo <strong>Pecuária</strong>" : ": todos os produtos ativos do cadastro já estão na lista"}.</p>
         <div class="linha" style="margin-top:12px">${filtro === "pecuaria" ? `<button class="prim" data-mx="ir-culturas">Ir para Produtos</button>` : ""}<button class="sec" data-mx="fechar">Fechar</button></div>`);
    return;
  }
  seguro(async () => {
    if (acao === "confirmar") {
      await api("POST", `/api/versoes/${estado.vid}/${rota(b.dataset.tela)}/culturas`, { cultura_id: Number(document.getElementById("mx-pick").value) });
      fecharModal(); await recarregar(); mostrar("Adicionado. Digite os valores por ano.", true);
    } else if (acao === "remover") {
      if (!await confirmar("Tirar este produto da lista? Os valores dele nesta tela, nesta versão, serão apagados.")) return;
      await api("DELETE", `/api/versoes/${estado.vid}/${rota(b.dataset.tela)}/culturas/${b.dataset.cid}`);
      await recarregar();
    }
  });
});
