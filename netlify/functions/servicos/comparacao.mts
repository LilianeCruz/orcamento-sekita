// Comparação de orçamentos em um ano: premissas e demonstrativos lado a lado, só com o que varia, e o impacto de cada grupo de premissas.
// Porte de app/servicos/comparacao.py. O impacto é calculado de verdade: para cada grupo de premissas que difere, cria-se uma cópia temporária do orçamento base,
// troca-se só aquele grupo pelo do outro orçamento, recalcula-se tudo e mede-se o que mudou nos resultados. A cópia temporária é apagada ao final.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, obterVersao } from "./base.mts";
import * as balanco from "./balanco.mts";
import { CAMPOS as CAMPOS_CG } from "./capital-giro.mts";
import * as demo from "./demonstrativos.mts";
import * as dre from "./dre.mts";
import { LINHAS_BASE } from "./dre-padrao.mts";
import * as fluxo from "./fluxo.mts";
import { CAMPOS as CAMPOS_PAT, SALDOS_ALTERAVEIS } from "./patrimonio.mts";
import { CAMPOS as CAMPOS_TR } from "./transportadora.mts";
import { copiarVersao } from "./versoes.mts";

const TOL = 1e-9;

// ---------------------------------------------------------------- o que se pode comparar
export const ITENS: any[] = [
  { id: "prem_areas", grupo: "Premissas", nome: "Áreas por produto" }, { id: "prem_produtividade", grupo: "Premissas", nome: "Produtividade" },
  { id: "prem_precos", grupo: "Premissas", nome: "Preços" }, { id: "prem_custos", grupo: "Premissas", nome: "Custos variáveis" },
  { id: "prem_produtos", grupo: "Premissas", nome: "Premissas de produtos" }, { id: "prem_rebanho", grupo: "Premissas", nome: "Movimentação do rebanho" },
  { id: "prem_investimento", grupo: "Premissas", nome: "Premissas de investimento" }, { id: "prem_dre", grupo: "Premissas", nome: "Premissas da DRE" }, { id: "prem_transportadora", grupo: "Premissas", nome: "Premissas de transportadora" },
  { id: "prem_balanco", grupo: "Premissas", nome: "Premissas de balanço" }, { id: "prem_dividendos", grupo: "Premissas", nome: "Premissas de dividendos" },
  { id: "prem_dividas", grupo: "Premissas", nome: "Premissas de dívidas" },
  { id: "dre", grupo: "Demonstrativos", nome: "DRE" }, { id: "balanco", grupo: "Demonstrativos", nome: "Balanço" },
  { id: "fluxo", grupo: "Demonstrativos", nome: "Fluxo de caixa indireto", completo: true }, { id: "indicadores", grupo: "Demonstrativos", nome: "Indicadores" },
];

// grupos de premissas trocados um de cada vez no cálculo de impacto: nome e tabelas (todas têm versao_id)
const GRUPOS: [string, string[]][] = [
  ["Áreas por produto", ["areas_cultura", "culturas_da_versao"]],
  ["Produtividade e rebanho", ["produtividade", "culturas_extras", "pecuaria_leite", "rebanho_valores"]],
  ["Preços de venda", ["precos_venda"]],
  ["Custos variáveis", ["custos_cultura", "custos_grupos_cultura", "custos_culturas"]],
  ["Premissas de produtos", ["prem_valores", "prem_itens", "prem_culturas"]],
  ["Investimentos", ["investimento_valores", "investimento_excluidos", "depreciacao_valores"]],
  ["Premissas da DRE", ["dre_padrao", "premissas_dem_valores", "premissas_dem_itens"]],
  ["Transportadora", ["transportadora_valores"]],
  ["Premissas de balanço", ["capital_giro", "capital_giro_origem"]],
  ["Dividendos", ["patrimonio_valores"]],
  ["Dívidas e captações", ["novas_captacoes", "captacao_valores", "financiamento_premissas", "giro_auto_premissas"]],
];

