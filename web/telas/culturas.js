"use strict";
/* Telas: Produtos (cadastro único) e Áreas por produto (por versão).
   Usa $, esc, num, api, seguro, mostrar, estado, trava, recarregar, desenhar definidos em app.js. */

const EMBALAGENS = ["Caixa", "Saco", "Big bag", "Fardo", "Bandeja"];
const ROTULO_UNIDADE = { kg: "Quilo (kg)", litro: "Litro", uni: "Unidade (uni)" };
const PLURAL_UNIDADE = { kg: "kg", litro: "litros", uni: "unidades" };
const SIGLA_UNIDADE = { kg: "kg", litro: "L", uni: "uni" };

// ---------------------------------------------------------------- início
// Visão geral do orçamento aberto: andamento das premissas, próximos passos, acesso rápido e última alteração.
const INICIO_ICONES = { Produção: "sprout", Investimentos: "moedas", DRE: "arquivo", Balanço: "balanca", Dividendos: "moedas", Dívidas: "predio" };
const INICIO_ESTADO = { concluido: "Concluído", nao_iniciado: "Não iniciado" };
function tempoAtras(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
function htmlInicio() {
  const d = estado.inicio;
  if (!d) return `<div class="inicio-vazio"><button class="prim grande" id="btn-nova-inicio">+ Novo orçamento</button></div>`;
  const v = d.versao, aprovado = v.status === "aprovado";
  const situacao = aprovado ? "Aprovado · travado" : "Em elaboração";
  const quando = d.atualizado_em ? new Date(d.atualizado_em) : null;
  const hoje = quando && quando.toDateString() === new Date().toDateString();
  const atualizado = quando ? ` · atualizado ${hoje ? "hoje" : "em " + quando.toLocaleDateString("pt-BR")} às ${quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
  const proximo = d.passos.length ? d.passos[0].modulo : "premorc";
  const grupos = d.grupos.map((g) => `<button class="ini-grupo ${g.estado}" data-modulo="${g.modulo}">
      <span class="ini-grupo-ic">${icone(g.estado === "concluido" ? "check" : INICIO_ICONES[g.nome] || "lista", 22)}</span>
      <span><strong>${esc(g.nome)}</strong><small>${g.estado === "pendencias" ? `${g.pendencias} ${g.pendencias === 1 ? "pendência" : "pendências"}` : INICIO_ESTADO[g.estado]}</small></span></button>`).join("");
  const n = d.anotacoes;                                                   // anotações ainda sem o check de conferência viram o primeiro passo
  const passoNotas = n.pendentes ? [{ titulo: `Resolver ${n.pendentes} ${n.pendentes === 1 ? "anotação pendente" : "anotações pendentes"}`,
    detalhe: n.alteradas ? `${n.alteradas} com o valor alterado desde que foram feitas` : "Ainda sem o check de conferência", modulo: "anotacoes" }] : [];
  const lista = [...passoNotas, ...d.passos];
  const passos = lista.slice(0, 3).map((p) => `<button class="ini-passo" data-modulo="${p.modulo}">
      <span class="ini-passo-ic">${icone("alerta", 22)}</span><span><strong>${esc(p.titulo)}</strong><small>${esc(p.detalhe)}</small></span>${icone("direita", 18)}</button>`).join("");
  const rapidos = [["dre", "DRE", "Resultado projetado", "arquivo"], ["balanco", "Balanço", "Posição patrimonial", "balanca"], ["fluxo", "Fluxo de caixa", "Geração e consumo", "predio"], ["indicadores", "Indicadores", "Análise consolidada", "tendencia"]]
    .map(([m, n, s, ic]) => `<button class="ini-rapido" data-modulo="${m}"><span class="ini-rapido-ic">${icone(ic, 22)}</span><span><strong>${n}</strong><small>${s}</small></span></button>`).join("");
  const u = d.ultima;
  return `<div class="ini">
    <section class="ini-hero"><div><span class="ini-eyebrow">Orçamento vigente</span><h2>${esc(v.nome)} <span class="ini-hero-sit${aprovado ? " trava" : ""}">${situacao}</span></h2>
        <p>Projeção de ${v.ano_base} a ${v.ano_base + (v.horizonte || 5) - 1}${atualizado}</p></div>
      <div class="ini-hero-acoes"><button class="ini-btn-vazado" data-modulo="orcamentos">Trocar orçamento</button>
        <button class="ini-btn-claro" data-modulo="${proximo}">Continuar preenchimento ${icone("seta_dir", 18)}</button></div></section>
    <section class="ini-card"><div class="ini-linha"><div><h3>Andamento do orçamento</h3><p>Você já concluiu ${d.concluidos} de ${d.grupos.length} grupos de premissas.</p></div><strong class="ini-pct">${d.percentual}%</strong></div>
      <div class="ini-barra"><span style="width:${d.percentual}%"></span></div><div class="ini-grupos">${grupos}</div></section>
    <div class="ini-duas">
      <section class="ini-card"><span class="ini-eyebrow verde">Próximos passos</span>
        <div class="ini-linha"><h3>O que precisa da sua atenção</h3>${lista.length > 3 ? `<button class="link" data-modulo="${lista[0].modulo}">Ver tudo</button>` : ""}</div>
        <div class="ini-passos">${passos || `<p class="dim" style="padding:16px 0">Tudo preenchido. Revise os resultados ao lado.</p>`}</div></section>
      <div class="ini-coluna"><section class="ini-card"><span class="ini-eyebrow verde">Acesso rápido</span><h3>Resultados do orçamento</h3><div class="ini-rapidos">${rapidos}</div></section>
      <section class="ini-card"><span class="ini-eyebrow verde">Anotações</span>
        <div class="ini-linha"><h3>${n.total ? `${n.total} ${n.total === 1 ? "anotação" : "anotações"}` : "Nenhuma anotação"}</h3><button class="link" data-modulo="anotacoes">Abrir</button></div>
        ${n.total ? `<div class="ini-notas"><span class="${n.pendentes ? "pend" : "ok"}"><strong>${n.pendentes}</strong> pendente${n.pendentes === 1 ? "" : "s"}</span>
          <span><strong>${n.validadas}</strong> resolvida${n.validadas === 1 ? "" : "s"}</span>
          ${n.alteradas ? `<span class="pend"><strong>${n.alteradas}</strong> com valor alterado</span>` : ""}
          ${n.vermelhas ? `<span class="pend"><strong>${n.vermelhas}</strong> em vermelho</span>` : ""}</div>` : `<p>Marque números na DRE, no Balanço e no Resultado para anotar.</p>`}</section></div>
    </div>
    ${u ? `<section class="ini-card ini-ultima"><span class="ini-ult-rot">${icone("relogio", 20)} Última alteração</span><strong>${esc(u.tela)}</strong>
      <span class="ini-ult-txt">${esc(u.detalhe)} · ${tempoAtras(u.quando)}</span><button class="ini-btn-borda" data-modulo="${u.modulo}">Abrir</button></section>` : ""}
  </div>`;
}

// ---------------------------------------------------------------- produtos
const DICA_RECEITA = "Operacional: o produto ganha linhas próprias de receita bruta e de custo do produto vendido na DRE. Não operacional: só o resultado dele entra na DRE, em Resultados de outras atividades operacionais.";
const optReceita = (sel) => [["operacional", "Operacional"], ["nao_operacional", "Não operacional"]].map(([v, n]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${n}</option>`).join("");
const DICA_ESTOQUE = "Produção: a quantidade é lançada por ano e o estoque vai para Estoque de produtos acabados. Rebanho (gado de corte): o produto ganha a movimentação de cabeças (saldo inicial, compras, nascimentos, mortes e vendas) na Produtividade pecuária e o estoque vai para Estoque de gado de corte.";
const optEstoque = (sel) => [["produto", "Produção"], ["gado", "Rebanho (gado de corte)"]].map(([v, n]) => `<option value="${v}" ${v === (sel || "produto") ? "selected" : ""}>${n}</option>`).join("");
function htmlCulturas() {
  const lista = estado.culturas || [];
  const grupos = estado.grupos;
  const optUnidade = (sel) => ["kg", "litro", "uni"].map((u) => `<option value="${u}" ${u === sel ? "selected" : ""}>${ROTULO_UNIDADE[u]}</option>`).join("");
  const optGrupo = (sel) => grupos.map((g) => `<option ${g === sel ? "selected" : ""}>${esc(g)}</option>`).join("");
  const linhas = lista.map((c) => `<tr data-cult-row="${c.id}">
      <td><input data-k="nome" value="${esc(c.nome)}"></td>
      <td><select data-k="grupo">${optGrupo(c.grupo)}</select></td>
      <td><select data-k="receita_tipo" title="${DICA_RECEITA}">${optReceita(c.receita_tipo)}</select></td>
      <td><select data-k="estoque_destino" title="${DICA_ESTOQUE}">${optEstoque(c.estoque_destino)}</select></td>
      <td><select data-k="unidade">${optUnidade(c.unidade)}</select></td>
      <td><input data-k="embalagem" list="lista-embalagens" placeholder="(sem embalagem)" value="${esc(c.embalagem)}"></td>
      <td><input type="number" min="0" step="0.01" data-k="qtd_por_embalagem" value="${c.qtd_por_embalagem || ""}" placeholder="${PLURAL_UNIDADE[c.unidade] || "kg"}"> <span class="dim">${SIGLA_UNIDADE[c.unidade] || "kg"}</span></td>
      <td><label><input type="checkbox" data-k="ativa" ${c.ativa ? "checked" : ""}> ativa</label></td>
      <td><button class="sec" data-cult-salvar="${c.id}">Salvar</button>
          <button class="link" data-cult-excluir="${c.id}" title="${c.em_uso ? "Tem área lançada: desmarque Ativa em vez de excluir" : ""}">excluir</button></td></tr>`).join("");
  return `<div class="card">    <div class="scroll"><table class="cult-tabela"><thead><tr><th>Produto</th><th>Grupo</th><th title="${DICA_RECEITA}">Receita</th><th title="${DICA_ESTOQUE}">Controle</th><th>Medida em</th><th>Embalagem padrão</th><th>Quantidade por embalagem</th><th></th><th></th></tr></thead>
    <tbody>${linhas || `<tr><td colspan="9" class="dim">Nenhum produto cadastrado ainda. Use o formulário abaixo.</td></tr>`}</tbody></table></div>
    <datalist id="lista-embalagens">${EMBALAGENS.map((u) => `<option value="${u}">`).join("")}</datalist></div>
    <div class="card"><h2>Novo produto</h2><div class="cab" id="nova-cult">
      <label>Produto<input id="nc-nome" placeholder="Ex.: Cenoura"></label>
      <label>Grupo<select id="nc-grupo">${optGrupo("")}</select></label>
      <label title="${DICA_RECEITA}">Receita<select id="nc-receita">${optReceita("operacional")}</select></label>
      <label title="${DICA_ESTOQUE}">Controle<select id="nc-estoque">${optEstoque("produto")}</select></label>
      <label>Medida em<select id="nc-unidade">${optUnidade("kg")}</select></label>
      <label>Embalagem padrão<input id="nc-embalagem" list="lista-embalagens" placeholder="Caixa, Saco… (opcional)"></label>
      <label>Quantidade por embalagem<input type="number" min="0" step="0.01" id="nc-kg" placeholder="Ex.: 20 (kg, litros ou unidades)"></label>
      <button class="prim" id="btn-add-cult">Adicionar produto</button></div></div>`;
}

function lerLinhaCultura(id) {
  const row = document.querySelector(`[data-cult-row="${id}"]`);
  const v = (k) => row.querySelector(`[data-k="${k}"]`);
  return { nome: v("nome").value, grupo: v("grupo").value, unidade: v("unidade").value,
           embalagem: v("embalagem").value, qtd_por_embalagem: lerNumero(v("qtd_por_embalagem").value), ativa: v("ativa").checked,
           receita_tipo: v("receita_tipo").value, estoque_destino: v("estoque_destino").value };
}
