// DRE: a estrutura (linhas, hierarquia e ordem) vem do Fechamento Contábil; os valores NÃO são digitados: vêm dos módulos do orçamento
// (por versão e por ano), em R$ mil e com o sinal que afetam o resultado (receitas positivas; custos e despesas negativos). Porte de app/servicos/dre.py.
//
// Tipos de linha na DRE sintética: entrada (conta sem filhas), soma (grupo com filhas), calculada (grupo sem filhas com fórmula), pct (margem em %), sem_formula.
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido } from "../lib/erros.mts";
import { abrirPlanilha, type Planilha } from "../lib/xlsx.mts";
import { anosDaVersao, auditar, obterVersao } from "./base.mts";
import { inserirLinhas, marcas, nomeMin } from "./comum.mts";
import * as arr from "./arrendamentos.mts";
import * as cap from "./captacoes.mts";
import * as dividas from "./dividas.mts";
import * as dp from "./dre-padrao.mts";
import * as extras from "./extras.mts";
import * as fluxo from "./fluxo.mts";
import * as inv from "./investimentos.mts";
import * as pd from "./premissas-dem.mts";
import { calcularResultado } from "./resultado.mts";
import { seriesTransportadora } from "./transportadora.mts";

const MIL = 1000;
type Serie = Record<number, number>;

// no Netlify não há arquivo local: a estrutura entra pela tela (enviando o arquivo) ou pela carga dos dados
export const arquivoPadrao = (): string => process.env.FECHAMENTO_ARQUIVO || "";
export const arquivoPadraoExiste = () => !!arquivoPadrao() && existsSync(arquivoPadrao());

// fórmulas das linhas calculadas, pelos códigos da DRE sintética da Sekita
export const FORMULAS: Record<string, any[]> = {
  DS018: ["soma", ["DS007", "DS015"]],                 // Receita Líquida = Receita Bruta + Deduções
  DS027: ["soma", ["DS018", "DS020"]],                 // Resultado Bruto = Receita Líquida + CPV
  DS028: ["pct", "DS027", "DS018"],                    // % Margem de Contribuição
  DS044: ["soma", ["DS027", "DS030"]],                 // Ebitda = Resultado Bruto + Outras Despesas Operacionais
  DS045: ["pct", "DS044", "DS018"],                    // Margem Ebitda
  DS048: ["soma", ["DS044", "DS047"]],                 // Ebit = Ebitda + Depreciação
  DS049: ["pct", "DS048", "DS018"],                    // Margem Ebit
  DS058: ["soma", ["DS048", "DS051", "DS054"]],        // Ebt = Ebit + Resultado Financeiro + Outras Receitas não Operacionais
  DS062: ["soma", ["DS058", "DS060"]],                 // Lucro Líquido = Ebt + CSLL e IRPJ
  DS063: ["pct", "DS062", "DS018"],                    // Margem Líquida
};
const COLUNAS = ["code", "name", "parent", "kind", "order", "active", "target"];

// ---------------------------------------------------------------- importação da estrutura
interface LinhaEstrutura { codigo: string; nome: string; pai: string; tipo: string; ordem: number; ativa: number; destino: string; }
function lerAba(wb: Planilha, nome: string): LinhaEstrutura[] {
  if (!wb.abas.includes(nome)) throw Invalido(`O arquivo não tem a aba '${nome}'. Use o banco do Fechamento Contábil (fechamento-contabil.xlsx).`);
  const [primeira = [], ...resto] = wb.linhas(nome);
  const cab = primeira.map((c) => (c !== null && c !== undefined ? String(c).trim() : ""));
  const faltam = COLUNAS.filter((c) => !cab.includes(c));
  if (faltam.length) throw Invalido(`Faltam colunas na aba '${nome}': ${faltam.join(", ")}`);
  const ix = Object.fromEntries(COLUNAS.map((c) => [c, cab.indexOf(c)]));
  const linhas: LinhaEstrutura[] = [];
  for (const r of resto) {
    if (!r || r[ix.code] === null || r[ix.code] === undefined || r[ix.code] === "") continue;
    const g = (k: string) => (ix[k] < r.length && r[ix[k]] !== null && r[ix[k]] !== undefined ? r[ix[k]] : "");
    let ordem = Number(g("order") || 0);
    ordem = Number.isFinite(ordem) ? Math.trunc(ordem) : 0;
    const ativa = !["false", "0", "não", "nao", "no"].includes(String(g("active")).trim().toLowerCase());
    linhas.push({ codigo: String(g("code")).trim(), nome: String(g("name")).trim(), pai: String(g("parent")).trim(), tipo: String(g("kind")).trim() === "group" ? "group" : "account", ordem, ativa: ativa ? 1 : 0, destino: String(g("target")).trim() });
  }
  if (!linhas.length) throw Invalido(`A aba '${nome}' está vazia.`);
  return linhas;
}

