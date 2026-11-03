// Versões (orçamentos): listar, criar, copiar, período, horizonte e aprovar. Porte de app/servicos/arrendamentos.py.
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido } from "../lib/erros.mts";
import { HORIZONTE, HORIZONTE_MAX, auditar, obterVersao, versaoEditavel, type Versao } from "./base.mts";

export const listarVersoes = (bd: Bd) => bd.q<Versao>("SELECT * FROM versoes ORDER BY ano_base DESC, id DESC");

function validarHorizonte(h: number) {
  if (!(h >= 1 && h <= HORIZONTE_MAX)) throw Invalido(`O horizonte deve ficar entre 1 e ${HORIZONTE_MAX} anos`);
}

const dataIso = (t?: string | null): string | null => {
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(t + "T00:00:00Z");
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
};

// O orçamento é anual: vale do ano da data inicial ao da final
function periodo(dataInicio?: string | null, dataFim?: string | null): [number, number] {
  const ini = dataIso(dataInicio), fim = dataIso(dataFim);
  if (!ini || !fim) throw Invalido("Informe as datas de início e fim do orçamento");
  if (fim <= ini) throw Invalido("A data final deve ser depois da data inicial");
  return [Number(ini.slice(0, 4)), Number(fim.slice(0, 4)) - Number(ini.slice(0, 4)) + 1];
}

export interface NovaVersao { ano_base?: number | null; nome?: string | null; horizonte?: number; data_inicio?: string | null; data_fim?: string | null; }

export async function criarOrcado(bd: Bd, d: NovaVersao, autor: string): Promise<number> {
  let anoBase = d.ano_base ?? null, horizonte = d.horizonte ?? HORIZONTE;
  if (d.data_inicio || d.data_fim) [anoBase, horizonte] = periodo(d.data_inicio, d.data_fim);
  else if (anoBase === null) throw Invalido("Informe o período do orçamento");
  const nome = (d.nome || `Orçamento ${anoBase}`).trim();
  validarHorizonte(horizonte);
  const [{ id }] = await bd.q<{ id: number }>(
    "INSERT INTO versoes(ano_base, tipo, nome, horizonte, data_inicio, data_fim, criado_em, autor) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
    [anoBase, "orcado", nome, horizonte, d.data_inicio || null, d.data_fim || null, agora(), autor]);
  await auditar(bd, autor, id, "criar_orcado", nome);
  return id;
}

// tabelas por versão copiadas como estão: [tabela, colunas além de versao_id]
const COPIAR = [
  ["precos", "cultura_id, ano, preco"], ["culturas_da_versao", "cultura_id"], ["produtividade", "cultura_id, ano, valor"], ["precos_venda", "cultura_id, ano, preco"],
  ["transportadora_valores", "campo, ano, valor"], ["capital_giro", "campo, ano, valor"], ["capital_giro_origem", "campo, ano, ano_realizado, anos"],
  ["investimento_valores", "tipo_id, campo, ano, valor"], ["dre_padrao", "codigo, ano, valor"], ["rebanho_valores", "cultura_id, campo, ano, valor"],
  ["investimento_excluidos", "tipo_id"], ["patrimonio_valores", "campo, ano, valor"], ["giro_auto_premissas", "campo, ano, valor"],
  ["indicadores_metas", "indicador, ano, valor"], ["depreciacao_valores", "chave, ano, valor"], ["culturas_extras", "cultura_id, tela"],
  ["pecuaria_leite", "ano, animais, kg_animal_dia"], ["premissas_dem_itens", "premissa_id"], ["premissas_dem_valores", "premissa_id, ano, valor"],
  ["prem_culturas", "cultura_id"], ["prem_itens", "cultura_id, tipo"], ["prem_valores", "cultura_id, tipo, ano, valor"],
  ["custos_culturas", "cultura_id"], ["custos_grupos_cultura", "cultura_id, grupo_id"], ["custos_cultura", "cultura_id, grupo_id, ano, valor"],
  ["areas_cultura", "cultura_id, ano, area_ha"],
] as const;

// captações, alterações à mão e premissas de financiamento (os ids das captações mudam)
async function copiarCaptacoes(bd: Bd, origem: number, novo: number) {
  const mapa: Record<string, string> = {};
  for (const r of await bd.q("SELECT * FROM novas_captacoes WHERE versao_id=?", [origem])) {
    const [{ id }] = await bd.q<{ id: number }>("INSERT INTO novas_captacoes(versao_id, nome, tipo, ano, valor, taxa, prazo, carencia) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
      [novo, r.nome, r.tipo, r.ano, r.valor, r.taxa, r.prazo, r.carencia]);
    mapa[`cap-${r.id}`] = `cap-${id}`;
  }
  for (const r of await bd.q("SELECT * FROM captacao_valores WHERE versao_id=?", [origem])) {
    const chave = mapa[r.chave] ?? (String(r.chave).startsWith("cap-") ? null : r.chave);
    if (chave) await bd.q("INSERT INTO captacao_valores(versao_id, chave, campo, ano, valor) VALUES(?,?,?,?,?)", [novo, chave, r.campo, r.ano, r.valor]);
  }
  await bd.q("INSERT INTO financiamento_premissas(versao_id, campo, ano, valor) SELECT ?::int, campo, ano, valor FROM financiamento_premissas WHERE versao_id=?", [novo, origem]);
}

