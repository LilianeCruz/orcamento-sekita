// Orçado × realizado do mesmo período. Porte de app/servicos/orcado_realizado.py.
// O realizado vem de um período do ano em andamento (ex.: janeiro a junho) e o orçamento é anual. Duas leituras: DRE (orçado do ano × meses do período ÷ 12) e produtos
// (preço médio e custo unitário realizados, com a diferença de resultado separada em efeitos de volume, preço e custo), mais a ponte do lucro.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, obterVersao } from "./base.mts";
import { fixo, fmt0 } from "./comum.mts";
import * as balanco from "./balanco.mts";
import * as dre from "./dre.mts";
import * as real from "./realizado.mts";
import { calcularResultado } from "./resultado.mts";

const FORMULAS_PCT: Record<string, [string, string]> = { DS028: ["DS027", "DS018"], DS045: ["DS044", "DS018"], DS049: ["DS048", "DS018"], DS063: ["DS062", "DS018"] };
// linhas que somam o lucro líquido (todas as outras da DRE são subtotais ou detalhes delas)
const PONTE: [string, string][] = [["DS007", "Receita bruta (demais)"], ["DS015", "Deduções da receita"], ["DS020", "Custo do produto vendido (demais)"], ["DS030", "Outras despesas operacionais"],
  ["DS047", "Depreciação"], ["DS051", "Resultado financeiro"], ["DS054", "Outras receitas não operacionais"], ["DS060", "CSLL e IRPJ"]];
const PAI_REC_CULTURA = "DS008", PAI_CPV_CULTURA = "DS020";

const norm = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const g = (serie: any, ano: number): number => { const v = serie?.[ano]; return v !== undefined && v !== null ? Number(v) : 0; };

// O orçamento precisa cobrir o ano do realizado; senão os períodos não são comparáveis.
function validarPeriodo(v: any, p: any) {
  const anos = anosDaVersao(v);
  if (!anos.includes(p.ano)) throw Invalido(`Períodos diferentes: o orçamento '${v.nome}' cobre ${anos[0]} a ${anos[anos.length - 1]} e o realizado escolhido é de ${p.ano}. Escolha um orçamento que tenha o ano ${p.ano}.`);
}

