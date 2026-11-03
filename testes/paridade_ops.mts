// Executa uma lista de operações no Python e no TypeScript sobre o mesmo banco e compara: o que cada operação devolve (ou o erro) e todas as tabelas no fim.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bdTeste } from "../netlify/functions/lib/bd-teste.mts";
import { carregarJson, type DadosSqlite } from "../netlify/functions/lib/carga.mts";
import { registro } from "./registro_ops.mts";

const TEMPO = ["criado_em", "aprovado_em", "quando", "importado_em", "atualizado_em", "validado_em", "criada_em"];
const LEGADO = ["financiado_pct", "fin_taxa", "fin_prazo", "fin_carencia"];          // colunas antigas do SQLite que o esquema novo não tem
const semHora = (x: any) => JSON.stringify(x, (_k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v) ? "<hora>" : v));
const arred = (v: any): any => (typeof v === "number" ? v : v === undefined ? null : Array.isArray(v) ? v.map(arred)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => !TEMPO.includes(k) && !LEGADO.includes(k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, arred(x)])) : v);

// primeiro ponto em que dois resultados diferem (caminho e valores), para a mensagem do teste não despejar o JSON inteiro
function onde(a: any, b: any, caminho = ""): string | null {
  if (a === b) return null;
  if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-8 + 1e-9 * Math.max(Math.abs(a), Math.abs(b))) return null;       // diferença de arredondamento (a soma do SQLite é mais exata que a do Postgres)
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const ruido = !Array.isArray(a) && "pct" in a && typeof a.a === "number" && Math.abs(a.a) < 1e-6;           // variação % sobre um valor que é só ruído de arredondamento perto de zero
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (ruido && k === "pct") continue; const r = onde(a[k], b[k], `${caminho}.${k}`); if (r) return r; }
    return null;
  }
  return `${caminho}: Python ${JSON.stringify(a)?.slice(0, 160)} ≠ TypeScript ${JSON.stringify(b)?.slice(0, 160)}`;
}

export async function compararOperacoes(banco: string, montarOps: (dados: DadosSqlite) => unknown[][]) {
  const pasta = mkdtempSync(join(tmpdir(), "ops-"));
  const antes = join(pasta, "antes.json"), opsArq = join(pasta, "ops.json"), depois = join(pasta, "depois.json");
  execFileSync("python3", ["ferramentas/exportar_sqlite.py", banco, antes]);
  const dados = JSON.parse(readFileSync(antes, "utf8")) as DadosSqlite;
  const ops = montarOps(dados);
  writeFileSync(opsArq, JSON.stringify(ops));
  execFileSync("python3", ["ferramentas/paridade_ops.py", banco, opsArq, depois], { maxBuffer: 1 << 28 });
  const ref = JSON.parse(readFileSync(depois, "utf8"));

  const { bd } = await bdTeste();
  await carregarJson(bd, dados);
  const dif: string[] = [];
  await bd.q("BEGIN");
  for (let i = 0; i < ops.length; i++) {
    const [nome, ...args] = ops[i] as [string, ...any[]];
    let res: any;
    try { await bd.q("SAVEPOINT op"); res = { ok: await registro[nome](bd, ...args) }; await bd.q("RELEASE SAVEPOINT op"); }
    catch (e: any) { await bd.q("ROLLBACK TO SAVEPOINT op"); res = { erro: String(e.message) }; }
    const py = ref.resultados[i];
    if ("erro" in py || "erro" in res) { if (py.erro !== res.erro) dif.push(`op ${i} ${JSON.stringify(ops[i]).slice(0, 150)}: Python ${JSON.stringify(py).slice(0, 300)} ≠ TypeScript ${JSON.stringify(res).slice(0, 300)}`); }
    else {
      const ponto = onde(JSON.parse(semHora(arred(py.ok ?? null))), JSON.parse(semHora(arred(JSON.parse(JSON.stringify(res.ok ?? null))))));
      if (ponto) dif.push(`op ${i} ${JSON.stringify(ops[i]).slice(0, 150)}: difere em ${ponto}`);
    }
  }
  await bd.q("COMMIT");
  for (const [tabela, t] of Object.entries(ref.depois as DadosSqlite)) {
    const noPg = (await bd.q<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?", [tabela])).map((x) => x.column_name);
    const cols = t.colunas.filter((c) => !TEMPO.includes(c) && noPg.includes(c) && !(tabela === "auditoria" && c === "id"));       // o id da auditoria pula números quando uma operação falha (o Postgres não devolve o contador)
    if (!cols.length) continue;
    const norm = (l: any) => JSON.stringify(cols.map((c) => (c === "detalhe" ? String(l[c] ?? "").replace(/(\d)\.0\b/g, "$1") : typeof l[c] === "number" ? Number(l[c].toPrecision(12)) : arred(l[c]))));       // o texto da auditoria mostra 120.0 no Python e 120 no TypeScript
    const esperado = t.linhas.map((l) => norm(Object.fromEntries(t.colunas.map((c, i) => [c, l[i]])))).sort();
    const obtido = (await bd.q(`SELECT ${cols.join(", ")} FROM ${tabela}`)).map(norm).sort();
    if (JSON.stringify(esperado) !== JSON.stringify(obtido)) {
      const soPy = esperado.filter((x: string) => !obtido.includes(x)).slice(0, 3), soTs = obtido.filter((x: string) => !esperado.includes(x)).slice(0, 3);
      dif.push(`tabela ${tabela}: Python ${esperado.length} linhas, TypeScript ${obtido.length}. Só no Python: ${soPy.join(" | ")}. Só no TypeScript: ${soTs.join(" | ")}`);
    }
  }
  return { dif, erros: ref.resultados.filter((r: any) => "erro" in r).length, total: ops.length, resultados: ref.resultados, ops };
}
