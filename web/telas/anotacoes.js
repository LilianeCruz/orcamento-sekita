"use strict";
// ---------------------------------------------------------------- marca-texto e comentário nos números
const COR_NOTA = ["amarelo", "verde", "vermelho"];
let notaAberta = null;
const valorMudou = (n, agora, era) => !!(n && n.valor !== null && n.valor !== undefined && agora !== era);
function dataHoraNota(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "";
}
const agoraIso = () => { const d = new Date(), p = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; };
const notasDaTela = (tela) => (tela === "dre" ? (estado.notasDre = estado.notasDre || {}) : tela === "balanco" ? (estado.notasBp = estado.notasBp || {}) : (estado.notas = estado.notas || {}));

function fecharNota() { const p = document.getElementById("pop-nota"); if (p) p.remove(); notaAberta = null; }

function abrirNota(td) {
  if (document.getElementById("pop-nota")) return;          // já há uma nota aberta: termine (Salvar ou Fechar) antes de abrir outra
  const chave = td.dataset.nota, tela = td.dataset.tela || "resultado", atual = notasDaTela(tela)[chave] || { cor: "", comentario: "" };
  notaAberta = { chave, tela, cor: atual.cor, valor: Number(td.dataset.valor) };
  const p = document.createElement("div");
  p.id = "pop-nota"; p.className = "pop-nota";
  p.innerHTML = `<div class="titulo">${atual.atualizado_em ? "Anotado em " + dataHoraNota(atual.atualizado_em) : "Nova anotação"}</div>
    <div class="cores">${COR_NOTA.map((c) => `<button class="sw m-${c}${atual.cor === c ? " sel" : ""}" data-pn-cor="${c}" title="Marca-texto ${c}"></button>`).join("")}
      <button class="btn-acao" data-pn-cor="" title="Sem cor (tirar a marca)" aria-label="Sem cor">${icone("semcor", 18)}</button></div>
    <textarea rows="3" maxlength="2000" placeholder="Escreva um comentário sobre este número…">${esc(atual.comentario)}</textarea>
    <div class="rodape"><button class="btn-acao ok" data-pn="salvar" title="Salvar" aria-label="Salvar">${icone("check", 18)}</button><button class="btn-acao" data-pn="limpar" title="Limpar tudo (remove a marca e o comentário)" aria-label="Limpar tudo">${icone("trash", 18)}</button><button class="btn-acao" data-pn="fechar" title="Fechar" aria-label="Fechar">${icone("fechar", 18)}</button></div>`;
  document.body.appendChild(p);
  const r = td.getBoundingClientRect();
  p.style.top = Math.min(window.innerHeight - p.offsetHeight - 8, r.bottom + 6) + "px";
  p.style.left = Math.max(8, Math.min(window.innerWidth - 280, r.left)) + "px";
}

async function gravarNota(cor, comentario) {
  const { chave, tela } = notaAberta, notas = notasDaTela(tela);
  const valor = notaAberta.valor;
  await api("PUT", `/api/versoes/${estado.vid}/anotacoes`, { tela, chave, cor, comentario, valor });
  if (!cor && !comentario.trim()) delete notas[chave]; else notas[chave] = { cor, comentario: comentario.trim(), valor, atualizado_em: agoraIso() };
  fecharNota(); desenhar();
}

document.addEventListener("click", (e) => {
  const pop = document.getElementById("pop-nota");
  const cel = e.target.closest("td[data-nota]");
  if (pop && pop.contains(e.target)) {
    const b = e.target.closest("button");
    if (!b || !notaAberta) return;
    const txt = pop.querySelector("textarea").value;
    seguro(async () => {
      if (b.dataset.pnCor !== undefined) await gravarNota(b.dataset.pnCor === notaAberta.cor ? "" : b.dataset.pnCor, txt);   // clicar na cor ativa tira a marca
      else if (b.dataset.pn === "salvar") await gravarNota(notaAberta.cor, txt);
      else if (b.dataset.pn === "limpar") await gravarNota("", "");
      else fecharNota();
    });
  }                                  // clicar fora não fecha: o comentário digitado só se perde se você usar o botão Fechar
});
document.addEventListener("dblclick", (e) => {                       // dois cliques no número abrem a cor e o comentário
  const cel = e.target.closest("td[data-nota]");
  if (cel && (modAtivo() === "resultado" || estado.modulo === "dre" || estado.modulo === "balanco")) {
    const tip = document.getElementById("tip-nota"); if (tip) tip.remove();
    abrirNota(cel);
  }
});

// balão com o comentário ao passar o mouse sobre um número anotado
function notaDoTd(td) {
  const n = notasDaTela(td.dataset.tela || "resultado")[td.dataset.nota];
  return n && (n.comentario || td.classList.contains("mudou")) ? n : null;
}
document.addEventListener("mouseover", (e) => {
  const td = e.target.closest("td.tem-nota, td.mudou");
  let tip = document.getElementById("tip-nota");
  if (!td || document.getElementById("pop-nota")) { if (tip) tip.remove(); return; }
  const n = notaDoTd(td);
  if (!n) return;
  if (!tip) { tip = document.createElement("div"); tip.id = "tip-nota"; tip.className = "tip-nota"; document.body.appendChild(tip); }
  tip.innerHTML = `<div class="titulo">${esc(dataHoraNota(n.atualizado_em))}</div>${esc(n.comentario || "").replace(/\n/g, "<br>")}`
    + (td.classList.contains("mudou") ? `<div class="aviso-mudou">⚠ Valor mudou: era ${esc(td.dataset.era)}, agora ${esc(td.dataset.agora)}</div>` : "");
  const r = td.getBoundingClientRect();
  tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, r.bottom + 6) + "px";
  tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left)) + "px";
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest("td.tem-nota, td.mudou") && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("td.tem-nota, td.mudou"))) {
    const tip = document.getElementById("tip-nota"); if (tip) tip.remove();
  }
});

