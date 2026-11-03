// Capital de giro: mesma lógica da aba "Capital de Giro" da planilha de orçamento, com todos os prazos DIGITÁVEIS por ano.
// Porte de app/servicos/capital_giro.py. Base: Receita líquida e CPV da DRE (se a estrutura da DRE ainda não foi importada, usa o
// consolidado do Resultado por produto). Dias no ano = os dias reais do ano se não for informado.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel, type Versao } from "./base.mts";
import { fixo, redondo, fmt0 } from "./comum.mts";
import * as dre from "./dre.mts";
import * as real from "./realizado.mts";
import { diasDoAno } from "./realizado.mts";
import { calcularResultado } from "./resultado.mts";

type Serie = Record<number, number>;

// campo -> (rótulo, unidade, grupo)
export const CAMPOS: Record<string, [string, string, string]> = {
  dias_ano: ["Dias no ano", "dias", "geral"],
  dias_receber: ["Contas a receber - Clientes", "dias de receita", "ativo"],
  dias_rotacao: ["Rotação de cultura a apropriar", "dias de CPV", "ativo"],
  dias_preparo: ["Preparo de solo e despesas a apropriar", "dias de CPV", "ativo"],
  dias_insumos: ["Estoque de insumos", "dias de CPV", "ativo"],
  dias_lavoura: ["Lavoura em formação", "dias de CPV", "ativo"],
  dias_fornecedores: ["Contas a pagar - Fornecedores", "dias de CPV", "passivo"],
  dias_outras: ["Outras obrigações", "dias de CPV", "passivo"],
  dias_trabalhistas: ["Obrigações trabalhistas", "dias de CPV", "passivo"],
  dias_impostos: ["Impostos a pagar", "dias de deduções da receita", "passivo"],
  saldo_outros_creditos: ["Outros créditos a receber", "R$ mil", "saldo"],
  saldo_realizavel: ["Realizável a longo prazo", "R$ mil", "saldo"],
  saldo_participacoes: ["Investimentos em participações societárias", "R$ mil", "saldo"],
  saldo_intangivel: ["Intangível - marcas e patentes", "R$ mil", "saldo"],
  saldo_consorcios_curto: ["Consórcios a vencer (curto prazo)", "R$ mil", "saldo"],
  saldo_consorcios_longo: ["Consórcios a vencer (longo prazo)", "R$ mil", "saldo"],
  saldo_outras_lp: ["Outras obrigações de longo prazo", "R$ mil", "saldo"],
  saldo_caixa: ["Caixa mínimo (disponibilidades)", "R$ mil", "caixa"],
  pct_caixa: ["Caixa mínimo", "% do custo de produção", "caixa"],
};
// prazos que o botão "atualizar prazos médios" calcula do último balanço realizado
export const CAMPOS_ATUALIZAVEIS = ["dias_receber", "dias_rotacao", "dias_preparo", "dias_insumos", "dias_lavoura", "dias_fornecedores", "dias_outras", "dias_trabalhistas",
  "dias_impostos", "saldo_outros_creditos", "saldo_realizavel", "saldo_participacoes", "saldo_intangivel", "saldo_consorcios_curto", "saldo_consorcios_longo", "saldo_outras_lp", "saldo_caixa"];
// contas sem prazo médio: o saldo de cada ano é digitado ou vem da média dos saldos dos anos fechados (campo, id na projeção)
const CAMPOS_SALDO: [string, string][] = Object.keys(CAMPOS).filter((c) => c.startsWith("saldo_") && CAMPOS[c][2] === "saldo").map((c) => [c, c.replace("saldo_", "")]);
const BASE_NOME: Record<string, string> = { RL: "receita líquida", CPV: "custo do produto vendido", DED: "deduções da receita" };

async function valoresDe(bd: Bd, vid: number): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = {};
  for (const r of await bd.q("SELECT campo, ano, valor FROM capital_giro WHERE versao_id=?", [vid])) (d[r.campo] ??= {})[r.ano] = r.valor;
  return d;
}

