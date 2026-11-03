// Anotações nos números dos relatórios: marca-texto e um comentário por número. Porte de app/servicos/anotacoes.py
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { auditar, obterVersao } from "./base.mts";
import { redondo } from "./comum.mts";
import * as balanco from "./balanco.mts";
import * as dre from "./dre.mts";
import { calcularResultado } from "./resultado.mts";

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

// ---------------------------------------------------------------- visão geral: todas as anotações de uma versão, com o caminho
const CASAS: Record<string, number> = { "R$ mil": 0, "%": 1, "R$/kg": 2, "R$/litro": 2, "R$/uni": 2 };                 // como os valores aparecem nas telas
const SECOES_RESULTADO: [string, string][] = [["safra", "Resultado da safra"], ["anual", "Resultado anual"], ["estoque", "Estoque"]];
interface Alvo { caminho: string[]; linha: string; ano: number; unidade: string; valor: number; modulo: string; cultura: string; }

// Por tela e chave: caminho, nome da linha, ano, unidade e o valor de hoje.
async function alvosDe(bd: Bd, vid: number): Promise<Record<string, Record<string, Alvo>>> {
  const alvos: Record<string, Record<string, Alvo>> = { resultado: {}, dre: {}, balanco: {} };
  const res: any = await calcularResultado(bd, vid);
  for (const [cid, nome, blocos] of [...res.culturas.map((c: any) => [c.id, c.nome, c]), ["todas", "Todos os produtos", res.consolidado]] as [any, string, any][]) {
    for (const [bloco, secao] of SECOES_RESULTADO)
      for (const l of blocos[bloco] ?? [])
        for (const [ano, v] of Object.entries(l.valores))
          alvos.resultado[`${cid}|${l.id}|${ano}`] = { caminho: ["Resultado por produto", nome, secao], linha: l.nome, ano: Number(ano), unidade: l.unidade, valor: v as number, modulo: "resultado", cultura: String(cid) };
  }
  const trilhaDe = (porCod: Map<string, any>, l: any) => { const trilha: string[] = []; let pai = l.pai; while (pai && porCod.has(pai)) { trilha.unshift(porCod.get(pai).nome); pai = porCod.get(pai).pai; } return trilha; };
  const d: any = await dre.ler(bd, vid);
  let porCod = new Map<string, any>(d.linhas.map((l: any) => [l.codigo, l]));
  for (const l of d.linhas) for (const [ano, v] of Object.entries(l.valores)) alvos.dre[`${l.codigo}|${ano}`] = { caminho: ["DRE", ...trilhaDe(porCod, l)], linha: l.nome, ano: Number(ano), unidade: l.unidade, valor: v as number, modulo: "dre", cultura: "" };
  const b: any = await balanco.ler(bd, vid);
  porCod = new Map<string, any>(b.linhas.map((l: any) => [l.codigo, l]));
  for (const l of b.linhas) for (const [ano, v] of Object.entries(l.valores)) alvos.balanco[`${l.codigo}|${ano}`] = { caminho: ["Balanço patrimonial", ...trilhaDe(porCod, l)], linha: l.nome, ano: Number(ano), unidade: "R$ mil", valor: v as number, modulo: "balanco", cultura: "" };
  return alvos;
}

export async function listarTodas(bd: Bd, vid: number): Promise<any[]> {
  await obterVersao(bd, vid);
  const alvos = await alvosDe(bd, vid);
  const nomesTela: Record<string, string> = { resultado: "Resultado por produto", dre: "DRE", balanco: "Balanço patrimonial" };
  const saida: any[] = [];
  for (const r of await bd.q('SELECT * FROM anotacoes WHERE versao_id=? ORDER BY atualizado_em DESC, tela COLLATE "C", chave COLLATE "C"', [vid])) {
    const a = alvos[r.tela]?.[r.chave];
    const item: any = { tela: r.tela, chave: r.chave, cor: r.cor, comentario: r.comentario, autor: r.autor, atualizado_em: r.atualizado_em, valor_anotado: r.valor, existe: a !== undefined,
      validado: !!r.validado, validado_em: r.validado_em, validado_por: r.validado_por };
    if (a) {
      const casas = CASAS[a.unidade] ?? 0;
      Object.assign(item, { caminho: a.caminho, linha: a.linha, ano: a.ano, unidade: a.unidade, valor_atual: a.valor, modulo: a.modulo, cultura: a.cultura, mudou: r.valor !== null && redondo(r.valor, casas) !== redondo(a.valor, casas) });
    } else Object.assign(item, { caminho: [nomesTela[r.tela] ?? r.tela], linha: "(esse número não existe mais na tela)", ano: null, unidade: "", valor_atual: null, modulo: r.tela, cultura: "", mudou: false });       // a linha ou a cultura saiu da tela
    saida.push(item);
  }
  return saida;
}
