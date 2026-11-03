// Investimentos e desinvestimentos (orçamento anual, R$ mil) e depreciação. Porte de app/servicos/investimentos.py.
//
// Cadastro único de TIPOS (vale para todas as versões): nome, natureza (investimento ou desinvestimento), conta padrão do balanço (ativo),
// classificação e, só nos investimentos, se "carrega o saldo do ano anterior".
// Por versão e ano: investimento que carrega saldo = saldo do ano anterior + novo orçamento = total a investir; investido = total − saldo a carregar.
// Depreciação: bens existentes (taxa média × base depreciável) e, por tipo, cada ano investido forma uma safra que deprecia em linha reta.
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel, type Versao } from "./base.mts";
import { fmt0, fmtG, nomeMin } from "./comum.mts";
import * as pd from "./premissas-dem.mts";
import * as real from "./realizado.mts";

const NATUREZAS = ["investimento", "desinvestimento"];
const CAMPOS = ["novo", "a_carregar", "saldo_ini", "financiado"];
const RAIZ_ATIVO = "SA";
type Serie = Record<number, number>;
type Valores = Record<number, Record<string, Serie>>;
const zeros = (anos: number[]): Serie => Object.fromEntries(anos.map((a) => [a, 0]));

// ---------------------------------------------------------------- classificações
export async function classificacoes(bd: Bd) {
  const uso = new Map((await bd.q("SELECT classificacao_id, COUNT(*) AS n FROM investimento_tipos GROUP BY classificacao_id")).map((r) => [r.classificacao_id, r.n]));
  return (await bd.q("SELECT * FROM investimento_classificacoes ORDER BY id")).map((r) => ({ id: r.id, nome: r.nome, ativa: !!r.ativa, em_uso: (uso.get(r.id) ?? 0) > 0 }));
}

export async function criarClassificacao(bd: Bd, nome: string, autor: string): Promise<number> {
  nome = (nome || "").trim();
  if (!nome) throw Invalido("Informe o nome da classificação");
  if ((await bd.q("SELECT 1 FROM investimento_classificacoes WHERE lower(nome)=lower(?)", [nome])).length) throw Invalido(`Já existe a classificação '${nome}'`);
  const [r] = await bd.q("INSERT INTO investimento_classificacoes(nome) VALUES(?) RETURNING id", [nome]);
  await auditar(bd, autor, null, "criar_classificacao_investimento", nome);
  return r.id;
}

// ---------------------------------------------------------------- contas do balanço que aceitam investimento
export async function contas(bd: Bd) {
  return (await pd.contas(bd, "balanco")).filter((c: any) => c.codigo.startsWith(RAIZ_ATIVO));
}

async function conta(bd: Bd, codigo: string) {
  const lista = await contas(bd);
  if (!lista.length) throw Invalido("Importe antes a estrutura do Fechamento Contábil na tela DRE: ela traz as contas do balanço");
  const c = lista.find((x: any) => x.codigo === codigo);
  if (!c) throw Invalido("Escolha uma conta do ativo do balanço (a que recebe o investimento)");
  return c;
}

// ---------------------------------------------------------------- cadastro de tipos
const pyFloat = (x: any) => (x ? Number(x) : 0);
async function validar(bd: Bd, d: any, tid = 0) {
  const nome = String(d.nome ?? "").trim();
  if (!nome) throw Invalido("Informe o nome do tipo de investimento");
  if (!NATUREZAS.includes(d.natureza)) throw Invalido("A natureza deve ser investimento ou desinvestimento");
  const c = await conta(bd, String(d.conta_codigo || ""));
  if (!(await bd.q("SELECT 1 FROM investimento_classificacoes WHERE id=?", [d.classificacao_id ?? null])).length) throw Invalido("Escolha a classificação");
  if ((await bd.q("SELECT 1 FROM investimento_tipos WHERE lower(nome)=lower(?) AND id<>?", [nome, tid])).length) throw Invalido(`Já existe um tipo chamado '${nome}'`);
  const carrega = d.natureza === "investimento" && d.carrega_saldo ? 1 : 0;      // desinvestimento nunca carrega saldo
  let vida = pyFloat(d.vida_util), residual = pyFloat(d.residual_pct), carencia = Math.trunc(pyFloat(d.carencia));
  if (vida < 0 || vida > 100) throw Invalido("A vida útil fica entre 0 e 100 anos (0 = não deprecia)");
  if (residual < 0 || residual >= 100) throw Invalido("O valor residual é um percentual entre 0 e 100");
  if (carencia < 0 || carencia > 50) throw Invalido("A carência é um número de anos entre 0 e 50");
  if (d.natureza !== "investimento") { vida = 0; residual = 0; carencia = 0; }          // só investimento deprecia
  return { nome, natureza: d.natureza as string, conta_codigo: c.codigo as string, classificacao_id: Math.trunc(Number(d.classificacao_id)), carrega_saldo: carrega,
    ativo: d.ativo === undefined || d.ativo ? 1 : 0, vida_util: vida, residual_pct: residual, carencia };
}

