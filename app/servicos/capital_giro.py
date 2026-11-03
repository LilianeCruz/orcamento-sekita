"""Capital de giro: mesma lógica da aba "Capital de Giro" da planilha de orçamento, mas com todos os prazos DIGITÁVEIS por ano.

Base: Receita líquida e Custo do produto vendido (CPV) da DRE (se a estrutura da DRE ainda não foi importada, usa o
consolidado do Resultado por produto). Dias no ano = os dias reais do ano analisado (365, ou 366 em ano bissexto) se não for informado; pode ser alterado por ano.

  Ativo circulante operacional (sem caixa)
    Contas a receber            = Receita líquida × dias de receita ÷ dias no ano
    Despesas do exercício seguinte = Receita líquida × dias ÷ dias no ano      (como na fórmula da planilha, apesar do rótulo "CPV")
    Estoque de produtos acabados = estoque a custo do Resultado por produto (quantidade estocada × custo médio); não tem prazo médio digitado
    Estoque de insumos          = CPV × dias de CPV ÷ dias no ano
    Lavoura em formação         = CPV × dias de CPV ÷ dias no ano
  Passivo circulante operacional
    Fornecedores, Outras obrigações, Obrigações trabalhistas = CPV × dias de CPV ÷ dias no ano
  Necessidade de capital de giro (NCG) = Ativo circulante operacional − Passivo circulante operacional
  Investimento em capital de giro      = NCG do ano − NCG do ano anterior
  Ciclo operacional = dias de receber + dias da lavoura + dias de insumos
  Ciclo financeiro  = ciclo operacional − dias de fornecedores;  Giro por ano = dias no ano ÷ ciclo financeiro
  Caixa mínimo = % do custo de produção (CPV) informado por ano   (no lugar dos "2 meses de custo" fixos da planilha); o caixa de fato vem do Fluxo de caixa
"""
from __future__ import annotations

import calendar
import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from . import realizado as svc_real
from .realizado import dias_do_ano                       # padrão de 'Dias no ano': os dias reais do ano (365 ou 366)
from .arrendamentos import Invalido




# campo -> (rótulo, unidade, grupo)
CAMPOS = {
    "dias_ano": ("Dias no ano", "dias", "geral"),
    "dias_receber": ("Contas a receber - Clientes", "dias de receita", "ativo"),
    "dias_rotacao": ("Rotação de cultura a apropriar", "dias de CPV", "ativo"),
    "dias_preparo": ("Preparo de solo e despesas a apropriar", "dias de CPV", "ativo"),
    "dias_insumos": ("Estoque de insumos", "dias de CPV", "ativo"),
    "dias_lavoura": ("Lavoura em formação", "dias de CPV", "ativo"),
    "dias_fornecedores": ("Contas a pagar - Fornecedores", "dias de CPV", "passivo"),
    "dias_outras": ("Outras obrigações", "dias de CPV", "passivo"),
    "dias_trabalhistas": ("Obrigações trabalhistas", "dias de CPV", "passivo"),
    "dias_impostos": ("Impostos a pagar", "dias de deduções da receita", "passivo"),
    "saldo_outros_creditos": ("Outros créditos a receber", "R$ mil", "saldo"),
    "saldo_realizavel": ("Realizável a longo prazo", "R$ mil", "saldo"),
    "saldo_participacoes": ("Investimentos em participações societárias", "R$ mil", "saldo"),
    "saldo_intangivel": ("Intangível - marcas e patentes", "R$ mil", "saldo"),
    "saldo_consorcios_curto": ("Consórcios a vencer (curto prazo)", "R$ mil", "saldo"),
    "saldo_consorcios_longo": ("Consórcios a vencer (longo prazo)", "R$ mil", "saldo"),
    "saldo_outras_lp": ("Outras obrigações de longo prazo", "R$ mil", "saldo"),
    "saldo_caixa": ("Caixa mínimo (disponibilidades)", "R$ mil", "caixa"),
    "pct_caixa": ("Caixa mínimo", "% do custo de produção", "caixa"),
}
# prazos que o botão "atualizar prazos médios" calcula do último balanço realizado (o estoque de produtos acabados é só informativo)
CAMPOS_ATUALIZAVEIS = ("dias_receber", "dias_rotacao", "dias_preparo", "dias_insumos", "dias_lavoura", "dias_fornecedores", "dias_outras", "dias_trabalhistas",
                       "dias_impostos", "saldo_outros_creditos", "saldo_realizavel", "saldo_participacoes", "saldo_intangivel",
                       "saldo_consorcios_curto", "saldo_consorcios_longo", "saldo_outras_lp", "saldo_caixa")
