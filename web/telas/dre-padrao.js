"use strict";
// ---------------------------------------------------------------- premissas padronizadas da DRE (média do realizado, % de uma base ou valor)
const dpBase = (b) => "sobre " + b.toLowerCase();                                      // sobre a receita líquida
// percentual (sobre uma base) em cima e valor embaixo, cada bloco com o seu título
const dpSecoes = (lista, ncol, linha) => [["Percentual sobre a base", (x) => x.unidade === "%"], ["Valor (R$)", (x) => x.unidade !== "%"]]
  .map(([titulo, filtro]) => { const l = lista.filter(filtro); return l.length ? `<tr><td colspan="${ncol}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${titulo}</td></tr>${l.map(linha).join("")}` : ""; }).join("");
const DP_ABAS = [["realizado", "Realizado"], ["premissas", "Premissas"], ["resultado", "Resultado da DRE"], ["outras", "Outras premissas"]];

function htmlDrePadrao(aba) {
  const d = estado.dreP;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const dis = trava() ? "disabled" : "";
  const mil = (u) => u === "R$ mil";
  const un = (u) => (mil(u) ? "R$" : u);
  if (aba === "premissas") {
    const todos = trava() ? "" : `<div class="linha"><strong>Replicar todas:</strong> a partir de <select id="rdp-todos">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select>
      <button class="sec" id="btn-dp-todos" title="Copia todas as premissas do ano escolhido para os anos seguintes">Replicar todos →</button></div>`;
    const linhaP = (p) => `<tr><td>${esc(p.nome)}${p.base ? ` <span class="dim">· ${esc(dpBase(p.base))}</span>` : ""}</td>
      ${d.anos.map((y) => `<td><input type="number" step="any" ${p.sinal === 0 ? "" : 'min="0"'} ${dis} ${mil(p.unidade) ? "data-moeda data-dp-reais" : ""} data-dp="${p.codigo}" data-ano="${y}" value="${mil(p.unidade) ? (p.valores[y] * 1000 || "") : (p.valores[y] || "")}"></td>`).join("")}
      <td>${trava() ? "" : `<select id="rdp-${p.codigo}">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select> <button class="sec" data-dp-replicar="${p.codigo}" title="Copia o valor do ano escolhido para os anos seguintes">Replicar →</button>`}</td></tr>`;
    const linhas = dpSecoes(d.premissas, d.anos.length + 2, linhaP);
    return `<div class="card"><h2>Premissas da DRE</h2>${todos}
      <div class="scroll"><table><thead><tr><th>Conta</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
  }
  const fmtR = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "–" : rs(v * 1000));
  const linhas = d.resultado.map((l) => `<tr class="${l.base ? "total" : ""}"><td>${esc(l.nome)}</td><td class="cg-real">${fmtR(l.realizado)}</td>${d.anos.map((y) => `<td>${fmtR(l.valores[y])}</td>`).join("")}</tr>`).join("");
  return `<div class="card"><h2>Resultado da DRE</h2>
    <div class="scroll"><table><thead><tr><th>Conta</th><th class="cg-real">${d.ultimo_ano ? `Realizado ${d.ultimo_ano}` : "Realizado"}</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}

function htmlDreRealizado() {
  const p = estado.drePrev;
  if (!p || !p.anos.length) return `<div class="card"><h2>Realizado</h2><p class="dim">Ainda não há DRE realizada. Suba os anos fechados na tela <a href="#" data-modulo="realizado">Realizado</a> e as médias aparecem aqui.</p></div>`;
  const sel = (estado.dreSel || p.padrao).filter((y) => p.anos.includes(y));
  const igual = (a, b) => a.length === b.length && a.every((y, i) => y === b[i]);
  const media = (c) => { const v = sel.map((y) => c.por_ano[y]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const fmt = (v, c) => (v === null || v === undefined ? "–" : c.unidade === "%" ? num(v, 2) + "%" : rs(v * 1000));
  const atalhos = p.opcoes.map((o) => `<button class="${igual(sel, o.anos) ? "prim" : "sec"}" data-dp-atalho="${o.id}">${esc(o.rotulo)}</button>`).join(" ");
  const periodo = sel.length ? (sel.length === 1 ? `${sel[0]}` : `${sel[0]} a ${sel[sel.length - 1]}`) : "nenhum ano marcado";
  return `<div class="card"><h2>Realizado</h2>
    ${trava() ? "" : `<div class="linha"><span class="dim">Período:</span> ${atalhos}</div>`}
    <div class="scroll"><table><thead><tr><th>Conta</th>${p.anos.map((y) => `<th><label style="cursor:pointer"><input type="checkbox" data-dp-ano="${y}" ${sel.includes(y) ? "checked" : ""} ${trava() ? "disabled" : ""}> ${y}</label></th>`).join("")}<th style="background:var(--verde-claro)">Média<br><span class="dim">${esc(periodo)}</span></th></tr></thead><tbody>
    ${dpSecoes(p.campos, p.anos.length + 2, (c) => `<tr><td>${esc(c.nome)}${c.base ? ` <span class="dim">· ${esc(dpBase(c.base))}</span>` : ""}</td>${p.anos.map((y) => `<td class="${sel.includes(y) ? "destaque" : ""}">${fmt(c.por_ano[y], c)}</td>`).join("")}<td><strong>${fmt(media(c), c)}</strong></td></tr>`)}
    </tbody></table></div>
    ${trava() ? "" : `<div class="linha"><button class="prim" id="btn-dp-atualizar" ${sel.length ? "" : "disabled"} title="Grava a média dos anos marcados nos anos do orçamento">Gravar a média (${esc(periodo)}) nas premissas</button></div>`}</div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "premdem") return;
  if (t.dataset.dpAno) {
    const y = Number(t.dataset.dpAno), atual = (estado.dreSel || estado.drePrev.padrao).slice();
    estado.dreSel = (t.checked ? [...atual, y] : atual.filter((x) => x !== y)).sort((a, b) => a - b); desenhar();
  } else if (t.dataset.dp !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/dre-padrao/${t.dataset.dp}/${t.dataset.ano}`, { valor: Number(t.value || 0) / (t.dataset.dpReais !== undefined ? 1000 : 1) }); await recarregar(); });
  }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "premdem") return;
  if (t.dataset.dpAba) { estado.dreAba = t.dataset.dpAba; desenhar(); return; }
  seguro(async () => {
    if (t.dataset.dpAtalho) { estado.dreSel = estado.drePrev.opcoes.find((o) => o.id === t.dataset.dpAtalho).anos.slice(); desenhar(); }
    else if (t.id === "btn-dp-atualizar") {
      const sel = estado.dreSel || estado.drePrev.padrao;
      if (!await confirmar(`Gravar a média de ${sel.join(", ")} nas premissas da DRE? Os valores já digitados nos anos do orçamento serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/dre-padrao/atualizar`, { anos: sel });
      await recarregar(); mostrar(`Média de ${r.anos_usados.join(", ")} gravada em ${r.contas} conta(s) e ${r.anos_alterados} ano(s).`, true);
    } else if (t.dataset.dpReplicar) {
      const cod = t.dataset.dpReplicar, ano = Number(document.getElementById(`rdp-${cod}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/dre-padrao/${cod}/replicar`, { ano }); await recarregar(); mostrar("Valor replicado.", true);
    } else if (t.id === "btn-dp-todos") {
      const ano = Number(document.getElementById("rdp-todos").value);
      if (!await confirmar(`Copiar todas as premissas de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      const r = await api("POST", `/api/versoes/${estado.vid}/dre-padrao/replicar-todos`, { ano });
      await recarregar(); mostrar(`${r.campos} conta(s) replicada(s) para ${r.anos_alterados} ano(s).`, true);
    }
  });
});