const KPIS: [string, string, string, string[]][] = [["receita_liquida", "Receita líquida", "dre", ["DS018"]], ["ebitda", "EBITDA", "dre", ["DS044"]], ["lucro", "Lucro líquido", "dre", ["DS062"]],
  ["caixa", "Caixa e aplicações (31/12)", "bp", ["SA07"]], ["divida", "Dívida bancária total", "bp", ["SP08", "SPAUTO", "SP12", "SP17", "SP18"]], ["pl", "Patrimônio líquido", "bp", ["SP22"]]];

const v_ = (serie: any, ano: number): number | null => (serie === null || serie === undefined ? null : serie[ano] ?? null);

// ---------------------------------------------------------------- resultados (indicadores-chave)
// Resultados-chave do ano, em R$ mil.
export async function metricas(bd: Bd, vid: number, ano: number): Promise<Record<string, number>> {
  const fl = await fluxo.projetar(bd, vid);
  const d = Object.fromEntries(((await dre.ler(bd, vid, fl.juros_auto)) as any).linhas.map((l: any) => [l.codigo, l.valores]));
  const bp = Object.fromEntries(((await balanco.ler(bd, vid, fl)) as any).linhas.map((l: any) => [l.codigo, l.valores]));
  const out: Record<string, number> = {};
  for (const [id, , fonte, codigos] of KPIS) { const base: any = fonte === "dre" ? d : bp; out[id] = codigos.reduce((t, c) => t + (v_(base[c], ano) || 0), 0); }
  return out;
}

// ---------------------------------------------------------------- tabelas lado a lado (premissas e demonstrativos)
interface Linha { nome: string; valor: number | null; unidade: string; grupo: string; nivel: number; casas?: number; }