// (receita líquida, CPV positivo, estoque de produtos acabados, origem, deduções da receita positivas) em R$ mil, por ano.
export async function base(bd: Bd, vid: number, anos: number[]): Promise<[Serie, Serie, Serie, string, Serie]> {
  const res: any = await calcularResultado(bd, vid);
  const linha = (bloco: string, id: string) => (res.consolidado[bloco] ?? []).find((l: any) => l.id === id) ?? null;
  const est = linha("estoque", "estoque_valor");
  const estoque: Serie = Object.fromEntries(anos.map((a) => [a, est ? est.valores[a] ?? 0 : 0]));
  const d: any = await dre.ler(bd, vid, {});                                // as bases (receita, CPV, deduções) não dependem dos juros
  if (d.linhas.length) {
    const por: Record<string, Serie> = Object.fromEntries(d.linhas.map((l: any) => [l.codigo, l.valores]));
    const rec = Object.fromEntries(anos.map((a) => [a, "DS018" in por ? por.DS018[a] : 0]));
    const cpv = Object.fromEntries(anos.map((a) => [a, "DS020" in por ? -por.DS020[a] : 0]));
    const ded = Object.fromEntries(anos.map((a) => [a, "DS015" in por ? -por.DS015[a] : 0]));
    return [rec, cpv, estoque, "DRE", ded];
  }
  const rl = linha("anual", "receita_liquida_anual"), cp = linha("anual", "cpv"), dd = linha("anual", "deducoes_anual");
  const pega = (l: any, a: number) => (l ? l.valores[a] ?? 0 : 0);
  return [Object.fromEntries(anos.map((a) => [a, pega(rl, a)])), Object.fromEntries(anos.map((a) => [a, -pega(cp, a)])), estoque, "Resultado por produto", Object.fromEntries(anos.map((a) => [a, -pega(dd, a)]))];
}

