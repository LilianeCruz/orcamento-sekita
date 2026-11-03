"use strict";
// ---------------------------------------------------------------- Fluxo de caixa (indireto, simplificado, capital de giro e caixa), Usos e fontes, Indicadores
const fmtNum0 = (v) => (v === null || v === undefined || Math.abs(v) < 0.5 ? "–" : rs(v * 1000));      // guardado em R$ mil, mostrado em reais
const icPop = (l) => (l.explicacao ? ` <button class="link ajuda-i" style="color:var(--verde);padding:0 4px" data-pop="${esc(l.explicacao)}" title="Como é calculado">ⓘ</button>` : "");

function tabelaSecoes(anos, secoes, fmt = fmtNum0, casas) {
  const f = casas === undefined ? fmt : (v) => (v === null || v === undefined ? "–" : num(v, casas));
  return `<div class="scroll"><table><thead><tr><th>Linha</th>${anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
    ${secoes.map((sc) => `<tr><td colspan="${anos.length + 1}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${esc(sc.titulo)}</td></tr>
      ${sc.linhas.map((l) => `<tr class="${l.estilo === "total" ? "total" : ""}"><td style="padding-left:20px">${esc(l.nome)}${icPop(l)}</td>${anos.map((y) => `<td class="${l.valores[y] < -0.5 ? "pos" : ""}">${(sc.dias || /^d_|ciclo/.test(l.id)) ? (l.valores[y] === null ? "–" : num(l.valores[y], 1)) : f(l.valores[y])}</td>`).join("")}</tr>`).join("")}`).join("")}
  </tbody></table></div>`;
}

