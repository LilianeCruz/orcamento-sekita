"use strict";
// ---------------------------------------------------------------- Realizado: importações, DRE, balanço e orçado × realizado do mesmo período
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const optMes = (sel) => MESES_LONGOS.map((m, k) => `<option value="${k + 1}" ${k + 1 === sel ? "selected" : ""}>${m}</option>`).join("");
const sinalCor = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "" : v < 0 ? "pos" : "neg");     // vermelho quando piora o resultado, verde quando melhora (classes do sistema)

function htmlRealizado() {
  const d = estado.realizado;
  if (!d) return `<div class="card vazio">Carregando…</div>`;
  const ABAS = [["imp", "Importações"], ["qtd", "Quantidades"], ["dre", "DRE"], ["bp", "Balanço"], ["comp", "Orçado × realizado"]];
  const aba = ABAS.some((x) => x[0] === estado.realAba) ? estado.realAba : "imp";
  const nav = `<nav class="abas" id="abas-real">${ABAS.map(([k, n]) => `<button class="${aba === k ? "ativa" : ""}" data-real-aba="${k}">${n}</button>`).join("")}</nav>`;
  if (aba === "imp") return nav + htmlRealizadoImportacoes(d);
  if (aba === "qtd") return nav + htmlRealizadoQuantidades();
  if (aba === "comp") return nav + htmlRealizadoComparativo(d);
  if (!d.anos.length) return nav + `<div class="card vazio">Nenhum ano realizado ainda. Suba um arquivo na aba Importações.</div>`;
  const nomeAba = { bp: "Balanço", dre: "DRE" };
  const linhas = d[aba];
  const corpo = linhas.length ? `
      <div class="scroll"><table><thead><tr><th>Conta</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}${d.parcial ? `<th class="ano-ant">${d.parcial.ano}<br><small>${esc(d.parcial.periodo)}</small></th>` : ""}</tr></thead><tbody>
      ${linhas.map((l) => `<tr class="${l.tipo === "group" ? "total" : ""}"><td style="padding-left:${8 + l.nivel * 16}px">${esc(l.nome)} <span class="dim">${esc(l.codigo)}</span></td>${d.anos.map((y) => `<td>${rs(l.valores[y] * 1000)}</td>`).join("")}${d.parcial ? `<td class="ano-ant">${l.parcial === undefined || l.parcial === null ? "" : rs(l.parcial * 1000)}</td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : `<p class="dim">Nenhum valor de ${nomeAba[aba]} foi importado.</p>`;
  return nav + `<div class="card"><h2>${nomeAba[aba]} realizado</h2>${corpo}</div>`;
}

function htmlRealizadoImportacoes(d) {
  const per = estado.realPeriodo;
  const barra = `<div class="linha">
      <button class="prim" id="btn-real-nova">${icone("plus", 16)} Nova importação</button>
      <a class="sec" href="/api/realizado/modelo" download title="Planilha com todas as contas do Balanço e da DRE para preencher">Baixar planilha modelo</a></div>`;
  const intro = `<div class="card"><h2>Demonstrativos realizados</h2>
    ${barra}
    ${d.anos.length || d.parcial ? `<div class="scroll"><table><thead><tr><th>Ano</th><th>Balanço</th><th>DRE</th><th></th></tr></thead><tbody>
      ${d.anos.map((y) => {
        const i = d.importacoes[y] || {};
        const cel = (k) => (i[k] ? `<span title="${esc(i[k].importado_em)} · ${esc(i[k].importado_por)}">${esc(i[k].arquivo)}</span>` : `<span class="dim">–</span>`);
        return `<tr><td>${y}</td><td>${cel("BP")}</td><td>${cel("DRE")}</td><td><button class="link" data-real-excluir="${y}">Excluir</button></td></tr>`;
      }).join("")}${d.parcial ? `<tr><td>${d.parcial.ano} <span class="chip arr">em andamento · ${esc(d.parcial.periodo)}</span></td><td colspan="2"><span title="${esc(d.parcial.importado_em)}">${esc(d.parcial.arquivo)}</span></td>
        <td><button class="link" data-real-excluir="${d.parcial.ano}">Excluir</button></td></tr>` : ""}</tbody></table></div>` : `<p class="dim">Nenhum ano realizado ainda.</p>`}</div>`;
  return intro;
}

function htmlRealizadoQuantidades() {
  const q = estado.realQtd;
  if (!q) return `<div class="card vazio">Carregando…</div>`;
  if (!q.anos.length) return `<div class="card vazio">Nenhum ano importado ainda. Use <strong>Nova importação</strong> na aba Importações.</div>`;
  return `<div class="card"><h2>Quantidade vendida por ano</h2>
    <div class="scroll"><table><thead><tr><th>Produto</th><th>Medida</th>${q.anos.map((a) => `<th>${esc(a.rotulo)}</th>`).join("")}</tr></thead><tbody>
      ${q.produtos.map((p) => `<tr><td>${esc(p.nome)} <span class="dim">${esc(p.grupo)}</span></td><td class="dim">${esc(p.unidade)}</td>${q.anos.map((a) => `<td><input type="number" min="0" step="any" data-real-qtd="${p.id}" data-ano="${a.ano}" value="${p.valores[a.ano] === undefined || p.valores[a.ano] === null ? "" : p.valores[a.ano]}" style="width:130px"></td>`).join("")}</tr>`).join("")}
    </tbody></table></div></div>`;
}

// Orçado × realizado: de um lado os orçamentos, do outro as importações; escolhe uma de cada, o sistema confere se os períodos combinam e gera o PDF
function htmlRealizadoComparativo(d) {
  const imps = estado.realImps || [];
  const vs = estado.versoes || [];
  const v = vs.find((x) => x.id === estado.cmpOrc), im = imps.find((x) => x.ano === estado.cmpImp);
  const anosDe = (x) => Array.from({ length: x.horizonte || 5 }, (_, i) => x.ano_base + i);
  let aviso = `<span class="dim">Escolha um orçamento e uma importação.</span>`, ok = false;
  if (v && im) {
    const anos = anosDe(v);
    if (anos.includes(im.ano)) { ok = true; aviso = `<span class="cg-ok-txt">${icone("check", 16)} Períodos compatíveis: ${esc(v.nome)} cobre ${anos[0]} a ${anos[anos.length - 1]} e o realizado é de ${esc(im.rotulo)}.</span>`; }
    else aviso = `<span class="erro-txt">${icone("alerta", 16)} Períodos diferentes: ${esc(v.nome)} cobre ${anos[0]} a ${anos[anos.length - 1]}, e o realizado escolhido é de ${im.ano}.</span>`;
  }
  const lado = (titulo, ic, corpo) => `<div class="card"><div class="card-cab">${icone(ic, 20)}<h2>${titulo}</h2></div>${corpo}</div>`;
  const orc = vs.length ? `<div class="cmp-esc">${vs.map((x) => {
    const anos = anosDe(x);
    return `<label class="cmp-op${x.id === estado.cmpOrc ? " sel" : ""}"><input type="radio" name="cmp-orc" data-cmp-orc="${x.id}" ${x.id === estado.cmpOrc ? "checked" : ""}>
      <span><strong>${esc(x.nome)}</strong><small>${anos[0]} a ${anos[anos.length - 1]} · ${x.status === "aprovado" ? "aprovado e travado" : "em elaboração"}</small></span></label>`;
  }).join("")}</div>` : `<p class="dim">Nenhum orçamento criado.</p>`;
  const imp = imps.length ? `<div class="cmp-esc">${imps.slice().reverse().map((x) => `<label class="cmp-op${x.ano === estado.cmpImp ? " sel" : ""}"><input type="radio" name="cmp-imp" data-cmp-imp="${x.ano}" ${x.ano === estado.cmpImp ? "checked" : ""}>
      <span><strong>${esc(x.rotulo)}</strong><small>${x.parcial ? "ano em andamento" : "ano fechado"}</small></span></label>`).join("")}</div>` : `<p class="dim">Nenhum realizado importado ainda. Use <strong>Nova importação</strong> na aba Importações.</p>`;
  return `<div class="cmp-lados">${lado("Orçamentos", "orcamento", orc)}${lado("Importações do realizado", "baixar", imp)}</div>
    <div class="card cmp-barra"><div id="cmp-aviso">${aviso}</div>
      <button class="prim" id="btn-cmp-gerar" ${ok ? "" : "disabled"}>${icone("impressora", 16)} Comparar e gerar PDF</button></div>`;
}

async function enviarArquivoRealizado(arquivo, opcoes = {}) {
  const q = new URLSearchParams({ arquivo: arquivo.name });
  for (const k of ["meses", "mes_inicio", "versao_id", "quantidades"]) if (opcoes[k]) q.set(k, opcoes[k]);
  const r = await fetchApi(`/api/realizado/importar?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: arquivo });
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new Error((dados && (dados.erro || dados.detail)) || `Erro ${r.status}`);
  return dados;
}