// Com `vid`, o tipo nasce no cadastro e só entra no orçamento dessa versão se `adicionar`; nas outras versões ele não aparece.
export async function criarTipo(bd: Bd, d: any, autor: string, vid: number | null = null, adicionar = true): Promise<number> {
  const v = await validar(bd, d);
  if (vid !== null && vid !== undefined) v.ativo = 1;
  const [r] = await bd.q("INSERT INTO investimento_tipos(nome, natureza, conta_codigo, classificacao_id, carrega_saldo, ativo, criado_em, vida_util, residual_pct, carencia) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id",
    [v.nome, v.natureza, v.conta_codigo, v.classificacao_id, v.carrega_saldo, v.ativo, agora(), v.vida_util, v.residual_pct, v.carencia]);
  if (vid !== null && vid !== undefined)
    for (const x of await (adicionar ? bd.q("SELECT id FROM versoes WHERE id<>?", [vid]) : bd.q("SELECT id FROM versoes")))
      await bd.q("INSERT INTO investimento_excluidos(versao_id, tipo_id) VALUES(?,?) ON CONFLICT DO NOTHING", [x.id, r.id]);
  await auditar(bd, autor, null, "criar_tipo_investimento", v.nome);
  return r.id;
}

async function obter(bd: Bd, tid: number) {
  const [r] = await bd.q("SELECT * FROM investimento_tipos WHERE id=?", [tid]);
  if (!r) throw NaoEncontrado(`Tipo de investimento ${tid} não existe`);
  return r;
}

export async function editarTipo(bd: Bd, tid: number, d: any, autor: string): Promise<void> {
  const atual = await obter(bd, tid);
  const v = await validar(bd, d, tid);
  if (v.natureza !== atual.natureza && (await bd.q("SELECT 1 FROM investimento_valores WHERE tipo_id=? AND valor<>0 LIMIT 1", [tid])).length)
    throw Invalido("Este tipo já tem valores digitados; não dá para trocar entre investimento e desinvestimento. Crie outro tipo e desative este.");
  await bd.q("UPDATE investimento_tipos SET nome=?, natureza=?, conta_codigo=?, classificacao_id=?, carrega_saldo=?, ativo=?, vida_util=?, residual_pct=?, carencia=? WHERE id=?",
    [v.nome, v.natureza, v.conta_codigo, v.classificacao_id, v.carrega_saldo, v.ativo, v.vida_util, v.residual_pct, v.carencia, tid]);
  if (!v.carrega_saldo) await bd.q("DELETE FROM investimento_valores WHERE tipo_id=? AND campo IN ('a_carregar','saldo_ini')", [tid]);
  if (v.natureza !== "investimento") await bd.q("DELETE FROM investimento_valores WHERE tipo_id=? AND campo='financiado'", [tid]);
  await auditar(bd, autor, null, "editar_tipo_investimento", v.nome);
}

