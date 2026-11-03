import { describe, it, expect } from "vitest";
import { compararOperacoes } from "./paridade_ops.mts";

const BANCO = process.env.BANCO_REAL;

describe.skipIf(!BANCO)("paridade de escritas: áreas, produtividade, preços, pecuária, arrendamentos, grupos, anotações", () => {
  it("a mesma sequência de operações deixa tudo igual", async () => {
    const r = await compararOperacoes(BANCO!, (d) => {
      const vid = d.versoes.linhas.map((l) => l[d.versoes.colunas.indexOf("id")] as number)[0];
      const cult = d.culturas.linhas.map((l) => l[d.culturas.colunas.indexOf("id")] as number).slice(0, 4);
      const [c1, c2, c3, c4] = cult;
      const ab = d.versoes.linhas[0][d.versoes.colunas.indexOf("ano_base")] as number;
      const ops: unknown[][] = [
        ["versoes.copiar", vid, "revisao"],
        ["areas.adicionar", vid, c1], ["areas.adicionar", vid, c1],                       // repetida: erro igual nos dois
        ["areas.adicionar", vid, c2],
        ["areas.salvar", vid, c1, ab, 12.5], ["areas.salvar", vid, c1, ab + 1, -3], ["areas.salvar", vid, c1, 1999, 3],
        ["areas.replicar", vid, c1, ab], ["areas.replicar_todas", vid, ab], ["areas.replicar_todas", vid, ab + 99],
        ["extras.incluir", vid, "produtividade", c3], ["extras.incluir", vid, "precos", c3], ["extras.incluir", vid, "xx", c3],
        ["prod.salvar", vid, c1, ab, 3200], ["prod.salvar", vid, c4, ab, 10], ["prod.replicar", vid, c1, ab], ["prod.replicar_todas", vid, ab],
        ["precos.salvar", vid, c1, ab, 2.35], ["precos.replicar", vid, c1, ab], ["precos.replicar", vid, c2, ab], ["precos.replicar_todas", vid, ab],
        ["pec.salvar", vid, "animais", ab, 40], ["pec.salvar", vid, "kg_animal_dia", ab, 18], ["pec.salvar", vid, "producao_dia", ab, 1],
        ["pec.replicar", vid, "animais", ab], ["pec.replicar_todos", vid, ab],
        ["extras.remover", vid, "produtividade", c3], ["extras.remover", vid, "produtividade", c1], ["areas.remover", vid, c2], ["areas.remover", vid, c1],
        ["grupos.criar", { nome: "  Insumos   teste ", classificacao: "direto" }], ["grupos.criar", { nome: "x", classificacao: "outro" }],
        ["grupos.criar", { nome: "Insumos teste", classificacao: "direto" }], ["grupos.atualizar", 1, { nome: "Renomeado", classificacao: "indireto", ativa: false }],
        ["notas.salvar", vid, "dre", "DS007|" + ab, "amarelo", "conferir", 123.4], ["notas.salvar", vid, "dre", "DS008|" + ab, "roxo", ""],
        ["notas.validar", vid, "dre", "DS007|" + ab, true], ["notas.validar", vid, "dre", "nao-existe", true], ["notas.salvar", vid, "dre", "DS007|" + ab, "", ""],
        ["arr.criar_fazenda", vid, { nome: "Fazenda A", tipo: "arrendada", forma: "produto", cultura_id: c1, arrendador: "João" }],
        ["arr.criar_fazenda", vid, { nome: "Fazenda B", tipo: "arrendada", forma: "reais" }], ["arr.criar_fazenda", vid, { nome: "", tipo: "propria" }],
        ["arr.salvar_ano", 1, ab, 100, 5], ["arr.salvar_ano", 2, ab, 50, 900], ["arr.replicar_fazenda", 2, ab, ["valor"]], ["arr.replicar_fazenda", 2, ab, []],
        ["arr.salvar_parcelas", 1, [{ mes: 3, percentual: 50 }, { mes: 9, percentual: 50 }]], ["arr.salvar_parcelas", 1, [{ mes: 3, percentual: 50 }, { mes: 3, percentual: 50 }]],
        ["arr.salvar_precos", vid, [{ cultura_id: c1, ano: ab, preco: 120 }]], ["arr.replicar_preco", vid, c1, ab], ["arr.replicar_preco", vid, c2, ab],
        ["arr.atualizar_fazenda", 2, { nome: "Fazenda B2", tipo: "propria", forma: "reais" }], ["arr.excluir_fazenda", 1],
        ["versoes.periodo", vid, "Novo", ab - 1, ab + 3], ["versoes.horizonte", vid, 2],
      ];
      // leituras e comparações depois de tudo (as comparações usam a cópia criada na primeira operação)
      const nova = Math.max(...d.versoes.linhas.map((l) => l[d.versoes.colunas.indexOf("id")] as number)) + 1;
      for (const v of [vid, nova]) for (const m of ["areas", "produtividade", "precos_venda", "pecuaria", "arrendamentos"]) ops.push([`ler.${m}`, v]);
      ops.push(["ler.culturas"], ["ler.grupos"], ["ler.notas", vid, "dre"]);
      for (const m of ["areas", "produtividade", "precos_venda", "pecuaria", "arrendamentos"]) ops.push([`comparar.${m}`, vid, nova], [`comparar.${m}`, nova, vid]);
      return ops;
    });
    expect(r.dif).toEqual([]);
    expect(r.erros).toBeGreaterThan(5);        // as operações inválidas também precisam dar o mesmo erro
  }, 300000);
});
