// Premissas dos demonstrativos (DRE e Balanço): o usuário cadastra uma premissa, é OBRIGADO a vincular uma conta do demonstrativo
// e digita um valor por ano. O valor cai na conta vinculada, multiplicado pelo sinal da premissa (1 soma, -1 subtrai).
// Tipos: "valor" e "percentual" (% × campo BASE do mesmo demonstrativo; o sistema recusa bases que dependam da própria conta).
// Porte de app/servicos/premissas_dem.py.
import type { Bd } from "../lib/bd.mts";
import { agora } from "../lib/agora.mts";
import { Invalido, NaoEncontrado } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import * as dre from "./dre.mts";

export const DEMONSTRATIVOS: Record<string, string> = { dre: "DRE", balanco: "Balanço" };
const TIPOS = ["valor", "percentual"];
const BASE_NEGATIVA = ["calcular", "zerar"];
const NATUREZA_RECEITA = ["receita", "outras receitas", "resultado"];          // contas que ficam dentro de um grupo "(-)" mas são receita
type Serie = Record<number, number>;

// ---------------------------------------------------------------- contas dos demonstrativos
function caminho(porCodigo: Map<string, any>, codigo: string): string[] {
  const nomes: string[] = [], vistos = new Set<string>();
  let atual = porCodigo.get(codigo);
  while (atual && !vistos.has(atual.codigo)) { vistos.add(atual.codigo); nomes.unshift(atual.nome); atual = porCodigo.get(atual.pai); }
  return nomes;
}

// Contas que aceitam premissa, na ordem do demonstrativo, com o caminho e o sinal sugerido.
export async function contas(bd: Bd, demonstrativo: string): Promise<any[]> {
  if (demonstrativo === "dre") {
    const est = await dre.estrutura(bd);
    const porCodigo = new Map(est.map((l) => [l.codigo, l]));
    const saida: any[] = [];
    for (const l of est) {
      if (l.calculo !== "entrada") continue;
      const cam = caminho(porCodigo, l.codigo);
      const despesa = cam[0].trim().startsWith("(-)") && !NATUREZA_RECEITA.some((p) => l.nome.trim().toLowerCase().startsWith(p));
      saida.push({ codigo: l.codigo, nome: l.nome, caminho: cam, sinal_padrao: despesa ? -1 : 1 });
    }
    return saida;
  }
  if (demonstrativo === "balanco") {
    const linhas = await bd.q("SELECT * FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo COLLATE \"C\"");
    const porCodigo = new Map(linhas.map((l) => [l.codigo as string, l]));
    const comFilhas = new Set(linhas.map((l) => l.pai));
    return linhas.filter((l) => l.tipo === "account" && !comFilhas.has(l.codigo) && l.codigo !== "SA07")      // o caixa vem do Fluxo de caixa
      .map((l) => ({ codigo: l.codigo, nome: l.nome, caminho: caminho(porCodigo, l.codigo), sinal_padrao: l.nome.trim().startsWith("(-)") ? -1 : 1 }));
  }
  throw Invalido("Demonstrativo inválido; use DRE ou Balanço");
}

// Linhas do demonstrativo que podem ser base de um percentual (todas as que têm valor em R$, inclusive totais).
export async function bases(bd: Bd, demonstrativo: string): Promise<any[]> {
  if (demonstrativo === "dre") {
    const todas = await dre.estrutura(bd);
    const porCodigo = new Map(todas.map((l) => [l.codigo, l]));
    return todas.filter((l) => ["entrada", "soma", "calculada"].includes(l.calculo)).map((l) => ({ codigo: l.codigo, nome: l.nome, caminho: caminho(porCodigo, l.codigo) }));
  }
  if (demonstrativo === "balanco") {
    const linhas = await bd.q("SELECT * FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo COLLATE \"C\"");
    const porCodigo = new Map(linhas.map((l) => [l.codigo as string, l]));
    return linhas.map((l) => ({ codigo: l.codigo, nome: l.nome, caminho: caminho(porCodigo, l.codigo) }));
  }
  throw Invalido("Demonstrativo inválido; use DRE ou Balanço");
}

