"use strict";
/* Componentes visuais compartilhados: ícones SVG, repositório de ícones de produtos e pequenos blocos de tela. */

const ICONES = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  orcamento: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-3.5-2.3-5.5-6.5-5.5 0 3.5 2.3 5.5 6.5 5.5z"/><path d="M12 14.5c0-3 2.3-5 6.5-5 0 3-2.3 5-6.5 5z"/>',
  chart: '<path d="M5 20v-9M12 20V4M19 20v-6"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  arquivo: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  caixa: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  resultados: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  lista: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  trocas: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  seta: '<path d="M6 9l6 6 6-6"/>',
  esquerda: '<path d="M15 6l-6 6 6 6"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  atualizar: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  percentual: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
  ampulheta: '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 5 8 5 8 9s-8 4-8 9"/><path d="M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  calculadora: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  trofeu: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  faisca: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  tendencia: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  colunas: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  baixar: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  replicar: '<path d="M6 17l5-5-5-5M13 17l5-5-5-5"/>',
  moedas: '<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v6c0 1.7 2.7 3 6 3s6-1.3 6-3V6"/><path d="M3 12v5c0 1.7 2.7 3 6 3 2.4 0 4.4-.7 5.4-1.8"/><path d="M15 11c3.3 0 6 1.3 6 3v4c0 1.7-2.7 3-6 3"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  impressora: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  expandir: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  semcor: '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  direita: '<path d="M9 6l6 6-6 6"/>',
  seta_dir: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  balanca: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  predio: '<path d="M3 9l9-5 9 5"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>',
  pizza: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
};
const icone = (nome, tam = 20) => `<svg class="ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ""}</svg>`;

