// Mesmos nomes de operação de ferramentas/registro_ops.py, rodando a versão em TypeScript.
import type { Bd } from "../netlify/functions/lib/bd.mts";
import * as versoes from "../netlify/functions/servicos/versoes.mts";
import * as arr from "../netlify/functions/servicos/arrendamentos.mts";
import * as areas from "../netlify/functions/servicos/areas.mts";
import * as extras from "../netlify/functions/servicos/extras.mts";
import * as prod from "../netlify/functions/servicos/produtividade.mts";
import * as precos from "../netlify/functions/servicos/precos-venda.mts";
import * as pecuaria from "../netlify/functions/servicos/pecuaria.mts";
import * as grupos from "../netlify/functions/servicos/grupos-custo.mts";
import * as notas from "../netlify/functions/servicos/anotacoes.mts";
import * as culturas from "../netlify/functions/servicos/culturas.mts";
import * as custos from "../netlify/functions/servicos/custos.mts";
import * as premissas from "../netlify/functions/servicos/premissas.mts";
import * as rebanho from "../netlify/functions/servicos/rebanho.mts";
import * as resultado from "../netlify/functions/servicos/resultado.mts";
import * as real from "../netlify/functions/servicos/realizado.mts";
import { abrirPlanilha } from "../netlify/functions/lib/xlsx.mts";