export async function importarEstrutura(bd: Bd, conteudo: Uint8Array, arquivo: string, autor: string) {
  let wb: Planilha;
  try { wb = await abrirPlanilha(conteudo); } catch { throw Invalido("Não consegui abrir o arquivo. Use o banco do Fechamento Contábil (fechamento-contabil.xlsx)."); }
  const sint = lerAba(wb, "DRE Sintética"), anal = lerAba(wb, "DRE Analítica");
  const codigos = new Set(sint.map((l) => l.codigo));
  if (codigos.size !== sint.length) throw Invalido("A DRE sintética tem códigos repetidos.");
  const semPai = [...new Set(sint.filter((l) => l.pai && !codigos.has(l.pai)).map((l) => l.pai))].sort();
  if (semPai.length) throw Invalido(`A DRE sintética tem linhas cujo grupo não existe: ${semPai.join(", ")}`);
  const bp = wb.abas.includes("BP Sintético") ? lerAba(wb, "BP Sintético") : [];
  const bpCodigos = new Set(bp.map((l) => l.codigo));
  if (bpCodigos.size !== bp.length) throw Invalido("O BP sintético tem códigos repetidos.");
  const semPaiBp = [...new Set(bp.filter((l) => l.pai && !bpCodigos.has(l.pai)).map((l) => l.pai))].sort();
  if (semPaiBp.length) throw Invalido(`O BP sintético tem linhas cujo grupo não existe: ${semPaiBp.join(", ")}`);
  await bd.q("DELETE FROM dre_linhas");
  const analUnicas = new Map<string, LinhaEstrutura>();                         // o código da analítica é único na tabela: se repetir, vale o último (como o INSERT OR REPLACE do SQLite não é usado, repetição seria erro)
  const linhas = [...sint.map((l) => [l.codigo, "sintetica", l.nome, l.pai, l.tipo, l.ordem, l.ativa, l.destino]), ...anal.filter((l) => !codigos.has(l.codigo)).map((l) => [l.codigo, "analitica", l.nome, l.pai, l.tipo, l.ordem, l.ativa, l.destino])];
  void analUnicas;
  await inserirLinhas(bd, "dre_linhas", ["codigo", "nivel", "nome", "pai", "tipo", "ordem", "ativa", "destino"], linhas);
  if (bp.length) {                                                              // o balanço pequeno (BP Sintético) usa a mesma importação
    await bd.q("DELETE FROM bp_linhas");
    await inserirLinhas(bd, "bp_linhas", ["codigo", "nome", "pai", "tipo", "ordem", "ativa"], bp.map((l) => [l.codigo, l.nome, l.pai, l.tipo, l.ordem, l.ativa]));
  }
  // valores de linhas que deixaram de existir não fazem mais sentido
  await bd.q("DELETE FROM dre_valores WHERE codigo NOT IN (SELECT codigo FROM dre_linhas WHERE nivel='sintetica')");
  await bd.q("INSERT INTO dre_importacao(id, arquivo, importado_em, qtd_sinteticas, qtd_analiticas) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET arquivo=excluded.arquivo, importado_em=excluded.importado_em, qtd_sinteticas=excluded.qtd_sinteticas, qtd_analiticas=excluded.qtd_analiticas",
    [arquivo, agora(), sint.length, anal.length]);
  await auditar(bd, autor, null, "importar_estrutura_dre", `${arquivo}: ${sint.length} sintéticas, ${anal.length} analíticas`);
  return { sinteticas: sint.length, analiticas: anal.length, balanco: bp.length };
}

