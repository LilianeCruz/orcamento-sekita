// Rotas da API: mesmos caminhos e formatos do sistema em Python (app/main.py). A cada fase entram os módulos portados.
import { Roteador, RespostaArquivo } from "./lib/roteador.mts";
import { Invalido } from "./lib/erros.mts";
import * as versoes from "./servicos/versoes.mts";
import * as culturas from "./servicos/culturas.mts";
import * as arr from "./servicos/arrendamentos.mts";
import * as grupos from "./servicos/grupos-custo.mts";
import * as inicio from "./servicos/inicio.mts";
import * as notas from "./servicos/anotacoes.mts";
import * as areas from "./servicos/areas.mts";
import * as extras from "./servicos/extras.mts";
import * as prod from "./servicos/produtividade.mts";
import * as precosVenda from "./servicos/precos-venda.mts";
import * as pecuaria from "./servicos/pecuaria.mts";
import * as custos from "./servicos/custos.mts";
import * as premissas from "./servicos/premissas.mts";
import * as rebanho from "./servicos/rebanho.mts";
import * as resultado from "./servicos/resultado.mts";
import * as transp from "./servicos/transportadora.mts";
import * as real from "./servicos/realizado.mts";
import * as cg from "./servicos/capital-giro.mts";
import * as bal from "./servicos/balanco.mts";
import * as pdem from "./servicos/premissas-dem.mts";
import * as inv from "./servicos/investimentos.mts";
import * as dpad from "./servicos/dre-padrao.mts";
import * as fluxo from "./servicos/fluxo.mts";
import * as pat from "./servicos/patrimonio.mts";
import * as cap from "./servicos/captacoes.mts";
import * as div from "./servicos/dividas.mts";
import * as dre from "./servicos/dre.mts";
import * as demo from "./servicos/demonstrativos.mts";
import * as orcreal from "./servicos/orcado-realizado.mts";
import * as comparacao from "./servicos/comparacao.mts";

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

// ---- início e anotações
r.get("/versoes/:vid/inicio", ({ bd, params }) => inicio.lerInicio(bd, num(params.vid)));
r.get("/versoes/:vid/anotacoes/todas", ({ bd, params }) => notas.listarTodas(bd, num(params.vid)));
r.get("/versoes/:vid/anotacoes", ({ bd, params, consulta }) => notas.listarAnotacoes(bd, num(params.vid), consulta.get("tela") || ""));
r.put("/versoes/:vid/anotacoes", ({ bd, usuario, params, corpo }) => notas.salvarAnotacao(bd, num(params.vid), corpo.tela, corpo.chave, corpo.cor ?? "", corpo.comentario ?? "", usuario.email, corpo.valor ?? null));
r.post("/versoes/:vid/anotacoes/validar", ({ bd, usuario, params, corpo }) => notas.validarAnotacao(bd, num(params.vid), corpo.tela, corpo.chave, !!corpo.validado, usuario.email));

