// Novas captações de dívida (R$ mil, ano a ano) e o financiamento dos investimentos. Porte de app/servicos/captacoes.py.
// Cronograma de cada captação (ano da captação = A; o dinheiro entra no meio do ano): amortização = valor ÷ prazo (parcelas anuais iguais), começando em A + 1 + carência;
// juros = taxa × saldo médio do ano; curto prazo = a amortização do ano seguinte; longo prazo = o resto do saldo. Amortização e juros podem ser trocados à mão.
import type { Bd } from "../lib/bd.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { fmt0, fmtG } from "./comum.mts";
import * as inv from "./investimentos.mts";

type Serie = Record<number, number>;
export const TIPOS: Record<string, string> = { custeio: "Custeio", capital_giro: "Capital de giro" };
const CAMPOS_PREMISSA: Record<string, [string, string, number]> = { taxa: ["Taxa média de juros", "% ao ano", 100], prazo: ["Prazo de pagamento", "parcelas anuais", 50], carencia: ["Carência", "anos", 20] };

// ---------------------------------------------------------------- cadastro
const trunc = (x: any) => Math.trunc(Number(x || 0));
function validar(d: any, anos: number[]) {
  const nome = String(d.nome ?? "").trim();
  if (!nome) throw Invalido("Informe o nome da captação");
  const tipo = d.tipo;
  if (tipo === "investimento") throw Invalido("Investimento financiado nasce na tela Investimentos (digite o valor financiado ao lançar o investimento)");
  if (!(tipo in TIPOS)) throw Invalido("O tipo da captação deve ser Custeio ou Capital de giro");
  const ano = trunc(d.ano);
  if (!anos.includes(ano)) throw Invalido("O ano da captação precisa estar no horizonte da versão");
  const valor = Number(d.valor || 0);
  if (valor <= 0) throw Invalido("Informe o valor da captação (maior que zero, em R$)");
  const taxa = Number(d.taxa || 0);
  if (taxa < 0 || taxa > 100) throw Invalido("A taxa média de juros fica entre 0 e 100% ao ano");
  const prazo = trunc(d.prazo);
  if (prazo < 1 || prazo > 50) throw Invalido("O prazo é o número de parcelas anuais, de 1 a 50");
  const carencia = trunc(d.carencia);
  if (carencia < 0 || carencia > 20) throw Invalido("A carência fica entre 0 e 20 anos");
  return { nome, tipo: tipo as string, ano, valor, taxa, prazo, carencia };
}

export async function criar(bd: Bd, vid: number, d: any, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const c = validar(d, anosDaVersao(v));
  const [r] = await bd.q("INSERT INTO novas_captacoes(versao_id, nome, tipo, ano, valor, taxa, prazo, carencia) VALUES(?,?,?,?,?,?,?,?) RETURNING id", [vid, c.nome, c.tipo, c.ano, c.valor, c.taxa, c.prazo, c.carencia]);
  await auditar(bd, autor, vid, "criar_captacao", `${c.nome}: R$ ${fmt0(c.valor)} mil em ${c.ano}`.replace(/,/g, "."));
  return r.id;
}

async function obter(bd: Bd, vid: number, cid: number) {
  const [r] = await bd.q("SELECT * FROM novas_captacoes WHERE id=? AND versao_id=?", [cid, vid]);
  if (!r) throw NaoEncontrado(`Captação ${cid} não existe nesta versão`);
  return r;
}

export async function editar(bd: Bd, vid: number, cid: number, d: any, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  await obter(bd, vid, cid);
  const c = validar(d, anosDaVersao(v));
  await bd.q("UPDATE novas_captacoes SET nome=?, tipo=?, ano=?, valor=?, taxa=?, prazo=?, carencia=? WHERE id=?", [c.nome, c.tipo, c.ano, c.valor, c.taxa, c.prazo, c.carencia, cid]);
  await auditar(bd, autor, vid, "editar_captacao", c.nome);
}

