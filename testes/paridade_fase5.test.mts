import { describe, it, expect } from "vitest";
import { compararOperacoes } from "./paridade_ops.mts";
import { cenarioProducao } from "./cenario.mts";

const BANCO = process.env.BANCO_REAL;

describe.skipIf(!BANCO)("paridade: demonstrativos, orçado × realizado, comparação, impressão, anotações e início", () => {
  it("Usos e fontes, indicadores, fluxo, realizado × orçado, comparação com impacto e anotações com valor alterado", async () => {
    const r = await compararOperacoes(BANCO!, (d) => {
      const vid = d.versoes.linhas[0][d.versoes.colunas.indexOf("id")] as number;
      const ab = 2025;
      const ops: unknown[][] = [];
      const add = (...o: unknown[]) => ops.push(o);
      add("versoes.periodo", vid, "Orçamento 2025-2030", ab, ab + 5);
      cenarioProducao(add, vid, ab);
      add("div.vincular", vid, 3); add("cg.atualizar_prazos", vid, [2024, 2025]); add("dp.atualizar", vid, [2024, 2025]);
      for (let i = 0; i < 5; i++) { add("inv.salvar", vid, 4, "novo", ab + i, 3000); add("inv.salvar", vid, 4, "a_carregar", ab + i, 500); add("inv.salvar", vid, 4, "financiado", ab + i, 1500); add("inv.salvar", vid, 2, "novo", ab + i, 400); }
      add("cap.criar", vid, { nome: "Custeio", tipo: "custeio", ano: ab + 1, valor: 9000, taxa: 12, prazo: 3, carencia: 1 });
      for (const a of [ab, ab + 1, ab + 2, ab + 3]) { add("cap.salvar_premissa", vid, "taxa", a, 11); add("cap.salvar_premissa", vid, "prazo", a, 4); add("cap.salvar_premissa", vid, "carencia", a, 1); }
      add("pat.salvar", vid, "dist_pct", ab - 1, 30); add("pat.salvar", vid, "dist_pct", ab, 25); add("pat.salvar", vid, "dist_valor", ab, 500);
      add("pd.criar", "Doação", "dre", "DS039", 1); add("pd.incluir", vid, 3); add("pd.incluir", vid, 2); add("pd.incluir", vid, 4);
      for (let i = 0; i < 5; i++) { add("pd.salvar", vid, 4, ab + i, 150); add("pd.salvar", vid, 2, ab + i, 3); }
      // ---- demonstrativos
      for (const m of ["fluxo_dem", "usos_fontes", "indicadores", "dre", "balanco", "inicio"]) add(`ler.${m}`, vid);
      for (let i = 0; i < 3; i++) { add("demo.salvar_meta", vid, "alav_total", ab + i, 2.5 + i); add("demo.salvar_meta", vid, "roe", ab + i, 0.1); }
      add("demo.salvar_meta", vid, "equilibrio", ab, 1); add("demo.salvar_meta", vid, "xx", ab, 1); add("demo.salvar_meta", vid, "roe", ab, -1); add("demo.salvar_meta", vid, "roe", 1999, 1);
      add("demo.replicar_meta", vid, "alav_total", ab + 2); add("demo.replicar_meta", vid, "liquidez", ab); add("demo.replicar_meta", vid, "equilibrio", ab); add("demo.replicar_meta", vid, "roe", ab + 5);
      add("ler.indicadores", vid); add("ler.usos_fontes", vid);
      // ---- orçado × realizado: ano fechado e ano em andamento (com quantidades vendidas)
      add("ler.orcreal", vid, 2025); add("ler.orcreal", vid, 2026); add("ler.orcreal", vid, 2030); add("ler.orcreal", vid, 2018); add("ler.orcreal", 9999, 2026);
      add("real.salvar_quantidade", 1, 5000); add("real.salvar_quantidade", 3, 120000); add("real.salvar_quantidade", 6, 800); add("real.salvar_quantidade", 7, 30);
      add("real.salvar_periodo", 1, 6, vid); add("ler.orcreal", vid, 2026); add("real.salvar_periodo", 4, 6, vid); add("ler.orcreal", vid, 2026);
      add("real.salvar_quantidade", 1, 5000, 2025); add("ler.orcreal", vid, 2025);
      // ---- anotações: valor alterado depende do cálculo atual
      add("notas.salvar", vid, "dre", "DS018|2026", "amarelo", "conferir receita", 1.0); add("notas.salvar", vid, "dre", "DS062|2027", "vermelho", "lucro", 1234.5);
      add("notas.salvar", vid, "balanco", "SA07|2027", "verde", "", 0); add("notas.salvar", vid, "resultado", "1|receita_bruta_anual|2025", "amarelo", "cenoura", 0.5); add("notas.salvar", vid, "resultado", "todas|receita_bruta_anual|2026", "vermelho", "x", null);
      add("notas.salvar", vid, "dre", "XX|2027", "verde", "fantasma", 5); add("notas.validar", vid, "balanco", "SA07|2027", true); add("notas.validar", vid, "dre", "nao|existe", true);
      add("ler.notas_todas", vid); add("ler.inicio", vid);
      // ---- comparação com impacto e impressão
      add("versoes.copiar", vid, "reprojetado");
      const nova = Math.max(...d.versoes.linhas.map((l) => l[d.versoes.colunas.indexOf("id")] as number)) + 1;
      add("precos.salvar", nova, 1, ab + 1, 2.6); add("custos.salvar", nova, 3, 2, ab + 2, 2900); add("inv.salvar", nova, 4, "novo", ab + 1, 5000); add("dp.salvar", nova, "DS038", ab + 1, 4.1);
      add("cg.salvar", nova, "dias_receber", ab + 1, 40); add("pat.salvar", nova, "dist_pct", ab + 1, 10);
      const todos = ["prem_areas", "prem_produtividade", "prem_precos", "prem_custos", "prem_produtos", "prem_rebanho", "prem_investimento", "prem_dre", "prem_transportadora", "prem_balanco", "prem_dividendos", "prem_dividas", "dre", "balanco", "fluxo", "indicadores"];
      add("cmp.itens"); add("cmp.metricas", vid, ab + 1); add("cmp.metricas", nova, ab + 1);
      add("cmp.comparar", vid, [nova], ab + 1, todos, true); add("cmp.comparar", vid, [nova], ab + 1, todos, false); add("cmp.comparar", vid, [], ab, todos, false); add("cmp.comparar", vid, [vid], ab, todos, false); add("cmp.comparar", vid, [nova], 1999, todos, false);
      add("cmp.imprimir", vid, todos); add("cmp.imprimir", vid, ["xx"]);
      add("ler.dre", vid); add("ler.balanco", vid);
      return ops;
    });
    expect(r.dif).toEqual([]);
    expect(r.total).toBeGreaterThan(100);
    expect(r.erros).toBeGreaterThan(8);
    const i = r.ops.findIndex((o: any) => o[0] === "cmp.comparar" && o[3] === 2026 && o[5] === true);
    expect(r.resultados[i].ok.impactos[0].fatores.length).toBeGreaterThan(3);
    const j = r.ops.findIndex((o: any) => o[0] === "ler.orcreal" && o[2] === 2026);
    expect(r.resultados[j].ok?.produtos?.length ?? 0).toBeGreaterThan(0);
  }, 900000);
});
