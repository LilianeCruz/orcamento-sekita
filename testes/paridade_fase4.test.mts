import { describe, it, expect } from "vitest";
import { compararOperacoes } from "./paridade_ops.mts";

const BANCO = process.env.BANCO_REAL;

describe.skipIf(!BANCO)("paridade: leituras do motor financeiro no banco real", () => {
  it("DRE, balanço, caixa, patrimônio, capital de giro, investimentos, captações e dívidas", async () => {
    const r = await compararOperacoes(BANCO!, (d) => {
      const vid = d.versoes.linhas[0][d.versoes.colunas.indexOf("id")] as number;
      const ops: unknown[][] = [];
      for (const m of ["premissas_dem", "investimentos", "capital_giro", "captacoes", "dre_padrao", "dre", "balanco", "patrimonio", "fluxo_motor", "projetar", "dividas", "dividas_balanco"]) ops.push([`ler.${m}`, vid]);
      ops.push(["ler.dividas_importacoes"]);
      ops.push(["cg.previa", vid], ["dp.previa", vid], ["pd.contas", "dre"], ["pd.contas", "balanco"], ["pd.bases", "dre"], ["pd.bases", "balanco"]);
      return ops;
    });
    expect(r.dif).toEqual([]);
  }, 400000);
});

describe.skipIf(!BANCO)("paridade: escritas e cálculos do motor financeiro", () => {
  it("investimentos, captações, capital de giro, premissas, patrimônio, dívidas e caixa", async () => {
    process.env.ENDIVIDAMENTO_ARQUIVO = "/Users/lcruz/Desktop/Programas/Endividamento_Sekita/Endividamento alterado.xlsx";
    const r = await compararOperacoes(BANCO!, (d) => {
      const vid = d.versoes.linhas[0][d.versoes.colunas.indexOf("id")] as number;
      const ab = d.versoes.linhas[0][d.versoes.colunas.indexOf("ano_base")] as number;
      const [CEN, SOJA, LEITE, GADO] = [1, 3, 6, 7];
      const [G_MO, G_INS, G_MEC] = [1, 2, 3];
      const ops: unknown[][] = [];
      const add = (...o: unknown[]) => ops.push(o);
      const tudo = (v: number) => { for (const m of ["dre", "balanco", "patrimonio", "fluxo_motor", "projetar", "capital_giro", "investimentos", "captacoes", "premissas_dem", "dre_padrao", "dividas", "dividas_balanco"]) add(`ler.${m}`, v); };
      // ---- produção (alimenta receita, custos, estoque)
      for (const c of [CEN, SOJA]) add("areas.adicionar", vid, c);
      for (let i = 0; i < 4; i++) { add("areas.salvar", vid, CEN, ab + i, 40 + i); add("areas.salvar", vid, SOJA, ab + i, 300 + 5 * i); }
      add("areas.replicar", vid, CEN, ab + 3); add("areas.replicar", vid, SOJA, ab + 3);
      for (let i = 0; i < 4; i++) { add("prod.salvar", vid, CEN, ab + i, 45000 + 500 * i); add("prod.salvar", vid, SOJA, ab + i, 3300); add("precos.salvar", vid, CEN, ab + i, 2.1); add("precos.salvar", vid, SOJA, ab + i, 1.8 + i / 10); }
      add("prod.replicar", vid, CEN, ab + 3); add("prod.replicar", vid, SOJA, ab + 3); add("precos.replicar", vid, CEN, ab + 3); add("precos.replicar", vid, SOJA, ab + 3);
      for (const c of [CEN, SOJA]) { add("custos.adicionar_grupo", vid, c, G_INS); add("custos.adicionar_grupo", vid, c, G_MEC); add("custos.adicionar_grupo", vid, c, G_MO); }
      for (let i = 0; i < 4; i++) for (const c of [CEN, SOJA]) { add("custos.salvar", vid, c, G_INS, ab + i, c === CEN ? 18000 : 2500); add("custos.salvar", vid, c, G_MEC, ab + i, c === CEN ? 4000 : 700); add("custos.salvar", vid, c, G_MO, ab + i, c === CEN ? 6000 : 300); }
      add("custos.replicar_todos", vid, ab + 3);
      add("prem.adicionar_cultura", vid, CEN); add("prem.adicionar_tipo", vid, CEN, "deducao_receita"); add("prem.adicionar_tipo", vid, CEN, "estoque");
      for (let i = 0; i < 4; i++) { add("prem.salvar", vid, CEN, "deducao_receita", ab + i, 3.5); add("prem.salvar", vid, CEN, "estoque", ab + i, 20000); }
      add("prem.replicar_todas", vid, ab + 3);
      add("arr.criar_fazenda", vid, { nome: "Faz A", tipo: "arrendada", arrendador: "X", forma: "ha" });
      for (let i = 0; i < 4; i++) add("arr.salvar_ano", 1, ab + i, 50, 3000);
      for (let i = 0; i < 4; i++) { add("transp.salvar", vid, "caminhoes", ab + i, 10); add("transp.salvar", vid, "km_caminhao", ab + i, 100000); add("transp.salvar", vid, "preco_km", ab + i, 7); add("transp.salvar", vid, "combustivel", ab + i, 2.5); add("transp.salvar", vid, "mdo", ab + i, 0.8); add("transp.salvar", vid, "deducoes_pct", ab + i, 5); }
      add("transp.replicar_todos", vid, ab + 3);
      tudo(vid);
      // ---- endividamento (base real), capital de giro e premissas da DRE a partir do realizado
      add("div.vincular", vid, 99999); add("div.vincular", vid, 3); add("ler.dividas", vid, "todas"); add("ler.dividas", vid, "MESO,AFAL"); add("ler.dividas", vid, ""); add("ler.dividas", vid, "ST");
      add("ler.dividas_mensal", vid, 2027, "agro"); add("ler.dividas_mensal", vid, 2028, "todas"); add("ler.dividas_mensal_por_ano", vid, "todas"); add("ler.dividas_contratos", vid, "agro", 2027, "capital_giro");
      add("ler.dividas_contratos", vid, "todas", null, "investimento"); add("ler.dividas_contratos", vid, "agro", null, "xx"); add("ler.dividas", vid, ","); add("ler.dividas_importacoes");
      add("cg.previa", vid); add("cg.atualizar_prazos", vid, [2099]); add("cg.atualizar_prazos", vid, [2024, 2025]); add("cg.atualizar_prazos", vid);
      add("cg.salvar", vid, "dias_receber", ab + 1, 45); add("cg.salvar", vid, "dias_ano", ab, 360); add("cg.salvar", vid, "dias_ano", ab + 1, 0.5); add("cg.salvar", vid, "pct_caixa", ab, 150); add("cg.salvar", vid, "xx", ab, 1);
      add("cg.salvar", vid, "saldo_caixa", ab, 0); add("cg.salvar", vid, "pct_caixa", ab, 8); add("cg.replicar", vid, "pct_caixa", ab); add("cg.replicar", vid, "dias_receber", ab + 1); add("cg.replicar_todos", vid, ab + 2);
      add("dp.previa", vid); add("dp.atualizar", vid, [2024, 2025]); add("dp.atualizar", vid); add("dp.salvar", vid, "DS038", ab + 1, 2.5); add("dp.salvar", vid, "DS038", ab, -1); add("dp.salvar", vid, "DS055", ab, -50);
      add("dp.salvar", vid, "DS999", ab, 1); add("dp.replicar", vid, "DS038", ab + 1); add("dp.replicar_todos", vid, ab + 1);
      tudo(vid);
      // ---- investimentos e depreciação
      add("inv.criar_classificacao", "Nova"); add("inv.criar_classificacao", "nova"); add("inv.criar_classificacao", " ");
      add("inv.criar_tipo", { nome: "Pivô", natureza: "investimento", conta_codigo: "SA21", classificacao_id: 1, carrega_saldo: true, vida_util: 12.5, residual_pct: 5, carencia: 1 });
      add("inv.criar_tipo", { nome: "pivô", natureza: "investimento", conta_codigo: "SA21", classificacao_id: 1 });
      add("inv.criar_tipo", { nome: "Terra venda", natureza: "desinvestimento", conta_codigo: "SA20", classificacao_id: 6, vida_util: 5 }, vid, false);
      add("inv.criar_tipo", { nome: "Galpão", natureza: "investimento", conta_codigo: "SA21", classificacao_id: 1, vida_util: 25, residual_pct: 0, carencia: 2 }, vid, true);
      add("inv.criar_tipo", { nome: "Ruim", natureza: "investimento", conta_codigo: "SA07", classificacao_id: 1 }); add("inv.criar_tipo", { nome: "Ruim", natureza: "outra", conta_codigo: "SA21", classificacao_id: 1 });
      add("inv.criar_tipo", { nome: "Ruim", natureza: "investimento", conta_codigo: "SA21", classificacao_id: 99 }); add("inv.criar_tipo", { nome: "Ruim", natureza: "investimento", conta_codigo: "SA21", classificacao_id: 1, vida_util: 200 });
      add("ler.investimentos", vid);
      for (let i = 0; i < 5; i++) {
        add("inv.salvar", vid, 1, "novo", ab + i, 5000 + 100 * i); add("inv.salvar", vid, 1, "a_carregar", ab + i, 1000); add("inv.salvar", vid, 3, "novo", ab + i, 800); add("inv.salvar", vid, 3, "a_carregar", ab + i, 100);
        add("inv.salvar", vid, 4, "novo", ab + i, 3000); add("inv.salvar", vid, 4, "a_carregar", ab + i, 500); add("inv.salvar", vid, 4, "financiado", ab + i, 1500 + i); add("inv.salvar", vid, 5, "novo", ab + i, 90); add("inv.salvar", vid, 5, "a_carregar", ab + i, 9000);
        add("inv.salvar", vid, 2, "novo", ab + i, 400 * i); add("inv.salvar", vid, 2, "financiado", ab + i, 1); add("inv.salvar", vid, 5, "financiado", ab + i, 40);
      }
      add("inv.salvar", vid, 4, "saldo_ini", ab, 2500); add("inv.salvar", vid, 4, "saldo_ini", ab + 1, 2500); add("inv.salvar", vid, 2, "a_carregar", ab, 1); add("inv.salvar", vid, 4, "novo", ab, -1); add("inv.salvar", vid, 4, "xx", ab, 1);
      add("inv.salvar", vid, 1, "saldo_ini", ab, 2000); add("inv.salvar", vid, 3, "saldo_ini", ab, 600); add("inv.salvar", vid, 5, "saldo_ini", ab, 70);
      add("inv.replicar", vid, 4, "novo", ab + 4); add("inv.replicar", vid, 1, "saldo_ini", ab); add("inv.replicar", vid, 1, "a_carregar", ab + 4); add("inv.replicar", vid, 4, "financiado", ab + 4); add("inv.replicar_todos", vid, ab + 4);
      tudo(vid);
      add("inv.retirar", vid, 3); add("ler.investimentos", vid); add("inv.salvar", vid, 3, "novo", ab, 1); add("inv.incluir", vid, 3); add("inv.excluir_tipo", 3); add("inv.excluir_tipo", 999);
      add("inv.editar_tipo", 5, { nome: "Móveis e utensílios", natureza: "investimento", conta_codigo: "SA23", classificacao_id: 1, carrega_saldo: false, vida_util: 8, residual_pct: 10, carencia: 0 });
      add("inv.editar_tipo", 2, { nome: "Venda de Veículos", natureza: "investimento", conta_codigo: "SA22", classificacao_id: 6 });
      add("inv.salvar_depreciacao", vid, "taxa", 0, 7); add("inv.salvar_depreciacao", vid, "taxa", 0, 101); add("inv.salvar_depreciacao", vid, "existentes", ab + 1, 900); add("inv.salvar_depreciacao", vid, "tipo-1", ab + 2, 50);
      add("inv.salvar_depreciacao", vid, "tipo-77", ab, 1); add("inv.salvar_depreciacao", vid, "xx", ab, 1); add("inv.salvar_depreciacao", vid, "existentes", ab, -1);
      tudo(vid);
      add("inv.voltar_depreciacao", vid, "taxa"); add("inv.voltar_depreciacao", vid, "existentes"); add("ler.investimentos", vid);
      // ---- captações (cadastro, financiamento dos investimentos, alterações à mão)
      add("cap.criar", vid, { nome: "Custeio 27", tipo: "custeio", ano: ab, valor: 9000, taxa: 12, prazo: 3, carencia: 1 });
      add("cap.criar", vid, { nome: "Giro 28", tipo: "capital_giro", ano: ab + 1, valor: 4500.5, taxa: 14.5, prazo: 2, carencia: 0 });
      add("cap.criar", vid, { nome: "Inv", tipo: "investimento", ano: ab, valor: 1 }); add("cap.criar", vid, { nome: "", tipo: "custeio", ano: ab, valor: 1 }); add("cap.criar", vid, { nome: "x", tipo: "custeio", ano: 1999, valor: 1 });
      add("cap.criar", vid, { nome: "x", tipo: "custeio", ano: ab, valor: 0 }); add("cap.criar", vid, { nome: "x", tipo: "custeio", ano: ab, valor: 5, taxa: 101 }); add("cap.criar", vid, { nome: "x", tipo: "custeio", ano: ab, valor: 5, prazo: 0 });
      add("cap.criar", vid, { nome: "x", tipo: "custeio", ano: ab, valor: 5, prazo: 5, carencia: 30 });
      add("cap.editar", vid, 1, { nome: "Custeio 27b", tipo: "custeio", ano: ab, valor: 9500, taxa: 11, prazo: 4, carencia: 1 }); add("cap.editar", vid, 99, { nome: "x", tipo: "custeio", ano: ab, valor: 5, prazo: 5 });
      for (const a of [ab, ab + 1, ab + 2, ab + 3]) { add("cap.salvar_premissa", vid, "taxa", a, 10 + (a - ab)); add("cap.salvar_premissa", vid, "prazo", a, 4); add("cap.salvar_premissa", vid, "carencia", a, 1); }
      add("cap.salvar_premissa", vid, "taxa", ab, 101); add("cap.salvar_premissa", vid, "prazo", ab, 2.5); add("cap.salvar_premissa", vid, "xx", ab, 1); add("cap.replicar_premissa", vid, "taxa", ab + 3);
      add("cap.salvar_valor", vid, "cap-1", "amort", ab + 2, 2000); add("cap.salvar_valor", vid, "cap-1", "juros", ab + 2, 333); add("cap.salvar_valor", vid, "inv-4-" + ab, "amort", ab + 3, 100);
      add("cap.salvar_valor", vid, "inv-999-1", "juros", ab, 1); add("cap.salvar_valor", vid, "cap-99", "juros", ab, 1); add("cap.salvar_valor", vid, "cap-1", "xx", ab, 1); add("cap.salvar_valor", vid, "cap-1", "juros", ab, -1);
      tudo(vid);
      add("cap.voltar", vid, "cap-1"); add("cap.excluir", vid, 2); add("cap.excluir", vid, 77); add("ler.captacoes", vid);
      // ---- premissas dos demonstrativos
      add("pd.criar", "Doação", "dre", "DS039", 1); add("pd.criar", "Bônus", "dre", "DS039", -1, "valor"); add("pd.criar", "Imp", "dre", "DS060", -1, "percentual", "DS058", "zerar");
      add("pd.criar", "Imp2", "dre", "DS058", -1, "percentual", "DS058", "calcular"); add("pd.criar", "Circ", "dre", "DS054", 1, "percentual", "DS062", "calcular");
      add("pd.criar", "Sem base", "dre", "DS038", 1, "percentual", "", "calcular"); add("pd.criar", "Total", "dre", "DS030", 1); add("pd.criar", "", "dre", "DS038", 1); add("pd.criar", "X", "xx", "DS038", 1);
      add("pd.criar", "X", "dre", "DS038", 2); add("pd.criar", "Outros créditos", "balanco", "SA09", 1); add("pd.criar", "Caixa", "balanco", "SA07", 1); add("pd.criar", "Terra", "balanco", "SA20", 1);
      add("pd.criar", "Passivo %", "balanco", "SP10", 1, "percentual", "SA", "calcular"); add("pd.criar", "Circ bal", "balanco", "SA09", 1, "percentual", "SA", "zerar");
      for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) add("pd.incluir", vid, p);
      add("pd.incluir", vid, 3); add("pd.incluir", vid, 999);
      for (let i = 0; i < 4; i++) for (const p of [1, 3, 4, 5, 6]) add("pd.salvar", vid, p, ab + i, p === 4 || p === 6 ? 20 + i : 1000 * (i + 1));
      add("pd.salvar", vid, 2, ab, 5); add("pd.salvar", vid, 3, 1999, 5); add("pd.replicar", vid, 4, ab + 3); add("pd.replicar", vid, 6, ab + 3); add("pd.replicar_todas", vid, ab + 3, "dre"); add("pd.replicar_todas", vid, ab + 3);
      add("pd.editar", 1, "Despesas Admin", "DS040", -1); add("pd.editar", 3, null, null, null, "DS062", "calcular"); add("pd.editar", 3, null, null, null, "DS007", "zerar"); add("pd.editar", 2, null, null, 7);
      tudo(vid);
      add("pd.remover", vid, 4); add("pd.excluir", 5); add("pd.excluir", 5); add("ler.premissas_dem", vid);
      // ---- patrimônio e fluxo
      add("pat.salvar", vid, "dist_pct", ab - 1, 30); add("pat.salvar", vid, "dist_valor", ab - 1, 100); add("pat.salvar", vid, "dist_pct", ab, 25); add("pat.salvar", vid, "dist_valor", ab, 500); add("pat.salvar", vid, "dist_pct", ab + 1, 101);
      add("pat.salvar", vid, "dist_pct", ab - 2, 5); add("pat.salvar", vid, "capital", ab + 1, 8000); add("pat.salvar", vid, "ajustes", ab + 2, -300); add("pat.salvar", vid, "capital", ab - 1, 5); add("pat.salvar", vid, "xx", ab, 5); add("pat.salvar", vid, "capital", ab, -5);
      add("pat.replicar", vid, "dist_pct", ab); add("pat.replicar", vid, "capital", ab); add("pat.replicar_todos", vid, ab - 1);
      add("fluxo.salvar_premissa", vid, "origem", ab, 1); add("fluxo.salvar_premissa", vid, "origem", ab + 1, 2); add("fluxo.salvar_premissa", vid, "origem", ab + 2, 5); add("fluxo.salvar_premissa", vid, "taxa", ab + 3, 13);
      add("fluxo.salvar_premissa", vid, "taxa", ab + 4, 120); add("fluxo.salvar_premissa", vid, "xx", ab, 1); add("fluxo.replicar_premissa", vid, "taxa", ab + 3); add("fluxo.replicar_premissa", vid, "xx", ab);
      add("cg.salvar", vid, "pct_caixa", ab + 2, 20); add("cg.salvar", vid, "saldo_caixa", ab + 3, 5000);
      tudo(vid);
      add("ler.patrimonio", vid);
      // ---- comparações entre duas versões
      add("versoes.copiar", vid, "reprojetado");
      const nova = Math.max(...d.versoes.linhas.map((l) => l[d.versoes.colunas.indexOf("id")] as number)) + 1;
      add("inv.salvar", nova, 1, "novo", ab, 7777); add("cg.salvar", nova, "dias_receber", ab, 20); add("pat.salvar", nova, "dist_pct", ab, 60); add("pd.salvar", nova, 1, ab, 4321); add("dp.salvar", nova, "DS038", ab, 3.3);
      tudo(nova);
      for (const m of ["dre", "balanco", "patrimonio", "capital_giro", "investimentos", "captacoes", "premissas_dem"]) { add(`comparar.${m}`, vid, nova); add(`comparar.${m}`, nova, vid); }
      add("comparar.dre", vid, 9999);
      return ops;
    });
    expect(r.total).toBeGreaterThan(300);
    expect(r.erros).toBeGreaterThan(40);
    const lerDre = r.resultados[r.ops.findIndex((o: any) => o[0] === "ler.dre" && o[1] === 17)];
    expect(lerDre.ok.linhas.length).toBeGreaterThan(30);
    expect(r.dif).toEqual([]);
  }, 600000);
});

