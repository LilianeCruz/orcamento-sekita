"use strict";
// ---------------------------------------------------------------- custos variáveis (R$/ha por produto, grupo e ano)
const CORES_ROSCA = ["#0a5a2f", "#1f9a4a", "#6fcf7a", "#a9e3ae", "#cfe8d2"];
function htmlCustosVariaveis() {
  const c = estado.custos;
  if (!c) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong> para lançar os custos.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  const semGrupos = !c.total_grupos ? `<div class="card"><strong>Ainda não há grupos de custos.</strong> <a href="#" data-modulo="custos">Cadastre em Grupos de custos</a>
      (e classifique como direto ou indireto) para incluir as rubricas nos produtos.</div>` : "";
  const y0 = c.anos.includes(estado.custoAno) ? estado.custoAno : c.anos[0];      // ano mostrado no painel da direita
  const sel = c.culturas.find((x) => x.id === estado.custoSel) || c.culturas[0];
  if (sel) estado.custoSel = sel.id;

  const abas = `<div class="prod-abas">${c.culturas.map((x) => `<button class="prod-aba ${sel && x.id === sel.id ? "ativa" : ""}" data-custo-tab="${x.id}">${iconeProduto(x.nome, x.grupo)}<span>${esc(x.nome)}</span></button>`).join("")}</div>`;
  if (!sel) {
    return `${aviso}${semGrupos}${abas}<div class="card vazio">${trava() ? "Nenhum produto foi adicionado nesta versão."
      : "Nenhum produto ainda. Os produtos com área (Áreas por produto) ou com produtividade pecuária aparecem aqui sozinhos."}</div>`;
  }

  const un = sel.rebanho ? "ano" : sel.sem_area ? sel.unidade : "ha";                // gado de corte: valor total do ano                       // sem área (pecuária, leite): o custo é por kg/litro/unidade produzido
  const linhas = sel.grupos.map((g) => `<tr><td>${esc(g.nome)}${g.classificacao === "indireto" ? ' <span class="chip arr">indireto</span>' : ""}${g.ativa ? "" : ' <span class="chip arr">inativo</span>'}</td>
      ${c.anos.map((y) => `<td><input class="cv-input moeda" type="text" inputmode="decimal" ${dis} data-custo-c="${sel.id}" data-custo-g="${g.id}" data-ano="${y}" value="${fmtMoeda(g.anos[y])}"></td>`).join("")}
      <td class="acoes hover">${trava() ? "" : `<div class="acoes-in"><select class="peq" id="rc-${sel.id}-${g.id}" aria-label="Replicar a partir do ano">${c.anos.map((y) => `<option>${y}</option>`).join("")}</select>
        <button class="sec peq" data-rep-custo="${sel.id}:${g.id}" title="Copia o custo do ano escolhido para os anos seguintes">Replicar →</button>
        ${btnLixo(`data-rem-grupo-custo="${sel.id}:${g.id}"`, "Tirar a rubrica deste produto")}</div>`}</td></tr>`).join("");
  const total = `<tr class="total"><td>Custo variável total (R$/${un})</td>${c.anos.map((y) => `<td>${fmtMoeda(sel.totais.total[y])}</td>`).join("")}<td></td></tr>`;
  const esquerda = `<div class="card cv-esq"><div class="prod-cab"><span class="emoji-grande">${emojiProduto(sel.nome, sel.grupo)}</span><h2>${esc(sel.nome)}</h2><span class="chip">${esc(sel.grupo)}</span>
      <div class="dir">${trava() || !sel.grupos.length ? "" : `<select id="rct-prod">${c.anos.map((y) => `<option>${y}</option>`).join("")}</select><button class="sec peq" id="btn-rep-prod-custos" data-rep-prod="${sel.id}" title="Replicar os custos deste produto, do ano escolhido para os anos seguintes">Replicar →</button>`}${trava() ? "" : `<button class="sec peq" data-abrir-rubrica="${sel.id}" title="Adicionar uma rubrica de custo a este produto">${icone("plus", 14)} Rubrica</button>${btnLixo(`data-rem-cultura-custo="${sel.id}"`, "Apagar as rubricas e os custos deste produto")}`}</div></div>
    <div class="scroll"><table class="grade cv"><thead><tr><th>Rubrica / grupo de custo (R$/${un})</th>${c.anos.map((y) => `<th>${y}</th>`).join("")}<th class="acoes"></th></tr></thead><tbody>
      ${linhas || `<tr><td colspan="${c.anos.length + 2}" class="dim">Nenhuma rubrica ainda. Escolha um grupo de custo abaixo e clique em Adicionar rubrica.</td></tr>`}${total}</tbody></table></div></div>`;

  // painel da direita: resumo do primeiro ano e composição do custo
  const tot0 = sel.totais.total[y0];
  const itens = sel.grupos.map((g) => ({ nome: g.nome, valor: g.anos[y0] })).filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  const topo = itens.slice(0, 5), resto = itens.slice(5).reduce((t, i) => t + i.valor, 0);
  const partes = topo.map((i, k) => ({ ...i, cor: CORES_ROSCA[k] })).concat(resto > 0 ? [{ nome: "Demais rubricas", valor: resto, cor: "#d5dad7" }] : []);
  const barras = partes.map((p) => { const pct = (p.valor / tot0) * 100;
    return `<li><div class="bc-topo"><span><i style="background:${p.cor}"></i>${esc(p.nome)}</span><b>${num(pct, 1)}%</b></div>
      <div class="bc-trilho" title="${fmtMoeda(p.valor)}"><div class="bc-barra" style="width:${pct}%;background:${p.cor}"></div></div></li>`; }).join("");
  const anosPill = `<div class="anos-pills" role="group" aria-label="Ano do painel">${c.anos.map((y) => `<button class="${y === y0 ? "ativa" : ""}" data-custo-ano="${y}">${y}</button>`).join("")}</div>`;
  const direita = `<div class="cv-dir">${anosPill}
    <div class="kpi-card kpi-ano"><span class="kpi-ic">${icone("moedas", 28)}</span><div><span>Custo variável (R$/${un})</span><strong>${fmtMoeda(tot0)}</strong></div></div>
    <div class="kpi-card"><span class="kpi-ic">${icone("layers", 28)}</span><div><span>Custo total estimado</span><strong>${fmtMoeda(sel.custo_total[y0])}</strong></div></div>
    <div class="card"><div class="card-cab"><span class="card-ic">${icone("pizza", 22)}</span><h2>Composição do custo (${y0})</h2></div>
      ${tot0 > 0 ? `<ul class="barras-comp">${barras}</ul>`
        : `<p class="dim" style="margin:0">Lance os custos de ${y0} para ver a composição.</p>`}</div></div>`;
  return `${aviso}${semGrupos}${abas}<div class="cv-grade">${esquerda}${direita}</div>`;
}

