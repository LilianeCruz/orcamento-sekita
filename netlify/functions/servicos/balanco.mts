// Balanço patrimonial (BP Sintético do Fechamento Contábil, o balanço pequeno). Somente leitura: os valores NÃO são digitados. Porte de app/servicos/balanco.py.
// Cada conta recebe, em R$ mil e por ano (saldo em 31/12): estoque (Resultado por produto), dívidas (Endividamento + novas captações), resultado do exercício (DRE),
// capital de giro, investimentos, depreciação acumulada, patrimônio, caixa e dívida de giro automática (Fluxo de caixa) e premissas de balanço.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, obterVersao } from "./base.mts";
import * as cap from "./captacoes.mts";
import * as cg from "./capital-giro.mts";
import * as dividas from "./dividas.mts";
import * as dre from "./dre.mts";
import * as fluxo from "./fluxo.mts";
import * as inv from "./investimentos.mts";
import * as pat from "./patrimonio.mts";
import * as pd from "./premissas-dem.mts";
import * as real from "./realizado.mts";
import { calcularResultado } from "./resultado.mts";

const MIL = 1000;
type Serie = Record<number, number>;
const RAIZ_ATIVO = "SA", RAIZ_PASSIVO = "SP";
const LINHA_ESTOQUE = "SA10", LINHA_RESULTADO = "SP26";
export const LINHA_ESTOQUE_GADO = "SA10G";              // linha só do orçamento: estoque de gado de corte, separado do estoque de produtos acabados
// Capital de giro → conta do balanço
const LINHAS_CAPITAL_GIRO: Record<string, string> = { receber: "SA08", outros_creditos: "SA09", realizavel: "SA17", participacoes: "SA18", intangivel: "SA27",
  consorcios_curto: "SP13", consorcios_longo: "SP19", outras_lp: "SP20", rotacao: "SA13", preparo: "SA14", insumos: "SA11", lavoura: "SA12",
  fornecedores: "SP07", outras: "SP10", trabalhistas: "SP11", impostos: "SP09" };
const LINHAS_DIVIDA: Record<string, string> = { "curto|giro": "SP08", "curto|invest": "SP12", "longo|giro": "SP17", "longo|invest": "SP18" };