// Função: código da linha -> conjunto de contas (de entrada) de que o valor dela depende.
async function dependencias(bd: Bd, demonstrativo: string): Promise<(c: string, vistos?: Set<string>) => Set<string>> {
  let filhos: (c: string) => string[], ehConta: (c: string) => boolean;
  if (demonstrativo === "dre") {
    const est = new Map((await dre.estrutura(bd)).map((l) => [l.codigo, l]));
    filhos = (c) => {
      const l = est.get(c);
      if (!l) return [];
      if (l.calculo === "soma") return l.filhos;
      const f = dre.FORMULAS[c];
      if (f && f[0] === "soma") return [...(f[1] as string[])];
      if (f && f[0] === "pct") return [f[1] as string, f[2] as string];
      return [];
    };
    ehConta = (c) => est.get(c)?.calculo === "entrada";
  } else {
    const linhas = new Map((await bd.q("SELECT * FROM bp_linhas WHERE ativa=1")).map((r) => [r.codigo as string, r]));
    const porPai = new Map<string, string[]>();
    for (const l of linhas.values()) { if (!porPai.has(l.pai)) porPai.set(l.pai, []); porPai.get(l.pai)!.push(l.codigo); }
    filhos = (c) => porPai.get(c) ?? [];
    ehConta = (c) => linhas.has(c) && !(porPai.get(c) ?? []).length;
  }
  const deps = (codigo: string, vistos: Set<string> = new Set()): Set<string> => {
    if (vistos.has(codigo)) return new Set();
    vistos.add(codigo);
    if (ehConta(codigo)) return new Set([codigo]);
    const out = new Set<string>();
    for (const f of filhos(codigo)) for (const x of deps(f, vistos)) out.add(x);
    return out;
  };
  return deps;
}

async function validarBase(bd: Bd, demonstrativo: string, conta: string, base: string, ignorarPid: number | null = null) {
  if (!(base || "").trim()) throw Invalido("Premissa percentual: escolha o campo sobre o qual o percentual incide");
  const achada = (await bases(bd, demonstrativo)).find((b) => b.codigo === base);
  if (!achada) throw Invalido(`Esse campo não pode ser base no ${DEMONSTRATIVOS[demonstrativo]}`);
  const deps = await dependencias(bd, demonstrativo);
  if (deps(base).has(conta)) throw Invalido("Cálculo circular: o campo base depende da própria conta da premissa. Escolha outro campo base");
  // ciclo entre premissas percentuais: conta A depende da base de A; se a base de A depende da conta de B e vice-versa, não fecha
  const arestas = new Map<string, Set<string>>([[conta, new Set(deps(base))]]);
  for (const p of await bd.q("SELECT * FROM premissas_dem WHERE demonstrativo=? AND tipo='percentual' AND id IS DISTINCT FROM ?::int", [demonstrativo, ignorarPid])) {
    if (!arestas.has(p.conta_codigo)) arestas.set(p.conta_codigo, new Set());
    for (const x of p.base_codigo ? deps(p.base_codigo) : []) arestas.get(p.conta_codigo)!.add(x);
  }
  const ciclo = (no: string, pilha: Set<string>, feitos: Set<string>): boolean => {
    if (pilha.has(no)) return true;
    if (feitos.has(no)) return false;
    feitos.add(no); pilha.add(no);
    for (const v of arestas.get(no) ?? []) if (ciclo(v, pilha, feitos)) return true;
    pilha.delete(no);
    return false;
  };
  if (ciclo(conta, new Set(), new Set())) throw Invalido("Cálculo circular entre premissas percentuais. Escolha outro campo base");
  return achada;
}

async function contaValida(bd: Bd, demonstrativo: string, codigo: string) {
  if (!(codigo || "").trim()) throw Invalido("Toda premissa precisa estar vinculada a uma conta do demonstrativo");
  for (const c of await contas(bd, demonstrativo)) if (c.codigo === codigo) return c;
  if (demonstrativo === "balanco" && codigo === "SA07") throw Invalido("O caixa é calculado pelo Fluxo de caixa (caixa de fechamento com dívida de giro automática); escolha outra conta");
  throw Invalido(`Essa conta não aceita premissa no ${DEMONSTRATIVOS[demonstrativo]} (escolha uma conta, não um total)`);
}

function sinalValido(sinal: any): number {
  if (sinal !== 1 && sinal !== -1) throw Invalido("Informe se a premissa soma (+) ou subtrai (−) da conta");
  return Number(sinal);
}