# contas sem prazo médio: o saldo de cada ano é digitado ou vem da média dos saldos dos anos fechados (campo, id na projeção)
CAMPOS_SALDO = tuple((c, c.replace("saldo_", "")) for c in CAMPOS if c.startswith("saldo_") and CAMPOS[c][2] == "saldo")
BASE_NOME = {"RL": "receita líquida", "CPV": "custo do produto vendido", "DED": "deduções da receita"}


def _valores(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {}
    for r in con.execute("SELECT campo, ano, valor FROM capital_giro WHERE versao_id=?", (vid,)):
        d.setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def _base(con: sqlite3.Connection, vid: int, anos: List[int]):
    """(receita líquida, CPV positivo, estoque de produtos acabados, origem, deduções da receita positivas) em R$, por ano."""
    from . import dre as svc_dre
    from . import resultado as svc_res

    res = svc_res.calcular(con, vid)
    linha = lambda bloco, id_: next((l for l in res["consolidado"].get(bloco, []) if l["id"] == id_), None)
    est = linha("estoque", "estoque_valor")
    estoque = {a: (est["valores"].get(a, est["valores"].get(str(a), 0.0)) if est else 0.0) for a in anos}
    d = svc_dre.ler(con, vid, juros_auto={})                                  # as bases (receita, CPV, deduções) não dependem dos juros
    if d["linhas"]:
        por = {l["codigo"]: l["valores"] for l in d["linhas"]}
        rec = {a: por["DS018"][a] if "DS018" in por else 0.0 for a in anos}
        cpv = {a: -(por["DS020"][a]) if "DS020" in por else 0.0 for a in anos}
        ded = {a: -(por["DS015"][a]) if "DS015" in por else 0.0 for a in anos}
        return rec, cpv, estoque, "DRE", ded
    rl, cp = linha("anual", "receita_liquida_anual"), linha("anual", "cpv")
    pega = lambda l, a: (l["valores"].get(a, l["valores"].get(str(a), 0.0)) if l else 0.0)
    dd = linha("anual", "deducoes_anual")
    return {a: pega(rl, a) for a in anos}, {a: -pega(cp, a) for a in anos}, estoque, "Resultado por produto", {a: -pega(dd, a) for a in anos}


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    val = _valores(con, vid)
    real = svc_real.prazos(con)
    ano_real = svc_real.ultimo_ano(con)
    marcas, marcas_anos = {}, {}
    for r in con.execute("SELECT campo, ano, ano_realizado, anos FROM capital_giro_origem WHERE versao_id=?", (vid,)):
        marcas.setdefault(r["campo"], {})[r["ano"]] = r["ano_realizado"]
        marcas_anos.setdefault(r["campo"], {})[r["ano"]] = [int(x) for x in r["anos"].split(",") if x] or [r["ano_realizado"]]
    entrada = lambda campo: {a: val.get(campo, {}).get(a, 0.0) for a in anos}
    padrao = {a: dias_do_ano(a) for a in anos}
    dias_ano = {a: (val.get("dias_ano", {}).get(a) or padrao[a]) for a in anos}
    rec, cpv, estoque_pa, origem, ded = _base(con, vid, anos)

    def por_dias(base, campo):
        d = entrada(campo)
        return {a: base[a] * d[a] / dias_ano[a] for a in anos}

    receber = por_dias(rec, "dias_receber")
    rotacao, preparo = por_dias(cpv, "dias_rotacao"), por_dias(cpv, "dias_preparo")
    saldos = {i: entrada(c) for c, i in CAMPOS_SALDO}
    insumos, lavoura = por_dias(cpv, "dias_insumos"), por_dias(cpv, "dias_lavoura")
    forn, outras, trab = por_dias(cpv, "dias_fornecedores"), por_dias(cpv, "dias_outras"), por_dias(cpv, "dias_trabalhistas")
    impostos = por_dias(ded, "dias_impostos")
    ac = {a: receber[a] + rotacao[a] + preparo[a] + estoque_pa[a] + insumos[a] + lavoura[a] for a in anos}
    pc = {a: forn[a] + outras[a] + trab[a] + impostos[a] for a in anos}
    ncg = {a: ac[a] - pc[a] for a in anos}
    ini = svc_real.saldo_inicial(con, anos[0])
    ncg_ini = ini["ncg"] if ini else None
    inv = {a: (ncg[a] - ncg[anos[i - 1]] if i else (ncg[a] - ncg_ini if ncg_ini is not None else None)) for i, a in enumerate(anos)}
    d_rec, d_lav, d_ins, d_for = entrada("dias_receber"), entrada("dias_lavoura"), entrada("dias_insumos"), entrada("dias_fornecedores")
    oper = {a: d_rec[a] + d_lav[a] + d_ins[a] for a in anos}
    fin = {a: oper[a] - d_for[a] for a in anos}
    giro = {a: (dias_ano[a] / fin[a] if fin[a] > 0 else 0.0) for a in anos}
    pct = entrada("pct_caixa")
    caixa_valor = entrada("saldo_caixa")
    caixa = {a: (caixa_valor[a] if caixa_valor[a] > 0 else cpv[a] * pct[a] / 100.0) for a in anos}      # valor digitado (ou a média do realizado); sem ele, vale o % do custo de produção

    def E(campo, expl):
        l = {"id": campo, "nome": CAMPOS[campo][0], "unidade": CAMPOS[campo][1], "entrada": True, "valores": entrada(campo), "explicacao": expl}
        if campo in real["campos"] and real["anos"]:
            l["realizado"] = {a: real["campos"][campo].get(a) for a in real["anos"]}
        elif campo in real["saldos"] and real["anos"]:
            l["realizado"] = {a: real["saldos"][campo].get(a) for a in real["anos"]}
        if campo in CAMPOS_ATUALIZAVEIS and ano_real is not None:
            usados = next(iter(marcas_anos.get(campo, {}).values()), [ano_real])      # período da média aplicada (ou o último ano, se nada foi aplicado)
            l["explicacao"] += " " + _origem_texto(con, campo, usados, real)
            l["origem"] = {a: marcas.get(campo, {}).get(a) for a in anos}
            l["origem_anos"] = {a: marcas_anos.get(campo, {}).get(a) for a in anos}
        return l
    L = lambda id_, nome, unid, valores, expl, estilo="": {"id": id_, "nome": nome, "unidade": unid, "entrada": False, "valores": valores, "explicacao": expl, "estilo": estilo}
    out = {
        "versao": v, "anos": anos, "origem": origem, "dias_padrao": padrao,
        "realizado": {"anos": real["anos"], "ultimo_ano": ano_real, "ncg_inicial": ({"ano": ini["ano"], "valor": ncg_ini} if ini else None)},
        "premissas": [
            {"titulo": "Geral", "linhas": [{**E("dias_ano", "Base de dias do ano nas contas abaixo. O padrão é a quantidade real de dias do ano (365, ou 366 em ano bissexto); "
                                                                       "você pode alterar. Apagar o campo volta ao padrão."),
                                          "valores": dias_ano, "padrao": padrao, "personalizado": {a: bool(val.get("dias_ano", {}).get(a)) for a in anos}}]},
            {"titulo": "Prazo médio do ativo", "linhas": [
                E("dias_receber", "Contas a receber = Receita líquida × dias ÷ dias no ano."),
                E("dias_rotacao", "Rotação de cultura a apropriar = CPV × dias ÷ dias no ano (custo da safra seguinte pago antes, por isso acompanha o custo)."),
                E("dias_preparo", "Preparo de solo e despesas de fazendas a apropriar = CPV × dias ÷ dias no ano."),
                E("dias_insumos", "Estoque de insumos = CPV × dias ÷ dias no ano."),
                E("dias_lavoura", "Lavoura em formação = CPV × dias ÷ dias no ano.")]},
            {"titulo": "Prazo médio do passivo", "linhas": [
                E("dias_fornecedores", "Contas a pagar - Fornecedores = CPV × dias ÷ dias no ano."),
                E("dias_outras", "Outras obrigações = CPV × dias ÷ dias no ano."),
                E("dias_trabalhistas", "Obrigações trabalhistas = CPV × dias ÷ dias no ano."),
                E("dias_impostos", "Impostos a pagar = Deduções da receita (impostos sobre as vendas) × dias ÷ dias no ano. Faz parte da necessidade de capital de giro.")]},
            {"titulo": "Contas de saldo", "linhas": [
                E(c, f"{CAMPOS[c][0]}: saldo em 31/12 de cada ano, em R$. Não tem prazo médio: o botão de média leva o saldo médio dos anos fechados que você marcar, "
                     "e você pode digitar o valor que quiser em qualquer ano. Enquanto nenhum valor for gravado, o balanço mantém o saldo do último balanço realizado. "
                     "Fica fora da necessidade de capital de giro.") for c, _ in CAMPOS_SALDO]},
            {"titulo": "Caixa", "linhas": [E("saldo_caixa", "Caixa mínimo, em R$: é o piso do caixa de fechamento do Fluxo de caixa (as disponibilidades do balanço). Se o caixa ficaria abaixo disso, o sistema gera dívida de giro automática; a sobra amortiza essa dívida. "
                                                      "O botão de média leva o caixa médio dos anos fechados que você marcar, e você pode digitar o valor que quiser em qualquer ano. Se nenhum valor for informado, vale o percentual do custo de produção (campo antigo).")]},
        ],
        "resultado": [
            {"titulo": "Base", "linhas": [
                L("receita", "Receita líquida", "R$ mil", rec, f"Vem da {origem}: Receita Líquida do ano."),
                L("cpv", "Custo do produto vendido", "R$ mil", cpv, f"Vem da {origem}: custo do produto vendido (custo de produção) do ano, em valor positivo."),
                L("deducoes", "Deduções da receita", "R$ mil", ded, f"Vem da {origem}: deduções da receita (impostos sobre as vendas) do ano, em valor positivo.")]},
            {"titulo": "Ativo circulante operacional", "linhas": [
                L("receber", "Contas a Receber - Clientes", "R$ mil", receber, "Receita líquida × dias de receber ÷ dias no ano."),
                L("rotacao", "Rotação de cultura a apropriar", "R$ mil", rotacao, "CPV × dias de rotação ÷ dias no ano."),
                L("preparo", "Preparo de solo e despesas a apropriar", "R$ mil", preparo, "CPV × dias de preparo ÷ dias no ano."),
                L("estoque_pa", "Estoque de produtos acabados", "R$ mil", estoque_pa, "Estoque a custo dos produtos no Resultado por produto (quantidade estocada × custo médio)."),
                L("insumos", "Estoque de insumos", "R$ mil", insumos, "CPV × dias de insumos ÷ dias no ano."),
                L("lavoura", "Lavoura em formação", "R$ mil", lavoura, "CPV × dias de lavoura ÷ dias no ano."),
                L("ac", "Total do ativo circulante operacional", "R$ mil", ac, "Soma das linhas acima (sem caixa).", "total")]},
            {"titulo": "Passivo circulante operacional", "linhas": [
                L("fornecedores", "Contas a Pagar - Fornecedores", "R$ mil", forn, "CPV × dias de fornecedores ÷ dias no ano."),
                L("outras", "Outras Obrigações", "R$ mil", outras, "CPV × dias ÷ dias no ano."),
                L("trabalhistas", "Obrigações Trabalhistas", "R$ mil", trab, "CPV × dias ÷ dias no ano."),
                L("impostos", "Impostos a Pagar", "R$ mil", impostos, "Deduções da receita × dias de impostos ÷ dias no ano."),
                L("pc", "Total do passivo circulante operacional", "R$ mil", pc, "Soma das linhas acima.", "total")]},
            {"titulo": "Contas de saldo", "linhas": [
                {**L(i_, CAMPOS[c][0], "R$ mil", saldos[i_], "Saldo digitado ou médio dos anos fechados (premissa acima). Não entra na necessidade de capital de giro."), "informado": c in val}
                for c, i_ in CAMPOS_SALDO]},
            {"titulo": "Capital de giro", "linhas": [
                L("ncg", "Necessidade de Capital de Giro", "R$ mil", ncg, "Ativo circulante operacional − Passivo circulante operacional.", "total"),
                L("inv_cg", "Investimento em CG", "R$ mil", inv, "NCG do ano − NCG do ano anterior. No primeiro ano do horizonte, a comparação é com a NCG do último balanço realizado (se houver); sem realizado, fica em branco.")]},
            {"titulo": "Ciclos", "linhas": [
                L("ciclo_oper", "Ciclo operacional", "dias", oper, "Dias de receber + dias de lavoura + dias de insumos. O estoque de produtos acabados não entra: não é um prazo, é o saldo que fica em estoque (Resultado por produto)."),
                L("ciclo_fin", "Ciclo financeiro", "dias", fin, "Ciclo operacional − dias de fornecedores."),
                L("giro", "Giro por ano", "uni", giro, "Dias no ano ÷ ciclo financeiro (zero se o ciclo financeiro não for positivo).")]},
            {"titulo": "Caixa", "linhas": [
                L("caixa", "Caixa mínimo", "R$ mil", caixa, "Valor de caixa mínimo informado (ou a média do realizado). O caixa do balanço vem do Fluxo de caixa e nunca fica abaixo disso.", "total")]},
        ],
    }
    ult = _resultado_realizado(con, real, ano_real)
    for sec in out["resultado"]:
        for l in sec["linhas"]:
            l["realizado"] = ult.get(l["id"])       # último ano realizado, para comparar com o calculado
    return out


def _resultado_realizado(con: sqlite3.Connection, real: dict, ano: Optional[int]) -> Dict[str, Optional[float]]:
    """Linhas do resultado do balanço no último ano realizado: saldos do balanço e bases da DRE."""
    if ano is None or ano not in real["anos"]:
        return {}
    bp = svc_real._valores(con)["BP"]
    conta = lambda *cs: sum(bp.get(c, {}).get(ano, 0.0) for c in cs) / 1000.0
    r = {"receita": real["base"]["RL"].get(ano, 0.0) / 1000.0, "cpv": real["base"]["CPV"].get(ano, 0.0) / 1000.0, "deducoes": real["base"]["DED"].get(ano, 0.0) / 1000.0,
         "receber": conta("SA08"), "rotacao": conta("SA13"), "preparo": conta("SA14"), "estoque_pa": conta("SA10"), "insumos": conta("SA11"), "lavoura": conta("SA12"),
         "caixa": conta("SA07"), "fornecedores": conta("SP07"), "outras": conta("SP10"), "trabalhistas": conta("SP11"), "impostos": conta("SP09")}
    r["ac"] = sum(r[k] for k in ("receber", "rotacao", "preparo", "estoque_pa", "insumos", "lavoura"))
    r["pc"] = sum(r[k] for k in ("fornecedores", "outras", "trabalhistas", "impostos"))
    for c, i_ in CAMPOS_SALDO:
        r[i_] = real["saldos"].get(c, {}).get(ano)
    return r


def _br(v: float) -> str:
    return f"{v:,.0f}".replace(",", ".")


def _dias_br(v: float) -> str:
    return f"{v:.1f}".replace(".", ",")


def _origem_texto(con: sqlite3.Connection, campo: str, anos: List[int], real: dict) -> str:
    """Como o prazo realizado foi calculado: contas do balanço, base da DRE e dias do ano; com vários anos, a média simples."""
    nomes = {r["codigo"]: r["nome"] for r in con.execute("SELECT codigo, nome FROM bp_linhas")}
    if campo in svc_real.SALDOS:
        cs = " + ".join(f"{nomes.get(c, c)} ({c})" for c in svc_real.SALDOS[campo])
        sv = real["saldos"][campo]
        if len(anos) == 1:
            return f"Origem do cálculo (realizado de {anos[0]}): saldo de {cs} em 31/12/{anos[0]} = R$ {_br(sv[anos[0]])} mil."
        soma = " + ".join(_br(sv[a]) for a in anos)
        return (f"Origem do cálculo (média simples dos saldos de {', '.join(map(str, anos))}): " + "; ".join(f"{a}: R$ {_br(sv[a])} mil" for a in anos)
                + f". Média = ({soma}) ÷ {len(anos)} = R$ {_br(sum(sv[a] for a in anos) / len(anos))} mil.")
    contas, b = svc_real.PRAZOS[campo]
    cs = " + ".join(f"{nomes.get(c, c)} ({c})" for c in contas)

    def um(ano: int) -> Optional[str]:
        d = real["detalhe"][campo].get(ano)
        if d is None:
            return None
        return (f"saldo de {cs} em 31/12/{ano} = R$ {_br(d['saldo'] / 1000)} mil ÷ ({BASE_NOME[b]} R$ {_br(d['base'] / 1000)} mil ÷ {d['dias_ano']:.0f} dias) "
                f"= {_dias_br(real['campos'][campo][ano])} dias")
    if len(anos) == 1:
        t = um(anos[0])
        return f"Origem do cálculo (realizado de {anos[0]}): {t}." if t else f"Origem: no realizado de {anos[0]} não há {BASE_NOME[b]} para calcular."
    vals = {a: real["campos"][campo].get(a) for a in anos}
    validos = {a: v for a, v in vals.items() if v is not None}
    partes = "; ".join(f"{a}: {um(a)}" if a in validos else f"{a}: sem {BASE_NOME[b]}, ficou de fora" for a in anos)
    if not validos:
        return f"Origem: nos anos {', '.join(map(str, anos))} não há {BASE_NOME[b]} para calcular."
    media = sum(validos.values()) / len(validos)
    soma = " + ".join(_dias_br(v) for v in validos.values())
    return f"Origem do cálculo (média simples de {', '.join(map(str, anos))}): {partes}. Média = ({soma}) ÷ {len(validos)} = {_dias_br(media)} dias."


def opcoes_periodo(anos: List[int]) -> List[dict]:
    """Atalhos de período sobre os anos fechados: último ano, 2, 3, 5 anos e todos (sem repetir a mesma seleção)."""
    out, vistos = [], set()
    for n, rotulo in ((1, "Último ano"), (2, "Últimos 2 anos"), (3, "Últimos 3 anos"), (5, "Últimos 5 anos"), (0, "Todos os anos fechados")):
        sel = anos[-n:] if n else list(anos)
        if tuple(sel) in vistos or not sel:
            continue
        vistos.add(tuple(sel))
        out.append({"id": str(n or "todos"), "rotulo": rotulo, "anos": sel})
    return out


def previa_prazos(con: sqlite3.Connection, vid: int) -> dict:
    """Prazos de cada ano fechado, por campo, para escolher o período da média, e a média de cada atalho."""
    arr.obter_versao(con, vid)
    real = svc_real.prazos(con)
    anos = real["anos"]
    opcoes = opcoes_periodo(anos)
    serie = lambda campo: real["saldos"][campo] if campo in real["saldos"] else real["campos"][campo]
    media = lambda campo, sel: (lambda v: (sum(v) / len(v)) if v else None)([serie(campo)[a] for a in sel if serie(campo).get(a) is not None])
    campos = [{"id": c, "nome": CAMPOS[c][0], "unidade": CAMPOS[c][1], "por_ano": {a: serie(c).get(a) for a in anos},
               "por_opcao": {o["id"]: media(c, o["anos"]) for o in opcoes}} for c in CAMPOS_ATUALIZAVEIS]
    return {"anos": anos, "opcoes": opcoes, "campos": campos, "padrao": anos[-3:]}


def atualizar_prazos(con: sqlite3.Connection, vid: int, autor: str, anos_escolhidos: Optional[List[int]] = None) -> dict:
    """Calcula os prazos como média simples dos anos fechados escolhidos (padrão: o último) e grava em todos os anos do horizonte; depois cada um pode ser editado."""
    v = arr.versao_editavel(con, vid)
    real = svc_real.prazos(con)
    if not real["anos"]:
        raise Invalido("Ainda não há Balanço e DRE realizados do mesmo ano. Suba os anos fechados na tela Realizado.")
    escolhidos = sorted(set(anos_escolhidos)) if anos_escolhidos else [real["anos"][-1]]
    fora = [a for a in escolhidos if a not in real["anos"]]
    if fora:
        raise Invalido(f"Não há Balanço e DRE realizados de {', '.join(map(str, fora))}")
    ultimo = escolhidos[-1]
    anos = [a for a in arr.anos_da_versao(v) if a > ultimo]
    if not anos:
        raise Invalido(f"O horizonte da versão não tem anos depois de {ultimo}")
    feitos = 0
    for campo in CAMPOS_ATUALIZAVEIS:
        serie = real["saldos"][campo] if campo in real["saldos"] else real["campos"][campo]
        validos = [serie[a] for a in escolhidos if serie.get(a) is not None]
        if not validos:
            continue
        valor = round(sum(validos) / len(validos), 1)
        for a in anos:
            con.execute("INSERT INTO capital_giro(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                        "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, a, valor))
            con.execute("INSERT INTO capital_giro_origem(versao_id, campo, ano, ano_realizado, anos) VALUES(?,?,?,?,?) "
                        "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET ano_realizado=excluded.ano_realizado, anos=excluded.anos",
                        (vid, campo, a, ultimo, ",".join(map(str, escolhidos))))
        feitos += 1
    arr.auditar(con, autor, vid, "atualizar_prazos_capital_giro", f"média de {', '.join(map(str, escolhidos))} para {len(anos)} ano(s)")
    return {"ano_realizado": ultimo, "anos_usados": escolhidos, "campos": feitos, "anos_alterados": len(anos)}