// as chaves de origem que eram tuplas no Python viram "a|b"
const COMO: Record<string, string> = {
  estoque_gado: "Valor a custo do gado de corte estocado para o ano seguinte (Resultado por produto, produtos marcados com estoque em gado): quantidade estocada × custo médio do ano.",
  estoque: "Valor a custo da produção estocada para o ano seguinte (Resultado por produto, soma das culturas): quantidade estocada × custo médio do ano.",
  resultado: "Lucro Líquido do ano da DRE (saldo do exercício).",
  depreciacao: "Depreciação acumulada do último balanço realizado, menos a depreciação de cada ano (bens existentes e novos investimentos, tela Investimentos), acumulada ano a ano. Fica negativa.",
  patrimonio: "Patrimônio líquido projetado (tela Premissas de dividendos): lucros acumulados = saldo anterior + resultado do ano anterior − distribuição de lucros; capital = saldo anterior + aportes; ajustes de avaliação = saldo anterior + variação. O saldo anterior do primeiro ano é o do último balanço realizado.",
  mantem: "Mantém o saldo do último balanço realizado, sem variação, porque esta conta ainda não tem módulo nem regra no orçamento: o que já existia na empresa carrega para frente. Investimentos, desinvestimentos e premissas de balanço vinculados a ela somam sobre esse saldo.",
  investimentos: "Saldo do último balanço realizado + investimentos do ano − desinvestimentos do ano, acumulado ano a ano, dos tipos de investimento vinculados a esta conta (tela Investimentos). A depreciação está na depreciação acumulada.",
  "cg|receber": "Contas a receber do Capital de giro: receita líquida × prazo médio de receber ÷ dias do ano.",
  ...Object.fromEntries(["realizavel", "participacoes", "intangivel", "consorcios_curto", "consorcios_longo", "outras_lp"].map((k) => [`cg|${k}`,
    "Saldo digitado por ano, ou a média dos saldos dos anos fechados que você escolheu ao gravar (tela Capital de giro, contas de saldo). Enquanto nada for gravado, a conta mantém o saldo do último balanço realizado."])),
  "cg|outros_creditos": "Outros créditos a receber do Capital de giro: saldo digitado por ano, ou a média dos saldos dos anos fechados que você escolheu ao gravar.",
  "cg|rotacao": "Rotação de cultura a apropriar do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
  "cg|preparo": "Preparo de solo e despesas a apropriar do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
  "cg|insumos": "Estoque de insumos do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
  "cg|lavoura": "Lavoura em formação do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
  "cg|fornecedores": "Fornecedores do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
  "cg|outras": "Outras obrigações do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
  "cg|impostos": "Impostos a pagar do Capital de giro: deduções da receita × prazo médio ÷ dias do ano.",
  "cg|trabalhistas": "Obrigações trabalhistas do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
  caixa: "Caixa de fechamento do Fluxo de caixa: caixa do ano anterior + fluxo do ano (operacional, investimentos e financiamentos) + dívida de giro automática gerada, ou − a que foi amortizada com a sobra de caixa. Nunca fica abaixo do caixa mínimo (% do custo de produção do Capital de giro) porque o sistema gera dívida de giro.",
  "curto|giro": "Principal em aberto em 31/12 que vence até 31/12 do ano seguinte, dos tipos Custeio, Capital de Giro e demais (exceto Investimento), todas as empresas do Endividamento, mais as novas captações de custeio e capital de giro. A dívida de giro gerada pelo Fluxo de caixa aparece na linha própria logo abaixo.",
  divida_auto: "Dívida de curto prazo gerada automaticamente pelo Fluxo de caixa quando o caixa ficaria abaixo do mínimo (% do custo de produção do Capital de giro). Em cada ano: saldo anterior + dívida gerada − a amortizada com a sobra de caixa. Os juros dela estão nas despesas financeiras da DRE. Substitui o plug de dívida da planilha.",
  "curto|invest": "Principal em aberto em 31/12 que vence até 31/12 do ano seguinte, do tipo Investimento (parcela de curto prazo), todas as empresas do Endividamento, mais o financiamento dos investimentos (tela Investimentos).",
  "longo|giro": "Principal em aberto em 31/12 que vence depois de 31/12 do ano seguinte, dos tipos Custeio, Capital de Giro e demais (exceto Investimento), todas as empresas, mais as novas captações de custeio e capital de giro.",
  "longo|invest": "Principal em aberto em 31/12 que vence depois de 31/12 do ano seguinte, do tipo Investimento, todas as empresas do Endividamento, mais o financiamento dos investimentos (tela Investimentos).",
};
const TEXTO_ORIGEM: Record<string, string> = { estoque: "Resultado por produto · estoque", estoque_gado: "Resultado por produto · estoque de gado", resultado: "DRE · lucro líquido", investimentos: "Investimentos · tipos vinculados",
  mantem: "Balanço realizado · saldo mantido", caixa: "Fluxo de caixa · caixa de fechamento", divida_auto: "Fluxo de caixa · dívida de giro automática", patrimonio: "Premissas de dividendos", depreciacao: "Investimentos · depreciação",
  ...Object.fromEntries(Object.keys(LINHAS_CAPITAL_GIRO).map((k) => [`cg|${k}`, "Capital de giro · " + k])),
  "curto|giro": "Endividamento · curto prazo", "curto|invest": "Endividamento · curto prazo investimento", "longo|giro": "Endividamento · longo prazo", "longo|invest": "Endividamento · longo prazo investimento" };

export interface LinhaBp { codigo: string; nome: string; pai: string; tipo: string; ordem: number; ativa: number; nivel_hierarquia: number; filhos: string[]; calculo: string; }

// Insere no ativo circulante, logo depois do estoque de produtos acabados, a linha do estoque de gado de corte (entra na soma do grupo).
function comEstoqueGado(est: LinhaBp[]): LinhaBp[] {
  const i = est.findIndex((l) => l.codigo === LINHA_ESTOQUE);
  if (i < 0) return est;
  const ref = est[i];
  const nova: LinhaBp = { ...ref, codigo: LINHA_ESTOQUE_GADO, nome: "Estoque de gado de corte", filhos: [], calculo: "entrada", tipo: "account", ordem: (ref.ordem ?? 0) + 0.5 };
  const pai = est.find((l) => l.codigo === ref.pai);
  if (pai) pai.filhos = [...pai.filhos, LINHA_ESTOQUE_GADO];
  return [...est.slice(0, i + 1), nova, ...est.slice(i + 1)];
}

