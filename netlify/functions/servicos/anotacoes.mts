// Anotações nos números dos relatórios: marca-texto e um comentário por número. Porte de app/servicos/anotacoes.py
// (a visão geral com o caminho de cada número, "todas", entra junto com os demonstrativos).
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { auditar, obterVersao } from "./base.mts";

const CORES = ["", "amarelo", "verde", "vermelho"];
const LIMITE_COMENTARIO = 2000;

export async function listarAnotacoes(bd: Bd, vid: number, tela: string) {
  await obterVersao(bd, vid);
  const linhas = await bd.q("SELECT * FROM anotacoes WHERE versao_id=? AND tela=?", [vid, tela]);
  return Object.fromEntries(linhas.map((r) => [r.chave, { cor: r.cor, comentario: r.comentario, valor: r.valor, validado: !!r.validado, validado_em: r.validado_em, validado_por: r.validado_por, autor: r.autor, atualizado_em: r.atualizado_em }]));
}

export async function salvarAnotacao(bd: Bd, vid: number, tela: string, chave: string, cor: string, comentario: string, autor: string, valor: number | null = null) {
  await obterVersao(bd, vid);
  if (!String(tela ?? "").trim() || !String(chave ?? "").trim()) throw Invalido("Informe a tela e o número a anotar");
  if (!CORES.includes(cor)) throw Invalido("Cor inválida; use amarelo, verde ou vermelho");
  const texto = (comentario || "").trim();
  if (texto.length > LIMITE_COMENTARIO) throw Invalido(`O comentário pode ter até ${LIMITE_COMENTARIO} caracteres`);
  if (!cor && !texto) {                                                   // sem marca e sem comentário: some
    await bd.q("DELETE FROM anotacoes WHERE versao_id=? AND tela=? AND chave=?", [vid, tela, chave]);
    await auditar(bd, autor, vid, "limpar_anotacao", `${tela} ${chave}`);
    return {};
  }
  await bd.q("INSERT INTO anotacoes(versao_id, tela, chave, cor, comentario, valor, autor, atualizado_em) VALUES(?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(versao_id, tela, chave) DO UPDATE SET cor=excluded.cor, comentario=excluded.comentario, valor=excluded.valor, autor=excluded.autor, atualizado_em=excluded.atualizado_em",
    [vid, tela, chave, cor, texto, valor, autor, agora()]);
  await auditar(bd, autor, vid, "anotar", `${tela} ${chave} ${cor}`);
  return { cor, comentario: texto, valor };
}

// check de conferência da anotação (vale também em versão travada)
export async function validarAnotacao(bd: Bd, vid: number, tela: string, chave: string, validado: boolean, autor: string) {
  await obterVersao(bd, vid);
  if (!(await bd.q("SELECT 1 FROM anotacoes WHERE versao_id=? AND tela=? AND chave=?", [vid, tela, chave])).length) throw NaoEncontrado("Anotação não encontrada");
  const quando = validado ? agora() : null;
  await bd.q("UPDATE anotacoes SET validado=?, validado_em=?, validado_por=? WHERE versao_id=? AND tela=? AND chave=?", [validado ? 1 : 0, quando, validado ? autor : null, vid, tela, chave]);
  await auditar(bd, autor, vid, validado ? "validar_anotacao" : "desvalidar_anotacao", `${tela} ${chave}`);
  return { validado, validado_em: quando, validado_por: validado ? autor : null };
}
