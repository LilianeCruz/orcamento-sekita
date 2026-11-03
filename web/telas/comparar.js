"use strict";
// ---------------------------------------------------------------- Comparar orçamentos: janela de opções (aberta pelo botão Imprimir da tela Orçamentos) e relatório em PDF
async function abrirImprimirComparacao(ids) {
  if (document.getElementById("modal-cmp")) return;
  const vs = ids.map((id) => estado.versoes.find((v) => v.id === id)).filter(Boolean);
  if (!estado.comparaItens) estado.comparaItens = (await api("GET", "/api/comparacao/itens")).itens;
  const itens = estado.comparaItens, grupos = [...new Set(itens.map((i) => i.grupo))];
  const anosDe = (v) => Array.from({ length: v.horizonte || 5 }, (_, i) => v.ano_base + i);
  const anosComuns = vs.map(anosDe).reduce((a, b) => a.filter((y) => b.includes(y)));
  if (!anosComuns.length) { mostrar("Os orçamentos escolhidos não têm nenhum ano em comum.", false); return; }
  const sel = new Set(itens.map((i) => i.id));
  const m = document.createElement("div");
  m.id = "modal-cmp"; m.className = "orc-overlay";
  m.innerHTML = `<div class="orc-caixa orc-larga" role="dialog" aria-modal="true" aria-labelledby="cmp-titulo">
    <header class="orc-cab"><span class="orc-icone">${icone("trocas", 22)}</span><div><h2 id="cmp-titulo">Imprimir comparação</h2><p>${vs.length} orçamentos selecionados</p></div>
      <button class="orc-x" data-cmp="fechar" aria-label="Fechar">✕</button></header>
    <div class="orc-corpo">
      <div class="orc-par">
        <label class="orc-campo">Orçamento base da comparação<select id="cmp-base">${vs.map((v) => `<option value="${v.id}">${esc(v.nome)}</option>`).join("")}</select></label>
        <label class="orc-campo">Ano da comparação<select id="cmp-ano">${anosComuns.map((y) => `<option>${y}</option>`).join("")}</select></label>
      </div>
      <div class="orc-campo">O que comparar
        <div class="cmp-itens">${grupos.map((g) => `<div class="cmp-col"><div class="linha" style="justify-content:space-between"><strong>${esc(g)}</strong>
          <button type="button" class="link" data-cmp-todos="${esc(g)}">marcar/desmarcar todos</button></div>
          <div class="cmp-lista">${itens.filter((i) => i.grupo === g).map((i) => `<label><input type="checkbox" data-cmp-item="${i.id}" checked> ${esc(i.nome)}</label>`).join("")}</div></div>`).join("")}</div></div>
      <label class="cmp-impacto"><input type="checkbox" id="cmp-impacto" checked> Calcular o impacto de cada grupo de premissas (mais lento)</label>
      <div id="cmp-erro" class="orc-erro" hidden></div>
    </div>
    <footer class="orc-rodape"><button class="sec" data-cmp="fechar">Cancelar</button><button class="prim" data-cmp="gerar" id="cmp-gerar">${icone("baixar", 16)} Imprimir</button></footer>
  </div>`;
  document.body.appendChild(m);
  const fechar = () => { m.classList.add("saindo"); setTimeout(() => m.remove(), 130); };
  const atualizar = () => { m.querySelector("#cmp-gerar").disabled = !sel.size; };
  m.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.cmpItem) { t.checked ? sel.add(t.dataset.cmpItem) : sel.delete(t.dataset.cmpItem); atualizar(); }
  });
  m.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.cmp === "fechar") fechar();
    else if (t.dataset.cmpTodos) {
      const caixas = [...m.querySelectorAll("[data-cmp-item]")].filter((c) => itens.find((i) => i.id === c.dataset.cmpItem).grupo === t.dataset.cmpTodos);
      const marcar = !caixas.every((c) => c.checked);
      caixas.forEach((c) => { c.checked = marcar; marcar ? sel.add(c.dataset.cmpItem) : sel.delete(c.dataset.cmpItem); }); atualizar();
    } else if (t.dataset.cmp === "gerar") {
      const erro = m.querySelector("#cmp-erro"); erro.hidden = true; t.disabled = true; t.textContent = "Gerando…";
      try {
        const base = Number(m.querySelector("#cmp-base").value);
        const r = await api("POST", "/api/comparacao", { base, outros: ids.filter((id) => id !== base), ano: Number(m.querySelector("#cmp-ano").value),
          itens: [...sel], impactos: m.querySelector("#cmp-impacto").checked });
        await gerarPdfComparacao(r);
        fechar(); mostrar("Relatório gerado.", true);
      } catch (err) { erro.textContent = err.message; erro.hidden = false; t.disabled = false; t.innerHTML = `${icone("baixar", 16)} Imprimir`; }
    }
  });
}

