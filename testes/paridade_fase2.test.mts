import { describe, it, expect } from "vitest";
import { compararOperacoes } from "./paridade_ops.mts";

const BANCO = process.env.BANCO_REAL;

describe.skipIf(!BANCO)("paridade: custos, premissas, rebanho e resultado por produto", () => {
  it("a mesma sequência de operações e os mesmos cálculos", async () => {
    const r = await compararOperacoes(BANCO!, (d) => {
      const vid = d.versoes.linhas[0][d.versoes.colunas.indexOf("id")] as number;
      const ab = d.versoes.linhas[0][d.versoes.colunas.indexOf("ano_base")] as number;
      const [CEN, SOJA, LEITE, GADO, ABAC] = [1, 3, 6, 7, 10];
      const [G_MO, G_INS, G_MEC] = [1, 2, 3];
      const ops: unknown[][] = [];
      const add = (...o: unknown[]) => ops.push(o);
      // produção: áreas, produtividade, preços
      for (const c of [CEN, SOJA]) add("areas.adicionar", vid, c);
      for (let i = 0; i < 4; i++) { add("areas.salvar", vid, CEN, ab + i, 10 + i); add("areas.salvar", vid, SOJA, ab + i, 100 + 5 * i); }
      for (let i = 0; i < 4; i++) { add("prod.salvar", vid, CEN, ab + i, 45000 + 500 * i); add("prod.salvar", vid, SOJA, ab + i, 3300); }
      add("extras.incluir", vid, "produtividade", GADO); add("extras.incluir", vid, "precos", GADO);
      for (let i = 0; i < 4; i++) { add("pec.salvar", vid, "animais", ab + i, 40 + i); add("pec.salvar", vid, "kg_animal_dia", ab + i, 18); }
      for (let i = 0; i < 4; i++) { add("precos.salvar", vid, CEN, ab + i, 2.1); add("precos.salvar", vid, SOJA, ab + i, 1.8 + i / 10); add("precos.salvar", vid, GADO, ab + i, 2400); add("precos.salvar", vid, LEITE, ab + i, 2.9); }
      add("precos.salvar", vid, ABAC, ab, 1);                                           // produto fora da lista: mesmo erro nos dois
      // custos variáveis
      add("custos.adicionar_cultura", vid, ABAC); add("custos.adicionar_cultura", vid, ABAC);
      for (const c of [CEN, SOJA, LEITE, GADO]) { add("custos.adicionar_grupo", vid, c, G_INS); add("custos.adicionar_grupo", vid, c, G_MEC); }
      add("custos.adicionar_grupo", vid, CEN, G_INS); add("custos.adicionar_grupo", vid, CEN, 999); add("custos.adicionar_grupo_a_todas", vid, G_MO);
      for (let i = 0; i < 4; i++) {
        add("custos.salvar", vid, CEN, G_INS, ab + i, 18000 + 100 * i); add("custos.salvar", vid, CEN, G_MO, ab + i, 6000);
        add("custos.salvar", vid, SOJA, G_INS, ab + i, 2500); add("custos.salvar", vid, SOJA, G_MEC, ab + i, 700);
        add("custos.salvar", vid, LEITE, G_INS, ab + i, 0.9); add("custos.salvar", vid, GADO, G_INS, ab + i, 900000 + 10000 * i);
      }
      add("custos.salvar", vid, CEN, G_INS, ab, -5); add("custos.replicar", vid, CEN, G_INS, ab + 2); add("custos.replicar_todos", vid, ab);
      // premissas por produto
      for (const c of [CEN, SOJA, GADO]) add("prem.adicionar_cultura", vid, c);
      add("prem.adicionar_cultura", vid, ABAC);
      for (const t of ["descarte", "deducao_receita", "estoque", "sementes", "estoque_ant", "custo_estoque_ant"]) add("prem.adicionar_tipo", vid, CEN, t);
      add("prem.adicionar_tipo_a_todas", vid, "deducao_receita"); add("prem.adicionar_tipo_a_todas", vid, "descarte"); add("prem.adicionar_tipo", vid, CEN, "inexistente");
      for (let i = 0; i < 4; i++) {
        add("prem.salvar", vid, CEN, "descarte", ab + i, 8); add("prem.salvar", vid, CEN, "deducao_receita", ab + i, 3.5);
        add("prem.salvar", vid, CEN, "estoque", ab + i, i === 2 ? 99999999 : 20000); add("prem.salvar", vid, CEN, "sementes", ab + i, 1500);
        add("prem.salvar", vid, SOJA, "deducao_receita", ab + i, 2); add("prem.salvar", vid, GADO, "deducao_receita", ab + i, 1.5);
      }
      add("prem.salvar", vid, CEN, "estoque_ant", ab - 1, 15000); add("prem.salvar", vid, CEN, "custo_estoque_ant", ab - 1, 0.9);
      add("prem.salvar", vid, CEN, "estoque_ant", ab, 1); add("prem.salvar", vid, CEN, "descarte", ab, 150); add("prem.replicar", vid, CEN, "descarte", ab);
      add("prem.replicar", vid, CEN, "estoque_ant", ab - 1); add("prem.replicar_todas", vid, ab);
      // rebanho (gado de corte)
      add("reb.salvar", vid, GADO, "saldo_ini", ab, 300); add("reb.salvar", vid, GADO, "valor_ini", ab, 600000); add("reb.salvar", vid, GADO, "saldo_ini", ab + 1, 1);
      for (let i = 0; i < 4; i++) { add("reb.salvar", vid, GADO, "compras", ab + i, 50); add("reb.salvar", vid, GADO, "nascimentos", ab + i, 20); add("reb.salvar", vid, GADO, "mortes", ab + i, 5); add("reb.salvar", vid, GADO, "vendas", ab + i, i === 3 ? 900 : 120); }
      add("reb.salvar", vid, CEN, "vendas", ab, 5); add("reb.replicar", vid, GADO, "mortes", ab); add("reb.replicar", vid, GADO, "saldo_ini", ab);
      // leituras e comparações (a cópia usa a primeira operação de outra rodada: aqui comparamos com uma cópia feita agora)
      add("versoes.copiar", vid, "revisao");
      const nova = Math.max(...d.versoes.linhas.map((l) => l[d.versoes.colunas.indexOf("id")] as number)) + 1;
      add("custos.salvar", nova, CEN, G_INS, ab, 22000); add("prem.salvar", nova, CEN, "descarte", ab, 12); add("precos.salvar", nova, CEN, ab, 2.5);
      for (const v of [vid, nova]) for (const m of ["custos", "premissas", "rebanho", "resultado", "areas", "produtividade", "precos_venda", "pecuaria"]) add(`ler.${m}`, v);
      for (const m of ["custos", "premissas", "resultado"]) add(`comparar.${m}`, vid, nova), add(`comparar.${m}`, nova, vid);
      // produtos: criar/atualizar/excluir com os novos usos
      add("culturas.atualizar", GADO, { nome: "Gado de corte", grupo: "Pecuária", unidade: "uni", estoque_destino: "produto" }); add("ler.resultado", vid);
      add("culturas.excluir", CEN); add("areas.remover", vid, CEN); add("ler.custos", vid); add("ler.premissas", vid); add("ler.resultado", vid);
      return ops;
    });
    // garante que o teste exercita números de verdade: o primeiro resultado lido tem receita e custos diferentes de zero
    const i = r.ops.findIndex((o: any) => o[0] === "ler.resultado");
    const rb = Object.values((r.resultados[i].ok.consolidado.anual.find((l: any) => l.id === "receita_bruta_anual")).valores) as number[];
    expect(rb.some((x) => x > 0)).toBe(true);
    expect(r.resultados[i].ok.culturas.length).toBeGreaterThanOrEqual(3);
    expect(r.total).toBeGreaterThan(150);
    expect(r.dif).toEqual([]);
    expect(r.erros).toBeGreaterThan(8);
  }, 400000);
});