async function linhasDe(bd: Bd, item: string, vid: number, ano: number): Promise<Linha[]> {
  const c = new Map((await bd.q("SELECT id, nome, unidade FROM culturas")).map((r) => [r.id as number, { nome: String(r.nome), unidade: r.unidade as string }]));
  const out: Linha[] = [];
  const add = (nome: string, valor: number | null, un: string, grupo = "", nivel = 0) => out.push({ nome, valor, unidade: un, grupo, nivel });
  const q = (sql: string) => bd.q(sql, [vid, ano]);
  if (item === "prem_areas") for (const r of await q("SELECT cultura_id, area_ha FROM areas_cultura WHERE versao_id=? AND ano=?")) add(c.get(r.cultura_id)!.nome, r.area_ha, "ha");
  else if (item === "prem_produtividade") {
    for (const r of await q("SELECT cultura_id, valor FROM produtividade WHERE versao_id=? AND ano=?")) add(c.get(r.cultura_id)!.nome, r.valor, `${c.get(r.cultura_id)!.unidade}/ha`);
    for (const r of await q("SELECT animais, kg_animal_dia FROM pecuaria_leite WHERE versao_id=? AND ano=?")) { add("Leite · animais em lactação", r.animais, "uni"); add("Leite · produção diária por animal", r.kg_animal_dia, "kg/dia"); }
  } else if (item === "prem_precos") for (const r of await q("SELECT cultura_id, preco FROM precos_venda WHERE versao_id=? AND ano=?")) add(c.get(r.cultura_id)!.nome, r.preco, `R$/${c.get(r.cultura_id)!.unidade}`);
  else if (item === "prem_custos") for (const r of await q("SELECT cc.cultura_id, g.nome AS grupo, cc.valor FROM custos_cultura cc JOIN grupos_custo g ON g.id=cc.grupo_id WHERE cc.versao_id=? AND cc.ano=?")) add(`${c.get(r.cultura_id)!.nome} · ${r.grupo}`, r.valor, "R$");
  else if (item === "prem_produtos") {
    const rot: Record<string, [string, string]> = { descarte: ["% descarte", "%"], deducao_receita: ["% dedução de receita", "%"], estoque: ["quantidade estocada", "qtd"], sementes: ["sementes salvas", "qtd"] };
    for (const r of await q("SELECT cultura_id, tipo, valor FROM prem_valores WHERE versao_id=? AND ano=?")) { const [n, u] = rot[r.tipo] ?? [r.tipo, ""]; add(`${c.get(r.cultura_id)!.nome} · ${n}`, r.valor, u); }
  } else if (item === "prem_rebanho") {
    const rot: Record<string, string> = { saldo_ini: "saldo inicial", valor_ini: "valor do saldo inicial", compras: "compras", nascimentos: "nascimentos", mortes: "mortes", vendas: "vendas" };
    for (const r of await q("SELECT cultura_id, campo, valor FROM rebanho_valores WHERE versao_id=? AND ano=?")) add(`${c.get(r.cultura_id)!.nome} · ${rot[r.campo] ?? r.campo}`, r.valor, r.campo === "valor_ini" ? "R$" : "cab");
  } else if (item === "prem_investimento") {
    const rot: Record<string, string> = { novo: "novo orçamento", a_carregar: "saldo a carregar", saldo_ini: "saldo inicial", financiado: "valor financiado" };
    for (const r of await q("SELECT t.nome, v.campo, v.valor FROM investimento_valores v JOIN investimento_tipos t ON t.id=v.tipo_id WHERE v.versao_id=? AND v.ano=?")) add(`${r.nome} · ${rot[r.campo] ?? r.campo}`, r.valor, "R$ mil");
  } else if (item === "prem_dre") {
    const nomes = new Map((await bd.q("SELECT codigo, nome FROM dre_linhas")).map((r) => [r.codigo as string, r.nome as string]));
    for (const r of await q("SELECT codigo, valor FROM dre_padrao WHERE versao_id=? AND ano=?")) add(nomes.get(r.codigo) ?? r.codigo, r.valor, LINHAS_BASE[r.codigo] ? "%" : "R$ mil");
    for (const r of await q("SELECT p.nome, p.tipo, v.valor FROM premissas_dem_valores v JOIN premissas_dem p ON p.id=v.premissa_id WHERE v.versao_id=? AND v.ano=? AND p.demonstrativo='dre'")) add(r.nome, r.valor, r.tipo === "percentual" ? "%" : "R$ mil");
  } else if (item === "prem_transportadora") {
    for (const r of await q("SELECT campo, valor FROM transportadora_valores WHERE versao_id=? AND ano=?")) { const [n, u, g] = (CAMPOS_TR as any)[r.campo] ?? [r.campo, "", ""]; add(n, r.valor, u, g); }
  } else if (item === "prem_balanco") {
    for (const r of await q("SELECT campo, valor FROM capital_giro WHERE versao_id=? AND ano=?")) { const [n, u] = CAMPOS_CG[r.campo] ?? [r.campo, "", ""]; add(n, r.valor, u); }
  } else if (item === "prem_dividendos") {
    for (const r of await q("SELECT campo, valor FROM patrimonio_valores WHERE versao_id=? AND ano=?")) add(r.campo in CAMPOS_PAT ? CAMPOS_PAT[r.campo][0] : SALDOS_ALTERAVEIS[r.campo] ?? r.campo, r.valor, r.campo === "dist_pct" ? "%" : "R$ mil");
  } else if (item === "prem_dividas") {
    for (const r of await q("SELECT nome, tipo, valor FROM novas_captacoes WHERE versao_id=? AND ano=?")) add(`Captação · ${r.nome}`, r.valor, "R$ mil");
    const rot: Record<string, string> = { taxa: "taxa de juros (% a.a.)", prazo: "prazo (parcelas)", carencia: "carência (anos)" };
    for (const r of await q("SELECT campo, valor FROM financiamento_premissas WHERE versao_id=? AND ano=?")) add(`Financiamento dos investimentos · ${rot[r.campo] ?? r.campo}`, r.valor, "");
    for (const r of await q("SELECT campo, valor FROM giro_auto_premissas WHERE versao_id=? AND ano=? AND campo='taxa'")) add("Necessidade de capital de giro · taxa de juros (% a.a.)", r.valor, "");
  } else if (["dre", "balanco", "fluxo", "indicadores"].includes(item)) out.push(...(await demonstrativo(bd, item, vid, ano)));
  return out;
}

