// Pequenas peças usadas por vários módulos de premissas
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, type Versao } from "./base.mts";

export const delta = (x: number, y: number) => ({ a: x, b: y, delta: y - x, pct: x ? ((y - x) / x) * 100 : null });
export const marcas = (n: number) => (n ? Array(n).fill("?").join(",") : "NULL");       // lista para "IN (...)"; vazia vira NULL
export const porNome = (o: Record<number, { nome: string }>) => (a: number, b: number) => o[a].nome.toLowerCase() < o[b].nome.toLowerCase() ? -1 : o[a].nome.toLowerCase() > o[b].nome.toLowerCase() ? 1 : 0;

// anos de destino de uma replicação (os seguintes ao de origem)
export function destinosDe(v: Versao, anoOrigem: number, exigirAlgum = false): number[] {
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte");
  const d = anos.filter((a) => a > anoOrigem);
  if (exigirAlgum && !d.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  return d;
}
export async function upsert(bd: Bd, sql: string, params: unknown[]) { await bd.q(sql, params); }

// vários registros de uma vez ("INSERT INTO tabela(cols) VALUES ... "), em lotes
export async function inserirLinhas(bd: Bd, tabela: string, colunas: string[], linhas: unknown[][], sufixo = "") {
  const lote = Math.max(1, Math.floor(30000 / colunas.length));
  for (let i = 0; i < linhas.length; i += lote) {
    const parte = linhas.slice(i, i + lote);
    const valores = parte.map(() => `(${colunas.map(() => "?").join(",")})`).join(",");
    await bd.q(`INSERT INTO ${tabela}(${colunas.join(",")}) VALUES ${valores} ${sufixo}`, parte.flat());
  }
}
