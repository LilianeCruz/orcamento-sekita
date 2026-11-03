// Demonstrativos realizados (Balanço e DRE de anos já fechados). Porte de app/servicos/realizado.py.
// Valem para todas as versões e servem de base para os prazos médios do Capital de giro, o saldo inicial do balanço e a comparação com o orçado.
//
// Três formatos de arquivo:
//   0. Planilha "Fechamento Financeiro" (abas Balanco9anos e Comparativo de AV): contas ligadas à estrutura pelo nome; anos ainda não fechados são ignorados.
//   1. Banco do Fechamento Contábil (abas "Fechamentos" e "Fechamento Linhas"), consolidado, visão sintética.
//   2. Planilha modelo (aba "Realizado"): Ano | Demonstrativo (BP ou DRE) | Código | Conta | Valor, valores em R$.
// Subir um ano de novo substitui o que havia daquele ano e demonstrativo.
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { abrirPlanilha, ExcelJS, type Planilha } from "../lib/xlsx.mts";
import { auditar, obterVersao } from "./base.mts";
import { inserirLinhas } from "./comum.mts";

export const diasDoAno = (ano: number): number => ((ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 366 : 365);

const DEMONSTRATIVOS = ["BP", "DRE"];

// Contas do Balanço sintético que cada prazo médio usa, e a base da DRE (RL = receita líquida, CPV = custo do produto vendido).
export const PRAZOS: Record<string, [string[], string]> = {
  dias_receber: [["SA08"], "RL"], dias_rotacao: [["SA13"], "CPV"], dias_preparo: [["SA14"], "CPV"], dias_insumos: [["SA11"], "CPV"], dias_lavoura: [["SA12"], "CPV"],
  dias_fornecedores: [["SP07"], "CPV"], dias_outras: [["SP10"], "CPV"], dias_trabalhistas: [["SP11"], "CPV"], dias_impostos: [["SP09"], "DED"],
};
// contas financeiras: não têm prazo, o balanço realizado dá o saldo (R$) de cada ano
export const SALDOS: Record<string, string[]> = {
  saldo_outros_creditos: ["SA09"], saldo_realizavel: ["SA17"], saldo_participacoes: ["SA18"], saldo_intangivel: ["SA27"],
  saldo_consorcios_curto: ["SP13"], saldo_consorcios_longo: ["SP19"], saldo_outras_lp: ["SP20"], saldo_caixa: ["SA07"],
};
const CODIGO_RECEITA_LIQUIDA = "DS018", CODIGO_CPV = "DS020", CODIGO_DEDUCOES = "DS015";

type Linha = [number, string, string, string, number];             // ano, demonstrativo, código, nome, valor (R$)
const pyStr = (x: any): string => (x === null || x === undefined ? "" : x instanceof Date ? x.toISOString().slice(0, 19).replace("T", " ") : String(x));      // str() do Python (data = "AAAA-MM-DD HH:MM:SS")
const falso = (x: any) => x === null || x === undefined || x === "" || x === 0;

// ---------------------------------------------------------------- leitura dos arquivos
export function numero(x: any): number | null {
  if (x === null || x === undefined || x === "") return null;
  if (typeof x === "number") return x;
  let t = String(x).trim().replace("R$", "").replace(/ /g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) && !/^[+-]?(inf|infinity|nan)$/i.test(t)) return null;
  return Number(t);
}

interface Fech { id: any; inicio: string; fim: string; criado: string; }
const primeiroMaximo = <T,>(l: T[], chave: (x: T) => string): T => l.reduce((m, x) => (chave(x) > chave(m) ? x : m));
const diaSeguinte = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + 1)).toISOString().slice(0, 10);

// Fechamentos cujo conjunto cobre de 1º/jan a 31/dez do ano, sem buraco nem sobreposição (um anual, ou 4 trimestres, etc.)
function periodosDoAno(fechs: Fech[]): Fech[] | null {
  const anual = fechs.filter((f) => f.inicio.endsWith("-01-01") && f.fim.endsWith("-12-31"));
  if (anual.length) return [primeiroMaximo(anual, (f) => f.criado)];
  const porInicio = new Map<string, Fech>();
  for (const f of [...fechs].sort((a, b) => (a.criado < b.criado ? -1 : a.criado > b.criado ? 1 : 0))) porInicio.set(`${f.inicio}|${f.fim}`, f);     // refeito: vale o mais recente
  const seq = [...porInicio.values()].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
  if (!seq.length || !seq[0].inicio.endsWith("-01-01") || !seq[seq.length - 1].fim.endsWith("-12-31")) return null;
  for (let i = 0; i + 1 < seq.length; i++) if (seq[i + 1].inicio !== diaSeguinte(seq[i].fim)) return null;
  return seq;
}

