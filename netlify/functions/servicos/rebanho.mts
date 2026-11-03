// Movimentação do rebanho (gado de corte): saldo inicial, compras, nascimentos, mortes e vendas, em cabeças por ano. Porte de app/servicos/rebanho.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { numerosRebanho } from "./resultado.mts";

export const CAMPOS: Record<string, string> = { saldo_ini: "Saldo inicial", valor_ini: "Valor do saldo inicial", compras: "Compras", nascimentos: "Nascimentos", mortes: "Mortes previstas", vendas: "Vendas previstas" };
const SO_PRIMEIRO_ANO = ["saldo_ini", "valor_ini"];

export async function lerRebanho(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const nums = await numerosRebanho(bd, vid);
  const dig: Record<number, Record<string, Record<number, number>>> = {};
  for (const r of await bd.q("SELECT cultura_id, campo, ano, valor FROM rebanho_valores WHERE versao_id=?", [vid])) ((dig[r.cultura_id] ??= {})[r.campo] ??= {})[r.ano] = r.valor;
  const nomes = new Map((await bd.q("SELECT id, nome, unidade FROM culturas")).map((r) => [r.id as number, { nome: String(r.nome), unidade: r.unidade as string }]));
  const produtos: any[] = [];
  for (const [cidTxt, n] of Object.entries(nums)) {
    const cid = Number(cidTxt), t = dig[cid] ?? {};
    const Lh = (id: string, nome: string, unidade: string, valores: any, editavel?: (a: number) => boolean, estilo = "") =>
      ({ id, nome, unidade, valores, estilo, editavel: Object.fromEntries(anos.map((a) => [a, !!(editavel && editavel(a))])) });
    const tudo = () => true, primeiro = (a: number) => a === anos[0];
    const digitado = (campo: string) => Object.fromEntries(anos.map((a) => [a, t[campo]?.[a] ?? 0]));
    const un = nomes.get(cid)!.unidade;
    produtos.push({ id: cid, nome: nomes.get(cid)!.nome, unidade: un, linhas: [
      Lh("saldo_ini", "Saldo inicial", un, n.reb_ini, primeiro), Lh("valor_ini", "Valor do saldo inicial", "R$", n.reb_valor_ini, primeiro),
      Lh("compras", "(+) Compras", un, digitado("compras"), tudo), Lh("nascimentos", "(+) Nascimentos", un, digitado("nascimentos"), tudo),
      Lh("mortes", "(–) Mortes previstas", un, digitado("mortes"), tudo), Lh("vendas", "(–) Vendas previstas", un, digitado("vendas"), tudo),
      Lh("saldo_fim", "Saldo final", un, n.reb_fim, undefined, "total"),
      Lh("custos", "Custos do ano (custos variáveis, inclui a compra dos animais)", "R$", n.reb_custos), Lh("custo_medio", "Custo médio por cabeça", "R$", n.reb_custo_medio),
      Lh("estoque", "Valor do estoque final", "R$", n.estoque_valor, undefined, "total")] });
  }
  return { versao: v, anos, produtos };
}

async function produto(bd: Bd, cid: number) {
  const [c] = await bd.q("SELECT * FROM culturas WHERE id=?", [cid]);
  if (!c) throw NaoEncontrado("Produto não encontrado");
  if (c.estoque_destino !== "gado") throw Invalido(`${c.nome} não tem o estoque em gado de corte (mude em Produtos › Estoque em)`);
  return c;
}
const UPSERT = "INSERT INTO rebanho_valores(versao_id, cultura_id, campo, ano, valor) VALUES(?,?,?,?,?) ON CONFLICT(versao_id, cultura_id, campo, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarRebanho(bd: Bd, vid: number, cid: number, campo: string, ano: number, valor: number, autor: string) {
  const v = await versaoEditavel(bd, vid);
  const c = await produto(bd, cid);
  if (!(campo in CAMPOS)) throw Invalido("Campo desconhecido");
  const anos = anosDaVersao(v);
  if (!anos.includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (SO_PRIMEIRO_ANO.includes(campo) && ano !== anos[0]) throw Invalido(`${CAMPOS[campo]} só se digita no primeiro ano; nos demais vem do saldo final do ano anterior`);
  if (valor < 0) throw Invalido("O valor não pode ser negativo");
  await bd.q(UPSERT, [vid, cid, campo, ano, valor]);
  await auditar(bd, autor, vid, "salvar_rebanho", `${c.nome} · ${CAMPOS[campo]} ${ano}: ${valor}`);
}

export async function replicarRebanho(bd: Bd, vid: number, cid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const c = await produto(bd, cid);
  if (!(campo in CAMPOS) || SO_PRIMEIRO_ANO.includes(campo)) throw Invalido("Só compras, nascimentos, mortes e vendas se replicam");
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const destinos = anos.filter((a) => a > anoOrigem);
  if (!destinos.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  const [r] = await bd.q("SELECT valor FROM rebanho_valores WHERE versao_id=? AND cultura_id=? AND campo=? AND ano=?", [vid, cid, campo, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, cid, campo, a, r ? r.valor : 0]);
  await auditar(bd, autor, vid, "replicar_rebanho", `${c.nome} · ${CAMPOS[campo]}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}
