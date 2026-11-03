// Rotas da API: mesmos caminhos e formatos do sistema em Python (app/main.py). A cada fase entram os módulos portados.
import { Roteador } from "./lib/roteador.mts";
import { Invalido } from "./lib/erros.mts";
import * as versoes from "./servicos/versoes.mts";
import * as culturas from "./servicos/culturas.mts";
import * as arr from "./servicos/arrendamentos.mts";
import * as grupos from "./servicos/grupos-custo.mts";

export const rotas = new Roteador();
const r = rotas;
const num = (x: string) => Number(x);

// ---- versões (orçamentos)
r.get("/versoes", ({ bd }) => versoes.listarVersoes(bd));
r.post("/versoes", async ({ bd, usuario, corpo }) => ({ id: await versoes.criarOrcado(bd, corpo || {}, usuario.email) }));
r.post("/versoes/:vid/copiar", async ({ bd, usuario, params, corpo }) => {
  const tipo = (corpo && corpo.tipo) || "reprojetado";
  if (!["reprojetado", "revisao"].includes(tipo)) throw Invalido("Tipo deve ser 'reprojetado' ou 'revisao'");
  return { id: await versoes.copiarVersao(bd, num(params.vid), tipo, corpo && corpo.nome, usuario.email) };
});
r.put("/versoes/:vid/periodo", async ({ bd, usuario, params, corpo }) => {
  await versoes.alterarPeriodo(bd, num(params.vid), corpo.nome, corpo.ano_inicial, corpo.ano_final, usuario.email);
  return { ok: true };
});
r.put("/versoes/:vid/horizonte", async ({ bd, usuario, params, corpo }) => { await versoes.alterarHorizonte(bd, num(params.vid), corpo.horizonte, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid", async ({ bd, usuario, params }) => { await versoes.excluirVersao(bd, num(params.vid), usuario.email); return { ok: true }; });
r.post("/versoes/:vid/aprovar", async ({ bd, usuario, params }) => { await versoes.aprovar(bd, num(params.vid), usuario.email); return { ok: true }; });

// ---- produtos (culturas)
r.get("/culturas", ({ bd }) => culturas.listarCulturas(bd));
r.post("/culturas", async ({ bd, usuario, corpo }) => ({ id: await culturas.criarCultura(bd, corpo, usuario.email) }));
r.put("/culturas/:cid", async ({ bd, usuario, params, corpo }) => { await culturas.atualizarCultura(bd, num(params.cid), corpo, usuario.email); return { ok: true }; });
r.delete("/culturas/:cid", async ({ bd, usuario, params }) => { await culturas.excluirCultura(bd, num(params.cid), usuario.email); return { ok: true }; });

// ---- arrendamentos (fazendas, parcelas e preços)
r.get("/versoes/:vid/arrendamentos", async ({ bd, params }) => ({ ...(await arr.lerArrendamentos(bd, num(params.vid))), calculo: await arr.calcularArrendamentos(bd, num(params.vid)) }));
r.post("/versoes/:vid/fazendas", async ({ bd, usuario, params, corpo }) => ({ id: await arr.criarFazenda(bd, num(params.vid), corpo, usuario.email) }));
r.put("/fazendas/:fid", async ({ bd, usuario, params, corpo }) => { await arr.atualizarFazenda(bd, num(params.fid), corpo, usuario.email); return { ok: true }; });
r.delete("/fazendas/:fid", async ({ bd, usuario, params }) => { await arr.excluirFazenda(bd, num(params.fid), usuario.email); return { ok: true }; });
r.put("/fazendas/:fid/anos/:ano", async ({ bd, usuario, params, corpo }) => { await arr.salvarAno(bd, num(params.fid), num(params.ano), corpo.area_ha, corpo.valor, usuario.email); return { ok: true }; });
r.post("/fazendas/:fid/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await arr.replicarFazenda(bd, num(params.fid), corpo.ano, corpo.campos, usuario.email) }));
r.put("/fazendas/:fid/parcelas", async ({ bd, usuario, params, corpo }) => { await arr.salvarParcelas(bd, num(params.fid), corpo, usuario.email); return { ok: true }; });
r.post("/parcelas/gerar", ({ corpo }) => arr.gerarParcelas(corpo.n, corpo.periodicidade, corpo.mes_inicio));
r.put("/versoes/:vid/precos", async ({ bd, usuario, params, corpo }) => { await arr.salvarPrecos(bd, num(params.vid), corpo, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/precos/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await arr.replicarPreco(bd, num(params.vid), corpo.cultura_id, corpo.ano, usuario.email) }));
r.get("/comparar", ({ bd, consulta }) => arr.compararArrendamentos(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- grupos de custo
r.get("/grupos-custo", ({ bd }) => grupos.listarGrupos(bd));
r.post("/grupos-custo", async ({ bd, usuario, corpo }) => ({ id: await grupos.criarGrupo(bd, corpo, usuario.email) }));
r.put("/grupos-custo/:gid", async ({ bd, usuario, params, corpo }) => { await grupos.atualizarGrupo(bd, num(params.gid), corpo, usuario.email); return { ok: true }; });
r.delete("/grupos-custo/:gid", async ({ bd, usuario, params }) => { await grupos.excluirGrupo(bd, num(params.gid), usuario.email); return { ok: true }; });