export async function comparar(bd: Bd, versaoId: number, ano: number) {
  const p: any = await real.periodoDoAno(bd, ano);
  if (!p || !Object.keys(p.DRE).length) throw Invalido(`Não há DRE realizada importada de ${ano}. Suba o arquivo na tela Realizado (aba Importações).`);
  const v = await obterVersao(bd, versaoId);
  validarPeriodo(v, p);
  const vid = v.id;
  ano = p.ano;
  const dur = p.meses - p.mes_inicio + 1;
  const f = dur / 12;
  const periodo = real.rotuloPeriodo(p.mes_inicio, p.meses);
  const cab = { versao: { id: vid, nome: v.nome, status: v.status, tipo: v.tipo, ano_base: v.ano_base, horizonte: v.horizonte }, ano, periodo, meses: dur, fracao: f, parcial: dur < 12 || p.meses < 12, arquivo: p.arquivo ?? "" };

  // ---- DRE
  const d: any = await dre.ler(bd, vid);
  const rl: Record<string, number> = p.DRE;
  const orc: Record<string, number> = Object.fromEntries(d.linhas.map((l: any) => [l.codigo, g(l.valores, ano)]));
  const linhas: any[] = [];
  for (const l of d.linhas) {
    const cod = l.codigo;
    if (l.unidade === "%") {
      const [num, den] = FORMULAS_PCT[cod] ?? [null, null];
      const r = num !== null && num in rl && den! in rl && rl[den!] ? (rl[num] / rl[den!]) * 100 : null;
      linhas.push({ codigo: cod, nome: l.nome, nivel: l.nivel, unidade: "%", orcado_ano: orc[cod], orcado_periodo: orc[cod], realizado: r, dif: r !== null ? r - orc[cod] : null, dif_pct: null, falta: null });
      continue;
    }
    const oAno = orc[cod], oPer = oAno * f;
    const r = rl[cod] ?? null;
    if (!oAno && !r) continue;
    const dif = r !== null ? r - oPer : null;
    linhas.push({ codigo: cod, nome: l.nome, nivel: l.nivel, unidade: "R$ mil", orcado_ano: oAno, orcado_periodo: oPer, realizado: r, dif, dif_pct: dif !== null && oPer ? (dif / Math.abs(oPer)) * 100 : null, falta: r !== null ? oAno - r : null });
  }

  // ---- produtos (preço médio e efeitos)
  const quant = new Map((await bd.q("SELECT cultura_id, quantidade FROM realizado_quantidades WHERE ano=?", [ano])).map((x) => [x.cultura_id as number, x.quantidade as number]));
  const porNome = new Map<string, string>();
  for (const e of await bd.q("SELECT codigo, nome, pai FROM dre_linhas WHERE nivel='sintetica' AND ativa=1")) porNome.set(`${e.pai}|${norm(e.nome)}`, e.codigo);
  const res: any = await calcularResultado(bd, vid);
  const produtos: any[] = [];
  const ef = { volume: 0, preco: 0, custo: 0 };
  let rbProdDiff = 0, cpvProdDiff = 0;
  for (const c of res.culturas) {
    const serie: Record<string, any> = Object.fromEntries(c.anual.map((l: any) => [l.id, l.valores]));
    const qO = g(serie.comercializada, ano);
    const rbO = g(serie.receita_bruta_anual, ano), cpvO = -g(serie.cpv, ano);
    const qR = quant.has(c.id) ? quant.get(c.id)! : null;
    const [u] = await bd.q("SELECT unidade FROM culturas WHERE id=?", [c.id]);
    const un = u ? u.unidade : "";
    if (!qO && !qR) continue;
    const rec = porNome.get(`${PAI_REC_CULTURA}|${norm(c.nome)}`), cus = porNome.get(`${PAI_CPV_CULTURA}|${norm(c.nome)}`);
    const revR: number | null = rec ? rl[rec] ?? null : null;
    const cpvR: number | null = cus && cus in rl ? -rl[cus] : null;
    const qP = qO * f;
    const row: any = { id: c.id, nome: c.nome, unidade: un, qtd_orcada: qO, qtd_periodo_orcada: qP, qtd_real: qR, pct_ano: qR !== null && qO ? (qR / qO) * 100 : null, falta_qtd: qR !== null ? qO - qR : null,
      preco_orcado: qO ? (rbO * 1000) / qO : null, custo_orcado: qO ? (cpvO * 1000) / qO : null, receita_real: revR, custo_real: cpvR, preco_real: null, custo_unit_real: null, efeitos: null, motivo: "" };
    if (qR && revR !== null && cpvR !== null && qO) {
      const pO = row.preco_orcado, cO = row.custo_orcado;
      const pR = (revR * 1000) / qR, cR = (cpvR * 1000) / qR;
      const eVol = ((qR - qP) * (pO - cO)) / 1000, ePre = (qR * (pR - pO)) / 1000, eCus = (-qR * (cR - cO)) / 1000;
      Object.assign(row, { preco_real: pR, custo_unit_real: cR, efeitos: { volume: eVol, preco: ePre, custo: eCus }, margem_orcada_periodo: (qP * (pO - cO)) / 1000, margem_real: revR - cpvR, margem_orcada_qtd_real: (qR * (pO - cO)) / 1000 });
      ef.volume += eVol; ef.preco += ePre; ef.custo += eCus;
      rbProdDiff += revR - f * rbO;
      cpvProdDiff += -cpvR + f * cpvO;
      let maior: [string, number] = ["volume", eVol];
      for (const kv of [["preco", ePre], ["custo", eCus]] as [string, number][]) if (Math.abs(kv[1]) > Math.abs(maior[1])) maior = kv;
      row.motivo = ({ volume: "quantidade vendida", preco: "preço médio", custo: "custo por unidade" } as Record<string, string>)[maior[0]];
    } else if (qR && (revR === null || cpvR === null)) row.motivo = "sem receita e custo próprios do produto no realizado (só o total do grupo)";
    produtos.push(row);
  }

  // ---- ponte do lucro
  const lucroO = PONTE.reduce((t, [cod]) => t + (orc[cod] ?? 0), 0) * f;
  const lucroR = PONTE.reduce((t, [cod]) => t + (rl[cod] ?? 0), 0);
  const itens: [string, number][] = [];
  if (produtos.length && produtos.some((x) => x.efeitos)) itens.push(["Produtos · quantidade vendida", ef.volume], ["Produtos · preço médio de venda", ef.preco], ["Produtos · custo por unidade", ef.custo]);
  for (const [cod, nome] of PONTE) {
    let dif = (rl[cod] ?? 0) - (orc[cod] ?? 0) * f;
    if (cod === "DS007") dif -= rbProdDiff;
    else if (cod === "DS020") dif -= cpvProdDiff;
    itens.push([nome, dif]);
  }
  const ponte = { orcado: lucroO, realizado: lucroR, itens: itens.filter(([, x]) => Math.abs(x) > 0.05).map(([n, x]) => ({ nome: n, valor: x })), soma: lucroO + itens.reduce((t, [, x]) => t + x, 0) };

  // ---- balanço (data final do período × 31/12 do orçamento)
  const b: any = await balanco.ler(bd, vid);
  const bal: any[] = [];
  for (const l of b.linhas) {
    if (l.calculo === "diferenca") continue;
    const o = g(l.valores, ano), r = p.BP[l.codigo] ?? null;
    if (!o && !r) continue;
    bal.push({ codigo: l.codigo, nome: l.nome, nivel: l.nivel, orcado_ano: o, realizado: r, dif: r !== null ? r - o : null });
  }
  return { ...cab, dre: linhas, produtos, ponte, balanco: bal, resumo: resumo(cab, orc, rl, f, produtos, ponte) };
}