const A = "t@x.com";
const nada = async (p: Promise<unknown>) => { await p; return null; };
export const registro: Record<string, (bd: Bd, ...a: any[]) => Promise<unknown>> = {
  "culturas.criar": (bd, d) => culturas.criarCultura(bd, d, A), "culturas.atualizar": (bd, i, d) => nada(culturas.atualizarCultura(bd, i, d, A)), "culturas.excluir": (bd, i) => nada(culturas.excluirCultura(bd, i, A)),
  "custos.adicionar_cultura": (bd, v, cid) => nada(custos.adicionarCulturaCusto(bd, v, cid, A)), "custos.remover_cultura": (bd, v, cid) => nada(custos.removerCulturaCusto(bd, v, cid, A)),
  "custos.adicionar_grupo": (bd, v, cid, g) => nada(custos.adicionarGrupoCusto(bd, v, cid, g, A)), "custos.adicionar_grupo_a_todas": (bd, v, g) => custos.adicionarGrupoATodas(bd, v, g, A),
  "custos.remover_grupo": (bd, v, cid, g) => nada(custos.removerGrupoCusto(bd, v, cid, g, A)), "custos.salvar": (bd, v, cid, g, ano, val) => nada(custos.salvarCusto(bd, v, cid, g, ano, val, A)),
  "custos.replicar": (bd, v, cid, g, ano) => custos.replicarCusto(bd, v, cid, g, ano, A), "custos.replicar_todos": (bd, v, ano) => custos.replicarTodosCustos(bd, v, ano, A),
  "prem.adicionar_cultura": (bd, v, cid) => nada(premissas.adicionarCulturaPremissa(bd, v, cid, A)), "prem.remover_cultura": (bd, v, cid) => nada(premissas.removerCulturaPremissa(bd, v, cid, A)),
  "prem.adicionar_tipo": (bd, v, cid, t) => nada(premissas.adicionarTipo(bd, v, cid, t, A)), "prem.adicionar_tipo_a_todas": (bd, v, t) => premissas.adicionarTipoATodas(bd, v, t, A),
  "prem.remover_tipo": (bd, v, cid, t) => nada(premissas.removerTipo(bd, v, cid, t, A)), "prem.salvar": (bd, v, cid, t, ano, val) => nada(premissas.salvarPremissa(bd, v, cid, t, ano, val, A)),
  "prem.replicar": (bd, v, cid, t, ano) => premissas.replicarPremissa(bd, v, cid, t, ano, A), "prem.replicar_todas": (bd, v, ano) => premissas.replicarTodasPremissas(bd, v, ano, A),
  "reb.salvar": (bd, v, cid, campo, ano, val) => nada(rebanho.salvarRebanho(bd, v, cid, campo, ano, val, A)), "reb.replicar": (bd, v, cid, campo, ano) => rebanho.replicarRebanho(bd, v, cid, campo, ano, A),
  "ler.custos": (bd, v) => custos.lerCustos(bd, v), "ler.premissas": (bd, v) => premissas.lerPremissas(bd, v), "ler.rebanho": (bd, v) => rebanho.lerRebanho(bd, v), "ler.resultado": (bd, v) => resultado.calcularResultado(bd, v),
  "comparar.custos": (bd, a, b) => custos.compararCustos(bd, a, b), "comparar.premissas": (bd, a, b) => premissas.compararPremissas(bd, a, b), "comparar.resultado": (bd, a, b) => resultado.compararResultado(bd, a, b),
  "versoes.copiar": (bd, o, tipo, nome = null) => versoes.copiarVersao(bd, o, tipo, nome, A),
  "versoes.periodo": async (bd, v, nome, i, f) => { await versoes.alterarPeriodo(bd, v, nome, i, f, A); return null; },
  "versoes.horizonte": async (bd, v, h) => { await versoes.alterarHorizonte(bd, v, h, A); return null; },
  "arr.criar_fazenda": (bd, v, d) => arr.criarFazenda(bd, v, d, A),
  "arr.atualizar_fazenda": async (bd, f, d) => { await arr.atualizarFazenda(bd, f, d, A); return null; },
  "arr.salvar_ano": async (bd, f, ano, area, valor) => { await arr.salvarAno(bd, f, ano, area, valor, A); return null; },
  "arr.replicar_fazenda": (bd, f, ano, campos) => arr.replicarFazenda(bd, f, ano, campos, A),
  "arr.salvar_parcelas": async (bd, f, p) => { await arr.salvarParcelas(bd, f, p, A); return null; },
  "arr.salvar_precos": async (bd, v, p) => { await arr.salvarPrecos(bd, v, p, A); return null; },
  "arr.replicar_preco": (bd, v, cid, ano) => arr.replicarPreco(bd, v, cid, ano, A),
  "arr.excluir_fazenda": async (bd, f) => { await arr.excluirFazenda(bd, f, A); return null; },
  "areas.adicionar": async (bd, v, cid) => { await areas.adicionarCulturaArea(bd, v, cid, A); return null; },
  "areas.salvar": async (bd, v, cid, ano, ha) => { await areas.salvarArea(bd, v, cid, ano, ha, A); return null; },
  "areas.replicar": (bd, v, cid, ano) => areas.replicarArea(bd, v, cid, ano, A),
  "areas.replicar_todas": (bd, v, ano) => areas.replicarTodasAreas(bd, v, ano, A),
  "areas.remover": async (bd, v, cid) => { await areas.removerCulturaArea(bd, v, cid, A); return null; },
  "extras.incluir": async (bd, v, tela, cid) => { await extras.incluir(bd, v, tela, cid, A); return null; },
  "extras.remover": async (bd, v, tela, cid) => { await extras.remover(bd, v, tela, cid, A); return null; },
  "prod.salvar": async (bd, v, cid, ano, val) => { await prod.salvarProdutividade(bd, v, cid, ano, val, A); return null; },
  "prod.replicar": (bd, v, cid, ano) => prod.replicarProdutividade(bd, v, cid, ano, A),
  "prod.replicar_todas": (bd, v, ano) => prod.replicarTodasProdutividades(bd, v, ano, A),
  "precos.salvar": async (bd, v, cid, ano, val) => { await precos.salvarPrecoVenda(bd, v, cid, ano, val, A); return null; },
  "precos.replicar": (bd, v, cid, ano) => precos.replicarPrecoVenda(bd, v, cid, ano, A),
  "precos.replicar_todas": (bd, v, ano) => precos.replicarTodosPrecosVenda(bd, v, ano, A),
  "pec.salvar": async (bd, v, campo, ano, val) => { await pecuaria.salvarPecuaria(bd, v, campo, ano, val, A); return null; },
  "pec.replicar": (bd, v, campo, ano) => pecuaria.replicarPecuaria(bd, v, campo, ano, A),
  "pec.replicar_todos": (bd, v, ano) => pecuaria.replicarTodosPecuaria(bd, v, ano, A),
  "grupos.criar": (bd, d) => grupos.criarGrupo(bd, d, A),
  "grupos.atualizar": async (bd, g, d) => { await grupos.atualizarGrupo(bd, g, d, A); return null; },
  "grupos.excluir": async (bd, g) => { await grupos.excluirGrupo(bd, g, A); return null; },
  "notas.salvar": (bd, v, tela, chave, cor, com, valor = null) => notas.salvarAnotacao(bd, v, tela, chave, cor, com, A, valor),
  "notas.validar": (bd, v, tela, chave, ok) => notas.validarAnotacao(bd, v, tela, chave, ok, A),
  "ler.areas": (bd, v) => areas.lerAreas(bd, v), "ler.produtividade": (bd, v) => prod.lerProdutividade(bd, v), "ler.precos_venda": (bd, v) => precos.lerPrecosVenda(bd, v),
  "ler.pecuaria": (bd, v) => pecuaria.lerPecuaria(bd, v),
  "ler.arrendamentos": async (bd, v) => ({ ...(await arr.lerArrendamentos(bd, v)), calculo: await arr.calcularArrendamentos(bd, v) }),
  "ler.culturas": async (bd) => (await culturas.listarCulturas(bd)).culturas, "ler.grupos": async (bd) => (await grupos.listarGrupos(bd)).grupos,
  "ler.notas": (bd, v, tela) => notas.listarAnotacoes(bd, v, tela),
  "comparar.areas": (bd, a, b) => areas.compararAreas(bd, a, b), "comparar.produtividade": (bd, a, b) => prod.compararProdutividade(bd, a, b),
  "comparar.precos_venda": (bd, a, b) => precos.compararPrecosVenda(bd, a, b), "comparar.pecuaria": (bd, a, b) => pecuaria.compararPecuaria(bd, a, b),
  "comparar.arrendamentos": (bd, a, b) => arr.compararArrendamentos(bd, a, b),
};

