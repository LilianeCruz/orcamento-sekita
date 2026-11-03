"use strict";
// ---------------------------------------------------------------- áreas
// ---------------------------------------------------------------- Premissas de produção (abas: áreas, produtividade, preços, custos variáveis)
const POM_ABAS = [["areas", "Áreas por produto"], ["produtividade", "Produtividade"], ["precos", "Preços"], ["variaveis", "Custos variáveis"],
  ["premissas", "Premissas de produtos"], ["resultado", "Resultados de produtos"]];
// tela efetivamente ativa: dentro de "Premissas de produção" vale a aba escolhida
function modAtivo() {
  if (estado.modulo === "premorc") return estado.pomAba;
  return estado.modulo === "dividas" && estado.divAba === "captacoes" ? "captacoes" : estado.modulo;       // Novas captações vive dentro de Premissas de dívidas
}
function htmlPremOrc() {
  const abas = `<nav class="abas pom-abas">${POM_ABAS.map(([id, nome]) => `<button data-pom-aba="${id}" class="${estado.pomAba === id ? "ativa" : ""}">${nome}</button>`).join("")}</nav>`;
  const tela = { areas: htmlAreas, produtividade: htmlProdutividade, precos: htmlPrecosVenda, variaveis: htmlCustosVariaveis, premissas: htmlPremissas, resultado: htmlResultado }[estado.pomAba];
  return abas + tela();
}

// gráfico de participação: uma faixa empilhada, um trecho por produto (maior → menor); o mouse mostra produto, área e %
function graficoParticipacao(a, y0, total0) {
  const cab = `<div class="card-cab"><span class="card-ic">${icone("chart", 20)}</span><h2>Participação da área por produto (${y0})</h2></div>`;
  const itens = a.culturas.filter((c) => c.anos[y0] > 0).sort((x, y) => y.anos[y0] - x.anos[y0]);
  if (!itens.length || total0 <= 0) return `<div class="kpi-grafico">${cab}<p class="dim" style="margin:0">Lance as áreas de ${y0} para ver a participação de cada produto.</p></div>`;
  let acum = 0;
  const trechos = itens.map((c, i) => {
    const pct = (c.anos[y0] / total0) * 100, cor = corProduto(c.nome, c.grupo), meio = acum + pct / 2; acum += pct;
    return `<div class="trecho ${meio > 60 ? "tip-dir" : ""}" style="flex:${pct} 1 0;background:${cor};color:#2b3a32">
      <span class="trecho-rot">${pct >= 9 ? num(pct, 1) + "%" : ""}</span>
      <div class="trecho-dica"><b><i style="background:${cor}"></i>${esc(c.nome)}</b><span>${num(c.anos[y0], 2)} ha (${num(pct, 1)}%)</span></div></div>`;
  }).join("");
  return `<div class="kpi-grafico">${cab}<div class="faixa">${trechos}</div></div>`;
}

// janela "Novo produto": cadastra no cadastro único e, se o orçamento estiver editável, já inclui o produto nele
// (assim ela aparece em Áreas, Produtividade, Preços e Custos variáveis)
async function modalNovaCultura() {
  const r = await api("GET", "/api/culturas");
  const optGrupo = r.grupos.map((g) => `<option>${esc(g)}</option>`).join("");
  const optUnidade = ["kg", "litro", "uni"].map((u) => `<option value="${u}">${ROTULO_UNIDADE[u]}</option>`).join("");
  const m = abrirModal("Novo produto", `
    <label class="campo">Produto<input id="nc-m-nome" placeholder="Ex.: Cenoura" maxlength="60"></label>
    <div class="orc-par">
      <label class="campo">Grupo<select id="nc-m-grupo">${optGrupo}</select></label>
      <label class="campo">Medida em<select id="nc-m-unidade">${optUnidade}</select></label>
    </div>
    <label class="campo" title="${DICA_RECEITA}">Receita deste produto<select id="nc-m-receita">${optReceita("operacional")}</select></label>
    <label class="campo" title="${DICA_ESTOQUE}">Controle do produto<select id="nc-m-estoque">${optEstoque("produto")}</select></label>
    <div class="orc-par">
      <label class="campo">Embalagem padrão<input id="nc-m-emb" list="lista-embalagens" placeholder="Caixa, Saco… (opcional)"></label>
      <label class="campo">Quantidade por embalagem<input id="nc-m-qtd" type="number" min="0" step="0.01" placeholder="Ex.: 20"></label>
    </div>
    <datalist id="lista-embalagens">${EMBALAGENS.map((u) => `<option value="${u}">`).join("")}</datalist>
    <div id="nc-m-erro" class="orc-erro" hidden style="margin-top:12px"></div>
    <div class="linha" style="margin-top:16px;justify-content:flex-end"><button class="sec" data-md="fechar">Cancelar</button><button class="prim" id="nc-m-salvar">Cadastrar produto</button></div>`);
  m.querySelector("#nc-m-nome").focus();
  m.querySelector("#nc-m-salvar").addEventListener("click", async () => {
    const erro = m.querySelector("#nc-m-erro"); erro.hidden = true;
    const nome = m.querySelector("#nc-m-nome").value.trim();
    if (!nome) { erro.textContent = "Informe o nome do produto."; erro.hidden = false; return; }
    try {
      const c = await api("POST", "/api/culturas", { nome, grupo: m.querySelector("#nc-m-grupo").value, unidade: m.querySelector("#nc-m-unidade").value,
        embalagem: m.querySelector("#nc-m-emb").value, qtd_por_embalagem: Number(m.querySelector("#nc-m-qtd").value || 0), ativa: true,
        receita_tipo: m.querySelector("#nc-m-receita").value, estoque_destino: m.querySelector("#nc-m-estoque").value });
      let aviso = "";
      if (estado.vid && !trava()) { try { await api("POST", `/api/versoes/${estado.vid}/areas/culturas`, { cultura_id: c.id }); } catch (e) { aviso = ` (não entrou no orçamento: ${e.message})`; } }
      fecharModal(); await recarregar();
      mostrar(`Produto "${nome}" cadastrado${aviso || (estado.vid && !trava() ? " e adicionado a este orçamento" : "")}.`, true);
    } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  });
}