export async function ler(bd: Bd, vid: number): Promise<any> {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const val = await valoresDe(bd, vid);
  const rz = await real.prazos(bd);
  const anoReal = await real.ultimoAno(bd);
  const marcas: Record<string, Record<number, number>> = {}, marcasAnos: Record<string, Record<number, number[]>> = {};
  for (const r of await bd.q("SELECT campo, ano, ano_realizado, anos FROM capital_giro_origem WHERE versao_id=? ORDER BY campo, ano", [vid])) {
    (marcas[r.campo] ??= {})[r.ano] = r.ano_realizado;
    const lista = String(r.anos).split(",").filter(Boolean).map(Number);
    (marcasAnos[r.campo] ??= {})[r.ano] = lista.length ? lista : [r.ano_realizado];
  }
  const entrada = (campo: string): Serie => Object.fromEntries(anos.map((a) => [a, val[campo]?.[a] ?? 0]));
  const padrao: Serie = Object.fromEntries(anos.map((a) => [a, diasDoAno(a)]));
  const diasAno: Serie = Object.fromEntries(anos.map((a) => [a, val.dias_ano?.[a] || padrao[a]]));
  const [rec, cpv, estoquePa, origem, ded] = await base(bd, vid, anos);
  const porDias = (b: Serie, campo: string): Serie => { const d = entrada(campo); return Object.fromEntries(anos.map((a) => [a, (b[a] * d[a]) / diasAno[a]])); };
  const receber = porDias(rec, "dias_receber"), rotacao = porDias(cpv, "dias_rotacao"), preparo = porDias(cpv, "dias_preparo");
  const saldos: Record<string, Serie> = Object.fromEntries(CAMPOS_SALDO.map(([c, i]) => [i, entrada(c)]));
  const insumos = porDias(cpv, "dias_insumos"), lavoura = porDias(cpv, "dias_lavoura");
  const forn = porDias(cpv, "dias_fornecedores"), outras = porDias(cpv, "dias_outras"), trab = porDias(cpv, "dias_trabalhistas");
  const impostos = porDias(ded, "dias_impostos");
  const f = (fn: (a: number) => number): Serie => Object.fromEntries(anos.map((a) => [a, fn(a)]));
  const ac = f((a) => receber[a] + rotacao[a] + preparo[a] + estoquePa[a] + insumos[a] + lavoura[a]);
  const pc = f((a) => forn[a] + outras[a] + trab[a] + impostos[a]);
  const ncg = f((a) => ac[a] - pc[a]);
  const ini = await real.saldoInicial(bd, anos[0]);
  const ncgIni = ini ? ini.ncg : null;
  const inv: Record<number, number | null> = Object.fromEntries(anos.map((a, i) => [a, i ? ncg[a] - ncg[anos[i - 1]] : ncgIni !== null ? ncg[a] - ncgIni : null]));
  const dRec = entrada("dias_receber"), dLav = entrada("dias_lavoura"), dIns = entrada("dias_insumos"), dFor = entrada("dias_fornecedores");
  const oper = f((a) => dRec[a] + dLav[a] + dIns[a]);
  const fin = f((a) => oper[a] - dFor[a]);
  const giro = f((a) => (fin[a] > 0 ? diasAno[a] / fin[a] : 0));
  const pct = entrada("pct_caixa"), caixaValor = entrada("saldo_caixa");
  const caixa = f((a) => (caixaValor[a] > 0 ? caixaValor[a] : (cpv[a] * pct[a]) / 100));       // valor digitado (ou a média do realizado); sem ele, vale o % do custo de produção

  const E = async (campo: string, expl: string) => {
    const l: any = { id: campo, nome: CAMPOS[campo][0], unidade: CAMPOS[campo][1], entrada: true, valores: entrada(campo), explicacao: expl };
    if (campo in rz.campos && rz.anos.length) l.realizado = Object.fromEntries(rz.anos.map((a) => [a, rz.campos[campo][a] ?? null]));
    else if (campo in rz.saldos && rz.anos.length) l.realizado = Object.fromEntries(rz.anos.map((a) => [a, rz.saldos[campo][a] ?? null]));
    if (CAMPOS_ATUALIZAVEIS.includes(campo) && anoReal !== null) {
      const usados = Object.values(marcasAnos[campo] ?? {})[0] ?? [anoReal];            // período da média aplicada (ou o último ano, se nada foi aplicado)
      l.explicacao += " " + (await origemTexto(bd, campo, usados, rz));
      l.origem = Object.fromEntries(anos.map((a) => [a, marcas[campo]?.[a] ?? null]));
      l.origem_anos = Object.fromEntries(anos.map((a) => [a, marcasAnos[campo]?.[a] ?? null]));
    }
    return l;
  };
  const L = (id: string, nome: string, unid: string, valores: any, expl: string, estilo = ""): any => ({ id, nome, unidade: unid, entrada: false, valores, explicacao: expl, estilo });
  const out: any = {
    versao: v, anos, origem, dias_padrao: padrao,
    realizado: { anos: rz.anos, ultimo_ano: anoReal, ncg_inicial: ini ? { ano: ini.ano, valor: ncgIni } : null },
    premissas: [
      { titulo: "Geral", linhas: [{ ...(await E("dias_ano", "Base de dias do ano nas contas abaixo. O padrão é a quantidade real de dias do ano (365, ou 366 em ano bissexto); "
        + "você pode alterar. Apagar o campo volta ao padrão.")), valores: diasAno, padrao, personalizado: Object.fromEntries(anos.map((a) => [a, !!val.dias_ano?.[a]])) }] },
      { titulo: "Prazo médio do ativo", linhas: [
        await E("dias_receber", "Contas a receber = Receita líquida × dias ÷ dias no ano."),
        await E("dias_rotacao", "Rotação de cultura a apropriar = CPV × dias ÷ dias no ano (custo da safra seguinte pago antes, por isso acompanha o custo)."),
        await E("dias_preparo", "Preparo de solo e despesas de fazendas a apropriar = CPV × dias ÷ dias no ano."),
        await E("dias_insumos", "Estoque de insumos = CPV × dias ÷ dias no ano."),
        await E("dias_lavoura", "Lavoura em formação = CPV × dias ÷ dias no ano.")] },
      { titulo: "Prazo médio do passivo", linhas: [
        await E("dias_fornecedores", "Contas a pagar - Fornecedores = CPV × dias ÷ dias no ano."),
        await E("dias_outras", "Outras obrigações = CPV × dias ÷ dias no ano."),
        await E("dias_trabalhistas", "Obrigações trabalhistas = CPV × dias ÷ dias no ano."),
        await E("dias_impostos", "Impostos a pagar = Deduções da receita (impostos sobre as vendas) × dias ÷ dias no ano. Faz parte da necessidade de capital de giro.")] },
      { titulo: "Contas de saldo", linhas: await Promise.all(CAMPOS_SALDO.map(([c]) => E(c, `${CAMPOS[c][0]}: saldo em 31/12 de cada ano, em R$. Não tem prazo médio: o botão de média leva o saldo médio dos anos fechados que você marcar, `
        + "e você pode digitar o valor que quiser em qualquer ano. Enquanto nenhum valor for gravado, o balanço mantém o saldo do último balanço realizado. "
        + "Fica fora da necessidade de capital de giro."))) },
      { titulo: "Caixa", linhas: [await E("saldo_caixa", "Caixa mínimo, em R$: é o piso do caixa de fechamento do Fluxo de caixa (as disponibilidades do balanço). Se o caixa ficaria abaixo disso, o sistema gera dívida de giro automática; a sobra amortiza essa dívida. "
        + "O botão de média leva o caixa médio dos anos fechados que você marcar, e você pode digitar o valor que quiser em qualquer ano. Se nenhum valor for informado, vale o percentual do custo de produção (campo antigo).")] },
    ],
    resultado: [
      { titulo: "Base", linhas: [
        L("receita", "Receita líquida", "R$ mil", rec, `Vem da ${origem}: Receita Líquida do ano.`),
        L("cpv", "Custo do produto vendido", "R$ mil", cpv, `Vem da ${origem}: custo do produto vendido (custo de produção) do ano, em valor positivo.`),
        L("deducoes", "Deduções da receita", "R$ mil", ded, `Vem da ${origem}: deduções da receita (impostos sobre as vendas) do ano, em valor positivo.`)] },
      { titulo: "Ativo circulante operacional", linhas: [
        L("receber", "Contas a Receber - Clientes", "R$ mil", receber, "Receita líquida × dias de receber ÷ dias no ano."),
        L("rotacao", "Rotação de cultura a apropriar", "R$ mil", rotacao, "CPV × dias de rotação ÷ dias no ano."),
        L("preparo", "Preparo de solo e despesas a apropriar", "R$ mil", preparo, "CPV × dias de preparo ÷ dias no ano."),
        L("estoque_pa", "Estoque de produtos acabados", "R$ mil", estoquePa, "Estoque a custo dos produtos no Resultado por produto (quantidade estocada × custo médio)."),
        L("insumos", "Estoque de insumos", "R$ mil", insumos, "CPV × dias de insumos ÷ dias no ano."),
        L("lavoura", "Lavoura em formação", "R$ mil", lavoura, "CPV × dias de lavoura ÷ dias no ano."),
        L("ac", "Total do ativo circulante operacional", "R$ mil", ac, "Soma das linhas acima (sem caixa).", "total")] },
      { titulo: "Passivo circulante operacional", linhas: [
        L("fornecedores", "Contas a Pagar - Fornecedores", "R$ mil", forn, "CPV × dias de fornecedores ÷ dias no ano."),
        L("outras", "Outras Obrigações", "R$ mil", outras, "CPV × dias ÷ dias no ano."),
        L("trabalhistas", "Obrigações Trabalhistas", "R$ mil", trab, "CPV × dias ÷ dias no ano."),
        L("impostos", "Impostos a Pagar", "R$ mil", impostos, "Deduções da receita × dias de impostos ÷ dias no ano."),
        L("pc", "Total do passivo circulante operacional", "R$ mil", pc, "Soma das linhas acima.", "total")] },
      { titulo: "Contas de saldo", linhas: CAMPOS_SALDO.map(([c, i]) => ({ ...L(i, CAMPOS[c][0], "R$ mil", saldos[i], "Saldo digitado ou médio dos anos fechados (premissa acima). Não entra na necessidade de capital de giro."), informado: c in val })) },
      { titulo: "Capital de giro", linhas: [
        L("ncg", "Necessidade de Capital de Giro", "R$ mil", ncg, "Ativo circulante operacional − Passivo circulante operacional.", "total"),
        L("inv_cg", "Investimento em CG", "R$ mil", inv, "NCG do ano − NCG do ano anterior. No primeiro ano do horizonte, a comparação é com a NCG do último balanço realizado (se houver); sem realizado, fica em branco.")] },
      { titulo: "Ciclos", linhas: [
        L("ciclo_oper", "Ciclo operacional", "dias", oper, "Dias de receber + dias de lavoura + dias de insumos. O estoque de produtos acabados não entra: não é um prazo, é o saldo que fica em estoque (Resultado por produto)."),
        L("ciclo_fin", "Ciclo financeiro", "dias", fin, "Ciclo operacional − dias de fornecedores."),
        L("giro", "Giro por ano", "uni", giro, "Dias no ano ÷ ciclo financeiro (zero se o ciclo financeiro não for positivo).")] },
      { titulo: "Caixa", linhas: [
        L("caixa", "Caixa mínimo", "R$ mil", caixa, "Valor de caixa mínimo informado (ou a média do realizado). O caixa do balanço vem do Fluxo de caixa e nunca fica abaixo disso.", "total")] },
    ],
  };
  const ult = await resultadoRealizado(bd, rz, anoReal);
  for (const sec of out.resultado) for (const l of sec.linhas) l.realizado = ult[l.id] ?? null;          // último ano realizado, para comparar com o calculado
  return out;
}