export async function estrutura(bd: Bd): Promise<LinhaBp[]> {
  const rows: any[] = await bd.q('SELECT * FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo COLLATE "C"');
  const porPai = new Map<string, any[]>();
  for (const r of rows) { if (!porPai.has(r.pai)) porPai.set(r.pai, []); porPai.get(r.pai)!.push(r); }
  const ordenada: LinhaBp[] = [];
  const visitar = (pai: string, nivel: number) => {
    for (const r of porPai.get(pai) ?? []) {
      const filhos = porPai.get(r.codigo) ?? [];
      r.nivel_hierarquia = nivel; r.filhos = filhos.map((f) => f.codigo);
      r.calculo = filhos.length ? "soma" : r.tipo === "account" ? "entrada" : "sem_formula";
      ordenada.push(r);
      visitar(r.codigo, nivel + 1);
    }
  };
  visitar("", 0);
  return comEstoqueGado(ordenada);
}

export function calcularEstrutura(est: LinhaBp[], entradas: Record<string, Serie>, anos: number[]): Record<string, Serie> {
  const porCodigo = new Map(est.map((l) => [l.codigo, l]));
  const memo: Record<string, Serie> = {};
  const zero = (): Serie => Object.fromEntries(anos.map((a) => [a, 0]));
  const valor = (c: string): Serie => {
    if (c in memo) return memo[c];
    memo[c] = zero();
    const l = porCodigo.get(c);
    if (!l) return memo[c];
    if (l.calculo === "entrada") memo[c] = Object.fromEntries(anos.map((a) => [a, entradas[c]?.[a] ?? 0]));
    else if (l.calculo === "soma") memo[c] = Object.fromEntries(anos.map((a) => [a, l.filhos.reduce((t, f) => t + valor(f)[a], 0)]));
    return memo[c];
  };
  for (const l of est) valor(l.codigo);
  return memo;
}

const ehInvestimento = (tipo: string) => (tipo || "").trim().toLowerCase().startsWith("invest");

// (valores por conta, origem de cada conta, premissas por conta, extras). Sem o caixa e sem a dívida de giro automática: eles vêm do fluxo de caixa.
export async function origens(bd: Bd, vid: number, est: LinhaBp[], anos: number[], jurosAuto: Serie): Promise<[Record<string, Serie>, Record<string, string>, Record<string, string[]>, any]> {
  const contas = new Set(est.filter((l) => l.calculo === "entrada").map((l) => l.codigo));
  const auto: Record<string, Serie> = {}, origem: Record<string, string> = {};
  const somar = (cod: string, serie: Serie, chave: string) => {
    if (!contas.has(cod)) return;
    const acc = (auto[cod] ??= Object.fromEntries(anos.map((a) => [a, 0])));
    for (const a of anos) acc[a] += serie[a] ?? 0;
    origem[cod] = chave;
  };
  const res: any = await calcularResultado(bd, vid);
  const est1 = (res.consolidado.estoque ?? []).find((l: any) => l.id === "estoque_valor"), estGado = (res.consolidado.estoque ?? []).find((l: any) => l.id === "estoque_valor_gado");
  const num = (o: any): Serie => Object.fromEntries(Object.entries(o).map(([a, v]) => [Number(a), v as number]));
  const gado = estGado ? num(estGado.valores) : {}, total = est1 ? num(est1.valores) : {};
  somar(LINHA_ESTOQUE, Object.fromEntries(Object.entries(total).map(([a, v]) => [a, v - (gado[Number(a)] ?? 0)])), "estoque");
  somar(LINHA_ESTOQUE_GADO, gado, "estoque_gado");
  const d: any = await dre.ler(bd, vid, jurosAuto);
  const ll = d.linhas.find((l: any) => l.codigo === "DS062");
  if (ll) somar(LINHA_RESULTADO, num(ll.valores), "resultado");
  const cgl: Record<string, any> = {};
  for (const sec of (await cg.ler(bd, vid)).resultado) for (const l of sec.linhas) cgl[l.id] = l;
  const extras: any = { cg: cgl };
  for (const [chave, cod] of Object.entries(LINHAS_CAPITAL_GIRO))
    if (chave in cgl && (cgl[chave].informado ?? true)) somar(cod, num(cgl[chave].valores), `cg|${chave}`);       // conta de saldo sem nada gravado: mantém o saldo realizado
  const ini = await real.saldoInicial(bd, anos[0]);
  for (const [cod, fl] of Object.entries(await inv.efeitosBalanco(bd, vid, anos))) {                                  // conta padrão dos investimentos: saldo realizado + investido − desinvestido
    let saldo = ini ? ini.valores[cod] ?? 0 : 0;
    const serie: Serie = {};
    for (const a of anos) { saldo += fl[a]; serie[a] = saldo; }
    somar(cod, serie, "investimentos");
  }
  const dep = await inv.depreciacao(bd, vid, anos);                                                                   // depreciação acumulada: saldo realizado (negativo) − depreciação de cada ano
  if (dep.existente || Object.values(dep.total).some((x) => x)) {
    let acumulada = dep.existente ? dep.existente.acumulada : 0;
    const serie: Serie = {};
    for (const a of anos) { acumulada -= dep.total[a]; serie[a] = acumulada; }
    somar("SA26", serie, "depreciacao");
  }
  const db: any = await dividas.balanco(bd, vid, "todas");
  const novas = await cap.calcular(bd, vid, anos);                                                                    // novas captações e financiamento dos investimentos (já em R$ mil)
  for (const prazo of ["curto", "longo"]) for (const grupo of ["giro", "invest"]) {
    const serie: Serie = Object.fromEntries(anos.map((a) => [a, 0]));
    for (const [tipo, porAno] of Object.entries(db[prazo] as Record<string, Serie>)) if (ehInvestimento(tipo) === (grupo === "invest")) for (const a of anos) serie[a] += (porAno[a] ?? 0) / MIL;
    for (const c of novas) if (c.grupo === grupo) for (const a of anos) serie[a] += c[prazo][a];
    somar(LINHAS_DIVIDA[`${prazo}|${grupo}`], serie, `${prazo}|${grupo}`);
  }
  const p = await pat.calcular(bd, vid, anos, jurosAuto);
  extras.patrimonio = p;
  for (const [cod, serie] of Object.entries(pat.efeitosDeCalculo(p))) somar(cod, serie, "patrimonio");                  // lucros acumulados, capital e ajustes de avaliação
  if (ini) for (const cod of [...contas].sort()) {                                                                    // o que já existe na empresa carrega para frente
    if (cod in origem || ini.valores[cod] === undefined || ini.valores[cod] === null) continue;
    somar(cod, Object.fromEntries(anos.map((a) => [a, ini.valores[cod]])), "mantem");
  }
  const prem: Record<string, string[]> = {};
  for (const [cod, lista] of Object.entries(await pd.efeitos(bd, vid, "balanco", anos))) {
    if (!contas.has(cod)) continue;
    const acc = (auto[cod] ??= Object.fromEntries(anos.map((a) => [a, 0])));
    for (const x of lista) { for (const a of anos) acc[a] += x.valores[a]; (prem[cod] ??= []).push(x.nome); }
  }
  return [auto, origem, prem, extras];
}