function htmlAreas() {
  const a = estado.areas;
  if (!a) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para lançar as áreas.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";

  // linha discreta para adicionar produto (abaixo dos cartões de resumo)
  let adicionar = "";
  if (!trava()) {
    const nova = `<button class="sec peq" id="btn-pom-nova-cultura" title="Cadastra um produto novo e já o coloca neste orçamento">${icone("plus", 14)} Novo produto</button>`;
    if (!a.total_cadastradas) {
      adicionar = `<div class="barra-add fina"><span class="dim">Ainda não há produtos cadastrados.</span><div class="dir">${nova}</div></div>`;
    } else if (!a.adicionaveis.length) {
      adicionar = `<div class="barra-add fina"><span class="dim">Todos os produtos ativos já estão na lista.</span><div class="dir">${nova}</div></div>`;
    } else {
      adicionar = `<div class="barra-add fina">
        <select class="peq" id="sel-add-cult" aria-label="Produto a adicionar">${a.adicionaveis.map((c) => `<option value="${c.id}">${esc(c.nome)} – ${esc(c.grupo)}</option>`).join("")}</select>
        <button class="btn-mais" id="btn-add-cult-area" title="Adicionar produto" aria-label="Adicionar produto">${icone("plus", 16)}</button><div class="dir">${nova}</div></div>`;
    }
  }

  if (!a.culturas.length) {
    return `${aviso}${adicionar}<div class="card vazio">${trava() ? "Nenhum produto foi adicionado nesta versão." : "Nenhum produto adicionado ainda. Escolha acima os que serão cultivados."}</div>`;
  }

  // resumo do primeiro ano do orçamento
  const y0 = a.anos[0], total0 = a.resumo[y0].plantado;
  const maior = a.culturas.reduce((m, c) => (c.anos[y0] > (m ? m.anos[y0] : -1) ? c : m), null);
  const kpis = `<div class="kpis-grade com-grafico">
    ${kpiCard("sprout", `Área plantada total (${y0})`, `${num(total0, 2)} <small>ha</small>`)}
    ${kpiCard("layers", "Nº de produtos", String(a.culturas.length))}
    ${kpiCard("sprout", "Maior área", maior && maior.anos[y0] > 0 ? `${esc(maior.nome)} – ${num(maior.anos[y0], 2)} <small>ha</small>` : "–")}
    ${graficoParticipacao(a, y0, total0)}</div>`;

  const opcAno = (id) => `<select class="peq" id="ra-${id}" aria-label="Replicar a partir do ano">${a.anos.map((y) => `<option>${y}</option>`).join("")}</select>`;
  const linhas = a.culturas.map((c) => `<tr><td><span class="prod-nome">${iconeProduto(c.nome, c.grupo)}${esc(c.nome)}</span>${c.ativa ? "" : ' <span class="chip arr">inativo</span>'}</td>
      ${a.anos.map((y) => `<td class="${c.anos[y] > 0 ? "preenchido" : ""}"><input type="number" step="0.01" min="0" ${dis} data-area-c="${c.id}" data-ano="${y}" value="${c.anos[y]}"></td>`).join("")}
      <td class="acoes">${trava() ? "" : `${opcAno(c.id)} <button class="sec peq" data-replicar-area="${c.id}" title="Copia a área do ano escolhido para os anos seguintes">Replicar →</button>
        ${btnLixo(`data-remover-area="${c.id}"`, "Tirar o produto da lista desta versão")}`}</td></tr>`).join("");
  const total = `<tr class="total"><td>Área plantada total (ha)</td>${a.anos.map((y) => `<td>${num(a.resumo[y].plantado, 2)}</td>`).join("")}<td></td></tr>`;
  const todas = trava() ? "" : replicarMini("ra-todas", "btn-replicar-todas", a.anos, "Copia a área de cada produto do ano escolhido para os anos seguintes", "Replicar todas");
  return `${aviso}${kpis}${adicionar}<div class="card">${cabecaCartao("sprout", "Área plantada por produto (hectares)", todas)}
    <div class="scroll"><table class="grade"><thead><tr><th>Produto</th>${a.anos.map((y) => `<th>${y}</th>`).join("")}<th class="acoes">Ações</th></tr></thead><tbody>${linhas}${total}</tbody></table></div></div>`;
}