export async function importarArquivoPadrao(bd: Bd, autor: string) {
  if (!arquivoPadraoExiste()) throw Invalido(`Não encontrei o banco do Fechamento Contábil em ${arquivoPadrao()}. Use 'Escolher arquivo…'.`);
  return importarEstrutura(bd, readFileSync(arquivoPadrao()), basename(arquivoPadrao()), autor);
}

// ---------------------------------------------------------------- estrutura e cálculo
export interface LinhaDre { codigo: string; nivel: string; nome: string; pai: string; tipo: string; ordem: number; ativa: number; destino: string; nivel_hierarquia: number; filhos: string[]; calculo: string; }
const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

// Linhas da DRE sintética ativas, em ordem de apresentação (pai antes dos filhos), com nível e tipo de cálculo.
export async function estrutura(bd: Bd, vid: number | null = null): Promise<LinhaDre[]> {
  let rows: any[] = await bd.q("SELECT * FROM dre_linhas WHERE nivel='sintetica' AND ativa=1 ORDER BY ordem, codigo COLLATE \"C\"");
  if (vid !== null) {
    rows = [...rows, ...(await linhasDosProdutos(bd, vid, rows))];
    rows.sort((a, b) => cmp(a.ordem, b.ordem) || cmp(a.codigo, b.codigo));
  }
  const porPai = new Map<string, any[]>();
  for (const r of rows) { if (!porPai.has(r.pai)) porPai.set(r.pai, []); porPai.get(r.pai)!.push(r); }
  const ordenada: LinhaDre[] = [];
  const visitar = (pai: string, nivel: number) => {
    for (const r of porPai.get(pai) ?? []) {
      const filhos = porPai.get(r.codigo) ?? [];
      r.nivel_hierarquia = nivel; r.filhos = filhos.map((f) => f.codigo);
      if (filhos.length) r.calculo = "soma";
      else if (r.codigo in FORMULAS) r.calculo = FORMULAS[r.codigo][0] === "pct" ? "pct" : "calculada";
      else if (r.tipo === "account") r.calculo = "entrada";
      else r.calculo = "sem_formula";
      ordenada.push(r);
      visitar(r.codigo, nivel + 1);
    }
  };
  visitar("", 0);
  return ordenada;                                                              // linhas ativas cujo grupo está inativo não aparecem
}

const LINHA_DEDUCOES_AGRO = "DS016", LINHA_ARRENDAMENTO = "DS032", LINHA_DESPESA_FINANCEIRA = "DS053";
const PAI_RECEITA_CULTURA = "DS008", PAI_CPV_CULTURA = "DS020";
const PAI_RECEITA_PECUARIA = "DS013", PAI_CPV_PECUARIA = "DS025";             // subgrupos Pecuária da receita e do CPV: gado de corte, genética, leite...
const LINHA_OUTRAS_ATIVIDADES = "DS057";                                        // Resultados de outras atividades operacionais (receitas não operacionais)