// Balanço: fechamento que termina em 31/12. DRE: os fechamentos do ano somados (cada fechamento traz só o seu período).
function doFechamento(wb: Planilha): [Linha[], string[]] {
  const porAno = new Map<number, Fech[]>();
  wb.linhas("Fechamentos").forEach((r, i) => {
    if (i === 0 || falso(r[0]) || falso(r[3]) || falso(r[4])) return;
    const ini = pyStr(r[3]).slice(0, 10), fim = pyStr(r[4]).slice(0, 10);
    if (ini.slice(0, 4) === fim.slice(0, 4)) { const a = +fim.slice(0, 4); if (!porAno.has(a)) porAno.set(a, []); porAno.get(a)!.push({ id: r[0], inicio: ini, fim, criado: pyStr(r[5]) }); }
  });
  const anos = new Map([...porAno].filter(([, f]) => f.some((x) => x.fim.endsWith("-12-31"))));
  if (!anos.size) throw Invalido("Esse arquivo não tem nenhum fechamento terminado em 31/12. Suba o fechamento do 4º trimestre (ou use a planilha modelo).");
  const bpDe = new Map([...anos].map(([a, f]) => [a, primeiroMaximo(f.filter((x) => x.fim.endsWith("-12-31")), (x) => x.criado)]));
  const dreDe = new Map<number, Fech[]>();
  const avisos: string[] = [];
  for (const [a, f] of [...anos].sort((x, y) => x[0] - y[0])) {
    const seq = periodosDoAno(f);
    if (seq) dreDe.set(a, seq);
    else avisos.push(`${a}: a DRE não foi importada porque os fechamentos do arquivo não cobrem o ano inteiro (de 1º/jan a 31/dez, sem buracos). O Balanço foi importado.`);
  }
  const quer = new Set<any>([...bpDe.values()].map((x) => x.id));
  for (const seq of dreDe.values()) for (const x of seq) quer.add(x.id);
  const bpIds = new Map([...bpDe].map(([a, x]) => [x.id, a]));
  const dreIds = new Map<any, number>();
  for (const [a, seq] of dreDe) for (const x of seq) dreIds.set(x.id, a);
  const bp = new Map<string, [number, string, string, number]>(), dre = new Map<string, [number, string, string, number]>();
  wb.linhas("Fechamento Linhas").forEach((r, i) => {
    if (i === 0 || !quer.has(r[0]) || r[1] !== "CONSOLIDADO" || r[5] !== "SINTETICO" || !DEMONSTRATIVOS.includes(r[4])) return;
    const nome = pyStr(r[7]), valor = numero(r[11]);
    if (valor === null || nome.includes("%")) return;                    // linhas de margem (%) não são valores em R$
    if (r[4] === "BP" && bpIds.has(r[0])) { const a = bpIds.get(r[0])!, c = pyStr(r[6]); bp.set(`${a}|${c}`, [a, c, nome, valor]); }
    else if (r[4] === "DRE" && dreIds.has(r[0])) {
      const a = dreIds.get(r[0])!, c = pyStr(r[6]), k = `${a}|${c}`;
      dre.set(k, [a, c, nome, (dre.get(k)?.[3] ?? 0) + valor]);
    }
  });
  return [[...[...bp.values()].map(([a, c, n, v]) => [a, "BP", c, n, v] as Linha), ...[...dre.values()].map(([a, c, n, v]) => [a, "DRE", c, n, v] as Linha)], avisos];
}

