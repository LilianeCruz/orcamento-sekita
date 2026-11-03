// Patrimônio líquido projetado (R$ mil, ano a ano). Porte de app/servicos/patrimonio.py.
//   Lucros e prejuízos acumulados (SP25): saldo do ano = saldo do ano anterior + resultado do exercício do ano anterior − distribuição paga no ano
//   Distribuição de lucros: % do lucro líquido do ano e/ou valor base (mínimo), paga no ano seguinte.
//   Capital integralizado (SP23) e Ajustes de avaliação (SP24): trazem o saldo do ano anterior; qualquer ano pode ser alterado à mão.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel, type Versao } from "./base.mts";
import { fmt0 } from "./comum.mts";
import * as dre from "./dre.mts";
import * as real from "./realizado.mts";

type Serie = Record<number, number>;
const CAMPOS: Record<string, [string, string]> = {
  dist_pct: ["Distribuição de lucros — % do lucro líquido do ano", "% do lucro"],
  dist_valor: ["Distribuição de lucros — valor base (mínimo)", "R$ mil"],
};
const SALDOS_ALTERAVEIS: Record<string, string> = { capital: "Capital integralizado", ajustes: "Ajustes de avaliação patrimonial" };       // saldo alterado à mão, por ano
const CONTA_LUCROS = "SP25", CONTA_CAPITAL = "SP23", CONTA_AJUSTES = "SP24", CONTA_RESULTADO = "SP26";
const LINHA_LUCRO_LIQUIDO = "DS062";

async function valoresDe(bd: Bd, vid: number): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = Object.fromEntries([...Object.keys(CAMPOS), ...Object.keys(SALDOS_ALTERAVEIS)].map((c) => [c, {}]));
  for (const r of await bd.q("SELECT campo, ano, valor FROM patrimonio_valores WHERE versao_id=?", [vid])) (d[r.campo] ??= {})[r.ano] = r.valor;
  return d;
}

// Anos do horizonte mais o ano anterior a ele: o lucro desse ano anterior é distribuído no primeiro ano projetado.
export const anosComRegra = (anos: number[]): number[] => [anos[0] - 1, ...anos];
const UPSERT = "INSERT INTO patrimonio_valores(versao_id, campo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor";

export async function salvar(bd: Bd, vid: number, campo: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  if (!(campo in CAMPOS) && !(campo in SALDOS_ALTERAVEIS)) throw Invalido("Campo inválido");
  const anos = anosDaVersao(v);
  if (!(campo in CAMPOS ? anosComRegra(anos) : anos).includes(ano))
    throw Invalido(!(campo in CAMPOS) ? "Ano fora do horizonte da versão" : "Ano fora do horizonte da versão (só o ano anterior a ele também tem regra de distribuição)");
  if (valor < 0 && campo !== "ajustes") throw Invalido("O valor não pode ser negativo");               // ajustes de avaliação podem ser negativos
  if (campo === "dist_pct" && valor > 100) throw Invalido("O percentual do lucro distribuído fica entre 0 e 100");
  await bd.q(UPSERT, [vid, campo, ano, valor]);
  const nome = campo in CAMPOS ? CAMPOS[campo][0] : SALDOS_ALTERAVEIS[campo];
  await auditar(bd, autor, vid, "salvar_patrimonio", `${nome} ${ano}: ${valor}`);
}

export async function voltarAoCalculado(bd: Bd, vid: number, campo: string, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  if (!(campo in SALDOS_ALTERAVEIS)) throw Invalido("Só o capital e os ajustes de avaliação têm valores alterados à mão");
  await bd.q("DELETE FROM patrimonio_valores WHERE versao_id=? AND campo=?", [vid, campo]);
  await auditar(bd, autor, vid, "voltar_patrimonio_ao_calculado", campo);
}

