// Produtividade pecuária (leite), por versão e ano. Porte de app/servicos/pecuaria.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { destinosDe } from "./comum.mts";

export const DIAS_NO_ANO = 365;
const CAMPOS: Record<string, [string, string, string]> = {
  animais: ["animais", "Total de animais em lactação", "uni"],
  kg_animal_dia: ["kg_animal_dia", "Total diária (por animal)", "kg/dia"],
};

export async function lerPecuaria(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const reg = new Map((await bd.q("SELECT * FROM pecuaria_leite WHERE versao_id=?", [vid])).map((r) => [r.ano, r]));
  const animais: Record<number, number> = {}, kg: Record<number, number> = {}, dia: Record<number, number> = {}, ano: Record<number, number> = {};
  for (const a of anos) { animais[a] = reg.get(a)?.animais ?? 0; kg[a] = reg.get(a)?.kg_animal_dia ?? 0; dia[a] = animais[a] * kg[a]; ano[a] = dia[a] * DIAS_NO_ANO; }
  const linhas = [
    { id: "animais", nome: CAMPOS.animais[1], unidade: "uni", entrada: true, valores: animais },
    { id: "kg_animal_dia", nome: CAMPOS.kg_animal_dia[1], unidade: "kg/dia", entrada: true, valores: kg },
    { id: "producao_dia", nome: "Total produção diária", unidade: "kg/dia", entrada: false, valores: dia },
    { id: "producao_ano", nome: "Total produção anual", unidade: "kg/ano", entrada: false, valores: ano },
  ];
  return { versao: v, anos, atividade: "Leite", dias_no_ano: DIAS_NO_ANO, linhas };
}

function coluna(campo: string): string {
  if (!(campo in CAMPOS)) throw Invalido("Esse campo é calculado pelo sistema; só dá para lançar os animais em lactação e a produtividade diária por animal");
  return CAMPOS[campo][0];
}
const gravar = (bd: Bd, vid: number, col: string, ano: number, valor: number) =>
  bd.q(`INSERT INTO pecuaria_leite(versao_id, ano, ${col}) VALUES(?,?,?) ON CONFLICT(versao_id, ano) DO UPDATE SET ${col}=excluded.${col}`, [vid, ano, valor]);

export async function salvarPecuaria(bd: Bd, vid: number, campo: string, ano: number, valor: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const col = coluna(campo);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("O valor não pode ser negativo");
  await gravar(bd, vid, col, ano, valor);
  await auditar(bd, autor, vid, "salvar_pecuaria", `${CAMPOS[campo][1]} ${ano}: ${valor}`);
}

async function copiar(bd: Bd, vid: number, col: string, anoOrigem: number, destinos: number[]) {
  const [r] = await bd.q(`SELECT ${col} AS v FROM pecuaria_leite WHERE versao_id=? AND ano=?`, [vid, anoOrigem]);
  for (const a of destinos) await gravar(bd, vid, col, a, r ? r.v : 0);
}
function destinosPec(v: any, anoOrigem: number): number[] {
  if (!anosDaVersao(v).includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const d = anosDaVersao(v).filter((a) => a > anoOrigem);
  if (!d.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  return d;
}

export async function replicarPecuaria(bd: Bd, vid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const col = coluna(campo);
  const destinos = destinosPec(v, anoOrigem);
  await copiar(bd, vid, col, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_pecuaria", `${CAMPOS[campo][1]}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarTodosPecuaria(bd: Bd, vid: number, anoOrigem: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const destinos = destinosPec(v, anoOrigem);
  for (const campo of Object.keys(CAMPOS)) await copiar(bd, vid, CAMPOS[campo][0], anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_todos_pecuaria", `de ${anoOrigem}`);
  return { campos: Object.keys(CAMPOS).length, anos_alterados: destinos.length };
}

export async function compararPecuaria(bd: Bd, aId: number, bId: number) {
  const la = await lerPecuaria(bd, aId), lb = await lerPecuaria(bd, bId);
  const anos = la.anos.filter((x) => lb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ib = new Map(lb.linhas.map((l) => [l.id, l]));
  const linhas = la.linhas.map((l) => ({ id: l.id, nome: l.nome, unidade: l.unidade, entrada: l.entrada,
    anos: Object.fromEntries(anos.map((a) => { const y = ib.get(l.id)!.valores[a], x = l.valores[a]; return [a, { a: x, b: y, delta: y - x, pct: x ? ((y - x) / x) * 100 : null }]; })) }));
  return { a: la.versao, b: lb.versao, anos, atividade: "Leite", linhas };
}