describe.skipIf(!BANCO)("paridade: importação dos arquivos reais (Endividamento e Fechamento Contábil)", () => {
  it("lê os mesmos títulos, a mesma estrutura de DRE e balanço e calcula o mesmo", async () => {
    process.env.ENDIVIDAMENTO_ARQUIVO = "/Users/lcruz/Desktop/Programas/Endividamento_Sekita/Endividamento alterado.xlsx";
    process.env.FECHAMENTO_ARQUIVO = "/Users/lcruz/Desktop/Programas/fechamento contábil/fechamento-contabil.xlsx";
    const r = await compararOperacoes(BANCO!, (d) => {
      const vid = d.versoes.linhas[0][d.versoes.colunas.indexOf("id")] as number;
      const ops: unknown[][] = [["div.importar_padrao", vid], ["ler.dividas", vid, "todas"], ["ler.dividas_balanco", vid, "todas"], ["ler.dividas_mensal_por_ano", vid, "agro"], ["ler.dividas_contratos", vid, "agro", 2028, null],
        ["dre.importar_padrao"], ["ler.dre", vid], ["ler.balanco", vid], ["pd.contas", "dre"], ["pd.contas", "balanco"], ["ler.dividas_importacoes"]];
      return ops;
    });
    expect(r.resultados[0].ok.titulos).toBeGreaterThan(1000);
    expect(r.dif).toEqual([]);
  }, 900000);
});
