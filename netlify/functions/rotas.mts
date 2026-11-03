// Rotas da API: mesmos caminhos e formatos do sistema em Python (app/main.py). A cada fase entram os módulos portados.
import { Roteador } from "./lib/roteador.mts";
import { Invalido } from "./lib/erros.mts";
import * as versoes from "./servicos/versoes.mts";
import * as culturas from "./servicos/culturas.mts";

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
r.post("/versoes/:vid/aprovar", async ({ bd, usuario, params }) => { await versoes.aprovar(bd, num(params.vid), usuario.email); return { ok: true }; });

// ---- produtos (culturas)
r.get("/culturas", ({ bd }) => culturas.listarCulturas(bd));
r.post("/culturas", async ({ bd, usuario, corpo }) => ({ id: await culturas.criarCultura(bd, corpo, usuario.email) }));
r.put("/culturas/:cid", async ({ bd, usuario, params, corpo }) => { await culturas.atualizarCultura(bd, num(params.cid), corpo, usuario.email); return { ok: true }; });
r.delete("/culturas/:cid", async ({ bd, usuario, params }) => { await culturas.excluirCultura(bd, num(params.cid), usuario.email); return { ok: true }; });
