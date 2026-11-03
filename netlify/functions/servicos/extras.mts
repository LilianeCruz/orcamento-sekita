// Lista de produtos das telas Produtividade e Preços = produtos de "Áreas por produto" + produtos adicionados à mão (sem área),
// como os da pecuária, que não têm hectares. Porte de app/servicos/extras.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { auditar, versaoEditavel } from "./base.mts";

export const TELAS: Record<string, [string, string]> = { produtividade: ["produtividade", "Produtividade"], precos: ["precos_venda", "Preços"] };

function tabelaValores(tela: string): string {
  if (!(tela in TELAS)) throw Invalido("Tela inválida");
  return TELAS[tela][0];
}

// o produto "Leite" do cadastro, quando já há produtividade de leite lançada nesta versão
export async function leiteId(bd: Bd, vid: number): Promise<number | null> {
  if (!(await bd.q("SELECT 1 FROM pecuaria_leite WHERE versao_id=? AND (animais>0 OR kg_animal_dia>0)", [vid])).length) return null;
  const [r] = await bd.q<{ id: number }>("SELECT id FROM culturas WHERE ativa=1 AND LOWER(nome) LIKE 'leite%' ORDER BY id LIMIT 1");
  return r ? r.id : null;
}

export async function idsDaLista(bd: Bd, vid: number, tela: string): Promise<number[]> {
  tabelaValores(tela);
  const ids = (await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=? UNION SELECT cultura_id FROM culturas_extras WHERE versao_id=? AND tela=?", [vid, vid, tela])).map((r) => r.cultura_id);
  if (tela === "precos") {          // tudo o que tem produtividade (inclusive pecuária e leite) também precisa de preço
    const mais: (number | null)[] = (await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM culturas_extras WHERE versao_id=? AND tela='produtividade'", [vid])).map((r) => r.cultura_id);
    mais.push(await leiteId(bd, vid));
    for (const i of new Set(mais)) if (i !== null && !ids.includes(i)) ids.push(i);
  }
  return ids;
}

// produtos que têm produtividade nesta versão: é a lista de Custos variáveis
export async function idsComProdutividade(bd: Bd, vid: number): Promise<number[]> {
  const ids = await idsDaLista(bd, vid, "produtividade");
  const leite = await leiteId(bd, vid);
  return leite !== null && !ids.includes(leite) ? [...ids, leite] : ids;
}

export async function naLista(bd: Bd, vid: number, tela: string, cid: number) {
  const [c] = await bd.q("SELECT * FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado(`Produto ${cid} não existe`);
  if (!(await idsDaLista(bd, vid, tela)).includes(cid)) throw Invalido(`${c.nome} não está na lista de ${TELAS[tela][1]} desta versão; adicione-o com o botão + (ou em Áreas por produto)`);
  return c;
}

// produtos ativos do cadastro que ainda não estão na lista (botão +)
export async function disponiveis(bd: Bd, vid: number, tela: string) {
  const na = new Set(await idsDaLista(bd, vid, tela));
  return (await bd.q('SELECT * FROM culturas WHERE ativa=1 ORDER BY grupo COLLATE "C", nome')).filter((c) => !na.has(c.id)).map((c) => ({ id: c.id, nome: String(c.nome), grupo: c.grupo, unidade: c.unidade }));
}

// produtos da lista que NÃO estão em Áreas por produto (os que podem ser removidos aqui)
export async function semArea(bd: Bd, vid: number, tela: string): Promise<Set<number>> {
  const areas = new Set((await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", [vid])).map((r) => r.cultura_id));
  return new Set((await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM culturas_extras WHERE versao_id=? AND tela=?", [vid, tela])).map((r) => r.cultura_id).filter((i) => !areas.has(i)));
}

export async function incluir(bd: Bd, vid: number, tela: string, cid: number, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  tabelaValores(tela);
  const [c] = await bd.q("SELECT * FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado(`Produto ${cid} não existe`);
  if (!c.ativa) throw Invalido(`${c.nome} está inativa no cadastro de Produtos`);
  if ((await idsDaLista(bd, vid, tela)).includes(cid)) throw Invalido(`${c.nome} já está na lista de ${TELAS[tela][1]}`);
  await bd.q("INSERT INTO culturas_extras(versao_id, cultura_id, tela) VALUES(?,?,?)", [vid, cid, tela]);
  await auditar(bd, autor, vid, `incluir_cultura_${tela}`, String(c.nome));
}

export async function remover(bd: Bd, vid: number, tela: string, cid: number, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  const tabela = tabelaValores(tela);
  const [c] = await bd.q("SELECT * FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado(`Produto ${cid} não existe`);
  if (!(await semArea(bd, vid, tela)).has(cid)) throw Invalido(`${c.nome} faz parte de Áreas por produto; para tirá-la daqui, remova-a lá`);
  await bd.q(`DELETE FROM ${tabela} WHERE versao_id=? AND cultura_id=?`, [vid, cid]);
  await bd.q("DELETE FROM culturas_extras WHERE versao_id=? AND cultura_id=? AND tela=?", [vid, cid, tela]);
  await auditar(bd, autor, vid, `remover_cultura_${tela}`, String(c.nome));
}