export async function excluirTipo(bd: Bd, tid: number, autor: string): Promise<void> {
  const t = await obter(bd, tid);
  if ((await bd.q("SELECT 1 FROM investimento_valores WHERE tipo_id=? LIMIT 1", [tid])).length) throw Invalido(`'${t.nome}' tem valores em alguma versão. Remova-o do orçamento dessa versão em vez de excluir o cadastro.`);
  await bd.q("DELETE FROM investimento_tipos WHERE id=?", [tid]);
  await auditar(bd, autor, null, "excluir_tipo_investimento", t.nome);
}

// Com `vid`, `ativo` diz se o tipo faz parte do orçamento dessa versão (ativo no cadastro e não retirado dela).
export async function cadastro(bd: Bd, vid: number | null = null): Promise<any[]> {
  const fora = vid !== null ? new Set((await bd.q("SELECT tipo_id FROM investimento_excluidos WHERE versao_id=?", [vid])).map((r) => r.tipo_id)) : new Set();
  const nomes = new Map((await contas(bd)).map((c: any) => [c.codigo, c]));
  const uso = new Set((await bd.q("SELECT DISTINCT tipo_id FROM investimento_valores")).map((r) => r.tipo_id));
  return (await bd.q(`SELECT t.*, c.nome AS classificacao FROM investimento_tipos t JOIN investimento_classificacoes c ON c.id=t.classificacao_id ORDER BY t.ativo DESC, t.natureza COLLATE "C", ${nomeMin("t.nome")}`)).map((r) => {
    const c: any = nomes.get(r.conta_codigo);
    return { ...r, carrega_saldo: !!r.carrega_saldo, ativo: !!r.ativo && !fora.has(r.id), ativo_cadastro: !!r.ativo, em_uso: uso.has(r.id), conta_nome: c ? c.nome : r.conta_codigo, conta_caminho: c ? c.caminho : [] };
  });
}

// ---------------------------------------------------------------- cálculo
export async function valoresDe(bd: Bd, vid: number): Promise<Valores> {
  const d: Valores = {};
  for (const r of await bd.q("SELECT tipo_id, campo, ano, valor FROM investimento_valores WHERE versao_id=?", [vid])) ((d[r.tipo_id] ??= {})[r.campo] ??= {})[r.ano] = r.valor;
  return d;
}

function calcularBase(t: any, val: Record<string, Serie>, anos: number[]) {
  const novo: Serie = Object.fromEntries(anos.map((a) => [a, val.novo?.[a] ?? 0]));
  const anterior = zeros(anos);
  const total = { ...novo }, carregar = zeros(anos), investido = zeros(anos), avisos: string[] = [];
  if (t.natureza === "desinvestimento") return { novo, anterior, total: novo, carregar, investido, desinvestido: { ...novo }, avisos };
  if (!t.carrega_saldo) return { novo, anterior, total: novo, carregar, investido: { ...novo }, desinvestido: zeros(anos), avisos };
  const pedido: Serie = Object.fromEntries(anos.map((a) => [a, val.a_carregar?.[a] ?? 0]));
  anos.forEach((a, i) => {
    anterior[a] = i === 0 ? val.saldo_ini?.[a] ?? 0 : carregar[anos[i - 1]];
    total[a] = anterior[a] + novo[a];
    carregar[a] = Math.min(pedido[a], total[a]);
    if (pedido[a] > total[a] + 1e-9) avisos.push(`${a}: o saldo a carregar (${fmt0(pedido[a])}) é maior que o total a investir (${fmt0(total[a])}); considerei o total.`.replace(/,/g, "."));
    investido[a] = total[a] - carregar[a];
  });
  return { novo, anterior, total, carregar, investido, desinvestido: zeros(anos), avisos };
}

// Cálculo do tipo + o valor financiado de cada ano (o digitado, limitado ao investido do ano).
export function calcularTipo(t: any, val: Record<string, Serie>, anos: number[]) {
  const c: any = calcularBase(t, val, anos);
  const pedido: Serie = Object.fromEntries(anos.map((a) => [a, val.financiado?.[a] ?? 0]));
  if (t.natureza !== "investimento") { c.financiado = zeros(anos); return c; }
  c.financiado = Object.fromEntries(anos.map((a) => [a, Math.min(pedido[a], c.investido[a])]));
  c.avisos = [...c.avisos, ...anos.filter((a) => pedido[a] > c.investido[a] + 1e-9).map((a) => `${a}: o valor financiado (${fmt0(pedido[a])}) é maior que o investido do ano (${fmt0(c.investido[a])}); considerei o investido.`.replace(/,/g, "."))];
  return c;
}