async function demonstrativo(bd: Bd, item: string, vid: number, ano: number): Promise<Linha[]> {
  const out: Linha[] = [];
  if (item === "dre") for (const l of ((await dre.ler(bd, vid)) as any).linhas) out.push({ nome: l.nome, valor: v_(l.valores, ano), unidade: l.unidade, grupo: "", nivel: l.nivel });
  else if (item === "balanco") { for (const l of ((await balanco.ler(bd, vid)) as any).linhas) if (l.calculo !== "diferenca") out.push({ nome: l.nome, valor: v_(l.valores, ano), unidade: "R$ mil", grupo: "", nivel: l.nivel }); }
  else if (item === "fluxo") {
    const p = await fluxo.projetar(bd, vid);
    for (const sc of (await demo.lerFluxo(bd, vid, p)).indireto ?? []) for (const l of sc.linhas) out.push({ nome: l.nome, valor: v_(l.valores, ano), unidade: "R$ mil", grupo: sc.titulo, nivel: 0 });
  } else {
    for (const i of ((await demo.indicadores(bd, vid)) as any).indicadores ?? []) {
      const v = v_(i.valores, ano);
      out.push({ nome: i.nome, valor: v !== null && i.percentual ? v * 100 : v, unidade: i.percentual ? "%" : "", grupo: "", nivel: 0, casas: i.casas ?? 2 });
    }
  }
  return out;
}

async function secao(bd: Bd, item: any, vids: number[], ano: number) {
  const cols: Map<string, Linha>[] = [];
  for (const v of vids) cols.push(new Map((await linhasDe(bd, item.id, v, ano)).map((r) => [r.nome, r])));          // nomes únicos por versão (a última linha de mesmo nome prevalece)
  const ordem: string[] = [];
  for (const col of cols) for (const n of col.keys()) if (!ordem.includes(n)) ordem.push(n);
  const linhas: any[] = [];
  for (const n of ordem) {
    const ref = cols.find((col) => col.has(n))!.get(n)!;
    const valores = cols.map((col) => (col.has(n) ? col.get(n)!.valor : null));
    const nums = valores.map((x) => (x !== null ? x : 0));
    if (!item.completo && nums.slice(1).every((x) => Math.abs(x - nums[0]) <= TOL)) continue;          // só o que varia (o fluxo de caixa indireto sai inteiro, com todos os totais)
    linhas.push({ nome: n, unidade: ref.unidade, grupo: ref.grupo ?? "", nivel: ref.nivel ?? 0, valores });
  }
  return { id: item.id, titulo: item.nome, tipo: item.grupo, linhas, completo: !!item.completo };
}

// ---------------------------------------------------------------- impacto por grupo de premissas
async function colunas(bd: Bd, tabela: string): Promise<string[]> {
  return (await bd.q("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name NOT IN ('versao_id','id') ORDER BY ordinal_position", [tabela])).map((r) => r.column_name);
}

async function conteudo(bd: Bd, tabelas: string[], vid: number): Promise<string[][]> {
  const res: string[][] = [];
  for (const t of tabelas) {
    const cols = (await colunas(bd, t)).join(", ");
    res.push((await bd.q(`SELECT ${cols} FROM ${t} WHERE versao_id=?`, [vid])).map((r) => JSON.stringify(Object.values(r))).sort());
  }
  return res;
}

async function trocar(bd: Bd, tabelas: string[], destino: number, origem: number) {
  for (const t of tabelas) {
    const cols = (await colunas(bd, t)).join(", ");
    await bd.q(`DELETE FROM ${t} WHERE versao_id=?`, [destino]);
    await bd.q(`INSERT INTO ${t}(versao_id, ${cols}) SELECT ?::int, ${cols} FROM ${t} WHERE versao_id=?`, [destino, origem]);
  }
}