// ---------------------------------------------------------------- cadastro
export async function criar(bd: Bd, nome: string, demonstrativo: string, contaCodigo: string, sinal: number, autor: string, tipo = "valor", baseCodigo = "", baseNegativa = ""): Promise<number> {
  nome = (nome || "").trim();
  if (!nome) throw Invalido("Informe o nome da premissa");
  if (!(demonstrativo in DEMONSTRATIVOS)) throw Invalido("Demonstrativo inválido; use DRE ou Balanço");
  await contaValida(bd, demonstrativo, contaCodigo);
  sinal = sinalValido(sinal);
  if (!TIPOS.includes(tipo)) throw Invalido("Tipo inválido; use Valor ou Percentual");
  baseCodigo = tipo === "percentual" ? (baseCodigo || "").trim() : "";
  if (tipo === "percentual") {
    await validarBase(bd, demonstrativo, contaCodigo, baseCodigo);
    if (!BASE_NEGATIVA.includes(baseNegativa)) throw Invalido("Informe o que fazer quando o campo base for negativo: calcular normalmente ou zerar");
  } else baseNegativa = "calcular";
  if ((await bd.q("SELECT 1 FROM premissas_dem WHERE demonstrativo=? AND nome=?", [demonstrativo, nome])).length) throw Invalido(`Já existe uma premissa '${nome}' no ${DEMONSTRATIVOS[demonstrativo]}`);
  const [r] = await bd.q("INSERT INTO premissas_dem(demonstrativo, nome, conta_codigo, sinal, tipo, base_codigo, base_negativa, criada_em) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
    [demonstrativo, nome, contaCodigo, sinal, tipo, baseCodigo, baseNegativa, agora()]);
  await auditar(bd, autor, null, "criar_premissa_dem", `${DEMONSTRATIVOS[demonstrativo]}: ${nome} → ${contaCodigo}` + (baseCodigo ? ` (${baseCodigo})` : ""));
  return r.id;
}

async function obter(bd: Bd, pid: number) {
  const [r] = await bd.q("SELECT * FROM premissas_dem WHERE id=?", [pid]);
  if (!r) throw NaoEncontrado("Premissa não encontrada");
  return r;
}

export async function editar(bd: Bd, pid: number, nome: string | null, contaCodigo: string | null, sinal: number | null, autor: string, baseCodigo: string | null = null, baseNegativa: string | null = null): Promise<void> {
  const p = await obter(bd, pid);
  const novoNome = nome === null || nome === undefined ? p.nome : nome.trim();
  if (!novoNome) throw Invalido("Informe o nome da premissa");
  const novaConta = contaCodigo === null || contaCodigo === undefined ? p.conta_codigo : contaCodigo;
  await contaValida(bd, p.demonstrativo, novaConta);
  const novoSinal = sinal === null || sinal === undefined ? p.sinal : sinalValido(sinal);
  if ((await bd.q("SELECT 1 FROM premissas_dem WHERE demonstrativo=? AND nome=? AND id<>?", [p.demonstrativo, novoNome, pid])).length) throw Invalido(`Já existe uma premissa '${novoNome}' no ${DEMONSTRATIVOS[p.demonstrativo]}`);
  let novaBase = p.base_codigo;
  if (p.tipo === "percentual") {
    novaBase = baseCodigo === null || baseCodigo === undefined ? p.base_codigo : baseCodigo;
    await validarBase(bd, p.demonstrativo, novaConta, novaBase, pid);
  }
  let novaNeg = p.base_negativa;
  if (baseNegativa !== null && baseNegativa !== undefined && p.tipo === "percentual") {
    if (!BASE_NEGATIVA.includes(baseNegativa)) throw Invalido("Informe o que fazer quando o campo base for negativo: calcular normalmente ou zerar");
    novaNeg = baseNegativa;
  }
  await bd.q("UPDATE premissas_dem SET nome=?, conta_codigo=?, sinal=?, base_codigo=?, base_negativa=? WHERE id=?", [novoNome, novaConta, novoSinal, novaBase, novaNeg, pid]);
  await auditar(bd, autor, null, "editar_premissa_dem", `${novoNome} → ${novaConta}`);
}

export async function excluir(bd: Bd, pid: number, autor: string): Promise<void> {
  const p = await obter(bd, pid);
  await bd.q("DELETE FROM premissas_dem_valores WHERE premissa_id=?", [pid]);
  await bd.q("DELETE FROM premissas_dem_itens WHERE premissa_id=?", [pid]);
  await bd.q("DELETE FROM premissas_dem WHERE id=?", [pid]);
  await auditar(bd, autor, null, "excluir_premissa_dem", p.nome);
}