function htmlCompararAreas() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpAreasB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmpar-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmpar">Comparar</button></div>`;
  const c = estado.cmpAreas;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpAreasAno) ? estado.cmpAreasAno : c.anos[0];
  const cel = (o) => `<td>${num(o.a, 2)}</td><td>${num(o.b, 2)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, 2)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmpar-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Produto</th><th>Base (ha)</th><th>Comparada (ha)</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${Object.entries(c.culturas).map(([n, y]) => `<tr><td>${esc(n)}</td>${cel(y[ano])}</tr>`).join("")}
    <tr class="total"><td>Total plantado</td>${cel(c.total[ano])}</tr></tbody></table></div></div>`;
}

// ---------------------------------------------------------------- eventos
document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (modAtivo() === "areas") {
    if (t.dataset.areaC !== undefined) {
      seguro(async () => {
        await api("PUT", `/api/versoes/${estado.vid}/areas/${t.dataset.areaC}/${t.dataset.ano}`, { area_ha: Number(t.value || 0) });
        await recarregar();
      });
    } else if (t.id === "cmpar-b") { estado.cmpAreasB = Number(t.value); estado.cmpAreas = null; }
    else if (t.id === "cmpar-ano") { estado.cmpAreasAno = Number(t.value); desenhar(); }
  }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (estado.modulo === "culturas") {
    seguro(async () => {
      if (t.id === "btn-add-cult") {
        await api("POST", "/api/culturas", {
          nome: $("#nc-nome").value, grupo: $("#nc-grupo").value, unidade: $("#nc-unidade").value,
          embalagem: $("#nc-embalagem").value, qtd_por_embalagem: Number($("#nc-kg").value || 0), ativa: true, receita_tipo: $("#nc-receita").value, estoque_destino: $("#nc-estoque").value,
        });
        await recarregar(); mostrar("Produto cadastrado.", true);
      } else if (t.dataset.cultSalvar) {
        await api("PUT", `/api/culturas/${t.dataset.cultSalvar}`, lerLinhaCultura(t.dataset.cultSalvar));
        await recarregar(); mostrar("Produto salvo.", true);
      } else if (t.dataset.cultExcluir) {
        if (!await confirmar("Excluir este produto?")) return;
        await api("DELETE", `/api/culturas/${t.dataset.cultExcluir}`);
        await recarregar(); mostrar("Produto excluído.", true);
      }
    });
  } else if (modAtivo() === "areas") {
    seguro(async () => {
      if (t.id === "btn-replicar-todas") {
        const ano = Number($("#ra-todas").value);
        if (!await confirmar(`Copiar a área de TODOS os produtos de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
        const r = await api("POST", `/api/versoes/${estado.vid}/areas/replicar-todas`, { ano });
        await recarregar(); mostrar(`Áreas de ${r.culturas} cultura(s) replicadas para ${r.anos_alterados} ano(s).`, true);
      } else if (t.id === "btn-add-cult-area") {
        await api("POST", `/api/versoes/${estado.vid}/areas/culturas`, { cultura_id: Number($("#sel-add-cult").value) });
        await recarregar(); mostrar("Produto adicionado.", true);
      } else if (t.dataset.removerArea) {
        const c = estado.areas.culturas.find((x) => x.id === Number(t.dataset.removerArea));
        const comArea = Object.values(c.anos).some((v) => v);
        if (!await confirmar(`Remover ${c.nome} da lista desta versão?${comArea ? " As áreas lançadas para ela serão apagadas." : ""}`)) return;
        await api("DELETE", `/api/versoes/${estado.vid}/areas/culturas/${c.id}`);
        await recarregar(); mostrar("Produto removido.", true);
      } else if (t.dataset.replicarArea) {
        const cid = t.dataset.replicarArea, ano = Number(document.getElementById(`ra-${cid}`).value);
        if (!await confirmar(`Copiar a área de ${ano} para todos os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
        await api("POST", `/api/versoes/${estado.vid}/areas/${cid}/replicar`, { ano });
        await recarregar(); mostrar("Áreas replicadas.", true);
      } else if (t.id === "btn-cmpar") {
        const outra = estado.cmpAreasB || Number($("#cmpar-b").value);
        estado.cmpAreasB = outra;
        // a base é sempre o Orçado, quando um dos dois for o Orçado; senão, a versão aberta
        const tipo = (id) => (estado.versoes.find((v) => v.id === id) || {}).tipo;
        const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
        estado.cmpAreas = await api("GET", `/api/comparar-areas?a=${base}&b=${comp}`);
        desenhar();
      }
    });
  }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  if (e.target.closest("#btn-pom-nova-cultura")) seguro(modalNovaCultura);
});