export async function excluir(bd: Bd, vid: number, cid: number, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  const c = await obter(bd, vid, cid);
  await bd.q("DELETE FROM captacao_valores WHERE versao_id=? AND chave=?", [vid, `cap-${cid}`]);
  await bd.q("DELETE FROM novas_captacoes WHERE id=?", [cid]);
  await auditar(bd, autor, vid, "excluir_captacao", c.nome);
}

// ---------------------------------------------------------------- premissas do financiamento dos investimentos
async function premissasDe(bd: Bd, vid: number): Promise<Record<string, Serie>> {
  const d: Record<string, Serie> = Object.fromEntries(Object.keys(CAMPOS_PREMISSA).map((c) => [c, {}]));
  for (const r of await bd.q("SELECT campo, ano, valor FROM financiamento_premissas WHERE versao_id=?", [vid])) (d[r.campo] ??= {})[r.ano] = r.valor;
  return d;
}

const UPSERT_PREM = "INSERT INTO financiamento_premissas(versao_id, campo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarPremissa(bd: Bd, vid: number, campo: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  if (!(campo in CAMPOS_PREMISSA)) throw Invalido("Campo inválido");
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  const [rotulo, , maximo] = CAMPOS_PREMISSA[campo];
  if (valor < 0 || valor > maximo) throw Invalido(`${rotulo} fica entre 0 e ${fmtG(maximo)}`);
  if ((campo === "prazo" || campo === "carencia") && valor !== Math.trunc(valor)) throw Invalido(`${rotulo} é um número inteiro de anos`);
  await bd.q(UPSERT_PREM, [vid, campo, ano, valor]);
  await auditar(bd, autor, vid, "salvar_premissa_financiamento", `${rotulo} ${ano}: ${valor}`);
}

