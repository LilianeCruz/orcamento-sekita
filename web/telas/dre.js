"use strict";
// ---------------------------------------------------------------- DRE
const NIVEL_DRE = (l) => 12 + l.nivel * 18;

function htmlDre() {
  const d = estado.dre;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const pad = estado.dreArquivo || {};
  const barraImp = `<div class="linha">
      <button class="sec" id="btn-dre-padrao" ${pad.existe ? "" : "disabled"} title="${esc(pad.arquivo || "")}">Importar do Fechamento Contábil</button>
      <label class="sec" style="cursor:pointer"><span class="dim">ou </span><input type="file" id="inp-dre-arquivo" accept=".xlsx,.xlsm"></label></div>`;
  if (!d.linhas.length) {
    return `<div class="card"><h2>DRE</h2><p class="dim">A estrutura da DRE vem do sistema <strong>Fechamento Contábil</strong> (aba DRE Sintética).
      Importe uma vez; depois ela serve para todos os orçamentos.</p>${barraImp}
      ${pad.existe ? "" : `<p class="dim">Arquivo padrão não encontrado em <code>${esc(pad.arquivo || "")}</code>. Use o botão de escolher arquivo.</p>`}</div>`;
  }
  const im = d.importacao;
  const fmt = (l, v) => (Math.abs(v) < 0.005 ? "–" : l.unidade === "%" ? num(v, 1) + "%" : rs(v * 1000));      // guardado em R$ mil, mostrado em reais
  const linhas = d.linhas.map((l) => {
    const entrada = l.calculo === "entrada";
    const forte = l.nivel === 0 && l.calculo !== "pct" && l.calculo !== "entrada";
    const cls = l.calculo === "pct" ? "dim" : (l.calculo === "calculada" ? "total" : "");
    const chip = !l.origem && entrada ? ' <span class="dim" style="font-size:11px">sem origem ainda</span>' : "";
    const cel = (y) => { const k = `${l.codigo}|${y}`, n = (estado.notasDre || {})[k], v = l.valores[y];
      return `<td class="nota-cel${v < 0 ? " pos" : ""}${n && n.cor ? " m-" + n.cor : ""}${n && n.comentario ? " tem-nota" : ""}${n && n.valor != null && fmt(l, n.valor) !== fmt(l, v) ? " mudou" : ""}"
        data-tela="dre" data-nota="${esc(k)}" data-valor="${v}" data-agora="${esc(fmt(l, v))}" data-era="${esc(n && n.valor != null ? fmt(l, n.valor) : "")}">${fmt(l, v)}</td>`; };
    const ic = l.explicacao ? ` <button class="link ajuda-i" style="color:var(--verde);padding:0 4px" data-pop="${esc(l.explicacao)}" title="Como é calculado">ⓘ</button>` : "";
    return `<tr class="${cls}"><td style="padding-left:${NIVEL_DRE(l)}px">${forte || l.calculo === "soma" ? `<strong>${esc(l.nome)}</strong>` : esc(l.nome)}${chip}${ic}</td>${d.anos.map(cel).join("")}</tr>`;
  }).join("");
  return `<div class="card"><h2>DRE</h2>
    
    ${(d.avisos || []).length ? `<div class="avisos" style="margin:0 0 12px"><strong>Atenção</strong><ul>${d.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
    <div class="scroll"><table class="cult-tabela" style="width:auto"><thead><tr><th>Linha</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div>
    <p class="dim">Dê dois cliques em um número para marcar ou comentar.</p>
    <details style="margin-top:12px"><summary class="dim">Atualizar a estrutura</summary>${barraImp}</details></div>${htmlCompararDre()}`;
}

function htmlCompararDre() {
  const vs = estado.versoes.filter((v) => v.id !== estado.vid);
  if (!vs.length) return "";
  const sel = estado.cmpDreB || vs[0].id;
  const base = estado.versoes.find((v) => v.id === estado.vid);
  const barra = `<div class="card"><div class="linha"><h2 style="margin:0">Comparar com outra versão</h2>
    <select id="cmdre-b">${vs.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.nome)} (${v.tipo})</option>`).join("")}</select>
    <button class="prim" id="btn-cmdre">Comparar</button></div>`;
  const c = estado.cmpDre;
  if (!c) return barra + `<p class="dim">Versão aberta: <strong>${esc(base.nome)}</strong>. Escolha a outra versão e clique em Comparar (o Orçado é sempre a base).</p></div>`;
  const ano = c.anos.includes(estado.cmpDreAno) ? estado.cmpDreAno : c.anos[0];
  const cel = (o, d) => { const k = d === 0 ? 1000 : 1; const f = (v) => (d === 0 ? rs(v * k) : num(v * k, d)); return `<td>${f(o.a)}</td><td>${f(o.b)}</td><td class="${classeDelta(o.delta)}">${o.delta > 0 ? "+" : ""}${f(o.delta)}</td><td class="${classeDelta(o.delta)}">${o.pct === null ? "–" : num(o.pct, 1) + "%"}</td>`; };
  return barra + `<p class="dim">Base: <strong>${esc(c.a.nome)}</strong> · Comparada: <strong>${esc(c.b.nome)}</strong> (margens em %)</p>
    <div class="linha"><label>Ano <select id="cmdre-ano">${c.anos.map((y) => `<option ${y === ano ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="scroll"><table><thead><tr><th>Linha</th><th>Base</th><th>Comparada</th><th>Δ</th><th>Δ%</th></tr></thead><tbody>
    ${c.linhas.map((l) => `<tr class="${l.calculo === "calculada" ? "total" : l.calculo === "pct" ? "dim" : ""}"><td style="padding-left:${NIVEL_DRE(l)}px">${esc(l.nome)}</td>${cel(l.anos[ano], l.unidade === "%" ? 1 : 0)}</tr>`).join("")}
    </tbody></table></div></div>`;
}

async function enviarArquivoDre(arquivo) {
  const url = `/api/dre/importar?arquivo=${encodeURIComponent(arquivo.name)}`;
  const r = await fetchApi(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: arquivo });
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new Error((dados && (dados.erro || dados.detail)) || `Erro ${r.status}`);
  return dados;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "dre") return;
  if (t.id === "inp-dre-arquivo") {
    const f = t.files[0]; if (!f) return;
    seguro(async () => {
      mostrar("Importando a estrutura… arquivos grandes podem levar alguns segundos.", true);
      const r = await enviarArquivoDre(f);
      await recarregar(); mostrar(`Estrutura importada: ${r.sinteticas} linhas sintéticas e ${r.analiticas} analíticas.`, true);
    });
  } else if (t.id === "cmdre-b") { estado.cmpDreB = Number(t.value); estado.cmpDre = null; }
  else if (t.id === "cmdre-ano") { estado.cmpDreAno = Number(t.value); desenhar(); }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "dre") return;
  seguro(async () => {
    if (t.id === "btn-dre-padrao") {
      mostrar("Importando a estrutura do Fechamento Contábil… pode levar alguns segundos.", true);
      const r = await api("POST", "/api/dre/importar-padrao");
      await recarregar(); mostrar(`Estrutura importada: ${r.sinteticas} linhas sintéticas e ${r.analiticas} analíticas.`, true);
    } else if (t.id === "btn-cmdre") {
      const outra = estado.cmpDreB || Number($("#cmdre-b").value);
      estado.cmpDreB = outra;
      const tipo = (id) => (estado.versoes.find((x) => x.id === id) || {}).tipo;
      const [base, comp] = tipo(outra) === "orcado" && tipo(estado.vid) !== "orcado" ? [outra, estado.vid] : [estado.vid, outra];
      estado.cmpDre = await api("GET", `/api/comparar-dre?a=${base}&b=${comp}`);
      desenhar();
    }
  });
});
