// Resultado por produto: para cada produto, o resultado da safra e o resultado anual com estoque, a partir de área, produtividade, preço,
// custos variáveis diretos e premissas de produtos. Porte de app/servicos/resultado.py (mesmas regras e mesma ordem de cálculo).
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, obterVersao } from "./base.mts";
import { marcas } from "./comum.mts";
import * as extras from "./extras.mts";
import { lerPecuaria } from "./pecuaria.mts";

const MIL = 1000;
export const TODAS = "Todos os produtos";
type Serie = Record<number, number>;

// quantidade produzida por ano dos produtos sem área (pecuária): a produtividade lançada; no leite, o total anual do bloco de animais
export async function quantidadesSemArea(bd: Bd, vid: number): Promise<Record<number, Serie>> {
  const areas = new Set((await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", [vid])).map((r) => r.cultura_id));
  const ids = (await extras.idsComProdutividade(bd, vid)).filter((i) => !areas.has(i));
  const out: Record<number, Serie> = {};
  for (const i of ids) out[i] = {};
  for (const r of await bd.q("SELECT cultura_id, ano, valor FROM produtividade WHERE versao_id=?", [vid])) if (r.cultura_id in out) out[r.cultura_id][r.ano] = r.valor;
  for (const r of await bd.q("SELECT id FROM culturas WHERE estoque_destino='gado'")) {          // rebanho: a "produção" do ano são as vendas lançadas na movimentação
    if (r.id in out) out[r.id] = Object.fromEntries((await bd.q("SELECT ano, valor FROM rebanho_valores WHERE versao_id=? AND cultura_id=? AND campo='vendas'", [vid, r.id])).map((x) => [x.ano, x.valor]));
  }
  const leite = await extras.leiteId(bd, vid);
  if (leite !== null && leite in out) out[leite] = { ...(await lerPecuaria(bd, vid)).linhas.find((l) => l.id === "producao_ano")!.valores };
  return out;
}

async function carregar(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const semArea = await quantidadesSemArea(bd, vid);
  const ids = [...new Set([...(await bd.q<{ cultura_id: number }>("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", [vid])).map((r) => r.cultura_id), ...Object.keys(semArea).map(Number)])];
  const culturas = (await bd.q(`SELECT c.* FROM culturas c WHERE c.id IN (${marcas(ids.length)}) ORDER BY c.grupo COLLATE "C", c.nome`, ids)).map((r) => ({ ...r, nome: String(r.nome), sem_area: r.id in semArea }));
  const porCultura = async (sql: string, ...args: unknown[]) => {
    const d: Record<number, Serie> = {};
    for (const r of await bd.q(sql, args)) (d[r.c] ??= {})[r.a] = r.v;
    return d;
  };
  const dados: any = {
    versao: v, anos: anosDaVersao(v), culturas,
    area: await porCultura("SELECT cultura_id AS c, ano AS a, area_ha AS v FROM areas_cultura WHERE versao_id=?", vid),
    prod: { ...(await porCultura("SELECT cultura_id AS c, ano AS a, valor AS v FROM produtividade WHERE versao_id=?", vid)), ...semArea },
    preco: await porCultura("SELECT cultura_id AS c, ano AS a, preco AS v FROM precos_venda WHERE versao_id=?", vid),
    custo: await porCultura("SELECT cc.cultura_id AS c, cc.ano AS a, SUM(cc.valor) AS v FROM custos_cultura cc JOIN grupos_custo g ON g.id=cc.grupo_id WHERE cc.versao_id=? AND g.classificacao='direto' GROUP BY cc.cultura_id, cc.ano", vid),
    prem: new Map<string, Serie>(), prem_vinculada: new Set<string>(), rebanho: {} as Record<number, Record<string, Serie>>,
  };
  for (const r of await bd.q("SELECT cultura_id, campo, ano, valor FROM rebanho_valores WHERE versao_id=?", [vid])) ((dados.rebanho[r.cultura_id] ??= {})[r.campo] ??= {})[r.ano] = r.valor;
  for (const r of await bd.q("SELECT cultura_id, tipo, ano, valor FROM prem_valores WHERE versao_id=?", [vid])) {
    const k = `${r.cultura_id}|${r.tipo}`;
    if (!dados.prem.has(k)) dados.prem.set(k, {});
    dados.prem.get(k)[r.ano] = r.valor;
  }
  for (const r of await bd.q("SELECT cultura_id, tipo FROM prem_itens WHERE versao_id=?", [vid])) dados.prem_vinculada.add(`${r.cultura_id}|${r.tipo}`);
  return dados;
}

export const ehRebanho = (c: any) => c.estoque_destino === "gado" && !!c.sem_area;

const CHAVES_REBANHO = ["area", "prod_ha", "producao", "sementes", "disponivel", "descarte", "comerc_safra", "preco", "rb_safra", "ded_pct", "ded_safra", "rl_safra", "custo_ha",
  "custo_total", "mc", "estocada", "estoque_anterior", "vender", "perda", "comerc", "rec_producao", "rec_estoque", "rb", "ded", "rl", "custo_medio", "cpv_producao",
  "cpv_estoque", "cpv", "mb", "estoque_valor", "perda_safra", "producao_anual", "estoque_pct", "custo_safra", "estoque_semente", "custo_semente_ant", "qtd_prod",
  "reb_ini", "reb_compras", "reb_nasc", "reb_mortes", "reb_vendas", "reb_fim", "reb_valor_ini", "reb_custos", "reb_custo_medio"];
const CHAVES = ["area", "prod_ha", "producao", "sementes", "disponivel", "descarte", "comerc_safra", "preco", "rb_safra", "ded_pct",
  "ded_safra", "rl_safra", "custo_ha", "custo_total", "mc", "estocada", "estoque_anterior", "vender", "perda", "comerc",
  "rec_producao", "rec_estoque", "rb", "ded", "rl", "custo_medio", "cpv_producao", "cpv_estoque", "cpv", "mb", "estoque_valor", "perda_safra", "producao_anual", "estoque_pct", "custo_safra", "estoque_semente", "custo_semente_ant", "qtd_prod"];

// produto com estoque em gado de corte: a movimentação do rebanho (cabeças) manda no cálculo
function numerosRebanhoDe(c: any, d: any): any {
  const cid = c.id, anos: number[] = d.anos;
  const rv = d.rebanho[cid] ?? {};
  const g = (campo: string, a: number) => rv[campo]?.[a] ?? 0;
  const pegar = (chave: string, a: number) => d[chave][cid]?.[a] ?? 0;
  const dedPct = (a: number) => (d.prem.get(`${cid}|deducao_receita`)?.[a] ?? 0) / 100;
  const r: any = {};
  for (const k of CHAVES_REBANHO) r[k] = {};
  let ini = g("saldo_ini", anos[0]), valorIni = g("valor_ini", anos[0]);
  const limitou: number[] = [];
  for (const a of anos) {
    const compras = g("compras", a), nasc = g("nascimentos", a), mortes = g("mortes", a), vendas = g("vendas", a), preco = pegar("preco", a), ct = pegar("custo", a);
    const cab = ini + compras + nasc;
    const cm = cab > 0 ? (valorIni + ct) / cab : 0;
    const mortesEf = Math.min(mortes, cab);
    const disponivel = Math.max(cab - mortesEf, 0);
    const vendasEf = Math.min(vendas, disponivel);
    if (vendas > disponivel + 1e-9) limitou.push(a);
    const fim = disponivel - vendasEf;
    const rb = vendasEf * preco;
    const dd = -rb * dedPct(a);
    const rl = rb + dd;
    const cpv = -(vendasEf + mortesEf) * cm;
    const est = fim * cm;
    const vals: Record<string, number> = { area: 0, prod_ha: 0, producao: vendasEf, sementes: 0, disponivel, descarte: 0, comerc_safra: vendasEf, preco, rb_safra: rb,
      ded_pct: dedPct(a) * 100, ded_safra: dd, rl_safra: rl, custo_ha: 0, custo_total: ct, mc: rl + cpv, estocada: fim, estoque_anterior: ini, vender: vendasEf,
      perda: mortesEf, comerc: vendasEf, rec_producao: rb, rec_estoque: 0, rb, ded: dd, rl, custo_medio: cm, cpv_producao: cpv, cpv_estoque: 0, cpv,
      mb: rl + cpv, estoque_valor: est, perda_safra: 0, producao_anual: vendasEf, estoque_pct: cab > 0 ? (fim / cab) * 100 : 0, custo_safra: -cpv,
      estoque_semente: 0, custo_semente_ant: 0, qtd_prod: vendasEf, reb_ini: ini, reb_compras: compras, reb_nasc: nasc, reb_mortes: mortesEf, reb_vendas: vendasEf,
      reb_fim: fim, reb_valor_ini: valorIni, reb_custos: ct, reb_custo_medio: cm };
    for (const k of Object.keys(vals)) r[k][a] = vals[k];
    ini = fim; valorIni = est;
  }
  r._limitou = limitou;
  return r;
}

function numeros(c: any, d: any): any {
  if (ehRebanho(c)) return numerosRebanhoDe(c, d);
  const cid = c.id, anos: number[] = d.anos;
  const pegar = (chave: string, a: number) => d[chave][cid]?.[a] ?? 0;
  const prem = (tipo: string, a: number) => d.prem.get(`${cid}|${tipo}`)?.[a] ?? 0;
  const r: any = {};
  for (const k of CHAVES) r[k] = {};
  let estAnt = prem("estoque_ant", anos[0] - 1), cmAnt = prem("custo_estoque_ant", anos[0] - 1), semAnt = 0;       // estoque de passagem do ano anterior (zero se não informado)
  const limitou: number[] = [];
  for (const a of anos) {
    const area = pegar("area", a), pha = pegar("prod", a), preco = pegar("preco", a);
    const producao = c.sem_area ? pha : area * pha;            // sem área (pecuária): a produtividade lançada já é a quantidade do ano
    const sementes = prem("sementes", a);
    const base = Math.max(producao - sementes, 0);             // produção menos sementes: teto do que pode ser estocado e base do custo médio
    const desc = prem("descarte", a) / 100, ded = prem("deducao_receita", a) / 100;
    // ---- resultado da safra: toda a produção do ano vista como vendida no próprio ano (produção - descarte - sementes)
    const perdaS = producao * desc;
    const comS = Math.max(producao - perdaS - sementes, 0);
    const rbS = comS * preco;
    const ddS = -rbS * ded;
    const rlS = rbS + ddS;
    const cha = pegar("custo", a);
    const ct = cha * (c.sem_area ? producao : area);          // sem área: custo em R$ por kg/litro/unidade produzido
    // ---- resultado anual: o que de fato é vendido no ano (produção do ano - estocada + estoque do ano anterior)
    const estPedida = prem("estoque", a);
    const est = Math.min(estPedida, base);
    if (estPedida > base + 1e-9) limitou.push(a);
    const vender = producao - est + estAnt;                    // bruto: antes do descarte e das sementes
    const perda = vender * desc;
    const qtdProd = Math.max((producao - est) * (1 - desc) - sementes, 0);       // da produção do ano: descarte primeiro, depois as sementes
    const comerc = qtdProd + estAnt * (1 - desc);
    const recProd = qtdProd * preco, recEst = estAnt * (1 - desc) * preco;
    const rb = recProd + recEst;
    const dd = -rb * ded;
    const rl = rb + dd;
    const cm = producao > 0 ? ct / producao : 0;               // custo médio: custo total de produção do ano / volume produzido (como na planilha)
    const custoSafra = cm * base;                              // custos variáveis diretos "descontada a semente"
    const cpvP = -(base - est) * cm, cpvE = -estAnt * cmAnt;
    const vals: Record<string, number> = { area, prod_ha: pha, producao, sementes, disponivel: base, descarte: desc * 100, perda_safra: perdaS, comerc_safra: comS,
      preco, rb_safra: rbS, ded_pct: ded * 100, ded_safra: ddS, rl_safra: rlS, custo_ha: cha, custo_total: ct,
      mc: rlS - custoSafra, estocada: est, estoque_anterior: estAnt, vender, perda, comerc,
      rec_producao: recProd, rec_estoque: recEst, rb, ded: dd, rl, custo_medio: cm, cpv_producao: cpvP,
      cpv_estoque: cpvE, cpv: cpvP + cpvE, mb: rl + cpvP + cpvE, estoque_valor: est * cm, producao_anual: producao, estoque_pct: base > 0 ? (est / base) * 100 : 0,
      custo_safra: custoSafra, estoque_semente: sementes * cm, custo_semente_ant: -semAnt * cmAnt, qtd_prod: qtdProd };
    for (const k of Object.keys(vals)) r[k][a] = vals[k];
    estAnt = est; cmAnt = cm; semAnt = sementes;
  }
  r._limitou = limitou;
  return r;
}

interface Linha { id: string; nome: string; unidade: string; estilo: string; opcional: boolean; valores: Serie }
function L(id: string, nome: string, unidade: string, serie: Serie, estilo = "", opcional = false): Linha {
  const escala = unidade === "R$ mil" ? MIL : 1;
  return { id, nome, unidade, estilo, opcional, valores: Object.fromEntries(Object.entries(serie).map(([a, v]) => [a, v / escala])) };
}
const pct = (num: Serie, den: Serie): Serie => Object.fromEntries(Object.keys(num).map((a) => [a, den[+a] ? (num[+a] / den[+a]) * 100 : 0]));
const porHa = (serie: Serie, area: Serie): Serie => Object.fromEntries(Object.keys(serie).map((a) => [a, area[+a] ? serie[+a] / area[+a] : 0]));
const mapa = (s: Serie, f: (v: number) => number): Serie => Object.fromEntries(Object.entries(s).map(([a, v]) => [a, f(v)]));

// linhas no formato da planilha de orçamento. un = kg/litro do produto; null = consolidado (sem quantidades)
function blocos(n: any, un: string | null, nome = "") {
  const safra: Linha[] = [L("area", "Área plantada", "ha", n.area, "dim")];
  if (un) safra.push(L("produtividade", "Produtividade", `${un}/ha`, n.prod_ha), L("producao", "Volume produzido", un, n.producao), L("descarte", "Descarte", "%", n.descarte, "dim", true),
    L("perda_safra", "(–) Perda por descarte", un, n.perda_safra, "dim", true), L("sementes", "(–) Sementes salvas", un, n.sementes, "dim"),
    L("comerc_safra", "Quantidade disponível para venda no ano", un, n.comerc_safra), L("preco", "Preço", `R$/${un}`, n.preco, "dim"));
  safra.push(
    L("receita_bruta_safra", "Receita bruta de produção", "R$ mil", n.rb_safra), L("deducoes_safra", "(–) Deduções da receita", "R$ mil", n.ded_safra),
    L("deducoes_pct", "% da receita", "%", n.ded_pct, "dim"), L("receita_liquida_safra", "Receita líquida", "R$ mil", n.rl_safra, "total"),
    L("receita_ha", "Receita líquida por hectare", "R$/ha", porHa(n.rl_safra, n.area), "dim"),
    L("custo_total", "Custos variáveis diretos totais (descontada a semente)", "R$ mil", mapa(n.custo_safra, (v) => -v)),
    L("custo_ha", "Custo total de produção por hectare", "R$/ha", porHa(n.custo_total, n.area), "dim"),
    L("margem_contribuicao", "Margem de contribuição", "R$ mil", n.mc, "total"), L("margem_ha", "Margem de contribuição por hectare", "R$/ha", porHa(n.mc, n.area), "dim"),
    L("margem_contribuicao_pct", "Margem de contribuição (%)", "%", pct(n.mc, n.rl_safra), "dim"));
  const anual: Linha[] = [];
  if (un) anual.push(L("producao_anual", "Quantidade disponível para venda no ano", un, n.disponivel), L("estoque_pct", "Estoque de passagem", "%", n.estoque_pct, "dim"),
    L("estocada", "Quantidade estocada", un, n.estocada, "dim"), L("custo_medio", "Custo médio do produto produzido", `R$/${un}`, n.custo_medio, "dim"),
    L("vendida_pct", "% da produção vendida no ano", "%", mapa(n.estoque_pct, (v) => 100 - v), "dim"), L("perda", "(–) Perda por descarte (do ano da venda)", un, n.perda, "dim", true),
    L("comercializada", "Produção vendida no ano", un, n.qtd_prod));
  anual.push(L("receita_producao", "Receita de produção do ano", "R$ mil", n.rec_producao), L("cpv_producao", "Custo de produção do produto vendido no ano", "R$ mil", n.cpv_producao),
    L("receita_estoque", "Receita de produção do ano anterior (estoque)", "R$ mil", n.rec_estoque), L("cpv_estoque", "Custo de produção do ano anterior (estoque)", "R$ mil", n.cpv_estoque));
  if (un) anual.push(L("custo_semente_ant", "Custo da semente produzida no ano anterior", "R$ mil", n.custo_semente_ant, "dim"));
  anual.push(L("receita_bruta_anual", "Receita bruta anual", "R$ mil", n.rb, "total"), L("deducoes_anual", "(–) Deduções da receita (% do ano da venda)", "R$ mil", n.ded),
    L("receita_liquida_anual", "Receita líquida anual", "R$ mil", n.rl, "total"), L("cpv", "Custo do produto vendido", "R$ mil", n.cpv, "total"),
    L("margem_bruta", "Margem bruta do período", "R$ mil", n.mb, "total"), L("margem_bruta_pct", "Margem bruta do período (%)", "%", pct(n.mb, n.rl), "dim"));
  const estoque: Linha[] = [L("estoque_valor", nome ? `Estoque de ${nome.toLowerCase()}` : "Estoque do produto", "R$ mil", n.estoque_valor)];
  if (un) estoque.push(L("estoque_semente", nome ? `Estoque de semente de ${nome.toLowerCase()}` : "Estoque de semente", "R$ mil", n.estoque_semente),
    L("vendida_anterior", "Estoque inicial (saldo de 31/12 do ano anterior, vendido no ano)", un, n.estoque_anterior, "dim"),
    L("vendida_corrente", "Quantidade vendida do ano corrente", un, n.qtd_prod, "dim"), L("comerc_total", "Quantidade total comercializada no ano", un, n.comerc, "dim"));
  return { safra, anual, estoque };
}

function avisosRebanho(c: any, d: any, n: any): string[] {
  const anos: number[] = d.anos, nome = c.nome, txt = (l: number[]) => l.join(", ");
  const out: string[] = [];
  const semPreco = anos.filter((a) => n.reb_vendas[a] > 0 && !n.preco[a]);
  if (semPreco.length) out.push(`${nome}: falta o preço de venda em ${txt(semPreco)} (assumido zero)`);
  const semCusto = anos.filter((a) => n.reb_compras[a] > 0 && !n.reb_custos[a]);
  if (semCusto.length) out.push(`${nome}: há compras sem custo variável lançado (compra dos animais) em ${txt(semCusto)}`);
  if (n._limitou.length) out.push(`${nome}: as vendas são maiores que o rebanho disponível em ${txt(n._limitou)}; foram limitadas ao disponível`);
  return out;
}

function avisos(c: any, d: any, n: any): string[] {
  if (ehRebanho(c)) return avisosRebanho(c, d, n);
  const cid = c.id, anos: number[] = d.anos, nome = c.nome;
  const comArea = anos.filter((a) => n.area[a] > 0);
  if (!comArea.length) return [];
  const txt = (l: number[]) => l.join(", ");
  const out: string[] = [];
  for (const [chave, rotulo] of [["prod_ha", "a produtividade"], ["preco", "o preço de venda"], ["custo_ha", "o custo variável direto"]]) {
    const faltam = comArea.filter((a) => !n[chave][a]);
    if (faltam.length) out.push(`${nome}: falta ${rotulo} em ${txt(faltam)} (assumido zero)`);
  }
  for (const [tipo, rotulo] of [["descarte", "% descarte"], ["deducao_receita", "% dedução de receita"]]) if (!d.prem_vinculada.has(`${cid}|${tipo}`)) out.push(`${nome}: sem a premissa ${rotulo} (assumido zero)`);
  if (n._limitou.length) out.push(`${nome}: a quantidade estocada é maior que a disponível em ${txt(n._limitou)}; foi limitada ao disponível`);
  return out;
}

const SOMAR = ["area", "rb_safra", "ded_safra", "rl_safra", "custo_total", "custo_safra", "estoque_semente", "custo_semente_ant", "qtd_prod", "mc", "rec_producao", "rec_estoque", "rb", "ded",
  "rl", "cpv_producao", "cpv_estoque", "cpv", "mb", "estoque_valor"];

export async function calcularResultado(bd: Bd, vid: number) {
  const d = await carregar(bd, vid);
  const anos: number[] = d.anos;
  const culturas: any[] = [], avisosTodos: string[] = [];
  let soma: any = null;
  const gado: Serie = Object.fromEntries(anos.map((a) => [a, 0]));          // estoque (a custo) dos produtos marcados como gado de corte
  for (const c of d.culturas) {
    const n = numeros(c, d);
    const av = avisos(c, d, n);
    avisosTodos.push(...av);
    const bl = blocos(n, c.unidade, c.nome);
    if (ehRebanho(c)) {
      const un = c.unidade;
      bl.estoque.push(L("reb_ini", "Saldo inicial do rebanho", un, n.reb_ini, "dim"), L("reb_compras", "(+) Compras", un, n.reb_compras, "dim"), L("reb_nasc", "(+) Nascimentos", un, n.reb_nasc, "dim"),
        L("reb_mortes", "(–) Mortes", un, n.reb_mortes, "dim"), L("reb_vendas", "(–) Vendas", un, n.reb_vendas, "dim"), L("reb_fim", "Saldo final do rebanho", un, n.reb_fim, "total"),
        L("reb_custo_medio", "Custo médio por cabeça", "R$/" + un, n.reb_custo_medio, "dim"));
    }
    culturas.push({ id: c.id, nome: c.nome, grupo: c.grupo, unidade: c.unidade, sem_area: !!c.sem_area, rebanho: ehRebanho(c), ...bl, avisos: av });
    const base: any = {};
    for (const k of Object.keys(n)) if (k !== "_limitou") base[k] = n[k];
    if (c.estoque_destino === "gado") for (const a of anos) gado[a] += n.estoque_valor[a];
    if (soma === null) { soma = {}; for (const k of Object.keys(base)) soma[k] = { ...base[k] }; }
    else for (const k of Object.keys(base)) if (SOMAR.includes(k)) for (const a of anos) soma[k][a] += base[k][a];
  }
  const consolidado: any = soma ? blocos(soma, null) : { safra: [], anual: [], estoque: [] };
  if (soma) consolidado.estoque = [...consolidado.estoque, L("estoque_valor_gado", "Estoque de gado de corte", "R$ mil", gado)];       // já está dentro de estoque_valor (total)
  return { versao: d.versao, anos, culturas, consolidado, avisos: avisosTodos };
}

const CHAVES_COMPARACAO = ["receita_liquida_safra", "margem_contribuicao", "receita_bruta_anual", "receita_liquida_anual", "cpv", "margem_bruta"];

export async function compararResultado(bd: Bd, aId: number, bId: number) {
  const ra = await calcularResultado(bd, aId), rb = await calcularResultado(bd, bId);
  const anos = ra.anos.filter((x) => rb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const delta = (x: number, y: number) => ({ a: x, b: y, delta: y - x, pct: x ? ((y - x) / Math.abs(x)) * 100 : null });
  const linhas = (ba: any, bb: any) => {
    const la = new Map<string, any>([...ba.safra, ...ba.anual].map((l: any) => [l.id, l])), lb = new Map<string, any>([...bb.safra, ...bb.anual].map((l: any) => [l.id, l]));
    const out: any = {};
    for (const chave of CHAVES_COMPARACAO) {
      const nome = (la.get(chave) || lb.get(chave) || { nome: chave }).nome;
      const va = la.get(chave)?.valores ?? {}, vb = lb.get(chave)?.valores ?? {};
      out[nome] = Object.fromEntries(anos.map((an) => [an, delta(va[an] ?? 0, vb[an] ?? 0)]));
    }
    return out;
  };
  const vazio = { safra: [], anual: [], estoque: [] };
  const res: any = { [TODAS]: linhas(ra.consolidado, rb.consolidado) };
  const ia = new Map(ra.culturas.map((c: any) => [c.id, c])), ib = new Map(rb.culturas.map((c: any) => [c.id, c]));
  const nomes = new Map([...ra.culturas, ...rb.culturas].map((c: any) => [c.id, c.nome as string]));
  for (const cid of [...nomes.keys()].sort((x, y) => (nomes.get(x)!.toLowerCase() < nomes.get(y)!.toLowerCase() ? -1 : 1))) res[nomes.get(cid)!] = linhas(ia.get(cid) || vazio, ib.get(cid) || vazio);
  return { a: ra.versao, b: rb.versao, anos, unidade: "R$ mil", resultados: res };
}

// séries da movimentação do rebanho de cada produto com estoque em gado de corte (a tela de Produtividade pecuária lê daqui)
export async function numerosRebanho(bd: Bd, vid: number): Promise<Record<number, any>> {
  const d = await carregar(bd, vid);
  return Object.fromEntries(d.culturas.filter(ehRebanho).map((c: any) => [c.id, numerosRebanhoDe(c, d)]));
}
