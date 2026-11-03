// Demonstrativos derivados do orçamento (R$ mil, ano a ano), no formato da planilha de orçamento ("DF's - Consolidado"). Porte de app/servicos/demonstrativos.py.
//   Fluxo de caixa indireto e simplificado; necessidade de capital de giro; Usos e Fontes; composição do endividamento; resumo dos índices (11 indicadores).
// Tudo sai das mesmas contas do balanço, da DRE e do cálculo do caixa (fluxo.mts), então bate com eles.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import * as balanco from "./balanco.mts";
import * as cap from "./captacoes.mts";
import * as cg from "./capital-giro.mts";
import * as dre from "./dre.mts";
import * as fluxo from "./fluxo.mts";
import * as inv from "./investimentos.mts";
import * as real from "./realizado.mts";

const MIL = 1000;
type Serie = Record<number, number>;
type SerieN = Record<number, number | null>;

// limites de cada indicador na planilha: (código, nome, sentido, limite inicial, casas decimais, é percentual)
export const INDICADORES: [string, string, string, number | null, number, boolean][] = [
  ["alav_total", "Alavancagem total (dívida bancária ÷ EBITDA)", "max", 3.0, 2, false],
  ["liquidez", "Índice de liquidez (ativo circulante ÷ passivo circulante)", "min", 1.1, 2, false],
  ["capacidade", "Capacidade de pagamento (EBITDA ÷ (CPLTD + juros))", "min", 1.5, 2, false],
  ["equilibrio", "Ponto de equilíbrio financeiro (faturamento mínimo × faturamento)", "min", null, 0, false],
  ["solvencia", "Solvência (patrimônio líquido ÷ ativo total)", "min", 0.5, 1, true],
  ["divida_ativo", "Dívida total ÷ ativo total (todo o exigível: dívida bancária, fornecedores e demais obrigações)", "max", 0.5, 1, true],
  ["alav_liquida", "Alavancagem líquida ((dívida − caixa) ÷ EBITDA)", "max", 2.5, 2, false],
  ["margem_ebitda", "Margem EBITDA", "min", 0.30, 1, true],
  ["alav_operacional", "Alavancagem operacional", "max", 0.6, 1, true],
  ["roic", "ROIC (retorno sobre a atividade, incluindo caixa)", "min", 0.14, 1, true],
  ["roe", "ROE (retorno sobre o patrimônio)", "min", 0.14, 1, true],
];
const CODIGOS = new Set(INDICADORES.map((i) => i[0]));

// ---------------------------------------------------------------- metas dos indicadores
async function metasDe(bd: Bd, vid: number): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = {};
  for (const r of await bd.q("SELECT indicador, ano, valor FROM indicadores_metas WHERE versao_id=?", [vid])) (d[r.indicador] ??= {})[r.ano] = r.valor;
  return d;
}
const UPSERT = "INSERT INTO indicadores_metas(versao_id, indicador, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, indicador, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarMeta(bd: Bd, vid: number, indicador: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  if (!CODIGOS.has(indicador) || indicador === "equilibrio") throw Invalido("Indicador inválido (o ponto de equilíbrio é calculado, não tem limite digitado)");
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("O limite não pode ser negativo");
  await bd.q(UPSERT, [vid, indicador, ano, valor]);
  await auditar(bd, autor, vid, "salvar_meta_indicador", `${indicador} ${ano}: ${valor}`);
}

