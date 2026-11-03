// Produtividade por produto e ano (kg/ha, ou litro). Porte de app/servicos/produtividade.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { delta, destinosDe, marcas } from "./comum.mts";
import * as extras from "./extras.mts";

const UPSERT = "INSERT INTO produtividade(versao_id, cultura_id, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET valor=excluded.valor";

// uma linha por produto da lista; produtividade por hectare em kg (ou litro, p/ leite)
export async function lerProdutividade(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const prod: Record<number, Record<number, number>> = {};
  for (const r of await bd.q("SELECT cultura_id, ano, valor FROM produtividade WHERE versao_id=?", [vid])) (prod[r.cultura_id] ??= {})[r.ano] = r.valor;
  const ids = await extras.idsDaLista(bd, vid, "produtividade");
  const removiveis = await extras.semArea(bd, vid, "produtividade");
  const culturas = (await bd.q(`SELECT * FROM culturas WHERE id IN (${marcas(ids.length)}) ORDER BY grupo COLLATE "C", nome`, ids)).map((c) => ({
    id: c.id, nome: String(c.nome), grupo: c.grupo, ativa: !!c.ativa, unidade: c.unidade, removivel: removiveis.has(c.id),
    anos: Object.fromEntries(anos.map((a) => [a, prod[c.id]?.[a] ?? 0])),
  }));
  return { versao: v, anos, culturas, disponiveis: await extras.disponiveis(bd, vid, "produtividade") };
}

export async function salvarProdutividade(bd: Bd, vid: number, cid: number, ano: number, valor: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const c = await extras.naLista(bd, vid, "produtividade", cid);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("A produtividade não pode ser negativa");
  await bd.q(UPSERT, [vid, cid, ano, valor]);
  await auditar(bd, autor, vid, "salvar_produtividade", `${c.nome} ${ano}: ${valor}`);
}

async function copiarParaFrente(bd: Bd, vid: number, cid: number, anoOrigem: number, destinos: number[]) {
  const [o] = await bd.q("SELECT valor FROM produtividade WHERE versao_id=? AND cultura_id=? AND ano=?", [vid, cid, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, cid, a, o ? o.valor : 0]);
}

export async function replicarProdutividade(bd: Bd, vid: number, cid: number, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const c = await extras.naLista(bd, vid, "produtividade", cid);
  const destinos = destinosDe(v, anoOrigem);
  await copiarParaFrente(bd, vid, cid, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_produtividade", `${c.nome}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodasProdutividades(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem, true);
  const ids = await extras.idsDaLista(bd, vid, "produtividade");
  if (!ids.length) throw Invalido("Nenhum produto na lista de produtividade para replicar");
  for (const cid of ids) await copiarParaFrente(bd, vid, cid, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_todas_produtividades", `${ids.length} cultura(s) de ${anoOrigem}`);
  return { culturas: ids.length, anos_alterados: destinos.length };
}

export async function compararProdutividade(bd: Bd, aId: number, bId: number) {
  const la = await lerProdutividade(bd, aId), lb = await lerProdutividade(bd, bId);
  const anos = la.anos.filter((x) => lb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ia = new Map(la.culturas.map((c) => [c.id, c])), ib = new Map(lb.culturas.map((c) => [c.id, c]));
  const info = new Map([...la.culturas, ...lb.culturas].map((c) => [c.id, c]));
  const ordem = [...info.keys()].sort((x, y) => (info.get(x)!.nome.toLowerCase() < info.get(y)!.nome.toLowerCase() ? -1 : 1));
  const culturas = Object.fromEntries(ordem.map((i) => [info.get(i)!.nome, { unidade: info.get(i)!.unidade, grupo: info.get(i)!.grupo,
    anos: Object.fromEntries(anos.map((an) => [an, delta(ia.get(i)?.anos[an] ?? 0, ib.get(i)?.anos[an] ?? 0)])) }]));
  return { a: la.versao, b: lb.versao, anos, culturas };
}
