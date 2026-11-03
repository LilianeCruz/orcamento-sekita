import postgres from "postgres";

// Conexão com o Postgres do Supabase pelo "pooler" (modo transação): sem prepared statements e com 1 conexão por execução.
// DATABASE_URL = string de conexão do pooler (Supabase → Connect → Transaction pooler), configurada só nas variáveis do Netlify.
let _sql: ReturnType<typeof postgres> | null = null;
export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    _sql = postgres(url, { prepare: false, max: 1, ssl: "require", idle_timeout: 20 });
  }
  return _sql;
}
