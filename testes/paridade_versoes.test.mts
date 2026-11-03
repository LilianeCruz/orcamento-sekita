import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bdTeste } from "../netlify/functions/lib/bd-teste.mts";
import { carregarJson, type DadosSqlite } from "../netlify/functions/lib/carga.mts";
import * as versoes from "../netlify/functions/servicos/versoes.mts";
import * as culturas from "../netlify/functions/servicos/culturas.mts";

// Banco real (cópia lida, nunca alterada). Defina BANCO_REAL=/caminho/orcamento.db para rodar; sem ele o teste é ignorado.
const BANCO = process.env.BANCO_REAL;
const TEMPO = ["criado_em", "aprovado_em", "quando", "importado_em", "atualizado_em", "validado_em"];

describe.skipIf(!BANCO)("paridade Python × TypeScript: versões e produtos", () => {
  it("as mesmas operações deixam o banco igual", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "par-"));
    const antes = join(pasta, "antes.json"), depois = join(pasta, "depois.json");
    execFileSync("python3", ["ferramentas/exportar_sqlite.py", BANCO!, antes]);
    execFileSync("python3", ["ferramentas/paridade_versoes.py", BANCO!, depois]);
    const ref = JSON.parse(readFileSync(depois, "utf8"));
    const { bd } = await bdTeste();
    await carregarJson(bd, JSON.parse(readFileSync(antes, "utf8")) as DadosSqlite);

    const res: Record<string, any> = { origem: ref.resultados.origem };
    res.novo = await versoes.criarOrcado(bd, { ano_base: 2030 }, "t@x.com");
    res.copia1 = await versoes.copiarVersao(bd, res.origem, "revisao", null, "t@x.com");
    res.copia2 = await versoes.copiarVersao(bd, res.copia1, "reprojetado", "Teste copia 2", "t@x.com");
    await versoes.alterarPeriodo(bd, res.copia2, "Novo nome", 2026, 2031, "t@x.com");
    await versoes.alterarHorizonte(bd, res.copia2, 4, "t@x.com");
    res.cultura = await culturas.criarCultura(bd, { nome: "ZZ Teste", grupo: "Grãos", unidade: "kg", embalagem: "Saca", qtd_por_embalagem: 60, ativa: true, receita_tipo: "operacional", estoque_destino: "produto" }, "t@x.com");
    await culturas.atualizarCultura(bd, res.cultura, { nome: "ZZ Teste 2", grupo: "Hortifruti", unidade: "kg", embalagem: "", qtd_por_embalagem: 0, ativa: true, receita_tipo: "operacional", estoque_destino: "produto" }, "t@x.com");
    const lista = (await culturas.listarCulturas(bd)).culturas;
    await culturas.excluirCultura(bd, res.cultura, "t@x.com");
    await versoes.excluirVersao(bd, res.copia1, "t@x.com");

    // ids devolvidos e lista de produtos iguais
    const { lista: listaPy, ...ids } = ref.resultados;
    expect(res).toEqual(ids);
    expect(lista.map((c: any) => { const o = { ...c }; for (const k of TEMPO) delete o[k]; return o; }))
      .toEqual(listaPy.map((c: any) => { const o = { ...c }; for (const k of TEMPO) delete o[k]; return o; }));

    // todas as tabelas, linha a linha (sem as colunas de data/hora)
    const diferencas: string[] = [];
    for (const [tabela, t] of Object.entries(ref.depois as DadosSqlite)) {
      // colunas antigas que só existem no banco real (sem uso no código) ficam de fora
      const noPg = (await bd.q<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?", [tabela])).map((x) => x.column_name);
      const cols = t.colunas.filter((c) => !TEMPO.includes(c) && noPg.includes(c));
      if (!cols.length) continue;
      const norm = (l: any) => JSON.stringify(cols.map((c) => { const v = l[c]; return typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v === undefined ? null : v; }));
      const esperado = t.linhas.map((l) => norm(Object.fromEntries(t.colunas.map((c, i) => [c, l[i]])))).sort();
      const obtido = (await bd.q(`SELECT ${cols.join(", ")} FROM ${tabela}`)).map((l) => norm(l)).sort();
      if (JSON.stringify(esperado) !== JSON.stringify(obtido)) diferencas.push(`${tabela}: Python ${esperado.length} linhas, TypeScript ${obtido.length}`);
    }
    expect(diferencas).toEqual([]);
  }, 120000);
});
