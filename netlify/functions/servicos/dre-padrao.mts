// Premissas padronizadas das contas da DRE que não têm origem em outro módulo (abaixo do resultado bruto). Porte de app/servicos/dre_padrao.py.
// Cada conta é calculada de um jeito, e o padrão de cada ano é a média do realizado: % de uma base (receita líquida, receita bruta ou CPV)
// ou valor médio. Despesas saem negativas e receitas positivas na DRE; o % e o valor se digitam positivos.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel, type Versao } from "./base.mts";
import { redondo } from "./comum.mts";
import { opcoesPeriodo } from "./capital-giro.mts";
import * as dre from "./dre.mts";

type Serie = Record<number, number>;
const BASES: Record<string, [string, string]> = { RL: ["DS018", "Receita líquida"], RB: ["DS007", "Receita bruta"], CPV: ["DS020", "Custo do produto vendido"] };
// (conta, base, sinal): sinal -1 despesa, +1 receita, 0 valor com sinal digitado
const LINHAS: [string, string | null, number][] = [["DS032", "CPV", -1], ["DS033", null, 1], ["DS034", null, 1], ["DS035", null, 1], ["DS036", "CPV", -1], ["DS038", "RL", -1], ["DS039", "RL", -1],
  ["DS040", "RL", -1], ["DS041", "RB", -1], ["DS042", "CPV", -1], ["DS043", "CPV", -1], ["DS052", null, 1], ["DS055", null, 0], ["DS056", null, 0], ["DS057", null, 0], ["DS060", "RL", -1]];
const CODIGOS = LINHAS.map((l) => l[0]);
export const ARRENDAMENTO = "DS032";
const info = (cod: string) => { const l = LINHAS.find((x) => x[0] === cod)!; return { base: l[1], sinal: l[2] }; };

async function nomes(bd: Bd): Promise<Map<string, string>> {
  return new Map((await bd.q("SELECT codigo, nome FROM dre_linhas WHERE nivel='sintetica'")).map((r) => [r.codigo as string, r.nome as string]));
}

export async function parametros(bd: Bd, vid: number): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = {};
  for (const r of await bd.q("SELECT codigo, ano, valor FROM dre_padrao WHERE versao_id=?", [vid])) (d[r.codigo] ??= {})[r.ano] = r.valor;
  return d;
}

// Valor de cada conta por ano (R$ mil, com o sinal da DRE). calc = DRE calculada até aqui (traz as bases: receita líquida, bruta e CPV).
export async function series(bd: Bd, vid: number, anos: number[], calc: Record<string, Serie>): Promise<Record<string, Serie>> {
  const par = await parametros(bd, vid);
  const out: Record<string, Serie> = {};
  for (const [cod, base, sinal] of LINHAS) {
    const p = par[cod] ?? {};
    if (base) { const ref = calc[BASES[base][0]] ?? {}; out[cod] = Object.fromEntries(anos.map((a) => [a, (sinal * (p[a] ?? 0)) / 100 * Math.abs(ref[a] ?? 0)])); }
    else out[cod] = Object.fromEntries(anos.map((a) => [a, sinal === 0 ? p[a] ?? 0 : sinal * (p[a] ?? 0)]));
  }
  return out;
}

// ---------------------------------------------------------------- realizado
async function anosRealizados(bd: Bd): Promise<number[]> { return (await bd.q("SELECT ano FROM realizado_anos WHERE demonstrativo='DRE' ORDER BY ano")).map((r) => r.ano); }
async function realizadoDre(bd: Bd): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = {};
  for (const r of await bd.q("SELECT codigo, ano, valor FROM realizado WHERE demonstrativo='DRE'")) (d[r.codigo] ??= {})[r.ano] = r.valor;
  return d;
}

// % sobre a base (positivo) ou valor em R$ mil, de cada ano fechado; null quando o ano não tem a conta ou a base.
function porAno(real: Record<string, Serie>, cod: string, anos: number[]): Record<number, number | null> {
  const { base, sinal } = info(cod);
  const out: Record<number, number | null> = {};
  for (const a of anos) {
    const v = real[cod]?.[a];
    if (v === undefined) out[a] = null;
    else if (base) { const b = Math.abs(real[BASES[base][0]]?.[a] ?? 0); out[a] = b ? (Math.abs(v) / b) * 100 : null; }
    else out[a] = (sinal === 0 ? v : Math.abs(v)) / 1000;
  }
  return out;
}

function media(serie: Record<number, number | null>, sel: number[]): number | null {
  const v = sel.map((a) => serie[a]).filter((x) => x !== undefined && x !== null) as number[];
  return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null;
}

export async function previa(bd: Bd, vid: number) {
  await obterVersao(bd, vid);
  const anos = await anosRealizados(bd), real = await realizadoDre(bd), nm = await nomes(bd);
  const opcoes = opcoesPeriodo(anos);
  const campos: any[] = [];
  for (const [cod, base, sinal] of LINHAS) {
    if (!nm.has(cod)) continue;
    const ps = porAno(real, cod, anos);
    campos.push({ codigo: cod, nome: nm.get(cod), base: base ? BASES[base][1] : null, unidade: base ? "%" : "R$ mil", sinal, por_ano: ps, por_opcao: Object.fromEntries(opcoes.map((o) => [o.id, media(ps, o.anos)])) });
  }
  return { anos, opcoes, campos, padrao: anos.slice(-3) };
}

