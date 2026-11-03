"use strict";
// ---------------------------------------------------------------- capital de giro (premissas digitáveis + cálculo)
function htmlCapitalGiro() {
  const d = estado.cg;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  const casas = (u) => (u === "R$ mil" ? 0 : u === "uni" ? 2 : u === "dias" || u.startsWith("dias de") ? 1 : 2);
  const mil = (l) => l.unidade === "R$ mil";                                   // guardado em R$ mil, mostrado em reais
  const un = (l) => (mil(l) ? "R$" : l.unidade);
  const fmt = (l, v) => (v === null || v === undefined ? "–" : Math.abs(v) < 0.5 * Math.pow(10, -casas(l.unidade)) ? "–" : mil(l) ? rs(v * 1000) : num(v, casas(l.unidade)));
  const ic = (l) => ` <button class="link ajuda-i" style="color:var(--verde);padding:0 4px" data-pop="${esc(l.explicacao)}" title="Como é calculado">ⓘ</button>`;
  const explicacao = () => "";
  const secao = (titulo, n) => `<tr><td colspan="${n}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${esc(titulo)}</td></tr>`;
  const n1 = d.anos.length + 2, n2 = d.anos.length + 1;
  const rotuloAnos = (a) => (a.length === 1 ? `${a[0]}` : `média ${a[0]}–${a[a.length - 1]}`);
  const chipOrigem = (l) => { const a = l.origem_anos && Object.values(l.origem_anos).find((x) => x); return a ? ` <span class="chip" title="Prazo calculado do balanço e da DRE realizados de ${a.join(", ")}">Realizado ${rotuloAnos(a)}</span>` : ""; };
  const linhaEntrada = (l) => `<tr><td>${esc(l.nome)} <span class="dim">· ${esc(un(l))}</span>${chipOrigem(l)}${ic(l)}</td>
      ${d.anos.map((y) => `<td><input type="number" step="any" min="0" ${dis} data-cg="${l.id}" data-ano="${y}" value="${mil(l) ? (l.valores[y] * 1000 || "") : (l.valores[y] || "")}" ${mil(l) ? "data-moeda data-cg-mil" : ""} ${l.origem && l.origem[y] ? `class="calculado" title="Calculado do realizado de ${(l.origem_anos[y] || [l.origem[y]]).join(", ")}. Digite para alterar."` : ""} ${l.id === "dias_ano" ? `title="Padrão do ano: ${d.dias_padrao[y]} dias. Apague para voltar ao padrão."` : ""}></td>`).join("")}
      <td>${trava() ? "" : `<select id="rcg-${l.id}">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
        <button class="sec" data-cg-replicar="${l.id}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>`}</td></tr>` + explicacao(l, n1);
  const linhaCalc = (l, n) => `<tr class="${l.estilo === "total" ? "total" : ""}"><td>${esc(l.nome)} <span class="dim">· ${esc(un(l))}</span>${ic(l)}</td>
      ${d.anos.map((y) => `<td>${fmt(l, l.valores[y])}</td>`).join("")}${n > n2 ? "<td></td>" : ""}</tr>` + explicacao(l, n);
  const premissas = d.premissas.map((s) => secao(s.titulo, n1) + s.linhas.map((l) => (l.entrada ? linhaEntrada(l) : `<tr class="dim"><td>${esc(l.nome)} <span class="dim">· ${esc(un(l))}</span>${ic(l)}</td>${d.anos.map((y) => `<td>${fmt(l, l.valores[y])}</td>`).join("")}<td></td></tr>` + explicacao(l, n1))).join("")).join("");
  const SEM = ["Capital de giro", "Ciclos"];                          // necessidade de capital de giro e ciclos não são usados nesta tela
  const ultimo = d.realizado.ultimo_ano;
  const cab = `<th class="cg-real">${ultimo ? `Realizado ${ultimo}` : "Realizado"}</th>`;
  const linhaRes = (l) => `<tr class="${l.estilo === "total" ? "total" : ""}"><td>${esc(l.nome)}${ic(l)}</td>
      <td class="cg-real">${l.realizado === null || l.realizado === undefined || Math.abs(l.realizado) < 0.5 ? "–" : rs(l.realizado * 1000)}</td>${d.anos.map((y) => `<td>${fmt(l, l.valores[y])}</td>`).join("")}</tr>`;
  const resultado = d.resultado.filter((s) => !SEM.includes(s.titulo)).map((s) => `<tr><td colspan="${d.anos.length + 2}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${esc(s.titulo)}</td></tr>${s.linhas.map(linhaRes).join("")}`).join("");
  const todos = trava() ? "" : `<div class="linha"><strong>Replicar todos os campos:</strong> a partir de
      <select id="rcg-todos">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" id="btn-cg-todos" title="Copia todos os campos do ano escolhido para os anos seguintes">Replicar todos →</button></div>`;
  const ABAS = [["prazos", "Prazo médio realizado"], ["premissas", "Premissas do balanço"], ["resultado", "Resultado do balanço"]];
  const aba = ABAS.some((x) => x[0] === estado.cgAba) ? estado.cgAba : "prazos";
  const abas = `<nav class="abas pom-abas">${ABAS.map(([id, nome]) => `<button data-cg-aba="${id}" class="${aba === id ? "ativa" : ""}">${nome}</button>`).join("")}</nav>`;
  let corpo;
  if (aba === "prazos") corpo = htmlPrazosRealizados(d);
  else if (aba === "premissas") corpo = `<div class="card"><h2>Premissas do balanço</h2>${todos}
    <div class="scroll"><table><thead><tr><th>Premissa</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${premissas}</tbody></table></div></div>`;
  else corpo = `<div class="card"><h2>Resultado do balanço calculado</h2><div class="scroll"><table><thead><tr><th>Linha</th>${cab}${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>${resultado}</tbody></table></div></div>${htmlCompararCapitalGiro()}`;
  return `${aviso}${abas}${corpo}`;
}

