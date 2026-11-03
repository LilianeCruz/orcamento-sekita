import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bdTeste } from "../netlify/functions/lib/bd-teste.mts";
import { carregarJson, type DadosSqlite } from "../netlify/functions/lib/carga.mts";
import * as arr from "../netlify/functions/servicos/arrendamentos.mts";
import * as grupos from "../netlify/functions/servicos/grupos-custo.mts";
import * as versoes from "../netlify/functions/servicos/versoes.mts";

const BANCO = process.env.BANCO_REAL;

// compara dois valores JSON, aceitando diferença mínima de ponto flutuante
function iguais(a: any, b: any, caminho = "", dif: string[] = []): string[] {
  if (typeof a === "number" && typeof b === "number") { if (Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(a), Math.abs(b))) dif.push(`${caminho}: ${a} ≠ ${b}`); return dif; }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of ks) if (!["criado_em", "aprovado_em"].includes(k)) iguais(a[k], b[k], `${caminho}.${k}`, dif);       // datas de criação mudam a cada execução
    return dif;
  }
  if (a !== b && !(a == null && b == null)) dif.push(`${caminho}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  return dif;
}

describe.skipIf(!BANCO)("paridade Python × TypeScript: arrendamentos e grupos de custo", () => {
  it("leitura, cálculo, comparação, parcelas e grupos saem iguais", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "par-"));
    const antes = join(pasta, "antes.json"), saida = join(pasta, "saida.json");
    execFileSync("python3", ["ferramentas/exportar_sqlite.py", BANCO!, antes]);
    execFileSync("python3", ["ferramentas/paridade_arrendamentos.py", BANCO!, saida]);
    const ref = JSON.parse(readFileSync(saida, "utf8"));
    const { bd } = await bdTeste();
    await carregarJson(bd, JSON.parse(readFileSync(antes, "utf8")) as DadosSqlite);

    const dif: string[] = [];
    for (const v of ref.versoes) {
      const ts = JSON.parse(JSON.stringify({ ...(await arr.lerArrendamentos(bd, v)), calculo: await arr.calcularArrendamentos(bd, v) }));
      iguais(ref.ler[v], ts, `versao ${v}`, dif);
    }
    for (const [k, v] of Object.entries(ref.parcelas as Record<string, any>)) {
      const [n, p, m] = k.split("-");
      iguais(v, arr.gerarParcelas(Number(n), p, Number(m)), `parcelas ${k}`, dif);
    }
    iguais(ref.grupos, JSON.parse(JSON.stringify((await grupos.listarGrupos(bd)).grupos)), "grupos", dif);
    const nova = await versoes.copiarVersao(bd, ref.versoes[0], "revisao", null, "t");
    iguais(ref.comparar, JSON.parse(JSON.stringify(await arr.compararArrendamentos(bd, ref.versoes[0], nova))).valueOf(), "comparar", dif);
    expect(dif.slice(0, 20)).toEqual([]);
  }, 120000);
});
