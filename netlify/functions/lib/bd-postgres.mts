import postgres from "postgres";
import { numerar, normalizar, limparParams, type Bd } from "./bd.mts";

type Sql = ReturnType<typeof postgres>;

function adaptar(sql: Sql): Bd {
  return {
    q: async (texto, params) => normalizar(await sql.unsafe(numerar(texto), limparParams(params) as any[])),
    tx: (fn) => (sql as any).begin((t: Sql) => fn(adaptar(t))),
  };
}

// DATABASE_URL = string de conexão do pooler do Supabase (modo transação); definida só nas variáveis do Netlify
let _sql: Sql | null = null;
export function bdPostgres(): Bd {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    _sql = postgres(url, { prepare: false, max: 1, ssl: "require", idle_timeout: 20,
      types: { bigint: { to: 20, from: [20], serialize: (x: any) => String(x), parse: (x: string) => Number(x) } } });
  }
  return adaptar(_sql);
}
