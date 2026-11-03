import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { NaoEncontrado, Travada } from "../lib/erros.mts";

export const HORIZONTE = 5;        // horizonte padrão (anos a partir do ano base)
export const HORIZONTE_MAX = 30;

export interface Versao {
  id: number; ano_base: number; tipo: string; nome: string; status: string; horizonte: number;
  data_inicio: string | null; data_fim: string | null; divida_importacao_id: number | null; origem_id: number | null;
  criado_em: string; aprovado_em: string | null; autor: string;
}

export const anosDaVersao = (v: Pick<Versao, "ano_base" | "horizonte">): number[] => Array.from({ length: v.horizonte }, (_, i) => v.ano_base + i);

export async function auditar(bd: Bd, autor: string, versaoId: number | null, acao: string, detalhe = ""): Promise<void> {
  await bd.q("INSERT INTO auditoria(quando, autor, versao_id, acao, detalhe) VALUES(?,?,?,?,?)", [agora(), autor, versaoId, acao, detalhe]);
}

export async function obterVersao(bd: Bd, vid: number): Promise<Versao> {
  const [v] = await bd.q<Versao>("SELECT * FROM versoes WHERE id=?", [vid]);
  if (!v) throw NaoEncontrado(`Versão ${vid} não existe`);
  return v;
}

export async function versaoEditavel(bd: Bd, vid: number): Promise<Versao> {
  const v = await obterVersao(bd, vid);
  if (v.status === "aprovado") throw Travada(`A versão '${v.nome}' está aprovada e travada. Crie um Reprojetado para ajustar.`);
  return v;
}
