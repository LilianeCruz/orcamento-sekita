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

// formatos do Python: f"{x:,.0f}" (arredonda empate para o par) e f"{x:g}"
export function fmt0(x: number): string {
  const a = Math.abs(x), f = Math.floor(a), d = a - f;
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
  return (x < 0 && r !== 0 ? "-" : "") + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
export const fmtG = (x: number): string => String(Number(x.toPrecision(6)));
export const nomeMin = (c: string) => `lower(${c}) COLLATE "C"`;      // ordem "sem diferenciar maiúsculas" (COLLATE NOCASE do SQLite)

// f"{x:.{d}f}" do Python: casas decimais exatas, empate (só possível em valores exatos na base 2) arredonda para o par
export function fixo(x: number, d: number): string {
  const neg = x < 0;
  const [inteira, frac = ""] = Math.abs(x).toFixed(Math.min(100, d + 40)).split(".");
  const resto = frac.slice(d);
  let digitos = BigInt(inteira + frac.slice(0, d));
  const maisQueMeio = resto[0] > "5" || (resto[0] === "5" && /[1-9]/.test(resto.slice(1)));
  const meio = resto[0] === "5" && !/[1-9]/.test(resto.slice(1));
  if (maisQueMeio || (meio && digitos % 2n === 1n)) digitos += 1n;
  let s = digitos.toString().padStart(d + 1, "0");
  if (d > 0) s = s.slice(0, s.length - d) + "." + s.slice(s.length - d);
  return (neg && /[1-9]/.test(s) ? "-" : neg ? "-" : "") + s;
}
export const redondo = (x: number, d: number): number => Number(fixo(x, d));            // round(x, d) do Python