def _campo(campo: str) -> None:
    if campo not in CAMPOS:
        raise Invalido("Esse campo é calculado pelo sistema; só dá para digitar os prazos, os dias no ano e o % de caixa")


def salvar(con: sqlite3.Connection, vid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    _campo(campo)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("O valor não pode ser negativo")
    if campo == "pct_caixa" and valor > 100:
        raise Invalido("O percentual de caixa fica entre 0 e 100")
    if campo == "dias_ano" and 0 < valor < 1:
        raise Invalido("Informe os dias do ano (ex.: 360) ou deixe em branco")
    con.execute("INSERT INTO capital_giro(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, ano, valor))
    con.execute("DELETE FROM capital_giro_origem WHERE versao_id=? AND campo=? AND ano=?", (vid, campo, ano))      # digitado: já não é o calculado
    arr.auditar(con, autor, vid, "salvar_capital_giro", f"{CAMPOS[campo][0]} {ano}: {valor}")


def _destinos(v, ano_origem: int) -> List[int]:
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    return destinos


def _copiar(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, destinos: List[int]) -> None:
    r = con.execute("SELECT valor FROM capital_giro WHERE versao_id=? AND campo=? AND ano=?", (vid, campo, ano_origem)).fetchone()
    m = con.execute("SELECT ano_realizado, anos FROM capital_giro_origem WHERE versao_id=? AND campo=? AND ano=?", (vid, campo, ano_origem)).fetchone()
    for a in destinos:
        con.execute("DELETE FROM capital_giro_origem WHERE versao_id=? AND campo=? AND ano=?", (vid, campo, a))
        if m:
            con.execute("INSERT INTO capital_giro_origem(versao_id, campo, ano, ano_realizado, anos) VALUES(?,?,?,?,?)", (vid, campo, a, m["ano_realizado"], m["anos"]))
        con.execute("INSERT INTO capital_giro(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                    "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, a, r["valor"] if r else 0.0))


def replicar(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    _campo(campo)
    destinos = _destinos(v, ano_origem)
    _copiar(con, vid, campo, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_capital_giro", f"{CAMPOS[campo][0]}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todos(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    destinos = _destinos(v, ano_origem)
    for campo in CAMPOS:
        _copiar(con, vid, campo, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_todos_capital_giro", f"de {ano_origem}")
    return {"campos": len(CAMPOS), "anos_alterados": len(destinos)}


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    achatar = lambda d: {l["id"]: l for sec in d["premissas"] + d["resultado"] for l in sec["linhas"]}
    ia, ib = achatar(la), achatar(lb)
    linhas = []
    for id_, l in ia.items():
        q = ib.get(id_, l)
        linhas.append({"id": id_, "nome": l["nome"], "unidade": l["unidade"], "entrada": l["entrada"], "anos": {
            a: {"a": (l["valores"][a] or 0.0), "b": (q["valores"][a] or 0.0), "delta": (q["valores"][a] or 0.0) - (l["valores"][a] or 0.0),
                "pct": (((q["valores"][a] or 0.0) - l["valores"][a]) / abs(l["valores"][a]) * 100.0) if l["valores"][a] else None} for a in anos}})
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "linhas": linhas}