export async function replicarMeta(bd: Bd, vid: number, indicador: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  if (!CODIGOS.has(indicador) || indicador === "equilibrio") throw Invalido("Indicador inválido");
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const destinos = anos.filter((a) => a > anoOrigem);
  if (!destinos.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  const padrao = INDICADORES.find((i) => i[0] === indicador)![3];
  const [r] = await bd.q("SELECT valor FROM indicadores_metas WHERE versao_id=? AND indicador=? AND ano=?", [vid, indicador, anoOrigem]);
  const valor = r ? r.valor : padrao;
  for (const a of destinos) await bd.q(UPSERT, [vid, indicador, a, valor]);
  await auditar(bd, autor, vid, "replicar_meta_indicador", `${indicador}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

// ---------------------------------------------------------------- dados comuns
interface Dados { anos: number[]; versao: any; fl: any; bal: (c: string) => Serie; ant: (c: string) => Serie; dr: (c: string) => Serie; caps: Record<string, Serie>; tot: { investido: Serie; desinvestido: Serie }; ini: Record<string, number>; dias: Serie; dist: Serie; }

// Séries do balanço, da DRE e do caixa, calculadas uma vez só. null se o balanço ainda não tem estrutura importada.
async function dados(bd: Bd, vid: number, fl: any = null): Promise<Dados | null> {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  fl = fl || (await fluxo.projetar(bd, vid));
  if (!fl.ativo) return null;
  const bp: any = await balanco.ler(bd, vid, fl);
  const d: any = await dre.ler(bd, vid, fl.juros_auto);
  const B: Record<string, any> = Object.fromEntries(bp.linhas.map((l: any) => [l.codigo, l]));
  const D: Record<string, Serie> = Object.fromEntries(d.linhas.map((l: any) => [l.codigo, l.valores]));
  const zero: Serie = Object.fromEntries(anos.map((a) => [a, 0]));
  const ini = (await real.saldoInicial(bd, anos[0]))?.valores ?? {};
  const bal = (cod: string): Serie => (cod in B ? { ...B[cod].valores } : { ...zero });                          // valor do balanço projetado
  const ant = (cod: string): Serie => { const s = bal(cod); return Object.fromEntries(anos.map((a) => [a, a - 1 in s ? s[a - 1] : ini[cod] ?? 0])); };        // valor do ano anterior
  const dr = (cod: string): Serie => ({ ...(D[cod] ?? zero) });
  const caps = cap.somar(await cap.calcular(bd, vid, anos), anos);
  const tot = await inv.totais(bd, vid, anos);
  const diasAno = (await cg.ler(bd, vid)).premissas.flatMap((s: any) => s.linhas).find((l: any) => l.id === "dias_ano").valores;       // dias do ano do Capital de giro (real ou alterado)
  return { anos, versao: v, fl, bal, ant, dr, caps, tot, ini, dias: Object.fromEntries(anos.map((a) => [a, diasAno[a]])), dist: fl.linhas.dist };
}

const soma = (anos: number[], ...series: Serie[]): Serie => Object.fromEntries(anos.map((a) => [a, series.reduce((t, s) => t + s[a], 0)]));
const neg = (anos: number[], s: Serie): Serie => Object.fromEntries(anos.map((a) => [a, -s[a]]));
const linha = (id: string, nome: string, valores: any, expl = "", estilo = "") => ({ id, nome, valores, explicacao: expl, estilo });

// ---------------------------------------------------------------- fluxo de caixa indireto, simplificado e NCG
function fluxos(d: Dados): Record<string, Serie> {
  const { anos, fl, dr } = d;
  const L = fl.linhas;
  const ebit = dr("DS048"), ebitda = dr("DS044"), depDre = neg(anos, dr("DS047"));
  const ir = dr("DS060"), nonOp = dr("DS054"), resFin = dr("DS051"), lucro = L.lucro;
  const f = (fn: (a: number) => number): Serie => Object.fromEntries(anos.map((a) => [a, fn(a)]));
  const eps = f((a) => lucro[a] - (ebit[a] + nonOp[a] + resFin[a] + ir[a]));                                       // demais linhas da DRE que não estão acima
  const outrosOps = f((a) => L.outros[a] + (L.dep[a] - depDre[a]) + eps[a] + L.outros_pl[a]);
  const capex = neg(anos, d.tot.investido), venda = d.tot.desinvestido;
  const outrasImob = f((a) => L.imob[a] - capex[a] - venda[a]);
  const capt = d.caps.captado;
  const amort = f((a) => L.dividas[a] - capt[a]);
  const N = fl.variacao;
  const dist = neg(anos, d.dist);
  const fco = soma(anos, ebit, depDre, ir, L.ncg, nonOp, outrosOps);
  const fci = L.imob;
  const fcf = soma(anos, capt, amort, N, resFin, dist, L.cap_aj);
  const caixaIni = f((a) => (a - 1 in fl.caixa ? fl.caixa[a - 1] : d.ini.SA07 ?? 0));
  const variacao = soma(anos, fco, fci, fcf);
  const caixaFim = soma(anos, caixaIni, variacao);
  const ver = f((a) => caixaFim[a] - fl.caixa[a]);
  return { ebit, ebitda, dep: depDre, ir, non_op: nonOp, res_fin: resFin, lucro, outros_ops: outrosOps, ncg: L.ncg, capex, venda, outras_imob: outrasImob, capt, amort, N, dist, cap_aj: L.cap_aj,
    fco, fci, fcf, caixa_ini: caixaIni, variacao, caixa_fim: caixaFim, ver };
}

export function fluxoIndireto(f: Record<string, Serie>) {
  return [
    { titulo: "Fluxo de caixa operacional", linhas: [
      linha("ebit", "EBIT", f.ebit, "Resultado antes dos juros e do imposto (DRE)."),
      linha("dep", "(+) Depreciação", f.dep, "Despesa que não sai do caixa; soma de volta ao EBIT."),
      linha("ir", "(−) Pagamento de IR e CSLL", f.ir, "IR e CSLL da DRE, pagos no próprio ano."),
      linha("ncg", "(−) Variação do capital de giro", f.ncg, "Aumento da necessidade de capital de giro consome caixa (detalhe na seção de capital de giro)."),
      linha("non_op", "(+) Outras receitas não operacionais", f.non_op, "Outras receitas e despesas não operacionais da DRE."),
      linha("outros_ops", "(+/−) Outros ativos e passivos", f.outros_ops, "Variação das demais contas do balanço (outros créditos, realizável, participações, consórcios, outras obrigações de longo prazo) e ajustes entre a DRE e o balanço."),
      linha("fco", "Fluxo de caixa operacional", f.fco, "Soma das linhas acima.", "total")] },
    { titulo: "Fluxo de caixa dos investimentos", linhas: [
      linha("capex", "(−) Investimentos (CAPEX)", f.capex, "Total investido no ano (tela Investimentos)."),
      linha("venda", "(+) Venda de imobilizado", f.venda, "Desinvestimentos do ano (tela Investimentos)."),
      linha("outras_imob", "(+/−) Outras variações do imobilizado", f.outras_imob, "Variação do imobilizado vinda de premissas de balanço, sem tipo de investimento."),
      linha("fci", "Fluxo de caixa dos investimentos", f.fci, "Soma das linhas acima.", "total")] },
    { titulo: "Fluxo de caixa dos financiamentos", linhas: [
      linha("capt", "(+) Captações", f.capt, "Novas captações de custeio e capital de giro e financiamentos de investimentos (tela Novas captações)."),
      linha("amort", "(−) Amortizações", f.amort, "Variação das dívidas existentes (Endividamento) e das novas, menos as captações do ano."),
      linha("N", "(+/−) Dívida de giro automática", f.N, "Gerada quando o caixa ficaria abaixo do mínimo; a sobra de caixa a amortiza."),
      linha("res_fin", "(−) Resultado financeiro", f.res_fin, "Juros pagos (e receitas financeiras) do ano, inclusive os da dívida de giro automática."),
      linha("dist", "(−) Distribuição de lucros", f.dist, "Lucro de um ano distribuído aos sócios no ano seguinte (tela Patrimônio líquido)."),
      linha("cap_aj", "(+/−) Capital e ajustes de avaliação", f.cap_aj, "Variação do capital integralizado e dos ajustes de avaliação."),
      linha("fcf", "Fluxo de caixa dos financiamentos", f.fcf, "Soma das linhas acima.", "total")] },
    { titulo: "Caixa", linhas: [
      linha("caixa_ini", "Saldo de caixa anterior", f.caixa_ini, "Caixa do fim do ano anterior (o primeiro vem do último balanço realizado)."),
      linha("variacao", "Variação no caixa", f.variacao, "Operacional + investimentos + financiamentos.", "total"),
      linha("caixa_fim", "Saldo final de caixa", f.caixa_fim, "Saldo anterior + variação. É o caixa do balanço.", "total"),
      linha("ver", "Verificação (saldo final − caixa do balanço)", f.ver, "Deve ser zero.")] },
  ];
}

export function fluxoSimplificado(d: Dados, f: Record<string, Serie>) {
  const { anos, dr } = d;
  const rb = dr("DS007"), ded = dr("DS015");
  const despesas: Serie = Object.fromEntries(anos.map((a) => [a, f.ebitda[a] - rb[a] - ded[a]]));
  const jurosAmort = soma(anos, f.res_fin, f.amort);
  const outros = soma(anos, f.outros_ops, f.cap_aj);
  const subtotal = soma(anos, f.ebitda, f.ncg, jurosAmort, f.fci, f.non_op, f.ir, f.dist, outros);
  const apos = soma(anos, subtotal, f.capt, f.N);
  const ver: Serie = Object.fromEntries(anos.map((a) => [a, f.caixa_ini[a] + apos[a] - d.fl.caixa[a]]));
  return [
    { titulo: "Geração de caixa operacional", linhas: [
      linha("rb", "Receitas operacionais", rb, "Receita bruta da DRE."), linha("ded", "Deduções sobre a receita", ded, "Impostos sobre as vendas."),
      linha("despesas", "Despesas operacionais", despesas, "Custos e despesas operacionais (EBITDA − receita bruta − deduções)."),
      linha("ebitda", "EBITDA ou geração de caixa operacional", f.ebitda, "EBITDA da DRE.", "total")] },
    { titulo: "Fluxo do período", linhas: [
      linha("ncg", "Necessidade de capital de giro", f.ncg, "Variação da necessidade de capital de giro."),
      linha("juros_amort", "Juros + amortizações das dívidas", jurosAmort, "Resultado financeiro mais amortizações do ano."),
      linha("fci", "Investimentos", f.fci, "Investimentos líquidos (CAPEX menos vendas de imobilizado)."),
      linha("non_op", "Outras receitas", f.non_op, "Outras receitas não operacionais."), linha("ir", "IR", f.ir, "IR e CSLL."),
      linha("dist", "Dividendos", f.dist, "Distribuição de lucros do ano."), linha("outros", "Outros", outros, "Demais variações: outros ativos e passivos, capital e ajustes."),
      linha("subtotal", "Subtotal do período", subtotal, "Antes das novas dívidas.", "total")] },
    { titulo: "Financiamento e caixa", linhas: [
      linha("capt", "Nova dívida (captações)", f.capt, "Captações de custeio, capital de giro e financiamentos de investimentos."),
      linha("N", "Dívida de giro automática", f.N, "Geração (+) ou amortização (−) pela sobra de caixa."),
      linha("apos", "Caixa após financiamentos (variação do caixa)", apos, "Subtotal + nova dívida + dívida de giro automática.", "total"),
      linha("caixa_ini", "Posição de caixa no início do período", f.caixa_ini, "Caixa do fim do ano anterior."),
      linha("caixa_fim", "Posição de caixa ao término do período", Object.fromEntries(anos.map((a) => [a, f.caixa_ini[a] + apos[a]])), "É o caixa do balanço.", "total"),
      linha("ver", "Verificação", ver, "Deve ser zero.")] },
  ];
}

export function capitalGiroResumo(d: Dados) {
  const { anos, bal, dr } = d;
  const rl = dr("DS018"), cpv = neg(anos, dr("DS020"));
  const clientes = bal("SA08"), estoques = soma(anos, bal("SA10"), bal("SA10G"), bal("SA11"), bal("SA12"));
  const outrosAc = soma(anos, bal("SA13"), bal("SA14"));
  const ac = soma(anos, clientes, estoques, outrosAc);
  const forn = bal("SP07"), imp = bal("SP09"), trab = bal("SP11"), outras = bal("SP10");
  const pc = soma(anos, forn, imp, trab, outras);
  const ncg: Serie = Object.fromEntries(anos.map((a) => [a, ac[a] - pc[a]]));
  const ini = d.ini;
  const ncg0 = ["SA08", "SA10", "SA11", "SA12", "SA13", "SA14"].reduce((t, c) => t + (ini[c] ?? 0), 0) - ["SP07", "SP09", "SP10", "SP11"].reduce((t, c) => t + (ini[c] ?? 0), 0);
  const inv: Serie = Object.fromEntries(anos.map((a) => [a, ncg[a] - (a - 1 in ncg ? ncg[a - 1] : ncg0)]));
  const dias = d.dias;
  const receber: Serie = Object.fromEntries(anos.map((a) => [a, rl[a] ? (clientes[a] / rl[a]) * dias[a] : 0]));
  const estoque: Serie = Object.fromEntries(anos.map((a) => [a, cpv[a] ? (estoques[a] / cpv[a]) * dias[a] : 0]));
  const pagar: Serie = Object.fromEntries(anos.map((a) => [a, cpv[a] ? (forn[a] / cpv[a]) * dias[a] : 0]));
  const oper = soma(anos, receber, estoque);
  const fin: Serie = Object.fromEntries(anos.map((a) => [a, oper[a] - pagar[a]]));
  return [
    { titulo: "Ativo circulante operacional", linhas: [
      linha("clientes", "Contas a receber - Clientes", clientes), linha("estoques", "Estoques (produtos acabados, insumos e lavoura em formação)", estoques),
      linha("outros_ac", "Outros (rotação de cultura e preparo de solo a apropriar)", outrosAc), linha("ac", "Ativo circulante operacional", ac, "Sem caixa e sem outros créditos.", "total")] },
    { titulo: "Passivo circulante operacional", linhas: [
      linha("forn", "Contas a pagar - Fornecedores", forn), linha("imp", "Impostos", imp), linha("trab", "Obrigações trabalhistas", trab),
      linha("outras", "Outras obrigações", outras), linha("pc", "Passivo circulante operacional", pc, "", "total")] },
    { titulo: "Necessidade de capital de giro", linhas: [
      linha("ncg", "Necessidade de capital de giro", ncg, "Ativo circulante operacional − passivo circulante operacional.", "total"),
      linha("inv_cg", "Investimento em capital de giro", inv, "NCG do ano − NCG do ano anterior (o primeiro compara com o último balanço realizado).")] },
    { titulo: "Ciclos (dias)", linhas: [
      linha("d_receber", "Dias de contas a receber", receber, "Clientes ÷ receita líquida × dias do ano."),
      linha("d_estoque", "Dias de estoque", estoque, "Estoques ÷ custo do produto vendido × dias do ano."),
      linha("ciclo_oper", "Ciclo operacional", oper, "Dias de receber + dias de estoque.", "total"),
      linha("d_pagar", "Dias de contas a pagar", pagar, "Fornecedores ÷ custo do produto vendido × dias do ano."),
      linha("ciclo_fin", "Ciclo financeiro", fin, "Ciclo operacional − dias de contas a pagar.", "total")] },
  ];
}

export async function lerFluxo(bd: Bd, vid: number, fl: any = null): Promise<any> {
  const d = await dados(bd, vid, fl);
  if (d === null) return { estrutura: false };
  const f = fluxos(d);
  return { estrutura: true, indireto: fluxoIndireto(f), simplificado: fluxoSimplificado(d, f), capital_giro: capitalGiroResumo(d) };
}

// ---------------------------------------------------------------- usos e fontes
export async function usosFontes(bd: Bd, vid: number, fl: any = null) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const d = await dados(bd, vid, fl);
  if (d === null) return { versao: v, anos, estrutura: false, fontes: [], usos: [] };
  const f = fluxos(d);
  const fontes: any[] = [], usos: any[] = [];
  const fixo = (lista: any[], id: string, nome: string, serie: Serie, expl = "") => lista.push(linha(id, nome, { ...serie }, expl));
  const dinamico = (id: string, nomeFonte: string, nomeUso: string, serie: Serie, expl = "") => {                    // entra na coluna que o sinal do ano indicar
    fontes.push(linha(id + "_f", nomeFonte, Object.fromEntries(anos.map((a) => [a, Math.max(serie[a], 0)])), expl));
    usos.push(linha(id + "_u", nomeUso, Object.fromEntries(anos.map((a) => [a, Math.max(-serie[a], 0)])), expl));
  };
  fixo(fontes, "ebitda", "EBITDA", f.ebitda, "Geração de caixa operacional da DRE.");
  dinamico("ncg", "Redução do capital de giro", "Aumento do capital de giro", f.ncg);
  dinamico("caixa", "Redução de caixa", "Aumento do caixa", Object.fromEntries(anos.map((a) => [a, -f.variacao[a]])), "Variação do caixa do balanço.");
  dinamico("outros_ativos", "Redução de outros ativos / aumento de outros passivos", "Aumento de outros ativos / redução de outros passivos", f.outros_ops);
  dinamico("non_op", "Outras receitas não operacionais", "Outras despesas não operacionais", f.non_op);
  dinamico("capt", "Novas captações e financiamentos", "Redução de captações", f.capt);
  dinamico("amort", "Aumento líquido das dívidas existentes", "Pagamento de dívidas", f.amort, "Variação das dívidas existentes e das novas, sem a dívida de giro automática.");
  dinamico("auto", "Dívida de giro automática (geração)", "Amortização da dívida de giro automática", f.N);
  dinamico("venda", "Venda de imobilizado", "Investimentos (CAPEX)", soma(anos, f.capex, f.venda), "Investimentos menos vendas de imobilizado.");
  dinamico("imob_outras", "Redução de outras variações do imobilizado", "Outras variações do imobilizado", f.outras_imob);
  dinamico("cap", "Integralização de capital e ajustes", "Redução de capital e ajustes", f.cap_aj);
  dinamico("juros", "Receitas financeiras líquidas", "Juros e resultado financeiro", f.res_fin);
  dinamico("ir", "Crédito de IR e CSLL", "IR e CSLL", f.ir);
  dinamico("dist", "Redução de distribuição", "Retiradas e dividendos", f.dist);
  const tf = soma(anos, ...fontes.map((l) => l.valores)), tu = soma(anos, ...usos.map((l) => l.valores));
  return { versao: v, anos, estrutura: true,
    fontes: [...fontes, linha("total_fontes", "TOTAL - FONTES", tf, "Soma das fontes.", "total")],
    usos: [...usos, linha("total_usos", "TOTAL - USOS", tu, "Soma dos usos.", "total")],
    verificacao: linha("ver", "Verificação (fontes − usos)", Object.fromEntries(anos.map((a) => [a, tf[a] - tu[a]])), "Deve ser zero.") };
}

// ---------------------------------------------------------------- índices e composição do endividamento
// Os 11 indicadores por ano (mesmas fórmulas para o projetado e o realizado) e o faturamento mínimo do ponto de equilíbrio. bal(cod) = série do balanço.
function formulasIndicadores(anos: number[], ebitda: Serie, ebit: Serie, lucro: Serie, rl: Serie, rb: Serie, cpv: Serie, bruto: Serie, fixas: Serie, despFin: Serie, dist: Serie, cpltdAnt: Serie, bal: (c: string) => Serie) {
  const s = (...cods: string[]) => soma(anos, ...cods.map((c) => bal(c)));
  const div = (a: number, b: number): number | null => (b ? a / b : null);
  const divida = s("SP08", "SPAUTO", "SP12", "SP17", "SP18");                                          // dívida bancária: custeio e giro, giro automática, CPLTD e longo prazo (sem consórcios)
  const cpltd = bal("SP12"), ativo = bal("SA"), passivoC = bal("SP06"), ativoC = bal("SA06");
  const caixa = bal("SA07"), pl = bal("SP22");
  const acOp = s("SA08", "SA09", "SA10", "SA10G", "SA11", "SA12", "SA13", "SA14");
  const pcOp = s("SP07", "SP09", "SP11", "SP13");
  const estoques = s("SA10", "SA10G", "SA11", "SA12", "SA13", "SA14");                              // todos os estoques: produtos acabados, gado, insumos, lavoura, rotação e preparo de solo
  const sa19 = bal("SA19"), sp07 = bal("SP07"), sp08 = bal("SP08"), spauto = bal("SPAUTO");
  const capital: Serie = Object.fromEntries(anos.map((a) => [a, acOp[a] - pcOp[a] + (sa19[a] ?? 0) + caixa[a]]));
  const m = (fn: (a: number) => number | null): SerieN => Object.fromEntries(anos.map((a) => [a, fn(a)]));
  const equilibrioMin = m((a) => (rl[a] && bruto[a] ? div(fixas[a] + despFin[a] + dist[a] + cpltdAnt[a], div(bruto[a], rl[a]) || 0) : null));
  const valores: Record<string, SerieN> = {
    alav_total: m((a) => (ebitda[a] > 0 ? divida[a] / ebitda[a] : null)),
    liquidez: m((a) => div(ativoC[a], passivoC[a])),
    capacidade: m((a) => (cpltd[a] + despFin[a] > 0 ? ebitda[a] / (cpltd[a] + despFin[a]) : null)),
    equilibrio: m((a) => rb[a]),
    solvencia: m((a) => div(pl[a], ativo[a])),
    divida_ativo: m((a) => div(ativo[a] - pl[a], ativo[a])),                                          // todo o exigível (ativo − patrimônio líquido), como no Fechamento Financeiro
    alav_liquida: m((a) => (ebitda[a] > 0 ? Math.max((divida[a] - caixa[a]) / ebitda[a], 0) : null)),
    margem_ebitda: m((a) => div(ebitda[a], rl[a])),
    alav_operacional: m((a) => div(sp07[a] + sp08[a] + spauto[a], cpv[a] + estoques[a] + caixa[a])),
    roic: m((a) => div(ebit[a], capital[a])),
    roe: m((a) => div(lucro[a], pl[a])),
  };
  return { valores, equilibrioMin };
}

// Os mesmos indicadores com o balanço e a DRE realizados (anos fechados anteriores ao orçamento). A distribuição de lucros não vem do realizado.
async function indicadoresRealizados(bd: Bd, primeiroAno: number) {
  let anos: number[] = (await bd.q("SELECT a.ano FROM realizado_anos a JOIN realizado_anos b ON b.ano=a.ano AND b.demonstrativo='DRE' WHERE a.demonstrativo='BP' AND a.ano<? ORDER BY a.ano", [primeiroAno])).map((r) => r.ano);
  const cont = new Map<string, number>();
  for (const r of await bd.q("SELECT demonstrativo, codigo, ano, valor FROM realizado")) cont.set(`${r.demonstrativo}|${r.codigo}|${r.ano}`, r.valor);
  const [parcial] = await bd.q("SELECT ano, meses, mes_inicio FROM realizado_parcial_anos WHERE ano<? ORDER BY ano DESC LIMIT 1", [primeiroAno]);
  const meses: Record<number, string> = {};
  if (parcial) {                                                                                       // ano em andamento (ex.: jan a jun): DRE do período e balanço do último dia dele
    meses[parcial.ano] = real.rotuloPeriodo(parcial.mes_inicio, parcial.meses);
    anos = [...anos, parcial.ano];
    for (const r of await bd.q("SELECT demonstrativo, codigo, ano, valor FROM realizado_parcial WHERE ano=?", [parcial.ano])) cont.set(`${r.demonstrativo}|${r.codigo}|${r.ano}`, r.valor);
  }
  if (!anos.length) return { anos: [] as number[], valores: {} as Record<string, SerieN>, meses: {} as Record<number, string> };
  const serie = (dem: string, cod: string, sinal = 1): Serie => Object.fromEntries(anos.map((a) => [a, (sinal * (cont.get(`${dem}|${cod}|${a}`) ?? 0)) / MIL]));
  const bal = (cod: string) => serie("BP", cod), dr = (cod: string) => serie("DRE", cod);
  const z: Serie = Object.fromEntries(anos.map((a) => [a, 0]));
  const cpltd = bal("SP12");
  const cpltdAnt: Serie = Object.fromEntries(anos.map((a) => [a, a - 1 in cpltd ? cpltd[a - 1] : (cont.get(`BP|SP12|${a - 1}`) ?? 0) / MIL]));
  const { valores } = formulasIndicadores(anos, dr("DS044"), dr("DS048"), dr("DS062"), dr("DS018"), dr("DS007"), serie("DRE", "DS020", -1), dr("DS027"), serie("DRE", "DS030", -1), serie("DRE", "DS053", -1), z, cpltdAnt, bal);
  return { anos, valores, meses };
}

export async function indicadores(bd: Bd, vid: number, fl: any = null) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const d = await dados(bd, vid, fl);
  const metas = await metasDe(bd, vid);
  const base: any = { versao: v, anos, anos_realizados: [], estrutura: d !== null, indicadores: [], endividamento: [] };
  if (d === null) return base;
  const { bal, dr, ini } = d;
  const ebitda = dr("DS044"), ebit = dr("DS048"), lucro = dr("DS062"), rl = dr("DS018"), rb = dr("DS007");
  const cpv = neg(anos, dr("DS020")), bruto = dr("DS027"), fixas = neg(anos, dr("DS030")), despFin = neg(anos, dr("DS053"));
  const dist = d.dist;
  const s = (...cods: string[]) => soma(anos, ...cods.map((c) => bal(c)));
  const cpltd = bal("SP12");
  const cpltdAnt: Serie = Object.fromEntries(anos.map((a) => [a, a - 1 in cpltd ? cpltd[a - 1] : ini.SP12 ?? 0]));
  const { valores, equilibrioMin } = formulasIndicadores(anos, ebitda, ebit, lucro, rl, rb, cpv, bruto, fixas, despFin, dist, cpltdAnt, bal);
  const rz = await indicadoresRealizados(bd, anos[0]);
  base.anos_realizados = rz.anos;
  base.meses_realizados = rz.meses ?? {};                                                              // ano em andamento: meses fechados
  for (const [cod, nome, sentido, padrao, casas, pct] of INDICADORES) {
    const meta: SerieN = cod === "equilibrio" ? equilibrioMin : Object.fromEntries(anos.map((a) => [a, metas[cod]?.[a] ?? padrao]));
    const serie = valores[cod];
    const status: Record<number, boolean | null> = {};
    for (const a of anos) { const x = serie[a], m = meta[a]; status[a] = x === null || m === null ? null : sentido === "min" ? x >= m : x <= m; }
    base.indicadores.push({ codigo: cod, nome, sentido, casas, percentual: pct, valores: serie, meta, atende: status, meta_editavel: cod !== "equilibrio", realizado: rz.valores[cod] ?? {} });
  }
  const cp = s("SP08", "SPAUTO"), lp = s("SP17", "SP18"), cplt = cpltd;
  const total = soma(anos, cp, lp, cplt);
  const pc = (x: Serie): Serie => Object.fromEntries(anos.map((a) => [a, total[a] ? x[a] / total[a] : 0]));
  base.endividamento = [
    linha("cp", "Dívida de curto prazo (custeio, capital de giro e automática)", cp), linha("cpltd", "CPLTD (parcela de curto prazo da dívida de investimento)", cplt),
    linha("lp", "Dívida de longo prazo", lp), linha("total", "Dívida bancária total", total, "Soma das três linhas.", "total"),
    linha("p_cp", "% curto prazo", pc(cp)), linha("p_cpltd", "% CPLTD", pc(cplt)), linha("p_lp", "% longo prazo", pc(lp)),
    linha("desp_fin", "Despesas financeiras", despFin, "Juros do ano (DRE)."),
    linha("custo", "Custo da dívida (despesas financeiras ÷ dívida total)", Object.fromEntries(anos.map((a) => [a, total[a] ? despFin[a] / total[a] : 0])), "", "total")];
  return base;
}