async function apagarVersao(bd: Bd, vid: number) {
  await bd.q("DELETE FROM fazenda_anos WHERE fazenda_id IN (SELECT id FROM fazendas WHERE versao_id=?)", [vid]);
  await bd.q("DELETE FROM parcelas WHERE fazenda_id IN (SELECT id FROM fazendas WHERE versao_id=?)", [vid]);
  const tabelas = await bd.q<{ relname: string }>(
    "SELECT c.relname FROM pg_class c JOIN information_schema.columns k ON k.table_name=c.relname AND k.table_schema='public' AND k.column_name='versao_id' " +
    "WHERE c.relkind='r' AND c.relnamespace='public'::regnamespace ORDER BY c.oid DESC");
  for (const { relname } of tabelas) if (relname !== "versoes") await bd.q(`DELETE FROM ${relname} WHERE versao_id=?`, [vid]);
  await bd.q("DELETE FROM versoes WHERE id=?", [vid]);
}

export async function impactos(bd: Bd, base: number, outro: number, ano: number, autor: string) {
  const kpiBase = await metricas(bd, base, ano), kpiOutro = await metricas(bd, outro, ano);
  const mudaram: [string, string[]][] = [];
  for (const [n, t] of GRUPOS) if (JSON.stringify(await conteudo(bd, t, base)) !== JSON.stringify(await conteudo(bd, t, outro))) mudaram.push([n, t]);
  const b = await obterVersao(bd, base), o = await obterVersao(bd, outro);
  const dividaDiferente = b.divida_importacao_id !== o.divida_importacao_id;
  const fatores: any[] = [];
  const soma: Record<string, number> = Object.fromEntries(KPIS.map((k) => [k[0], 0]));
  const candidatos: [string, string[]][] = [...mudaram, ...(dividaDiferente ? [["Base de dívidas vigentes", [] as string[]] as [string, string[]]] : [])];
  for (const [nome, tabelas] of candidatos) {
    const tmp = await copiarVersao(bd, base, "revisao", "_temporario", autor);
    let m: Record<string, number>;
    try {
      await trocar(bd, tabelas, tmp, outro);
      if (!tabelas.length) await bd.q("UPDATE versoes SET divida_importacao_id=? WHERE id=?", [o.divida_importacao_id, tmp]);
      m = await metricas(bd, tmp, ano);
    } finally { await apagarVersao(bd, tmp); }
    const efeitos = Object.fromEntries(Object.keys(kpiBase).map((k) => [k, m[k] - kpiBase[k]]));
    for (const k of Object.keys(soma)) soma[k] += efeitos[k];
    fatores.push({ grupo: nome, efeitos });
  }
  const total = Object.fromEntries(Object.keys(kpiBase).map((k) => [k, kpiOutro[k] - kpiBase[k]]));
  return { kpis: KPIS.map(([k, n]) => ({ id: k, nome: n, base: kpiBase[k], valor: kpiOutro[k], delta: total[k] })), fatores, combinado: Object.fromEntries(Object.keys(soma).map((k) => [k, total[k] - soma[k]])) };
}

export async function comparar(bd: Bd, base: number, outros: number[], ano: number, itens: string[], comImpacto: boolean, autor: string) {
  if (!outros.length) throw Invalido("Escolha ao menos um orçamento para comparar com o base");
  if (outros.includes(base)) throw Invalido("O orçamento base não pode ser comparado com ele mesmo");
  const vs = [];
  for (const v of [base, ...outros]) vs.push(await obterVersao(bd, v));
  for (const v of vs) if (!anosDaVersao(v).includes(ano)) throw Invalido(`O orçamento '${v.nome}' não tem o ano ${ano}`);
  const validos = new Map<string, any>(ITENS.map((i) => [i.id, i]));
  const secoes: any[] = [];
  for (const i of itens) if (validos.has(i)) secoes.push(await secao(bd, validos.get(i), vs.map((v) => v.id), ano));
  const res: any = { ano, orcamentos: vs.map((v) => ({ id: v.id, nome: v.nome, tipo: v.tipo, origem_id: v.origem_id })), secoes, impactos: [], kpis_nomes: KPIS.map(([k, n]) => ({ id: k, nome: n })) };
  if (comImpacto) for (const v of vs.slice(1)) res.impactos.push({ orcamento_id: v.id, nome: v.nome, ...(await impactos(bd, base, v.id, ano, autor)) });
  return res;
}