// ---- áreas por produto
r.get("/versoes/:vid/areas", ({ bd, params }) => areas.lerAreas(bd, num(params.vid)));
r.post("/versoes/:vid/areas/culturas", async ({ bd, usuario, params, corpo }) => { await areas.adicionarCulturaArea(bd, num(params.vid), corpo.cultura_id, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/areas/culturas/:cid", async ({ bd, usuario, params }) => { await areas.removerCulturaArea(bd, num(params.vid), num(params.cid), usuario.email); return { ok: true }; });
r.post("/versoes/:vid/areas/replicar-todas", ({ bd, usuario, params, corpo }) => areas.replicarTodasAreas(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/areas/:cid/:ano", async ({ bd, usuario, params, corpo }) => { await areas.salvarArea(bd, num(params.vid), num(params.cid), num(params.ano), corpo.area_ha, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/areas/:cid/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await areas.replicarArea(bd, num(params.vid), num(params.cid), corpo.ano, usuario.email) }));
r.get("/comparar-areas", ({ bd, consulta }) => areas.compararAreas(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- produtividade e pecuária
r.post("/versoes/:vid/produtividade/culturas", async ({ bd, usuario, params, corpo }) => { await extras.incluir(bd, num(params.vid), "produtividade", corpo.cultura_id, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/produtividade/culturas/:cid", async ({ bd, usuario, params }) => { await extras.remover(bd, num(params.vid), "produtividade", num(params.cid), usuario.email); return { ok: true }; });
r.get("/versoes/:vid/produtividade", ({ bd, params }) => prod.lerProdutividade(bd, num(params.vid)));
r.post("/versoes/:vid/produtividade/replicar-todas", ({ bd, usuario, params, corpo }) => prod.replicarTodasProdutividades(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/produtividade/:cid/:ano", async ({ bd, usuario, params, corpo }) => { await prod.salvarProdutividade(bd, num(params.vid), num(params.cid), num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/produtividade/:cid/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await prod.replicarProdutividade(bd, num(params.vid), num(params.cid), corpo.ano, usuario.email) }));
r.get("/comparar-produtividade", ({ bd, consulta }) => prod.compararProdutividade(bd, num(consulta.get("a")!), num(consulta.get("b")!)));
r.get("/versoes/:vid/pecuaria", ({ bd, params }) => pecuaria.lerPecuaria(bd, num(params.vid)));
r.post("/versoes/:vid/pecuaria/replicar-todos", ({ bd, usuario, params, corpo }) => pecuaria.replicarTodosPecuaria(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/pecuaria/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await pecuaria.salvarPecuaria(bd, num(params.vid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/pecuaria/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await pecuaria.replicarPecuaria(bd, num(params.vid), params.campo, corpo.ano, usuario.email) }));
r.get("/comparar-pecuaria", ({ bd, consulta }) => pecuaria.compararPecuaria(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- preços de venda
r.post("/versoes/:vid/precos-venda/culturas", async ({ bd, usuario, params, corpo }) => { await extras.incluir(bd, num(params.vid), "precos", corpo.cultura_id, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/precos-venda/culturas/:cid", async ({ bd, usuario, params }) => { await extras.remover(bd, num(params.vid), "precos", num(params.cid), usuario.email); return { ok: true }; });
r.get("/versoes/:vid/precos-venda", ({ bd, params }) => precosVenda.lerPrecosVenda(bd, num(params.vid)));
r.post("/versoes/:vid/precos-venda/replicar-todas", ({ bd, usuario, params, corpo }) => precosVenda.replicarTodosPrecosVenda(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/precos-venda/:cid/:ano", async ({ bd, usuario, params, corpo }) => { await precosVenda.salvarPrecoVenda(bd, num(params.vid), num(params.cid), num(params.ano), corpo.preco, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/precos-venda/:cid/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await precosVenda.replicarPrecoVenda(bd, num(params.vid), num(params.cid), corpo.ano, usuario.email) }));
r.get("/comparar-precos-venda", ({ bd, consulta }) => precosVenda.compararPrecosVenda(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- custos variáveis
r.get("/versoes/:vid/custos", ({ bd, params }) => custos.lerCustos(bd, num(params.vid)));
r.post("/versoes/:vid/custos/replicar-todos", ({ bd, usuario, params, corpo }) => custos.replicarTodosCustos(bd, num(params.vid), corpo.ano, usuario.email));
r.post("/versoes/:vid/custos/culturas", async ({ bd, usuario, params, corpo }) => { await custos.adicionarCulturaCusto(bd, num(params.vid), corpo.cultura_id, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/custos/culturas/:cid", async ({ bd, usuario, params }) => { await custos.removerCulturaCusto(bd, num(params.vid), num(params.cid), usuario.email); return { ok: true }; });
r.post("/versoes/:vid/custos/grupos-todas", ({ bd, usuario, params, corpo }) => custos.adicionarGrupoATodas(bd, num(params.vid), corpo.grupo_id, usuario.email));
r.post("/versoes/:vid/custos/:cid/grupos", async ({ bd, usuario, params, corpo }) => { await custos.adicionarGrupoCusto(bd, num(params.vid), num(params.cid), corpo.grupo_id, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/custos/:cid/grupos/:gid", async ({ bd, usuario, params }) => { await custos.removerGrupoCusto(bd, num(params.vid), num(params.cid), num(params.gid), usuario.email); return { ok: true }; });
r.put("/versoes/:vid/custos/:cid/:gid/:ano", async ({ bd, usuario, params, corpo }) => { await custos.salvarCusto(bd, num(params.vid), num(params.cid), num(params.gid), num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/custos/:cid/:gid/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await custos.replicarCusto(bd, num(params.vid), num(params.cid), num(params.gid), corpo.ano, usuario.email) }));
r.get("/comparar-custos", ({ bd, consulta }) => custos.compararCustos(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- premissas por produto
r.get("/versoes/:vid/premissas", ({ bd, params }) => premissas.lerPremissas(bd, num(params.vid)));
r.post("/versoes/:vid/premissas/culturas", async ({ bd, usuario, params, corpo }) => { await premissas.adicionarCulturaPremissa(bd, num(params.vid), corpo.cultura_id, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/premissas/culturas/:cid", async ({ bd, usuario, params }) => { await premissas.removerCulturaPremissa(bd, num(params.vid), num(params.cid), usuario.email); return { ok: true }; });
r.post("/versoes/:vid/premissas/tipos-todas", ({ bd, usuario, params, corpo }) => premissas.adicionarTipoATodas(bd, num(params.vid), corpo.tipo, usuario.email));
r.post("/versoes/:vid/premissas/replicar-todas", ({ bd, usuario, params, corpo }) => premissas.replicarTodasPremissas(bd, num(params.vid), corpo.ano, usuario.email));
r.post("/versoes/:vid/premissas/:cid/tipos", async ({ bd, usuario, params, corpo }) => { await premissas.adicionarTipo(bd, num(params.vid), num(params.cid), corpo.tipo, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/premissas/:cid/tipos/:tipo", async ({ bd, usuario, params }) => { await premissas.removerTipo(bd, num(params.vid), num(params.cid), params.tipo, usuario.email); return { ok: true }; });
r.put("/versoes/:vid/premissas/:cid/:tipo/:ano", async ({ bd, usuario, params, corpo }) => { await premissas.salvarPremissa(bd, num(params.vid), num(params.cid), params.tipo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/premissas/:cid/:tipo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await premissas.replicarPremissa(bd, num(params.vid), num(params.cid), params.tipo, corpo.ano, usuario.email) }));
r.get("/comparar-premissas", ({ bd, consulta }) => premissas.compararPremissas(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- rebanho e resultado por produto
r.get("/versoes/:vid/rebanho", ({ bd, params }) => rebanho.lerRebanho(bd, num(params.vid)));
r.put("/versoes/:vid/rebanho/:cid/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await rebanho.salvarRebanho(bd, num(params.vid), num(params.cid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/rebanho/:cid/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await rebanho.replicarRebanho(bd, num(params.vid), num(params.cid), params.campo, corpo.ano, usuario.email) }));
r.get("/versoes/:vid/resultado", ({ bd, params }) => resultado.calcularResultado(bd, num(params.vid)));
r.get("/comparar-resultado", ({ bd, consulta }) => resultado.compararResultado(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- premissas de transportadora
r.get("/versoes/:vid/transportadora", ({ bd, params }) => transp.lerTransportadora(bd, num(params.vid)));
r.post("/versoes/:vid/transportadora/replicar-todos", ({ bd, usuario, params, corpo }) => transp.replicarTodosTransportadora(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/transportadora/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await transp.salvarTransportadora(bd, num(params.vid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/transportadora/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await transp.replicarTransportadora(bd, num(params.vid), params.campo, corpo.ano, usuario.email) }));

// ---- realizado (Balanço e DRE de anos fechados)
const inteiro = (x: string | null) => (x === null || x === "" ? null : Number(x));
r.get("/realizado", ({ bd }) => real.ler(bd));
r.post("/realizado/importar", ({ bd, usuario, consulta, bruto }) => {
  if (!bruto || !bruto.length) throw Invalido("Nenhum arquivo recebido");
  let q: Record<number, number> | null = null;
  const quantidades = consulta.get("quantidades");
  if (quantidades !== null) {                                       // "id:quantidade,id:quantidade" (quantidade vendida de cada produto no período)
    q = {};
    for (const x of quantidades.split(",").filter(Boolean)) {
      const [k, v] = x.split(":");
      if (x.split(":").length !== 2 || !Number.isInteger(Number(k)) || k.trim() === "" || v.trim() === "" || Number.isNaN(Number(v))) throw Invalido("Quantidades vendidas em formato inválido");
      q[Number(k)] = Number(v);
    }
  }
  return real.importar(bd, bruto, consulta.get("arquivo") || "realizado.xlsx", usuario.email, inteiro(consulta.get("ano_inicial")), inteiro(consulta.get("meses")), inteiro(consulta.get("mes_inicio")), inteiro(consulta.get("versao_id")), q);
});
r.get("/realizado/produtos", ({ bd }) => real.produtosVenda(bd));
r.get("/realizado/periodo", ({ bd }) => real.periodo(bd));
r.put("/realizado/periodo", async ({ bd, usuario, corpo }) => { await real.salvarPeriodo(bd, corpo.mes_inicio, corpo.mes_fim, corpo.versao_id ?? null, usuario.email); return { ok: true }; });
r.get("/realizado/quantidades", ({ bd }) => real.quantidadesPorAno(bd));
r.put("/realizado/quantidades/:cid", async ({ bd, usuario, params, corpo }) => { await real.salvarQuantidade(bd, num(params.cid), corpo.quantidade ?? null, usuario.email, corpo.ano ?? null); return { ok: true }; });
r.get("/realizado/importacoes", ({ bd }) => real.importacoesComparaveis(bd));
r.get("/realizado/modelo", async ({ bd }) => new RespostaArquivo(await real.modelo(bd), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "modelo-realizado.xlsx"));
r.delete("/realizado/:ano", async ({ bd, usuario, params }) => { await real.excluirAno(bd, num(params.ano), usuario.email); return { ok: true }; });

// ---- capital de giro e balanço patrimonial
r.get("/versoes/:vid/capital-giro", ({ bd, params }) => cg.ler(bd, num(params.vid)));
r.get("/versoes/:vid/capital-giro/previa-prazos", ({ bd, params }) => cg.previaPrazos(bd, num(params.vid)));
r.post("/versoes/:vid/capital-giro/atualizar-prazos", ({ bd, usuario, params, corpo }) => cg.atualizarPrazos(bd, num(params.vid), usuario.email, (corpo && corpo.anos) || null));
r.post("/versoes/:vid/capital-giro/replicar-todos", ({ bd, usuario, params, corpo }) => cg.replicarTodos(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/capital-giro/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await cg.salvar(bd, num(params.vid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/capital-giro/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await cg.replicar(bd, num(params.vid), params.campo, corpo.ano, usuario.email) }));
r.get("/comparar-capital-giro", ({ bd, consulta }) => cg.comparar(bd, num(consulta.get("a")!), num(consulta.get("b")!)));
r.get("/versoes/:vid/balanco-patrimonial", ({ bd, params }) => bal.ler(bd, num(params.vid)));
r.get("/comparar-balanco-patrimonial", ({ bd, consulta }) => bal.comparar(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- premissas dos demonstrativos (DRE e Balanço)
r.get("/versoes/:vid/premissas-dem", ({ bd, params }) => pdem.ler(bd, num(params.vid)));
r.post("/premissas-dem", async ({ bd, usuario, corpo }) => ({ id: await pdem.criar(bd, corpo.nome, corpo.demonstrativo, corpo.conta_codigo ?? "", corpo.sinal ?? 1, usuario.email, corpo.tipo ?? "valor", corpo.base_codigo ?? "", corpo.base_negativa ?? "") }));
r.put("/premissas-dem/:pid", async ({ bd, usuario, params, corpo }) => { await pdem.editar(bd, num(params.pid), corpo.nome ?? null, corpo.conta_codigo ?? null, corpo.sinal ?? null, usuario.email, corpo.base_codigo ?? null, corpo.base_negativa ?? null); return { ok: true }; });
r.delete("/premissas-dem/:pid", async ({ bd, usuario, params }) => { await pdem.excluir(bd, num(params.pid), usuario.email); return { ok: true }; });
r.post("/versoes/:vid/premissas-dem/replicar-todas", ({ bd, usuario, params, corpo }) => pdem.replicarTodas(bd, num(params.vid), corpo.ano, usuario.email, corpo.demonstrativo ?? null));
r.put("/versoes/:vid/premissas-dem/:pid/:ano", async ({ bd, usuario, params, corpo }) => { await pdem.salvarValor(bd, num(params.vid), num(params.pid), num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/premissas-dem/:pid/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await pdem.replicar(bd, num(params.vid), num(params.pid), corpo.ano, usuario.email) }));
r.post("/versoes/:vid/premissas-dem/itens", async ({ bd, usuario, params, corpo }) => { await pdem.incluir(bd, num(params.vid), corpo.premissa_id, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/premissas-dem/itens/:pid", async ({ bd, usuario, params }) => { await pdem.remover(bd, num(params.vid), num(params.pid), usuario.email); return { ok: true }; });
r.get("/comparar-premissas-dem", ({ bd, consulta }) => pdem.comparar(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- investimentos e desinvestimentos, depreciação
const tipoInv = (c: any) => ({ nome: c.nome, natureza: c.natureza, conta_codigo: c.conta_codigo, classificacao_id: c.classificacao_id, carrega_saldo: c.carrega_saldo ?? false, ativo: c.ativo ?? true, vida_util: c.vida_util ?? 0, residual_pct: c.residual_pct ?? 0, carencia: c.carencia ?? 0 });
r.get("/versoes/:vid/investimentos", ({ bd, params }) => inv.ler(bd, num(params.vid)));
r.post("/investimentos/classificacoes", async ({ bd, usuario, corpo }) => ({ id: await inv.criarClassificacao(bd, corpo.nome, usuario.email) }));
r.post("/investimentos/tipos", async ({ bd, usuario, corpo }) => ({ id: await inv.criarTipo(bd, tipoInv(corpo), usuario.email, corpo.versao_id ?? null, corpo.adicionar ?? true) }));
r.put("/investimentos/tipos/:tid", async ({ bd, usuario, params, corpo }) => { await inv.editarTipo(bd, num(params.tid), tipoInv(corpo), usuario.email); return { ok: true }; });
r.delete("/investimentos/tipos/:tid", async ({ bd, usuario, params }) => { await inv.excluirTipo(bd, num(params.tid), usuario.email); return { ok: true }; });
r.post("/versoes/:vid/investimentos/replicar-todos", ({ bd, usuario, params, corpo }) => inv.replicarTodos(bd, num(params.vid), corpo.ano, usuario.email));
r.post("/versoes/:vid/investimentos/:tid/incluir", async ({ bd, usuario, params }) => { await inv.incluirNaVersao(bd, num(params.vid), num(params.tid), usuario.email); return { ok: true }; });
r.post("/versoes/:vid/investimentos/:tid/retirar", async ({ bd, usuario, params }) => { await inv.retirarDaVersao(bd, num(params.vid), num(params.tid), usuario.email); return { ok: true }; });
r.put("/versoes/:vid/investimentos/:tid/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await inv.salvarValor(bd, num(params.vid), num(params.tid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/investimentos/:tid/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await inv.replicar(bd, num(params.vid), num(params.tid), params.campo, corpo.ano, usuario.email) }));
r.put("/versoes/:vid/depreciacao/:chave/:ano", async ({ bd, usuario, params, corpo }) => { await inv.salvarDepreciacao(bd, num(params.vid), params.chave, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/depreciacao/:chave", async ({ bd, usuario, params }) => { await inv.voltarAoCalculado(bd, num(params.vid), params.chave, usuario.email); return { ok: true }; });
r.get("/comparar-investimentos", ({ bd, consulta }) => inv.comparar(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- premissas padronizadas da DRE
r.get("/versoes/:vid/dre-padrao", ({ bd, params }) => dpad.ler(bd, num(params.vid)));
r.get("/versoes/:vid/dre-padrao/previa", ({ bd, params }) => dpad.previa(bd, num(params.vid)));
r.post("/versoes/:vid/dre-padrao/atualizar", ({ bd, usuario, params, corpo }) => dpad.atualizar(bd, num(params.vid), usuario.email, (corpo && corpo.anos) || null));
r.post("/versoes/:vid/dre-padrao/replicar-todos", ({ bd, usuario, params, corpo }) => dpad.replicarTodos(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/dre-padrao/:codigo/:ano", async ({ bd, usuario, params, corpo }) => { await dpad.salvar(bd, num(params.vid), params.codigo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/dre-padrao/:codigo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await dpad.replicar(bd, num(params.vid), params.codigo, corpo.ano, usuario.email) }));

// ---- patrimônio líquido
r.get("/versoes/:vid/patrimonio", ({ bd, params }) => pat.ler(bd, num(params.vid)));
r.delete("/versoes/:vid/patrimonio/:campo", async ({ bd, usuario, params }) => { await pat.voltarAoCalculado(bd, num(params.vid), params.campo, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/patrimonio/replicar-todos", ({ bd, usuario, params, corpo }) => pat.replicarTodos(bd, num(params.vid), corpo.ano, usuario.email));
r.put("/versoes/:vid/patrimonio/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await pat.salvar(bd, num(params.vid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/patrimonio/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await pat.replicar(bd, num(params.vid), params.campo, corpo.ano, usuario.email) }));
r.get("/comparar-patrimonio", ({ bd, consulta }) => pat.comparar(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- caixa (taxa da dívida de giro automática)
r.put("/versoes/:vid/fluxo-caixa/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await fluxo.salvarPremissa(bd, num(params.vid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/fluxo-caixa/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await fluxo.replicarPremissa(bd, num(params.vid), params.campo, corpo.ano, usuario.email) }));

// ---- novas captações e financiamento dos investimentos
r.get("/versoes/:vid/captacoes", ({ bd, params }) => cap.ler(bd, num(params.vid)));
const captacaoIn = (c: any) => ({ nome: c.nome, tipo: c.tipo, ano: c.ano, valor: c.valor, taxa: c.taxa ?? 0, prazo: c.prazo ?? 1, carencia: c.carencia ?? 0 });
r.post("/versoes/:vid/captacoes", async ({ bd, usuario, params, corpo }) => ({ id: await cap.criar(bd, num(params.vid), captacaoIn(corpo), usuario.email) }));
r.put("/versoes/:vid/captacoes/:cid", async ({ bd, usuario, params, corpo }) => { await cap.editar(bd, num(params.vid), num(params.cid), captacaoIn(corpo), usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/captacoes/:cid", async ({ bd, usuario, params }) => { await cap.excluir(bd, num(params.vid), num(params.cid), usuario.email); return { ok: true }; });
r.put("/versoes/:vid/cronograma-captacao/:chave/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await cap.salvarValor(bd, num(params.vid), params.chave, params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.delete("/versoes/:vid/cronograma-captacao/:chave", async ({ bd, usuario, params }) => { await cap.voltarAoCalculado(bd, num(params.vid), params.chave, usuario.email); return { ok: true }; });
r.put("/versoes/:vid/financiamento/:campo/:ano", async ({ bd, usuario, params, corpo }) => { await cap.salvarPremissa(bd, num(params.vid), params.campo, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/financiamento/:campo/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await cap.replicarPremissa(bd, num(params.vid), params.campo, corpo.ano, usuario.email) }));
r.get("/comparar-captacoes", ({ bd, consulta }) => cap.comparar(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- endividamento (base)
const vazioParaNulo = (x: string | null) => (x === null || x === "" ? null : x);
r.get("/dividas/importacoes", async ({ bd }) => ({ importacoes: await div.listarImportacoes(bd), arquivo_padrao: div.arquivoPadrao(), arquivo_padrao_existe: div.arquivoPadraoExiste() }));
r.post("/dividas/importar", ({ bd, usuario, consulta, bruto }) => {
  if (!bruto || !bruto.length) throw Invalido("Nenhum arquivo recebido");
  return div.importar(bd, bruto, consulta.get("arquivo") || "Endividamento alterado.xlsx", inteiro(consulta.get("versao_id")), usuario.email);
});
r.post("/dividas/importar-padrao", ({ bd, usuario, consulta }) => div.importarArquivoPadrao(bd, inteiro(consulta.get("versao_id")), usuario.email));
r.put("/versoes/:vid/divida-importacao", async ({ bd, usuario, params, corpo }) => { await div.vincular(bd, num(params.vid), corpo.importacao_id ?? null, usuario.email); return { ok: true }; });
r.get("/versoes/:vid/dividas", ({ bd, params, consulta }) => div.resumo(bd, num(params.vid), consulta.get("empresas") ?? "agro"));
r.get("/versoes/:vid/dividas/balanco", ({ bd, params, consulta }) => div.balanco(bd, num(params.vid), consulta.get("empresas") ?? "agro"));
r.get("/versoes/:vid/dividas/resumo-mensal", ({ bd, params, consulta }) => div.mensalPorAno(bd, num(params.vid), consulta.get("empresas") ?? "agro"));
r.get("/versoes/:vid/dividas/contratos", ({ bd, params, consulta }) => div.contratos(bd, num(params.vid), consulta.get("empresas") ?? "agro", inteiro(consulta.get("ano")), vazioParaNulo(consulta.get("grupo"))));
r.get("/versoes/:vid/dividas/mensal", ({ bd, params, consulta }) => div.mensal(bd, num(params.vid), num(consulta.get("ano")!), consulta.get("empresas") ?? "agro"));

// ---- DRE (estrutura do Fechamento Contábil + valores por versão)
r.post("/dre/importar", ({ bd, usuario, consulta, bruto }) => {
  if (!bruto || !bruto.length) throw Invalido("Nenhum arquivo recebido");
  return dre.importarEstrutura(bd, bruto, consulta.get("arquivo") || "fechamento-contabil.xlsx", usuario.email);
});
r.post("/dre/importar-padrao", ({ bd, usuario }) => dre.importarArquivoPadrao(bd, usuario.email));
r.get("/dre/arquivo-padrao", () => ({ arquivo: dre.arquivoPadrao(), existe: dre.arquivoPadraoExiste() }));
r.get("/versoes/:vid/dre", ({ bd, params }) => dre.ler(bd, num(params.vid)));
r.get("/comparar-dre", ({ bd, consulta }) => dre.comparar(bd, num(consulta.get("a")!), num(consulta.get("b")!)));

// ---- fluxo de caixa, usos e fontes, indicadores
r.get("/versoes/:vid/fluxo-caixa", async ({ bd, params }) => {
  const p = await fluxo.projetar(bd, num(params.vid));                                      // o caixa é calculado uma vez e serve para o cálculo e para os demonstrativos
  const { estrutura: _ignorar, ...demonstrativos } = await demo.lerFluxo(bd, num(params.vid), p);
  return { ...(await fluxo.ler(bd, num(params.vid), p)), ...demonstrativos };
});
r.get("/versoes/:vid/usos-fontes", ({ bd, params }) => demo.usosFontes(bd, num(params.vid)));
r.get("/versoes/:vid/indicadores", ({ bd, params }) => demo.indicadores(bd, num(params.vid)));
r.put("/versoes/:vid/indicadores/:indicador/:ano", async ({ bd, usuario, params, corpo }) => { await demo.salvarMeta(bd, num(params.vid), params.indicador, num(params.ano), corpo.valor, usuario.email); return { ok: true }; });
r.post("/versoes/:vid/indicadores/:indicador/replicar", async ({ bd, usuario, params, corpo }) => ({ anos_alterados: await demo.replicarMeta(bd, num(params.vid), params.indicador, corpo.ano, usuario.email) }));

// ---- orçado × realizado, comparação e impressão
r.get("/realizado/comparativo", ({ bd, consulta }) => orcreal.comparar(bd, num(consulta.get("versao_id")!), num(consulta.get("ano")!)));
r.get("/comparacao/itens", () => ({ itens: comparacao.ITENS }));
r.post("/versoes/:vid/impressao", ({ bd, params, corpo }) => comparacao.imprimir(bd, num(params.vid), corpo.itens));
r.post("/comparacao", ({ bd, usuario, corpo }) => comparacao.comparar(bd, corpo.base, corpo.outros, corpo.ano, corpo.itens, corpo.impactos ?? true, usuario.email));
