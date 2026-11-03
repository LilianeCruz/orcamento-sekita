// Base de dívidas: importa o 'Endividamento alterado.xlsx' (gerado pelo sistema de Endividamento) e resume os títulos em aberto por ano, mês, banco e tipo.
// Cada importação é uma foto; a versão do orçamento aponta para uma delas, para o Orçado aprovado não mudar quando houver base mais nova.
// Porte de app/servicos/dividas.py.
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { abrirPlanilha } from "../lib/xlsx.mts";
import { auditar, obterVersao, versaoEditavel, anosDaVersao } from "./base.mts";
import { inserirLinhas } from "./comum.mts";

// no Netlify não há arquivo local: o caminho padrão só existe se a variável estiver definida (no sistema em Python é a pasta do Endividamento)
export const arquivoPadrao = (): string => process.env.ENDIVIDAMENTO_ARQUIVO || "";
export const arquivoPadraoExiste = () => !!arquivoPadrao() && existsSync(arquivoPadrao());

// grupos de empresas do modelo: Agropecuária = MESO + AFAL; Transportadora = ST + TAL
const EMPRESAS: Record<string, string[] | null> = { agro: ["MESO", "AFAL"], transp: ["ST", "TAL"], todas: null };
const TIPO_PARA_GRUPO: Record<string, string> = { investimento: "investimento", custeio: "capital_giro", "capital de giro": "capital_giro", egf: "capital_giro" };
const OBRIGATORIAS = ["Situação", "Empresa", "Tipo", "Banco", "Data Vencimento", "Vr. Principal", "Vr. Juros"];
const GRUPOS3 = ["capital_giro", "investimento", "indefinido"];

// ---------------------------------------------------------------- leitura do arquivo
const iso = (d: Date) => d.toISOString().slice(0, 10);
const validaData = (a: number, m: number, d: number): string | null => {
  const x = new Date(Date.UTC(a, m - 1, d));
  return a >= 1 && a <= 9999 && x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? iso(x) : null;
};
// (data ISO, veio_como_texto). Aceita data e texto dd/mm/aaaa.
function dataDe(v: any): [string | null, boolean] {
  if (v instanceof Date) return [iso(v), false];
  if (typeof v === "string" && v.trim()) {
    const t = v.trim();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (m) { const r = validaData(+m[3], +m[2], +m[1]); if (r) return [r, true]; }
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (m) { const r = validaData(+m[1], +m[2], +m[3]); if (r) return [r, true]; }
  }
  return [null, false];
}

const pyFloat = (t: string): number | null => {
  t = t.trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) ? Number(t) : /^[+-]?(inf|infinity)$/i.test(t) ? (t.startsWith("-") ? -Infinity : Infinity) : /^[+-]?nan$/i.test(t) ? NaN : null;
};
function num(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const r = pyFloat(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v); return r === null ? 0 : r; }
  return 0;
}
const txt = (v: any): string => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v).trim());