function linhasDe(t: any, c: any, anos: number[]) {
  const todos = Object.fromEntries(anos.map((a) => [a, true])), primeiro = Object.fromEntries(anos.map((a) => [a, a === anos[0]])), nenhum = Object.fromEntries(anos.map((a) => [a, false]));
  const L = (id: string, nome: string, valores: Serie, editavel: any, explicacao: string, campo: string | null = null, estilo = "") => ({ id, campo, nome, valores, editavel, explicacao, estilo });
  if (t.natureza === "desinvestimento") return [L("novo", "Desinvestimento do ano", c.novo, todos, "Valor que sai da conta padrão do balanço no ano (venda ou baixa), em R$. Não traz saldo do ano anterior.", "novo")];
  const financiado = L("financiado", "Valor financiado", c.financiado, todos,
    "Parte do investido do ano que será financiada, em R$. Vira uma captação do tipo Investimento na tela Novas captações, com a taxa, o prazo e a carência "
    + "da premissa de financiamento do ano; o saldo soma na dívida de investimento do balanço e os juros na DRE.", "financiado");
  if (!t.carrega_saldo) return [L("novo", "Orçamento do ano (investido)", c.novo, todos, "Valor investido no ano, em R$. Entra na conta padrão do balanço.", "novo"), financiado];
  return [
    L("saldo_ini", "Saldo a realizar do ano anterior", c.anterior, primeiro, "No primeiro ano você digita o que ficou aprovado e ainda não foi investido no ano anterior; nos demais anos é o saldo a carregar do ano anterior.", "saldo_ini"),
    L("novo", "Novo orçamento do ano", c.novo, todos, "Orçamento aprovado para o ano, em R$.", "novo"),
    L("total", "Total a investir no ano", c.total, nenhum, "Saldo do ano anterior + novo orçamento.", null, "total"),
    L("a_carregar", "Saldo a carregar para o ano seguinte", c.carregar, todos, "Parte do total que não será investida no ano e fica a realizar. Digite o valor; não pode passar do total a investir.", "a_carregar"),
    L("investido", "Investido no ano", c.investido, nenhum, "Total a investir − saldo a carregar. É o que entra na conta padrão do balanço.", null, "total"),
    financiado,
  ];
}

const soma = (series: Serie[], anos: number[]): Serie => Object.fromEntries(anos.map((a) => [a, series.reduce((t, s) => t + (s[a] ?? 0), 0)]));

export async function ler(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const val = await valoresDe(bd, vid);
  const cad = await cadastro(bd, vid);
  const tipos: any[] = [], porClass = new Map<string, any>(), porConta = new Map<string, any>();
  for (const t of cad) {
    if (!t.ativo) continue;
    const c = calcularTipo(t, val[t.id] ?? {}, anos);
    const o: any = {};
    for (const k of ["id", "nome", "natureza", "conta_codigo", "conta_nome", "conta_caminho", "classificacao_id", "classificacao", "carrega_saldo", "vida_util", "residual_pct", "carencia"]) o[k] = t[k];
    tipos.push({ ...o, linhas: linhasDe(t, c, anos), investido: c.investido, desinvestido: c.desinvestido, avisos: c.avisos });
    if (!porClass.has(t.classificacao)) porClass.set(t.classificacao, { nome: t.classificacao, inv: [], des: [] });
    let k = porClass.get(t.classificacao); k.inv.push(c.investido); k.des.push(c.desinvestido);
    if (!porConta.has(t.conta_codigo)) porConta.set(t.conta_codigo, { codigo: t.conta_codigo, nome: t.conta_nome, inv: [], des: [] });
    k = porConta.get(t.conta_codigo); k.inv.push(c.investido); k.des.push(c.desinvestido);
  }
  const invTotal = soma(tipos.map((t) => t.investido), anos), desTotal = soma(tipos.map((t) => t.desinvestido), anos);
  const cts = await contas(bd);
  return {
    versao: v, anos, estrutura: !!cts.length, classificacoes: await classificacoes(bd), contas: cts, cadastro: cad, tipos, depreciacao: await depreciacao(bd, vid, anos),
    resumo: {
      por_classificacao: [...porClass.values()].map((k) => ({ nome: k.nome, investido: soma(k.inv, anos), desinvestido: soma(k.des, anos) })),
      por_conta: [...porConta.values()].map((k) => ({ codigo: k.codigo, nome: k.nome, investido: soma(k.inv, anos), desinvestido: soma(k.des, anos),
        liquido: Object.fromEntries(anos.map((a) => [a, soma(k.inv, anos)[a] - soma(k.des, anos)[a]])) })),
      totais: { investido: invTotal, desinvestido: desTotal, liquido: Object.fromEntries(anos.map((a) => [a, invTotal[a] - desTotal[a]])) },
    },
  };
}