function htmlPrazosRealizados(d) {
  const r = d.realizado, p = estado.cgPrevia;
  if (!r || !r.anos.length || !p) {
    return `<div class="card"><h2>Prazos médios realizados</h2><p class="dim">Ainda não há balanço e DRE realizados. Suba os anos fechados na tela <a href="#" data-modulo="realizado">Realizado</a>
      e os prazos médios calculados aparecem aqui para servir de base.</p></div>`;
  }
  const sel = estado.cgSel || p.padrao;
  const media = (c) => { const v = sel.map((y) => c.por_ano[y]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const fmt = (v, c) => (v === null || v === undefined ? "–" : c && c.unidade === "R$ mil" ? rs(v * 1000) : num(v, 1));
  const igual = (a, b) => a.length === b.length && a.every((y, i) => y === b[i]);
  const atalhos = p.opcoes.map((o) => `<button class="${igual(sel, o.anos) ? "prim" : "sec"}" data-cg-atalho="${o.id}">${esc(o.rotulo)}</button>`).join(" ");
  const periodo = sel.length ? (sel.length === 1 ? `${sel[0]}` : `${sel[0]} a ${sel[sel.length - 1]}${sel.length === sel[sel.length - 1] - sel[0] + 1 ? "" : " (anos marcados)"}`) : "nenhum ano marcado";
  return `<div class="card"><h2>Prazos médios realizados</h2>
    ${trava() ? "" : `<div class="linha"><span class="dim">Período:</span> ${atalhos}</div>`}
    <div class="scroll"><table><thead><tr><th>Prazo médio (dias) · saldo (R$)</th>${p.anos.map((y) => `<th><label style="cursor:pointer"><input type="checkbox" data-cg-ano="${y}" ${sel.includes(y) ? "checked" : ""} ${trava() ? "disabled" : ""}> ${y}</label></th>`).join("")}<th style="background:var(--verde-claro)">Média<br><span class="dim">${esc(periodo)}</span></th></tr></thead><tbody>
    ${p.campos.map((c) => `<tr><td>${esc(c.nome)} <span class="dim">· ${esc(c.unidade === "R$ mil" ? "R$" : c.unidade)}</span></td>${p.anos.map((y) => `<td class="${sel.includes(y) ? "destaque" : ""}">${fmt(c.por_ano[y], c)}</td>`).join("")}<td><strong>${fmt(media(c), c)}</strong></td></tr>`).join("")}
    </tbody></table></div>
    ${trava() ? "" : `<div class="linha"><button class="prim" id="btn-cg-atualizar" ${sel.length ? "" : "disabled"} title="Grava a média dos anos marcados em todos os anos do orçamento">Gravar a média (${esc(periodo)}) nos prazos do orçamento</button></div>`}</div>`;
}

function htmlCompararCapitalGiro() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpCgB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmcg-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmcg">Comparar</button></div>`;
  const c = estado.cmpCg;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpCgAno) ? estado.cmpCgAno : c.anos[0];
  const cel = (o) => `<td>${num(o.a, 1)}</td><td>${num(o.b, 1)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${num(o.delta, 1)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmcg-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Linha</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.linhas.filter((l) => !["ncg", "inv_cg", "ciclo_oper", "ciclo_fin", "giro"].includes(l.id)).map((l) => `<tr class="${l.entrada ? "" : "dim"}"><td>${esc(l.nome)} <span class="dim">· ${esc(un(l))}</span></td>${cel(l.anos[ano])}</tr>`).join("")}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "capgiro") return;
  if (t.dataset.cgAno) {
    const y = Number(t.dataset.cgAno), atual = (estado.cgSel || estado.cgPrevia.padrao).slice();
    estado.cgSel = (t.checked ? [...atual, y] : atual.filter((x) => x !== y)).sort((a, b) => a - b); desenhar();
  } else if (t.dataset.cg !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/capital-giro/${t.dataset.cg}/${t.dataset.ano}`, { valor: Number(t.value || 0) / (t.dataset.cgMil !== undefined ? 1000 : 1) }); await recarregar(); });
  } else if (t.id === "cmcg-b") { estado.cmpCgB = Number(t.value); estado.cmpCg = null; }
  else if (t.id === "cmcg-ano") { estado.cmpCgAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "capgiro") return;
  seguro(async () => {
    if (t.dataset.cgAba) { estado.cgAba = t.dataset.cgAba; desenhar(); }
    else if (t.dataset.cgReplicar) {
      const campo = t.dataset.cgReplicar, ano = Number(document.getElementById(`rcg-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/capital-giro/${campo}/replicar`, { ano });
      await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.id === "btn-cg-atualizar") {
      const sel = estado.cgSel || estado.cgPrevia.padrao;
      if (!await confirmar(`Gravar a média dos prazos de ${sel.join(", ")} em todos os anos do orçamento? Os valores já digitados nos prazos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/capital-giro/atualizar-prazos`, { anos: sel });
      await recarregar(); mostrar(`Média de ${r.anos_usados.join(", ")} gravada: ${r.campos} prazo(s) em ${r.anos_alterados} ano(s).`, true);
    } else if (t.dataset.cgAtalho) {
      estado.cgSel = estado.cgPrevia.opcoes.find((o) => o.id === t.dataset.cgAtalho).anos.slice(); desenhar();
    } else if (t.id === "btn-cg-todos") {
      const ano = Number($("#rcg-todos").value);
      if (!await confirmar(`Copiar todos os campos de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/capital-giro/replicar-todos`, { ano });
      await recarregar(); mostrar(`${r.campos} campo(s) replicado(s) para ${r.anos_alterados} ano(s).`, true);
    } else if (t.id === "btn-cmcg") {
      const outra = estado.cmpCgB || Number($("#cmcg-b").value);
      estado.cmpCgB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpCg = await api("GET", `/api/comparar-capital-giro?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
