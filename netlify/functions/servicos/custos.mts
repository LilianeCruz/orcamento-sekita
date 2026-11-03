// Custos variáveis: cada produto com produtividade entra sozinho; o usuário adiciona grupos de custo (cada um vira uma linha) e lança R$ por hectare, por ano.
// Porte de app/servicos/custos.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { delta, destinosDe, marcas } from "./comum.mts";
import * as extras from "./extras.mts";
import { quantidadesSemArea } from "./resultado.mts";

async function existe(bd: Bd, cid: number) {
  const [c] = await bd.q("SELECT * FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado(`Produto ${cid} não existe`);
  return c;
}

// produtos da tela: os que têm produtividade (áreas, pecuária, leite) e os escolhidos à mão em versões antigas
async function idsLista(bd: Bd, vid: number): Promise<number[]> {
  const manual = (await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM custos_culturas WHERE versao_id=?", [vid])).map((r) => r.cultura_id);
  return [...new Set([...(await extras.idsComProdutividade(bd, vid)), ...manual])];
}

async function cultura(bd: Bd, vid: number, cid: number) {
  const c = await existe(bd, cid);
  if (!(await idsLista(bd, vid)).includes(cid)) throw Invalido(`Adicione ${c.nome} em Custos variáveis antes de lançar os grupos de custo`);
  return c;
}

export async function adicionarCulturaCusto(bd: Bd, vid: number, cid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await existe(bd, cid);
  if (!c.ativa) throw Invalido(`${c.nome} está inativo no cadastro de Produtos`);
  if ((await bd.q("SELECT 1 FROM custos_culturas WHERE versao_id=? AND cultura_id=?", [vid, cid])).length) throw Invalido(`${c.nome} já está em Custos variáveis`);
  await bd.q("INSERT INTO custos_culturas(versao_id, cultura_id) VALUES(?,?)", [vid, cid]);
  await auditar(bd, autor, vid, "adicionar_cultura_custo", String(c.nome));
}

export async function removerCulturaCusto(bd: Bd, vid: number, cid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await cultura(bd, vid, cid);
  for (const t of ["custos_cultura", "custos_grupos_cultura", "custos_culturas"]) await bd.q(`DELETE FROM ${t} WHERE versao_id=? AND cultura_id=?`, [vid, cid]);
  await auditar(bd, autor, vid, "remover_cultura_custo", String(c.nome));
}

async function grupo(bd: Bd, gid: number) {
  const [g] = await bd.q("SELECT * FROM grupos_custo WHERE id=?", [gid]);
  if (!g) throw NaoEncontrado(`Grupo de custo ${gid} não existe`);
  return g;
}
const naCultura = async (bd: Bd, vid: number, cid: number, gid: number) => (await bd.q("SELECT 1 FROM custos_grupos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=?", [vid, cid, gid])).length > 0;
// ordem dos grupos: custo direto primeiro, depois por nome
const ordemGrupo = (x: any, y: any) => { const a = [x.classificacao !== "direto", String(x.nome).toLowerCase()], b = [y.classificacao !== "direto", String(y.nome).toLowerCase()]; return a[0] !== b[0] ? (a[0] ? 1 : -1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; };

export async function lerCustos(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const valores = new Map<string, Record<number, number>>();
  for (const r of await bd.q("SELECT cultura_id, grupo_id, ano, valor FROM custos_cultura WHERE versao_id=?", [vid])) {
    const k = `${r.cultura_id}|${r.grupo_id}`;
    if (!valores.has(k)) valores.set(k, {});
    valores.get(k)![r.ano] = r.valor;
  }
  const areas: Record<number, Record<number, number>> = {};
  for (const r of await bd.q("SELECT cultura_id, ano, area_ha FROM areas_cultura WHERE versao_id=?", [vid])) (areas[r.cultura_id] ??= {})[r.ano] = r.area_ha;
  const grupos = new Map<number, any>((await bd.q("SELECT * FROM grupos_custo")).map((g) => [g.id as number, { ...g, nome: String(g.nome) }]));
  const usados: Record<number, number[]> = {};
  for (const r of await bd.q("SELECT cultura_id, grupo_id FROM custos_grupos_cultura WHERE versao_id=?", [vid])) (usados[r.cultura_id] ??= []).push(r.grupo_id);
  const lista = await idsLista(bd, vid);
  const qtdSemArea = await quantidadesSemArea(bd, vid);                 // pecuária e leite: o custo é por kg/litro/unidade produzido
  const culturas: any[] = [];
  for (const c of await bd.q(`SELECT c.* FROM culturas c WHERE c.id IN (${marcas(lista.length)}) ORDER BY c.grupo COLLATE "C", c.nome`, lista)) {
    const ids = [...(usados[c.id] ?? [])].sort((a, b) => ordemGrupo(grupos.get(a), grupos.get(b)));
    const linhas = ids.map((g) => ({ id: g, nome: grupos.get(g)!.nome, classificacao: grupos.get(g)!.classificacao, ativa: !!grupos.get(g)!.ativa,
      anos: Object.fromEntries(anos.map((a) => [a, valores.get(`${c.id}|${g}`)?.[a] ?? 0])) }));
    const tot: any = {};
    for (const k of ["direto", "indireto", "total"]) tot[k] = Object.fromEntries(anos.map((a) => [a, linhas.filter((l) => k === "total" || l.classificacao === k).reduce((t, l) => t + l.anos[a], 0)]));
    const semArea = c.id in qtdSemArea;
    const rebanho = semArea && c.estoque_destino === "gado";                    // gado de corte: a rubrica é o valor total do ano (compra dos animais, ração...)
    const area = Object.fromEntries(anos.map((a) => [a, rebanho ? 1 : semArea ? qtdSemArea[c.id][a] ?? 0 : areas[c.id]?.[a] ?? 0]));        // sem área: a quantidade produzida
    culturas.push({
      id: c.id, nome: String(c.nome), grupo: c.grupo, unidade: c.unidade, sem_area: semArea, rebanho, grupos: linhas, totais: tot, area_ha: area,
      custo_total: Object.fromEntries(anos.map((a) => [a, tot.total[a] * area[a]])),
      adicionaveis: [...grupos.values()].sort(ordemGrupo).filter((g) => g.ativa && !ids.includes(g.id)).map((g) => ({ id: g.id, nome: g.nome, classificacao: g.classificacao })),
    });
  }
  // produtos que ainda podem ser escolhidos: qualquer ativo do cadastro que não esteja aqui (inclui os sem área, como leite)
  const escolhiveis = (await bd.q(`SELECT c.id, c.nome, c.grupo FROM culturas c WHERE c.ativa=1 AND c.id NOT IN (${lista.length ? marcas(lista.length) : "-1"}) ORDER BY c.grupo COLLATE "C", c.nome`, lista)).map((r) => ({ ...r, nome: String(r.nome) }));
  const [{ n }] = await bd.q<{ n: number }>("SELECT COUNT(*) AS n FROM culturas WHERE ativa=1");
  return { versao: v, anos, culturas, culturas_escolhiveis: escolhiveis, total_culturas_areas: n, total_grupos: grupos.size };
}

export async function adicionarGrupoCusto(bd: Bd, vid: number, cid: number, gid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await cultura(bd, vid, cid), g = await grupo(bd, gid);
  if (!g.ativa) throw Invalido(`O grupo ${g.nome} está inativo`);
  if (await naCultura(bd, vid, cid, gid)) throw Invalido(`${g.nome} já está em ${c.nome}`);
  await bd.q("INSERT INTO custos_grupos_cultura(versao_id, cultura_id, grupo_id) VALUES(?,?,?)", [vid, cid, gid]);
  await auditar(bd, autor, vid, "adicionar_grupo_custo", `${c.nome}: ${g.nome}`);
}

// inclui a rubrica em todos os produtos da tela que ainda não a têm
export async function adicionarGrupoATodas(bd: Bd, vid: number, gid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const g = await grupo(bd, gid);
  if (!g.ativa) throw Invalido(`O grupo ${g.nome} está inativo`);
  const culturas = await idsLista(bd, vid);
  if (!culturas.length) throw Invalido("Adicione pelo menos um produto antes de incluir a rubrica em todas");
  const novas: number[] = [];
  for (const cid of culturas) if (!(await naCultura(bd, vid, cid, gid))) novas.push(cid);
  for (const cid of novas) await bd.q("INSERT INTO custos_grupos_cultura(versao_id, cultura_id, grupo_id) VALUES(?,?,?)", [vid, cid, gid]);
  await auditar(bd, autor, vid, "adicionar_grupo_custo_a_todas", `${g.nome}: ${novas.length} cultura(s)`);
  return { adicionadas: novas.length, ja_tinham: culturas.length - novas.length };
}

export async function removerGrupoCusto(bd: Bd, vid: number, cid: number, gid: number, autor: string) {
  await versaoEditavel(bd, vid);
  const c = await cultura(bd, vid, cid), g = await grupo(bd, gid);
  await bd.q("DELETE FROM custos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=?", [vid, cid, gid]);
  await bd.q("DELETE FROM custos_grupos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=?", [vid, cid, gid]);
  await auditar(bd, autor, vid, "remover_grupo_custo", `${c.nome}: ${g.nome}`);
}

async function exigir(bd: Bd, vid: number, cid: number, gid: number) {
  const c = await cultura(bd, vid, cid), g = await grupo(bd, gid);
  if (!(await naCultura(bd, vid, cid, gid))) throw Invalido(`Adicione ${g.nome} a ${c.nome} antes de lançar o custo`);
  return { c, g };
}
const UPSERT = "INSERT INTO custos_cultura(versao_id, cultura_id, grupo_id, ano, valor) VALUES(?,?,?,?,?) ON CONFLICT(versao_id, cultura_id, grupo_id, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarCusto(bd: Bd, vid: number, cid: number, gid: number, ano: number, valor: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const { c, g } = await exigir(bd, vid, cid, gid);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("O custo não pode ser negativo");
  await bd.q(UPSERT, [vid, cid, gid, ano, valor]);
  await auditar(bd, autor, vid, "salvar_custo", `${c.nome} / ${g.nome} ${ano}: ${valor}`);
}

async function copiar(bd: Bd, vid: number, cid: number, gid: number, anoOrigem: number, destinos: number[]) {
  const [o] = await bd.q("SELECT valor FROM custos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=? AND ano=?", [vid, cid, gid, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, cid, gid, a, o ? o.valor : 0]);
}

export async function replicarCusto(bd: Bd, vid: number, cid: number, gid: number, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const { c, g } = await exigir(bd, vid, cid, gid);
  const destinos = destinosDe(v, anoOrigem);
  await copiar(bd, vid, cid, gid, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_custo", `${c.nome} / ${g.nome}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodosCustos(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosDe(v, anoOrigem, true);
  const pares = await bd.q<{ cultura_id: number; grupo_id: number }>("SELECT cultura_id, grupo_id FROM custos_grupos_cultura WHERE versao_id=?", [vid]);
  if (!pares.length) throw Invalido("Nenhum custo lançado para replicar");
  for (const p of pares) await copiar(bd, vid, p.cultura_id, p.grupo_id, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_todos_custos", `${pares.length} linha(s) de ${anoOrigem}`);
  return { linhas: pares.length, anos_alterados: destinos.length };
}

export async function compararCustos(bd: Bd, aId: number, bId: number) {
  const la = await lerCustos(bd, aId), lb = await lerCustos(bd, bId);
  const anos = la.anos.filter((x) => lb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ia = new Map(la.culturas.map((c) => [c.id, c])), ib = new Map(lb.culturas.map((c) => [c.id, c]));
  const nomes = new Map([...la.culturas, ...lb.culturas].map((c) => [c.id as number, c.nome as string]));
  const culturas: any = {};
  for (const cid of [...nomes.keys()].sort((x, y) => (nomes.get(x)!.toLowerCase() < nomes.get(y)!.toLowerCase() ? -1 : 1))) {
    const ca = ia.get(cid), cb = ib.get(cid);
    const ga = new Map<string, any>((ca ? ca.grupos : []).map((g: any) => [g.nome, g])), gb = new Map<string, any>((cb ? cb.grupos : []).map((g: any) => [g.nome, g]));
    const z = Object.fromEntries(anos.map((an) => [an, 0]));
    culturas[nomes.get(cid)!] = {
      total: Object.fromEntries(anos.map((an) => [an, delta((ca ? ca.totais.total : z)[an] ?? 0, (cb ? cb.totais.total : z)[an] ?? 0)])),
      grupos: Object.fromEntries([...new Set([...ga.keys(), ...gb.keys()])].sort((x, y) => (x.toLowerCase() < y.toLowerCase() ? -1 : x.toLowerCase() > y.toLowerCase() ? 1 : 0)).map((n) => [n,
        Object.fromEntries(anos.map((an) => [an, delta((ga.get(n)?.anos ?? z)[an] ?? 0, (gb.get(n)?.anos ?? z)[an] ?? 0)]))])),
    };
  }
  return { a: la.versao, b: lb.versao, anos, culturas };
}
