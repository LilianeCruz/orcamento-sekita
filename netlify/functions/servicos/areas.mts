// Áreas trabalhadas por cultura. Porte de app/servicos/areas.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { delta, destinosDe } from "./comum.mts";

async function cultura(bd: Bd, cid: number) {
  const [c] = await bd.q("SELECT * FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado(`Produto ${cid} não existe`);
  return c;
}
const naVersao = async (bd: Bd, vid: number, cid: number) => (await bd.q("SELECT 1 FROM culturas_da_versao WHERE versao_id=? AND cultura_id=?", [vid, cid])).length > 0;
async function exigirNaVersao(bd: Bd, vid: number, c: any) {
  if (!(await naVersao(bd, vid, c.id))) throw Invalido(`Adicione ${c.nome} à lista de produtos desta versão antes de lançar a área`);
}
const UPSERT = "INSERT INTO areas_cultura(versao_id, cultura_id, ano, area_ha) VALUES(?,?,?,?) ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET area_ha=excluded.area_ha";

export async function lerAreas(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const areas: Record<number, Record<number, number>> = {};
  for (const r of await bd.q("SELECT cultura_id, ano, area_ha FROM areas_cultura WHERE versao_id=?", [vid])) (areas[r.cultura_id] ??= {})[r.ano] = r.area_ha;
  const culturas: any[] = [], adicionaveis: any[] = [];
  for (const c of await bd.q('SELECT * FROM culturas ORDER BY grupo COLLATE "C", nome')) {
    if (await naVersao(bd, vid, c.id)) culturas.push({ id: c.id, nome: String(c.nome), grupo: c.grupo, ativa: !!c.ativa, anos: Object.fromEntries(anos.map((a) => [a, areas[c.id]?.[a] ?? 0])) });
    else if (c.ativa) adicionaveis.push({ id: c.id, nome: String(c.nome), grupo: c.grupo });
  }
  const resumo = Object.fromEntries(anos.map((a) => [a, { plantado: culturas.reduce((t, c) => t + c.anos[a], 0) }]));
  const [{ n }] = await bd.q<{ n: number }>("SELECT COUNT(*) AS n FROM culturas");
  return { versao: v, anos, culturas, adicionaveis, total_cadastradas: n, resumo };
}

export async function adicionarCulturaArea(bd: Bd, vid: number, cid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await cultura(bd, cid);
  if (!c.ativa) throw Invalido(`${c.nome} está inativa no cadastro de Produtos`);
  if (await naVersao(bd, vid, cid)) throw Invalido(`${c.nome} já está na lista desta versão`);
  await bd.q("INSERT INTO culturas_da_versao(versao_id, cultura_id) VALUES(?,?)", [vid, cid]);
  await bd.q("INSERT INTO custos_culturas(versao_id, cultura_id) VALUES(?,?) ON CONFLICT DO NOTHING", [vid, cid]);      // já aparece em Custos variáveis
  await auditar(bd, autor, vid, "adicionar_cultura_area", String(c.nome));
}

export async function removerCulturaArea(bd: Bd, vid: number, cid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await cultura(bd, cid);
  await bd.q("DELETE FROM areas_cultura WHERE versao_id=? AND cultura_id=?", [vid, cid]);
  // as adicionadas à mão ficam (Preços acompanha a Produtividade)
  for (const [telas, tabela] of [[["produtividade"], "produtividade"], [["precos", "produtividade"], "precos_venda"]] as [string[], string][]) {
    const m = telas.map(() => "?").join(",");
    if (!(await bd.q(`SELECT 1 FROM culturas_extras WHERE versao_id=? AND cultura_id=? AND tela IN (${m})`, [vid, cid, ...telas])).length)
      await bd.q(`DELETE FROM ${tabela} WHERE versao_id=? AND cultura_id=?`, [vid, cid]);
  }
  for (const t of ["custos_cultura", "custos_grupos_cultura", "custos_culturas", "prem_valores", "prem_itens", "prem_culturas", "culturas_da_versao"]) await bd.q(`DELETE FROM ${t} WHERE versao_id=? AND cultura_id=?`, [vid, cid]);
  await auditar(bd, autor, vid, "remover_cultura_area", String(c.nome));
}

export async function salvarArea(bd: Bd, vid: number, cid: number, ano: number, areaHa: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const c = await cultura(bd, cid);
  await exigirNaVersao(bd, vid, c);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (areaHa < 0) throw Invalido("A área não pode ser negativa");
  await bd.q(UPSERT, [vid, cid, ano, areaHa]);
  await auditar(bd, autor, vid, "salvar_area", `${c.nome} ${ano}: ${areaHa} ha`);
}

export async function replicarArea(bd: Bd, vid: number, cid: number, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const c = await cultura(bd, cid);
  await exigirNaVersao(bd, vid, c);
  const destinos = destinosDe(v, anoOrigem);
  const [o] = await bd.q("SELECT area_ha FROM areas_cultura WHERE versao_id=? AND cultura_id=? AND ano=?", [vid, cid, anoOrigem]);
  const valor = o ? o.area_ha : 0;
  for (const a of destinos) await bd.q(UPSERT, [vid, cid, a, valor]);
  await auditar(bd, autor, vid, "replicar_area", `${c.nome}: ${valor} ha de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodasAreas(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem, true);
  const ids = (await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", [vid])).map((r) => r.cultura_id);
  if (!ids.length) throw Invalido("Nenhum produto adicionado para replicar");
  for (const cid of ids) {
    const [o] = await bd.q("SELECT area_ha FROM areas_cultura WHERE versao_id=? AND cultura_id=? AND ano=?", [vid, cid, anoOrigem]);
    for (const a of destinos) await bd.q(UPSERT, [vid, cid, a, o ? o.area_ha : 0]);
  }
  await auditar(bd, autor, vid, "replicar_todas_areas", `${ids.length} cultura(s) de ${anoOrigem} para ${destinos.length} ano(s)`);
  return { culturas: ids.length, anos_alterados: destinos.length };
}

export async function compararAreas(bd: Bd, aId: number, bId: number) {
  const la = await lerAreas(bd, aId), lb = await lerAreas(bd, bId);
  const anos = la.anos.filter((x) => lb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ia = new Map(la.culturas.map((c) => [c.id, c])), ib = new Map(lb.culturas.map((c) => [c.id, c]));
  const nomes = new Map([...la.culturas, ...lb.culturas].map((c) => [c.id as number, c.nome as string]));
  const ordem = [...nomes.keys()].sort((x, y) => (nomes.get(x)!.toLowerCase() < nomes.get(y)!.toLowerCase() ? -1 : 1));
  const culturas = Object.fromEntries(ordem.map((i) => [nomes.get(i), Object.fromEntries(anos.map((an) => [an, delta(ia.get(i)?.anos[an] ?? 0, ib.get(i)?.anos[an] ?? 0)]))]));
  const total = Object.fromEntries(anos.map((an) => [an, delta(la.resumo[an].plantado, lb.resumo[an].plantado)]));
  return { a: la.versao, b: lb.versao, anos, culturas, total };
}