function destinosDe(v: Versao, anoOrigem: number): number[] {
  const anos = anosDaVersao(v);
  if (!anosComRegra(anos).includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const d = anos.filter((a) => a > anoOrigem);
  if (!d.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  return d;
}

async function copiar(bd: Bd, vid: number, campo: string, anoOrigem: number, destinos: number[]) {
  const [r] = await bd.q("SELECT valor FROM patrimonio_valores WHERE versao_id=? AND campo=? AND ano=?", [vid, campo, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, campo, a, r ? r.valor : 0]);
}

export async function replicar(bd: Bd, vid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  if (!(campo in CAMPOS)) throw Invalido("Campo inválido");
  const destinos = destinosDe(v, anoOrigem);
  await copiar(bd, vid, campo, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_patrimonio", `${CAMPOS[campo][0]}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodos(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem);
  for (const campo of Object.keys(CAMPOS)) await copiar(bd, vid, campo, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_todos_patrimonio", `de ${anoOrigem}`);
  return { campos: Object.keys(CAMPOS).length, anos_alterados: destinos.length };
}

// Saldos de lucros acumulados, capital e ajustes por ano, com os passos do cálculo (todos em R$ mil).
export async function calcular(bd: Bd, vid: number, anos: number[], jurosAuto: Serie | null = null): Promise<any> {
  const val = await valoresDe(bd, vid);
  const ini = await real.saldoInicial(bd, anos[0]);
  const base: Record<string, number> = ini ? ini.valores : {};
  const ll = ((await dre.ler(bd, vid, jurosAuto)) as any).linhas.find((l: any) => l.codigo === LINHA_LUCRO_LIQUIDO);
  const lucro: Serie = Object.fromEntries(anos.map((a) => [a, ll ? ll.valores[a] ?? 0 : 0]));
  const out: Record<string, any> = {};
  for (const k of ["lucro_ano", "anterior", "transferido", "distribuicao", "lucros", "capital_anterior", "capital", "capital_calc", "ajuste_anterior", "ajustes", "ajustes_calc", "lucro_base", "dist_gerada"]) out[k] = {};
  const avisos: string[] = [];
  const ext = anosComRegra(anos);
  out.lucro_base = Object.fromEntries(ext.map((t) => [t, t === ext[0] ? base[CONTA_RESULTADO] ?? 0 : lucro[t]]));          // o ano anterior ao horizonte usa o resultado realizado
  for (const t of ext) {                                                                                                     // distribuição decidida para o lucro de cada ano (paga no seguinte)
    const minimo = val.dist_valor[t] ?? 0;                                                                                   // valor base: o mínimo que a empresa paga
    const pct = val.dist_pct[t] ?? 0;
    out.dist_gerada[t] = pct > 0 && out.lucro_base[t] > 0 ? (pct / 100) * out.lucro_base[t] : minimo;                       // com lucro, vale o %; sem lucro (ou sem %), o valor base
  }
  let lucros = base[CONTA_LUCROS] ?? 0, capital = base[CONTA_CAPITAL] ?? 0, ajustes = base[CONTA_AJUSTES] ?? 0;
  anos.forEach((a, i) => {
    const transferido = i === 0 ? out.lucro_base[a - 1] : lucro[anos[i - 1]];
    const dist = out.dist_gerada[a - 1];                                                                                     // paga no ano seguinte ao do lucro
    out.lucro_ano[a] = lucro[a]; out.anterior[a] = lucros; out.transferido[a] = transferido; out.distribuicao[a] = dist;
    lucros = lucros + transferido - dist;
    out.lucros[a] = lucros;
    if (lucros < -1e-9 && dist > 0) avisos.push(`${a}: a distribuição deixa os lucros acumulados negativos (R$ ${fmt0(lucros)} mil).`.replace(/,/g, "."));
    out.capital_anterior[a] = capital; out.capital_calc[a] = capital;                                                        // traz o saldo do ano anterior
    capital = val.capital[a] ?? capital;                                                                                     // ...ou o valor alterado à mão
    out.capital[a] = capital;
    out.ajuste_anterior[a] = ajustes; out.ajustes_calc[a] = ajustes;
    ajustes = val.ajustes[a] ?? ajustes;
    out.ajustes[a] = ajustes;
  });
  out.avisos = avisos;
  out.saldo_inicial = ini ? { ano: ini.ano, meses: ini.meses ?? null } : null;
  out.premissas = val;
  return out;
}

export const efeitosDeCalculo = (c: any): Record<string, Serie> => ({ [CONTA_LUCROS]: c.lucros, [CONTA_CAPITAL]: c.capital, [CONTA_AJUSTES]: c.ajustes });
export async function efeitosBalanco(bd: Bd, vid: number, anos: number[], jurosAuto: Serie | null = null) { return efeitosDeCalculo(await calcular(bd, vid, anos, jurosAuto)); }

export async function ler(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const c = await calcular(bd, vid, anos);
  const ext = anosComRegra(anos);
  const P = (campo: string) => ({ campo, nome: CAMPOS[campo][0], unidade: CAMPOS[campo][1], valores: Object.fromEntries(ext.map((a) => [a, c.premissas[campo][a] ?? 0])) });
  const L = (id: string, nome: string, valores: any, expl: string, estilo = ""): any => ({ id, nome, valores, explicacao: expl, estilo, editavel: false });
  const A = (id: string, nome: string, valores: any, calculado: any, expl: string) => {                           // linha que traz o ano anterior e pode ser alterada
    const mao = c.premissas[id];
    return { ...L(id, nome, valores, expl, "total"), editavel: true, campo: id, calculado, alterado: Object.fromEntries(anos.map((a) => [a, a in mao])) };
  };
  return {
    versao: v, anos, anos_extras: ext.slice(0, 1), saldo_inicial: c.saldo_inicial, avisos: c.avisos,
    premissas: [P("dist_pct"), P("dist_valor")],
    resultado: [
      { titulo: "Distribuição de lucros", estendida: true, linhas: [
        L("lucro_base", "Lucro líquido do ano (base da distribuição)", c.lucro_base, "Lucro líquido da DRE do ano. No ano anterior ao horizonte é o resultado do último balanço realizado."),
        L("dist_gerada", "Distribuição do lucro do ano (paga no ano seguinte)", c.dist_gerada, "Com lucro no ano e % informado, o % do lucro líquido; sem lucro (ou sem %), o valor base, que é o mínimo que a empresa paga. É paga aos sócios no ano seguinte e reduz os lucros acumulados daquele ano.", "total")] },
      { titulo: "Lucros e prejuízos acumulados", linhas: [
        L("anterior", "Saldo do ano anterior", c.anterior, "No primeiro ano, o saldo do último balanço realizado; depois, o saldo final do ano anterior."),
        L("transferido", "(+) Resultado do exercício do ano anterior", c.transferido, "O resultado do ano anterior passa para lucros acumulados quando o ano vira. No primeiro ano é o resultado do último balanço realizado; depois, o lucro líquido da DRE do ano anterior."),
        L("distribuicao", "(−) Distribuição paga no ano", c.distribuicao, "Distribuição decidida para o lucro do ano anterior, paga neste ano."),
        L("lucros", "Saldo de lucros e prejuízos acumulados", c.lucros, "Saldo do ano anterior + resultado transferido − distribuição. Vai para a conta Lucros e Prejuízos Acumulados do balanço.", "total")] },
      { titulo: "Capital integralizado", linhas: [
        L("capital_anterior", "Saldo do ano anterior", c.capital_anterior, "Saldo do último balanço realizado, depois o saldo final do ano anterior."),
        A("capital", "Capital integralizado", c.capital, c.capital_calc, "Traz o saldo do ano anterior. Digite outro valor em qualquer ano para alterar (aporte ou redução); os anos seguintes trazem o novo saldo.")] },
      { titulo: "Ajustes de avaliação patrimonial", linhas: [
        L("ajuste_anterior", "Saldo do ano anterior", c.ajuste_anterior, "Saldo do último balanço realizado, depois o saldo final do ano anterior."),
        A("ajustes", "Ajustes de avaliação patrimonial", c.ajustes, c.ajustes_calc, "Traz o saldo do ano anterior. Digite outro valor em qualquer ano para alterar (reavaliações, por exemplo); os anos seguintes trazem o novo saldo.")] },
    ],
  };
}

export async function comparar(bd: Bd, aId: number, bId: number) {
  const la = await ler(bd, aId), lb = await ler(bd, bId);
  const anos = la.anos.filter((a) => lb.anos.includes(a)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const achatar = (d: any): Map<string, any> => new Map(d.resultado.flatMap((s: any) => s.linhas).map((l: any) => [l.id, l]));
  const ia = achatar(la), ib = achatar(lb);
  const linhas: any[] = [];
  for (const [id, l] of ia) {
    const q = ib.get(id) ?? l;
    linhas.push({ id, nome: l.nome, anos: Object.fromEntries(anos.map((a) => [a, { a: l.valores[a], b: q.valores[a], delta: q.valores[a] - l.valores[a], pct: l.valores[a] ? ((q.valores[a] - l.valores[a]) / Math.abs(l.valores[a])) * 100 : null }])) });
  }
  return { a: la.versao, b: lb.versao, anos, linhas };
}