export async function lerPlanilha(conteudo: Uint8Array): Promise<[any[], string[]]> {
  let wb;
  try { wb = await abrirPlanilha(conteudo); } catch { throw Invalido("Não consegui abrir o arquivo. Use o 'Endividamento alterado.xlsx' do sistema de Endividamento."); }
  if (!wb.abas.includes("Dados")) throw Invalido("O arquivo não tem a aba 'Dados'. Use o 'Endividamento alterado.xlsx' do sistema de Endividamento.");
  const linhas = wb.linhas("Dados");
  const cab = (linhas[0] ?? []).map(txt);
  const faltam = OBRIGATORIAS.filter((h) => !cab.includes(h));
  if (faltam.length) throw Invalido("Faltam colunas na aba 'Dados': " + faltam.join(", "));
  const ix = new Map<string, number>();
  cab.forEach((h, i) => { if (h) ix.set(h, i); });
  const titulos: any[] = [], avisos: string[] = [];
  let comoTexto = 0, semVenc = 0, tipoDesc = 0;
  for (const r of linhas.slice(1)) {
    if (r.every((c) => c === null)) continue;
    const g = (k: string) => (ix.has(k) && ix.get(k)! < r.length ? r[ix.get(k)!] : null);
    const situacao = txt(g("Situação")).toUpperCase();
    if (situacao !== "AB" && situacao !== "PG") continue;
    const tipo = txt(g("Tipo"));
    const grupo = TIPO_PARA_GRUPO[tipo.toLowerCase()] ?? "indefinido";
    let [venc, texto] = dataDe(g("Data Vencimento"));
    if (venc === null && ["Dia Vencimento", "Mês Vencimento", "Ano Vencimento"].every((k) => g(k) !== null)) {
      const n = (k: string) => { const x = g(k); return typeof x === "number" ? Math.trunc(x) : /^\s*[+-]?\d+\s*$/.test(String(x)) ? Number(x) : NaN; };
      const r2 = validaData(n("Ano Vencimento"), n("Mês Vencimento"), n("Dia Vencimento"));
      if (r2) { venc = r2; texto = true; }
    }
    const [operacao] = dataDe(g("Data Operação"));
    const taxa = g("Juros");
    const doc = txt(g("Número do Documento"));
    const principal = num(g("Vr. Principal")), juros = num(g("Vr. Juros")), outras = num(g("Vr. Outras Despesas"));
    titulos.push({
      situacao, empresa: txt(g("Empresa")).toUpperCase(), tipo, grupo, banco: txt(g("Banco")), tipo_recurso: txt(g("Tipo do Recurso")), linha_credito: txt(g("Linha de Crédito")),
      documento: doc, contrato: doc.split("/")[0].trim(), taxa: typeof taxa === "number" ? taxa : null, data_operacao: operacao, data_vencimento: venc,
      principal, juros, outras_despesas: outras, bruto: num(g("Vr. Bruto Aberto")) || principal + juros + outras, produto: txt(g("PRODUTO")), observacao: txt(g("Observação")),
    });
    if (situacao === "AB") { comoTexto += texto ? 1 : 0; semVenc += venc === null ? 1 : 0; tipoDesc += grupo === "indefinido" ? 1 : 0; }
  }
  if (!titulos.length) throw Invalido("A aba 'Dados' não tem nenhum título (situação AB ou PG).");
  if (comoTexto) avisos.push(`${comoTexto} vencimento(s) em aberto estavam como texto e foram convertidos em data`);
  if (semVenc) avisos.push(`${semVenc} título(s) em aberto estão sem data de vencimento e não entram nos totais por ano`);
  if (tipoDesc) avisos.push(`${tipoDesc} título(s) em aberto têm um tipo desconhecido e ficaram fora de capital de giro e investimento`);
  return [titulos, avisos];
}

// ---------------------------------------------------------------- importação
export async function importar(bd: Bd, conteudo: Uint8Array, nomeArquivo: string, vid: number | null, autor: string) {
  if (vid !== null && vid !== undefined) await versaoEditavel(bd, vid);                 // falha antes de ler o arquivo se a versão estiver travada
  const [titulos, avisos] = await lerPlanilha(conteudo);
  const abertos = titulos.filter((t) => t.situacao === "AB").length;
  const [{ id: iid }] = await bd.q("INSERT INTO divida_importacoes(arquivo, importado_em, autor, qtd_titulos, qtd_abertos, avisos) VALUES(?,?,?,?,?,?) RETURNING id", [nomeArquivo, agora(), autor, titulos.length, abertos, avisos.join("\n")]);
  await inserirLinhas(bd, "divida_titulos", ["importacao_id", "situacao", "empresa", "tipo", "grupo", "banco", "tipo_recurso", "linha_credito", "documento", "contrato", "taxa", "data_operacao", "data_vencimento", "principal", "juros", "outras_despesas", "bruto", "produto", "observacao"],
    titulos.map((t) => [iid, t.situacao, t.empresa, t.tipo, t.grupo, t.banco, t.tipo_recurso, t.linha_credito, t.documento, t.contrato, t.taxa, t.data_operacao, t.data_vencimento, t.principal, t.juros, t.outras_despesas, t.bruto, t.produto, t.observacao]));
  await auditar(bd, autor, vid ?? null, "importar_dividas", `${nomeArquivo}: ${titulos.length} títulos`);
  if (vid !== null && vid !== undefined) await bd.q("UPDATE versoes SET divida_importacao_id=? WHERE id=?", [iid, vid]);
  return { importacao_id: iid, titulos: titulos.length, abertos, avisos };
}

export async function importarArquivoPadrao(bd: Bd, vid: number | null, autor: string) {
  if (!arquivoPadraoExiste()) throw Invalido(`Não encontrei o arquivo do sistema de Endividamento em ${arquivoPadrao()}. Use 'Escolher arquivo…'.`);
  return importar(bd, readFileSync(arquivoPadrao()), basename(arquivoPadrao()), vid, autor);
}

const comAvisos = (r: any) => ({ ...r, avisos: String(r.avisos).split("\n").filter((x) => x) });
export async function listarImportacoes(bd: Bd) { return (await bd.q("SELECT * FROM divida_importacoes ORDER BY id DESC")).map(comAvisos); }

