// Arrendamentos: cadastro de fazendas, parcelas, preços, leitura e cálculo. Porte de app/servicos/arrendamentos.py.
import type { Bd } from "../lib/bd.mts";
import { Invalido } from "../lib/erros.mts";
import { anosDaVersao, auditar, obterVersao, versaoEditavel } from "./base.mts";
import { NaoEncontrado } from "../lib/erros.mts";

export const PERIODICIDADE: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
const arred = (x: number, casas: number) => Math.round((x + Number.EPSILON) * 10 ** casas) / 10 ** casas;

async function versaoDaFazenda(bd: Bd, fid: number): Promise<number> {
  const [r] = await bd.q<{ versao_id: number }>("SELECT versao_id FROM fazendas WHERE id=?", [fid]);
  if (!r) throw NaoEncontrado(`Fazenda ${fid} não existe`);
  return r.versao_id;
}

export interface FazendaIn { nome: string; tipo: string; arrendador?: string; forma?: string; cultura_id?: number | null; observacao?: string; }

// valida e devolve o produto de pagamento (null quando não se aplica)
async function validarFazenda(bd: Bd, d: FazendaIn): Promise<number | null> {
  if (!String(d.nome ?? "").trim()) throw Invalido("Informe o nome da fazenda");
  if (!["propria", "arrendada"].includes(d.tipo)) throw Invalido("Tipo deve ser 'propria' ou 'arrendada'");
  const forma = d.forma ?? "reais";
  if (!["reais", "produto"].includes(forma)) throw Invalido("Forma de pagamento deve ser 'reais' ou 'produto'");
  if (d.tipo !== "arrendada" || forma !== "produto") return null;
  const cid = d.cultura_id;
  if (!cid) throw Invalido("Escolha o produto usada no pagamento (cadastre em Produtos, se ainda não existir)");
  if (!(await bd.q("SELECT 1 FROM culturas WHERE id=?", [cid])).length) throw Invalido("Produto não encontrada no cadastro de Produtos");
  return cid;
}

export async function criarFazenda(bd: Bd, vid: number, d: FazendaIn, autor: string): Promise<number> {
  await versaoEditavel(bd, vid);
  const cid = await validarFazenda(bd, d);
  const [{ id }] = await bd.q<{ id: number }>("INSERT INTO fazendas(versao_id, nome, tipo, arrendador, forma, cultura_id, observacao) VALUES(?,?,?,?,?,?,?) RETURNING id",
    [vid, d.nome.trim(), d.tipo, (d.arrendador ?? "").trim(), d.forma ?? "reais", cid, d.observacao ?? ""]);
  await auditar(bd, autor, vid, "criar_fazenda", d.nome);
  return id;
}

export async function atualizarFazenda(bd: Bd, fid: number, d: FazendaIn, autor: string): Promise<void> {
  const vid = await versaoDaFazenda(bd, fid);
  await versaoEditavel(bd, vid);
  const cid = await validarFazenda(bd, d);
  await bd.q("UPDATE fazendas SET nome=?, tipo=?, arrendador=?, forma=?, cultura_id=?, observacao=? WHERE id=?",
    [d.nome.trim(), d.tipo, (d.arrendador ?? "").trim(), d.forma ?? "reais", cid, d.observacao ?? "", fid]);
  await auditar(bd, autor, vid, "atualizar_fazenda", d.nome);
}

export async function excluirFazenda(bd: Bd, fid: number, autor: string): Promise<void> {
  const vid = await versaoDaFazenda(bd, fid);
  await versaoEditavel(bd, vid);
  await bd.q("DELETE FROM fazendas WHERE id=?", [fid]);
  await auditar(bd, autor, vid, "excluir_fazenda", String(fid));
}

export async function salvarAno(bd: Bd, fid: number, ano: number, areaHa: number, valor: number, autor: string): Promise<void> {
  const vid = await versaoDaFazenda(bd, fid);
  const v = await versaoEditavel(bd, vid);
  const anos = anosDaVersao(v);
  if (!anos.includes(ano)) throw Invalido(`Ano fora do horizonte (${anos[0]} a ${anos[anos.length - 1]})`);
  if (areaHa < 0 || valor < 0) throw Invalido("Área e valor não podem ser negativos");
  await bd.q("INSERT INTO fazenda_anos(fazenda_id, ano, area_ha, valor) VALUES(?,?,?,?) ON CONFLICT(fazenda_id, ano) DO UPDATE SET area_ha=excluded.area_ha, valor=excluded.valor", [fid, ano, areaHa, valor]);
  await auditar(bd, autor, vid, "salvar_ano", `fazenda ${fid} ano ${ano}: ${areaHa} ha, ${valor}`);
}