// janela "Nova importação": escolhe o arquivo, o período, o orçamento comparado e preenche a quantidade vendida de cada produto (obrigatória)
async function janelaImportarRealizado() {
  const produtos = await api("GET", "/api/realizado/produtos");
    const m = document.createElement("div");
  m.className = "orc-overlay";
  m.innerHTML = `<div class="orc-caixa imp-larga" role="dialog" aria-modal="true"><header class="orc-cab"><span class="orc-icone">${icone("baixar", 22)}</span><div><h2>Nova importação de realizado</h2></div>
      <button class="orc-x" data-imp="fechar" aria-label="Fechar">✕</button></header>
    <div class="orc-corpo">
      <label class="orc-campo">Arquivo do realizado (.xlsx)<input type="file" id="imp-arquivo" accept=".xlsx,.xlsm"></label>
      <p class="dim" style="margin:0">Os anos já fechados entram inteiros. Para o <strong>ano em andamento</strong>, informe o período a que o realizado se refere (a DRE do arquivo deve ser exatamente desse período).</p>
      <div class="orc-par"><label class="orc-campo">De<select id="imp-ini">${optMes(1)}</select></label><label class="orc-campo">Até<select id="imp-fim">${optMes(6)}</select></label></div>
      <div><strong>Quantidade vendida no período</strong> <span class="dim">· obrigatória no ano em andamento; use 0 para o que não vendeu. Anos fechados podem ser preenchidos depois, na aba Quantidades</span>
        <div class="scroll imp-qtd"><table><thead><tr><th>Produto</th><th>Medida</th><th>Quantidade vendida</th></tr></thead><tbody>
          ${produtos.map((p) => `<tr><td>${esc(p.nome)} <span class="dim">${esc(p.grupo)}</span></td><td class="dim">${esc(p.unidade)}</td><td><input type="number" min="0" step="any" data-imp-qtd="${p.id}" style="width:150px"></td></tr>`).join("") || `<tr><td colspan="3" class="dim">Nenhum produto de venda cadastrado.</td></tr>`}
        </tbody></table></div></div>
      <div id="imp-erro" class="orc-erro" hidden></div></div>
    <footer class="orc-rodape"><button class="sec" data-imp="fechar">Cancelar</button><button class="prim" data-imp="ok" id="imp-ok">Importar</button></footer></div>`;
  document.body.appendChild(m);
  const arq = m.querySelector("#imp-arquivo");
  arq.addEventListener("change", () => {                         // "2t2026" no nome do arquivo sugere o período (jan a jun)
    const q = arq.files[0] && /([1-4])\s*t\s*(20\d\d)/i.exec(arq.files[0].name);
    if (q) m.querySelector("#imp-fim").value = String(Number(q[1]) * 3);
  });
  m.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.imp === "fechar") { m.remove(); return; }
    if (t.dataset.imp !== "ok") return;
    const erro = m.querySelector("#imp-erro");
    const falha = (txt) => { erro.textContent = txt; erro.hidden = false; };
    erro.hidden = true;
    const f = arq.files[0];
    if (!f) return falha("Escolha o arquivo do realizado.");
    const campos = [...m.querySelectorAll("[data-imp-qtd]")];
    const vazios = campos.filter((i) => i.value === "");
    if (vazios.length && vazios.length < campos.length) { vazios[0].focus(); return falha(`Preencha a quantidade vendida de todos os produtos (faltam ${vazios.length}). Use 0 para o que não vendeu.`); }
    if (campos.some((i) => Number(i.value) < 0)) return falha("A quantidade vendida não pode ser negativa.");
    t.disabled = true; t.textContent = "Importando…";
    try {
      const r = await enviarArquivoRealizado(f, { mes_inicio: m.querySelector("#imp-ini").value, meses: m.querySelector("#imp-fim").value,
        quantidades: vazios.length ? "" : campos.map((i) => `${i.dataset.impQtd}:${Number(i.value)}`).join(",") });
      m.remove();
      estado.realComp = null;
      await recarregar();
      mostrar(`Importado: ${r.anos.join(", ")} (${r.linhas} linhas).` + (r.avisos.length ? " " + r.avisos.join(" ") : ""), !r.avisos.length);
    } catch (err) { falha(err.message); t.disabled = false; t.textContent = "Importar"; }
  });
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if (estado.modulo !== "realizado") return;
  if (t.dataset.realQtd) {
    seguro(async () => { await api("PUT", `/api/realizado/quantidades/${t.dataset.realQtd}`, { quantidade: t.value === "" ? null : Number(t.value), ano: t.dataset.ano ? Number(t.dataset.ano) : null }); estado.realComp = null; mostrar("Quantidade salva.", true); });
  } else if (t.dataset.cmpOrc) { estado.cmpOrc = Number(t.dataset.cmpOrc); desenhar();
  } else if (t.dataset.cmpImp) { estado.cmpImp = Number(t.dataset.cmpImp); desenhar();
  }
});