export const CODIGO_DIVIDA_AUTO = "SPAUTO";              // linha só do orçamento: não existe no balanço do Fechamento Contábil

// Insere no passivo circulante, logo depois de SP08, a linha da dívida de giro gerada pelo fluxo de caixa (entra na soma do grupo).
function comDividaAutomatica(est: LinhaBp[]): LinhaBp[] {
  const i = est.findIndex((l) => l.codigo === "SP08");
  if (i < 0) return est;
  const ref = est[i];
  const nova: LinhaBp = { ...ref, codigo: CODIGO_DIVIDA_AUTO, nome: "Dívida de giro automática (gerada pelo fluxo de caixa)", filhos: [], calculo: "entrada", tipo: "account", ordem: (ref.ordem ?? 0) + 0.5 };
  const pai = est.find((l) => l.codigo === ref.pai);
  if (pai) pai.filhos = [...pai.filhos, CODIGO_DIVIDA_AUTO];
  return [...est.slice(0, i + 1), nova, ...est.slice(i + 1)];
}

function textoOrigem(origem: string | undefined, premissas: string[] | undefined): string | null {
  const base = origem !== undefined ? TEXTO_ORIGEM[origem] : undefined;
  if (premissas && premissas.length) return base ? `${base} + premissas` : "Premissas · valores digitados";
  return base ?? null;
}

function explicacao(l: LinhaBp, porCodigo: Map<string, LinhaBp>, origem: string | undefined, premissas: string[]): string {
  const nome = (c: string) => (porCodigo.has(c) ? porCodigo.get(c)!.nome : c);
  if (l.calculo === "soma") return "Soma das linhas abaixo: " + l.filhos.map(nome).join("; ") + ".";
  if (l.calculo !== "entrada") return "";
  const extra = premissas.length ? ` Inclui as premissas de balanço vinculadas a esta conta: ${premissas.join(", ")} (valor digitado, ou % sobre o campo base, com o sinal da premissa).` : "";
  if (origem !== undefined) return COMO[origem] + extra;
  if (premissas.length) return `Soma das premissas de balanço vinculadas a esta conta: ${premissas.join(", ")} (valor digitado, ou % sobre o campo base, com o sinal da premissa; em R$).`;
  return "Ainda não há módulo do orçamento nem premissa vinculada a esta conta; fica zerada até existir.";
}