export async function salvarParcelas(bd: Bd, fid: number, parcelas: { mes: number; percentual: number }[], autor: string): Promise<void> {
  const vid = await versaoDaFazenda(bd, fid);
  await versaoEditavel(bd, vid);
  const meses = parcelas.map((p) => p.mes);
  if (new Set(meses).size !== meses.length) throw Invalido("Há dois vencimentos no mesmo mês");
  for (const p of parcelas) {
    if (!(p.mes >= 1 && p.mes <= 12)) throw Invalido("Mês deve estar entre 1 e 12");
    if (p.percentual < 0) throw Invalido("Percentual não pode ser negativo");
  }
  await bd.q("DELETE FROM parcelas WHERE fazenda_id=?", [fid]);
  for (const p of parcelas) await bd.q("INSERT INTO parcelas(fazenda_id, mes, percentual) VALUES(?,?,?)", [fid, p.mes, p.percentual]);
  await auditar(bd, autor, vid, "salvar_parcelas", `fazenda ${fid}: ${parcelas.length} parcelas`);
}

export async function salvarPrecos(bd: Bd, vid: number, precos: { cultura_id: number; ano: number; preco: number }[], autor: string): Promise<void> {
  const v = await versaoEditavel(bd, vid);
  for (const p of precos) {
    if (!(await bd.q("SELECT 1 FROM culturas WHERE id=?", [p.cultura_id])).length) throw Invalido("Produto não encontrada no cadastro de Produtos");
    if (!anosDaVersao(v).includes(p.ano)) throw Invalido("Ano fora do horizonte");
    if (p.preco < 0) throw Invalido("Preço não pode ser negativo");
    await bd.q("INSERT INTO precos(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?) ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET preco=excluded.preco", [vid, p.cultura_id, p.ano, p.preco]);
  }
  await auditar(bd, autor, vid, "salvar_precos", `${precos.length} valores`);
}

