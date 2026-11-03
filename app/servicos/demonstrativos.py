"""Demonstrativos derivados do orçamento (R$ mil, ano a ano), no formato da planilha de orçamento ("DF's - Consolidado"):

  * Fluxo de caixa indireto (parte do EBIT) e fluxo de caixa simplificado (parte do EBITDA);
  * Necessidade de capital de giro, com os ciclos operacional e financeiro;
  * Usos e Fontes, com linha de verificação;
  * Composição do endividamento e custo da dívida;
  * Resumo dos índices (11 indicadores com limite mínimo ou máximo editável por ano).

Tudo sai das mesmas contas do balanço, da DRE e do cálculo do caixa (fluxo.py), então bate com eles: a verificação do fluxo e dos usos e fontes dá zero.
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido

MIL = 1000.0

# limites de cada indicador na planilha: (código, nome, sentido, limite inicial, casas decimais, é percentual)
INDICADORES = [
    ("alav_total", "Alavancagem total (dívida bancária ÷ EBITDA)", "max", 3.0, 2, False),
    ("liquidez", "Índice de liquidez (ativo circulante ÷ passivo circulante)", "min", 1.1, 2, False),
    ("capacidade", "Capacidade de pagamento (EBITDA ÷ (CPLTD + juros))", "min", 1.5, 2, False),
    ("equilibrio", "Ponto de equilíbrio financeiro (faturamento mínimo × faturamento)", "min", None, 0, False),
    ("solvencia", "Solvência (patrimônio líquido ÷ ativo total)", "min", 0.5, 1, True),
    ("divida_ativo", "Dívida total ÷ ativo total (todo o exigível: dívida bancária, fornecedores e demais obrigações)", "max", 0.5, 1, True),
    ("alav_liquida", "Alavancagem líquida ((dívida − caixa) ÷ EBITDA)", "max", 2.5, 2, False),
    ("margem_ebitda", "Margem EBITDA", "min", 0.30, 1, True),
    ("alav_operacional", "Alavancagem operacional", "max", 0.6, 1, True),
    ("roic", "ROIC (retorno sobre a atividade, incluindo caixa)", "min", 0.14, 1, True),
    ("roe", "ROE (retorno sobre o patrimônio)", "min", 0.14, 1, True),
]
CODIGOS = {i[0] for i in INDICADORES}


# ---------------------------------------------------------------- metas dos indicadores
def _metas(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {}
    for r in con.execute("SELECT indicador, ano, valor FROM indicadores_metas WHERE versao_id=?", (vid,)):
        d.setdefault(r["indicador"], {})[r["ano"]] = r["valor"]
    return d


def salvar_meta(con: sqlite3.Connection, vid: int, indicador: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    if indicador not in CODIGOS or indicador == "equilibrio":
        raise Invalido("Indicador inválido (o ponto de equilíbrio é calculado, não tem limite digitado)")
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("O limite não pode ser negativo")
    con.execute("INSERT INTO indicadores_metas(versao_id, indicador, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, indicador, ano) DO UPDATE SET valor=excluded.valor", (vid, indicador, ano, valor))
    arr.auditar(con, autor, vid, "salvar_meta_indicador", f"{indicador} {ano}: {valor}")


def replicar_meta(con: sqlite3.Connection, vid: int, indicador: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    if indicador not in CODIGOS or indicador == "equilibrio":
        raise Invalido("Indicador inválido")
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    padrao = next(i[3] for i in INDICADORES if i[0] == indicador)
    r = con.execute("SELECT valor FROM indicadores_metas WHERE versao_id=? AND indicador=? AND ano=?", (vid, indicador, ano_origem)).fetchone()
    valor = r["valor"] if r else padrao
    for a in destinos:
        con.execute("INSERT INTO indicadores_metas(versao_id, indicador, ano, valor) VALUES(?,?,?,?) "
                    "ON CONFLICT(versao_id, indicador, ano) DO UPDATE SET valor=excluded.valor", (vid, indicador, a, valor))
    arr.auditar(con, autor, vid, "replicar_meta_indicador", f"{indicador}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


# ---------------------------------------------------------------- dados comuns
def _dados(con: sqlite3.Connection, vid: int, fl: Optional[dict] = None) -> Optional[dict]:
    """Séries do balanço, da DRE e do caixa, calculadas uma vez só. None se o balanço ainda não tem estrutura importada."""
    from . import balanco as svc_bp
    from . import captacoes as svc_cap
    from . import dre as svc_dre
    from . import fluxo as svc_fluxo
    from . import investimentos as svc_inv
    from . import realizado as svc_real
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    fl = fl or svc_fluxo.projetar(con, vid)
    if not fl["ativo"]:
        return None
    bp = svc_bp.ler(con, vid, fl)
    dre = svc_dre.ler(con, vid, fl["juros_auto"])
    B = {l["codigo"]: l for l in bp["linhas"]}
    D = {l["codigo"]: l["valores"] for l in dre["linhas"]}
    zero = {a: 0.0 for a in anos}
    ini = (svc_real.saldo_inicial(con, anos[0]) or {}).get("valores", {})

    def bal(cod):                                    # valor do balanço projetado
        return dict(B[cod]["valores"]) if cod in B else dict(zero)

    def ant(cod):                                    # valor do ano anterior (o primeiro vem do último balanço realizado)
        s = bal(cod)
        return {a: (s[a - 1] if a - 1 in s else ini.get(cod, 0.0)) for a in anos}

    def dr(cod):
        return dict(D.get(cod, zero))
    caps = svc_cap.somar(svc_cap.calcular(con, vid, anos), anos)
    tot = svc_inv.totais(con, vid, anos)
    from . import capital_giro as svc_cg
    dias_ano = next(l for sec in svc_cg.ler(con, vid)["premissas"] for l in sec["linhas"] if l["id"] == "dias_ano")["valores"]       # dias do ano do Capital de giro (real ou alterado)
    return {"anos": anos, "versao": v, "fl": fl, "bal": bal, "ant": ant, "dr": dr, "caps": caps, "tot": tot, "ini": ini, "dias": {a: dias_ano.get(a, dias_ano.get(str(a))) for a in anos},
            "dist": fl["linhas"]["dist"]}


def _soma(anos: List[int], *series) -> Dict[int, float]:
    return {a: sum(s[a] for s in series) for a in anos}


def _neg(anos: List[int], s: Dict[int, float]) -> Dict[int, float]:
    return {a: -s[a] for a in anos}


def _linha(id_, nome, valores, expl="", estilo=""):
    return {"id": id_, "nome": nome, "valores": valores, "explicacao": expl, "estilo": estilo}


# ---------------------------------------------------------------- fluxo de caixa indireto, simplificado e NCG
def _fluxos(d: dict) -> dict:
    anos, fl, dr = d["anos"], d["fl"], d["dr"]
    L = fl["linhas"]
    ebit, ebitda, dep_dre = dr("DS048"), dr("DS044"), _neg(anos, dr("DS047"))
    ir, non_op, res_fin, lucro = dr("DS060"), dr("DS054"), dr("DS051"), L["lucro"]
    eps = {a: lucro[a] - (ebit[a] + non_op[a] + res_fin[a] + ir[a]) for a in anos}          # demais linhas da DRE que não estão acima
    outros_ops = {a: L["outros"][a] + (L["dep"][a] - dep_dre[a]) + eps[a] + L["outros_pl"][a] for a in anos}
    capex, venda = _neg(anos, d["tot"]["investido"]), d["tot"]["desinvestido"]
    outras_imob = {a: L["imob"][a] - capex[a] - venda[a] for a in anos}
    capt = d["caps"]["captado"]
    amort = {a: L["dividas"][a] - capt[a] for a in anos}
    N = fl["variacao"]
    dist = _neg(anos, d["dist"])
    fco = _soma(anos, ebit, dep_dre, ir, L["ncg"], non_op, outros_ops)
    fci = L["imob"]
    fcf = _soma(anos, capt, amort, N, res_fin, dist, L["cap_aj"])
    caixa_ini = {a: (fl["caixa"][a - 1] if a - 1 in fl["caixa"] else d["ini"].get("SA07", 0.0)) for a in anos}
    variacao = _soma(anos, fco, fci, fcf)
    caixa_fim = _soma(anos, caixa_ini, variacao)
    ver = {a: caixa_fim[a] - fl["caixa"][a] for a in anos}
    return dict(ebit=ebit, ebitda=ebitda, dep=dep_dre, ir=ir, non_op=non_op, res_fin=res_fin, lucro=lucro, outros_ops=outros_ops, ncg=L["ncg"], capex=capex, venda=venda,
                outras_imob=outras_imob, capt=capt, amort=amort, N=N, dist=dist, cap_aj=L["cap_aj"], fco=fco, fci=fci, fcf=fcf, caixa_ini=caixa_ini, variacao=variacao,
                caixa_fim=caixa_fim, ver=ver)


def fluxo_indireto(d: dict, f: dict) -> List[dict]:
    anos = d["anos"]
    return [
        {"titulo": "Fluxo de caixa operacional", "linhas": [
            _linha("ebit", "EBIT", f["ebit"], "Resultado antes dos juros e do imposto (DRE)."),
            _linha("dep", "(+) Depreciação", f["dep"], "Despesa que não sai do caixa; soma de volta ao EBIT."),
            _linha("ir", "(−) Pagamento de IR e CSLL", f["ir"], "IR e CSLL da DRE, pagos no próprio ano."),
            _linha("ncg", "(−) Variação do capital de giro", f["ncg"], "Aumento da necessidade de capital de giro consome caixa (detalhe na seção de capital de giro)."),
            _linha("non_op", "(+) Outras receitas não operacionais", f["non_op"], "Outras receitas e despesas não operacionais da DRE."),
            _linha("outros_ops", "(+/−) Outros ativos e passivos", f["outros_ops"], "Variação das demais contas do balanço (outros créditos, realizável, participações, consórcios, outras obrigações de longo prazo) e ajustes entre a DRE e o balanço."),
            _linha("fco", "Fluxo de caixa operacional", f["fco"], "Soma das linhas acima.", "total")]},
        {"titulo": "Fluxo de caixa dos investimentos", "linhas": [
            _linha("capex", "(−) Investimentos (CAPEX)", f["capex"], "Total investido no ano (tela Investimentos)."),
            _linha("venda", "(+) Venda de imobilizado", f["venda"], "Desinvestimentos do ano (tela Investimentos)."),
            _linha("outras_imob", "(+/−) Outras variações do imobilizado", f["outras_imob"], "Variação do imobilizado vinda de premissas de balanço, sem tipo de investimento."),
            _linha("fci", "Fluxo de caixa dos investimentos", f["fci"], "Soma das linhas acima.", "total")]},
        {"titulo": "Fluxo de caixa dos financiamentos", "linhas": [
            _linha("capt", "(+) Captações", f["capt"], "Novas captações de custeio e capital de giro e financiamentos de investimentos (tela Novas captações)."),
            _linha("amort", "(−) Amortizações", f["amort"], "Variação das dívidas existentes (Endividamento) e das novas, menos as captações do ano."),
            _linha("N", "(+/−) Dívida de giro automática", f["N"], "Gerada quando o caixa ficaria abaixo do mínimo; a sobra de caixa a amortiza."),
            _linha("res_fin", "(−) Resultado financeiro", f["res_fin"], "Juros pagos (e receitas financeiras) do ano, inclusive os da dívida de giro automática."),
            _linha("dist", "(−) Distribuição de lucros", f["dist"], "Lucro de um ano distribuído aos sócios no ano seguinte (tela Patrimônio líquido)."),
            _linha("cap_aj", "(+/−) Capital e ajustes de avaliação", f["cap_aj"], "Variação do capital integralizado e dos ajustes de avaliação."),
            _linha("fcf", "Fluxo de caixa dos financiamentos", f["fcf"], "Soma das linhas acima.", "total")]},
        {"titulo": "Caixa", "linhas": [
            _linha("caixa_ini", "Saldo de caixa anterior", f["caixa_ini"], "Caixa do fim do ano anterior (o primeiro vem do último balanço realizado)."),
            _linha("variacao", "Variação no caixa", f["variacao"], "Operacional + investimentos + financiamentos.", "total"),
            _linha("caixa_fim", "Saldo final de caixa", f["caixa_fim"], "Saldo anterior + variação. É o caixa do balanço.", "total"),
            _linha("ver", "Verificação (saldo final − caixa do balanço)", f["ver"], "Deve ser zero.")]},
    ]


def fluxo_simplificado(d: dict, f: dict) -> List[dict]:
    anos, dr = d["anos"], d["dr"]
    rb, ded = dr("DS007"), dr("DS015")
    despesas = {a: f["ebitda"][a] - rb[a] - ded[a] for a in anos}
    juros_amort = _soma(anos, f["res_fin"], f["amort"])
    outros = _soma(anos, f["outros_ops"], f["cap_aj"])
    subtotal = _soma(anos, f["ebitda"], f["ncg"], juros_amort, f["fci"], f["non_op"], f["ir"], f["dist"], outros)
    apos = _soma(anos, subtotal, f["capt"], f["N"])
    ver = {a: f["caixa_ini"][a] + apos[a] - d["fl"]["caixa"][a] for a in anos}
    return [
        {"titulo": "Geração de caixa operacional", "linhas": [
            _linha("rb", "Receitas operacionais", rb, "Receita bruta da DRE."),
            _linha("ded", "Deduções sobre a receita", ded, "Impostos sobre as vendas."),
            _linha("despesas", "Despesas operacionais", despesas, "Custos e despesas operacionais (EBITDA − receita bruta − deduções)."),
            _linha("ebitda", "EBITDA ou geração de caixa operacional", f["ebitda"], "EBITDA da DRE.", "total")]},
        {"titulo": "Fluxo do período", "linhas": [
            _linha("ncg", "Necessidade de capital de giro", f["ncg"], "Variação da necessidade de capital de giro."),
            _linha("juros_amort", "Juros + amortizações das dívidas", juros_amort, "Resultado financeiro mais amortizações do ano."),
            _linha("fci", "Investimentos", f["fci"], "Investimentos líquidos (CAPEX menos vendas de imobilizado)."),
            _linha("non_op", "Outras receitas", f["non_op"], "Outras receitas não operacionais."),
            _linha("ir", "IR", f["ir"], "IR e CSLL."),
            _linha("dist", "Dividendos", f["dist"], "Distribuição de lucros do ano."),
            _linha("outros", "Outros", outros, "Demais variações: outros ativos e passivos, capital e ajustes."),
            _linha("subtotal", "Subtotal do período", subtotal, "Antes das novas dívidas.", "total")]},
        {"titulo": "Financiamento e caixa", "linhas": [
            _linha("capt", "Nova dívida (captações)", f["capt"], "Captações de custeio, capital de giro e financiamentos de investimentos."),
            _linha("N", "Dívida de giro automática", f["N"], "Geração (+) ou amortização (−) pela sobra de caixa."),
            _linha("apos", "Caixa após financiamentos (variação do caixa)", apos, "Subtotal + nova dívida + dívida de giro automática.", "total"),
            _linha("caixa_ini", "Posição de caixa no início do período", f["caixa_ini"], "Caixa do fim do ano anterior."),
            _linha("caixa_fim", "Posição de caixa ao término do período", {a: f["caixa_ini"][a] + apos[a] for a in anos}, "É o caixa do balanço.", "total"),
            _linha("ver", "Verificação", ver, "Deve ser zero.")]},
    ]


def capital_giro_resumo(d: dict) -> List[dict]:
    anos, bal, dr = d["anos"], d["bal"], d["dr"]
    rl, cpv = dr("DS018"), _neg(anos, dr("DS020"))
    clientes, estoques = bal("SA08"), _soma(anos, bal("SA10"), bal("SA10G"), bal("SA11"), bal("SA12"))
    outros_ac = _soma(anos, bal("SA13"), bal("SA14"))
    ac = _soma(anos, clientes, estoques, outros_ac)
    forn, imp, trab, outras = bal("SP07"), bal("SP09"), bal("SP11"), bal("SP10")
    pc = _soma(anos, forn, imp, trab, outras)
    ncg = {a: ac[a] - pc[a] for a in anos}
    ini = d["ini"]
    ncg0 = (sum(ini.get(c, 0.0) for c in ("SA08", "SA10", "SA11", "SA12", "SA13", "SA14")) - sum(ini.get(c, 0.0) for c in ("SP07", "SP09", "SP10", "SP11")))
    inv = {a: ncg[a] - (ncg[a - 1] if a - 1 in ncg else ncg0) for a in anos}
    dias = d["dias"]
    receber = {a: (clientes[a] / rl[a] * dias[a] if rl[a] else 0.0) for a in anos}
    estoque = {a: (estoques[a] / cpv[a] * dias[a] if cpv[a] else 0.0) for a in anos}
    pagar = {a: (forn[a] / cpv[a] * dias[a] if cpv[a] else 0.0) for a in anos}
    oper = _soma(anos, receber, estoque)
    fin = {a: oper[a] - pagar[a] for a in anos}
    return [
        {"titulo": "Ativo circulante operacional", "linhas": [
            _linha("clientes", "Contas a receber - Clientes", clientes), _linha("estoques", "Estoques (produtos acabados, insumos e lavoura em formação)", estoques),
            _linha("outros_ac", "Outros (rotação de cultura e preparo de solo a apropriar)", outros_ac), _linha("ac", "Ativo circulante operacional", ac, "Sem caixa e sem outros créditos.", "total")]},
        {"titulo": "Passivo circulante operacional", "linhas": [
            _linha("forn", "Contas a pagar - Fornecedores", forn), _linha("imp", "Impostos", imp), _linha("trab", "Obrigações trabalhistas", trab),
            _linha("outras", "Outras obrigações", outras), _linha("pc", "Passivo circulante operacional", pc, "", "total")]},
        {"titulo": "Necessidade de capital de giro", "linhas": [
            _linha("ncg", "Necessidade de capital de giro", ncg, "Ativo circulante operacional − passivo circulante operacional.", "total"),
            _linha("inv_cg", "Investimento em capital de giro", inv, "NCG do ano − NCG do ano anterior (o primeiro compara com o último balanço realizado).")]},
        {"titulo": "Ciclos (dias)", "linhas": [
            _linha("d_receber", "Dias de contas a receber", receber, "Clientes ÷ receita líquida × dias do ano."),
            _linha("d_estoque", "Dias de estoque", estoque, "Estoques ÷ custo do produto vendido × dias do ano."),
            _linha("ciclo_oper", "Ciclo operacional", oper, "Dias de receber + dias de estoque.", "total"),
            _linha("d_pagar", "Dias de contas a pagar", pagar, "Fornecedores ÷ custo do produto vendido × dias do ano."),
            _linha("ciclo_fin", "Ciclo financeiro", fin, "Ciclo operacional − dias de contas a pagar.", "total")]},
    ]


def ler_fluxo(con: sqlite3.Connection, vid: int, fl: Optional[dict] = None) -> dict:
    d = _dados(con, vid, fl)
    if d is None:
        return {"estrutura": False}
    f = _fluxos(d)
    return {"estrutura": True, "indireto": fluxo_indireto(d, f), "simplificado": fluxo_simplificado(d, f), "capital_giro": capital_giro_resumo(d)}


# ---------------------------------------------------------------- usos e fontes
def usos_fontes(con: sqlite3.Connection, vid: int, fl: Optional[dict] = None) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    d = _dados(con, vid, fl)
    if d is None:
        return {"versao": v, "anos": anos, "estrutura": False, "fontes": [], "usos": []}
    f = _fluxos(d)
    z = {a: 0.0 for a in anos}
    fontes: List[dict] = []
    usos: List[dict] = []

    def fixo(lista, id_, nome, serie, expl=""):
        lista.append(_linha(id_, nome, dict(serie), expl))

    def dinamico(id_, nome_fonte, nome_uso, serie, expl=""):                                 # entra na coluna que o sinal do ano indicar
        fontes.append(_linha(id_ + "_f", nome_fonte, {a: max(serie[a], 0.0) for a in anos}, expl))
        usos.append(_linha(id_ + "_u", nome_uso, {a: max(-serie[a], 0.0) for a in anos}, expl))
    fixo(fontes, "ebitda", "EBITDA", f["ebitda"], "Geração de caixa operacional da DRE.")
    dinamico("ncg", "Redução do capital de giro", "Aumento do capital de giro", f["ncg"])
    dinamico("caixa", "Redução de caixa", "Aumento do caixa", {a: -f["variacao"][a] for a in anos}, "Variação do caixa do balanço.")
    dinamico("outros_ativos", "Redução de outros ativos / aumento de outros passivos", "Aumento de outros ativos / redução de outros passivos", f["outros_ops"])
    dinamico("non_op", "Outras receitas não operacionais", "Outras despesas não operacionais", f["non_op"])
    dinamico("capt", "Novas captações e financiamentos", "Redução de captações", f["capt"])
    dinamico("amort", "Aumento líquido das dívidas existentes", "Pagamento de dívidas", f["amort"], "Variação das dívidas existentes e das novas, sem a dívida de giro automática.")
    dinamico("auto", "Dívida de giro automática (geração)", "Amortização da dívida de giro automática", f["N"])
    dinamico("venda", "Venda de imobilizado", "Investimentos (CAPEX)", _soma(anos, f["capex"], f["venda"]), "Investimentos menos vendas de imobilizado.")
    dinamico("imob_outras", "Redução de outras variações do imobilizado", "Outras variações do imobilizado", f["outras_imob"])
    dinamico("cap", "Integralização de capital e ajustes", "Redução de capital e ajustes", f["cap_aj"])
    dinamico("juros", "Receitas financeiras líquidas", "Juros e resultado financeiro", f["res_fin"])
    dinamico("ir", "Crédito de IR e CSLL", "IR e CSLL", f["ir"])
    dinamico("dist", "Redução de distribuição", "Retiradas e dividendos", f["dist"])
    tf = _soma(anos, *[l["valores"] for l in fontes])
    tu = _soma(anos, *[l["valores"] for l in usos])
    return {"versao": v, "anos": anos, "estrutura": True,
            "fontes": fontes + [_linha("total_fontes", "TOTAL - FONTES", tf, "Soma das fontes.", "total")],
            "usos": usos + [_linha("total_usos", "TOTAL - USOS", tu, "Soma dos usos.", "total")],
            "verificacao": _linha("ver", "Verificação (fontes − usos)", {a: tf[a] - tu[a] for a in anos}, "Deve ser zero.")}


# ---------------------------------------------------------------- índices e composição do endividamento
def _formulas_indicadores(anos, ebitda, ebit, lucro, rl, rb, cpv, bruto, fixas, desp_fin, dist, cpltd_ant, bal) -> tuple:
    """Os 11 indicadores por ano (mesmas fórmulas para o projetado e o realizado) e o faturamento mínimo do ponto de equilíbrio. bal(cod) = série do balanço."""
    def s(*cods):
        return _soma(anos, *[bal(c) for c in cods])

    def div(a, b):
        return a / b if b else None
    divida = s("SP08", "SPAUTO", "SP12", "SP17", "SP18")                                       # dívida bancária: custeio e giro, giro automática, CPLTD e longo prazo (sem consórcios)
    cpltd, ativo, passivo_c, ativo_c = bal("SP12"), bal("SA"), bal("SP06"), bal("SA06")
    caixa, pl = bal("SA07"), bal("SP22")
    ac_op = s("SA08", "SA09", "SA10", "SA10G", "SA11", "SA12", "SA13", "SA14")
    pc_op = s("SP07", "SP09", "SP11", "SP13")
    estoques = s("SA10", "SA10G", "SA11", "SA12", "SA13", "SA14")                           # todos os estoques: produtos acabados, gado, insumos, lavoura, rotação e preparo de solo
    capital = {a: ac_op[a] - pc_op[a] + bal("SA19").get(a, 0.0) + caixa[a] for a in anos}
    equilibrio_min = {a: (div(fixas[a] + desp_fin[a] + dist[a] + cpltd_ant[a], div(bruto[a], rl[a]) or 0.0) if (rl[a] and bruto[a]) else None) for a in anos}
    valores = {
        "alav_total": {a: (divida[a] / ebitda[a] if ebitda[a] > 0 else None) for a in anos},
        "liquidez": {a: div(ativo_c[a], passivo_c[a]) for a in anos},
        "capacidade": {a: (ebitda[a] / (cpltd[a] + desp_fin[a]) if (cpltd[a] + desp_fin[a]) > 0 else None) for a in anos},
        "equilibrio": {a: rb[a] for a in anos},
        "solvencia": {a: div(pl[a], ativo[a]) for a in anos},
        "divida_ativo": {a: div(ativo[a] - pl[a], ativo[a]) for a in anos},                 # todo o exigível (ativo − patrimônio líquido), como no Fechamento Financeiro
        "alav_liquida": {a: (max((divida[a] - caixa[a]) / ebitda[a], 0.0) if ebitda[a] > 0 else None) for a in anos},
        "margem_ebitda": {a: div(ebitda[a], rl[a]) for a in anos},
        "alav_operacional": {a: div(bal("SP07")[a] + bal("SP08")[a] + bal("SPAUTO")[a], cpv[a] + estoques[a] + caixa[a]) for a in anos},
        "roic": {a: div(ebit[a], capital[a]) for a in anos},
        "roe": {a: div(lucro[a], pl[a]) for a in anos},
    }
    return valores, equilibrio_min


def _indicadores_realizados(con: sqlite3.Connection, primeiro_ano: int) -> dict:
    """Os mesmos indicadores com o balanço e a DRE realizados (anos fechados anteriores ao orçamento). A distribuição de lucros não vem do realizado: fica de fora do faturamento mínimo."""
    anos = [r["ano"] for r in con.execute("SELECT a.ano FROM realizado_anos a JOIN realizado_anos b ON b.ano=a.ano AND b.demonstrativo='DRE' "
                                          "WHERE a.demonstrativo='BP' AND a.ano<? ORDER BY a.ano", (primeiro_ano,))]
    from . import realizado as svc_real
    cont: Dict[tuple, float] = {(r["demonstrativo"], r["codigo"], r["ano"]): r["valor"] for r in con.execute("SELECT demonstrativo, codigo, ano, valor FROM realizado")}
    parcial = con.execute("SELECT ano, meses, mes_inicio FROM realizado_parcial_anos WHERE ano<? ORDER BY ano DESC LIMIT 1", (primeiro_ano,)).fetchone()
    meses = {}
    if parcial:                                                                          # ano em andamento (ex.: jan a jun): DRE do período e balanço do último dia dele
        meses[parcial["ano"]] = svc_real._rotulo_periodo(parcial["mes_inicio"], parcial["meses"])
        anos = anos + [parcial["ano"]]
        for r in con.execute("SELECT demonstrativo, codigo, ano, valor FROM realizado_parcial WHERE ano=?", (parcial["ano"],)):
            cont[(r["demonstrativo"], r["codigo"], r["ano"])] = r["valor"]
    if not anos:
        return {"anos": [], "valores": {}, "meses": {}}
    serie = lambda dem, cod, sinal=1.0: {a: sinal * cont.get((dem, cod, a), 0.0) / MIL for a in anos}
    bal = lambda cod: serie("BP", cod)
    dr = lambda cod: serie("DRE", cod)
    z = {a: 0.0 for a in anos}
    cpltd = bal("SP12")
    cpltd_ant = {a: (cpltd[a - 1] if a - 1 in cpltd else cont.get(("BP", "SP12", a - 1), 0.0) / MIL) for a in anos}
    valores, _ = _formulas_indicadores(anos, dr("DS044"), dr("DS048"), dr("DS062"), dr("DS018"), dr("DS007"), serie("DRE", "DS020", -1.0), dr("DS027"),
                                       serie("DRE", "DS030", -1.0), serie("DRE", "DS053", -1.0), z, cpltd_ant, bal)
    return {"anos": anos, "valores": valores, "meses": meses}


def indicadores(con: sqlite3.Connection, vid: int, fl: Optional[dict] = None) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    d = _dados(con, vid, fl)
    metas = _metas(con, vid)
    base = {"versao": v, "anos": anos, "anos_realizados": [], "estrutura": d is not None, "indicadores": [], "endividamento": []}
    if d is None:
        return base
    bal, dr, ini = d["bal"], d["dr"], d["ini"]
    ebitda, ebit, lucro, rl, rb = dr("DS044"), dr("DS048"), dr("DS062"), dr("DS018"), dr("DS007")
    cpv, bruto, fixas, desp_fin = _neg(anos, dr("DS020")), dr("DS027"), _neg(anos, dr("DS030")), _neg(anos, dr("DS053"))
    dist = d["dist"]

    def s(*cods):
        return _soma(anos, *[bal(c) for c in cods])
    divida = s("SP08", "SPAUTO", "SP12", "SP17", "SP18")                                       # dívida bancária: custeio e giro, giro automática, CPLTD e longo prazo (sem consórcios)
    cpltd, ativo, passivo_c, ativo_c = bal("SP12"), bal("SA"), bal("SP06"), bal("SA06")
    caixa, pl = bal("SA07"), bal("SP22")

    cpltd_ant = {a: (cpltd[a - 1] if a - 1 in cpltd else ini.get("SP12", 0.0)) for a in anos}
    valores, equilibrio_min = _formulas_indicadores(anos, ebitda, ebit, lucro, rl, rb, cpv, bruto, fixas, desp_fin, dist, cpltd_ant, bal)
    real = _indicadores_realizados(con, anos[0])
    base["anos_realizados"] = real["anos"]
    base["meses_realizados"] = real.get("meses", {})                                    # ano em andamento: meses fechados (ex.: {2026: 6})
    for cod, nome, sentido, padrao, casas, pct in INDICADORES:
        if cod == "equilibrio":
            meta = equilibrio_min
        else:
            meta = {a: metas.get(cod, {}).get(a, padrao) for a in anos}
        serie = valores[cod]
        status = {}
        for a in anos:
            x, m = serie[a], meta[a]
            status[a] = None if (x is None or m is None) else (x >= m if sentido == "min" else x <= m)
        base["indicadores"].append({"codigo": cod, "nome": nome, "sentido": sentido, "casas": casas, "percentual": pct, "valores": serie, "meta": meta, "atende": status,
                                    "meta_editavel": cod != "equilibrio", "realizado": real["valores"].get(cod, {})})
    cp, lp, cplt = s("SP08", "SPAUTO"), s("SP17", "SP18"), cpltd
    total = _soma(anos, cp, lp, cplt)
    pct = lambda x: {a: (x[a] / total[a] if total[a] else 0.0) for a in anos}
    base["endividamento"] = [
        _linha("cp", "Dívida de curto prazo (custeio, capital de giro e automática)", cp), _linha("cpltd", "CPLTD (parcela de curto prazo da dívida de investimento)", cplt),
        _linha("lp", "Dívida de longo prazo", lp), _linha("total", "Dívida bancária total", total, "Soma das três linhas.", "total"),
        _linha("p_cp", "% curto prazo", pct(cp)), _linha("p_cpltd", "% CPLTD", pct(cplt)), _linha("p_lp", "% longo prazo", pct(lp)),
        _linha("desp_fin", "Despesas financeiras", desp_fin, "Juros do ano (DRE)."),
        _linha("custo", "Custo da dívida (despesas financeiras ÷ dívida total)", {a: (desp_fin[a] / total[a] if total[a] else 0.0) for a in anos}, "", "total")]
    return base
