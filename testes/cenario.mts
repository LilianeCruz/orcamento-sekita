// Cenário de dados de exemplo (produção, custos, transportadora, investimentos, dívidas...) usado pelos testes de paridade do motor financeiro.
type Add = (...o: unknown[]) => void;

export function cenarioProducao(add: Add, vid: number, ab: number) {
  const [CEN, SOJA] = [1, 3];
  const [G_MO, G_INS, G_MEC] = [1, 2, 3];
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
  for (let i = 0; i < 4; i++) { add("transp.salvar", vid, "caminhoes", ab + i, 10); add("transp.salvar", vid, "km_caminhao", ab + i, 100000); add("transp.salvar", vid, "preco_km", ab + i, 7); add("transp.salvar", vid, "combustivel", ab + i, 2.5); add("transp.salvar", vid, "deducoes_pct", ab + i, 5); }
  add("transp.replicar_todos", vid, ab + 3);
}