export async function copiarVersao(bd: Bd, origemId: number, tipo: string, nome: string | null | undefined, autor: string): Promise<number> {
  const o = await obterVersao(bd, origemId);
  const nomeFinal = (nome || `${tipo === "reprojetado" ? "Reprojetado" : "Revisão"} ${o.ano_base}`).trim();
  const [{ id: novo }] = await bd.q<{ id: number }>(
    "INSERT INTO versoes(ano_base, tipo, nome, horizonte, data_inicio, data_fim, divida_importacao_id, origem_id, criado_em, autor) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id",
    [o.ano_base, tipo, nomeFinal, o.horizonte, o.data_inicio, o.data_fim, o.divida_importacao_id, origemId, agora(), autor]);
  const mapa = new Map<number, number>();
  for (const f of await bd.q("SELECT * FROM fazendas WHERE versao_id=?", [origemId])) {
    const [{ id }] = await bd.q<{ id: number }>("INSERT INTO fazendas(versao_id, nome, tipo, arrendador, forma, cultura_id, observacao) VALUES(?,?,?,?,?,?,?) RETURNING id",
      [novo, f.nome, f.tipo, f.arrendador, f.forma, f.cultura_id, f.observacao]);
    mapa.set(f.id, id);
  }
  for (const [antigo, nova] of mapa) {
    await bd.q("INSERT INTO fazenda_anos(fazenda_id, ano, area_ha, valor) SELECT ?::int, ano, area_ha, valor FROM fazenda_anos WHERE fazenda_id=?", [nova, antigo]);
    await bd.q("INSERT INTO parcelas(fazenda_id, mes, percentual) SELECT ?::int, mes, percentual FROM parcelas WHERE fazenda_id=?", [nova, antigo]);
  }
  for (const [tabela, colunas] of COPIAR) {
    await bd.q(`INSERT INTO ${tabela}(versao_id, ${colunas}) SELECT ?::int, ${colunas} FROM ${tabela} WHERE versao_id=?`, [novo, origemId]);
  }
  await copiarCaptacoes(bd, origemId, novo);
  await auditar(bd, autor, novo, "copiar_versao", `${tipo} a partir de ${origemId}`);
  return novo;
}

// Avisos que impedem aprovar (hoje só os de Arrendamentos). O módulo de Arrendamentos ainda não foi portado: quando for, ele troca esta função.
export const avisosParaAprovar: { fn: (bd: Bd, vid: number) => Promise<string[]> } = { fn: async () => [] };

export async function aprovar(bd: Bd, vid: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  const problemas = await avisosParaAprovar.fn(bd, vid);
  if (problemas.length) throw Invalido("Corrija antes de aprovar: " + problemas.join("; "));
  await bd.q("UPDATE versoes SET status='aprovado', aprovado_em=?, autor=? WHERE id=?", [agora(), autor, vid]);
  await auditar(bd, autor, vid, "aprovar", v.nome);
}

export async function alterarHorizonte(bd: Bd, vid: number, horizonte: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  validarHorizonte(horizonte);
  await bd.q("UPDATE versoes SET horizonte=? WHERE id=?", [horizonte, vid]);
  await auditar(bd, autor, vid, "alterar_horizonte", `${v.horizonte} -> ${horizonte}`);
}

// Muda nome e período de um orçamento em elaboração. Os dados são guardados por ano: os de anos que saem do período ficam guardados (escondidos).
export async function alterarPeriodo(bd: Bd, vid: number, nome: string, anoInicial: number, anoFinal: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  const n = (nome || "").trim();
  if (!n) throw Invalido("Informe o nome do orçamento");
  if (anoFinal < anoInicial) throw Invalido("O ano final deve ser igual ou depois do ano inicial");
  const horizonte = anoFinal - anoInicial + 1;
  validarHorizonte(horizonte);
  await bd.q("UPDATE versoes SET nome=?, ano_base=?, horizonte=?, data_inicio=NULL, data_fim=NULL WHERE id=?", [n, anoInicial, horizonte, vid]);
  await auditar(bd, autor, vid, "alterar_periodo", `${v.ano_base}+${v.horizonte} -> ${anoInicial}+${horizonte}`);
}
