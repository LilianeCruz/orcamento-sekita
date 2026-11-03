// Premissas de transportadora (Sekita Transportes): receita e custo direto no estilo da planilha. Porte de app/servicos/transportadora.py.
//   Km rodado total = caminhões × km por caminhão;  Receita bruta = km total × preço por km;  Deduções = receita × % de deduções
//   Custo direto (CPV) = km total × soma das rubricas variáveis, fixas e despesas em R$/km
// Valores guardados em R$ e R$/km; o resultado sai em R$ mil, com o sinal da DRE (custos e deduções negativos).
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";

const MIL = 1000;
export const LINHA_RECEITA = "DS014", LINHA_DEDUCOES = "DS017", LINHA_CUSTO = "DS026";
const GRUPOS: [string, [string, string, string][]][] = [
  ["Operação", [["caminhoes", "Quantidade de caminhões", "uni"], ["km_caminhao", "Km rodado por caminhão", "km/caminhão"], ["preco_km", "Preço por km rodado", "R$/km"], ["deducoes_pct", "Deduções da receita", "% da receita"]]],
  ["Custos variáveis", [["combustivel", "Combustível", "R$/km"], ["mdo", "Mão de obra (MDO)", "R$/km"], ["manutencao", "Manutenção, conservação e reparos de veículos", "R$/km"], ["outros_var", "Outros custos", "R$/km"]]],
  ["Custos fixos", [["salario_fixo", "Salário fixo + encargos", "R$/km"], ["ipva", "IPVA", "R$/km"], ["rastreamento", "Rastreamento de veículos", "R$/km"], ["seguro", "Seguro de veículos", "R$/km"]]],
  ["Despesas", [["desp_indireto", "Despesa / custo indireto", "R$/km"], ["moi", "M.O.I", "R$/km"]]],
];
const CAMPOS = Object.fromEntries(GRUPOS.flatMap(([g, ls]) => ls.map(([c, nome, un]) => [c, [nome, un, g]])));
const VARIAVEIS = GRUPOS[1][1].map((x) => x[0]), FIXOS = GRUPOS[2][1].map((x) => x[0]), DESPESAS = GRUPOS[3][1].map((x) => x[0]);
type Valores = Record<string, Record<number, number>>;

async function valoresDe(bd: Bd, vid: number): Promise<Valores> {
  const d: Valores = {};
  for (const r of await bd.q("SELECT campo, ano, valor FROM transportadora_valores WHERE versao_id=?", [vid])) (d[r.campo] ??= {})[r.ano] = r.valor;
  return d;
}

export function calcularTransportadora(val: Valores, anos: number[]) {
  const g = (c: string, a: number) => val[c]?.[a] ?? 0;
  const out: Record<string, Record<number, number>> = {};
  for (const k of ["km_total", "receita_bruta", "deducoes", "receita_liquida", "custo_variavel", "custo_fixo", "custo_total", "despesas", "resultado_bruto", "margem"]) out[k] = {};
  for (const a of anos) {
    const km = g("caminhoes", a) * g("km_caminhao", a);
    const rec = (km * g("preco_km", a)) / MIL;
    const ded = (-rec * g("deducoes_pct", a)) / 100;
    const soma = (cs: string[]) => cs.reduce((t, c) => t + g(c, a), 0);
    const vari = (-km * soma(VARIAVEIS)) / MIL, fix = (-km * soma(FIXOS)) / MIL, desp = (-km * soma(DESPESAS)) / MIL;
    const liq = rec + ded;
    const bruto = liq + vari + fix + desp;
    const v: Record<string, number> = { km_total: km, receita_bruta: rec, deducoes: ded, receita_liquida: liq, custo_variavel: vari, custo_fixo: fix, custo_total: vari + fix + desp, despesas: desp, resultado_bruto: bruto, margem: liq ? (bruto / liq) * 100 : 0 };
    for (const k of Object.keys(v)) out[k][a] = v[k];
  }
  return out;
}

// o que a DRE recebe, por linha: receita (+), deduções (−) e custo direto (−), em R$ mil
export async function seriesTransportadora(bd: Bd, vid: number, anos: number[]) {
  const r = calcularTransportadora(await valoresDe(bd, vid), anos);
  return { [LINHA_RECEITA]: r.receita_bruta, [LINHA_DEDUCOES]: r.deducoes, [LINHA_CUSTO]: r.custo_total };
}

export async function lerTransportadora(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const val = await valoresDe(bd, vid);
  return { versao: v, anos,
    grupos: GRUPOS.map(([g, ls]) => ({ titulo: g, linhas: ls.map(([c, nome, un]) => ({ campo: c, nome, unidade: un, valores: Object.fromEntries(anos.map((a) => [a, val[c]?.[a] ?? null])) })) })),
    resultado: calcularTransportadora(val, anos) };
}

function campoValido(campo: string) { if (!(campo in CAMPOS)) throw Invalido("Campo desconhecido nas premissas de transportadora"); }
const UPSERT = "INSERT INTO transportadora_valores(versao_id, campo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarTransportadora(bd: Bd, vid: number, campo: string, ano: number, valor: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  campoValido(campo);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("O valor não pode ser negativo");
  if (campo === "deducoes_pct" && valor > 100) throw Invalido("As deduções ficam entre 0 e 100% da receita");
  await bd.q(UPSERT, [vid, campo, ano, valor]);
  await auditar(bd, autor, vid, "salvar_transportadora", `${CAMPOS[campo][0]} ${ano}: ${valor}`);
}

async function replicarCampos(bd: Bd, vid: number, campos: string[], anoOrigem: number): Promise<number> {
  const anos = anosDaVersao(await obterVersao(bd, vid));
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const destinos = anos.filter((a) => a > anoOrigem);
  if (!destinos.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  for (const c of campos) {
    const [r] = await bd.q("SELECT valor FROM transportadora_valores WHERE versao_id=? AND campo=? AND ano=?", [vid, c, anoOrigem]);
    for (const a of destinos) await bd.q(UPSERT, [vid, c, a, r ? r.valor : 0]);
  }
  return destinos.length;
}

export async function replicarTransportadora(bd: Bd, vid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  await versaoEditavel(bd, vid);
  campoValido(campo);
  const n = await replicarCampos(bd, vid, [campo], anoOrigem);
  await auditar(bd, autor, vid, "replicar_transportadora", `${CAMPOS[campo][0]} de ${anoOrigem}`);
  return n;
}

export async function replicarTodosTransportadora(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  await versaoEditavel(bd, vid);
  const n = await replicarCampos(bd, vid, Object.keys(CAMPOS), anoOrigem);
  await auditar(bd, autor, vid, "replicar_transportadora", `todos os campos de ${anoOrigem}`);
  return { campos: Object.keys(CAMPOS).length, anos_alterados: n };
}
