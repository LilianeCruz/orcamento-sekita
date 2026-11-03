// Premissas de culturas: vinculam-se ao produto os tipos de premissa; cada tipo vira uma linha com valores por ano. Porte de app/servicos/premissas.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { delta, destinosDe, marcas } from "./comum.mts";
import * as extras from "./extras.mts";

export const TIPOS: Record<string, { nome: string; natureza: string; unico?: boolean }> = {
  deducao_receita: { nome: "% dedução de receita", natureza: "pct" },
  descarte: { nome: "% descarte", natureza: "pct" },
  estoque: { nome: "Quantidade estocada", natureza: "qtd" },
  sementes: { nome: "Sementes salvas", natureza: "qtd" },
  // valores únicos do ano anterior ao primeiro ano do orçamento: o estoque de passagem que o orçamento recebe
  estoque_ant: { nome: "Estoque de passagem do ano anterior", natureza: "qtd", unico: true },
  custo_estoque_ant: { nome: "Custo médio do estoque do ano anterior", natureza: "moeda", unico: true },
};

function tipoDe(tipo: string) {
  if (!(tipo in TIPOS)) throw Invalido("Tipo de premissa inválido");
  return TIPOS[tipo];
}
async function existe(bd: Bd, cid: number) {
  const [c] = await bd.q("SELECT * FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado(`Produto ${cid} não existe`);
  return c;
}
async function escolhida(bd: Bd, vid: number, cid: number) {
  const c = await existe(bd, cid);
  if (!(await bd.q("SELECT 1 FROM prem_culturas WHERE versao_id=? AND cultura_id=?", [vid, cid])).length) throw Invalido(`Adicione ${c.nome} em Premissas de produtos antes de vincular as premissas`);
  return c;
}
const tem = async (bd: Bd, vid: number, cid: number, tipo: string) => (await bd.q("SELECT 1 FROM prem_itens WHERE versao_id=? AND cultura_id=? AND tipo=?", [vid, cid, tipo])).length > 0;
const unidade = (c: any, tipo: string) => { const n = TIPOS[tipo].natureza; return n === "pct" ? "%" : n === "moeda" ? `R$/${c.unidade}` : c.unidade; };

export async function lerPremissas(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const valores = new Map<string, Record<number, number>>();
  for (const r of await bd.q("SELECT cultura_id, tipo, ano, valor FROM prem_valores WHERE versao_id=?", [vid])) {
    const k = `${r.cultura_id}|${r.tipo}`;
    if (!valores.has(k)) valores.set(k, {});
    valores.get(k)![r.ano] = r.valor;
  }
  const itens: Record<number, string[]> = {};
  for (const r of await bd.q("SELECT cultura_id, tipo FROM prem_itens WHERE versao_id=?", [vid])) (itens[r.cultura_id] ??= []).push(r.tipo);
  const ordem = Object.keys(TIPOS);
  const culturas: any[] = [];
  for (const c of await bd.q('SELECT c.* FROM culturas c JOIN prem_culturas pc ON pc.cultura_id=c.id AND pc.versao_id=? ORDER BY c.grupo COLLATE "C", c.nome', [vid])) {
    const tipos = [...(itens[c.id] ?? [])].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
    culturas.push({
      id: c.id, nome: String(c.nome), grupo: c.grupo,
      premissas: tipos.map((t) => ({ tipo: t, nome: TIPOS[t].nome, unidade: unidade(c, t), unico: !!TIPOS[t].unico,
        anos: Object.fromEntries((TIPOS[t].unico ? [anos[0] - 1] : anos).map((a) => [a, valores.get(`${c.id}|${t}`)?.[a] ?? 0])) })),
      adicionaveis: ordem.filter((t) => !tipos.includes(t)).map((t) => ({ tipo: t, nome: TIPOS[t].nome })),
    });
  }
  const lista = await extras.idsComProdutividade(bd, vid);           // produtos com área ou com produtividade (pecuária, leite)
  const escolhiveis = (await bd.q(`SELECT c.id, c.nome, c.grupo FROM culturas c WHERE c.id IN (${marcas(lista.length)}) AND c.id NOT IN (SELECT cultura_id FROM prem_culturas WHERE versao_id=?) ORDER BY c.grupo COLLATE "C", c.nome`, [...lista, vid])).map((r) => ({ ...r, nome: String(r.nome) }));
  return { versao: v, anos, ano_anterior: anos[0] - 1, culturas, culturas_escolhiveis: escolhiveis, total_culturas_areas: lista.length,
    tipos: Object.entries(TIPOS).map(([t, d]) => ({ tipo: t, nome: d.nome, natureza: d.natureza })) };
}

export async function adicionarCulturaPremissa(bd: Bd, vid: number, cid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await existe(bd, cid);
  if (!(await extras.idsComProdutividade(bd, vid)).includes(cid)) throw Invalido(`${c.nome} não está em Áreas por produto nem tem produtividade lançada. Só entram aqui os produtos que têm área ou produtividade; adicione-o lá primeiro`);
  if ((await bd.q("SELECT 1 FROM prem_culturas WHERE versao_id=? AND cultura_id=?", [vid, cid])).length) throw Invalido(`${c.nome} já está em Premissas de produtos`);
  await bd.q("INSERT INTO prem_culturas(versao_id, cultura_id) VALUES(?,?)", [vid, cid]);
  await auditar(bd, autor, vid, "adicionar_cultura_premissa", String(c.nome));
}

export async function removerCulturaPremissa(bd: Bd, vid: number, cid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await escolhida(bd, vid, cid);
  for (const t of ["prem_valores", "prem_itens", "prem_culturas"]) await bd.q(`DELETE FROM ${t} WHERE versao_id=? AND cultura_id=?`, [vid, cid]);
  await auditar(bd, autor, vid, "remover_cultura_premissa", String(c.nome));
}

export async function adicionarTipo(bd: Bd, vid: number, cid: number, tipo: string, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await escolhida(bd, vid, cid);
  const t = tipoDe(tipo);
  if (await tem(bd, vid, cid, tipo)) throw Invalido(`${t.nome} já está em ${c.nome}`);
  await bd.q("INSERT INTO prem_itens(versao_id, cultura_id, tipo) VALUES(?,?,?)", [vid, cid, tipo]);
  await auditar(bd, autor, vid, "adicionar_premissa", `${c.nome}: ${t.nome}`);
}

export async function adicionarTipoATodas(bd: Bd, vid: number, tipo: string, autor: string) {
  await versaoEditavel(bd, vid);
  const t = tipoDe(tipo);
  const culturas = (await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM prem_culturas WHERE versao_id=?", [vid])).map((r) => r.cultura_id);
  if (!culturas.length) throw Invalido("Adicione pelo menos um produto antes de vincular a premissa a todas");
  const novas: number[] = [];
  for (const cid of culturas) if (!(await tem(bd, vid, cid, tipo))) novas.push(cid);
  for (const cid of novas) await bd.q("INSERT INTO prem_itens(versao_id, cultura_id, tipo) VALUES(?,?,?)", [vid, cid, tipo]);
  await auditar(bd, autor, vid, "adicionar_premissa_a_todas", `${t.nome}: ${novas.length} cultura(s)`);
  return { adicionadas: novas.length, ja_tinham: culturas.length - novas.length };
}

export async function removerTipo(bd: Bd, vid: number, cid: number, tipo: string, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await escolhida(bd, vid, cid);
  const t = tipoDe(tipo);
  await bd.q("DELETE FROM prem_valores WHERE versao_id=? AND cultura_id=? AND tipo=?", [vid, cid, tipo]);
  await bd.q("DELETE FROM prem_itens WHERE versao_id=? AND cultura_id=? AND tipo=?", [vid, cid, tipo]);
  await auditar(bd, autor, vid, "remover_premissa", `${c.nome}: ${t.nome}`);
}

async function exigir(bd: Bd, vid: number, cid: number, tipo: string) {
  const c = await escolhida(bd, vid, cid), t = tipoDe(tipo);
  if (!(await tem(bd, vid, cid, tipo))) throw Invalido(`Vincule ${t.nome} a ${c.nome} antes de lançar o valor`);
  return { c, t };
}
const UPSERT = "INSERT INTO prem_valores(versao_id, cultura_id, tipo, ano, valor) VALUES(?,?,?,?,?) ON CONFLICT(versao_id, cultura_id, tipo, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarPremissa(bd: Bd, vid: number, cid: number, tipo: string, ano: number, valor: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const { c, t } = await exigir(bd, vid, cid, tipo);
  const anos = anosDaVersao(v);
  if (t.unico) { if (ano !== anos[0] - 1) throw Invalido(`${t.nome} vale só para o ano anterior ao orçamento (${anos[0] - 1})`); }
  else if (!anos.includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("O valor não pode ser negativo");
  if (t.natureza === "pct" && valor > 100) throw Invalido(`${t.nome} deve ficar entre 0 e 100`);
  await bd.q(UPSERT, [vid, cid, tipo, ano, valor]);
  await auditar(bd, autor, vid, "salvar_premissa", `${c.nome} / ${t.nome} ${ano}: ${valor}`);
}

async function copiar(bd: Bd, vid: number, cid: number, tipo: string, anoOrigem: number, destinos: number[]) {
  const [o] = await bd.q("SELECT valor FROM prem_valores WHERE versao_id=? AND cultura_id=? AND tipo=? AND ano=?", [vid, cid, tipo, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, cid, tipo, a, o ? o.valor : 0]);
}

export async function replicarPremissa(bd: Bd, vid: number, cid: number, tipo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const { c, t } = await exigir(bd, vid, cid, tipo);
  if (t.unico) throw Invalido(`${t.nome} é um valor único do ano anterior e não se replica`);
  const destinos = destinosDe(v, anoOrigem);
  await copiar(bd, vid, cid, tipo, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_premissa", `${c.nome} / ${t.nome}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodasPremissas(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem, true);
  const pares = (await bd.q<{ cultura_id: number; tipo: string }>("SELECT cultura_id, tipo FROM prem_itens WHERE versao_id=?", [vid])).filter((r) => !TIPOS[r.tipo].unico);
  if (!pares.length) throw Invalido("Nenhuma premissa lançada para replicar");
  for (const p of pares) await copiar(bd, vid, p.cultura_id, p.tipo, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_todas_premissas", `${pares.length} linha(s) de ${anoOrigem}`);
  return { linhas: pares.length, anos_alterados: destinos.length };
}

export async function compararPremissas(bd: Bd, aId: number, bId: number) {
  const la = await lerPremissas(bd, aId), lb = await lerPremissas(bd, bId);
  const anos = la.anos.filter((x) => lb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ia = new Map(la.culturas.map((c) => [c.id, c])), ib = new Map(lb.culturas.map((c) => [c.id, c]));
  const nomes = new Map([...la.culturas, ...lb.culturas].map((c) => [c.id as number, c.nome as string]));
  const culturas: any = {};
  for (const cid of [...nomes.keys()].sort((x, y) => (nomes.get(x)!.toLowerCase() < nomes.get(y)!.toLowerCase() ? -1 : 1))) {
    const pa = new Map<string, any>((ia.get(cid)?.premissas ?? []).map((p: any) => [p.tipo, p])), pb = new Map<string, any>((ib.get(cid)?.premissas ?? []).map((p: any) => [p.tipo, p]));
    const z = Object.fromEntries(anos.map((an) => [an, 0]));
    culturas[nomes.get(cid)!] = Object.fromEntries(Object.keys(TIPOS).filter((t) => pa.has(t) || pb.has(t)).map((t) => [TIPOS[t].nome, {
      unidade: (pa.get(t) || pb.get(t)).unidade,
      anos: Object.fromEntries(anos.map((an) => [an, delta((pa.get(t)?.anos ?? z)[an] ?? 0, (pb.get(t)?.anos ?? z)[an] ?? 0)])),
    }]));
  }
  return { a: la.versao, b: lb.versao, anos, culturas };
}