Object.assign(registro, {
  "real.importar": (bd, b64, arquivo, anoInicial = null, meses = null, mesInicio = null, versaoId = null, quantidades = null) =>
    real.importar(bd, Buffer.from(b64, "base64"), arquivo, A, anoInicial, meses, mesInicio, versaoId, quantidades ? Object.fromEntries(Object.entries(quantidades).map(([k, v]) => [Number(k), v as number])) : null),
  "real.excluir_ano": (bd, ano) => nada(real.excluirAno(bd, ano, A)),
  "real.salvar_periodo": (bd, mi, mf, v = null) => nada(real.salvarPeriodo(bd, mi, mf, v, A)),
  "real.salvar_quantidade": (bd, cid, q, ano = null) => nada(real.salvarQuantidade(bd, cid, q, A, ano)),
  "ler.realizado": (bd) => real.ler(bd), "ler.real_periodo": (bd) => real.periodo(bd), "ler.real_quantidades": (bd) => real.quantidadesPorAno(bd),
  "ler.real_produtos": (bd) => real.produtosVenda(bd), "ler.real_importacoes": (bd) => real.importacoesComparaveis(bd),
  "real.saldo_inicial": (bd, ano) => real.saldoInicial(bd, ano), "real.valor": (bd, dem, cod, ano) => real.valorRealizado(bd, dem, cod, ano),
  "real.ultimo_ano": (bd) => real.ultimoAno(bd), "real.periodo_do_ano": (bd, ano) => real.periodoDoAno(bd, ano),
  "real.modelo_linhas": async (bd) => { const p = await abrirPlanilha(await real.modelo(bd)); return Object.fromEntries(p.abas.map((a) => [a, p.linhas(a)])); },
});