const UPSERT = "INSERT INTO dre_padrao(versao_id, codigo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, codigo, ano) DO UPDATE SET valor=excluded.valor";

// Grava a média dos anos fechados escolhidos (padrão: o último) nos anos do horizonte que vêm depois do último escolhido.
export async function atualizar(bd: Bd, vid: number, autor: string, anosEscolhidos: number[] | null = null) {
  const v = await versaoEditavel(bd, vid);
  const anosReal = await anosRealizados(bd);
  if (!anosReal.length) throw Invalido("Ainda não há DRE realizada. Suba os anos fechados na tela Realizado.");
  const escolhidos = anosEscolhidos && anosEscolhidos.length ? [...new Set(anosEscolhidos)].sort((a, b) => a - b) : [anosReal[anosReal.length - 1]];
  const fora = escolhidos.filter((a) => !anosReal.includes(a));
  if (fora.length) throw Invalido(`Não há DRE realizada de ${fora.join(", ")}`);
  const ultimo = escolhidos[escolhidos.length - 1];
  const destinos = anosDaVersao(v).filter((a) => a > ultimo);
  if (!destinos.length) throw Invalido(`O horizonte da versão não tem anos depois de ${ultimo}`);
  const real = await realizadoDre(bd), nm = await nomes(bd);
  let feitos = 0;
  for (const cod of CODIGOS) {
    if (!nm.has(cod)) continue;
    const m = media(porAno(real, cod, anosReal), escolhidos);
    if (m === null) continue;
    for (const a of destinos) await bd.q(UPSERT, [vid, cod, a, redondo(m, 4)]);
    feitos++;
  }
  await auditar(bd, autor, vid, "atualizar_dre_padrao", `média de ${escolhidos.join(", ")} para ${destinos.length} ano(s)`);
  return { anos_usados: escolhidos, contas: feitos, anos_alterados: destinos.length };
}

// ---------------------------------------------------------------- digitação
function validar(cod: string) { if (!CODIGOS.includes(cod)) throw Invalido("Conta sem premissa padronizada"); }

export async function salvar(bd: Bd, vid: number, cod: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  validar(cod);
  const { base, sinal } = info(cod);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0 && (base || sinal !== 0)) throw Invalido("Digite o valor positivo (a DRE aplica o sinal da conta)");
  if (base && valor > 1000) throw Invalido("O percentual está fora do esperado");
  await bd.q(UPSERT, [vid, cod, ano, valor]);
  await auditar(bd, autor, vid, "salvar_dre_padrao", `${cod} ${ano}: ${valor}`);
}

function destinosDe(v: Versao, anoOrigem: number): number[] {
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const d = anos.filter((a) => a > anoOrigem);
  if (!d.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  return d;
}

export async function replicar(bd: Bd, vid: number, cod: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  validar(cod);
  const destinos = destinosDe(v, anoOrigem);
  const [r] = await bd.q("SELECT valor FROM dre_padrao WHERE versao_id=? AND codigo=? AND ano=?", [vid, cod, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, cod, a, r ? r.valor : 0]);
  await auditar(bd, autor, vid, "replicar_dre_padrao", `${cod}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodos(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem);
  for (const cod of CODIGOS) await replicar(bd, vid, cod, anoOrigem, autor);
  return { campos: CODIGOS.length, anos_alterados: destinos.length };
}

// ---------------------------------------------------------------- tela
export async function ler(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const nm = await nomes(bd), par = await parametros(bd, vid);
  const d: any = await dre.ler(bd, vid);
  const calc: Record<string, Serie> = Object.fromEntries(d.linhas.map((l: any) => [l.codigo, l.valores]));
  const anosReal = await anosRealizados(bd), real = await realizadoDre(bd);
  const ultimo = anosReal.length ? anosReal[anosReal.length - 1] : null;
  const premissas: any[] = [];
  for (const [cod, base, sinal] of LINHAS) {
    if (!nm.has(cod)) continue;
    premissas.push({ codigo: cod, nome: nm.get(cod), base: base ? BASES[base][1] : null, unidade: base ? "%" : "R$ mil", sinal, valores: Object.fromEntries(anos.map((a) => [a, par[cod]?.[a] ?? 0])) });
  }
  const bases = new Set(Object.values(BASES).map((b) => b[0]));
  const resultado: any[] = [];
  for (const cod of [BASES.RL[0], BASES.RB[0], BASES.CPV[0], ...CODIGOS]) {
    if (!(cod in calc)) continue;
    resultado.push({ codigo: cod, nome: nm.get(cod) ?? cod, valores: calc[cod], base: bases.has(cod), realizado: ultimo !== null && real[cod]?.[ultimo] !== undefined ? real[cod][ultimo] / 1000 : null });
  }
  return { versao: v, anos, ultimo_ano: ultimo, premissas, resultado };
}