document.querySelector("#conteudo").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t || estado.modulo !== "realizado") return;
  if (t.dataset.realAba) {
    seguro(async () => { estado.realAba = t.dataset.realAba; await carregarModulo(); desenhar(); });
    return;
  }
  if (t.id === "btn-real-nova") { seguro(janelaImportarRealizado); return; }
  if (t.id === "btn-cmp-gerar") {
    seguro(async () => {
      t.disabled = true;
      try { const c = await api("GET", `/api/realizado/comparativo?versao_id=${estado.cmpOrc}&ano=${estado.cmpImp}`); await gerarPdfOrcadoRealizado(c); mostrar("Relatório gerado.", true); }
      finally { t.disabled = false; }
    });
    return;
  }
  if (t.id === "btn-salvar-periodo") {
    seguro(async () => {
      await api("PUT", "/api/realizado/periodo", { mes_inicio: Number($("#per-ini").value), mes_fim: Number($("#per-fim").value), versao_id: $("#per-versao").value ? Number($("#per-versao").value) : null });
      estado.realComp = null; await recarregar(); mostrar("Período salvo.", true);
    });
    return;
  }
  if (t.dataset.realExcluir) {
    const ano = t.dataset.realExcluir;
    if (!await confirmar(`Excluir o realizado de ${ano} (Balanço e DRE)?`)) return;
    seguro(async () => { await api("DELETE", `/api/realizado/${ano}`); estado.realComp = null; await recarregar(); mostrar(`Realizado de ${ano} excluído.`, true); });
  }
});

