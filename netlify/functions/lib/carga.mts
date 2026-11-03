import type { Bd } from "./bd.mts";

export type DadosSqlite = Record<string, { colunas: string[]; linhas: unknown[][] }>;

// Carrega o JSON exportado do SQLite (ferramentas/exportar_sqlite.py) no Postgres, tabela por tabela, na ordem das chaves estrangeiras,
// e acerta os contadores automáticos (id) para continuarem depois do maior valor. Usada nos testes de paridade e na migração dos dados.
export async function carregarJson(bd: Bd, dados: DadosSqlite): Promise<void> {
  const ordem = (await bd.q<{ relname: string }>("SELECT relname FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace ORDER BY oid")).map((r) => r.relname);
  for (const tabela of [...ordem].reverse()) if (dados[tabela]?.linhas.length) await bd.q(`DELETE FROM ${tabela}`);       // substitui o que já houver (ex.: dados iniciais)
  for (const tabela of ordem) {
    const t = dados[tabela];
    if (!t || !t.linhas.length) continue;
    const objetos = t.linhas.map((l) => Object.fromEntries(t.colunas.map((c, i) => [c, l[i]])));
    for (let i = 0; i < objetos.length; i += 2000) {
      await bd.q(`INSERT INTO ${tabela} SELECT * FROM jsonb_populate_recordset(null::${tabela}, ?::jsonb)`, [JSON.stringify(objetos.slice(i, i + 2000))]);
    }
  }
  // o contador do SQLite (sqlite_sequence) lembra os ids já usados, mesmo de linhas apagadas: o próximo id continua depois dele
  const usados = new Map<string, number>((dados.sqlite_sequence?.linhas ?? []).map((l) => [String(l[0]), Number(l[1])]));
  for (const { table_name: tabela, column_name: col } of await bd.q<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND is_identity='YES'")) {
    const [{ s }] = await bd.q<{ s: string }>("SELECT pg_get_serial_sequence(?, ?) AS s", [tabela, col]);
    await bd.q(`SELECT setval(?, GREATEST((SELECT COALESCE(MAX(${col}), 0) FROM ${tabela}), ?::int, 1), (SELECT COUNT(*) > 0 FROM ${tabela}) OR ?::int > 0)`, [s, usados.get(tabela) ?? 0, usados.get(tabela) ?? 0]);
  }
}