// Linhas do resultado do balanço no último ano realizado: saldos do balanço e bases da DRE.
async function resultadoRealizado(bd: Bd, rz: Awaited<ReturnType<typeof real.prazos>>, ano: number | null): Promise<Record<string, number | null>> {
  if (ano === null || !rz.anos.includes(ano)) return {};
  const bp = (await real.valores(bd)).BP;
  const conta = (...cs: string[]) => cs.reduce((t, c) => t + (bp[c]?.[ano] ?? 0), 0) / 1000;
  const r: Record<string, number | null> = { receita: (rz.base.RL[ano] ?? 0) / 1000, cpv: (rz.base.CPV[ano] ?? 0) / 1000, deducoes: (rz.base.DED[ano] ?? 0) / 1000,
    receber: conta("SA08"), rotacao: conta("SA13"), preparo: conta("SA14"), estoque_pa: conta("SA10"), insumos: conta("SA11"), lavoura: conta("SA12"),
    caixa: conta("SA07"), fornecedores: conta("SP07"), outras: conta("SP10"), trabalhistas: conta("SP11"), impostos: conta("SP09") };
  r.ac = ["receber", "rotacao", "preparo", "estoque_pa", "insumos", "lavoura"].reduce((t, k) => t + r[k]!, 0);
  r.pc = ["fornecedores", "outras", "trabalhistas", "impostos"].reduce((t, k) => t + r[k]!, 0);
  for (const [c, i] of CAMPOS_SALDO) r[i] = rz.saldos[c]?.[ano] ?? null;
  return r;
}