export async function vincular(bd: Bd, vid: number, importacaoId: number | null, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  if (importacaoId !== null && importacaoId !== undefined && !(await bd.q("SELECT 1 FROM divida_importacoes WHERE id=?", [importacaoId])).length) throw NaoEncontrado(`Importação ${importacaoId} não existe`);
  await bd.q("UPDATE versoes SET divida_importacao_id=? WHERE id=?", [importacaoId ?? null, vid]);
  await auditar(bd, autor, vid, "vincular_base_dividas", importacaoId === null || importacaoId === undefined ? "None" : String(importacaoId));
}

// ---------------------------------------------------------------- resumo
// Uma ou mais siglas de empresa separadas por vírgula (MESO, AFAL, ST...; vários = soma) ou, por compatibilidade, os grupos 'agro', 'transp' e 'todas'.
function filtro(empresas: string): [string, any[]] {
  if (empresas in EMPRESAS) {
    const siglas = EMPRESAS[empresas];
    if (!siglas) return ["", []];
    return [` AND empresa IN (${siglas.map(() => "?").join(",")})`, [...siglas]];
  }
  const siglas = (empresas || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => x);
  if (!siglas.length) throw Invalido("Informe a empresa");
  if (siglas.length === 1) return [" AND empresa=?", siglas];
  return [` AND empresa IN (${siglas.map(() => "?").join(",")})`, siglas];             // várias empresas: os números são a soma delas
}

// Empresas que têm títulos em aberto na base, da maior para a menor dívida.
export async function empresasDaBase(bd: Bd, importacaoId: number) {
  return bd.q("SELECT empresa AS sigla, COUNT(*) AS titulos, SUM(principal) AS principal, SUM(juros) AS juros FROM divida_titulos WHERE importacao_id=? AND situacao='AB' GROUP BY empresa ORDER BY principal DESC, empresa COLLATE \"C\" DESC", [importacaoId]);
}

async function importacaoDaVersao(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  if (!v.divida_importacao_id) return null;
  const [r] = await bd.q("SELECT * FROM divida_importacoes WHERE id=?", [v.divida_importacao_id]);
  return r ? comAvisos(r) : null;
}

const ANO = "substr(data_vencimento, 1, 4)", MES = "substr(data_vencimento, 6, 2)";