// ---------------------------------------------------------------- anotações (bloco com tudo que foi marcado ou comentado)
function htmlAnotacoes() {
  const todas = estado.anotacoes;
  if (!todas) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const lista = todas.filter((n) => (!estado.anotCor || n.cor === estado.anotCor) && (!estado.anotTela || n.modulo === estado.anotTela)
    && (!estado.anotStatus || (estado.anotStatus === "validada") === n.validado));
  const nValidadas = todas.filter((n) => n.validado).length;
  const fmt = (n, v) => (v === null || v === undefined ? "–" : num(v, n.unidade === "%" ? 1 : (n.unidade === "R$/kg" || n.unidade === "R$/litro" || n.unidade === "R$/uni") ? 2 : 0));
  const cartao = (n) => `<div class="nota-card${n.cor ? " b-" + n.cor : ""}${n.validado ? " validada" : ""}">
      <div class="nota-topo"><span class="dim">${n.caminho.map(esc).join(" › ")}</span><span class="dim">${esc(dataHoraNota(n.atualizado_em))}</span></div>
      <h3>${esc(n.linha)}${n.ano ? ` <span class="dim">· ${n.ano}</span>` : ""}${n.cor ? ` <span class="chip-cor m-${n.cor}">${n.cor}</span>` : ""}</h3>
      ${n.comentario ? `<p class="nota-texto">${esc(n.comentario).replace(/\n/g, "<br>")}</p>` : `<p class="dim">Só marcado, sem comentário.</p>`}
      ${n.existe ? `<div class="dim">Valor ao anotar: <strong>${fmt(n, n.valor_anotado)}</strong> · hoje: <strong>${fmt(n, n.valor_atual)}</strong> <span class="dim">${esc(n.unidade)}</span>
        ${n.mudou ? ' <span class="aviso-mudou">⚠ o valor mudou</span>' : ""}</div>` : ""}
      <div class="linha" style="margin:8px 0 0"><label class="chip-emp" title="Marque quando a anotação já foi conferida"><input type="checkbox" data-anot-validar="${esc(n.tela)}" data-chave="${esc(n.chave)}" ${n.validado ? "checked" : ""}>
        ${n.validado ? `Validada <span class="dim">em ${esc(dataHoraNota(n.validado_em))}</span>` : "Validar"}</label>${n.existe ? `<button class="sec" data-anot-ir="${esc(n.modulo)}" data-anot-cultura="${esc(n.cultura)}">Ver no relatório</button>` : ""}
        <button class="link" data-anot-remover="${esc(n.tela)}" data-chave="${esc(n.chave)}">Remover</button></div></div>`;
  const filtros = `<div class="linha"><label>Cor <select id="anot-cor"><option value="">Todas</option>
      ${["amarelo", "verde", "vermelho"].map((c) => `<option value="${c}" ${estado.anotCor === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    <label>Relatório <select id="anot-tela"><option value="">Todos</option>
      <option value="resultado" ${estado.anotTela === "resultado" ? "selected" : ""}>Resultado por produto</option><option value="dre" ${estado.anotTela === "dre" ? "selected" : ""}>DRE</option>
      <option value="balanco" ${estado.anotTela === "balanco" ? "selected" : ""}>Balanço patrimonial</option></select></label>
    <label>Status <select id="anot-status"><option value="">Todas</option>
      <option value="pendente" ${estado.anotStatus === "pendente" ? "selected" : ""}>Pendentes</option><option value="validada" ${estado.anotStatus === "validada" ? "selected" : ""}>Validadas</option></select></label>
    <span class="dim">${lista.length} de ${todas.length} anotação(ões) · <strong>${nValidadas}</strong> validada(s) · <strong>${todas.length - nValidadas}</strong> pendente(s)</span></div>`;
  return `<div class="card"><h2>Anotações</h2>
    ${filtros}
    ${lista.length ? `<div class="notas-grid">${lista.map(cartao).join("")}</div>` : `<div class="vazio">Nenhuma anotação${todas.length ? " com esse filtro" : " ainda"}.</div>`}</div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  if (estado.modulo !== "anotacoes") return;
  if (e.target.id === "anot-cor") { estado.anotCor = e.target.value; desenhar(); }
  else if (e.target.id === "anot-tela") { estado.anotTela = e.target.value; desenhar(); }
  else if (e.target.id === "anot-status") { estado.anotStatus = e.target.value; desenhar(); }
  else if (e.target.dataset.anotValidar) {
    const t = e.target;
    seguro(async () => {
      await api("POST", `/api/versoes/${estado.vid}/anotacoes/validar`, { tela: t.dataset.anotValidar, chave: t.dataset.chave, validado: t.checked });
      await recarregar();
    });
  }
});

document.querySelector("#conteudo").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "anotacoes") return;
  if (t.dataset.anotIr) {
    if (t.dataset.anotIr === "resultado") estado.resCultura = t.dataset.anotCultura || "todas";
    irParaModulo(t.dataset.anotIr);
  } else if (t.dataset.anotRemover) {
    if (!await confirmar("Remover a marca e o comentário deste número?")) return;
    seguro(async () => {
      await api("PUT", `/api/versoes/${estado.vid}/anotacoes`, { tela: t.dataset.anotRemover, chave: t.dataset.chave, cor: "", comentario: "" });
      await recarregar();
    });
  }
});
