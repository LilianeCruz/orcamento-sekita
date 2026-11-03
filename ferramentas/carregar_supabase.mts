// Leva os dados do sistema local (SQLite) para o Supabase. Roda com as variáveis do Netlify (a senha do banco nunca aparece aqui):
//   python3 ferramentas/exportar_sqlite.py <orcamento.db> /caminho/dump.json
//   netlify dev:exec -- npx tsx ferramentas/carregar_supabase.mts /caminho/dump.json
// Por segurança só carrega se o banco da nuvem ainda estiver vazio (sem nenhum orçamento); com --forcar substitui o que houver nas tabelas do arquivo.
import { readFileSync } from "node:fs";
import { bdPostgres } from "../netlify/functions/lib/bd-postgres.mts";
import { carregarJson, type DadosSqlite } from "../netlify/functions/lib/carga.mts";

const [, , arquivo, ...opcoes] = process.argv;
if (!arquivo) { console.error("Uso: carregar_supabase.mts <dump.json> [--forcar]"); process.exit(1); }
const dados = JSON.parse(readFileSync(arquivo, "utf8")) as DadosSqlite;
const bd = bdPostgres();
const [{ n }] = await bd.q<{ n: number }>("SELECT count(*)::int AS n FROM versoes");
if (n > 0 && !opcoes.includes("--forcar")) { console.error(`O banco da nuvem já tem ${n} orçamento(s). Nada foi carregado (use --forcar para substituir).`); process.exit(2); }
await bd.tx((t) => carregarJson(t, dados));
console.log("Carga concluída. Conferência (linhas no Supabase × no SQLite):");
let diferencas = 0;
for (const [tabela, t] of Object.entries(dados)) {
  if (tabela === "sqlite_sequence") continue;
  const existe = await bd.q("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=?", [tabela]);
  if (!existe.length) { console.log(`  ${tabela}: ${t.linhas.length} linhas só no SQLite (tabela fora do esquema novo)`); continue; }
  const [{ c }] = await bd.q<{ c: number }>(`SELECT count(*)::int AS c FROM ${tabela}`);
  if (c !== t.linhas.length) { diferencas++; console.log(`  ${tabela}: SQLite ${t.linhas.length} ≠ Supabase ${c}`); }
}
console.log(diferencas ? `${diferencas} tabela(s) com contagem diferente` : "Todas as tabelas têm o mesmo número de linhas.");
process.exit(0);
