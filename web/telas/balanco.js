"use strict";
// último dia do período do saldo inicial: 31/12 (ano fechado) ou o fim do período em andamento (ex.: 30/06)
const fimPeriodo = (si) => { const m = si.meses || 12; return `${String(new Date(si.ano, m, 0).getDate()).padStart(2, "0")}/${String(m).padStart(2, "0")}/${si.ano}`; };
// ---------------------------------------------------------------- balanço patrimonial (somente leitura)
function htmlBalanco() {
  const d = estado.bp;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  if (!d.estrutura) {
    return `<div class="card"><h2>Balanço patrimonial</h2><p class="dim">A estrutura do balanço (BP Sintético) vem do <strong>Fechamento Contábil</strong>, junto com a da DRE.
      Importe na tela <a href="#" data-modulo="dre">DRE</a>, em "Atualizar a estrutura".</p></div>`;
  }
  const fmt = (v) => (Math.abs(v) < 0.5 ? "–" : rs(v * 1000));      // guardado em R$ mil, mostrado em reais
  const linhas = d.linhas.map((l) => {
    const entrada = l.calculo === "entrada", forte = l.calculo === "soma" && l.nivel <= 1;
    const cls = l.calculo === "diferenca" ? "total" : (l.nivel === 0 && l.calculo === "soma" ? "total" : "");
    const chip = !l.origem && entrada ? ' <span class="dim" style="font-size:11px">sem origem ainda</span>' : "";
    const cel = (y) => { const k = `${l.codigo}|${y}`, n = (estado.notasBp || {})[k], v = l.valores[y];
      return `<td class="nota-cel${v < 0 ? " pos" : ""}${n && n.cor ? " m-" + n.cor : ""}${n && n.comentario ? " tem-nota" : ""}${n && n.valor != null && fmt(n.valor) !== fmt(v) ? " mudou" : ""}"
        data-tela="balanco" data-nota="${esc(k)}" data-valor="${v}" data-agora="${esc(fmt(v))}" data-era="${esc(n && n.valor != null ? fmt(n.valor) : "")}">${fmt(v)}</td>`; };
    const ic = l.explicacao ? ` <button class="link ajuda-i" style="color:var(--verde);padding:0 4px" data-pop="${esc(l.explicacao)}" title="Como é calculado">ⓘ</button>` : "";
    const ini = d.saldo_inicial ? `<td class="dim" style="background:var(--fundo)" title="Realizado em ${fimPeriodo(d.saldo_inicial)}">${l.inicial === null || l.inicial === undefined ? "–" : fmt(l.inicial)}</td>` : "";
    return `<tr class="${cls}"><td style="padding-left:${12 + l.nivel * 18}px">${forte || l.calculo === "diferenca" ? `<strong>${esc(l.nome)}</strong>` : esc(l.nome)}${chip}${ic}</td>${ini}${d.anos.map(cel).join("")}</tr>`;
  }).join("");
  return `<div class="card"><h2>Balanço patrimonial · saldo em 31/12</h2>
    
    <div class="scroll"><table class="cult-tabela" style="width:auto"><thead><tr><th>Conta</th>${d.saldo_inicial ? `<th style="background:var(--fundo)" title="Balanço realizado, vem da tela Realizado">Saldo inicial<br><span class="dim">realizado ${d.saldo_inicial.ano}${d.saldo_inicial.meses ? " · jun" .replace("jun", MESES[d.saldo_inicial.meses - 1].toLowerCase()) : ""}</span></th>` : ""}${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div>
    ${d.saldo_inicial ? "" : `<p class="dim">Suba o balanço dos anos fechados na tela <a href="#" data-modulo="realizado">Realizado</a> e o último aparece aqui como saldo inicial.</p>`}
    <p class="dim">Dê dois cliques em um número para marcar ou comentar.</p></div>${htmlCompararBalanco()}`;
}

function htmlCompararBalanco() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpBpB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmbp-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmbp">Comparar</button></div>`;
  const c = estado.cmpBp;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpBpAno) ? estado.cmpBpAno : c.anos[0];
  const cel = (o) => `<td>${rs(o.a * 1000)}</td><td>${rs(o.b * 1000)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${rs(o.delta * 1000)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`;
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong></p>
    <div class="linha"><label>Ano <select id="cmbp-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Conta</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.linhas.map((l) => `<tr class="${l.nivel === 0 ? "total" : ""}"><td style="padding-left:${12 + l.nivel * 18}px">${esc(l.nome)}</td>${cel(l.anos[ano])}</tr>`).join("")}</tbody></table></div></div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  if (estado.modulo !== "balanco") return;
  if (e.target.id === "cmbp-b") { estado.cmpBpB = Number(e.target.value); estado.cmpBp = null; }
  else if (e.target.id === "cmbp-ano") { estado.cmpBpAno = Number(e.target.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "balanco") return;
  if (t.id === "btn-cmbp") {
    seguro(async () => {
      const outra = estado.cmpBpB || Number($("#cmbp-b").value);
      estado.cmpBpB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpBp = await api("GET", `/api/comparar-balanco-patrimonial?a=${base}&b=${comp}`);
      desenhar();
    });
  }
});