// ---------------------------------------------------------------- imprimir um orçamento (premissas e demonstrativos, ano a ano)
async function abrirImprimirOrcamento(vid) {
  if (document.getElementById("modal-cmp")) return;
  const v = estado.versoes.find((x) => x.id === vid);
  if (!estado.comparaItens) estado.comparaItens = (await api("GET", "/api/comparacao/itens")).itens;
  const itens = estado.comparaItens, grupos = [...new Set(itens.map((i) => i.grupo))];
  const sel = new Set(itens.map((i) => i.id));
  const m = document.createElement("div");
  m.id = "modal-cmp"; m.className = "orc-overlay";
  m.innerHTML = `<div class="orc-caixa orc-larga" role="dialog" aria-modal="true" aria-labelledby="cmp-titulo">
    <header class="orc-cab"><span class="orc-icone">${icone("impressora", 22)}</span><div><h2 id="cmp-titulo">Imprimir orçamento</h2><p>${esc(v.nome)}</p></div>
      <button class="orc-x" data-cmp="fechar" aria-label="Fechar">✕</button></header>
    <div class="orc-corpo">
      <div class="orc-campo">O que imprimir
        <div class="cmp-itens">${grupos.map((g) => `<div class="cmp-col"><div class="linha" style="justify-content:space-between"><strong>${esc(g)}</strong>
          <button type="button" class="link" data-cmp-todos="${esc(g)}">marcar/desmarcar todos</button></div>
          <div class="cmp-lista">${itens.filter((i) => i.grupo === g).map((i) => `<label><input type="checkbox" data-cmp-item="${i.id}" checked> ${esc(i.nome)}</label>`).join("")}</div></div>`).join("")}</div></div>
      <div id="cmp-erro" class="orc-erro" hidden></div>
    </div>
    <footer class="orc-rodape"><button class="sec" data-cmp="fechar">Cancelar</button><button class="prim" data-cmp="gerar" id="cmp-gerar">${icone("impressora", 16)} Imprimir</button></footer>
  </div>`;
  document.body.appendChild(m);
  const fechar = () => { m.classList.add("saindo"); setTimeout(() => m.remove(), 130); };
  const atualizar = () => { m.querySelector("#cmp-gerar").disabled = !sel.size; };
  m.addEventListener("change", (e) => { const t = e.target; if (t.dataset.cmpItem) { t.checked ? sel.add(t.dataset.cmpItem) : sel.delete(t.dataset.cmpItem); atualizar(); } });
  m.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.cmp === "fechar") fechar();
    else if (t.dataset.cmpTodos) {
      const caixas = [...m.querySelectorAll("[data-cmp-item]")].filter((c) => itens.find((i) => i.id === c.dataset.cmpItem).grupo === t.dataset.cmpTodos);
      const marcar = !caixas.every((c) => c.checked);
      caixas.forEach((c) => { c.checked = marcar; marcar ? sel.add(c.dataset.cmpItem) : sel.delete(c.dataset.cmpItem); }); atualizar();
    } else if (t.dataset.cmp === "gerar") {
      const erro = m.querySelector("#cmp-erro"); erro.hidden = true; t.disabled = true; t.textContent = "Gerando…";
      try {
        const r = await api("POST", `/api/versoes/${vid}/impressao`, { itens: itens.filter((i) => sel.has(i.id)).map((i) => i.id) });
        await gerarPdfOrcamento(r);
        fechar(); mostrar("Relatório gerado.", true);
      } catch (err) { erro.textContent = err.message; erro.hidden = false; t.disabled = false; t.innerHTML = `${icone("impressora", 16)} Imprimir`; }
    }
  });
}