// Movimento líquido do ano (investido − desinvestido) por conta padrão do balanço, em R$.
export async function efeitosBalanco(bd: Bd, vid: number, anos: number[]): Promise<Record<string, Serie>> {
  const val = await valoresDe(bd, vid);
  const out: Record<string, Serie> = {};
  for (const t of await cadastro(bd, vid)) {
    if (!t.ativo) continue;
    const c = calcularTipo(t, val[t.id] ?? {}, anos);
    const acc = (out[t.conta_codigo] ??= zeros(anos));
    for (const a of anos) acc[a] += c.investido[a] - c.desinvestido[a];
  }
  return out;
}

// ---------------------------------------------------------------- digitação
async function tipoAtivo(bd: Bd, tid: number, vid: number | null = null) {
  const t = await obter(bd, tid);
  if (!t.ativo || (vid !== null && (await bd.q("SELECT 1 FROM investimento_excluidos WHERE versao_id=? AND tipo_id=?", [vid, tid])).length)) throw Invalido(`'${t.nome}' não faz parte deste orçamento`);
  return t;
}

function campoValido(t: any, campo: string, ano: number, anos: number[]) {
  if (!CAMPOS.includes(campo)) throw Invalido("Campo inválido");
  if (campo === "financiado" && t.natureza !== "investimento") throw Invalido(`'${t.nome}' é desinvestimento: não há o que financiar`);
  if ((campo === "a_carregar" || campo === "saldo_ini") && !t.carrega_saldo) throw Invalido(`'${t.nome}' não carrega saldo do ano anterior`);
  if (campo === "saldo_ini" && ano !== anos[0]) throw Invalido("O saldo do ano anterior só se digita no primeiro ano; nos demais ele vem do saldo a carregar");
}

const UPSERT = "INSERT INTO investimento_valores(versao_id, tipo_id, campo, ano, valor) VALUES(?,?,?,?,?) ON CONFLICT(versao_id, tipo_id, campo, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarValor(bd: Bd, vid: number, tid: number, campo: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  const t = await tipoAtivo(bd, tid, vid);
  const anos = anosDaVersao(v);
  if (!anos.includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  campoValido(t, campo, ano, anos);
  if (valor < 0) throw Invalido("O valor não pode ser negativo");
  await bd.q(UPSERT, [vid, tid, campo, ano, valor]);
  await auditar(bd, autor, vid, "salvar_investimento", `${t.nome} · ${campo} ${ano}: ${valor}`);
}

async function copiar(bd: Bd, vid: number, tid: number, campo: string, anoOrigem: number, destinos: number[]) {
  const [r] = await bd.q("SELECT valor FROM investimento_valores WHERE versao_id=? AND tipo_id=? AND campo=? AND ano=?", [vid, tid, campo, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, tid, campo, a, r ? r.valor : 0]);
}