// copia área e/ou valor do ano de origem para todos os anos seguintes do horizonte
export async function replicarFazenda(bd: Bd, fid: number, anoOrigem: number, campos: string[], autor: string): Promise<number> {
  const vid = await versaoDaFazenda(bd, fid);
  const v = await versaoEditavel(bd, vid);
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte");
  if (!campos.length || campos.some((c) => !["area_ha", "valor"].includes(c))) throw Invalido("Escolha área e/ou valor para replicar");
  const [o] = await bd.q("SELECT area_ha, valor FROM fazenda_anos WHERE fazenda_id=? AND ano=?", [fid, anoOrigem]);
  const origem: Record<string, number> = { area_ha: o ? o.area_ha : 0, valor: o ? o.valor : 0 };
  const destinos = anos.filter((a) => a > anoOrigem);
  for (const a of destinos) {
    const [atual] = await bd.q("SELECT area_ha, valor FROM fazenda_anos WHERE fazenda_id=? AND ano=?", [fid, a]);
    const novo: Record<string, number> = { area_ha: atual ? atual.area_ha : 0, valor: atual ? atual.valor : 0 };
    for (const c of campos) novo[c] = origem[c];
    await bd.q("INSERT INTO fazenda_anos(fazenda_id, ano, area_ha, valor) VALUES(?,?,?,?) ON CONFLICT(fazenda_id, ano) DO UPDATE SET area_ha=excluded.area_ha, valor=excluded.valor", [fid, a, novo.area_ha, novo.valor]);
  }
  await auditar(bd, autor, vid, "replicar_fazenda", `fazenda ${fid}: ${campos.join("+")} de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

export async function replicarPreco(bd: Bd, vid: number, culturaId: number, anoOrigem: number, autor: string): Promise<number> {
  const v = await versaoEditavel(bd, vid);
  const anos = anosDaVersao(v);
  if (!anos.includes(anoOrigem)) throw Invalido("Ano de origem fora do horizonte");
  const [c] = await bd.q("SELECT nome FROM culturas WHERE id=?", [culturaId]);
  if (!c) throw Invalido("Produto não encontrada no cadastro de Produtos");
  const [o] = await bd.q("SELECT preco FROM precos WHERE versao_id=? AND cultura_id=? AND ano=?", [vid, culturaId, anoOrigem]);
  if (!o) throw Invalido(`Não há preço de ${c.nome} em ${anoOrigem} para replicar`);
  const destinos = anos.filter((a) => a > anoOrigem);
  for (const a of destinos) await bd.q("INSERT INTO precos(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?) ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET preco=excluded.preco", [vid, culturaId, a, o.preco]);
  await auditar(bd, autor, vid, "replicar_preco", `${c.nome}: ${o.preco} de ${anoOrigem} para ${destinos.length} ano(s)`);
  return destinos.length;
}

// parcelas iguais; a última absorve o arredondamento para fechar 100%
export function gerarParcelas(n: number, periodicidade: string, mesInicio: number) {
  if (!(periodicidade in PERIODICIDADE)) throw Invalido("Periodicidade inválida");
  if (n < 1) throw Invalido("Número de parcelas deve ser pelo menos 1");
  if (!(mesInicio >= 1 && mesInicio <= 12)) throw Invalido("Mês inicial deve estar entre 1 e 12");
  const passo = PERIODICIDADE[periodicidade];
  const meses = Array.from({ length: n }, (_, i) => mesInicio + i * passo);
  if (meses[meses.length - 1] > 12) throw Invalido(`${n} parcelas (${periodicidade}) a partir do mês ${mesInicio} passam de dezembro (a última cairia no mês ${meses[meses.length - 1]} do ano)`);
  const base = arred(100 / n, 4);
  const pcts = Array(n).fill(base);
  pcts[n - 1] = arred(100 - base * (n - 1), 4);
  return meses.map((m, i) => ({ mes: m, percentual: pcts[i] }));
}

// ---------------------------------------------------------------- leitura e cálculo
export async function lerArrendamentos(bd: Bd, vid: number) {
  const v = await obterVersao(bd, vid);
  const anos = anosDaVersao(v);
  const fazendas: any[] = [];
  for (const f of await bd.q('SELECT * FROM fazendas WHERE versao_id=? ORDER BY tipo DESC, nome COLLATE "C"', [vid])) {
    const d: any = { ...f };
    d.anos = Object.fromEntries((await bd.q("SELECT * FROM fazenda_anos WHERE fazenda_id=? ORDER BY ano", [f.id])).map((r) => [r.ano, { area_ha: r.area_ha, valor: r.valor }]));
    d.parcelas = (await bd.q("SELECT * FROM parcelas WHERE fazenda_id=? ORDER BY mes", [f.id])).map((r) => ({ mes: r.mes, percentual: r.percentual }));
    fazendas.push(d);
  }
  const precos: Record<number, Record<number, number>> = {};
  for (const r of await bd.q("SELECT * FROM precos WHERE versao_id=? ORDER BY cultura_id, ano", [vid])) (precos[r.cultura_id] ??= {})[r.ano] = r.preco;
  const culturas: any[] = [];
  for (const c of await bd.q('SELECT * FROM culturas ORDER BY grupo COLLATE "C", nome')) {
    if (!c.ativa && !(c.id in precos)) continue;
    culturas.push({ id: c.id, nome: String(c.nome), grupo: c.grupo, ativa: !!c.ativa, unidade: c.unidade, embalagem: c.embalagem, qtd_por_embalagem: c.qtd_por_embalagem, rotulo: c.embalagem || c.unidade });
  }
  const nomes = new Map(culturas.map((c) => [c.id, c.nome]));
  for (const f of fazendas) f.cultura_nome = nomes.get(f.cultura_id) ?? "";
  return { versao: v, anos, fazendas, precos, culturas };
}

export async function calcularArrendamentos(bd: Bd, vid: number) {
  const dados = await lerArrendamentos(bd, vid);
  const { anos, precos } = dados;
  const nomes = new Map((await bd.q("SELECT id, nome FROM culturas")).map((c) => [c.id as number, String(c.nome)]));
  const avisos: string[] = [];
  const porFazenda: any[] = [];
  const resumo: Record<number, any> = {};
  for (const a of anos) resumo[a] = { area_propria: 0, area_arrendada: 0, area_total: 0, custo: 0, sacas: {} as Record<string, number>, mensal: Array(12).fill(0) };
  for (const f of dados.fazendas) {
    const linha: any = { id: f.id, nome: f.nome, tipo: f.tipo, anos: {} };
    const somaParcelas = arred(f.parcelas.reduce((t: number, p: any) => t + p.percentual, 0), 4);
    if (f.tipo === "arrendada" && f.parcelas.length && Math.abs(somaParcelas - 100) > 0.01) avisos.push(`${f.nome}: as parcelas somam ${+somaParcelas.toPrecision(6)}% (deveriam somar 100%)`);
    let temCusto = false;
    for (const a of anos) {
      const reg = f.anos[a] ?? { area_ha: 0, valor: 0 };
      const area = reg.area_ha;
      let custo = 0, sacas = 0;
      if (f.tipo === "arrendada") {
        if (f.forma === "reais") custo = area * reg.valor;
        else {
          sacas = area * reg.valor;
          const cultura = nomes.get(f.cultura_id) ?? "";
          const preco = precos[f.cultura_id]?.[a];
          if (sacas && !cultura) avisos.push(`${f.nome}: escolha o produto usada no pagamento`);
          else if (sacas && !preco) avisos.push(`${f.nome} ${a}: falta o valor padrão de ${cultura} em ${a}`);
          custo = sacas * (preco || 0);
        }
      }
      const mensal: number[] = Array(12).fill(0);
      if (custo) { temCusto = true; for (const p of f.parcelas) mensal[p.mes - 1] += (custo * p.percentual) / 100; }
      linha.anos[a] = { area_ha: area, custo, sacas, mensal };
      const r = resumo[a];
      r[f.tipo === "propria" ? "area_propria" : "area_arrendada"] += area;
      r.area_total += area; r.custo += custo;
      if (sacas) { const nc = nomes.get(f.cultura_id) ?? "(sem cultura)"; r.sacas[nc] = (r.sacas[nc] ?? 0) + sacas; }
      for (let i = 0; i < 12; i++) r.mensal[i] += mensal[i];
    }
    if (f.tipo === "arrendada" && temCusto && !f.parcelas.length) avisos.push(`${f.nome}: sem parcelas cadastradas — o pagamento não entra no fluxo mensal`);
    porFazenda.push(linha);
  }
  return { versao: dados.versao, anos, resumo, fazendas: porFazenda, avisos: [...new Set(avisos)].sort() };
}

// b em relação a a (normalmente a = Orçado, b = Reprojetado)
export async function compararArrendamentos(bd: Bd, aId: number, bId: number) {
  const ca = await calcularArrendamentos(bd, aId), cb = await calcularArrendamentos(bd, bId);
  const anos = ca.anos.filter((x) => cb.anos.includes(x)).sort((x, y) => x - y);
  if (!anos.length) throw Invalido("As versões não têm anos em comum");
  const delta = (x: number, y: number) => ({ a: x, b: y, delta: y - x, pct: x ? ((y - x) / x) * 100 : null });
  const out: any = { a: ca.versao, b: cb.versao, anos, resumo: {}, fazendas: {} };
  for (const ano of anos) {
    const ra = ca.resumo[ano], rb = cb.resumo[ano];
    const produtos = [...new Set([...Object.keys(ra.sacas), ...Object.keys(rb.sacas)])].sort();
    out.resumo[ano] = {
      area_total: delta(ra.area_total, rb.area_total), custo: delta(ra.custo, rb.custo),
      sacas: Object.fromEntries(produtos.map((p) => [p, delta(ra.sacas[p] ?? 0, rb.sacas[p] ?? 0)])),
      mensal: Array.from({ length: 12 }, (_, i) => delta(ra.mensal[i], rb.mensal[i])),
    };
  }
  const ia = new Map(ca.fazendas.map((f: any) => [f.nome, f])), ib = new Map(cb.fazendas.map((f: any) => [f.nome, f]));
  for (const nome of [...new Set([...ia.keys(), ...ib.keys()])].sort()) {
    out.fazendas[nome] = Object.fromEntries(anos.map((ano) => [ano, {
      area_ha: delta((ia.get(nome) as any)?.anos[ano]?.area_ha ?? 0, (ib.get(nome) as any)?.anos[ano]?.area_ha ?? 0),
      custo: delta((ia.get(nome) as any)?.anos[ano]?.custo ?? 0, (ib.get(nome) as any)?.anos[ano]?.custo ?? 0),
    }]));
  }
  return out;
}