// ---------------------------------------------------------------- repositório de ícones de produtos
// O sistema associa o ícone pelo nome do produto (sem acento, maiúscula ou plural). Quando não reconhece,
// usa o ícone do grupo (Grãos, Hortifruti, Frutas, Pecuária...) e, por fim, uma plantinha.
// Para ensinar um produto novo, basta acrescentar uma linha: [["palavra", "outra palavra"], "emoji"].
const ICONES_PRODUTO = [
  [["abacate"], "🥑"], [["soja"], "🫘"], [["feijao", "ervilha", "vagem", "lentilha", "grao de bico"], "🫘"], [["milho", "pipoca"], "🌽"],
  [["banana"], "🍌"], [["alface", "repolho", "couve", "rucula", "agriao", "espinafre", "acelga", "almeirao", "chicoria"], "🥬"],
  [["brocolis", "couve flor"], "🥦"], [["pimentao"], "🫑"], [["pimenta"], "🌶️"], [["abobrinha", "pepino", "chuchu", "quiabo", "maxixe"], "🥒"],
  [["abobora", "moranga", "jerimum"], "🎃"], [["berinjela", "jilo"], "🍆"], [["cenoura"], "🥕"], [["beterraba", "rabanete", "nabo"], "🫜"],
  [["alho"], "🧄"], [["cebola", "cebolinha", "alho poro"], "🧅"], [["batata doce"], "🍠"], [["batata", "mandioca", "aipim", "macaxeira", "inhame", "mandioquinha"], "🥔"],
  [["tomate"], "🍅"], [["milho verde"], "🌽"], [["arroz", "trigo", "aveia", "centeio", "cevada", "sorgo", "painco", "triticale"], "🌾"],
  [["cafe"], "☕"], [["cana"], "🎋"], [["algodao"], "☁️"], [["girassol"], "🌻"], [["amendoim"], "🥜"], [["castanha", "noz", "macadamia", "pecan"], "🌰"],
  [["laranja", "tangerina", "mexerica", "bergamota"], "🍊"], [["limao", "lima"], "🍋"], [["maca"], "🍎"], [["uva"], "🍇"], [["melancia"], "🍉"],
  [["melao"], "🍈"], [["morango", "amora", "framboesa"], "🍓"], [["mirtilo", "blueberry"], "🫐"], [["manga", "mamao", "papaia"], "🥭"], [["abacaxi"], "🍍"],
  [["coco"], "🥥"], [["pessego", "nectarina", "ameixa", "damasco"], "🍑"], [["pera"], "🍐"], [["cereja"], "🍒"], [["kiwi"], "🥝"], [["goiaba", "maracuja", "caqui", "figo", "pitaya"], "🍈"],
  [["eucalipto", "pinus", "madeira", "floresta"], "🌲"], [["flor", "rosa", "orquidea"], "🌸"], [["cogumelo", "champignon", "shimeji"], "🍄"],
  [["salsa", "salsinha", "coentro", "hortela", "manjericao", "cheiro verde", "erva"], "🌿"], [["mel", "apicultura"], "🍯"],
  [["leite"], "🥛"], [["queijo", "iogurte"], "🧀"], [["ovo"], "🥚"], [["frango", "galinha", "avicultura", "peru", "codorna"], "🐔"],
  [["gado", "boi", "bovino", "bezerro", "novilho", "vaca", "carne", "corte"], "🐄"], [["porco", "suino", "suinocultura", "leitao"], "🐖"],
  [["ovelha", "ovino", "carneiro", "cordeiro"], "🐑"], [["cabra", "caprino", "bode"], "🐐"], [["cavalo", "equino", "egua"], "🐴"],
  [["peixe", "tilapia", "tambaqui", "piscicultura", "camarao"], "🐟"],
];
const ICONES_GRUPO = { "graos": "🌾", "hortifruti": "🥬", "hortalicas": "🥬", "frutas": "🍎", "fruticultura": "🍎", "pecuaria": "🐄", "cafe": "☕", "cana": "🎋", "florestal": "🌲" };
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function emojiProduto(nome, grupo) {
  const n = ` ${semAcento(nome)} `;
  for (const [palavras, emoji] of ICONES_PRODUTO) {
    if (palavras.some((p) => n.includes(` ${p}`))) return emoji;      // início de palavra: "tomates", "tomate cereja" → tomate
  }
  return ICONES_GRUPO[semAcento(grupo)] || "🌱";
}
// ---------------------------------------------------------------- cores dos produtos (tons pastéis, sempre as mesmas nos gráficos)
// Mesma ideia do repositório de ícones: reconhece pelo nome; produto desconhecido ganha um pastel fixo gerado do próprio nome.
const CORES_PRODUTO = [
  [["cenoura"], "#f3b27f"], [["beterraba"], "#b89ad2"], [["alho"], "#f3e29a"], [["soja"], "#c8a07c"], [["abacate"], "#cde3a2"], [["repolho"], "#a9d8bb"],
  [["alface", "rucula", "agriao", "acelga", "espinafre", "couve"], "#b9e0a4"], [["brocolis", "couve flor"], "#9fcfa4"], [["abobrinha", "pepino", "chuchu", "quiabo"], "#a6d3a2"],
  [["tomate"], "#f0a29a"], [["pimentao", "pimenta"], "#f2a99c"], [["berinjela", "jilo"], "#c5a5c8"], [["cebola"], "#e6b9cb"], [["batata doce"], "#e3a58f"],
  [["batata", "mandioca", "aipim", "inhame"], "#e6d0a2"], [["milho"], "#f3d36e"], [["arroz", "trigo", "aveia", "sorgo"], "#eadfb8"], [["feijao", "ervilha", "vagem"], "#d9b99a"],
  [["banana"], "#f6dd78"], [["laranja", "tangerina", "mexerica"], "#f6bf7c"], [["limao"], "#e4ec9d"], [["maca"], "#eea5a5"], [["uva"], "#c3abd8"], [["melancia"], "#f29fa0"],
  [["morango", "framboesa"], "#f2a6b6"], [["manga", "mamao", "abacaxi"], "#f7c978"], [["coco"], "#dfd6c6"], [["cafe"], "#aa8d79"], [["cana"], "#b4d9a0"],
  [["leite", "queijo", "iogurte"], "#d4e3f2"], [["ovo"], "#f7ebcf"], [["frango", "galinha", "avicultura"], "#f2d8b0"], [["gado", "boi", "bovino", "bezerro", "carne"], "#d6bca4"],
  [["porco", "suino"], "#f2c3c3"], [["peixe", "tilapia"], "#b8d8ea"], [["mel"], "#f1ca6c"], [["eucalipto", "pinus", "madeira"], "#9dc5a4"],
];
function corProduto(nome, grupo) {
  const n = ` ${semAcento(nome)} `;
  for (const [palavras, cor] of CORES_PRODUTO) if (palavras.some((p) => n.includes(` ${p}`))) return cor;
  let h = 0; for (const ch of semAcento(nome) + "|" + semAcento(grupo)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 80%)`;
}

const iconeProduto = (nome, grupo) => `<span class="emoji-prod" aria-hidden="true">${emojiProduto(nome, grupo)}</span>`;

// abre uma tela pelo código, passando pelo mesmo caminho do menu (inclusive as que agora são abas de Premissas de produção)
function irParaModulo(id) { const a = document.createElement("a"); a.href = "#"; a.dataset.modulo = id; a.hidden = true; document.body.appendChild(a); a.click(); a.remove(); }

// ---------------------------------------------------------------- blocos de tela
const cabecaCartaoGrande = (ic, titulo, selo, direita = "") => `<div class="card-cab grande"><span class="card-ic quadro">${icone(ic, 24)}</span><h2>${titulo}</h2>${selo ? `<span class="selo-verde">${selo}</span>` : ""}<div class="dir">${direita}</div></div>`;
const cabecaCartao = (ic, titulo, direita = "") => `<div class="card-cab"><span class="card-ic">${icone(ic, 22)}</span><h2>${titulo}</h2><div class="dir">${direita}</div></div>`;
const kpiCard = (ic, rotulo, valor) => `<div class="kpi-card"><span class="kpi-ic">${icone(ic, 24)}</span><div><span>${rotulo}</span><strong>${valor}</strong></div></div>`;
// "replicar todos": seletor do ano + botão, compactos, à direita do título do cartão
const replicarMini = (idAno, idBotao, anos, titulo, rotulo) => `<div class="rep-mini"><select id="${idAno}" aria-label="Replicar a partir do ano">${anos.map((y) => `<option>${y}</option>`).join("")}</select>
  <button class="sec peq" id="${idBotao}" title="${titulo}">${rotulo} →</button></div>`;
const btnLixo = (attrs, titulo) => `<button class="btn-lixo" ${attrs} title="${titulo}" aria-label="${titulo}">${icone("trash", 18)}</button>`;

// lê um número digitado em português (R$ 3.500,25 ou 3500,25 ou 3500.25); vazio/inválido = 0
function lerNumero(txt) {
  let t = String(txt ?? "").replace(/[^\d.,\-]/g, "");
  if (!t || t === "-") return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");      // 1.250 = mil duzentos e cinquenta
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
// valores em reais: "R$ 7.450,00" (negativos: "-R$ 1.000,00")
// valor em reais inteiros com o símbolo: "R$ 1.234" / "-R$ 1.234"; rsMil recebe o valor guardado em R$ mil
const rs = (n, d = 0) => (n === null || n === undefined || isNaN(n) ? "–" : `${n < 0 ? "-" : ""}R$ ${Math.abs(Number(n)).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const rsMil = (v, d = 0) => (v === null || v === undefined ? "–" : rs(v * 1000, d));
const fmtMoeda = (n) => `${n < 0 ? "-" : ""}R$ ${Math.abs(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------- campos em reais
// Todo campo numérico cuja linha (ou cabeçalho da tabela) fala em "R$" — ou marcado com data-moeda — vira um campo em reais:
// mostra "R$ 7.450,00"; ao clicar mostra só o número para digitar; ao sair volta ao formato. Os tratadores das telas
// continuam lendo t.value como número, porque no evento "change" o valor é trocado pelo número puro antes deles.
function ehCampoMoeda(inp) {
  if (inp.hasAttribute("data-moeda")) return true;
  const linha = inp.closest("tr"), prim = linha && linha.firstElementChild;
  if (prim && /R\$/.test(prim.textContent)) return true;
  const th = inp.closest("table") && inp.closest("table").querySelector("thead th");
  return !!(th && /R\$/.test(th.textContent));
}
const fmtNumero = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ehCampoBR = (t) => !!(t.classList && (t.classList.contains("moeda") || t.classList.contains("numbr")));
const fmtCampoBR = (t, n) => (t.classList.contains("moeda") ? fmtMoeda(n) : fmtNumero(n));
// Todo campo numérico dentro de tabela vira campo "brasileiro": 6.250,00 (e R$ 6.250,00 quando é dinheiro).
// Campos soltos (fora de tabela) ficam como estão; data-inteiro exclui um campo da formatação.
function padronizarMoeda(raiz) {
  raiz.querySelectorAll('input[type="number"]').forEach((i) => {
    const dinheiro = ehCampoMoeda(i);
    if (!dinheiro && (!i.closest("table") || i.hasAttribute("data-inteiro"))) return;
    const v = i.value;
    i.type = "text"; i.inputMode = "decimal"; i.classList.add(dinheiro ? "moeda" : "numbr");
    i.value = v === "" ? "" : fmtCampoBR(i, lerNumero(v));
  });
}
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.readOnly || t.disabled) return;
  if (!(t.type === "number" || ehCampoBR(t) || t.inputMode === "decimal")) return;      // só campos numéricos
  const br = ehCampoBR(t), n = br ? lerNumero(t.value) : Number(t.value);
  t.dataset.orig = t.value;
  if (br && t.value !== "") t.value = String(n).replace(".", ",");
  if (t.value !== "" && n === 0) { t.value = ""; return; }                  // campo com 0: o zero some, já dá para digitar
  t.dataset.selecionar = "1";
  setTimeout(() => { if (document.activeElement === t) t.select(); }, 0);   // com valor: tudo selecionado (digitar substitui)
});
document.addEventListener("mouseup", (e) => { const t = e.target; if (t.dataset && t.dataset.selecionar) { e.preventDefault(); delete t.dataset.selecionar; } }, true);
document.addEventListener("focusout", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.value === "" && t.dataset.orig !== undefined && t.dataset.orig !== "" && lerNumero(t.dataset.orig) === 0) t.value = t.dataset.orig;     // saiu sem digitar: o zero volta
  delete t.dataset.orig;
  if (ehCampoBR(t)) t.value = t.value === "" ? "" : fmtCampoBR(t, lerNumero(t.value));
});
document.addEventListener("change", (e) => {                                 // captura: roda antes dos tratadores das telas
  const t = e.target;
  if (ehCampoBR(t)) t.value = t.value === "" ? "" : String(lerNumero(t.value));
}, true);

// ---------------------------------------------------------------- padrão único do botão "Replicar"
// Todo botão cujo texto começa com "Replicar" vira o mesmo componente discreto: [ano ▾ | »]
// (ano de origem + ícone "para os anos seguintes"). O id, os data-* e o title do botão original são mantidos,
// então os tratadores de cada tela continuam funcionando. Rodado automaticamente quando o conteúdo muda.
function padronizarReplicar(raiz) {
  raiz.querySelectorAll("button").forEach((b) => {
    if (b.classList.contains("rep-btn") || !/^\s*Replicar\b/.test(b.textContent)) return;
    const titulo = b.title || "Replicar para os anos seguintes";
    const pai = b.parentElement, ant = b.previousElementSibling;
    const sel = ant && ant.tagName === "SELECT" ? ant : null;
    b.className = "rep-btn"; b.title = titulo; b.setAttribute("aria-label", titulo); b.innerHTML = icone("replicar", 16);
    if (sel) {
      const pilula = document.createElement("span");
      pilula.className = "rep-pill";
      pai.insertBefore(pilula, sel);
      sel.classList.remove("peq"); sel.setAttribute("aria-label", "Replicar a partir do ano");
      pilula.append(sel, b);
    } else b.classList.add("rep-solo");
    if (!pai.querySelector('input[type="checkbox"]')) {               // tira o rótulo comprido: a pílula já diz o que faz
      pai.querySelectorAll(":scope > strong").forEach((x) => { if (/^Replicar/.test(x.textContent)) x.remove(); });
      pai.childNodes.forEach((n) => { if (n.nodeType === 3 && /a partir de/i.test(n.textContent)) n.textContent = n.textContent.replace(/a partir de/gi, ""); });
      if (!b.closest("td")) pai.classList.add("rep-topo");
    }
  });
}
// roda a cada mudança do conteúdo: botões Replicar e campos em reais
new MutationObserver(() => { const c = document.getElementById("conteudo"); padronizarReplicar(c); padronizarMoeda(c); restaurarFoco(); })
  .observe(document.getElementById("conteudo"), { childList: true, subtree: true });

// ---------------------------------------------------------------- atalhos de teclado nas tabelas (como numa planilha)
// ↑ ↓ ← → vão para o campo vizinho; Enter desce (Shift+Enter sobe). ← e → só saem do campo quando o cursor está na ponta
// (ou o número está todo selecionado), para não atrapalhar quem edita o texto. Como salvar redesenha a tabela, o foco é
// restaurado no campo de destino depois do redesenho.
let focoPendente = null;
function camposDaLinha(tr) { return [...tr.querySelectorAll('input:not([disabled]):not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"])')]; }
function posicaoCampo(inp) {
  const tr = inp.closest("tr"), tabela = tr.closest("table");
  const linhas = [...tabela.querySelectorAll("tr")].filter((l) => camposDaLinha(l).length);
  return { tabela, linhas, l: linhas.indexOf(tr), c: camposDaLinha(tr).indexOf(inp) };
}
function destinoCampo(inp, dl, dc) {
  const { linhas, l, c } = posicaoCampo(inp);
  if (dl) { const prox = linhas[l + dl]; if (!prox) return null; const cs = camposDaLinha(prox); return cs[Math.min(c, cs.length - 1)] || null; }
  return camposDaLinha(inp.closest("tr"))[c + dc] || null;
}
function irParaCampo(origem, alvo) {
  const tabelas = [...document.querySelectorAll("#conteudo table")], { l, c } = posicaoCampo(alvo);
  focoPendente = { t: tabelas.indexOf(alvo.closest("table")), l, c, ate: Date.now() + 2000 };
  alvo.focus();
}
function restaurarFoco() {
  if (!focoPendente || Date.now() > focoPendente.ate) { focoPendente = null; return; }
  const tabela = document.querySelectorAll("#conteudo table")[focoPendente.t];
  if (!tabela) return;
  const linhas = [...tabela.querySelectorAll("tr")].filter((l) => camposDaLinha(l).length), alvo = linhas[focoPendente.l] && camposDaLinha(linhas[focoPendente.l])[focoPendente.c];
  if (alvo && document.activeElement !== alvo) alvo.focus();
}
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || !t.closest("#conteudo table") || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (["checkbox", "radio", "button", "submit"].includes(t.type)) return;
  const ini = t.selectionStart, fim = t.selectionEnd, tamanho = t.value.length;       // number: null → conta como "na ponta"
  let alvo, acao = true;
  if (e.key === "ArrowDown" && !e.shiftKey) alvo = destinoCampo(t, 1, 0);
  else if (e.key === "ArrowUp" && !e.shiftKey) alvo = destinoCampo(t, -1, 0);
  else if (e.key === "Enter") alvo = destinoCampo(t, e.shiftKey ? -1 : 1, 0);
  else if (e.key === "ArrowRight" && !e.shiftKey && (ini === null || fim === tamanho)) alvo = destinoCampo(t, 0, 1);
  else if (e.key === "ArrowLeft" && !e.shiftKey && (ini === null || ini === 0)) alvo = destinoCampo(t, 0, -1);
  else acao = false;
  if (!acao) return;
  e.preventDefault();                                       // também impede ↑/↓ de mexerem no valor
  if (alvo) irParaCampo(t, alvo); else if (e.key === "Enter") t.blur();
});