function htmlFluxo() {
  const d = estado.fluxo;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  const dis = trava() ? "disabled" : "";
  const aviso = trava() ? `<div class="card"><strong>Versão aprovada e travada.</strong> Para ajustar durante o ano, crie um Reprojetado na tela <em>Orçamentos</em>.</div>` : "";
  if (!d.estrutura) {
    return `${aviso}<div class="card"><h2>Fluxo de caixa</h2><p class="dim">O fluxo de caixa usa as contas do balanço. Importe a estrutura do Fechamento Contábil na tela <a href="#" data-modulo="dre">DRE</a> (botão "Importar do Fechamento Contábil").</p></div>`;
  }
  const avisos = d.avisos.length ? `<div class="card"><strong>Atenção</strong><ul>${d.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "";
  const corpo = `<div class="card"><h2>Fluxo de caixa indireto</h2>${tabelaSecoes(d.anos, d.indireto)}</div>`;       // só o indireto; o caixa e a dívida de giro ficam em Premissas de dívidas
  return `${aviso}${avisos}${corpo}`;
}

function htmlUsosFontes() {
  const d = estado.usosFontes;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  if (!d.estrutura) return `<div class="card"><h2>Usos e fontes</h2><p class="dim">Importe a estrutura do Fechamento Contábil na tela <a href="#" data-modulo="dre">DRE</a> para calcular os usos e fontes.</p></div>`;
  const util = (lista) => lista.filter((l) => l.estilo === "total" || Object.values(l.valores).some((v) => Math.abs(v) >= 0.5));
  const bloco = (titulo, lista) => `<tr><td colspan="${d.anos.length + 1}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${titulo}</td></tr>
    ${util(lista).map((l) => `<tr class="${l.estilo === "total" ? "total" : ""}"><td style="padding-left:20px">${esc(l.nome)}${icPop(l)}</td>${d.anos.map((y) => `<td>${fmtNum0(l.valores[y])}</td>`).join("")}</tr>`).join("")}`;
  return `<div class="card"><h2>Usos e fontes</h2>
    
    <div class="scroll"><table><thead><tr><th>Linha</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
      ${bloco("Fontes", d.fontes)}${bloco("Usos", d.usos)}
      <tr><td>${esc(d.verificacao.nome)}${icPop(d.verificacao)}</td>${d.anos.map((y) => `<td>${num(d.verificacao.valores[y], 2) === "0,00" || num(d.verificacao.valores[y], 2) === "-0,00" ? "0" : num(d.verificacao.valores[y], 2)}</td>`).join("")}</tr>
    </tbody></table></div></div>`;
}

// gráfico de linhas em SVG: o indicador (base) e o limite
function svgIndicador(anosReal, anosProj, i, grande = false) {
  const anos = [...anosReal, ...anosProj];                                   // anos fechados (realizado) e depois os do orçamento
  const Z = grande ? 2.4 : 1;                                                // tamanho: o gráfico expandido tem a mesma proporção, com letras e pontos maiores
  const W = 360 * Z, H = 190 * Z, mx = 38 * Z, my = 22 * Z;
  const base = anos.map((y) => (anosProj.includes(y) ? i.valores[y] : null)), meta = anos.map((y) => (anosProj.includes(y) ? i.meta[y] : null));
  const real = anos.map((y) => (anosReal.includes(y) ? (i.realizado || {})[y] : null));
  const todos = [...base, ...meta, ...real].filter((v) => v !== null && v !== undefined && isFinite(v));
  if (!todos.length) return `<div class="vazio dim" style="padding:60px 0">Sem dados</div>`;
  let lo = Math.min(...todos, 0), hi = Math.max(...todos);
  if (hi === lo) hi = lo + 1;
  const x = (k) => mx + (anos.length === 1 ? (W - 2 * mx) / 2 : (k * (W - 2 * mx)) / (anos.length - 1));
  const y = (v) => H - my - ((v - lo) / (hi - lo)) * (H - 2 * my);
  const fmt = (v) => (i.percentual ? num(v * 100, i.casas) + "%" : num(v, i.casas));
  const linha = (serie, cor, tracejado) => {
    const pts = serie.map((v, k) => (v === null || v === undefined || !isFinite(v) ? null : [x(k), y(v)]));
    const trechos = []; let atual = [];
    pts.forEach((p) => { if (p) atual.push(p); else { if (atual.length) trechos.push(atual); atual = []; } }); if (atual.length) trechos.push(atual);
    return trechos.map((t) => `<polyline fill="none" stroke="${cor}" stroke-width="${2.2 * (grande ? 1.6 : 1)}" ${tracejado ? 'stroke-dasharray="6 4"' : ""} points="${t.map((p) => p.join(",")).join(" ")}"/>`).join("")
      + (tracejado ? "" : pts.filter(Boolean).map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${3.2 * (grande ? 1.6 : 1)}" fill="${cor}"/>`).join(""));
  };
  const rot = anos.map((a, k) => `<text x="${x(k)}" y="${H - 6 * Z}" font-size="${10 * (grande ? 1.7 : 1)}" text-anchor="middle" fill="var(--suave)">${String(a).slice(-2)}</text>`).join("");
  const eixo = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${mx}" x2="${W - mx + 6 * Z}" y1="${y(v)}" y2="${y(v)}" stroke="var(--borda)" stroke-width="1"/><text x="${mx - 4 * Z}" y="${y(v) + 3 * Z}" font-size="${9.5 * (grande ? 1.7 : 1)}" text-anchor="end" fill="var(--suave)">${fmt(v)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(i.nome)}">${eixo}${linha(meta, "var(--coral)", true)}${linha(real, "var(--azul)", false)}${linha(base, "var(--verde-vivo)", false)}${rot}</svg>`;
}

function htmlIndicadores() {
  const d = estado.indic;
  if (!d) return `<div class="card vazio">Nenhum orçamento ainda. Crie um em <strong>Novo orçamento</strong>.</div>`;
  if (!d.estrutura) return `<div class="card"><h2>Indicadores</h2><p class="dim">Importe a estrutura do Fechamento Contábil na tela <a href="#" data-modulo="dre">DRE</a> para calcular os indicadores.</p></div>`;
  const dis = trava() ? "disabled" : "";
  const aba = estado.indAba;
  const nav = `<nav class="abas" id="abas-ind"><button class="${aba === "tabela" ? "ativa" : ""}" data-ind-aba="tabela">Resumo dos índices</button><button class="${aba === "graficos" ? "ativa" : ""}" data-ind-aba="graficos">Gráficos</button></nav>`;
  const fmt = (i, v) => (v === null || v === undefined || !isFinite(v) ? "n/d" : i.percentual ? num(v * 100, i.casas) + "%" : num(v, i.casas));
  const celBase = (i, y) => { const ok = i.atende[y]; return `<td class="${ok === true ? "neg" : ok === false ? "pos" : ""}" style="font-weight:600">${i.codigo === "equilibrio" ? fmtNum0(i.valores[y]) : fmt(i, i.valores[y])}${ok === true ? " ✓" : ok === false ? " ✗" : ""}</td>`; };
  const real = d.anos_realizados || [];
  const celReal = (i, y) => `<td class="cg-real">${i.realizado && i.realizado[y] !== undefined ? (i.codigo === "equilibrio" ? fmtNum0(i.realizado[y]) : fmt(i, i.realizado[y])) : "n/d"}</td>`;
  const bloco = (i) => `<tr><td colspan="${real.length + d.anos.length + 2}" style="background:var(--verde-claro);color:var(--verde);font-weight:600">${esc(i.nome)}</td></tr>
    <tr><td style="padding-left:20px">Base (realizado e projetado)</td>${real.map((y) => celReal(i, y)).join("")}${d.anos.map((y) => celBase(i, y)).join("")}<td></td></tr>
    <tr><td style="padding-left:20px">${i.codigo === "equilibrio" ? "Faturamento mínimo" : i.sentido === "min" ? "Limite mínimo" : "Limite máximo"}</td>
      ${real.map(() => "<td class=\"cg-real\"></td>").join("")}${d.anos.map((y) => (i.meta_editavel ? `<td><input type="number" step="any" min="0" ${dis} data-meta="${i.codigo}" data-ano="${y}" ${i.percentual ? "data-pct" : ""} value="${i.meta[y] === null || i.meta[y] === undefined ? "" : i.percentual ? Math.round(i.meta[y] * 1000) / 10 : i.meta[y]}" style="width:80px">${i.percentual ? " %" : ""}</td>` : `<td>${fmtNum0(i.meta[y])}</td>`)).join("")}
      <td>${i.meta_editavel && !trava() ? `<select id="rind-${i.codigo}">${d.anos.map((y) => `<option>${y}</option>`).join("")}</select> <button class="sec" data-ind-replicar="${i.codigo}">Replicar →</button>` : ""}</td></tr>`;
  const e = d.endividamento;
  const dividas = `<div class="card"><h2>Composição do endividamento</h2><div class="scroll"><table><thead><tr><th>Linha</th>${d.anos.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>
    ${e.map((l) => `<tr class="${l.estilo === "total" ? "total" : ""}"><td style="padding-left:20px">${esc(l.nome)}${icPop(l)}</td>${d.anos.map((y) => `<td>${/^p_|custo/.test(l.id) ? num(l.valores[y] * 100, 1) + "%" : fmtNum0(l.valores[y])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  let corpo;
  if (aba === "graficos") {
    corpo = `<div class="card"><h2>Gráficos dos indicadores</h2><p class="dim">A linha azul é o indicador **realizado** (anos fechados; o último ponto pode ser de um ano em andamento, só com os meses já fechados), a linha verde é o projetado e a linha tracejada, o limite (mínimo ou máximo). Vazios aparecem onde o indicador não se aplica (por exemplo, EBITDA negativo).</p>
      <div class="graficos-grade">${d.indicadores.map((i) => `<div class="grafico"><div class="grafico-titulo"><span>${esc(i.nome)}</span><button class="btn-expandir" data-ind-expandir="${i.codigo}" title="Expandir o gráfico" aria-label="Expandir o gráfico">${icone("expandir", 16)}</button></div>${svgIndicador(d.anos_realizados || [], d.anos, i)}</div>`).join("")}</div></div>`;
  } else {
    corpo = `<div class="card"><h2>Resumo dos índices</h2>
      <div class="scroll"><table><thead><tr><th>Indicador</th>${real.map((y) => `<th class="cg-real">${y}<br><small>${(d.meses_realizados || {})[y] ? `realizado · ${d.meses_realizados[y]}` : "realizado"}</small></th>`).join("")}${d.anos.map((y) => `<th>${y}</th>`).join("")}<th></th></tr></thead><tbody>${d.indicadores.map(bloco).join("")}</tbody></table></div></div>${dividas}`;
  }
  return `${nav}${corpo}`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  const t = e.target;
  if ((estado.modulo === "fluxo" || estado.modulo === "dividas") && t.dataset.fx !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/fluxo-caixa/${t.dataset.fx}/${t.dataset.ano}`, { valor: Number(t.value || 0) }); await recarregar(); });
  } else if (estado.modulo === "indicadores" && t.dataset.meta !== undefined) {
    seguro(async () => { await api("PUT", `/api/versoes/${estado.vid}/indicadores/${t.dataset.meta}/${t.dataset.ano}`, { valor: Number(t.value || 0) / (t.dataset.pct !== undefined ? 100 : 1) }); await recarregar(); });
  }
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (estado.modulo === "fluxo" && t.dataset.fluxoAba) { estado.fluxoAba = t.dataset.fluxoAba; desenhar(); return; }
  if (estado.modulo === "indicadores" && t.dataset.indAba) { estado.indAba = t.dataset.indAba; desenhar(); return; }
  if (estado.modulo === "indicadores" && t.dataset.indExpandir) { expandirIndicador(t.dataset.indExpandir); return; }
  if ((estado.modulo === "fluxo" || estado.modulo === "dividas") && t.dataset.fxReplicar) {
    seguro(async () => {
      const campo = t.dataset.fxReplicar, ano = Number(document.getElementById(`rfx-${campo}`).value);
      if (!await confirmar(`Copiar o valor de ${ano} para os anos seguintes? Os valores já escolhidos nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/fluxo-caixa/${campo}/replicar`, { ano }); await recarregar(); mostrar("Valor replicado.", true);
    });
  } else if (estado.modulo === "indicadores" && t.dataset.indReplicar) {
    seguro(async () => {
      const cod = t.dataset.indReplicar, ano = Number(document.getElementById(`rind-${cod}`).value);
      if (!await confirmar(`Copiar o limite de ${ano} para os anos seguintes? Os valores já digitados nesses anos serão substituídos.`)) return;
      await api("POST", `/api/versoes/${estado.vid}/indicadores/${cod}/replicar`, { ano }); await recarregar(); mostrar("Limite replicado.", true);
    });
  }
});

// gráfico do indicador em janela grande (Esc, ✕ ou clique fora fecham)
function expandirIndicador(codigo) {
  const d = estado.indic, i = d && d.indicadores.find((x) => x.codigo === codigo);
  if (!i || document.getElementById("modal-graf")) return;
  const m = document.createElement("div");
  m.id = "modal-graf"; m.className = "orc-overlay";
  m.innerHTML = `<div class="orc-caixa orc-grafico" role="dialog" aria-modal="true" aria-label="${esc(i.nome)}">
    <header class="orc-cab"><span class="orc-icone">${icone("alvo", 22)}</span><div><h2>${esc(i.nome)}</h2>
      <p><span class="leg azul"></span> realizado &nbsp; <span class="leg verde"></span> projetado &nbsp; <span class="leg coral"></span> limite</p></div>
      <button class="orc-x" data-graf="fechar" aria-label="Fechar">✕</button></header>
    <div class="orc-corpo">${svgIndicador(d.anos_realizados || [], d.anos, i, true)}</div></div>`;
  document.body.appendChild(m);
  const fechar = () => { m.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => { if (e.key === "Escape") fechar(); };
  document.addEventListener("keydown", esc_);
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest('[data-graf="fechar"]')) fechar(); });
}