export async function resumo(bd: Bd, vid: number, empresas = "agro") {
  const v = await obterVersao(bd, vid);
  const anosVersao = anosDaVersao(v);
  const imp = await importacaoDaVersao(bd, vid);
  const base: any = { versao: v, empresas, importacao: imp, anos_versao: anosVersao, empresas_disponiveis: [] };
  if (!imp) return { ...base, total: null, por_ano: {}, por_banco: [], por_tipo: [], sem_vencimento: null };
  const disponiveis = await empresasDaBase(bd, imp.id);
  base.empresas_disponiveis = disponiveis;
  if (!empresas) empresas = disponiveis.length ? disponiveis[0].sigla : "todas";           // sem escolha: começa pela empresa de maior dívida
  base.empresas = empresas;
  const [f, args] = filtro(empresas);
  const onde = "importacao_id=? AND situacao='AB'" + f, params = [imp.id, ...args];
  const [t] = await bd.q(`SELECT COUNT(*) AS n, COALESCE(SUM(principal),0) AS p, COALESCE(SUM(juros),0) AS j, COALESCE(SUM(outras_despesas),0) AS o FROM divida_titulos WHERE ${onde}`, params);
  const [tx] = await bd.q(`SELECT SUM(principal*taxa)/SUM(principal) AS tx FROM divida_titulos WHERE ${onde} AND taxa IS NOT NULL AND principal>0`, params);
  const total = { titulos: t.n, principal: t.p, juros: t.j, outras_despesas: t.o, taxa_media: tx.tx ?? null };
  let porAno: Record<string, any> = {};
  for (const r of await bd.q(`SELECT ${ANO} AS ano, grupo, SUM(principal) AS p, SUM(juros) AS j, COUNT(*) AS n FROM divida_titulos WHERE ${onde} AND data_vencimento IS NOT NULL GROUP BY ${ANO}, grupo`, params)) {
    const a = (porAno[r.ano] ??= { capital_giro: { principal: 0, juros: 0 }, investimento: { principal: 0, juros: 0 }, indefinido: { principal: 0, juros: 0 }, titulos: 0 });
    a[r.grupo].principal += r.p; a[r.grupo].juros += r.j; a.titulos += r.n;
  }
  for (const a of Object.values(porAno)) { a.principal = GRUPOS3.reduce((s, g) => s + a[g].principal, 0); a.juros = GRUPOS3.reduce((s, g) => s + a[g].juros, 0); }
  porAno = Object.fromEntries(Object.entries(porAno).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  const porBanco = await bd.q(`SELECT banco, COUNT(*) AS titulos, SUM(principal) AS principal, SUM(juros) AS juros FROM divida_titulos WHERE ${onde} GROUP BY banco ORDER BY principal DESC, banco COLLATE "C" DESC`, params);
  const porTipo = await bd.q(`SELECT tipo, grupo, COUNT(*) AS titulos, SUM(principal) AS principal, SUM(juros) AS juros FROM divida_titulos WHERE ${onde} GROUP BY tipo, grupo ORDER BY principal DESC, tipo COLLATE "C" DESC, grupo COLLATE "C" DESC`, params);
  const [sv] = await bd.q(`SELECT COUNT(*) AS n, COALESCE(SUM(principal),0) AS p, COALESCE(SUM(juros),0) AS j FROM divida_titulos WHERE ${onde} AND data_vencimento IS NULL`, params);
  const sem = sv.n ? { titulos: sv.n, principal: sv.p, juros: sv.j } : null;
  return { ...base, total, por_ano: porAno, por_banco: porBanco, por_tipo: porTipo, sem_vencimento: sem };
}

// Vencimentos em aberto mês a mês de um ano: é a base do fluxo de caixa mensal (amortização e juros).
export async function mensal(bd: Bd, vid: number, ano: number, empresas = "agro") {
  const imp = await importacaoDaVersao(bd, vid);
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, capital_giro: { principal: 0, juros: 0 }, investimento: { principal: 0, juros: 0 }, indefinido: { principal: 0, juros: 0 } }));
  if (!imp) return { ano, importacao: null, meses };
  const [f, args] = filtro(empresas);
  for (const r of await bd.q(`SELECT CAST(${MES} AS INTEGER) AS m, grupo, SUM(principal) AS p, SUM(juros) AS j FROM divida_titulos WHERE importacao_id=? AND situacao='AB' AND data_vencimento IS NOT NULL AND ${ANO}=?${f} GROUP BY ${MES}, grupo`, [imp.id, String(ano), ...args])) {
    (meses[r.m - 1] as any)[r.grupo].principal += r.p;
    (meses[r.m - 1] as any)[r.grupo].juros += r.j;
  }
  return { ano, importacao: imp, meses };
}

// Lista no formato da aba Endividamento da planilha de orçamento: uma linha por título em aberto, ordenada por vencimento.
export async function contratos(bd: Bd, vid: number, empresas = "agro", ano: number | null = null, grupo: string | null = null) {
  if (grupo && !["capital_giro", "investimento"].includes(grupo)) throw Invalido("Grupo deve ser 'capital_giro' ou 'investimento'");
  const imp = await importacaoDaVersao(bd, vid);
  if (!imp) return { importacao: null, anos: [], linhas: [] };
  const [f, args] = filtro(empresas);
  let onde = "importacao_id=? AND situacao='AB'" + f;
  const params: any[] = [imp.id, ...args];
  if (grupo) { onde += " AND grupo=?"; params.push(grupo); }
  const anos = (await bd.q(`SELECT DISTINCT ${ANO} AS a FROM divida_titulos WHERE ${onde} AND data_vencimento IS NOT NULL ORDER BY a`, params)).map((r) => Number(r.a));
  if (ano !== null && ano !== undefined) { onde += ` AND ${ANO}=?`; params.push(String(ano)); }
  const linhas = await bd.q(`SELECT empresa, tipo, grupo, taxa, banco, linha_credito, produto, documento, data_operacao, data_vencimento, principal, juros, outras_despesas, bruto FROM divida_titulos WHERE ${onde} ORDER BY data_vencimento IS NULL, data_vencimento COLLATE "C", banco COLLATE "C", documento COLLATE "C", id`, params);
  return { importacao: imp, anos, linhas };
}

const ORDEM_TIPOS = ["Custeio", "Capital de Giro", "Investimento", "EGF"];
const tiposOrdenados = (presentes: Set<string>) => [...ORDEM_TIPOS.filter((t) => presentes.has(t)), ...[...presentes].filter((t) => !ORDEM_TIPOS.includes(t)).sort()];