export async function replicarPremissa(bd: Bd, vid: number, campo: string, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  if (!(campo in CAMPOS_PREMISSA)) throw Invalido("Campo inválido");
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const destinos = anos.filter((a) => a > anoOrigem);
  if (!destinos.length) throw Invalido(`${anoOrigem} é o último ano do horizonte; não há anos seguintes para replicar`);
  const [r] = await bd.q("SELECT valor FROM financiamento_premissas WHERE versao_id=? AND campo=? AND ano=?", [vid, campo, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT_PREM, [vid, campo, a, r ? r.valor : 0]);
  await auditar(bd, autor, vid, "replicar_premissa_financiamento", `${CAMPOS_PREMISSA[campo][0]}: de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

// ---------------------------------------------------------------- alterações à mão
async function alteracoes(bd: Bd, vid: number): Promise<Record<string, Record<string, Serie>>> {
  const d: Record<string, Record<string, Serie>> = {};
  for (const r of await bd.q("SELECT chave, campo, ano, valor FROM captacao_valores WHERE versao_id=?", [vid])) ((d[r.chave] ??= {})[r.campo] ??= {})[r.ano] = r.valor;
  return d;
}

async function chaveValida(bd: Bd, vid: number, chave: string) {
  if (chave.startsWith("cap-") && /^\d+$/.test(chave.slice(4))) { await obter(bd, vid, Number(chave.slice(4))); return; }
  const partes = chave.split("-");
  if (partes.length === 3 && partes[0] === "inv" && /^\d+$/.test(partes[1]) && /^\d+$/.test(partes[2]) && (await bd.q("SELECT 1 FROM investimento_tipos WHERE id=?", [Number(partes[1])])).length) return;
  throw Invalido("Captação inexistente");
}

export async function salvarValor(bd: Bd, vid: number, chave: string, campo: string, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  await chaveValida(bd, vid, chave);
  if (campo !== "amort" && campo !== "juros") throw Invalido("Só a amortização e os juros podem ser alterados");
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  if (valor < 0) throw Invalido("O valor não pode ser negativo");
  await bd.q("INSERT INTO captacao_valores(versao_id, chave, campo, ano, valor) VALUES(?,?,?,?,?) ON CONFLICT(versao_id, chave, campo, ano) DO UPDATE SET valor=excluded.valor", [vid, chave, campo, ano, valor]);
  await auditar(bd, autor, vid, "salvar_cronograma_captacao", `${chave} · ${campo} ${ano}: ${valor}`);
}

export async function voltarAoCalculado(bd: Bd, vid: number, chave: string, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  await bd.q("DELETE FROM captacao_valores WHERE versao_id=? AND chave=?", [vid, chave]);
  await auditar(bd, autor, vid, "voltar_cronograma_captacao_ao_calculado", chave);
}

// ---------------------------------------------------------------- cálculo
// Cronograma de uma captação para os anos da versão (e um ano a mais, para o curto prazo do último ano).
function cronograma(c: any, anos: number[], alt: Record<string, Serie>) {
  const ext = [...anos, anos[anos.length - 1] + 1];
  const primeira = c.ano + 1 + c.carencia;
  const calcAmort: Serie = Object.fromEntries(ext.map((y) => [y, primeira <= y && y < primeira + c.prazo ? c.valor / c.prazo : 0]));
  const saldoIni: Serie = {}, saldoFim: Serie = {}, amort: Serie = {}, captado: Serie = {}, jurosCalc: Serie = {}, amortCalc: Serie = {};
  let saldo = 0;
  for (const y of ext) {
    if (y < c.ano) { saldoIni[y] = saldoFim[y] = amort[y] = captado[y] = jurosCalc[y] = amortCalc[y] = 0; continue; }
    saldoIni[y] = saldo;
    captado[y] = y === c.ano ? c.valor : 0;
    const disponivel = saldo + captado[y];
    amortCalc[y] = Math.min(calcAmort[y], disponivel);
    amort[y] = Math.min(alt.amort?.[y] ?? amortCalc[y], disponivel);
    saldo = disponivel - amort[y];
    saldoFim[y] = saldo;
    jurosCalc[y] = ((c.taxa / 100) * (saldoIni[y] + saldoFim[y])) / 2;
  }
  const sub = (s: Serie): Serie => Object.fromEntries(anos.map((y) => [y, s[y]]));
  const juros: Serie = Object.fromEntries(anos.map((y) => [y, alt.juros?.[y] ?? jurosCalc[y]]));
  const curto: Serie = Object.fromEntries(anos.map((y) => [y, Math.min(amort[y + 1], saldoFim[y])]));
  const longo: Serie = Object.fromEntries(anos.map((y) => [y, saldoFim[y] - curto[y]]));
  return { captado: sub(captado), amort: sub(amort), amort_calc: sub(amortCalc), saldo: sub(saldoFim), curto, longo, juros, juros_calc: sub(jurosCalc) };
}

// Todas as captações da versão (cadastradas e as dos investimentos financiados) com o cronograma ano a ano.
export async function calcular(bd: Bd, vid: number, anos: number[]): Promise<any[]> {
  const alt = await alteracoes(bd, vid);
  const saida: any[] = [];
  for (const r of await bd.q("SELECT * FROM novas_captacoes WHERE versao_id=? ORDER BY ano, id", [vid])) {
    const c: any = { chave: `cap-${r.id}`, id: r.id, origem: "cadastro", nome: r.nome, tipo: r.tipo, tipo_nome: TIPOS[r.tipo], grupo: "giro", ano: r.ano, valor: r.valor, taxa: r.taxa, prazo: r.prazo, carencia: r.carencia, avisos: [] };
    Object.assign(c, cronograma(c, anos, alt[c.chave] ?? {}));
    saida.push(c);
  }
  const prem = await premissasDe(bd, vid);
  const val = await inv.valoresDe(bd, vid);
  for (const t of await inv.cadastro(bd, vid)) {
    if (!t.ativo || t.natureza !== "investimento") continue;
    const cInv = inv.calcularTipo(t, val[t.id] ?? {}, anos);
    for (const a of anos) {
      const valor = cInv.financiado[a];
      if (valor <= 1e-9) continue;
      const taxa = prem.taxa[a] ?? 0;
      let prazo = Math.trunc(prem.prazo[a] ?? 0);
      const carencia = Math.trunc(prem.carencia[a] ?? 0);
      const avisos: string[] = [];
      if (prazo < 1) { avisos.push(`Sem prazo de pagamento na premissa de financiamento de ${a}: considerei 1 parcela.`); prazo = 1; }
      const c: any = { chave: `inv-${t.id}-${a}`, id: null, origem: "investimento", nome: `${t.nome} · financiamento ${a}`, tipo: "investimento", tipo_nome: "Investimento", grupo: "invest", ano: a, valor, taxa, prazo, carencia,
        tipo_investimento_id: t.id, percentual: cInv.investido[a] ? (valor / cInv.investido[a]) * 100 : null, avisos };
      Object.assign(c, cronograma(c, anos, alt[c.chave] ?? {}));
      saida.push(c);
    }
  }
  return saida;
}

const CHAVES_SOMA = ["captado", "amort", "saldo", "curto", "longo", "juros"];
export function somar(captacoes: any[], anos: number[], grupo: string | null = null): Record<string, Serie> {
  const out: Record<string, Serie> = Object.fromEntries(CHAVES_SOMA.map((k) => [k, Object.fromEntries(anos.map((a) => [a, 0]))]));
  for (const c of captacoes) {
    if (grupo && c.grupo !== grupo) continue;
    for (const k of CHAVES_SOMA) for (const a of anos) out[k][a] += c[k][a];
  }
  return out;
}

export async function ler(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const caps = await calcular(bd, vid, anos);
  const alt = await alteracoes(bd, vid);
  const L = (id: string, nome: string, valores: Serie, calc: Serie | null = null, _chave: string | null = null, campo: string | null = null, mao: Serie | null = null) => ({
    id, nome, valores, calculado: calc, campo, editavel: campo !== null, alterado: campo ? Object.fromEntries(anos.map((a) => [a, a in (mao ?? {})])) : null });
  const tranches = caps.map((c) => {
    const mao = alt[c.chave] ?? {};
    const base: any = {};
    for (const k of ["chave", "id", "origem", "nome", "tipo", "tipo_nome", "grupo", "ano", "valor", "taxa", "prazo", "carencia", "avisos"]) base[k] = c[k];
    return { ...base, percentual: c.percentual ?? null, linhas: [
      L("captado", "Captado no ano", c.captado), L("amort", "Amortização do principal", c.amort, c.amort_calc, c.chave, "amort", mao.amort),
      L("saldo", "Saldo da dívida em 31/12", c.saldo), L("curto", "  curto prazo (vence no ano seguinte)", c.curto), L("longo", "  longo prazo", c.longo),
      L("juros", "Juros do ano", c.juros, c.juros_calc, c.chave, "juros", mao.juros)] };
  });
  const prem = await premissasDe(bd, vid);
  return { versao: v, anos, tipos: Object.entries(TIPOS).map(([k, n]) => ({ id: k, nome: n })), captacoes: tranches,
    premissas: Object.entries(CAMPOS_PREMISSA).map(([k, [n, u]]) => ({ campo: k, nome: n, unidade: u, valores: Object.fromEntries(anos.map((a) => [a, prem[k][a] ?? 0])) })),
    resumo: { giro: somar(caps, anos, "giro"), invest: somar(caps, anos, "invest"), total: somar(caps, anos) } };
}

export async function comparar(bd: Bd, aId: number, bId: number) {
  const la = await ler(bd, aId), lb = await ler(bd, bId);
  const anos = la.anos.filter((a) => lb.anos.includes(a)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const linhas = ([["captado", "Captado no ano", "captado"], ["amort", "Amortização do principal", "amort"], ["saldo", "Saldo da dívida nova em 31/12", "saldo"], ["juros", "Juros do ano", "juros"]] as [string, string, string][]).map(([id, nome, k]) => {
    const sa = la.resumo.total[k], sb = lb.resumo.total[k];
    return { id, nome, anos: Object.fromEntries(anos.map((a) => [a, { a: sa[a], b: sb[a], delta: sb[a] - sa[a], pct: sa[a] ? ((sb[a] - sa[a]) / Math.abs(sa[a])) * 100 : null }])) };
  });
  return { a: la.versao, b: lb.versao, anos, linhas };
}
