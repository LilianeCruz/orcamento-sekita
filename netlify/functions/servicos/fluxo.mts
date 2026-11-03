// Motor do caixa: caixa de fechamento e dívida de giro automática, ano a ano. Porte de app/servicos/fluxo.py.
// Não é o demonstrativo de fluxo de caixa: serve para calcular o caixa do balanço.
//   Fluxo do ano (variação de cada conta do balanço, antes do caixa e da dívida automática): operacional + investimentos + financiamento.
//   Dívida de giro automática: se o caixa antes dela ficar abaixo do mínimo, o sistema gera dívida; se sobrar, amortiza o saldo; os juros incidem sobre o saldo médio
//   e reduzem o caixa do mesmo ano (solução direta); como a DRE e o imposto também dependem dos juros, o cálculo repete até convergir.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import * as balanco from "./balanco.mts";
import * as inv from "./investimentos.mts";
import * as pd from "./premissas-dem.mts";
import * as real from "./realizado.mts";

type Serie = Record<number, number>;
const ORIGENS: Record<number, string> = { 0: "Digitar a taxa", 1: "Média das captações de custeio do ano", 2: "Média das captações de capital de giro do ano" };
const CONTA_CAIXA = "SA07";
const NCG_ATIVO = ["SA08", "SA10", "SA10G", "SA11", "SA12", "SA13", "SA14"];
const NCG_PASSIVO = ["SP07", "SP09", "SP10", "SP11"];
const DIVIDAS = ["SP08", "SP12", "SP17", "SP18"];
const DEPRECIACAO = "SA26";
const CAPITAL_AJUSTES = ["SP23", "SP24"];
const LUCROS = "SP25", RESULTADO = "SP26";
const MAX_VOLTAS = 12, TOLERANCIA = 1e-6;

// ---------------------------------------------------------------- premissas da taxa da dívida automática
async function premissasDe(bd: Bd, vid: number): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = { origem: {}, taxa: {} };
  for (const r of await bd.q("SELECT campo, ano, valor FROM giro_auto_premissas WHERE versao_id=?", [vid])) (d[r.campo] ??= {})[r.ano] = r.valor;
  return d;
}
const UPSERT = "INSERT INTO giro_auto_premissas(versao_id, campo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarPremissa(bd: Bd, vid: number, campo: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  if (campo !== "origem" && campo !== "taxa") throw Invalido("Campo inválido");
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (campo === "origem" && !(Math.trunc(valor) in ORIGENS)) throw Invalido("A origem da taxa deve ser: 0 (digitar), 1 (média de custeio) ou 2 (média de capital de giro)");
  if (campo === "taxa" && !(valor >= 0 && valor <= 100)) throw Invalido("A taxa de juros fica entre 0 e 100% ao ano");
  await bd.q(UPSERT, [vid, campo, ano, campo === "origem" ? Math.trunc(valor) : valor]);
  await auditar(bd, autor, vid, "salvar_taxa_divida_giro", `${campo} ${ano}: ${valor}`);
}

