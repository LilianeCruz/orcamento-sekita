"use strict";
// ---------------------------------------------------------------- Orçamentos: cadastro das versões (criar, abrir, criar Reprojetado, aprovar e travar)
function periodoOrcamento(v) {
  const dt = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "");
  if (v.data_inicio && v.data_fim) return `${dt(v.data_inicio)} a ${dt(v.data_fim)}`;
  return `${v.ano_base} a ${v.ano_base + (v.horizonte || 5) - 1}`;
}

const btnAcao = (attrs, titulo, ic, extra = "") => `<button class="btn-acao${extra}" ${attrs} title="${titulo}" aria-label="${titulo}">${icone(ic, 18)}</button>`;

function htmlOrcamentos() {
  const lista = estado.versoes || [];
  const nome = (id) => { const o = lista.find((x) => x.id === id); return o ? o.nome : "–"; };
  const dt = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "–");
  const sel = estado.orcSel;                                        // null = fora do modo comparar; lista de ids = escolhendo orçamentos
  const linhas = lista.map((v) => {
    const aprovado = v.status === "aprovado";
    return `<tr class="${v.id === estado.vid ? "faixa-verde" : ""}">
      ${sel ? `<td class="sel"><input type="checkbox" data-orc-sel="${v.id}" ${sel.includes(v.id) ? "checked" : ""} aria-label="Selecionar ${esc(v.nome)}"></td>` : ""}
      <td><strong>${esc(v.nome)}</strong> <span class="chip${aprovado ? " arr" : ""}">${aprovado ? "Aprovado · travado" : "Em elaboração"}</span>${v.origem_id ? `<div class="dim peq-txt">a partir de ${esc(nome(v.origem_id))}</div>` : ""}</td>
      <td>${esc(periodoOrcamento(v))}</td>
      <td>${dt(v.criado_em)}${aprovado && v.aprovado_em ? `<div class="dim peq-txt">aprovado em ${dt(v.aprovado_em)}</div>` : ""}</td>
      <td class="acoes">${btnAcao(`data-orc-abrir="${v.id}"`, "Abrir", "olho")}
        ${aprovado ? "" : btnAcao(`data-orc-editar="${v.id}"`, "Editar nome e período", "editar")}
        ${btnAcao(`data-orc-reprojetar="${v.id}"`, "Criar Reprojetado", "copiar")}
        ${btnAcao(`data-orc-imprimir="${v.id}"`, "Imprimir orçamento", "impressora")}
        ${aprovado ? "" : btnAcao(`data-orc-aprovar="${v.id}"`, "Aprovar e travar", "ok", " ok")}</td></tr>`;
  }).join("");
  return `<div class="card">${cabecaCartaoGrande("orcamento", "Orçamentos", "", `${sel ? `<button class="link" id="btn-orc-cancelar-cmp">Cancelar</button>` : ""}
      ${lista.length > 1 ? (sel && sel.length ? `<button class="prim" id="btn-orc-imprimir" ${sel.length < 2 ? "disabled" : ""}>${icone("baixar", 16)} Imprimir</button>` : `<button class="sec" id="btn-orc-comparar">${icone("trocas", 16)} ${sel ? "Escolha os orçamentos" : "Comparar orçamentos"}</button>`) : ""}
      <button class="prim" id="btn-novo-topo">${icone("plus", 16)} Novo orçamento</button>`)}
    ${lista.length ? `<div class="scroll"><table class="grade orc-tab"><thead><tr>${sel ? "<th class=\"sel\"></th>" : ""}<th>Orçamento</th><th>Período</th><th>Criado em</th><th class="acoes">Ações</th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : `<div class="vazio-pontilhado">${icone("orcamento", 34)}<p>Nenhum orçamento criado.</p></div>`}</div>`;
}

document.querySelector("#conteudo").addEventListener("change", (e) => {
  if (estado.modulo !== "orcamentos" || !e.target.dataset.orcSel) return;
  const id = Number(e.target.dataset.orcSel);
  estado.orcSel = e.target.checked ? [...estado.orcSel, id] : estado.orcSel.filter((x) => x !== id);
  desenhar();
});

document.querySelector("#conteudo").addEventListener("click", (e) => {
  if (estado.modulo !== "orcamentos") return;
  const t = e.target.closest("button");
  if (!t) return;
  seguro(async () => {
    if (t.id === "btn-orc-comparar") { estado.orcSel = []; desenhar(); }
    else if (t.id === "btn-orc-cancelar-cmp") { estado.orcSel = null; desenhar(); }
    else if (t.id === "btn-orc-imprimir") await abrirImprimirComparacao(estado.orcSel);
    else if (t.dataset.orcImprimir) await abrirImprimirOrcamento(Number(t.dataset.orcImprimir));
    else if (t.dataset.orcEditar) abrirEditarOrcamento(estado.versoes.find((x) => x.id === Number(t.dataset.orcEditar)));
    else if (t.dataset.orcAbrir) {
      estado.vid = Number(t.dataset.orcAbrir); await recarregar();
      mostrar("Orçamento aberto.", true);
    } else if (t.dataset.orcReprojetar) {
      const v = estado.versoes.find((x) => x.id === Number(t.dataset.orcReprojetar));
      const nome = await dialogo({ titulo: "Criar Reprojetado", texto: `Cria uma cópia de "${v.nome}" para ser revisada. O original não é alterado.`,
        campo: "Nome do Reprojetado", valor: `Reprojetado ${v.ano_base}`, confirmar: "Criar Reprojetado" });
      if (!nome) return;
      const r = await api("POST", `/api/versoes/${v.id}/copiar`, { nome, tipo: "reprojetado" });
      await carregarVersoes(r.id); await recarregar();
      mostrar("Reprojetado criado. O original não foi alterado.", true);
    } else if (t.dataset.orcAprovar) {
      const v = estado.versoes.find((x) => x.id === Number(t.dataset.orcAprovar));
      if (!await dialogo({ titulo: "Aprovar e travar?", texto: `Depois de aprovado, "${v.nome}" não poderá mais ser editado.`, confirmar: "Aprovar e travar" })) return;
      await api("POST", `/api/versoes/${v.id}/aprovar`);
      await recarregar(); mostrar("Orçamento aprovado e travado.", true);
    }
  });
});