const br = (v: number) => fmt0(v).replace(/,/g, ".");
const diasBr = (v: number) => fixo(v, 1).replace(".", ",");

// Como o prazo realizado foi calculado: contas do balanço, base da DRE e dias do ano; com vários anos, a média simples.
async function origemTexto(bd: Bd, campo: string, anos: number[], rz: Awaited<ReturnType<typeof real.prazos>>): Promise<string> {
  const nomes = new Map((await bd.q("SELECT codigo, nome FROM bp_linhas")).map((r) => [r.codigo as string, r.nome as string]));
  if (campo in real.SALDOS) {
    const cs = real.SALDOS[campo].map((c) => `${nomes.get(c) ?? c} (${c})`).join(" + ");
    const sv = rz.saldos[campo];
    if (anos.length === 1) return `Origem do cálculo (realizado de ${anos[0]}): saldo de ${cs} em 31/12/${anos[0]} = R$ ${br(sv[anos[0]])} mil.`;
    const soma = anos.map((a) => br(sv[a])).join(" + ");
    return `Origem do cálculo (média simples dos saldos de ${anos.join(", ")}): ` + anos.map((a) => `${a}: R$ ${br(sv[a])} mil`).join("; ")
      + `. Média = (${soma}) ÷ ${anos.length} = R$ ${br(anos.reduce((t, a) => t + sv[a], 0) / anos.length)} mil.`;
  }
  const [contas, b] = real.PRAZOS[campo];
  const cs = contas.map((c) => `${nomes.get(c) ?? c} (${c})`).join(" + ");
  const um = (ano: number): string | null => {
    const d = rz.detalhe[campo][ano];
    if (d === undefined) return null;
    return `saldo de ${cs} em 31/12/${ano} = R$ ${br(d.saldo / 1000)} mil ÷ (${BASE_NOME[b]} R$ ${br(d.base / 1000)} mil ÷ ${fixo(d.dias_ano, 0)} dias) = ${diasBr(rz.campos[campo][ano]!)} dias`;
  };
  if (anos.length === 1) { const t = um(anos[0]); return t ? `Origem do cálculo (realizado de ${anos[0]}): ${t}.` : `Origem: no realizado de ${anos[0]} não há ${BASE_NOME[b]} para calcular.`; }
  const vals = anos.map((a) => [a, rz.campos[campo][a] ?? null] as [number, number | null]);
  const validos = vals.filter(([, v]) => v !== null) as [number, number][];
  const partes = anos.map((a) => (validos.some(([x]) => x === a) ? `${a}: ${um(a)}` : `${a}: sem ${BASE_NOME[b]}, ficou de fora`)).join("; ");
  if (!validos.length) return `Origem: nos anos ${anos.join(", ")} não há ${BASE_NOME[b]} para calcular.`;
  const media = validos.reduce((t, [, v]) => t + v, 0) / validos.length;
  return `Origem do cálculo (média simples de ${anos.join(", ")}): ${partes}. Média = (${validos.map(([, v]) => diasBr(v)).join(" + ")}) ÷ ${validos.length} = ${diasBr(media)} dias.`;
}