// ---------------------------------------------------------------- impressão de um orçamento (todos os anos)
async function demonstrativoAnos(bd: Bd, item: string, vid: number, anos: number[]) {
  const porAnos = (serie: any) => Object.fromEntries(anos.map((a) => [a, v_(serie, a)]));
  const out: any[] = [];
  if (item === "dre") for (const l of ((await dre.ler(bd, vid)) as any).linhas) out.push({ nome: l.nome, valores: porAnos(l.valores), unidade: l.unidade, grupo: "", nivel: l.nivel });
  else if (item === "balanco") { for (const l of ((await balanco.ler(bd, vid)) as any).linhas) if (l.calculo !== "diferenca") out.push({ nome: l.nome, valores: porAnos(l.valores), unidade: "R$ mil", grupo: "", nivel: l.nivel }); }
  else if (item === "fluxo") {
    const p = await fluxo.projetar(bd, vid);
    for (const sc of (await demo.lerFluxo(bd, vid, p)).indireto ?? []) for (const l of sc.linhas) out.push({ nome: l.nome, valores: porAnos(l.valores), unidade: "R$ mil", grupo: sc.titulo, nivel: 0, total: l.estilo === "total" });
  } else {
    for (const i of ((await demo.indicadores(bd, vid)) as any).indicadores ?? []) {
      const esc = i.percentual ? 100 : 1;                                                                  // percentuais guardados em decimal (0,3 = 30%)
      out.push({ nome: i.nome, valores: Object.fromEntries(Object.entries(porAnos(i.valores)).map(([a, v]) => [a, v !== null ? (v as number) * esc : null])), unidade: i.percentual ? "%" : "", grupo: "", nivel: 0, casas: i.casas ?? 2 });
    }
  }
  return out;
}

// Premissas e demonstrativos de um orçamento, ano a ano, para o relatório em PDF.
export async function imprimir(bd: Bd, vid: number, itens: string[]) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const validos = new Map<string, any>(ITENS.map((i) => [i.id, i]));
  const escolhidos = itens.filter((i) => validos.has(i)).map((i) => validos.get(i));
  if (!escolhidos.length) throw Invalido("Escolha ao menos um item para imprimir");
  const secoes: any[] = [];
  for (const it of escolhidos) {
    let linhas: any[];
    if (["dre", "balanco", "fluxo", "indicadores"].includes(it.id)) linhas = await demonstrativoAnos(bd, it.id, vid, anos);
    else {
      const porAno: Record<number, Map<string, Linha>> = {};
      for (const a of anos) porAno[a] = new Map((await linhasDe(bd, it.id, vid, a)).map((r) => [r.nome, r]));
      const ordem: string[] = [];
      for (const a of anos) for (const n of porAno[a].keys()) if (!ordem.includes(n)) ordem.push(n);
      linhas = ordem.map((n) => {
        const ref = porAno[anos.find((a) => porAno[a].has(n))!].get(n)!;
        return { nome: n, unidade: ref.unidade, grupo: ref.grupo ?? "", nivel: ref.nivel ?? 0, valores: Object.fromEntries(anos.map((a) => [a, porAno[a].has(n) ? porAno[a].get(n)!.valor : null])) };
      });
    }
    secoes.push({ id: it.id, titulo: it.nome, tipo: it.grupo, linhas });
  }
  return { orcamento: { id: v.id, nome: v.nome, tipo: v.tipo, status: v.status, ano_base: v.ano_base, horizonte: v.horizonte }, anos, secoes };
}