function htmlCompararCustos() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpCustosB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmcus-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmcus">Comparar</button></div>`;
  const c = estado.cmpCustos;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpCustosAno) ? estado.cmpCustosAno : c.anos[0];
  const cel = (o) => `<td>${num(o.a, 2)}</td><td>${num(o.b, 2)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, 2)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  const linhas = Object.entries(c.culturas).map(([n, d]) => `<tr class="total"><td>${esc(n)} · total R$/ha</td>${cel(d.total[ano])}</tr>`
    + Object.entries(d.grupos).map(([g, v]) => `<tr><td style="padding-left:24px" class="dim">${esc(g)}</td>${cel(v[ano])}</tr>`).join("")).join("");
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmcus-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Produto / grupo (R$/ha)</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (modAtivo() !== "variaveis") return;
  if (t.dataset.custoC !== undefined) {
    seguro(async () => {
      await api("PUT", `/api/versoes/${estado.vid}/custos/${t.dataset.custoC}/${t.dataset.custoG}/${t.dataset.ano}`, { valor: lerNumero(t.value) });
      await recarregar();
    });
  } else if (t.id === "cmcus-b") { estado.cmpCustosB = Number(t.value); estado.cmpCustos = null; }
  else if (t.id === "cmcus-ano") { estado.cmpCustosAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || modAtivo() !== "variaveis") return;
  if (t.dataset.custoAno) { estado.custoAno = Number(t.dataset.custoAno); desenhar(); return; }
  if (t.dataset.custoTab) { estado.custoSel = Number(t.dataset.custoTab); desenhar(); return; }
  if (t.dataset.abrirRubrica) { abrirRubrica(Number(t.dataset.abrirRubrica)); return; }
  seguro(async () => {
    if (t.dataset.remCulturaCusto) {
      const cu = estado.custos.culturas.find((x) => x.id === Number(t.dataset.remCulturaCusto));
      const comDados = cu.grupos.length > 0;
      if (!await confirmar(`Remover as rubricas e os custos de ${cu.nome}?${comDados ? " Os valores lançados serão apagados." : ""} O produto continua aqui enquanto tiver área ou produtividade.`)) return;
      await api("DELETE", `/api/versoes/${estado.vid}/custos/culturas/${cu.id}`);
      await recarregar(); mostrar("Rubricas e custos apagados.", true);
    } else if (t.dataset.addGrupoTodas) {
      const sel = document.getElementById(`sel-gc-${t.dataset.addGrupoTodas}`), nome = sel.selectedOptions[0].text.split(" · ")[0];
      const r = await api("POST", `/api/versoes/${estado.vid}/custos/grupos-todas`, { grupo_id: Number(sel.value) });
      await recarregar();
      mostrar(`${nome} adicionada a ${r.adicionadas} produto(s)${r.ja_tinham ? ` (${r.ja_tinham} já tinha(m))` : ""}.`, true);
    } else if (t.dataset.addGrupoCusto) {
      const cid = t.dataset.addGrupoCusto;
      await api("POST", `/api/versoes/${estado.vid}/custos/${cid}/grupos`, { grupo_id: Number(document.getElementById(`sel-gc-${cid}`).value) });
      await recarregar(); mostrar("Rubrica adicionada.", true);
    } else if (t.dataset.remGrupoCusto) {
      const [cid, gid] = t.dataset.remGrupoCusto.split(":");
      const cu = estado.custos.culturas.find((x) => x.id === Number(cid)), g = cu.grupos.find((x) => x.id === Number(gid));
      const comValor = Object.values(g.anos).some((v) => v);
      if (!await confirmar(`Remover ${g.nome} de ${cu.nome}?${comValor ? " Os custos lançados nessa linha serão apagados." : ""}`)) return;
      await api("DELETE", `/api/versoes/${estado.vid}/custos/${cid}/grupos/${gid}`);
      await recarregar(); mostrar("Rubrica removida.", true);
    } else if (t.dataset.repCusto) {
      const [cid, gid] = t.dataset.repCusto.split(":"), ano = Number(document.getElementById(`rc-${cid}-${gid}`).value);
      if (!await confirmar(`Copiar o custo de ${ano} para todos os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/custos/${cid}/${gid}/replicar`, { ano });
      await recarregar(); mostrar("Custo replicado.", true);
    } else if (t.dataset.repProd) {
      const cid = Number(t.dataset.repProd), ano = Number($("#rct-prod").value), cu = estado.custos.culturas.find((x) => x.id === cid);
      if (!await confirmar(`Copiar os custos de ${cu.nome} de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      for (const g of cu.grupos) await api("POST", `/api/versoes/${estado.vid}/custos/${cid}/${g.id}/replicar`, { ano });
      await recarregar(); mostrar(`Custos de ${cu.nome} replicados para os anos seguintes.`, true);
    } else if (t.id === "btn-cmcus") {
      const outra = estado.cmpCustosB || Number($("#cmcus-b").value);
      estado.cmpCustosB = outra;
      const tipo = (id) => (estado.versoes.find((v) => v.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpCustos = await api("GET", `/api/comparar-custos?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});

// janela "Adicionar rubrica": escolhe uma rubrica existente ou cria uma nova (nome + direto/indireto); pode valer para todos os produtos
async function abrirRubrica(cid) {
  const c = estado.custos, cu = c.culturas.find((x) => x.id === cid);
  if (!cu) return;
  const opcoes = cu.adicionaveis.map((g) => `<option value="${g.id}">${esc(g.nome)} · ${g.classificacao}</option>`).join("");
  const m = abrirModal(`Adicionar rubrica · ${esc(cu.nome)}`, `
    <label class="campo">Rubrica (grupo de custo)<select id="rb-sel">${opcoes}<option value="nova">+ Nova rubrica…</option></select></label>
    <div id="rb-nova" hidden>
      <label class="campo">Nome da nova rubrica<input id="rb-nome" maxlength="60" placeholder="Ex.: Embalagem"></label>
      <div class="rb-tipos" role="radiogroup" aria-label="Classificação">
        <label class="rb-tipo"><input type="radio" name="rb-cl" value="direto" checked><span><b>Direto</b>Atribuído ao produto (insumos, mão de obra)</span></label>
        <label class="rb-tipo"><input type="radio" name="rb-cl" value="indireto"><span><b>Indireto</b>Precisa de rateio (administração)</span></label>
      </div>
    </div>
    <label class="rb-todos"><input type="checkbox" id="rb-todos"> Incluir também em todos os outros produtos desta tela</label>
    <div id="rb-erro" class="orc-erro" hidden style="margin-top:12px"></div>
    <div class="linha" style="margin-top:16px;justify-content:flex-end"><button class="sec" data-md="fechar">Cancelar</button><button class="prim" id="rb-ok">Adicionar rubrica</button></div>`);
  const sel = m.querySelector("#rb-sel"), nova = m.querySelector("#rb-nova");
  const alterna = () => { nova.hidden = sel.value !== "nova"; if (!nova.hidden) m.querySelector("#rb-nome").focus(); };
  sel.addEventListener("change", alterna);
  if (!cu.adicionaveis.length) { sel.value = "nova"; alterna(); }
  m.querySelector("#rb-ok").addEventListener("click", async () => {
    const erro = m.querySelector("#rb-erro"); erro.hidden = true;
    try {
      let gid = Number(sel.value);
      if (sel.value === "nova") {
        const nome = m.querySelector("#rb-nome").value.trim();
        if (!nome) throw new Error("Informe o nome da nova rubrica.");
        gid = (await api("POST", "/api/grupos-custo", { nome, classificacao: m.querySelector('input[name="rb-cl"]:checked').value })).id;
      }
      if (m.querySelector("#rb-todos").checked) await api("POST", `/api/versoes/${estado.vid}/custos/grupos-todas`, { grupo_id: gid });
      else await api("POST", `/api/versoes/${estado.vid}/custos/${cid}/grupos`, { grupo_id: gid });
      fecharModal(); await recarregar(); mostrar("Rubrica adicionada.", true);
    } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  });
}
