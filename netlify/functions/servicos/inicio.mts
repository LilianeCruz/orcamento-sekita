// Tela inicial: andamento do preenchimento das premissas, próximos passos e última alteração. Porte de app/servicos/inicio.py.
import type { Bd } from "../lib/bd.mts";
import { obterVersao } from "./base.mts";
import { listarTodas } from "./anotacoes.mts";

const V = "versao_id=?";
// [grupo, módulo do menu, [[título do passo, detalhe, módulo, consulta que retorna >0 quando está feito]]]
const GRUPOS: [string, string, [string, string, string, string][]][] = [
  ["Produção", "areas", [
    ["Informar as áreas por produto", "Premissas de produção · Áreas", "areas", `SELECT COUNT(*) FROM areas_cultura WHERE ${V} AND area_ha>0`],
    ["Informar a produtividade", "Premissas de produção · Produtividade", "produtividade", `SELECT COUNT(*) FROM produtividade WHERE ${V} AND valor>0`],
    ["Informar os preços de venda", "Premissas de produção · Preços", "precos", `SELECT COUNT(*) FROM precos_venda WHERE ${V} AND preco>0`],
    ["Informar os custos variáveis", "Premissas de produção · Custos variáveis", "variaveis", `SELECT COUNT(*) FROM custos_cultura WHERE ${V}`]]],
  ["Investimentos", "invest", [
    ["Lançar os investimentos", "Premissas de investimento · valores ainda não preenchidos", "invest", `SELECT COUNT(*) FROM investimento_valores WHERE ${V} AND valor<>0`]]],
  ["DRE", "premdem", [
    ["Preencher as premissas da DRE", "Premissas da DRE · valores ainda não preenchidos", "premdem",
     `SELECT (SELECT COUNT(*) FROM dre_padrao WHERE ${V} AND valor<>0) + (SELECT COUNT(*) FROM premissas_dem_valores WHERE ${V} AND valor<>0)`]]],
  ["Balanço", "capgiro", [
    ["Definir o prazo de recebimento de clientes", "Premissas de balanço · Contas a receber", "capgiro", `SELECT COUNT(*) FROM capital_giro WHERE ${V} AND campo='dias_receber' AND valor>0`],
    ["Definir o prazo de pagamento a fornecedores", "Premissas de balanço · Fornecedores", "capgiro", `SELECT COUNT(*) FROM capital_giro WHERE ${V} AND campo='dias_fornecedores' AND valor>0`],
    ["Definir o caixa mínimo", "Premissas de balanço · Caixa mínimo", "capgiro", `SELECT COUNT(*) FROM capital_giro WHERE ${V} AND campo IN ('pct_caixa','saldo_caixa') AND valor>0`]]],
  ["Dividendos", "patrimonio", [
    ["Definir política de dividendos", "Premissas ainda não preenchidas", "patrimonio", `SELECT COUNT(*) FROM patrimonio_valores WHERE ${V} AND valor<>0`]]],
  ["Dívidas", "dividas", [
    ["Vincular a base de dívidas", "Premissas de dívidas · importação de endividamento", "dividas", "SELECT COUNT(*) FROM versoes WHERE id=? AND divida_importacao_id IS NOT NULL"],
    ["Revisar captações e financiamentos", "Premissas de dívidas · novas captações", "dividas",
     `SELECT (SELECT COUNT(*) FROM novas_captacoes WHERE ${V}) + (SELECT COUNT(*) FROM financiamento_premissas WHERE ${V} AND valor>0)`]]],
];

// [trecho do nome da ação na auditoria, rótulo da tela, módulo]; a primeira que casar vale
const ACOES: [string, string, string][] = [
  ["transportadora", "Premissas de transportadora", "transp"], ["premissa_dem", "Premissas da DRE", "premdem"], ["dre_padrao", "Premissas da DRE", "premdem"],
  ["capital_giro", "Premissas de balanço", "capgiro"], ["investimento", "Premissas de investimento", "invest"], ["patrimonio", "Premissas de dividendos", "patrimonio"],
  ["captacao", "Premissas de dívidas", "dividas"], ["divida", "Premissas de dívidas", "dividas"], ["financiamento", "Premissas de dívidas", "dividas"],
  ["preco", "Premissas de produção · Preços", "precos"], ["produtividade", "Premissas de produção · Produtividade", "produtividade"],
  ["pecuaria", "Premissas de produção · Produtividade", "produtividade"], ["rebanho", "Premissas de produção · Produtividade", "produtividade"],
  ["custo", "Premissas de produção · Custos variáveis", "variaveis"], ["area", "Premissas de produção · Áreas", "areas"],
  ["anota", "Anotações", "anotacoes"], ["aprovar", "Orçamentos", "orcamentos"],
];

// Quantas anotações há e quantas estão pendentes; "com valor alterado" compara o número anotado com o cálculo de hoje dos demonstrativos.
async function resumoAnotacoes(bd: Bd, vid: number) {
  const notas = await listarTodas(bd, vid);
  const pend = notas.filter((n) => !n.validado);
  return { total: notas.length, validadas: notas.length - pend.length, pendentes: pend.length, alteradas: pend.filter((n) => n.mudou).length, vermelhas: pend.filter((n) => n.cor === "vermelho").length };
}

export async function lerInicio(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const grupos: any[] = [], passos: any[] = [];
  let feitos = 0, total = 0;
  for (const [nome, modulo, checks] of GRUPOS) {
    const pend: any[] = [];
    for (const [titulo, detalhe, mod, sql] of checks) {
      total++;
      const [r] = await bd.q(sql, Array(sql.split("?").length - 1).fill(vid));
      if (Number(Object.values(r)[0]) > 0) feitos++; else pend.push({ titulo, detalhe, modulo: mod });
    }
    grupos.push({ nome, modulo, estado: !pend.length ? "concluido" : pend.length === checks.length ? "nao_iniciado" : "pendencias", pendencias: pend.length });
    passos.push(...pend);
  }
  let ultima: any = null;
  const [r] = await bd.q("SELECT quando, acao, detalhe FROM auditoria WHERE versao_id=? AND acao NOT IN ('copiar_versao','criar_versao') ORDER BY id DESC LIMIT 1", [vid]);
  if (r) {
    const achou = ACOES.find(([k]) => String(r.acao).includes(k));
    ultima = { quando: r.quando, tela: achou ? achou[1] : "Orçamento", modulo: achou ? achou[2] : "orcamentos", detalhe: r.detalhe || "" };
  }
  const [{ m }] = await bd.q<{ m: string | null }>("SELECT MAX(quando) AS m FROM auditoria WHERE versao_id=?", [vid]);
  return { versao: v, atualizado_em: m || v.criado_em, percentual: total ? Math.round((feitos / total) * 100) : 0,
    concluidos: grupos.filter((g) => g.estado === "concluido").length, grupos, passos, ultima, anotacoes: await resumoAnotacoes(bd, vid) };
}