// fl: resultado de fluxo.projetar, quando quem chama já o calculou (evita refazer).
export async function ler(bd: Bd, vid: number, fl: any = null) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const base: any = { versao: v, anos, linhas: [], estrutura: false };
  let est = await estrutura(bd);
  if (!est.length) return base;
  fl = fl || (await fluxo.projetar(bd, vid));                                                       // caixa de fechamento e dívida de giro automática (já com os juros convergidos)
  let auto: Record<string, Serie>, origem: Record<string, string>, prem: Record<string, string[]>, calc: Record<string, Serie>;
  if (fl.ativo) {
    auto = fl.auto; origem = fl.origem; prem = fl.prem;
    auto.SA07 = { ...fl.caixa }; origem.SA07 = "caixa";
    est = comDividaAutomatica(est);                                                                 // linha própria, logo abaixo da dívida de custeio e capital de giro
    auto[CODIGO_DIVIDA_AUTO] = { ...fl.divida }; origem[CODIGO_DIVIDA_AUTO] = "divida_auto";
    calc = calcularEstrutura(est, auto, anos);                                                      // as premissas percentuais já foram aplicadas dentro do fluxo de caixa
  } else {
    const zero: Serie = Object.fromEntries(anos.map((a) => [a, 0]));
    [auto, origem, prem] = await origens(bd, vid, est, anos, zero);
    const [c2, , nomesPct] = await pd.aplicarPercentuais(bd, vid, "balanco", anos, auto, (e) => calcularEstrutura(est, e, anos));      // premissas percentuais: % × campo base
    calc = c2;
    for (const [cod, nomes] of Object.entries(nomesPct)) (prem[cod] ??= []).push(...nomes);
  }
  const porCodigo = new Map(est.map((l) => [l.codigo, l]));
  const linhas: any[] = est.map((l) => ({ codigo: l.codigo, nome: l.nome, pai: l.pai, nivel: l.nivel_hierarquia, calculo: l.calculo, unidade: "R$ mil", valores: calc[l.codigo],
    origem: textoOrigem(origem[l.codigo], prem[l.codigo]), premissas: prem[l.codigo] ?? [], explicacao: explicacao(l, porCodigo, origem[l.codigo], prem[l.codigo] ?? []) }));
  if (RAIZ_ATIVO in calc && RAIZ_PASSIVO in calc)                                                    // conferência do balanço
    linhas.push({ codigo: "DIF", nome: "Diferença (Ativo − Passivo e patrimônio líquido)", pai: "", nivel: 0, calculo: "diferenca", unidade: "R$ mil",
      valores: Object.fromEntries(anos.map((a) => [a, calc[RAIZ_ATIVO][a] - calc[RAIZ_PASSIVO][a]])), origem: null, premissas: [],
      explicacao: "Ativo total − Passivo e patrimônio líquido total. Fica diferente de zero enquanto houver contas sem origem; o balanço fecha quando a diferença for zero." });
  const ini = await real.saldoInicial(bd, anos[0]);                                                  // balanço realizado do último ano fechado, antes do horizonte
  if (ini) {
    const val = ini.valores;
    for (const l of linhas) if (l.calculo !== "diferenca") l.inicial = val[l.codigo] ?? null;
    for (const l of linhas) if (l.calculo === "diferenca") l.inicial = (val[RAIZ_ATIVO] ?? 0) - (val[RAIZ_PASSIVO] ?? 0);
    base.saldo_inicial = { ano: ini.ano, meses: ini.meses ?? null };
  }
  Object.assign(base, { linhas, estrutura: true });
  return base;
}

export async function comparar(bd: Bd, aId: number, bId: number) {
  const la = await ler(bd, aId), lb = await ler(bd, bId);
  const anos = la.anos.filter((a: number) => lb.anos.includes(a)).sort((x: number, y: number) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ib = new Map<string, any>(lb.linhas.map((l: any) => [l.codigo, l]));
  const linhas = (la.linhas.length ? la.linhas : lb.linhas).map((l: any) => {
    const va = l.valores, vb = (ib.get(l.codigo) ?? l).valores;
    return { codigo: l.codigo, nome: l.nome, nivel: l.nivel, unidade: l.unidade, calculo: l.calculo,
      anos: Object.fromEntries(anos.map((a: number) => [a, { a: va[a] ?? 0, b: vb[a] ?? 0, delta: (vb[a] ?? 0) - (va[a] ?? 0), pct: va[a] ? (((vb[a] ?? 0) - (va[a] ?? 0)) / Math.abs(va[a])) * 100 : null }])) };
  });
  return { a: la.versao, b: lb.versao, anos, linhas };
}