// ---------------------------------------------------------------- valores por versão
async function valoresDe(bd: Bd, vid: number): Promise<Record<number, Serie>> {
  const valores: Record<number, Serie> = {};
  for (const r of await bd.q("SELECT premissa_id, ano, valor FROM premissas_dem_valores WHERE versao_id=?", [vid])) (valores[r.premissa_id] ??= {})[r.ano] = r.valor;
  return valores;
}

export async function ler(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const valores = await valoresDe(bd, vid);
  const plano: Record<string, any[]> = {}, camposBase: Record<string, any[]> = {};
  for (const d of Object.keys(DEMONSTRATIVOS)) { plano[d] = await contas(bd, d); camposBase[d] = await bases(bd, d); }
  const nomeBase: Record<string, Map<string, any>> = {}, porConta: Record<string, Map<string, any>> = {};
  for (const d of Object.keys(DEMONSTRATIVOS)) { nomeBase[d] = new Map(camposBase[d].map((b) => [b.codigo, b])); porConta[d] = new Map(plano[d].map((c) => [c.codigo, c])); }
  const emUso = new Set((await bd.q("SELECT premissa_id FROM premissas_dem_itens WHERE versao_id=?", [vid])).map((r) => r.premissa_id));
  const blocos: Record<string, any[]> = { dre: [], balanco: [] }, cadastradas: Record<string, any[]> = { dre: [], balanco: [] };
  for (const p of await bd.q("SELECT * FROM premissas_dem ORDER BY id")) {
    const conta = porConta[p.demonstrativo].get(p.conta_codigo);
    const base = p.tipo === "percentual" ? nomeBase[p.demonstrativo].get(p.base_codigo) : undefined;
    cadastradas[p.demonstrativo].push({ id: p.id, nome: p.nome, conta: conta ? conta.nome : null, caminho: conta ? conta.caminho : [], sinal: p.sinal, na_versao: emUso.has(p.id), tipo: p.tipo, base: base ? base.nome : null });
    if (!emUso.has(p.id)) continue;
    blocos[p.demonstrativo].push({
      id: p.id, nome: p.nome, conta_codigo: p.conta_codigo, sinal: p.sinal, tipo: p.tipo, unidade: p.tipo === "percentual" ? "%" : "R$ mil", base_codigo: p.base_codigo, base_negativa: p.base_negativa,
      base: base ? base.nome : null, base_caminho: base ? base.caminho : [], conta: conta ? conta.nome : null, caminho: conta ? conta.caminho : [],
      conta_existe: conta !== undefined, valores: Object.fromEntries(anos.map((a) => [a, valores[p.id]?.[a] ?? 0])),
    });
  }
  return { versao: v, anos, blocos, cadastradas, contas: plano, bases: camposBase,
    estrutura: { dre: !!(await bd.q("SELECT 1 FROM dre_importacao")).length, balanco: !!(await bd.q("SELECT 1 FROM bp_linhas LIMIT 1")).length } };
}

// Adiciona à versão uma premissa já cadastrada (ela vira uma linha na aba do demonstrativo).
export async function incluir(bd: Bd, vid: number, pid: number, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  const p = await obter(bd, pid);
  if ((await bd.q("SELECT 1 FROM premissas_dem_itens WHERE versao_id=? AND premissa_id=?", [vid, pid])).length) throw Invalido(`A premissa '${p.nome}' já está nesta versão`);
  await bd.q("INSERT INTO premissas_dem_itens(versao_id, premissa_id) VALUES(?,?)", [vid, pid]);
  await auditar(bd, autor, vid, "incluir_premissa_dem", p.nome);
}

// Tira a premissa desta versão (apaga os valores dela aqui); o cadastro continua.
export async function remover(bd: Bd, vid: number, pid: number, autor: string): Promise<void> {
  await versaoEditavel(bd, vid);
  const p = await obter(bd, pid);
  await bd.q("DELETE FROM premissas_dem_valores WHERE versao_id=? AND premissa_id=?", [vid, pid]);
  await bd.q("DELETE FROM premissas_dem_itens WHERE versao_id=? AND premissa_id=?", [vid, pid]);
  await auditar(bd, autor, vid, "remover_premissa_dem", p.nome);
}

async function exigirNaVersao(bd: Bd, vid: number, p: any) {
  if (!(await bd.q("SELECT 1 FROM premissas_dem_itens WHERE versao_id=? AND premissa_id=?", [vid, p.id])).length) throw Invalido(`Adicione a premissa '${p.nome}' à versão antes de lançar valores`);
}

