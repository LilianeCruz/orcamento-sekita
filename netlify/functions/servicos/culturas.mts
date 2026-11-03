// Cadastro de produtos (lista única, vale para todas as versões). Porte de app/servicos/culturas.py.
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { auditar } from "./base.mts";

export const UNIDADES = ["kg", "litro", "uni"];
const PLURAL: Record<string, string> = { kg: "kg", litro: "litros", uni: "unidades" };
export const GRUPOS = ["Hortifruti", "Grãos", "Fruticultura", "Pecuária", "Outros"];
const ESTOQUES = ["produto", "gado"];                 // produto: Estoque de produtos acabados; gado: Estoque de gado de corte
const RECEITAS = ["operacional", "nao_operacional"];  // operacional: linhas próprias na DRE; não operacional: Resultados de outras atividades

export interface CulturaIn { nome: string; grupo: string; unidade?: string; embalagem?: string; qtd_por_embalagem?: number; ativa?: boolean; receita_tipo?: string; estoque_destino?: string; }

async function validar(bd: Bd, d: CulturaIn, cid = 0) {
  const nome = String(d.nome ?? "").trim();
  if (!nome) throw Invalido("Informe o nome do produto");
  if (!GRUPOS.includes(d.grupo)) throw Invalido("Grupo inválido. Use: " + GRUPOS.join(", "));
  const unidade = String(d.unidade || "kg").trim().toLowerCase();
  if (!UNIDADES.includes(unidade)) throw Invalido("A produção deve ser medida em kg, litro ou unidade");
  const embalagem = String(d.embalagem ?? "").trim();
  let qtd = Number(d.qtd_por_embalagem || 0);
  if (qtd < 0) throw Invalido("A quantidade por embalagem não pode ser negativa");
  if (embalagem && qtd <= 0) throw Invalido(`Informe quantos ${PLURAL[unidade]} tem cada ${embalagem.toLowerCase()} (maior que zero)`);
  if (!embalagem) qtd = 0;
  const receita = String(d.receita_tipo || "operacional");
  if (!RECEITAS.includes(receita)) throw Invalido("O tipo de receita deve ser operacional ou não operacional");
  const estoque = String(d.estoque_destino || "produto");
  if (!ESTOQUES.includes(estoque)) throw Invalido("O estoque deve ir para produtos acabados ou para gado de corte");
  const [repetida] = await bd.q("SELECT id FROM culturas WHERE nome=? AND id<>?", [nome, cid]);          // nome é CITEXT: ignora maiúsculas
  if (repetida) throw Invalido(`Já existe um produto chamada '${nome}'`);
  return { nome, grupo: d.grupo, unidade, embalagem, qtd_por_embalagem: qtd, ativa: d.ativa === false ? 0 : 1, receita_tipo: receita, estoque_destino: estoque };
}

export async function listarCulturas(bd: Bd) {
  const uso = new Map<number, number>();
  for (const r of await bd.q<{ cultura_id: number; n: number }>(
    "SELECT cultura_id, COUNT(*) AS n FROM (" +
    " SELECT cultura_id FROM culturas_da_versao UNION ALL SELECT cultura_id FROM culturas_extras" +
    " UNION ALL SELECT cultura_id FROM fazendas WHERE cultura_id IS NOT NULL" +
    " UNION ALL SELECT cultura_id FROM precos WHERE preco<>0) u GROUP BY cultura_id")) uso.set(r.cultura_id, r.n);
  const lista = await bd.q("SELECT * FROM culturas ORDER BY ativa DESC, grupo, nome");
  return { grupos: GRUPOS, unidades: UNIDADES, culturas: lista.map((r) => ({ ...r, nome: String(r.nome), ativa: !!r.ativa, em_uso: (uso.get(r.id) || 0) > 0 })) };
}

export async function criarCultura(bd: Bd, d: CulturaIn, autor: string): Promise<number> {
  const v = await validar(bd, d);
  const [{ id }] = await bd.q<{ id: number }>(
    "INSERT INTO culturas(nome, grupo, unidade, embalagem, qtd_por_embalagem, ativa, receita_tipo, estoque_destino, criado_em) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id",
    [v.nome, v.grupo, v.unidade, v.embalagem, v.qtd_por_embalagem, v.ativa, v.receita_tipo, v.estoque_destino, agora()]);
  await auditar(bd, autor, null, "criar_cultura", v.nome);
  return id;
}

export async function atualizarCultura(bd: Bd, cid: number, d: CulturaIn, autor: string): Promise<void> {
  if (!(await bd.q("SELECT 1 FROM culturas WHERE id=?", [cid])).length) throw NaoEncontrado(`Produto ${cid} não existe`);
  const v = await validar(bd, d, cid);
  await bd.q("UPDATE culturas SET nome=?, grupo=?, unidade=?, embalagem=?, qtd_por_embalagem=?, ativa=?, receita_tipo=?, estoque_destino=? WHERE id=?",
    [v.nome, v.grupo, v.unidade, v.embalagem, v.qtd_por_embalagem, v.ativa, v.receita_tipo, v.estoque_destino, cid]);
  await auditar(bd, autor, null, "atualizar_cultura", v.nome);
}

export async function excluirCultura(bd: Bd, cid: number, autor: string): Promise<void> {
  const [c] = await bd.q<{ nome: string }>("SELECT nome FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado(`Produto ${cid} não existe`);
  const nome = String(c.nome);
  if ((await bd.q("SELECT 1 FROM culturas_da_versao WHERE cultura_id=? LIMIT 1", [cid])).length)
    throw Invalido(`'${nome}' foi adicionada em Áreas por produto em alguma versão. Desmarque 'Ativa' em vez de excluir.`);
  if ((await bd.q("SELECT 1 FROM culturas_extras WHERE cultura_id=? LIMIT 1", [cid])).length)
    throw Invalido(`'${nome}' foi adicionada em Produtividade ou Preços em alguma versão. Desmarque 'Ativa' em vez de excluir.`);
  if ((await bd.q("SELECT 1 FROM fazendas WHERE cultura_id=? LIMIT 1", [cid])).length || (await bd.q("SELECT 1 FROM precos WHERE cultura_id=? AND preco<>0 LIMIT 1", [cid])).length)
    throw Invalido(`'${nome}' é usada em Arrendamentos (pagamento ou preço). Desmarque 'Ativa' em vez de excluir.`);
  await bd.q("DELETE FROM precos WHERE cultura_id=?", [cid]);
  await bd.q("DELETE FROM precos_venda WHERE cultura_id=?", [cid]);
  await bd.q("DELETE FROM culturas WHERE id=?", [cid]);
  await auditar(bd, autor, null, "excluir_cultura", nome);
}
