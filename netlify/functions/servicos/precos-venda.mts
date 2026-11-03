// Preço de venda por produto e ano (R$ por kg, ou por litro). Independente do "valor padrão" de Arrendamentos. Porte de app/servicos/precos.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { destinosDe, marcas } from "./comum.mts";
import * as extras from "./extras.mts";

const UPSERT = "INSERT INTO precos_venda(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?) ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET preco=excluded.preco";

export async function lerPrecosVenda(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const precos: Record<number, Record<number, number>> = {};
  for (const r of await bd.q("SELECT cultura_id, ano, preco FROM precos_venda WHERE versao_id=?", [vid])) (precos[r.cultura_id] ??= {})[r.ano] = r.preco;
  const ids = await extras.idsDaLista(bd, vid, "precos");
  const removiveis = await extras.semArea(bd, vid, "precos");
  const culturas = (await bd.q(`SELECT * FROM culturas WHERE id IN (${marcas(ids.length)}) ORDER BY grupo COLLATE "C", nome`, ids)).map((c) => ({
    id: c.id, nome: String(c.nome), grupo: c.grupo, ativa: !!c.ativa, unidade: c.unidade, removivel: removiveis.has(c.id),
    anos: Object.fromEntries(anos.map((a) => [a, precos[c.id]?.[a] ?? null])),
  }));
  return { versao: v, anos, culturas, disponiveis: await extras.disponiveis(bd, vid, "precos") };
}

export async function salvarPrecoVenda(bd: Bd, vid: number, cid: number, ano: number, preco: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const c = await extras.naLista(bd, vid, "precos", cid);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (preco < 0) throw Invalido("O preço não pode ser negativo");
  await bd.q(UPSERT, [vid, cid, ano, preco]);
  await auditar(bd, autor, vid, "salvar_preco_venda", `${c.nome} ${ano}: ${preco}`);
}

async function copiar(bd: Bd, vid: number, cid: number, anoOrigem: number, destinos: number[]): Promise<boolean> {
  const [o] = await bd.q("SELECT preco FROM precos_venda WHERE versao_id=? AND cultura_id=? AND ano=?", [vid, cid, anoOrigem]);
  if (!o) return false;
  for (const a of destinos) await bd.q(UPSERT, [vid, cid, a, o.preco]);
  return true;
}

export async function replicarPrecoVenda(bd: Bd, vid: number, cid: number, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const c = await extras.naLista(bd, vid, "precos", cid);
  const destinos = destinosDe(v, anoOrigem);
  if (!(await copiar(bd, vid, cid, anoOrigem, destinos))) throw Invalido(`Não há preço de ${c.nome} em ${anoOrigem} para replicar`);
  await auditar(bd, autor, vid, "replicar_preco_venda", `${c.nome}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

// copia o preço do ano de origem para os seguintes, em todos os produtos da lista que tenham preço nesse ano
export async function replicarTodosPrecosVenda(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem, true);
  const ids = await extras.idsDaLista(bd, vid, "precos");
  if (!ids.length) throw Invalido("Nenhum produto em Áreas por produto para replicar");
  let feitas = 0;
  for (const cid of ids) if (await copiar(bd, vid, cid, anoOrigem, destinos)) feitas++;
  if (!feitas) throw Invalido(`Nenhum produto tem preço em ${anoOrigem} para replicar`);
  await auditar(bd, autor, vid, "replicar_todos_precos_venda", `${feitas} cultura(s) de ${anoOrigem}`);
  return { culturas: feitas, anos_alterados: destinos.length };
}

export async function compararPrecosVenda(bd: Bd, aId: number, bId: number) {
  const la = await lerPrecosVenda(bd, aId), lb = await lerPrecosVenda(bd, bId);
  const anos = la.anos.filter((x) => lb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const d = (x: number | null, y: number | null) => { const a = x || 0, b = y || 0; return { a, b, delta: b - a, pct: a ? ((b - a) / a) * 100 : null }; };
  const ia = new Map(la.culturas.map((c) => [c.id, c])), ib = new Map(lb.culturas.map((c) => [c.id, c]));
  const info = new Map([...la.culturas, ...lb.culturas].map((c) => [c.id, c]));
  const ordem = [...info.keys()].sort((x, y) => (info.get(x)!.nome.toLowerCase() < info.get(y)!.nome.toLowerCase() ? -1 : 1));
  const culturas = Object.fromEntries(ordem.map((i) => [info.get(i)!.nome, { unidade: info.get(i)!.unidade,
    anos: Object.fromEntries(anos.map((an) => [an, d(ia.get(i)?.anos[an] ?? null, ib.get(i)?.anos[an] ?? null)])) }]));
  return { a: la.versao, b: lb.versao, anos, culturas };
}