// Atalhos de período sobre os anos fechados: último ano, 2, 3, 5 anos e todos (sem repetir a mesma seleção).
export function opcoesPeriodo(anos: number[]) {
  const out: { id: string; rotulo: string; anos: number[] }[] = [], vistos = new Set<string>();
  for (const [n, rotulo] of [[1, "Último ano"], [2, "Últimos 2 anos"], [3, "Últimos 3 anos"], [5, "Últimos 5 anos"], [0, "Todos os anos fechados"]] as [number, string][]) {
    const sel = n ? anos.slice(-n) : [...anos];
    if (vistos.has(sel.join(",")) || !sel.length) continue;
    vistos.add(sel.join(","));
    out.push({ id: String(n || "todos"), rotulo, anos: sel });
  }
  return out;
}

// Prazos de cada ano fechado, por campo, para escolher o período da média, e a média de cada atalho.
export async function previaPrazos(bd: Bd, vid: number) {
  await obterVersao(bd, vid);
  const rz = await real.prazos(bd);
  const anos = rz.anos, opcoes = opcoesPeriodo(anos);
  const serie = (campo: string): Record<number, number | null> => (campo in rz.saldos ? rz.saldos[campo] : rz.campos[campo]);
  const media = (campo: string, sel: number[]) => { const v = sel.map((a) => serie(campo)[a]).filter((x) => x !== undefined && x !== null) as number[]; return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; };
  const campos = CAMPOS_ATUALIZAVEIS.map((c) => ({ id: c, nome: CAMPOS[c][0], unidade: CAMPOS[c][1], por_ano: Object.fromEntries(anos.map((a) => [a, serie(c)[a] ?? null])), por_opcao: Object.fromEntries(opcoes.map((o) => [o.id, media(c, o.anos)])) }));
  return { anos, opcoes, campos, padrao: anos.slice(-3) };
}

// Calcula os prazos como média simples dos anos fechados escolhidos (padrão: o último) e grava em todos os anos do horizonte; depois cada um pode ser editado.
export async function atualizarPrazos(bd: Bd, vid: number, autor: string, anosEscolhidos: number[] | null = null) {
  const v = await versaoEditavel(bd, vid);
  const rz = await real.prazos(bd);
  if (!rz.anos.length) throw Invalido("Ainda não há Balanço e DRE realizados do mesmo ano. Suba os anos fechados na tela Realizado.");
  const escolhidos = anosEscolhidos && anosEscolhidos.length ? [...new Set(anosEscolhidos)].sort((a, b) => a - b) : [rz.anos[rz.anos.length - 1]];
  const fora = escolhidos.filter((a) => !rz.anos.includes(a));
  if (fora.length) throw Invalido(`Não há Balanço e DRE realizados de ${fora.join(", ")}`);
  const ultimo = escolhidos[escolhidos.length - 1];
  const anos = anosDaVersao(v).filter((a) => a > ultimo);
  if (!anos.length) throw Invalido(`O horizonte da versão não tem anos depois de ${ultimo}`);
  let feitos = 0;
  for (const campo of CAMPOS_ATUALIZAVEIS) {
    const serie: Record<number, number | null> = campo in rz.saldos ? rz.saldos[campo] : rz.campos[campo];
    const validos = escolhidos.map((a) => serie[a]).filter((x) => x !== undefined && x !== null) as number[];
    if (!validos.length) continue;
    const valor = redondo(validos.reduce((t, x) => t + x, 0) / validos.length, 1);
    for (const a of anos) {
      await bd.q("INSERT INTO capital_giro(versao_id, campo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", [vid, campo, a, valor]);
      await bd.q("INSERT INTO capital_giro_origem(versao_id, campo, ano, ano_realizado, anos) VALUES(?,?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET ano_realizado=excluded.ano_realizado, anos=excluded.anos",
        [vid, campo, a, ultimo, escolhidos.join(",")]);
    }
    feitos++;
  }
  await auditar(bd, autor, vid, "atualizar_prazos_capital_giro", `média de ${escolhidos.join(", ")} para ${anos.length} ano(s)`);
  return { ano_realizado: ultimo, anos_usados: escolhidos, campos: feitos, anos_alterados: anos.length };
}