// Dívida em aberto em 31/12 de cada ano, em curto e longo prazo, com a abertura por tipo. No balanço de 31/12/Y, curto prazo é o que vence até 31/12 do ano
// seguinte (Y+1) e longo prazo é o que vem depois (Y+2 em diante). Também traz os juros que vencem em cada ano (custo da dívida).
export async function balanco(bd: Bd, vid: number, empresas = "agro") {
  const imp = await importacaoDaVersao(bd, vid);
  const base: any = { importacao: imp, empresas, anos: [], tipos: [], curto: {}, longo: {}, curto_total: {}, longo_total: {}, total: {}, juros: {}, juros_total: {}, sem_vencimento: null };
  if (!imp) return base;
  const [f, args] = filtro(empresas);
  const onde = "importacao_id=? AND situacao='AB'" + f, params = [imp.id, ...args];
  const por = new Map<string, { a: number; tipo: string; p: number; j: number }>();
  for (const r of await bd.q(`SELECT CAST(${ANO} AS INTEGER) AS a, tipo, SUM(principal) AS p, SUM(juros) AS j FROM divida_titulos WHERE ${onde} AND data_vencimento IS NOT NULL GROUP BY CAST(${ANO} AS INTEGER), tipo`, params)) {
    const tipo = r.tipo || "(sem tipo)";
    por.set(`${r.a}|${tipo}`, { a: r.a, tipo, p: r.p, j: r.j });
  }
  const [sv] = await bd.q(`SELECT COUNT(*) AS n, COALESCE(SUM(principal),0) AS v FROM divida_titulos WHERE ${onde} AND data_vencimento IS NULL`, params);
  base.sem_vencimento = sv.n ? { titulos: sv.n, valor: sv.v } : null;
  const anosVenc = [...new Set([...por.values()].map((x) => x.a))].sort((x, y) => x - y);
  if (!anosVenc.length) return base;
  const tipos = tiposOrdenados(new Set([...por.values()].map((x) => x.tipo)));
  const anos: number[] = [];
  for (let y = Math.min(Number(String(imp.importado_em).slice(0, 4)), anosVenc[0]); y < anosVenc[anosVenc.length - 1] + 1; y++) anos.push(y);
  const curto: any = {}, longo: any = {}, juros: any = {};
  for (const t of tipos) { curto[t] = {}; longo[t] = {}; juros[t] = {}; }
  for (const y of anos) for (const t of tipos) {
    curto[t][y] = por.get(`${y + 1}|${t}`)?.p ?? 0;
    longo[t][y] = [...por.values()].filter((v) => v.tipo === t && v.a >= y + 2).reduce((s, v) => s + v.p, 0);
    juros[t][y] = por.get(`${y}|${t}`)?.j ?? 0;
  }
  const soma = (d: any) => Object.fromEntries(anos.map((y) => [y, tipos.reduce((s, t) => s + d[t][y], 0)]));
  const ct = soma(curto), lt = soma(longo);
  Object.assign(base, { anos, tipos, curto, longo, curto_total: ct, longo_total: lt, total: Object.fromEntries(anos.map((y) => [y, ct[y] + lt[y]])), juros, juros_total: soma(juros) });
  return base;
}

// Vencimentos em aberto por ano, mês e tipo (principal e juros): base do resumo mensal.
export async function mensalPorAno(bd: Bd, vid: number, empresas = "agro") {
  const imp = await importacaoDaVersao(bd, vid);
  const base: any = { importacao: imp, empresas, anos: [], tipos: [], dados: [], sem_vencimento: null };
  if (!imp) return base;
  const [f, args] = filtro(empresas);
  const onde = "importacao_id=? AND situacao='AB'" + f, params = [imp.id, ...args];
  const dados = (await bd.q(`SELECT CAST(${ANO} AS INTEGER) AS a, CAST(${MES} AS INTEGER) AS m, tipo, SUM(principal) AS p, SUM(juros) AS j FROM divida_titulos WHERE ${onde} AND data_vencimento IS NOT NULL GROUP BY CAST(${ANO} AS INTEGER), CAST(${MES} AS INTEGER), tipo ORDER BY a, m, tipo COLLATE "C"`, params))
    .map((r) => ({ ano: r.a, mes: r.m, tipo: r.tipo || "(sem tipo)", principal: r.p, juros: r.j }));
  const [sv] = await bd.q(`SELECT COUNT(*) AS n, COALESCE(SUM(principal),0) AS v FROM divida_titulos WHERE ${onde} AND data_vencimento IS NULL`, params);
  base.sem_vencimento = sv.n ? { titulos: sv.n, valor: sv.v } : null;
  if (!dados.length) return base;
  base.tipos = tiposOrdenados(new Set(dados.map((d) => d.tipo)));
  const anos = dados.map((d) => d.ano);
  base.anos = Array.from({ length: Math.max(...anos) - Math.min(...anos) + 1 }, (_, i) => Math.min(...anos) + i);
  base.dados = dados;
  return base;
}