// ---------------------------------------------------------------- PDF (jsPDF + autotable, mesma paleta do relatório de fechamento)
const PDF_C = { moss: [47, 93, 63], mossDark: [35, 74, 49], leaf: [122, 182, 72], tint: [230, 239, 231], tintSoft: [244, 248, 243], ink: [31, 42, 35], soft: [92, 104, 95],
                line: [221, 229, 220], neg: [176, 62, 44], pos: [31, 138, 68], white: [255, 255, 255] };
const PDF_M = 14, PDF_TOP = 22, PDF_BOTTOM = 18;

function carregarScript(src) {
  return new Promise((ok, falha) => {
    if ([...document.scripts].some((s) => s.src === src)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar a biblioteca de PDF. Ela precisa de internet."));
    document.head.appendChild(s);
  });
}

async function logoPdf() {
  try {
    const blob = await (await fetch("/web/assets/logo-sekita.png")).blob();
    const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
    const dim = await new Promise((ok) => { const i = new Image(); i.onload = () => ok({ w: i.width, h: i.height }); i.src = url; });
    return { url, ...dim };
  } catch (e) { return null; }
}

const pdfRs = (v, casas = 0) => (v === null || v === undefined || !isFinite(v) ? "—" : (v < 0 ? "-" : "") + "R$ " + pdfNum(Math.abs(v), casas));      // reais com o símbolo
const pdfTxt = (t) => String(t).replace(/[−–]/g, "-");                           // a fonte do PDF não tem o sinal de menos unicode
const pdfNum = (v, casas = 0) => (v === null || v === undefined || !isFinite(v) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
function pdfValor(v, un, casas) {                                    // R$ mil vira reais cheios
  if (v === null || v === undefined) return "—";
  if (un === "R$ mil") return pdfRs(v * 1000, 0);
  if (un === "%") return pdfNum(v, 2) + "%";
  if (un === "R$") return pdfRs(v, 2);
  const c = casas !== undefined ? casas : (Math.abs(v) >= 100 ? 0 : 2);
  if (un && un.startsWith("R$/")) return pdfRs(v, c) + un.slice(2);
  return pdfNum(v, c) + (un ? " " + un : "");
}

async function gerarPdfComparacao(r) {
  await carregarScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  await carregarScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");
  const { jsPDF } = window.jspdf, C = PDF_C;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logo = await logoPdf();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), CW = W - 2 * PDF_M;
  const fill = (c) => doc.setFillColor(...c), cor = (c) => doc.setTextColor(...c), traco = (c) => doc.setDrawColor(...c);
  const base = r.orcamentos[0], outros = r.orcamentos.slice(1);
  const geradoEm = new Date().toLocaleDateString("pt-BR") + " às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  let y = 0;

  // cabeçalho grande da primeira página
  fill(C.tintSoft); doc.roundedRect(PDF_M, 8, CW, 30, 3, 3, "F"); fill(C.leaf); doc.roundedRect(PDF_M, 8 + 30 - 1.6, CW, 1.6, 0.8, 0.8, "F");
  if (logo) { const lw = 26, lh = (lw * logo.h) / logo.w; doc.addImage(logo.url, "PNG", PDF_M + 8, 8 + (28.4 - lh) / 2, lw, lh); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.8); cor(C.moss); doc.text("COMPARAÇÃO DE ORÇAMENTOS", W - PDF_M - 8, 16, { align: "right" });
  doc.setFontSize(20); cor(C.mossDark); doc.text(String(r.ano), W - PDF_M - 8, 25, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); cor(C.soft);
  doc.text(`${base.nome}  ×  ${outros.map((o) => o.nome).join("  ×  ")}`, W - PDF_M - 8, 31, { align: "right", maxWidth: CW - 50 });
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
      didDrawCell: (d) => { if (d.section !== "body") return; traco(C.line); doc.setLineWidth(0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } }, opts));
    y = doc.lastAutoTable.finalY + 7;
  };

  // orçamentos comparados
  titulo("Orçamentos comparados", `Ano ${r.ano}. Todas as diferenças são em relação ao orçamento base (A).`);
  const tipo = (o) => (o.tipo === "orcado" ? "Orçado" : o.tipo === "reprojetado" ? "Reprojetado" : "Cenário");
  tabela({ head: [["", "Orçamento", "Tipo", "Origem"]], body: r.orcamentos.map((o, i) => [i === 0 ? "A · base" : String.fromCharCode(65 + i), o.nome, tipo(o), o.origem_id ? (r.orcamentos.find((x) => x.id === o.origem_id) || {}).nome || "outro orçamento" : "—"]),
    columnStyles: { 0: { cellWidth: 24, fontStyle: "bold" } } });

  // seções: premissas primeiro, depois demonstrativos
  const comDif = r.secoes.filter((s) => s.linhas.length);
  const vazias = r.secoes.filter((s) => !s.linhas.length).map((s) => s.titulo);
  for (const tipoSecao of ["Premissas", "Demonstrativos"]) {
    for (const s of comDif.filter((x) => x.tipo === tipoSecao)) {
      const head = [["Item", base.nome, ...outros.flatMap((o) => [o.nome, "Diferença"])]];
      const linhas = []; let ultimoGrupo = null;
      for (const l of s.linhas) {
        if (l.grupo && l.grupo !== ultimoGrupo) { linhas.push({ grupo: l.grupo }); ultimoGrupo = l.grupo; }
        linhas.push(l);
      }
      const body = linhas.map((l) => l.grupo && !l.nome ? [{ content: pdfTxt(l.grupo), colSpan: head[0].length, styles: { fillColor: C.tint, textColor: C.mossDark, fontStyle: "bold" } }]
        : [{ content: " ".repeat((l.nivel || 0) * 2) + pdfTxt(l.nome), styles: {} }, pdfValor(l.valores[0], l.unidade, l.casas),
           ...outros.flatMap((o, i) => { const v = l.valores[i + 1], b = l.valores[0]; const d = v === null || b === null ? null : v - b;
             return [pdfValor(v, l.unidade, l.casas), { content: d === null ? "—" : (d > 0 ? "+" : "") + pdfValor(d, l.unidade, l.casas), styles: { textColor: d < 0 ? C.neg : d > 0 ? C.pos : C.ink } }]; })]);
      titulo(s.titulo, s.completo ? "Demonstrativo completo" : `${s.linhas.length} item(ns) com diferença`);
      const cols = {}; head[0].forEach((_, i) => { cols[i] = i === 0 ? { cellWidth: "auto" } : { halign: "right", cellWidth: Math.min(34, (CW - 70) / (head[0].length - 1)) }; });
      tabela({ head, body, columnStyles: cols, didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; } });
    }
  }
  if (vazias.length) { titulo("Sem diferença no ano", vazias.join(" · ")); }

  // impacto: o que mais mudou o resultado
  for (const im of r.impactos) {
    if (y > PDF_TOP + 25) { doc.addPage(); y = PDF_TOP; }
    titulo(`O que mais impactou · ${im.nome}`, `Efeito de cada grupo de premissas, trocado sozinho no orçamento base, nos resultados de ${r.ano}`);
    tabela({ head: [["Resultado do ano", base.nome, im.nome, "Diferença", "%"]], body: im.kpis.map((k) => [k.nome, pdfRs(k.base * 1000), pdfRs(k.valor * 1000),
      { content: (k.delta > 0 ? "+" : "") + pdfRs(k.delta * 1000), styles: { textColor: k.delta < 0 ? C.neg : k.delta > 0 ? C.pos : C.ink } }, k.base ? pdfNum((k.delta / Math.abs(k.base)) * 100, 1) + "%" : "—"]),
      columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 40 }, 2: { halign: "right", cellWidth: 40 }, 3: { halign: "right", cellWidth: 40 }, 4: { halign: "right", cellWidth: 20 } },
      didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; } });
    const lucro = im.kpis.find((k) => k.id === "lucro");
    const itensL = [...im.fatores.map((f) => ({ nome: f.grupo, v: f.efeitos.lucro })), ...(Math.abs(im.combinado.lucro) > 0.5 ? [{ nome: "Efeito combinado (interação entre grupos)", v: im.combinado.lucro }] : [])]
      .filter((x) => Math.abs(x.v) > 0.5).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    // texto explicativo
    const R = (v) => "R$ " + pdfNum(Math.abs(v) * 1000);
    const frases = [];
    if (lucro && Math.abs(lucro.delta) > 0.5) {
      frases.push(`Em ${r.ano}, o lucro líquido de "${im.nome}" é ${R(lucro.delta)} ${lucro.delta > 0 ? "maior" : "menor"} que o de "${base.nome}" (${pdfNum(Math.abs(lucro.base) > 0 ? (lucro.delta / Math.abs(lucro.base)) * 100 : 0, 1)}%).`);
      if (itensL.length) frases.push(`O principal fator foi ${itensL[0].nome} (${itensL[0].v > 0 ? "+" : "-"}${R(itensL[0].v)})${itensL[1] ? `, seguido de ${itensL[1].nome} (${itensL[1].v > 0 ? "+" : "-"}${R(itensL[1].v)})` : ""}.`);
    } else frases.push(`O lucro líquido de ${r.ano} é praticamente igual nos dois orçamentos.`);
    const cx = im.kpis.find((k) => k.id === "caixa"), dv = im.kpis.find((k) => k.id === "divida");
    if (cx && Math.abs(cx.delta) > 0.5) frases.push(`O caixa final fica ${R(cx.delta)} ${cx.delta > 0 ? "maior" : "menor"}${dv && Math.abs(dv.delta) > 0.5 ? ` e a dívida bancária ${R(dv.delta)} ${dv.delta > 0 ? "maior" : "menor"}` : ""}.`);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.2); cor(C.ink);
    const linhasTxt = doc.splitTextToSize(frases.join(" "), CW);
    if (y + linhasTxt.length * 4.4 > H - PDF_BOTTOM - 40) { doc.addPage(); y = PDF_TOP; }
    doc.text(linhasTxt, PDF_M, y + 2); y += linhasTxt.length * 4.4 + 6;
    // gráfico de barras horizontais: efeito de cada grupo no lucro líquido
    if (itensL.length) {
      const bh = 7, gap = 3, altura = itensL.length * (bh + gap) + 14;
      if (y + altura > H - PDF_BOTTOM) { doc.addPage(); y = PDF_TOP; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); cor(C.mossDark); doc.text("Efeito de cada grupo de premissas no lucro líquido", PDF_M, y + 3); y += 8;
      const xz = PDF_M + 78 + (CW - 78 - 40) / 2, esc = (CW - 78 - 40) / 2 / Math.max(...itensL.map((x) => Math.abs(x.v)), 1);
      traco(C.line); doc.setLineWidth(0.3); doc.line(xz, y - 2, xz, y + itensL.length * (bh + gap));
      itensL.forEach((x, i) => {
        const yy = y + i * (bh + gap), larg = Math.max(Math.abs(x.v) * esc, 0.6);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); cor(C.ink); doc.text(pdfTxt(x.nome), PDF_M, yy + bh / 2 + 1.4, { maxWidth: 74 });
        fill(x.v >= 0 ? C.pos : C.neg); doc.roundedRect(x.v >= 0 ? xz : xz - larg, yy, larg, bh, 1, 1, "F");
        cor(x.v >= 0 ? C.pos : C.neg); doc.setFont("helvetica", "bold");
        doc.text((x.v > 0 ? "+" : "-") + pdfRs(Math.abs(x.v) * 1000), x.v >= 0 ? xz + larg + 2 : xz - larg - 2, yy + bh / 2 + 1.4, { align: x.v >= 0 ? "left" : "right" });
      });
      y += itensL.length * (bh + gap) + 8;
    }
    // efeitos de cada grupo em todos os resultados
    if (im.fatores.length) {
      titulo("Efeito de cada grupo em todos os resultados", "Cada linha troca só aquele grupo de premissas, mantendo o resto igual ao base");
      const ks = im.kpis;
      tabela({ head: [["Grupo de premissas", ...ks.map((k) => k.nome)]], body: [...im.fatores.map((f) => [pdfTxt(f.grupo), ...ks.map((k) => f.efeitos[k.id])]), ["Efeito combinado", ...ks.map((k) => im.combinado[k.id])],
        [{ content: "Diferença total", styles: { fontStyle: "bold" } }, ...ks.map((k) => k.delta)]]
        .map((linha, i, arrL) => [linha[0], ...linha.slice(1).map((v) => ({ content: (v > 0.0005 ? "+" : "") + (Math.abs(v) < 0.0005 ? "—" : pdfRs(v * 1000)), styles: { halign: "right", textColor: v < -0.0005 ? C.neg : v > 0.0005 ? C.pos : C.ink, fontStyle: i === arrL.length - 1 ? "bold" : "normal" } }))]),
        didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; } });
    }
  }

  // cabeçalho compacto e rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); cor(C.soft); doc.text(`Comparação de orçamentos  ·  ${r.ano}`, W - PDF_M, 9.4, { align: "right" }); traco(C.line); doc.setLineWidth(0.3); doc.line(PDF_M, 16.5, W - PDF_M, 16.5); }
    traco(C.line); doc.setLineWidth(0.3); doc.line(PDF_M, H - 13, W - PDF_M, H - 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); cor(C.soft); doc.text("Gerado em " + geradoEm, PDF_M, H - 8.5); doc.text(`Página ${p} de ${total}`, W - PDF_M, H - 8.5, { align: "right" });
  }
  doc.save(`Comparacao_${base.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_")}_${r.ano}.pdf`);
}