function resumo(cab: any, orc: Record<string, number>, rl: Record<string, number>, f: number, produtos: any[], ponte: any): string[] {
  const mi = (x: number) => "R$ " + fmt0(Math.abs(x)).replace(/,/g, ".") + " mil";
  const out: string[] = [];
  const rbO = orc.DS007 ?? 0, rbR = rl.DS007 ?? null;
  if (rbR !== null && rbO)
    out.push(`Receita bruta: você realizou ${mi(rbR)} em ${cab.periodo} (${fixo((rbR / rbO) * 100, 0)}% do orçado do ano, de ${mi(rbO)}). O período representa ${fixo(f * 100, 0)}% do ano, então `
      + (rbR / rbO < f - 0.005 ? "o ritmo está abaixo do orçado." : "o ritmo está dentro ou acima do orçado.") + ` Faltam ${mi(Math.max(rbO - rbR, 0))} para o orçado do ano.`);
  const lo = ponte.orcado, lr = ponte.realizado;
  const sinal = lr >= lo ? "acima" : "abaixo";
  out.push(`Lucro líquido: o realizado do período foi ${lr < 0 ? "-" : ""}${mi(lr)}, ${mi(lr - lo)} ${sinal} do orçado proporcional ao período (${lo < 0 ? "-" : ""}${mi(lo)}).`);
  const maiores = [...ponte.itens].sort((a: any, b: any) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 3);
  if (maiores.length) out.push("Principais motivos: " + maiores.map((x: any) => `${x.nome.toLowerCase()} (${x.valor > 0 ? "+" : "-"}${mi(x.valor)})`).join("; ") + ".");
  for (const x of produtos) {
    if (x.qtd_real !== null && x.qtd_orcada) {
      const falta = Math.max(x.qtd_orcada - x.qtd_real, 0);
      let txt = `${x.nome}: vendeu ${fmt0(x.qtd_real)} ${x.unidade} de ${fmt0(x.qtd_orcada)} orçados no ano (${fixo(x.pct_ano, 0)}%); faltam ${fmt0(falta)}.`.replace(/,/g, ".");
      if (x.preco_real !== null) txt += ` Preço médio R$ ${fixo(x.preco_real, 2).replace(".", ",")}/${x.unidade} (orçado R$ ${fixo(x.preco_orcado, 2).replace(".", ",")}).`;
      out.push(txt);
    }
  }
  return out;
}
