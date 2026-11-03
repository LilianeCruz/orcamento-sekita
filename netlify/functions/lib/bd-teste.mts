import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { readFileSync } from "node:fs";
import { numerar, normalizar, limparParams, type Bd } from "./bd.mts";

// Postgres em memória para os testes: carrega o mesmo esquema do Supabase (supabase/migrations/*.sql)
export async function bdTeste(): Promise<{ bd: Bd; pg: PGlite }> {
  const pg = new PGlite({ extensions: { citext } });
  for (const arq of ["0001_esquema.sql", "0002_dados_iniciais.sql"]) {
    await pg.exec(readFileSync(new URL(`../../../supabase/migrations/${arq}`, import.meta.url), "utf8"));
  }
  const adaptar = (c: any): Bd => ({
    q: async (texto, params) => normalizar((await c.query(numerar(texto), limparParams(params))).rows),
    tx: (fn) => c.transaction((t: any) => fn(adaptar(t))),
  });
  return { bd: adaptar(pg), pg };
}