const UPSERT = "INSERT INTO premissas_dem_valores(versao_id, premissa_id, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, premissa_id, ano) DO UPDATE SET valor=excluded.valor";

export async function salvarValor(bd: Bd, vid: number, pid: number, ano: number, valor: number, autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  const p = await obter(bd, pid);
  await exigirNaVersao(bd, vid, p);
  if (!anosDaVersao(v).includes(ano)) throw Invalido("Ano fora do horizonte da versão");
  await bd.q(UPSERT, [vid, pid, ano, valor]);
  await auditar(bd, autor, vid, "salvar_premissa_dem", `${p.nome} ${ano}: ${valor}`);
}

async function copiar(bd: Bd, vid: number, pid: number, anoOrigem: number, destinos: number[]) {
  const [r] = await bd.q("SELECT valor FROM premissas_dem_valores WHERE versao_id=? AND premissa_id=? AND ano=?", [vid, pid, anoOrigem]);
  for (const a of destinos) await bd.q(UPSERT, [vid, pid, a, r ? r.valor : 0]);
}

export async function replicar(bd: Bd, vid: number, pid: number, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const p = await obter(bd, pid);
  await exigirNaVersao(bd, vid, p);
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const destinos = anos.filter((a) => a > anoOrigem);
  if (!destinos.length) throw Invalido("Não há anos depois do escolhido para replicar");
  await copiar(bd, vid, pid, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_premissa_dem", `${p.nome} de ${anoOrigem}`);
  return destinos.length;
}

export async function replicarTodas(bd: Bd, vid: number, anoOrigem: number, autor: string, demonstrativo: string | null = null) {
  const v = await versaoEditavel(bd, vid);
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte da versão");
  const destinos = anos.filter((a) => a > anoOrigem);
  if (!destinos.length) throw Invalido("Não há anos depois do escolhido para replicar");
  const ps = (await bd.q("SELECT p.id FROM premissas_dem p JOIN premissas_dem_itens i ON i.premissa_id=p.id AND i.versao_id=?" + (demonstrativo ? " WHERE p.demonstrativo=?" : ""),
    demonstrativo ? [vid, demonstrativo] : [vid])).map((r) => r.id);
  if (!ps.length) throw Invalido("Não há premissas nesta versão para replicar");
  for (const pid of ps) await copiar(bd, vid, pid, anoOrigem, destinos);
  await auditar(bd, autor, vid, "replicar_todas_premissas_dem", `de ${anoOrigem}`);
  return { premissas: ps.length, anos_alterados: destinos.length };
}

// ---------------------------------------------------------------- efeito nos demonstrativos
// Por conta do demonstrativo: as premissas que caem nela, com o valor já multiplicado pelo sinal.
export async function efeitos(bd: Bd, vid: number, demonstrativo: string, anos: number[]): Promise<Record<string, { nome: string; valores: Serie }[]>> {
  const validas = new Set((await contas(bd, demonstrativo)).map((c) => c.codigo));
  const valores = await valoresDe(bd, vid);
  const saida: Record<string, { nome: string; valores: Serie }[]> = {};
  for (const p of await bd.q("SELECT p.* FROM premissas_dem p JOIN premissas_dem_itens i ON i.premissa_id=p.id AND i.versao_id=? WHERE p.demonstrativo=? AND p.tipo='valor' ORDER BY p.id", [vid, demonstrativo])) {
    if (!validas.has(p.conta_codigo)) continue;
    (saida[p.conta_codigo] ??= []).push({ nome: p.nome, valores: Object.fromEntries(anos.map((a) => [a, p.sinal * (valores[p.id]?.[a] ?? 0)])) });
  }
  return saida;
}

// Premissas percentuais da versão: conta, campo base, sinal e o % de cada ano.
export async function percentuais(bd: Bd, vid: number, demonstrativo: string, anos: number[]) {
  const validas = new Set((await contas(bd, demonstrativo)).map((c) => c.codigo));
  const nomesBase = new Map((await bases(bd, demonstrativo)).map((b) => [b.codigo as string, b.nome as string]));
  const valores = await valoresDe(bd, vid);
  const saida: any[] = [];
  for (const p of await bd.q("SELECT p.* FROM premissas_dem p JOIN premissas_dem_itens i ON i.premissa_id=p.id AND i.versao_id=? WHERE p.demonstrativo=? AND p.tipo='percentual' ORDER BY p.id", [vid, demonstrativo])) {
    if (validas.has(p.conta_codigo) && nomesBase.has(p.base_codigo))
      saida.push({ nome: p.nome, conta: p.conta_codigo, base: p.base_codigo, base_nome: nomesBase.get(p.base_codigo), sinal: p.sinal, zerar_negativa: p.base_negativa === "zerar", pct: Object.fromEntries(anos.map((a) => [a, valores[p.id]?.[a] ?? 0])) });
  }
  return saida;
}

const igualSeries = (a: Record<string, Serie>, b: Record<string, Serie>) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && Object.keys(a[k]).length === Object.keys(b[k]).length && Object.keys(a[k]).every((x) => a[k][+x] === b[k][+x]));
};