async function gerarPdfOrcamento(r) {
  await carregarScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  await carregarScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");
  const { jsPDF } = window.jspdf, C = PDF_C;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logo = await logoPdf();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), CW = W - 2 * PDF_M;
  const fill = (c) => doc.setFillColor(...c), cor = (c) => doc.setTextColor(...c), traco = (c) => doc.setDrawColor(...c);
  const o = r.orcamento, anos = r.anos;
  const geradoEm = new Date().toLocaleDateString("pt-BR") + " às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const fonte = anos.length > 14 ? 5.2 : anos.length > 10 ? 6 : anos.length > 7 ? 7 : 8;
  const valor = (v, un, casas) => {                                    // R$ mil sem casas; o resto com as casas que o número pede (a unidade já vai no nome da linha)
    if (v === null || v === undefined) return "—";
    if (un === "R$ mil") return pdfRs(v * 1000, 0);
    if (un && un.startsWith("R$/")) return pdfRs(v, casas !== undefined ? casas : 2) + un.slice(2);
    return pdfNum(v, casas !== undefined ? casas : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4) + (un === "%" ? "%" : "");
  };
  let y = 0;

  fill(C.tintSoft); doc.roundedRect(PDF_M, 8, CW, 30, 3, 3, "F"); fill(C.leaf); doc.roundedRect(PDF_M, 8 + 30 - 1.6, CW, 1.6, 0.8, 0.8, "F");
  if (logo) { const lw = 26, lh = (lw * logo.h) / logo.w; doc.addImage(logo.url, "PNG", PDF_M + 8, 8 + (28.4 - lh) / 2, lw, lh); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.8); cor(C.moss); doc.text("ORÇAMENTO", W - PDF_M - 8, 16, { align: "right" });
  doc.setFontSize(20); cor(C.mossDark); doc.text(pdfTxt(o.nome), W - PDF_M - 8, 25, { align: "right", maxWidth: CW - 50 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); cor(C.soft);
  doc.text(`Projeção de ${anos[0]} a ${anos[anos.length - 1]}  ·  ${o.status === "aprovado" ? "Aprovado e travado" : "Em elaboração"}  ·  valores em R$, exceto onde indicado`, W - PDF_M - 8, 31, { align: "right" });
  y = 46;

  const titulo = (txt) => {
    if (y > H - PDF_BOTTOM - 30) { doc.addPage(); y = PDF_TOP; }
    fill(C.leaf); doc.roundedRect(PDF_M, y, 1.6, 6, 0.8, 0.8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); cor(C.mossDark); doc.text(txt, PDF_M + 4.5, y + 4.6);
    y += 9.5;
  };
  for (const tipoSecao of ["Premissas", "Demonstrativos"]) {
    for (const s of r.secoes.filter((x) => x.tipo === tipoSecao)) {
      titulo(s.titulo);
      if (!s.linhas.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); cor(C.soft); doc.text("Nenhum valor lançado neste orçamento.", PDF_M, y + 2); y += 10; continue; }
      const head = [["Item", ...anos.map(String)]];
      const body = []; let ultimo = null;
      for (const l of s.linhas) {
        if (l.grupo && l.grupo !== ultimo) { body.push([{ content: pdfTxt(l.grupo), colSpan: head[0].length, styles: { fillColor: C.tint, textColor: C.mossDark, fontStyle: "bold" } }]); ultimo = l.grupo; }
        const forte = l.total || (s.tipo === "Demonstrativos" && !l.grupo && l.nivel === 0);
        const un = l.unidade && l.unidade !== "R$ mil" ? ` (${pdfTxt(l.unidade)})` : "";
        body.push([{ content: " ".repeat((l.nivel || 0) * 2) + pdfTxt(l.nome) + (s.tipo === "Premissas" ? un : ""), styles: forte ? { fontStyle: "bold" } : {} },
          ...anos.map((a) => ({ content: valor(l.valores[a], l.unidade, l.casas), styles: { halign: "right", ...(forte ? { fontStyle: "bold" } : {}) } }))]);
      }
      const cols = { 0: { cellWidth: Math.max(48, Math.min(90, CW - anos.length * 17)) } };
      doc.autoTable({ startY: y, head, body, columnStyles: cols, margin: { top: PDF_TOP, bottom: PDF_BOTTOM, left: PDF_M, right: PDF_M }, theme: "plain",
        styles: { font: "helvetica", fontSize: fonte, cellPadding: { top: 1.3, bottom: 1.3, left: 2, right: 2 }, textColor: C.ink, overflow: "linebreak" },
        headStyles: { fillColor: C.mossDark, textColor: C.white, fontStyle: "bold", fontSize: fonte },
        didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; },
        didDrawCell: (d) => { if (d.section !== "body") return; traco(C.line); doc.setLineWidth(0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } });
      y = doc.lastAutoTable.finalY + 8;
    }
  }
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); cor(C.soft); doc.text(pdfTxt(o.nome), W - PDF_M, 9.4, { align: "right" }); traco(C.line); doc.setLineWidth(0.3); doc.line(PDF_M, 16.5, W - PDF_M, 16.5); }
    traco(C.line); doc.setLineWidth(0.3); doc.line(PDF_M, H - 13, W - PDF_M, H - 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); cor(C.soft); doc.text("Gerado em " + geradoEm, PDF_M, H - 8.5); doc.text(`Página ${p} de ${total}`, W - PDF_M, H - 8.5, { align: "right" });
  }
  doc.save(`Orcamento_${o.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_")}.pdf`);
}