const normDre = (txt: string) => (txt || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// (pai da receita, pai do CPV): produtos do grupo Pecuária entram nos subgrupos Pecuária da DRE, como no Fechamento Contábil; os demais, nos de culturas.
function paisDoProduto(grupo: string, codigos: Set<string>): [string, string] {
  if (grupo === "Pecuária" && codigos.has(PAI_RECEITA_PECUARIA) && codigos.has(PAI_CPV_PECUARIA)) return [PAI_RECEITA_PECUARIA, PAI_CPV_PECUARIA];
  return [PAI_RECEITA_CULTURA, PAI_CPV_CULTURA];
}

// Produto de receita operacional que está no orçamento e não tem linha com o seu nome na DRE ganha uma linha de receita
// (em Receitas da Atividade Agropecuária, ou no subgrupo Pecuária) e uma de custo do produto vendido, no fim da lista de cada grupo.
async function linhasDosProdutos(bd: Bd, vid: number, rows: any[]): Promise<any[]> {
  const codigos = new Set(rows.map((r) => r.codigo as string));
  const existentes = new Set(rows.map((r) => `${r.pai}|${normDre(r.nome)}`));
  const novas: any[] = [];
  const lista = await extras.idsComProdutividade(bd, vid);                      // produtos com área ou produtividade (inclui pecuária e leite)
  for (const c of await bd.q(`SELECT c.id, c.nome, c.grupo FROM culturas c WHERE c.id IN (${marcas(lista.length)}) AND c.ativa=1 AND c.receita_tipo='operacional' ORDER BY ${nomeMin("c.nome")}`, lista)) {
    const nome = String(c.nome);
    const pais = paisDoProduto(c.grupo, codigos);
    ["PR", "PC"].forEach((prefixo, i) => {
      const pai = pais[i];
      if (!codigos.has(pai) || existentes.has(`${pai}|${normDre(nome)}`)) return;
      const irmas = [...rows, ...novas].filter((r) => r.pai === pai).map((r) => r.ordem as number);
      novas.push({ codigo: `${prefixo}${c.id}`, nivel: "sintetica", nome, pai, tipo: "account", ordem: (irmas.length ? Math.max(...irmas) : 0) + 0.01, ativa: 1, destino: "" });
    });
  }
  return novas;
}

export function calcularEstrutura(est: LinhaDre[], entradas: Record<string, Serie>, anos: number[]): Record<string, Serie> {
  const porCodigo = new Map(est.map((l) => [l.codigo, l]));
  const memo: Record<string, Serie> = {};
  const zero = (): Serie => Object.fromEntries(anos.map((a) => [a, 0]));
  const valor = (codigo: string): Serie => {
    if (codigo in memo) return memo[codigo];
    const l = porCodigo.get(codigo);
    memo[codigo] = zero();                                                      // protege contra ciclos
    if (!l) return memo[codigo];
    let res: Serie;
    if (l.calculo === "entrada") res = Object.fromEntries(anos.map((a) => [a, entradas[codigo]?.[a] ?? 0]));
    else if (l.calculo === "soma") res = Object.fromEntries(anos.map((a) => [a, l.filhos.reduce((t, f) => t + valor(f)[a], 0)]));
    else if (l.calculo === "calculada") res = Object.fromEntries(anos.map((a) => [a, (FORMULAS[codigo][1] as string[]).reduce((t, c) => t + valor(c)[a], 0)]));
    else if (l.calculo === "pct") { const [, num, den] = FORMULAS[codigo]; const n = valor(num), d = valor(den); res = Object.fromEntries(anos.map((a) => [a, d[a] ? (n[a] / d[a]) * 100 : 0])); }
    else res = zero();
    memo[codigo] = res;
    return res;
  };
  for (const l of est) valor(l.codigo);
  return memo;
}

// ---------------------------------------------------------------- ligação com os módulos do orçamento
// Valores (R$ mil, com sinal) que os outros módulos já informam, por linha da DRE; o texto da origem de cada linha; e avisos.
export async function origens(bd: Bd, vid: number, est: LinhaDre[], anos: number[], jurosAuto: Serie | null = null): Promise<[Record<string, Serie>, Record<string, string>, string[], Record<string, string[]>]> {
  const auto: Record<string, Serie> = {}, origem: Record<string, string> = {}, avisos: string[] = [];
  const contas = new Set(est.filter((l) => l.calculo === "entrada").map((l) => l.codigo));
  const somar = (cod: string, serie: Serie, texto: string) => {
    if (!contas.has(cod)) return;
    const acc = (auto[cod] ??= Object.fromEntries(anos.map((a) => [a, 0])));
    for (const a of anos) acc[a] += serie[a] ?? 0;
    origem[cod] = texto;
  };
  const porNome = new Map<string, string>();
  for (const l of est) if (l.calculo === "entrada" && [PAI_RECEITA_CULTURA, PAI_CPV_CULTURA, PAI_RECEITA_PECUARIA, PAI_CPV_PECUARIA].includes(l.pai)) porNome.set(`${l.pai}|${normDre(l.nome)}`, l.codigo);
  const res: any = await calcularResultado(bd, vid);
  const cult = await bd.q("SELECT id, receita_tipo, grupo FROM culturas");
  const tipos = new Map(cult.map((r) => [r.id as number, r.receita_tipo as string])), grupos = new Map(cult.map((r) => [r.id as number, r.grupo as string]));
  const codigosDre = new Set(est.map((l) => l.codigo));
  const semLinha: string[] = [];
  for (const c of res.culturas) {
    const anual: Record<string, Serie> = Object.fromEntries(c.anual.map((l: any) => [l.id, l.valores]));
    const g = (id: string, a: number) => anual[id]?.[a] ?? 0;
    if (tipos.get(c.id) === "nao_operacional") {                                 // receita não operacional: só o resultado (receita − deduções − CPV) entra na DRE
      somar(LINHA_OUTRAS_ATIVIDADES, Object.fromEntries(anos.map((a) => [a, g("receita_bruta_anual", a) + g("deducoes_anual", a) + g("cpv", a)])), "Resultado por produto · receita não operacional");
      continue;
    }
    const [paiRec, paiCpv] = paisDoProduto(grupos.get(c.id) ?? "", codigosDre);
    const rec = porNome.get(`${paiRec}|${normDre(c.nome)}`), cpv = porNome.get(`${paiCpv}|${normDre(c.nome)}`);
    if (!rec && !cpv) { if (anos.some((a) => g("receita_bruta_anual", a))) semLinha.push(c.nome); continue; }
    if (rec) { somar(rec, anual.receita_bruta_anual ?? {}, "Resultado por produto · receita bruta anual"); somar(LINHA_DEDUCOES_AGRO, anual.deducoes_anual ?? {}, "Resultado por produto · deduções da receita"); }
    if (cpv) somar(cpv, anual.cpv ?? {}, "Resultado por produto · custo do produto vendido");
  }
  if (semLinha.length) avisos.push("Sem linha correspondente na DRE (ficam fora): " + [...semLinha].sort().join(", ") + ". A estrutura importada não tem os grupos de receita e de custo dos produtos.");
  const arrend: any = (await arr.calcularArrendamentos(bd, vid)).resumo;
  somar(LINHA_ARRENDAMENTO, Object.fromEntries(anos.map((a) => [a, -(arrend[a]?.custo ?? 0) / MIL])), "Arrendamentos · custo do ano");
  for (const [cod, serie] of Object.entries(await seriesTransportadora(bd, vid, anos))) somar(cod, serie, "Premissas de transportadora · receita, deduções e custo direto");
  const dep = (await inv.depreciacao(bd, vid, anos)).total;
  somar(inv.CODIGO_DEPRECIACAO_DRE, Object.fromEntries(Object.entries(dep).map(([a, v]) => [a, -v])), "Investimentos · depreciação dos bens existentes e dos novos investimentos");
  const juros: Serie = Object.fromEntries(Object.entries((await dividas.resumo(bd, vid, "todas")).por_ano).map(([a, d]: [string, any]) => [Number(a), -d.juros / MIL]));
  const novos = cap.somar(await cap.calcular(bd, vid, anos), anos).juros;
  for (const a of anos) juros[a] = (juros[a] ?? 0) - novos[a] - (jurosAuto?.[a] ?? 0);          // juros da dívida de giro automática (fluxo de caixa)
  somar(LINHA_DESPESA_FINANCEIRA, juros, "Endividamento · juros que vencem no ano (todas as empresas) e das novas dívidas");
  // premissas padronizadas das contas sem origem (média do realizado)
  const baseCalc = calcularEstrutura(est, Object.fromEntries(Object.entries(auto).map(([k, v]) => [k, { ...v }])), anos);          // receita líquida, bruta e CPV não dependem das contas abaixo
  for (const [cod, serie] of Object.entries(await dp.series(bd, vid, anos, baseCalc))) {
    const temValor = Object.values(serie).some((x) => x);
    if (cod === dp.ARRENDAMENTO && temValor) { delete auto[cod]; delete origem[cod]; }        // a média sobre o custo substitui o valor da tela de arrendamentos
    if (temValor) somar(cod, serie, "Premissas da DRE · média do realizado (% da base ou valor)");
  }
  // premissas cadastradas que caem em contas da DRE
  const prem: Record<string, string[]> = {};
  for (const [cod, lista] of Object.entries(await pd.efeitos(bd, vid, "dre", anos))) {
    if (!contas.has(cod)) continue;
    const acc = (auto[cod] ??= Object.fromEntries(anos.map((a) => [a, 0])));
    for (const p of lista) { for (const a of anos) acc[a] += p.valores[a]; (prem[cod] ??= []).push(p.nome); }
  }
  return [auto, origem, avisos, prem];
}

const COMO_ORIGEM: Record<string, string> = {
  "Resultado por produto · receita não operacional": "Soma do resultado dos produtos cadastrados com receita não operacional: receita bruta anual − deduções − custo do produto vendido, "
    + "calculados no Resultado por produto. Esses produtos não têm linha própria de receita nem de custo.",
  "Resultado por produto · receita bruta anual": "Receita bruta anual do produto no Resultado por produto: (produção do ano − estocada) × (1 − descarte) − sementes salvas, "
    + "ao preço do ano, mais o estoque do ano anterior vendido ao preço e ao descarte do ano da venda.",
  "Resultado por produto · deduções da receita": "Soma das deduções de receita dos produtos ligadas à DRE: receita bruta anual × % de dedução do ano da venda "
    + "(premissa % dedução de receita), em negativo.",
  "Resultado por produto · custo do produto vendido": "Custo do produto vendido do produto no Resultado por produto, em negativo: custo da produção vendida no ano + custo do estoque do "
    + "ano anterior, pelo custo médio (custo total de produção ÷ volume produzido). Só custos variáveis diretos.",
  "Premissas de transportadora · receita, deduções e custo direto": "Premissas de transportadora: receita = caminhões × km por caminhão × preço por km; deduções = receita × % de deduções; "
    + "custo direto = km rodado × soma das rubricas variáveis, fixas e despesas (despesa indireta e M.O.I) em R$/km. Depreciação, compra e venda de caminhões ficam em Investimentos.",
  "Arrendamentos · custo do ano": "Custo dos arrendamentos do ano (módulo Arrendamentos): hectares × valor por hectare, ou sacas × valor padrão da saca, "
    + "somando todas as fazendas arrendadas, em negativo.",
  "Endividamento · juros que vencem no ano (todas as empresas) e das novas dívidas": "Juros dos contratos que vencem no ano (módulo Endividamento), somando todas as empresas, mais os juros das novas captações, dos financiamentos dos investimentos (tela Novas captações) e da dívida de giro automática (tela Fluxo de caixa), em negativo.",
};

function explicacao(l: LinhaDre, porCodigo: Map<string, LinhaDre>, origem: string | undefined, premissas: string[] = []): string {
  const nome = (c: string) => (porCodigo.has(c) ? porCodigo.get(c)!.nome : c);
  if (l.calculo === "entrada") {
    const extra = premissas.length ? ` Inclui as premissas da DRE vinculadas a esta conta: ${premissas.join(", ")} (valor digitado, ou % sobre o campo base, com o sinal da premissa).` : "";
    if (origem) return (COMO_ORIGEM[origem] ?? "") + extra;
    if (premissas.length) return `Soma das premissas da DRE vinculadas a esta conta: ${premissas.join(", ")} (valor digitado, ou % sobre o campo base, com o sinal da premissa; em R$).`;
    return "Ainda não há módulo do orçamento nem premissa vinculada a esta linha; fica zerada até existir.";
  }
  if (l.calculo === "soma") return "Soma das linhas abaixo: " + l.filhos.map(nome).join("; ") + ".";
  const f = FORMULAS[l.codigo];
  if (f && f[0] === "soma") return "Soma de: " + (f[1] as string[]).map(nome).join("; ") + " (as despesas já entram negativas).";
  if (f && f[0] === "pct") return `${nome(f[1])} ÷ ${nome(f[2])} × 100.`;
  return "";
}

// jurosAuto: juros da dívida de giro automática por ano. null = calcula pelo fluxo de caixa; {} = sem esses juros (usado para ler só as bases).
export async function ler(bd: Bd, vid: number, jurosAuto: Serie | null = null) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const [imp] = await bd.q("SELECT * FROM dre_importacao WHERE id=1");
  const base: any = { versao: v, anos, importacao: imp ? { ...imp } : null, linhas: [], avisos: [] };
  if (!imp) return base;
  if (jurosAuto === null) jurosAuto = await fluxo.jurosAuto(bd, vid);
  const est = await estrutura(bd, vid);
  const [auto, origem, avisos, prem] = await origens(bd, vid, est, anos, jurosAuto);
  const [calc, , nomesPct] = await pd.aplicarPercentuais(bd, vid, "dre", anos, auto, (e) => calcularEstrutura(est, e, anos));          // premissas percentuais: % × campo base
  for (const [cod, nomes] of Object.entries(nomesPct)) (prem[cod] ??= []).push(...nomes);
  base.avisos = avisos;
  const porCodigo = new Map(est.map((x) => [x.codigo, x]));
  base.linhas = est.map((l) => ({ codigo: l.codigo, nome: l.nome, pai: l.pai, nivel: l.nivel_hierarquia, tipo: l.tipo, calculo: l.calculo, filhos: l.filhos, unidade: l.calculo === "pct" ? "%" : "R$ mil",
    valores: calc[l.codigo], origem: origem[l.codigo] || ((prem[l.codigo] ?? []).length ? "Premissas · valores digitados" : null), premissas: prem[l.codigo] ?? [],
    explicacao: explicacao(l, porCodigo, origem[l.codigo], prem[l.codigo] ?? []) }));
  return base;
}

export async function comparar(bd: Bd, aId: number, bId: number) {
  const la: any = await ler(bd, aId), lb: any = await ler(bd, bId);
  const anos = la.anos.filter((a: number) => lb.anos.includes(a)).sort((x: number, y: number) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const ia = new Map<string, any>(la.linhas.map((l: any) => [l.codigo, l])), ib = new Map<string, any>(lb.linhas.map((l: any) => [l.codigo, l]));
  const linhas = (la.linhas.length ? la.linhas : lb.linhas).map((l: any) => {
    const va = (ia.get(l.codigo) ?? l).valores, vb = (ib.get(l.codigo) ?? l).valores;
    return { codigo: l.codigo, nome: l.nome, nivel: l.nivel, unidade: l.unidade, calculo: l.calculo,
      anos: Object.fromEntries(anos.map((a: number) => [a, { a: va[a] ?? 0, b: vb[a] ?? 0, delta: (vb[a] ?? 0) - (va[a] ?? 0), pct: va[a] ? (((vb[a] ?? 0) - (va[a] ?? 0)) / Math.abs(va[a])) * 100 : null }])) };
  });
  return { a: la.versao, b: lb.versao, anos, linhas };
}