function destinosDe(v: Versao, anoOrigem: number): number[] {
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const d = anos.filter((a) => a > anoOrigem);
  if (!d.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  return d;
}

export async function replicar(bd: Bd, vid: number, tid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const t = await tipoAtivo(bd, tid, vid);
  if (!["novo", "a_carregar", "financiado"].includes(campo)) throw Invalido("Só o novo orçamento, o saldo a carregar e o valor financiado se replicam");
  campoValido(t, campo, anoOrigem, anosDaVersao(v));
  const destinos = destinosDe(v, anoOrigem);
  await copiar(bd, vid, tid, campo, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_investimento", `${t.nome} · ${campo}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodos(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem);
  let n = 0;
  for (const t of (await cadastro(bd, vid)).filter((x) => x.ativo)) {
    for (const campo of ["novo", "a_carregar", "financiado"]) {
      if (campo === "a_carregar" && !t.carrega_saldo) continue;
      if (campo === "financiado" && t.natureza !== "investimento") continue;
      await copiar(bd, vid, t.id, campo, anoOrigem, destinos);
      n++;
    }
  }
  await auditar(bd, autor, vid, "replicar_todos_investimentos", `de ${anoOrigem}`);
  return { campos: n, anos_alterados: destinos.length };
}

export async function comparar(bd: Bd, aId: number, bId: number) {
  const la = await ler(bd, aId), lb = await ler(bd, bId);
  const anos = la.anos.filter((a) => lb.anos.includes(a)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ib = new Map<number, any>(lb.tipos.map((t) => [t.id, t]));
  const linhas: any[] = [];
  const linha = (id: any, nome: string, natureza: string, sa: Serie, sb: Serie) => linhas.push({ id, nome, natureza, anos: Object.fromEntries(anos.map((a) => [a, {
    a: sa[a] ?? 0, b: sb[a] ?? 0, delta: (sb[a] ?? 0) - (sa[a] ?? 0), pct: sa[a] ? (((sb[a] ?? 0) - (sa[a] ?? 0)) / Math.abs(sa[a])) * 100 : null }])) });
  for (const t of la.tipos) {
    const o = ib.get(t.id);
    const serie = (x: any, k: string): Serie => (x ?? {})[k] ?? {};
    linha(t.id, t.nome, t.natureza, t.natureza === "investimento" ? t.investido : t.desinvestido, t.natureza === "investimento" ? serie(o, "investido") : serie(o, "desinvestido"));
  }
  linha("total", "Investido líquido (investimentos − desinvestimentos)", "total", la.resumo.totais.liquido, lb.resumo.totais.liquido);
  return { a: la.versao, b: lb.versao, anos, linhas };
}

// ---------------------------------------------------------------- depreciação
export const CODIGO_DEPRECIACAO_DRE = "DS047";
const CODIGO_IMOBILIZADO = "SA19", CODIGO_DEPR_ACUMULADA = "SA26";

async function alterados(bd: Bd, vid: number): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = {};
  for (const r of await bd.q("SELECT chave, ano, valor FROM depreciacao_valores WHERE versao_id=?", [vid])) (d[r.chave] ??= {})[r.ano] = r.valor;
  return d;
}

// Imobilizado do último balanço realizado antes do horizonte, a depreciação daquele ano e a taxa média resultante.
async function existente(bd: Bd, anos: number[]) {
  const ini = await real.saldoInicial(bd, anos[0]);
  if (!ini) return null;
  const v = ini.valores, ano = ini.ano;
  const acumulada = v[CODIGO_DEPR_ACUMULADA] ?? 0;                         // negativa
  let bruto: number;
  if (CODIGO_IMOBILIZADO in v) bruto = v[CODIGO_IMOBILIZADO] - acumulada;
  else bruto = Object.entries(v).filter(([c]) => c.startsWith("SA2") && c !== CODIGO_DEPR_ACUMULADA && c.length === 4).reduce((t, [, x]) => t + x, 0);
  let dep = await real.valorRealizado(bd, "DRE", CODIGO_DEPRECIACAO_DRE, ano);
  dep = dep !== null ? -dep : null;                                        // na DRE a despesa é negativa
  const nomes = new Map((await bd.q("SELECT codigo, nome FROM bp_linhas")).map((r) => [r.codigo as string, r.nome as string]));
  const cts = (await bd.q("SELECT codigo FROM bp_linhas WHERE pai=? AND ativa=1 ORDER BY ordem, codigo", [CODIGO_IMOBILIZADO])).map((r) => ({ codigo: r.codigo, nome: nomes.get(r.codigo), saldo: v[r.codigo] ?? null }));
  const taxa = dep !== null && bruto > 0 ? (dep / bruto) * 100 : null;
  return { ano, meses: ini.meses ?? null, bruto, acumulada, liquido: bruto + acumulada, depreciacao_ano: dep, taxa_calculada: taxa, contas: cts };
}

// Contas do grupo Imobilizado (SA19), sem a depreciação acumulada; sem o grupo na estrutura, SA20 a SA25.
export async function contasImobilizado(bd: Bd): Promise<Set<string>> {
  const linhas = new Map((await bd.q("SELECT codigo, pai FROM bp_linhas")).map((r) => [r.codigo as string, r.pai as string]));
  if (!linhas.has(CODIGO_IMOBILIZADO)) return new Set(["SA20", "SA21", "SA22", "SA23", "SA24", "SA25"]);
  const sob = (c: string | undefined) => { const vistos = new Set<string>(); while (c && !vistos.has(c)) { if (c === CODIGO_IMOBILIZADO) return true; vistos.add(c); c = linhas.get(c); } return false; };
  return new Set([...linhas.keys()].filter((c) => c !== CODIGO_IMOBILIZADO && c !== CODIGO_DEPR_ACUMULADA && sob(c)));
}

// Depreciação por ano: bens existentes e cada tipo de investimento, já com as alterações feitas à mão.
export async function depreciacao(bd: Bd, vid: number, anos: number[]) {
  const val = await valoresDe(bd, vid), alt = await alterados(bd, vid), ex = await existente(bd, anos);
  const taxaCalc = ex && ex.taxa_calculada !== null ? ex.taxa_calculada : 0;
  const taxa = alt.taxa?.[0] ?? taxaCalc;
  const imob = await contasImobilizado(bd);
  const baixado = zeros(anos);                                                // desinvestimentos acumulados do imobilizado
  const cad = await cadastro(bd, vid);
  for (const t of cad) {
    if (t.ativo && t.natureza === "desinvestimento" && imob.has(t.conta_codigo)) {
      const v = calcularTipo(t, val[t.id] ?? {}, anos).desinvestido;
      let acumulado = 0;
      for (const a of anos) { acumulado += v[a]; baixado[a] += acumulado; }
    }
  }
  const baseDeprec: Serie = Object.fromEntries(anos.map((a) => [a, ex ? Math.max(0, ex.bruto - baixado[a]) : 0]));
  const base: Serie = Object.fromEntries(anos.map((a) => [a, (taxa / 100) * baseDeprec[a]]));
  const linhas: any[] = [{ chave: "existentes", nome: "Bens existentes", calculado: base, tipo_id: null, regra: "taxa média × (imobilizado bruto − desinvestimentos acumulados)" }];
  for (const t of cad) {
    if (!t.ativo || t.natureza !== "investimento" || t.vida_util <= 0) continue;
    const inv = calcularTipo(t, val[t.id] ?? {}, anos).investido;
    const calc = zeros(anos);
    const porAno = (1 - t.residual_pct / 100) / t.vida_util;
    for (const s of anos) {
      const inicio = s + t.carencia;
      for (const a of anos) if (inicio <= a && a < inicio + t.vida_util) calc[a] += inv[s] * porAno;       // ano cheio no primeiro ano, linear
    }
    linhas.push({ chave: `tipo-${t.id}`, nome: t.nome, calculado: calc, tipo_id: t.id, regra: `vida útil ${fmtG(t.vida_util)} ano(s), residual ${fmtG(t.residual_pct)}%, carência ${t.carencia} ano(s)` });
  }
  for (const l of linhas) {
    const mao = alt[l.chave] ?? {};
    l.valores = Object.fromEntries(anos.map((a) => [a, a in mao ? mao[a] : l.calculado[a]]));
    l.alterado = Object.fromEntries(anos.map((a) => [a, a in mao]));
  }
  const total: Serie = Object.fromEntries(anos.map((a) => [a, linhas.reduce((t, l) => t + l.valores[a], 0)]));
  return { existente: ex, taxa, taxa_calculada: taxaCalc, taxa_alterada: "taxa" in alt, base_depreciavel: baseDeprec, desinvestido_acumulado: baixado, linhas, total };
}

export async function salvarDepreciacao(bd: Bd, vid: number, chave: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  const anos = anosDaVersao(v);
  if (chave === "taxa") {
    ano = 0;
    if (!(valor >= 0 && valor <= 100)) throw Invalido("A taxa média de depreciação fica entre 0 e 100% ao ano");
  } else {
    if (chave !== "existentes" && !(chave.startsWith("tipo-") && /^\d+$/.test(chave.slice(5)) && (await bd.q("SELECT 1 FROM investimento_tipos WHERE id=?", [Number(chave.slice(5))])).length)) throw Invalido("Linha de depreciação inexistente");
    if (!anos.includes(ano)) throw Invalido("Ano fora do horizonte da versão");
    if (valor < 0) throw Invalido("A depreciação não pode ser negativa");
  }
  await bd.q("INSERT INTO depreciacao_valores(versao_id, chave, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, chave, ano) DO UPDATE SET valor=excluded.valor", [vid, chave, ano, valor]);
  await auditar(bd, autor, vid, "salvar_depreciacao", `${chave} ${ano}: ${valor}`);
}

export async function voltarAoCalculado(bd: Bd, vid: number, chave: string, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  await bd.q("DELETE FROM depreciacao_valores WHERE versao_id=? AND chave=?", [vid, chave]);
  await auditar(bd, autor, vid, "voltar_depreciacao_ao_calculado", chave);
}

// Total investido e desinvestido por ano, somando os tipos ativos.
export async function totais(bd: Bd, vid: number, anos: number[]) {
  const val = await valoresDe(bd, vid), inv = zeros(anos), des = zeros(anos);
  for (const t of await cadastro(bd, vid)) {
    if (!t.ativo) continue;
    const c = calcularTipo(t, val[t.id] ?? {}, anos);
    for (const a of anos) { inv[a] += c.investido[a]; des[a] += c.desinvestido[a]; }
  }
  return { investido: inv, desinvestido: des };
}

// ---------------------------------------------------------------- tipo dentro do orçamento de uma versão
export async function incluirNaVersao(bd: Bd, vid: number, tid: number, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  const t = await obter(bd, tid);
  if (!t.ativo) {
    await bd.q("UPDATE investimento_tipos SET ativo=1 WHERE id=?", [tid]);
    for (const r of await bd.q("SELECT id FROM versoes WHERE id<>?", [vid])) await bd.q("INSERT INTO investimento_excluidos(versao_id, tipo_id) VALUES(?,?) ON CONFLICT DO NOTHING", [r.id, tid]);       // reativado: só entra nesta versão
  }
  await bd.q("DELETE FROM investimento_excluidos WHERE versao_id=? AND tipo_id=?", [vid, tid]);
  await auditar(bd, autor, vid, "incluir_tipo_investimento", t.nome);
}

// Tira o tipo do orçamento só desta versão e apaga os valores lançados nela; o cadastro e as outras versões não mudam.
export async function retirarDaVersao(bd: Bd, vid: number, tid: number, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  const t = await obter(bd, tid);
  await bd.q("DELETE FROM investimento_valores WHERE versao_id=? AND tipo_id=?", [vid, tid]);
  await bd.q("DELETE FROM depreciacao_valores WHERE versao_id=? AND chave=?", [vid, `tipo-${tid}`]);
  await bd.q("INSERT INTO investimento_excluidos(versao_id, tipo_id) VALUES(?,?) ON CONFLICT DO NOTHING", [vid, tid]);
  await auditar(bd, autor, vid, "retirar_tipo_investimento", t.nome);
}
