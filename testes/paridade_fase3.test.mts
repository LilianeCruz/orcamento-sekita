import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compararOperacoes } from "./paridade_ops.mts";

const BANCO = process.env.BANCO_REAL;

describe.skipIf(!BANCO)("paridade: realizado", () => {
  it("importação de planilhas, período em andamento, quantidades e consultas", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "pl-"));
    execFileSync("python3", ["ferramentas/planilhas_teste.py", BANCO!, pasta]);
    const arq = (n: string) => readFileSync(join(pasta, n)).toString("base64");
    const r = await compararOperacoes(BANCO!, (d) => {
      const vid = d.versoes.linhas[0][d.versoes.colunas.indexOf("id")] as number;
      const ab = d.versoes.linhas[0][d.versoes.colunas.indexOf("ano_base")] as number;
      const ops: unknown[][] = [];
      const add = (...o: unknown[]) => ops.push(o);
      add("ler.realizado"); add("ler.real_periodo"); add("ler.real_quantidades"); add("ler.real_produtos"); add("ler.real_importacoes");
      for (const a of [2018, 2024, 2025, 2026, 2027, ab]) { add("real.saldo_inicial", a); add("real.valor", "BP", "SA07", a); add("real.valor", "DRE", "DS018", a); add("real.periodo_do_ano", a); }
      add("real.ultimo_ano");
      // planilha modelo
      add("real.importar", arq("modelo_erro.xlsx"), "modelo_erro.xlsx"); add("real.importar", arq("modelo_dup.xlsx"), "modelo_dup.xlsx");
      add("real.importar", "AAAA", "lixo.xlsx");
      add("real.importar", arq("modelo.xlsx"), "modelo.xlsx", 2020); add("ler.realizado"); add("real.importar", arq("modelo.xlsx"), "modelo.xlsx"); add("ler.realizado");
      add("real.excluir_ano", 2021); add("real.excluir_ano", 2021); add("ler.realizado");
      // banco do Fechamento Contábil
      add("real.importar", arq("fechamento_sem_dezembro.xlsx"), "sem.xlsx");
      add("real.importar", arq("fechamento.xlsx"), "fechamento.xlsx"); add("ler.realizado"); add("real.importar", arq("fechamento.xlsx"), "fechamento.xlsx", 2023); add("ler.realizado");
      // Fechamento Financeiro (com ano em andamento): sem quantidades falha; com todas, entra
      const prods = d.culturas.linhas.filter((l) => l[d.culturas.colunas.indexOf("ativa")] === 1 && l[d.culturas.colunas.indexOf("receita_tipo")] === "operacional").map((l) => l[d.culturas.colunas.indexOf("id")] as number);
      add("real.importar", arq("financeiro.xlsx"), "Financeiro_2t2026.xlsx");
      add("real.importar", arq("financeiro.xlsx"), "Financeiro_2t2026.xlsx", null, null, 3, null, Object.fromEntries(prods.slice(0, 2).map((p) => [p, 1])));
      const q = Object.fromEntries(prods.map((p, i) => [p, 100 * (i + 1)]));
      add("real.importar", arq("financeiro.xlsx"), "Financeiro_2t2026.xlsx", null, null, null, null, q);
      add("real.importar", arq("financeiro.xlsx"), "Financeiro.xlsx", null, null, null, null, q);
      add("real.importar", arq("financeiro.xlsx"), "Financeiro_sem_periodo.xlsx", 2024, 8, 3, vid, q);
      add("real.importar", arq("financeiro.xlsx"), "Financeiro_2t2026.xlsx", 2024, null, null, null, q);
      add("ler.realizado"); add("ler.real_periodo"); add("ler.real_quantidades"); add("ler.real_importacoes");
      for (const a of [2025, 2026, 2027]) { add("real.saldo_inicial", a); add("real.valor", "DRE", "DS018", a); add("real.valor", "BP", "SA08", a); add("real.periodo_do_ano", a); }
      // período e quantidades
      add("real.salvar_periodo", 3, 2); add("real.salvar_periodo", 2, 6, 99999); add("real.salvar_periodo", 2, 6, vid); add("real.salvar_periodo", 1, 6, null); add("ler.real_periodo");
      add("real.salvar_quantidade", prods[0], 55.5); add("real.salvar_quantidade", prods[0], -1); add("real.salvar_quantidade", 99999, 1); add("real.salvar_quantidade", prods[1], null);
      add("real.salvar_quantidade", prods[0], 77, 2025); add("real.salvar_quantidade", prods[0], 77, 1999); add("ler.real_quantidades"); add("ler.real_periodo");
      add("real.modelo_linhas"); add("real.ultimo_ano");
      add("real.excluir_ano", 2026); add("real.excluir_ano", 2026); add("ler.realizado"); add("real.saldo_inicial", 2027);
      return ops;
    });
    expect(r.dif).toEqual([]);
    expect(r.erros).toBeGreaterThan(5);
    expect(r.resultados.filter((x: any) => x.ok?.anos?.length).length).toBeGreaterThanOrEqual(5);
  }, 400000);
});