function campoValido(campo: string) {
  if (!(campo in CAMPOS)) throw Invalido("Esse campo é calculado pelo sistema; só dá para digitar os prazos, os dias no ano e o % de caixa");
}

export async function salvar(bd: Bd, vid: number, campo: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  campoValido(campo);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("O valor não pode ser negativo");
  if (campo === "pct_caixa" && valor > 100) throw Invalido("O percentual de caixa fica entre 0 e 100");
  if (campo === "dias_ano" && valor > 0 && valor < 1) throw Invalido("Informe os dias do ano (ex.: 360) ou deixe em branco");
  await bd.q("INSERT INTO capital_giro(versao_id, campo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", [vid, campo, ano, valor]);
  await bd.q("DELETE FROM capital_giro_origem WHERE versao_id=? AND campo=? AND ano=?", [vid, campo, ano]);          // digitado: já não é o calculado
  await auditar(bd, autor, vid, "salvar_capital_giro", `${CAMPOS[campo][0]} ${ano}: ${valor}`);
}

function destinosDe(v: Versao, anoOrigem: number): number[] {
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const d = anos.filter((a) => a > anoOrigem);
  if (!d.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  return d;
}

async function copiar(bd: Bd, vid: number, campo: string, anoOrigem: number, destinos: number[]) {
  const [r] = await bd.q("SELECT valor FROM capital_giro WHERE versao_id=? AND campo=? AND ano=?", [vid, campo, anoOrigem]);
  const [m] = await bd.q("SELECT ano_realizado, anos FROM capital_giro_origem WHERE versao_id=? AND campo=? AND ano=?", [vid, campo, anoOrigem]);
  for (const a of destinos) {
    await bd.q("DELETE FROM capital_giro_origem WHERE versao_id=? AND campo=? AND ano=?", [vid, campo, a]);
    if (m) await bd.q("INSERT INTO capital_giro_origem(versao_id, campo, ano, ano_realizado, anos) VALUES(?,?,?,?,?)", [vid, campo, a, m.ano_realizado, m.anos]);
    await bd.q("INSERT INTO capital_giro(versao_id, campo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", [vid, campo, a, r ? r.valor : 0]);
  }
}

export async function replicar(bd: Bd, vid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  campoValido(campo);
  const destinos = destinosDe(v, anoOrigem);
  await copiar(bd, vid, campo, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_capital_giro", `${CAMPOS[campo][0]}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodos(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem);
  for (const campo of Object.keys(CAMPOS)) await copiar(bd, vid, campo, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_todos_capital_giro", `de ${anoOrigem}`);
  return { campos: Object.keys(CAMPOS).length, anos_alterados: destinos.length };
}

export async function comparar(bd: Bd, aId: number, bId: number) {
  const la = await ler(bd, aId), lb = await ler(bd, bId);
  const anos: number[] = la.anos.filter((a: number) => lb.anos.includes(a)).sort((x: number, y: number) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const achatar = (d: any): Map<string, any> => new Map([...d.premissas, ...d.resultado].flatMap((sec: any) => sec.linhas).map((l: any) => [l.id, l]));
  const ia = achatar(la), ib = achatar(lb);
  const linhas: any[] = [];
  for (const [id, l] of ia) {
    const q = ib.get(id) ?? l;
    linhas.push({ id, nome: l.nome, unidade: l.unidade, entrada: l.entrada, anos: Object.fromEntries(anos.map((a) => [a, {
      a: l.valores[a] || 0, b: q.valores[a] || 0, delta: (q.valores[a] || 0) - (l.valores[a] || 0), pct: l.valores[a] ? (((q.valores[a] || 0) - l.valores[a]) / Math.abs(l.valores[a])) * 100 : null }])) });
  }
  return { a: la.versao, b: lb.versao, anos, linhas };
}