export async function replicarPremissa(bd: Bd, vid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  if (campo !== "origem" && campo !== "taxa") throw Invalido("Campo inválido");
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const destinos = anos.filter((a) => a > anoOrigem);
  if (!destinos.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  const [r] = await bd.q("SELECT valor FROM giro_auto_premissas WHERE versao_id=? AND campo=? AND ano=?", [vid, campo, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, campo, a, r ? r.valor : 0]);
  await auditar(bd, autor, vid, "replicar_taxa_divida_giro", `${campo}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

// Taxa efetiva (% a.a.) de cada ano, com a origem usada e os avisos.
async function taxasDe(bd: Bd, vid: number, anos: number[]) {
  const prem = await premissasDe(bd, vid);
  const caps = await bd.q("SELECT tipo, ano, valor, taxa FROM novas_captacoes WHERE versao_id=?", [vid]);
  const taxa: Serie = {}, origem: Serie = {}, avisos: string[] = [];
  for (const a of anos) {
    const o = Math.trunc(prem.origem[a] ?? 0);
    origem[a] = o;
    if (o === 0) { taxa[a] = prem.taxa[a] ?? 0; continue; }
    const tipo = o === 1 ? "custeio" : "capital_giro";
    const doAno = caps.filter((c) => c.tipo === tipo && c.ano === a);
    const total = doAno.reduce((t, c) => t + c.valor, 0);
    if (total > 0) taxa[a] = doAno.reduce((t, c) => t + c.valor * c.taxa, 0) / total;
    else { taxa[a] = 0; avisos.push(`${a}: não há captação de ${o === 1 ? "custeio" : "capital de giro"} cadastrada nesse ano para calcular a média; usei taxa zero. Cadastre uma captação ou digite a taxa.`); }
  }
  return { taxa, origem, avisos, premissas: prem };
}

// ---------------------------------------------------------------- cálculo
// Valores da conta em cada ano (antes do caixa e da dívida automática); a chave anos[0]-1 traz o saldo realizado.
function serieDe(auto: Record<string, Serie>, ini: Record<string, number>, cod: string, anos: number[]): Serie {
  const s: Serie = { [anos[0] - 1]: ini[cod] ?? 0 };
  for (const a of anos) s[a] = auto[cod]?.[a] ?? 0;
  return s;
}

async function projetarUmaVolta(bd: Bd, vid: number, est: balanco.LinhaBp[], anos: number[], ini: Record<string, number>, ji: Serie, tx: any) {
  let [auto, origem, prem, extras] = await balanco.origens(bd, vid, est, anos, ji);
  const [, auto2, nomesPct] = await pd.aplicarPercentuais(bd, vid, "balanco", anos, auto, (e) => balanco.calcularEstrutura(est, e, anos));          // premissas percentuais de balanço também movem o caixa
  auto = auto2;
  for (const [cod, nomes] of Object.entries(nomesPct)) (prem[cod] ??= []).push(...nomes);
  const cache = new Map<string, Serie>();
  const sp = (cod: string) => { if (!cache.has(cod)) cache.set(cod, serieDe(auto, ini, cod, anos)); return cache.get(cod)!; };
  const delta = (cod: string): Serie => Object.fromEntries(anos.map((a) => [a, sp(cod)[a] - sp(cod)[a - 1]]));
  const contas = est.filter((l) => l.calculo === "entrada").map((l) => l.codigo);
  const todosAtivos = contas.filter((c) => c.startsWith("SA") && c !== CONTA_CAIXA), todosPassivos = contas.filter((c) => c.startsWith("SP"));
  const f = (fn: (a: number) => number): Serie => Object.fromEntries(anos.map((a) => [a, fn(a)]));
  const somaDelta = (cs: string[], a: number) => cs.reduce((t, c) => t + delta(c)[a], 0);
  const total = f((a) => somaDelta(todosPassivos, a) - somaDelta(todosAtivos, a));                       // variação do caixa pela identidade do balanço
  const cg = extras.cg;
  const minimo = f((a) => ("caixa" in cg ? cg.caixa.valores[a] ?? 0 : 0));
  const pat = extras.patrimonio;
  const lucro = f((a) => auto[RESULTADO]?.[a] ?? 0);
  const dist = f((a) => pat.distribuicao[a]);
  // categorias do fluxo
  const dep = f((a) => -delta(DEPRECIACAO)[a]);
  const ncg = f((a) => -somaDelta(NCG_ATIVO.filter((c) => contas.includes(c)), a) + somaDelta(NCG_PASSIVO.filter((c) => contas.includes(c)), a));
  const imobSet = await inv.contasImobilizado(bd);
  const imob = f((a) => -somaDelta([...imobSet].filter((c) => contas.includes(c)), a));
  const dividas = f((a) => somaDelta(DIVIDAS.filter((c) => contas.includes(c)), a));
  const capAj = f((a) => somaDelta(CAPITAL_AJUSTES.filter((c) => contas.includes(c)), a));
  const outrosPl = f((a) => delta(LUCROS)[a] + delta(RESULTADO)[a] - (lucro[a] - dist[a]));
  const listados = f((a) => lucro[a] + dep[a] + ncg[a] + imob[a] + dividas[a] - dist[a] + capAj[a] + outrosPl[a]);
  const outros = f((a) => total[a] - listados[a]);                                                       // demais contas: saldos, realizável, participações, consórcios etc.
  // caixa e dívida automática
  const caixa: Serie = {}, divida: Serie = {}, juros: Serie = {}, variacao: Serie = {};
  let cAnt = ini[CONTA_CAIXA] ?? 0, dAnt = 0;
  for (const a of anos) {
    const r = tx.taxa[a] / 100;
    const fluxoSemJuros = total[a] + (ji[a] ?? 0);                                                       // o fluxo calculado já tem os juros da volta anterior descontados no lucro
    const k = cAnt + fluxoSemJuros - r * dAnt;
    const n = Math.max((minimo[a] - k) / (1 - r / 2), -dAnt);
    const dNovo = dAnt + n;
    juros[a] = (r * (dAnt + dNovo)) / 2;
    caixa[a] = k + n * (1 - r / 2);
    divida[a] = dNovo; variacao[a] = n;
    cAnt = caixa[a]; dAnt = dNovo;
  }
  return { auto, origem, prem, juros, caixa, divida, variacao, minimo, linhas: { lucro, dep, ncg, outros, imob, dividas, dist, cap_aj: capAj, outros_pl: outrosPl }, total } as any;
}

// Caixa e dívida de giro automática por ano, convergindo os juros. Sem estrutura do balanço, devolve tudo zerado.
export async function projetar(bd: Bd, vid: number): Promise<any> {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const zero: Serie = Object.fromEntries(anos.map((a) => [a, 0]));
  const est = await balanco.estrutura(bd);
  const vazio = { anos, ativo: false, juros_auto: { ...zero }, caixa: { ...zero }, divida: { ...zero }, variacao: { ...zero }, avisos: [] as string[], auto: null, origem: null, prem: null };
  const contas = new Set(est.filter((l) => l.calculo === "entrada").map((l) => l.codigo));
  if (!est.length || !contas.has(CONTA_CAIXA)) return vazio;
  const ini = (await real.saldoInicial(bd, anos[0]))?.valores ?? {};
  const tx = await taxasDe(bd, vid, anos);
  let ji: Serie = { ...zero };
  let res: any = null;
  const dif = (a: Serie, b: Serie) => Math.max(...anos.map((x) => Math.abs(a[x] - b[x])));
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    res = await projetarUmaVolta(bd, vid, est, anos, ini, ji, tx);
    if (dif(res.juros, ji) < TOLERANCIA) break;
    ji = res.juros;
  }
  const avisos = [...tx.avisos];
  if (dif(res.juros, ji) >= 1e-3) avisos.push("Os juros da dívida de giro automática não convergiram por completo; confira o motor do caixa.");
  Object.assign(res, { anos, ativo: true, juros_auto: res.juros, avisos, taxas: tx, saldo_inicial: ini });
  return res;
}

export async function jurosAuto(bd: Bd, vid: number): Promise<Serie> { return (await projetar(bd, vid)).juros_auto; }

// ---------------------------------------------------------------- tela
export async function ler(bd: Bd, vid: number, p: any = null) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  p = p || (await projetar(bd, vid));
  const base: any = { versao: v, anos, estrutura: p.ativo, avisos: p.avisos, linhas: [], premissas: [] };
  const tx = await taxasDe(bd, vid, anos);
  base.premissas = [
    { campo: "origem", nome: "Origem da taxa de juros", valores: Object.fromEntries(anos.map((a) => [a, tx.origem[a]])), opcoes: Object.entries(ORIGENS).map(([k, n]) => ({ id: Number(k), nome: n })) },
    { campo: "taxa", nome: "Taxa digitada (% a.a.)", valores: Object.fromEntries(anos.map((a) => [a, tx.premissas.taxa[a] ?? 0])), },
    { campo: "efetiva", nome: "Taxa usada (% a.a.)", valores: Object.fromEntries(anos.map((a) => [a, tx.taxa[a]])), somente_leitura: true },
  ];
  if (!p.ativo) return base;
  const ini = p.saldo_inicial as Record<string, number>;
  const L = (id: string, nome: string, valores: Serie, expl: string, estilo = "") => ({ id, nome, valores, explicacao: expl, estilo });
  const l = p.linhas;
  const soma = (...ds: Serie[]): Serie => Object.fromEntries(anos.map((a) => [a, ds.reduce((t, d) => t + d[a], 0)]));
  const operacional = soma(l.lucro, l.dep, l.ncg, l.outros);
  const investimentos = l.imob;
  const financiamento = soma(l.dividas, Object.fromEntries(anos.map((a) => [a, -l.dist[a]])), l.cap_aj, l.outros_pl);
  const antes = soma(operacional, investimentos, financiamento);
  const caixaIni: Serie = Object.fromEntries(anos.map((a) => [a, a - 1 in p.caixa ? p.caixa[a - 1] : ini[CONTA_CAIXA] ?? 0]));
  base.linhas = [
    { titulo: "Operacional", linhas: [
      L("lucro", "Lucro líquido do ano", l.lucro, "Lucro líquido da DRE do ano (já com os juros da dívida de giro automática)."),
      L("dep", "(+) Depreciação", l.dep, "Despesa que não sai do caixa: variação da depreciação acumulada."),
      L("ncg", "(−) Variação do capital de giro operacional", l.ncg, "Clientes, estoques, lavoura e despesas a apropriar (aumento consome caixa) menos fornecedores, impostos, outras obrigações e trabalhistas (aumento gera caixa)."),
      L("outros", "(+/−) Outros ativos e passivos", l.outros, "Variação das demais contas do balanço: outros créditos, realizável a longo prazo, participações, intangível, consórcios e outras obrigações de longo prazo."),
      L("operacional", "Operacional", operacional, "Soma das linhas acima.", "total")] },
    { titulo: "Investimentos", linhas: [
      L("imob", "(−) Investimentos líquidos no imobilizado", l.imob, "Variação das contas de imobilizado (sem a depreciação): investimentos menos desinvestimentos.", "total")] },
    { titulo: "Financiamentos", linhas: [
      L("dividas", "(+/−) Captações e amortizações das dívidas", l.dividas, "Variação das dívidas existentes (Endividamento), novas captações e financiamentos de investimentos, sem a dívida de giro automática."),
      L("dist", "(−) Distribuição de lucros", Object.fromEntries(anos.map((a) => [a, -l.dist[a]])), "Lucro de um ano distribuído aos sócios no ano seguinte (tela Patrimônio líquido)."),
      L("cap_aj", "(+/−) Capital e ajustes de avaliação", l.cap_aj, "Variação do capital integralizado e dos ajustes de avaliação patrimonial."),
      L("outros_pl", "(+/−) Outras variações do patrimônio", l.outros_pl, "Qualquer outra variação em lucros acumulados ou no resultado (premissas de balanço)."),
      L("financiamento", "Financiamentos", financiamento, "Soma das linhas acima.", "total")] },
    { titulo: "Caixa e dívida de giro automática", linhas: [
      L("antes", "Variação do caixa antes da dívida de giro automática", antes, "Fluxo operacional + investimentos + financiamentos, sem a dívida de giro automática e com os juros dela já descontados."),
      L("variacao", "(+/−) Dívida de giro automática: geração (+) ou amortização (−)", p.variacao, "Gerada quando o caixa ficaria abaixo do mínimo; a sobra amortiza o saldo desta dívida."),
      L("caixa_ini", "Caixa no início do ano", caixaIni, "Caixa do fim do ano anterior (o primeiro vem do último balanço realizado)."),
      L("caixa_fim", "Caixa no fim do ano", p.caixa, "Caixa do início + variação do caixa. Vai para Caixa e aplicações financeiras do balanço.", "total"),
      L("minimo", "Caixa mínimo", p.minimo, "% do custo de produção informado no Capital de giro (Caixa mínimo)."),
      L("divida", "Saldo da dívida de giro automática", p.divida, "Saldo em 31/12; aparece no passivo circulante do balanço na linha própria \"Dívida de giro automática\", logo abaixo da dívida de custeio e capital de giro."),
      L("juros", "Juros da dívida de giro automática", p.juros_auto, "Taxa × saldo médio do ano (meio do ano na geração). Vai para as despesas financeiras da DRE.")] },
  ];
  return base;
}
