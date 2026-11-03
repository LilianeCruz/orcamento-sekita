// Cadastro de grupos de custos: cada grupo é classificado como custo direto ou indireto. Porte de app/servicos/grupos_custo.py.
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { auditar } from "./base.mts";

export const CLASSIFICACOES: Record<string, string> = { direto: "Custo direto", indireto: "Custo indireto" };
export interface GrupoIn { nome: string; classificacao: string; ativa?: boolean; }

async function validar(bd: Bd, d: GrupoIn, gid = 0) {
  const nome = String(d.nome ?? "").split(/\s+/).filter(Boolean).join(" ");
  if (!nome) throw Invalido("Informe o nome do grupo");
  if (!(d.classificacao in CLASSIFICACOES)) throw Invalido("Classifique o grupo como custo direto ou indireto");
  if ((await bd.q("SELECT 1 FROM grupos_custo WHERE nome=? AND id<>?", [nome, gid])).length) throw Invalido(`Já existe um grupo chamado '${nome}'`);
  return { nome, classificacao: d.classificacao, ativa: d.ativa === false ? 0 : 1 };
}

export async function listarGrupos(bd: Bd) {
  const l = await bd.q("SELECT * FROM grupos_custo ORDER BY ativa DESC, classificacao, nome");
  return { classificacoes: CLASSIFICACOES, grupos: l.map((r) => ({ ...r, nome: String(r.nome), ativa: !!r.ativa })) };
}

export async function criarGrupo(bd: Bd, d: GrupoIn, autor: string): Promise<number> {
  const v = await validar(bd, d);
  const [{ id }] = await bd.q<{ id: number }>("INSERT INTO grupos_custo(nome, classificacao, ativa, criado_em) VALUES(?,?,?,?) RETURNING id", [v.nome, v.classificacao, v.ativa, agora()]);
  await auditar(bd, autor, null, "criar_grupo_custo", `${v.nome} (${v.classificacao})`);
  return id;
}

export async function atualizarGrupo(bd: Bd, gid: number, d: GrupoIn, autor: string): Promise<void> {
  if (!(await bd.q("SELECT 1 FROM grupos_custo WHERE id=?", [gid])).length) throw NaoEncontrado(`Grupo ${gid} não existe`);
  const v = await validar(bd, d, gid);
  await bd.q("UPDATE grupos_custo SET nome=?, classificacao=?, ativa=? WHERE id=?", [v.nome, v.classificacao, v.ativa, gid]);
  await auditar(bd, autor, null, "atualizar_grupo_custo", `${v.nome} (${v.classificacao})`);
}

export async function excluirGrupo(bd: Bd, gid: number, autor: string): Promise<void> {
  const [g] = await bd.q("SELECT nome FROM grupos_custo WHERE id=?", [gid]);
  if (!g) throw NaoEncontrado(`Grupo ${gid} não existe`);
  if ((await bd.q("SELECT 1 FROM custos_grupos_cultura WHERE grupo_id=? LIMIT 1", [gid])).length) throw Invalido(`'${g.nome}' é usado em Custos variáveis. Desmarque 'ativo' em vez de excluir.`);
  await bd.q("DELETE FROM grupos_custo WHERE id=?", [gid]);
  await auditar(bd, autor, null, "excluir_grupo_custo", String(g.nome));
}