// ---------------------------------------------------------------- planilha "Fechamento Financeiro" (Balanco9anos + Comparativo de AV)
export function norm(t: any): string {
  return pyStr(t).normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function casar<T extends { nome: string }>(nome: string, candidatos: T[]): T | null {
  const n = norm(nome);
  for (const c of candidatos) if (norm(c.nome) === n) return c;
  if (n.length >= 10) for (const c of candidatos) { const m = norm(c.nome); if (m.startsWith(n) || n.startsWith(m)) return c; }          // rótulo abreviado
  return null;
}

interface LinhaBp { codigo: string; nome: string; pai: string; }
const paiAvo = (c: LinhaBp, estrutura: LinhaBp[]): string | null => { const pai = estrutura.find((x) => x.codigo === c.pai); return pai ? pai.pai : null; };

async function doFechamentoFinanceiro(bd: Bd, wb: Planilha): Promise<[Linha[], string[], Linha[]]> {
  const bpEstrutura = await bd.q<LinhaBp>("SELECT codigo, nome, pai FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo COLLATE \"C\"");
  const dreEstrutura = await bd.q<{ codigo: string; nome: string }>("SELECT codigo, nome FROM dre_linhas WHERE nivel='sintetica' AND ativa=1 ORDER BY ordem, codigo COLLATE \"C\"");
  if (!bpEstrutura.length || !dreEstrutura.length) throw Invalido("Importe antes a estrutura do Fechamento Contábil na tela DRE (botão 'Importar do Fechamento Contábil'): ela dá os códigos das contas.");
  const hoje = new Date().getFullYear();
  const out: Linha[] = [], avisos: string[] = [], ignorados = new Set<number>(), parcial: Linha[] = [];
  const anosDoCabecalho = (linha: any[]): [number, number][] => linha.flatMap((c, i) => (typeof c === "number" && c >= 1990 && c <= 2100 && Number.isInteger(c) ? [[i, c] as [number, number]] : []));

  // ---- Balanço: ativo à esquerda (rótulo na col. B), passivo à direita (rótulo na col. N)
  let linhas = wb.linhas("Balanco9anos");
  const k0 = linhas.findIndex((r) => anosDoCabecalho(r).length >= 3);
  if (k0 < 0) throw Invalido("Não achei a linha de anos na aba Balanco9anos");
  const cab = anosDoCabecalho(linhas[k0]);
  linhas = linhas.slice(k0);
  for (const [rotuloCol, secaoRaiz] of [[1, "SA"], [13, "SP"]] as [number, string][]) {
    const cols = cab.filter(([i]) => (i < 12) === (rotuloCol === 1));
    const [raizCirc, raizNao] = secaoRaiz === "SA" ? ["SA06", "SA16"] : ["SP06", "SP16"];
    let secao: string | null = null;
    for (const r of linhas.slice(1)) {
      const nome = rotuloCol < r.length ? r[rotuloCol] : null;
      if (!nome || !String(nome).trim()) continue;
      const n = norm(nome);
      let cand: LinhaBp[];
      if (n === "ativototal" || n === "passivototal") cand = bpEstrutura.filter((c) => c.codigo === secaoRaiz);
      else if (n === "circulante") { secao = raizCirc; cand = bpEstrutura.filter((c) => c.codigo === secao); }
      else if (n === "naocirculante") { secao = raizNao; cand = bpEstrutura.filter((c) => c.codigo === secao); }
      else {
        cand = bpEstrutura.filter((c) => c.codigo.startsWith(secaoRaiz) && c.codigo !== raizCirc && c.codigo !== raizNao);
        const achado = casar(nome, cand.filter((c) => c.pai === secao || paiAvo(c, bpEstrutura) === secao)) || casar(nome, cand);
        cand = achado ? [achado] : [];
      }
      if (!cand.length) continue;
      for (const [i, a] of cols) {
        const v = i < r.length ? numero(r[i]) : null;
        if (v === null) continue;
        if (a >= hoje) { ignorados.add(a); parcial.push([a, "BP", cand[0].codigo, cand[0].nome, v]); continue; }
        out.push([a, "BP", cand[0].codigo, cand[0].nome, v]);
      }
    }
  }
  // ---- DRE: percorre a estrutura em ordem, casando cada linha da planilha com a próxima de mesmo nome
  const linhasDre = wb.linhas("Comparativo de AV");
  const k1 = linhasDre.findIndex((r) => anosDoCabecalho(r).length >= 3);
  if (k1 < 0) throw Invalido("Não achei a linha de anos na aba Comparativo de AV");
  const cabDre = anosDoCabecalho(linhasDre[k1]);
  let ponteiro = 0;
  for (const r of linhasDre.slice(k1 + 1)) {
    const nome = r[0];
    if (!nome || !String(nome).trim()) continue;
    const n = norm(nome);
    let achou: { codigo: string; nome: string } | null = null;
    for (let k = ponteiro; k < dreEstrutura.length; k++) if (norm(dreEstrutura[k].nome) === n) { achou = dreEstrutura[k]; ponteiro = k + 1; break; }
    if (!achou) continue;
    for (const [i, a] of cabDre) {
      const v = i < r.length ? numero(r[i]) : null;
      if (v === null) continue;
      if (a >= hoje) { ignorados.add(a); parcial.push([a, "DRE", achou.codigo, achou.nome, v]); continue; }
      out.push([a, "DRE", achou.codigo, achou.nome, v]);
    }
  }
  if (ignorados.size) avisos.push(`${[...ignorados].sort((x, y) => x - y).join(", ")} ainda não está fechado.`);
  return [out, avisos, parcial];
}

function daPlanilha(wb: Planilha): Linha[] {
  const linhas = wb.linhas(wb.abas.includes("Realizado") ? "Realizado" : wb.abas[0]);
  if (!linhas.length) throw Invalido("A planilha está vazia");
  const cab = linhas[0].map((c) => pyStr(c).trim().toLowerCase());
  const col = (...nomes: string[]) => { for (const n of nomes) { const i = cab.findIndex((c) => c.startsWith(n)); if (i >= 0) return i; } return null; };
  const iAno = col("ano"), iDem = col("demonstrativo"), iCod = col("código", "codigo"), iNome = col("conta", "nome"), iVal = col("valor");
  if (iAno === null || iDem === null || iCod === null || iVal === null) throw Invalido("A primeira linha precisa ter as colunas: Ano, Demonstrativo, Código, Conta e Valor");
  const out: Linha[] = [];
  linhas.slice(1).forEach((r, k) => {
    const n = k + 2;
    if (r.every((c) => c === null || c === "")) return;
    const valor = iVal < r.length ? numero(r[iVal]) : null;
    if (valor === null) return;                                         // linha sem valor: simplesmente não entra
    const ano = iAno < r.length ? numero(r[iAno]) : null;
    const dem = pyStr(r[iDem] || "").trim().toUpperCase(), cod = pyStr(r[iCod] || "").trim();
    if (ano === null || !(Math.trunc(ano) >= 1990 && Math.trunc(ano) <= 2100)) throw Invalido(`Linha ${n}: informe o ano (ex.: 2024)`);
    if (!DEMONSTRATIVOS.includes(dem)) throw Invalido(`Linha ${n}: o demonstrativo deve ser BP ou DRE`);
    if (!cod) throw Invalido(`Linha ${n}: informe o código da conta`);
    out.push([Math.trunc(ano), dem, cod, iNome !== null && iNome < r.length ? pyStr(r[iNome] || "") : "", valor]);
  });
  return out;
}

const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const rotuloPeriodo = (mesInicio: number, mesFim: number): string => (mesInicio !== mesFim ? `${MESES_NOME[mesInicio - 1]} a ${MESES_NOME[mesFim - 1]}` : MESES_NOME[mesFim - 1]);

// Meses fechados do ano em andamento, pelo nome do arquivo (ex.: '2t2026' = 2º trimestre = 6 meses)
function mesesDoArquivo(arquivo: string, ano: number): number | null {
  const m = new RegExp(`([1-4])\\s*[tT]\\s*${ano}`).exec(arquivo || "");
  return m ? +m[1] * 3 : null;
}

// O ano em andamento (ex.: jan a jun) entra à parte: aparece na tela Realizado e nos indicadores, mas não alimenta saldo inicial, prazos nem médias.
async function guardarParcial(bd: Bd, parcial: Linha[], arquivo: string, autor: string, meses: number | null, avisos: string[], mesInicio: number | null = null, versaoId: number | null = null) {
  if (!parcial.length) return null;
  const ano = Math.max(...parcial.map((l) => l[0]));
  const linhas = parcial.filter((l) => l[0] === ano);
  meses = meses || mesesDoArquivo(arquivo, ano);
  mesInicio = mesInicio || 1;
  if (meses && !(mesInicio >= 1 && mesInicio <= meses)) throw Invalido("O mês inicial do período não pode ser depois do mês final");
  if (!meses || !(meses >= 1 && meses <= 11)) {
    avisos.push(`${ano} está em andamento e não foi importado: não consegui saber quantos meses estão fechados. Informe o período (ex.: o nome do arquivo com '2t${ano}' para jan a jun).`);
    return null;
  }
  await bd.q("DELETE FROM realizado_parcial WHERE ano=?", [ano]);
  if (versaoId === null) {                                              // orçamento comparado: o aprovado (travado) que tem esse ano
    const [r] = await bd.q("SELECT id FROM versoes WHERE status='aprovado' AND ano_base<=? AND ano_base+horizonte>? ORDER BY id DESC LIMIT 1", [ano, ano]);
    versaoId = r ? r.id : null;
  }
  await bd.q("INSERT INTO realizado_parcial_anos(ano, meses, arquivo, importado_em, importado_por, mes_inicio, versao_id) VALUES(?,?,?,?,?,?,?) "
    + "ON CONFLICT(ano) DO UPDATE SET meses=excluded.meses, arquivo=excluded.arquivo, importado_em=excluded.importado_em, importado_por=excluded.importado_por, "
    + "mes_inicio=excluded.mes_inicio, versao_id=excluded.versao_id", [ano, meses, arquivo, agora(), autor, mesInicio, versaoId]);
  for (const [a, d, c, n, v] of linhas)
    await bd.q("INSERT INTO realizado_parcial(ano, demonstrativo, codigo, nome, valor) VALUES(?,?,?,?,?) ON CONFLICT(ano, demonstrativo, codigo) DO UPDATE SET nome=excluded.nome, valor=excluded.valor", [a, d, c, n, v]);
  avisos.push(`${ano} foi importado como período em andamento (${rotuloPeriodo(mesInicio, meses)}): aparece na tela Realizado, nos indicadores e na comparação com o orçado; não entra nas médias nem nos prazos.`);
  await auditar(bd, autor, null, "importar_realizado_parcial", `${arquivo}: ${ano}, ${meses} meses, ${linhas.length} linhas`);
  return { ano, meses, linhas: linhas.length };
}

const SQL_PRODUTOS_VENDA = "SELECT id, nome, grupo, unidade FROM culturas WHERE ativa=1 AND receita_tipo='operacional' ORDER BY grupo COLLATE \"C\", nome";
// Produtos que vendem (receita operacional): a quantidade vendida de cada um é obrigatória ao importar um período em andamento.
export async function produtosVenda(bd: Bd) {
  return (await bd.q(SQL_PRODUTOS_VENDA)).map((c) => ({ id: c.id, nome: String(c.nome), grupo: c.grupo, unidade: c.unidade }));
}

// Exige a quantidade vendida de todos os produtos (0 para o que não vendeu) e guarda; se faltar, a importação inteira é desfeita.
async function guardarQuantidades(bd: Bd, ano: number, quantidades: Record<number, number> | null, autor: string) {
  const prod = await produtosVenda(bd);
  const q = quantidades || {};
  const faltam = prod.filter((p) => !(p.id in q)).map((p) => p.nome);
  if (faltam.length) throw Invalido("Informe a quantidade vendida de todos os produtos (use 0 para o que não vendeu). Faltam: " + faltam.slice(0, 6).join(", ") + (faltam.length > 6 ? "…" : ""));
  if (Object.values(q).some((v) => v < 0)) throw Invalido("A quantidade vendida não pode ser negativa");
  await bd.q("DELETE FROM realizado_quantidades WHERE ano=?", [ano]);
  await inserirLinhas(bd, "realizado_quantidades", ["ano", "cultura_id", "quantidade"], prod.map((p) => [ano, p.id, Number(q[p.id])]));
  await auditar(bd, autor, null, "salvar_quantidades_realizado", `${ano}: ${prod.length} produtos`);
}

export async function importar(bd: Bd, conteudo: Uint8Array, arquivo: string, autor: string, anoInicial: number | null = null, mesesParcial: number | null = null,
  mesInicio: number | null = null, versaoId: number | null = null, quantidades: Record<number, number> | null = null) {
  let wb: Planilha;
  try { wb = await abrirPlanilha(conteudo); }
  catch { throw Invalido("Não consegui abrir o arquivo. Use o banco do Fechamento Contábil ou a planilha modelo (.xlsx)."); }
  let parcial: Linha[] = [], linhas: Linha[], avisos: string[];
  if (wb.abas.includes("Balanco9anos") && wb.abas.includes("Comparativo de AV")) [linhas, avisos, parcial] = await doFechamentoFinanceiro(bd, wb);
  else if (wb.abas.includes("Fechamento Linhas") && wb.abas.includes("Fechamentos")) [linhas, avisos] = doFechamento(wb);
  else { linhas = daPlanilha(wb); avisos = []; }
  const parcialInfo = await guardarParcial(bd, parcial, arquivo, autor, mesesParcial, avisos, mesInicio, versaoId);
  if (parcialInfo) await guardarQuantidades(bd, parcialInfo.ano, quantidades, autor);
  if (anoInicial) linhas = linhas.filter((l) => l[0] >= anoInicial);
  if (!linhas.length) throw Invalido("Não encontrei nenhum valor para importar nesse arquivo");
  const nomes = new Map((await bd.q("SELECT 'BP' AS demonstrativo, codigo, nome FROM bp_linhas UNION ALL SELECT 'DRE', codigo, nome FROM dre_linhas WHERE nivel='sintetica'")).map((r) => [`${r.demonstrativo}|${r.codigo}`, r.nome as string]));
  const duplicadas = new Set<string>(), vistos = new Set<string>();
  for (const [ano, dem, cod] of linhas) { const k = `${ano}|${dem}|${cod}`; if (vistos.has(k)) duplicadas.add(`${dem} ${cod} (${ano})`); vistos.add(k); }
  if (duplicadas.size) throw Invalido("Há contas repetidas no mesmo ano: " + [...duplicadas].sort().slice(0, 8).join(", "));
  const hora = agora();
  const pares = [...new Map(linhas.map(([a, d]) => [`${a}|${d}`, [a, d] as [number, string]])).values()].sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  for (const [ano, dem] of pares) {
    await bd.q("DELETE FROM realizado WHERE ano=? AND demonstrativo=?", [ano, dem]);
    await bd.q("INSERT INTO realizado_anos(ano, demonstrativo, arquivo, importado_em, importado_por) VALUES(?,?,?,?,?) "
      + "ON CONFLICT(ano, demonstrativo) DO UPDATE SET arquivo=excluded.arquivo, importado_em=excluded.importado_em, importado_por=excluded.importado_por", [ano, dem, arquivo, hora, autor]);
  }
  await inserirLinhas(bd, "realizado", ["ano", "demonstrativo", "codigo", "nome", "valor"], linhas.map(([a, d, c, n, v]) => [a, d, c, n || nomes.get(`${d}|${c}`) || "", v]));
  const anos = [...new Set(pares.map((p) => p[0]))].sort((a, b) => a - b);
  await auditar(bd, autor, null, "importar_realizado", `${arquivo}: anos ${anos.join(", ")}, ${linhas.length} linhas`);
  return { anos, linhas: linhas.length, avisos, parcial: parcialInfo, demonstrativos: pares.map(([a, d]) => ({ ano: a, demonstrativo: d })) };
}

export async function excluirAno(bd: Bd, ano: number, autor: string): Promise<void> {
  if ((await bd.q("SELECT 1 FROM realizado_parcial_anos WHERE ano=?", [ano])).length) {          // ano em andamento (jan a jun...)
    await bd.q("DELETE FROM realizado_parcial WHERE ano=?", [ano]);
    await bd.q("DELETE FROM realizado_quantidades WHERE ano=?", [ano]);
    await bd.q("DELETE FROM realizado_parcial_anos WHERE ano=?", [ano]);
    await auditar(bd, autor, null, "excluir_realizado", `${ano} (em andamento)`);
    return;
  }
  if (!(await bd.q("SELECT 1 FROM realizado_anos WHERE ano=?", [ano])).length) throw NaoEncontrado(`Não há realizado de ${ano}`);
  await bd.q("DELETE FROM realizado WHERE ano=?", [ano]);
  await bd.q("DELETE FROM realizado_anos WHERE ano=?", [ano]);
  await bd.q("DELETE FROM realizado_quantidades WHERE ano=?", [ano]);
  await auditar(bd, autor, null, "excluir_realizado", String(ano));
}

// ---------------------------------------------------------------- consulta
export type Valores = Record<string, Record<string, Record<number, number>>>;
export async function valores(bd: Bd): Promise<Valores> {
  const d: Valores = { BP: {}, DRE: {} };
  for (const r of await bd.q("SELECT ano, demonstrativo, codigo, valor FROM realizado")) ((d[r.demonstrativo][r.codigo] ??= {})[r.ano] = r.valor);
  return d;
}

// Linhas do demonstrativo na ordem da estrutura importada; contas realizadas fora da estrutura vão no fim.
async function estrutura(bd: Bd, dem: string, val: Record<string, Record<number, number>>) {
  const sql = dem === "BP" ? "SELECT codigo, nome, pai, tipo FROM bp_linhas ORDER BY ordem, codigo COLLATE \"C\"" : "SELECT codigo, nome, pai, tipo FROM dre_linhas WHERE nivel='sintetica' ORDER BY ordem, codigo COLLATE \"C\"";
  const base: { codigo: string; nome: string; pai: string | null; tipo: string }[] = await bd.q(sql);
  const nomes = new Map((await bd.q("SELECT codigo, nome FROM realizado WHERE demonstrativo=? AND nome<>''", [dem])).map((r) => [r.codigo as string, r.nome as string]));
  const conhecidos = new Set(base.map((l) => l.codigo));
  for (const cod of Object.keys(val).filter((c) => !conhecidos.has(c)).sort()) base.push({ codigo: cod, nome: nomes.get(cod) ?? cod, pai: null, tipo: "account" });
  const pai = new Map(base.map((l) => [l.codigo, l.pai]));
  const nivel = (c: string) => { let n = 0; const vistos = new Set<string>(); while (pai.get(c) && !vistos.has(pai.get(c)!)) { vistos.add(c); c = pai.get(c)!; n++; } return n; };
  return base.map((l) => ({ codigo: l.codigo, nome: l.nome, tipo: l.tipo, nivel: nivel(l.codigo) }));
}

export async function ler(bd: Bd) {
  const val = await valores(bd);
  const linhasAnos = await bd.q("SELECT * FROM realizado_anos");
  const anos = [...new Set(linhasAnos.map((r) => r.ano as number))].sort((a, b) => a - b);
  const porAno = Object.fromEntries(anos.map((a) => [a, Object.fromEntries(linhasAnos.filter((r) => r.ano === a).map((r) => [r.demonstrativo, { arquivo: r.arquivo, importado_em: r.importado_em, importado_por: r.importado_por }]))]));
  const tabela = async (dem: string) => {
    const out: any[] = [];
    for (const l of await estrutura(bd, dem, val[dem])) {
      const v = Object.fromEntries(anos.map((a) => [a, val[dem][l.codigo] && a in val[dem][l.codigo] ? val[dem][l.codigo][a] / 1000 : null]));
      if (Object.values(v).some((x) => x !== null)) out.push({ ...l, valores: v });
    }
    return out;
  };
  const parcial = await parcialDoAno(bd);
  const bp = await tabela("BP"), dre = await tabela("DRE");
  if (parcial) for (const [linhas, dem] of [[bp, "BP"], [dre, "DRE"]] as [any[], string][]) for (const l of linhas) l.parcial = (parcial as any)[dem][l.codigo] ?? null;
  return { anos, importacoes: porAno, bp, dre, prazos: await prazos(bd), ultimo_ano: await ultimoAno(bd),
    parcial: parcial ? { ano: parcial.ano, meses: parcial.meses, mes_inicio: parcial.mes_inicio, versao_id: parcial.versao_id, periodo: rotuloPeriodo(parcial.mes_inicio, parcial.meses), arquivo: parcial.arquivo, importado_em: parcial.importado_em } : null };
}

// Ano em andamento importado (ex.: jan a jun de 2026): valores em R$ mil por demonstrativo e código.
export async function parcialDoAno(bd: Bd) {
  const [r] = await bd.q("SELECT * FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1");
  if (!r) return null;
  const v: { BP: Record<string, number>; DRE: Record<string, number> } = { BP: {}, DRE: {} };
  for (const x of await bd.q("SELECT demonstrativo, codigo, valor FROM realizado_parcial WHERE ano=?", [r.ano])) (v as any)[x.demonstrativo][x.codigo] = x.valor / 1000;
  return { ano: r.ano as number, meses: r.meses as number, mes_inicio: r.mes_inicio as number, versao_id: r.versao_id as number | null, arquivo: r.arquivo as string, importado_em: r.importado_em as string, ...v };
}

// Realizado de um ano importado para comparar com o orçamento: o ano em andamento (com o período) ou um ano fechado (jan a dez), em R$ mil.
export async function periodoDoAno(bd: Bd, ano: number) {
  const p = await parcialDoAno(bd);
  if (p && p.ano === ano) return p;
  if (!(await bd.q("SELECT 1 FROM realizado_anos WHERE ano=?", [ano])).length) return null;
  const v: { BP: Record<string, number>; DRE: Record<string, number> } = { BP: {}, DRE: {} };
  for (const x of await bd.q("SELECT demonstrativo, codigo, valor FROM realizado WHERE ano=?", [ano])) (v as any)[x.demonstrativo][x.codigo] = x.valor / 1000;
  return { ano, meses: 12, mes_inicio: 1, versao_id: null as number | null, arquivo: "", importado_em: "", ...v };
}

// Importações que podem ser comparadas com um orçamento: cada ano fechado e o ano em andamento (com o período).
export async function importacoesComparaveis(bd: Bd) {
  const out: any[] = (await quantidadesPorAno(bd)).anos.map((a: any) => ({ ano: a.ano, rotulo: a.rotulo, parcial: !!a.parcial, temDRE: true }));
  for (const o of out) o.temDRE = !!(await bd.q("SELECT 1 FROM realizado WHERE ano=? AND demonstrativo='DRE' UNION SELECT 1 FROM realizado_parcial WHERE ano=? AND demonstrativo='DRE'", [o.ano, o.ano])).length;
  return out.filter((o) => o.temDRE);
}

// Último ano que tem BP e DRE realizados (os dois são necessários para calcular prazos).
export async function ultimoAno(bd: Bd): Promise<number | null> {
  const [r] = await bd.q("SELECT MAX(ano) AS a FROM realizado_anos WHERE demonstrativo='BP' AND ano IN (SELECT ano FROM realizado_anos WHERE demonstrativo='DRE')");
  return r.a;
}

// Prazos médios realizados (em dias) por ano: saldo do balanço ÷ (base do ano ÷ dias do ano). Mesma lógica da projeção, ao contrário.
export async function prazos(bd: Bd) {
  const val = await valores(bd);
  const anosBp = new Set(Object.values(val.BP).flatMap((c) => Object.keys(c).map(Number))), anosDre = new Set(Object.values(val.DRE).flatMap((c) => Object.keys(c).map(Number)));
  const anos = [...anosBp].filter((a) => anosDre.has(a)).sort((a, b) => a - b);
  const rl = val.DRE[CODIGO_RECEITA_LIQUIDA] ?? {}, cpv = val.DRE[CODIGO_CPV] ?? {}, ded = val.DRE[CODIGO_DEDUCOES] ?? {};
  const campos: Record<string, Record<number, number | null>> = {}, detalhe: Record<string, Record<number, any>> = {};
  for (const k of Object.keys(PRAZOS)) { campos[k] = {}; detalhe[k] = {}; }
  const soma = (cs: string[], a: number) => cs.reduce((t, c) => t + (val.BP[c]?.[a] ?? 0), 0);
  const saldos: Record<string, Record<number, number>> = {};
  for (const [k, cs] of Object.entries(SALDOS)) saldos[k] = Object.fromEntries(anos.map((a) => [a, soma(cs, a) / 1000]));
  const base: Record<string, Record<number, number>> = { RL: {}, CPV: {}, DED: {} };
  for (const a of anos) { base.RL[a] = rl[a] ?? 0; base.CPV[a] = -(cpv[a] ?? 0); base.DED[a] = -(ded[a] ?? 0); }
  for (const a of anos) {
    for (const [campo, [contas, b]] of Object.entries(PRAZOS)) {
      const saldo = soma(contas, a), x = base[b][a];
      campos[campo][a] = x > 0 ? saldo / (x / diasDoAno(a)) : null;
      if (x > 0) detalhe[campo][a] = { saldo, base: x, dias_ano: diasDoAno(a) };                  // sem base no ano não há cálculo a mostrar
    }
  }
  return { anos, campos, base, detalhe, saldos };
}

// Valor realizado de uma conta em um ano, em R$ mil (null se não houver). Ano em andamento (ex.: jan a jun): o valor do período é anualizado (× 12 ÷ meses).
export async function valorRealizado(bd: Bd, demonstrativo: string, codigo: string, ano: number): Promise<number | null> {
  const [r] = await bd.q("SELECT valor FROM realizado WHERE demonstrativo=? AND codigo=? AND ano=?", [demonstrativo, codigo, ano]);
  if (r) return r.valor / 1000;
  const [p] = await bd.q("SELECT p.valor, a.meses, a.mes_inicio FROM realizado_parcial p JOIN realizado_parcial_anos a ON a.ano=p.ano WHERE p.demonstrativo=? AND p.codigo=? AND p.ano=?", [demonstrativo, codigo, ano]);
  return p ? ((p.valor / 1000) * 12) / (p.meses - p.mes_inicio + 1) : null;
}

export const NCG_ATIVO = ["SA08", "SA13", "SA14", "SA10", "SA11", "SA12"];           // as mesmas contas que o Capital de giro projeta
export const NCG_PASSIVO = ["SP07", "SP09", "SP10", "SP11"];

// Balanço realizado mais recente anterior ao primeiro ano da versão (R$ mil por código), com a NCG real dessas contas.
export async function saldoInicial(bd: Bd, primeiroAno: number): Promise<{ ano: number; meses: number | null; valores: Record<string, number>; ncg: number } | null> {
  const [r] = await bd.q("SELECT MAX(ano) AS a FROM realizado WHERE demonstrativo='BP' AND ano<?", [primeiroAno]);
  const [parcial] = await bd.q("SELECT ano, meses FROM realizado_parcial_anos WHERE ano<? ORDER BY ano DESC LIMIT 1", [primeiroAno]);
  let ano: number, meses: number | null, v: Record<string, number>;
  if (parcial && (r.a === null || parcial.ano > r.a)) {                  // ano em andamento mais recente (ex.: balanço de 30/06): é o ponto de partida
    ano = parcial.ano; meses = parcial.meses;
    v = Object.fromEntries((await bd.q("SELECT codigo, valor FROM realizado_parcial WHERE demonstrativo='BP' AND ano=?", [ano])).map((x) => [x.codigo, x.valor / 1000]));
  } else if (r.a === null) return null;
  else {
    ano = r.a; meses = null;
    v = Object.fromEntries((await bd.q("SELECT codigo, valor FROM realizado WHERE demonstrativo='BP' AND ano=?", [ano])).map((x) => [x.codigo, x.valor / 1000]));
  }
  const ncg = NCG_ATIVO.reduce((t, c) => t + (v[c] ?? 0), 0) - NCG_PASSIVO.reduce((t, c) => t + (v[c] ?? 0), 0);
  return { ano, meses, valores: v, ncg };
}

// ---------------------------------------------------------------- período em andamento: orçamento comparado e quantidades vendidas
export async function periodo(bd: Bd) {
  const [r] = await bd.q("SELECT * FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1");
  if (!r) return null;
  const q = new Map((await bd.q("SELECT cultura_id, quantidade FROM realizado_quantidades WHERE ano=?", [r.ano])).map((x) => [x.cultura_id as number, x.quantidade as number]));
  const produtos = (await bd.q(SQL_PRODUTOS_VENDA)).map((c) => ({ id: c.id, nome: String(c.nome), grupo: c.grupo, unidade: c.unidade, quantidade: q.get(c.id) ?? null }));
  const versoes = (await bd.q("SELECT id, nome, status, tipo FROM versoes WHERE ano_base<=? AND ano_base+horizonte>? ORDER BY (status='aprovado') DESC, id", [r.ano, r.ano])).map((v) => ({ id: v.id, nome: v.nome, status: v.status, tipo: v.tipo }));
  return { ano: r.ano, mes_inicio: r.mes_inicio, mes_fim: r.meses, periodo: rotuloPeriodo(r.mes_inicio, r.meses), versao_id: r.versao_id, arquivo: r.arquivo, produtos, versoes };
}

export async function salvarPeriodo(bd: Bd, mesInicio: number, mesFim: number, versaoId: number | null, autor: string): Promise<void> {
  const [r] = await bd.q("SELECT ano FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1");
  if (!r) throw Invalido("Não há realizado em andamento. Suba o fechamento do período na tela Realizado.");
  if (!(mesInicio >= 1 && mesInicio <= mesFim && mesFim <= 12)) throw Invalido("Informe o período: o mês inicial não pode ser depois do final");
  if (versaoId !== null && versaoId !== undefined) await obterVersao(bd, versaoId);
  await bd.q("UPDATE realizado_parcial_anos SET mes_inicio=?, meses=?, versao_id=? WHERE ano=?", [mesInicio, mesFim, versaoId ?? null, r.ano]);
  await auditar(bd, autor, versaoId ?? null, "salvar_periodo_realizado", `${r.ano}: ${rotuloPeriodo(mesInicio, mesFim)}`);
}

// Quantidade vendida de cada produto por ano importado (anos fechados e o ano em andamento, com o período).
export async function quantidadesPorAno(bd: Bd) {
  const anos: any[] = (await bd.q("SELECT DISTINCT ano FROM realizado_anos ORDER BY ano")).map((r) => ({ ano: r.ano, rotulo: String(r.ano) }));
  const [p] = await bd.q("SELECT ano, mes_inicio, meses FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1");
  if (p && !anos.some((a) => a.ano === p.ano)) anos.push({ ano: p.ano, rotulo: `${p.ano} · ${rotuloPeriodo(p.mes_inicio || 1, p.meses)}`, parcial: true });
  else if (p) for (const a of anos) if (a.ano === p.ano) { a.rotulo = `${p.ano} · ${rotuloPeriodo(p.mes_inicio || 1, p.meses)}`; a.parcial = true; }
  const q: Record<number, Record<number, number>> = {};
  for (const x of await bd.q("SELECT ano, cultura_id, quantidade FROM realizado_quantidades")) (q[x.cultura_id] ??= {})[x.ano] = x.quantidade;
  return { anos, produtos: (await produtosVenda(bd)).map((pr) => ({ ...pr, valores: q[pr.id] ?? {} })) };
}

export async function salvarQuantidade(bd: Bd, culturaId: number, quantidade: number | null, autor: string, ano: number | null = null): Promise<void> {
  if (ano === null || ano === undefined) {                                // sem ano: o do período em andamento
    const [r] = await bd.q("SELECT ano FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1");
    if (!r) throw Invalido("Não há realizado em andamento. Suba o fechamento do período na tela Realizado.");
    ano = r.ano;
  } else if (!((await bd.q("SELECT 1 FROM realizado_anos WHERE ano=?", [ano])).length || (await bd.q("SELECT 1 FROM realizado_parcial_anos WHERE ano=?", [ano])).length)) throw Invalido(`Não há realizado importado de ${ano}`);
  if (quantidade !== null && quantidade !== undefined && quantidade < 0) throw Invalido("A quantidade vendida não pode ser negativa");
  const [c] = await bd.q("SELECT nome FROM culturas WHERE id=?", [culturaId]);
  if (!c) throw NaoEncontrado("Produto não encontrado");
  if (quantidade === null || quantidade === undefined) await bd.q("DELETE FROM realizado_quantidades WHERE ano=? AND cultura_id=?", [ano, culturaId]);
  else await bd.q("INSERT INTO realizado_quantidades(ano, cultura_id, quantidade) VALUES(?,?,?) ON CONFLICT(ano, cultura_id) DO UPDATE SET quantidade=excluded.quantidade", [ano, culturaId, quantidade]);
  await auditar(bd, autor, null, "salvar_quantidade_realizado", `${ano} ${c.nome}: ${quantidade ?? "None"}`);
}

// ---------------------------------------------------------------- planilha modelo
export async function modelo(bd: Bd): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Realizado");
  ws.addRow(["Ano", "Demonstrativo", "Código", "Conta", "Valor"]).font = { bold: true };
  const ano = new Date().getFullYear() - 1;
  for (const [dem, sql] of [["BP", "SELECT codigo, nome, tipo FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo COLLATE \"C\""], ["DRE", "SELECT codigo, nome, tipo FROM dre_linhas WHERE nivel='sintetica' AND ativa=1 ORDER BY ordem, codigo COLLATE \"C\""]])
    for (const r of await bd.q(sql)) if (!String(r.nome).includes("%")) ws.addRow([ano, dem, r.codigo, r.nome, null]);
  ws.getColumn("B").width = 14; ws.getColumn("D").width = 52;
  const ajuda = wb.addWorksheet("Como preencher");
  for (const linha of ["Preencha só a coluna Valor, em R$ (não em R$). Linhas sem valor são ignoradas.",
    "Troque a coluna Ano pelo ano do fechamento e copie as linhas para cada ano que quiser subir.",
    "BP = Balanço patrimonial no dia 31/12 · DRE = resultado do ano inteiro (janeiro a dezembro).",
    "Receitas positivas, custos e despesas negativos (como na DRE do sistema).",
    "Subir um ano de novo substitui o que já estava lá."]) ajuda.addRow([linha]);
  ajuda.getColumn("A").width = 100;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