// ---------------------------------------------------------------- balão "Como é calculado" (ⓘ): abre sobreposto, fecha ao clicar fora ou com Esc
const popAjuda = document.createElement("div");
popAjuda.className = "pop-ajuda"; popAjuda.hidden = true;
document.body.appendChild(popAjuda);
let popDono = null;
function fecharPopAjuda() { popAjuda.hidden = true; popDono = null; }
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pop]");
  if (!b) { if (!e.target.closest(".pop-ajuda")) fecharPopAjuda(); return; }
  if (popDono === b) { fecharPopAjuda(); return; }
  popDono = b;
  popAjuda.innerHTML = `<div class="titulo">Como é calculado</div>${esc(b.dataset.pop)}`;
  popAjuda.hidden = false;
  const r = b.getBoundingClientRect(), w = popAjuda.offsetWidth, h = popAjuda.offsetHeight;
  let x = Math.min(Math.max(8, r.left - 12), window.innerWidth - w - 8);
  let y = r.bottom + 6; if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
  popAjuda.style.left = x + "px"; popAjuda.style.top = y + "px";
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharPopAjuda(); });
window.addEventListener("scroll", fecharPopAjuda, true);

// ---------------------------------------------------------------- PDF do orçado × realizado (mesmo visual do relatório de comparação de orçamentos)
async function gerarPdfOrcadoRealizado(c) {
  await carregarScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  await carregarScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");
  const { jsPDF } = window.jspdf, C = PDF_C;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logo = await logoPdf();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), CW = W - 2 * PDF_M;
  const fill = (x) => doc.setFillColor(...x), cor = (x) => doc.setTextColor(...x), traco = (x) => doc.setDrawColor(...x);
  const geradoEm = new Date().toLocaleDateString("pt-BR") + " às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const rot = `${c.ano} · ${c.periodo}`;
  let y = 0;
  fill(C.tintSoft); doc.roundedRect(PDF_M, 8, CW, 30, 3, 3, "F"); fill(C.leaf); doc.roundedRect(PDF_M, 8 + 30 - 1.6, CW, 1.6, 0.8, 0.8, "F");
  if (logo) { const lw = 26, lh = (lw * logo.h) / logo.w; doc.addImage(logo.url, "PNG", PDF_M + 8, 8 + (28.4 - lh) / 2, lw, lh); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.8); cor(C.moss); doc.text("ORÇADO × REALIZADO", W - PDF_M - 8, 16, { align: "right" });
  doc.setFontSize(20); cor(C.mossDark); doc.text(pdfTxt(rot), W - PDF_M - 8, 25, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); cor(C.soft); doc.text(pdfTxt(c.versao.nome), W - PDF_M - 8, 31, { align: "right", maxWidth: CW - 50 });
  y = 46;

  const titulo = (txt, nota) => {
    if (y > H - PDF_BOTTOM - 30) { doc.addPage(); y = PDF_TOP; }
    fill(C.leaf); doc.roundedRect(PDF_M, y, 1.6, 6, 0.8, 0.8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); cor(C.mossDark); doc.text(txt, PDF_M + 4.5, y + 4.6);
    if (nota) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); cor(C.soft); doc.text(nota, PDF_M + 4.5, y + 9.4); }
    y += nota ? 13 : 9.5;
  };
  const tabela = (opts) => {
    doc.autoTable(Object.assign({ startY: y, margin: { top: PDF_TOP, bottom: PDF_BOTTOM, left: PDF_M, right: PDF_M }, theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 2.4, right: 2.4 }, textColor: C.ink, overflow: "linebreak" },
      headStyles: { fillColor: C.mossDark, textColor: C.white, fontStyle: "bold", fontSize: 8 },
      didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; },
      didDrawCell: (d) => { if (d.section !== "body") return; traco(C.line); doc.setLineWidth(0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } }, opts));
    y = doc.lastAutoTable.finalY + 7;
  };
  const R = (v) => (v === null || v === undefined ? "—" : pdfRs(v * 1000));                    // valores guardados em R$ mil, mostrados em R$
  const dif = (v, casas = 0) => (v === null || v === undefined ? { content: "—" } : { content: (v > 0.0005 ? "+" : "") + (Math.abs(v) < 0.0005 ? "—" : pdfRs(v * 1000, casas)), styles: { textColor: v < -0.0005 ? C.neg : v > 0.0005 ? C.pos : C.ink } });
  const dir = { halign: "right" };

  // o que está sendo comparado
  titulo("O que foi comparado", "As diferenças são o realizado menos o orçado.");
  const v = c.versao, tipo = v.tipo === "orcado" ? "Orçado" : v.tipo === "reprojetado" ? "Reprojetado" : "Cenário";
  tabela({ head: [["", "Item", "Detalhe"]], body: [["Orçamento", pdfTxt(v.nome), `${tipo} · ${v.status === "aprovado" ? "aprovado e travado" : "em elaboração"} · ${v.ano_base} a ${v.ano_base + v.horizonte - 1}`],
    ["Realizado", pdfTxt(rot), c.parcial ? `Ano em andamento (${c.meses} meses). Orçado do período = orçado do ano × ${c.meses}/12.` : "Ano fechado (12 meses)."]],
    columnStyles: { 0: { cellWidth: 26, fontStyle: "bold" } }, didParseCell: (d) => { if (d.section === "head") d.cell.styles.halign = "left"; } });

  // resumo em texto
  titulo("Resumo");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.2); cor(C.ink);
  for (const f of c.resumo) {
    const l = doc.splitTextToSize(pdfTxt(f), CW - 4);
    if (y + l.length * 4.4 > H - PDF_BOTTOM) { doc.addPage(); y = PDF_TOP; }
    doc.text(l, PDF_M + 2, y + 2); y += l.length * 4.4 + 2.4;
  }
  y += 4;

  // ponte do lucro
  const pt = c.ponte, passos = [{ nome: "Lucro orçado do período", v: pt.orcado, total: true }, ...pt.itens.map((x) => ({ nome: x.nome, v: x.valor })), { nome: "Lucro realizado", v: pt.realizado, total: true }];
  titulo("Ponte do lucro líquido", "Do lucro orçado do período ao lucro realizado, com o efeito de cada fator (R$).");
  tabela({ head: [["Fator", "Valor"]], body: passos.map((x) => [{ content: pdfTxt(x.nome), styles: x.total ? { fontStyle: "bold", fillColor: C.tint } : {} }, x.total ? { content: pdfRs(x.v * 1000), styles: { halign: "right", fontStyle: "bold", fillColor: C.tint } } : dif(x.v)]),
    columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 50 } } });
  const efs = pt.itens.filter((x) => Math.abs(x.valor) > 0.05).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  if (efs.length) {
    const bh = 7, gap = 3, altura = efs.length * (bh + gap) + 14;
    if (y + altura > H - PDF_BOTTOM) { doc.addPage(); y = PDF_TOP; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); cor(C.mossDark); doc.text("O que mais pesou no lucro", PDF_M, y + 3); y += 8;
    const xz = PDF_M + 78 + (CW - 78 - 40) / 2, esc = (CW - 78 - 40) / 2 / Math.max(...efs.map((x) => Math.abs(x.valor)), 1);
    traco(C.line); doc.setLineWidth(0.3); doc.line(xz, y - 2, xz, y + efs.length * (bh + gap));
    efs.forEach((x, i) => {
      const yy = y + i * (bh + gap), larg = Math.max(Math.abs(x.valor) * esc, 0.6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); cor(C.ink); doc.text(pdfTxt(x.nome), PDF_M, yy + bh / 2 + 1.4, { maxWidth: 74 });
      fill(x.valor >= 0 ? C.pos : C.neg); doc.roundedRect(x.valor >= 0 ? xz : xz - larg, yy, larg, bh, 1, 1, "F");
      cor(x.valor >= 0 ? C.pos : C.neg); doc.setFont("helvetica", "bold");
      doc.text((x.valor > 0 ? "+" : "-") + pdfRs(Math.abs(x.valor) * 1000), x.valor >= 0 ? xz + larg + 2 : xz - larg - 2, yy + bh / 2 + 1.4, { align: x.valor >= 0 ? "left" : "right" });
    });
    y += efs.length * (bh + gap) + 8;
  }

  // produtos
  if (c.produtos.length) {
    titulo("Produtos: quantidade, preço e custo", "Efeitos no resultado do produto (R$): volume, preço e custo por unidade.");
    const q = (x) => (x === null || x === undefined ? "—" : pdfNum(x, 0)), p2 = (x) => pdfRs(x, 2);
    tabela({ head: [["Produto", "Qtd. orçada (ano)", "Qtd. vendida", "% do ano", "Falta vender", "Preço orçado", "Preço médio real", "Volume", "Preço", "Custo"]],
      body: c.produtos.map((x) => [pdfTxt(x.nome) + " (" + x.unidade + ")", q(x.qtd_orcada), q(x.qtd_real), x.pct_ano === null ? "—" : pdfNum(x.pct_ano, 0) + "%", q(x.falta_qtd), p2(x.preco_orcado), p2(x.preco_real),
        dif(x.efeitos ? x.efeitos.volume : null), dif(x.efeitos ? x.efeitos.preco : null), dif(x.efeitos ? x.efeitos.custo : null)]),
      columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [i, { halign: "right" }])) });
  }

  // DRE
  titulo("DRE: orçado × realizado", `Orçado do período = orçado do ano × ${c.meses}/12. "Falta realizar" = orçado do ano menos o realizado. `);
  tabela({ head: [["Linha", "Orçado do ano", "Orçado do período", "Realizado", "Diferença", "%", "Falta realizar"]],
    body: c.dre.map((l) => {
      const nome = { content: " ".repeat((l.nivel || 0) * 2) + pdfTxt(l.nome), styles: l.nivel === 0 ? { fontStyle: "bold", fillColor: C.tintSoft } : {} };
      if (l.unidade === "%") return [nome, pdfNum(l.orcado_ano, 1) + "%", "", l.realizado === null ? "—" : pdfNum(l.realizado, 1) + "%", l.dif === null ? "—" : pdfNum(l.dif, 1) + " p.p.", "", ""];
      return [nome, R(l.orcado_ano), R(l.orcado_periodo), R(l.realizado), dif(l.dif), l.dif_pct === null ? "—" : pdfNum(l.dif_pct, 0) + "%", R(l.falta)];
    }),
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { halign: "right" }])) });

  // balanço
  titulo("Balanço: realizado no fim do período × orçado em 31/12", "As datas são diferentes: o realizado é de fim de período e o orçado é de 31/12 do ano. Valores em R$.");
  tabela({ head: [["Conta", "Orçado 31/12", "Realizado", "Diferença"]],
    body: c.balanco.map((l) => [{ content: " ".repeat((l.nivel || 0) * 2) + pdfTxt(l.nome), styles: l.nivel <= 1 ? { fontStyle: "bold", fillColor: C.tintSoft } : {} }, R(l.orcado_ano), R(l.realizado), dif(l.dif)]),
    columnStyles: { 1: dir, 2: dir, 3: dir } });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); cor(C.soft); doc.text(pdfTxt(`Orçado × realizado  ·  ${rot}`), W - PDF_M, 9.4, { align: "right" }); traco(C.line); doc.setLineWidth(0.3); doc.line(PDF_M, 16.5, W - PDF_M, 16.5); }
    traco(C.line); doc.setLineWidth(0.3); doc.line(PDF_M, H - 13, W - PDF_M, H - 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); cor(C.soft); doc.text("Gerado em " + geradoEm, PDF_M, H - 8.5); doc.text(`Página ${p} de ${total}`, W - PDF_M, H - 8.5, { align: "right" });
  }
  doc.save(`Orcado_x_Realizado_${c.ano}_${c.versao.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_")}.pdf`);
}