// Soma às contas o efeito das premissas percentuais: sinal × % ÷ 100 × valor do campo base no mesmo ano. 'calcular(entradas)' devolve o demonstrativo
// calculado (código -> {ano: valor}). Como a base pode depender de outra premissa percentual, repete até estabilizar (o cadastro impede ciclos).
export async function aplicarPercentuais(bd: Bd, vid: number, demonstrativo: string, anos: number[], entradas: Record<string, Serie>, calcular: (e: Record<string, Serie>) => Record<string, Serie>):
  Promise<[Record<string, Serie>, Record<string, Serie>, Record<string, string[]>]> {
  const lista = await percentuais(bd, vid, demonstrativo, anos);
  const nomes: Record<string, string[]> = {};
  for (const p of lista) (nomes[p.conta] ??= []).push(`${p.nome} (% sobre ${p.base_nome})`);
  let calc = calcular(entradas);
  if (!lista.length) return [calc, entradas, nomes];
  let efeito: Record<string, Serie> = {};
  for (let i = 0; i < lista.length + 3; i++) {
    const novo: Record<string, Serie> = {};
    for (const p of lista) {
      const acc = (novo[p.conta] ??= Object.fromEntries(anos.map((a) => [a, 0])));
      for (const a of anos) {
        let base = calc[p.base]?.[a] ?? 0;
        if (p.zerar_negativa && base < 0) base = 0;
        acc[a] += (p.sinal * p.pct[a]) / 100 * base;
      }
    }
    if (igualSeries(novo, efeito)) break;
    efeito = novo;
    const final: Record<string, Serie> = Object.fromEntries(Object.entries(entradas).map(([c, v]) => [c, { ...v }]));
    for (const [c, serie] of Object.entries(efeito)) {
      const alvo = (final[c] ??= Object.fromEntries(anos.map((a) => [a, 0])));
      for (const a of anos) alvo[a] = (entradas[c]?.[a] ?? 0) + serie[a];
    }
    calc = calcular(final);
  }
  const entradasFinal: Record<string, Serie> = Object.fromEntries(Object.entries(entradas).map(([c, v]) => [c, { ...v }]));
  for (const [c, serie] of Object.entries(efeito)) {
    const alvo = (entradasFinal[c] ??= Object.fromEntries(anos.map((a) => [a, 0])));
    for (const a of anos) alvo[a] = (entradas[c]?.[a] ?? 0) + serie[a];
  }
  return [calc, entradasFinal, nomes];
}

export async function comparar(bd: Bd, aId: number, bId: number) {
  const la = await ler(bd, aId), lb = await ler(bd, bId);
  const anos = la.anos.filter((a) => lb.anos.includes(a)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const out: any = { a: la.versao, b: lb.versao, anos, premissas: [] };
  const vb = new Map<number, any>();
  for (const d of Object.keys(DEMONSTRATIVOS)) for (const p of lb.blocos[d]) vb.set(p.id, p);
  for (const d of Object.keys(DEMONSTRATIVOS)) {
    for (const p of la.blocos[d]) {
      const q = vb.get(p.id) ?? p;
      out.premissas.push({ demonstrativo: d, tipo: p.tipo, nome: p.nome, conta: p.conta || "(conta removida)",
        anos: Object.fromEntries(anos.map((a) => [a, { a: p.valores[a], b: q.valores[a], delta: q.valores[a] - p.valores[a], pct: p.valores[a] ? ((q.valores[a] - p.valores[a]) / Math.abs(p.valores[a])) * 100 : null }])) });
    }
  }
  return out;
}
