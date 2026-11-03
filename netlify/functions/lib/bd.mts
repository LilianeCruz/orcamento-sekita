// Acesso ao banco com uma interface única, usada em produção (Postgres do Supabase) e nos testes (PGlite, um Postgres em memória).
// O SQL é escrito com "?" como no sistema em Python; aqui o "?" vira $1, $2... Quando um parâmetro entra direto num SELECT
// (INSERT ... SELECT ?, col ...), escreva "?::int" (ou ::text) porque o Postgres não adivinha o tipo.
export type Linha = Record<string, any>;
export interface Bd {
  q<T = Linha>(texto: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (bd: Bd) => Promise<T>): Promise<T>;
}

export function numerar(texto: string): string {
  let n = 0, saida = "", aspa = false;
  for (const c of texto) {
    if (c === "'") aspa = !aspa;
    saida += c === "?" && !aspa ? `$${++n}` : c;
  }
  return saida;
}

// bigint (count, sum de inteiros) vira número comum, para as contas em JavaScript
export function normalizar<T>(linhas: any[]): T[] {
  return linhas.map((l) => {
    const o: Linha = {};
    for (const k of Object.keys(l)) o[k] = typeof l[k] === "bigint" ? Number(l[k]) : l[k];
    return o as T;
  });
}
export const limparParams = (p: unknown[] = []) => p.map((x) => (x === undefined ? null : typeof x === "boolean" ? (x ? 1 : 0) : x));

// Guarda o resultado das leituras (SELECT) até a próxima escrita: os cálculos (DRE, balanço, caixa, comparação...) chamam uns aos outros e repetem as mesmas
// consultas muitas vezes; assim cada consulta vai ao banco uma vez só por requisição. Qualquer comando que não seja SELECT/WITH apaga o que foi guardado.
// Cada leitura devolve uma cópia, porque quem chama pode alterar as linhas.
export function comCache(executar: (texto: string, params: unknown[]) => Promise<any[]>) {
  const guardado = new Map<string, any[]>();
  return async (texto: string, params: unknown[] = []): Promise<any[]> => {
    const leitura = /^\s*(select|with)\b/i.test(texto) && !/\b(setval|nextval)\b/i.test(texto) && !/\bfor\s+update\b/i.test(texto);
    if (!leitura) { guardado.clear(); return executar(texto, params); }
    const chave = texto + "\u0000" + JSON.stringify(params, (_k, v) => (typeof v === "bigint" ? String(v) : v));
    const antes = guardado.get(chave);
    if (antes) return structuredClone(antes);
    const linhas = await executar(texto, params);
    guardado.set(chave, structuredClone(linhas));
    return linhas;
  };
}
