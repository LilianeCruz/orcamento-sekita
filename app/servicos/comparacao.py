"""Comparação de orçamentos em um ano: premissas e demonstrativos lado a lado, só com o que varia, e o impacto de cada grupo de premissas.

O orçamento base (A) é a referência: cada outro orçamento mostra o valor e a diferença para o A.
O impacto é calculado de verdade: para cada grupo de premissas que difere (preços, custos, investimentos...), cria-se uma cópia temporária do A, troca-se só
aquele grupo pelo do outro orçamento, recalcula-se tudo e mede-se o que mudou nos resultados (receita, EBITDA, lucro, caixa, dívida, patrimônio).
O que não é explicado por um grupo sozinho aparece como "efeito combinado" (interação entre grupos). A cópia temporária é apagada ao final."""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido

TOL = 1e-9

# ---------------------------------------------------------------- o que se pode comparar
ITENS = [
    {"id": "prem_areas", "grupo": "Premissas", "nome": "Áreas por produto"}, {"id": "prem_produtividade", "grupo": "Premissas", "nome": "Produtividade"},
    {"id": "prem_precos", "grupo": "Premissas", "nome": "Preços"}, {"id": "prem_custos", "grupo": "Premissas", "nome": "Custos variáveis"},
    {"id": "prem_produtos", "grupo": "Premissas", "nome": "Premissas de produtos"}, {"id": "prem_rebanho", "grupo": "Premissas", "nome": "Movimentação do rebanho"},
    {"id": "prem_investimento", "grupo": "Premissas", "nome": "Premissas de investimento"}, {"id": "prem_dre", "grupo": "Premissas", "nome": "Premissas da DRE"}, {"id": "prem_transportadora", "grupo": "Premissas", "nome": "Premissas de transportadora"},
    {"id": "prem_balanco", "grupo": "Premissas", "nome": "Premissas de balanço"}, {"id": "prem_dividendos", "grupo": "Premissas", "nome": "Premissas de dividendos"},
    {"id": "prem_dividas", "grupo": "Premissas", "nome": "Premissas de dívidas"},
    {"id": "dre", "grupo": "Demonstrativos", "nome": "DRE"}, {"id": "balanco", "grupo": "Demonstrativos", "nome": "Balanço"},
    {"id": "fluxo", "grupo": "Demonstrativos", "nome": "Fluxo de caixa indireto", "completo": True}, {"id": "indicadores", "grupo": "Demonstrativos", "nome": "Indicadores"},
]

# grupos de premissas trocados um de cada vez no cálculo de impacto: nome e tabelas (todas têm versao_id)
GRUPOS = [
    ("Áreas por produto", ["areas_cultura", "culturas_da_versao"]),
    ("Produtividade e rebanho", ["produtividade", "culturas_extras", "pecuaria_leite", "rebanho_valores"]),
    ("Preços de venda", ["precos_venda"]),
    ("Custos variáveis", ["custos_cultura", "custos_grupos_cultura", "custos_culturas"]),
    ("Premissas de produtos", ["prem_valores", "prem_itens", "prem_culturas"]),
    ("Investimentos", ["investimento_valores", "investimento_excluidos", "depreciacao_valores"]),
    ("Premissas da DRE", ["dre_padrao", "premissas_dem_valores", "premissas_dem_itens"]),
    ("Transportadora", ["transportadora_valores"]),
    ("Premissas de balanço", ["capital_giro", "capital_giro_origem"]),
    ("Dividendos", ["patrimonio_valores"]),
    ("Dívidas e captações", ["novas_captacoes", "captacao_valores", "financiamento_premissas", "giro_auto_premissas"]),
]

KPIS = [("receita_liquida", "Receita líquida", "dre", ["DS018"]), ("ebitda", "EBITDA", "dre", ["DS044"]), ("lucro", "Lucro líquido", "dre", ["DS062"]),
        ("caixa", "Caixa e aplicações (31/12)", "bp", ["SA07"]), ("divida", "Dívida bancária total", "bp", ["SP08", "SPAUTO", "SP12", "SP17", "SP18"]),
        ("pl", "Patrimônio líquido", "bp", ["SP22"])]


def _v(serie: Optional[dict], ano: int) -> Optional[float]:
    if serie is None:
        return None
    return serie.get(ano, serie.get(str(ano)))


# ---------------------------------------------------------------- resultados (indicadores-chave)
def metricas(con: sqlite3.Connection, vid: int, ano: int) -> Dict[str, float]:
    """Resultados-chave do ano, em R$."""
    from . import balanco as svc_bp
    from . import dre as svc_dre
    from . import fluxo as svc_fluxo
    fl = svc_fluxo.projetar(con, vid)
    dre = {l["codigo"]: l["valores"] for l in svc_dre.ler(con, vid, fl["juros_auto"])["linhas"]}
    bp = {l["codigo"]: l["valores"] for l in svc_bp.ler(con, vid, fl)["linhas"]}
    out = {}
    for id_, _, fonte, codigos in KPIS:
        base = dre if fonte == "dre" else bp
        out[id_] = sum((_v(base.get(c), ano) or 0.0) for c in codigos)
    return out


# ---------------------------------------------------------------- tabelas lado a lado (premissas e demonstrativos)
def _nomes(con: sqlite3.Connection) -> Dict[int, dict]:
    return {r["id"]: dict(r) for r in con.execute("SELECT id, nome, unidade FROM culturas")}


def _linhas(con: sqlite3.Connection, item: str, vid: int, ano: int) -> List[dict]:
    """Linhas {chave, nome, valor, unidade, grupo, nivel} de um item para uma versão e um ano."""
    c = _nomes(con)
    out: List[dict] = []
    add = lambda nome, valor, un, grupo="", nivel=0: out.append({"nome": nome, "valor": valor, "unidade": un, "grupo": grupo, "nivel": nivel})
    q = lambda sql, *a: con.execute(sql, a).fetchall()
    if item == "prem_areas":
        for r in q("SELECT cultura_id, area_ha FROM areas_cultura WHERE versao_id=? AND ano=?", vid, ano):
            add(c[r["cultura_id"]]["nome"], r["area_ha"], "ha")
    elif item == "prem_produtividade":
        for r in q("SELECT cultura_id, valor FROM produtividade WHERE versao_id=? AND ano=?", vid, ano):
            add(c[r["cultura_id"]]["nome"], r["valor"], f"{c[r['cultura_id']]['unidade']}/ha")
        for r in q("SELECT animais, kg_animal_dia FROM pecuaria_leite WHERE versao_id=? AND ano=?", vid, ano):
            add("Leite · animais em lactação", r["animais"], "uni"); add("Leite · produção diária por animal", r["kg_animal_dia"], "kg/dia")
    elif item == "prem_precos":
        for r in q("SELECT cultura_id, preco FROM precos_venda WHERE versao_id=? AND ano=?", vid, ano):
            add(c[r["cultura_id"]]["nome"], r["preco"], f"R$/{c[r['cultura_id']]['unidade']}")
    elif item == "prem_custos":
        for r in q("SELECT cc.cultura_id, g.nome AS grupo, cc.valor FROM custos_cultura cc JOIN grupos_custo g ON g.id=cc.grupo_id WHERE cc.versao_id=? AND cc.ano=?", vid, ano):
            add(f"{c[r['cultura_id']]['nome']} · {r['grupo']}", r["valor"], "R$")
    elif item == "prem_produtos":
        rot = {"descarte": ("% descarte", "%"), "deducao_receita": ("% dedução de receita", "%"), "estoque": ("quantidade estocada", "qtd"), "sementes": ("sementes salvas", "qtd")}
        for r in q("SELECT cultura_id, tipo, valor FROM prem_valores WHERE versao_id=? AND ano=?", vid, ano):
            n, u = rot.get(r["tipo"], (r["tipo"], ""))
            add(f"{c[r['cultura_id']]['nome']} · {n}", r["valor"], u)
    elif item == "prem_rebanho":
        rot = {"saldo_ini": "saldo inicial", "valor_ini": "valor do saldo inicial", "compras": "compras", "nascimentos": "nascimentos", "mortes": "mortes", "vendas": "vendas"}
        for r in q("SELECT cultura_id, campo, valor FROM rebanho_valores WHERE versao_id=? AND ano=?", vid, ano):
            add(f"{c[r['cultura_id']]['nome']} · {rot.get(r['campo'], r['campo'])}", r["valor"], "R$" if r["campo"] == "valor_ini" else "cab")
    elif item == "prem_investimento":
        rot = {"novo": "novo orçamento", "a_carregar": "saldo a carregar", "saldo_ini": "saldo inicial", "financiado": "valor financiado"}
        for r in q("SELECT t.nome, v.campo, v.valor FROM investimento_valores v JOIN investimento_tipos t ON t.id=v.tipo_id WHERE v.versao_id=? AND v.ano=?", vid, ano):
            add(f"{r['nome']} · {rot.get(r['campo'], r['campo'])}", r["valor"], "R$ mil")
    elif item == "prem_dre":
        from .dre_padrao import LINHAS
        info = {cod: base for cod, base, _ in LINHAS}
        nomes = {r["codigo"]: r["nome"] for r in con.execute("SELECT codigo, nome FROM dre_linhas")}
        for r in q("SELECT codigo, valor FROM dre_padrao WHERE versao_id=? AND ano=?", vid, ano):
            add(nomes.get(r["codigo"], r["codigo"]), r["valor"], "%" if info.get(r["codigo"]) else "R$ mil")
        for r in q("SELECT p.nome, p.tipo, v.valor FROM premissas_dem_valores v JOIN premissas_dem p ON p.id=v.premissa_id WHERE v.versao_id=? AND v.ano=? AND p.demonstrativo='dre'", vid, ano):
            add(r["nome"], r["valor"], "%" if r["tipo"] == "percentual" else "R$ mil")
    elif item == "prem_transportadora":
        from .transportadora import CAMPOS as CAMPOS_TR
        for r in q("SELECT campo, valor FROM transportadora_valores WHERE versao_id=? AND ano=?", vid, ano):
            n, u, g = CAMPOS_TR.get(r["campo"], (r["campo"], "", ""))
            add(n, r["valor"], u, g)
    elif item == "prem_balanco":
        from .capital_giro import CAMPOS
        for r in q("SELECT campo, valor FROM capital_giro WHERE versao_id=? AND ano=?", vid, ano):
            n, u, _ = CAMPOS.get(r["campo"], (r["campo"], "", ""))
            add(n, r["valor"], "R$ mil" if u == "R$ mil" else u)
    elif item == "prem_dividendos":
        from .patrimonio import CAMPOS, SALDOS_ALTERAVEIS
        for r in q("SELECT campo, valor FROM patrimonio_valores WHERE versao_id=? AND ano=?", vid, ano):
            add(CAMPOS[r["campo"]][0] if r["campo"] in CAMPOS else SALDOS_ALTERAVEIS.get(r["campo"], r["campo"]), r["valor"], "%" if r["campo"] == "dist_pct" else "R$ mil")
    elif item == "prem_dividas":
        for r in q("SELECT nome, tipo, valor FROM novas_captacoes WHERE versao_id=? AND ano=?", vid, ano):
            add(f"Captação · {r['nome']}", r["valor"], "R$ mil")
        rot = {"taxa": "taxa de juros (% a.a.)", "prazo": "prazo (parcelas)", "carencia": "carência (anos)"}
        for r in q("SELECT campo, valor FROM financiamento_premissas WHERE versao_id=? AND ano=?", vid, ano):
            add(f"Financiamento dos investimentos · {rot.get(r['campo'], r['campo'])}", r["valor"], "")
        for r in q("SELECT campo, valor FROM giro_auto_premissas WHERE versao_id=? AND ano=? AND campo='taxa'", vid, ano):
            add("Necessidade de capital de giro · taxa de juros (% a.a.)", r["valor"], "")
    elif item in ("dre", "balanco", "fluxo", "indicadores"):
        out.extend(_demonstrativo(con, item, vid, ano))
    return out


def _demonstrativo(con: sqlite3.Connection, item: str, vid: int, ano: int) -> List[dict]:
    from . import balanco as svc_bp
    from . import demonstrativos as svc_demo
    from . import dre as svc_dre
    from . import fluxo as svc_fluxo
    out: List[dict] = []
    if item == "dre":
        for l in svc_dre.ler(con, vid)["linhas"]:
            out.append({"nome": l["nome"], "valor": _v(l["valores"], ano), "unidade": l["unidade"], "grupo": "", "nivel": l["nivel"]})
    elif item == "balanco":
        for l in svc_bp.ler(con, vid)["linhas"]:
            if l.get("calculo") != "diferenca":
                out.append({"nome": l["nome"], "valor": _v(l["valores"], ano), "unidade": "R$ mil", "grupo": "", "nivel": l["nivel"]})
    elif item == "fluxo":
        p = svc_fluxo.projetar(con, vid)
        for sc in svc_demo.ler_fluxo(con, vid, p).get("indireto", []):
            for l in sc["linhas"]:
                out.append({"nome": l["nome"], "valor": _v(l["valores"], ano), "unidade": "R$ mil", "grupo": sc["titulo"], "nivel": 0})
    else:
        for i in svc_demo.indicadores(con, vid).get("indicadores", []):
            v = _v(i["valores"], ano)
            out.append({"nome": i["nome"], "valor": v * 100.0 if (v is not None and i.get("percentual")) else v, "unidade": "%" if i.get("percentual") else "", "grupo": "", "nivel": 0, "casas": i.get("casas", 2)})
    return out


def _secao(con: sqlite3.Connection, item: dict, vids: List[int], ano: int) -> dict:
    cols = [{r["nome"]: r for r in _linhas(con, item["id"], v, ano)} for v in vids]   # nomes únicos por versão (a última linha de mesmo nome prevalece)
    ordem: List[str] = []
    for col in cols:
        for n in col:
            if n not in ordem:
                ordem.append(n)
    linhas = []
    for n in ordem:
        ref = next(col[n] for col in cols if n in col)
        valores = [(col[n]["valor"] if n in col else None) for col in cols]
        nums = [x if x is not None else 0.0 for x in valores]
        if not item.get("completo") and all(abs(x - nums[0]) <= TOL for x in nums[1:]):
            continue                                                         # só o que varia (o fluxo de caixa indireto sai inteiro, com todos os totais)
        linhas.append({"nome": n, "unidade": ref["unidade"], "grupo": ref.get("grupo", ""), "nivel": ref.get("nivel", 0), "valores": valores})
    return {"id": item["id"], "titulo": item["nome"], "tipo": item["grupo"], "linhas": linhas, "completo": bool(item.get("completo"))}


# ---------------------------------------------------------------- impacto por grupo de premissas
def _colunas(con: sqlite3.Connection, tabela: str) -> List[str]:
    return [r["name"] for r in con.execute(f"PRAGMA table_info({tabela})") if r["name"] not in ("versao_id", "id")]


def _conteudo(con: sqlite3.Connection, tabelas: List[str], vid: int) -> list:
    res = []
    for t in tabelas:
        cols = ", ".join(_colunas(con, t))
        res.append(sorted(tuple(r) for r in con.execute(f"SELECT {cols} FROM {t} WHERE versao_id=?", (vid,))))
    return res


def _trocar(con: sqlite3.Connection, tabelas: List[str], destino: int, origem: int) -> None:
    for t in tabelas:
        cols = ", ".join(_colunas(con, t))
        con.execute(f"DELETE FROM {t} WHERE versao_id=?", (destino,))
        con.execute(f"INSERT INTO {t}(versao_id, {cols}) SELECT ?, {cols} FROM {t} WHERE versao_id=?", (destino, origem))


def _apagar_versao(con: sqlite3.Connection, vid: int) -> None:
    con.execute("DELETE FROM fazenda_anos WHERE fazenda_id IN (SELECT id FROM fazendas WHERE versao_id=?)", (vid,))
    con.execute("DELETE FROM parcelas WHERE fazenda_id IN (SELECT id FROM fazendas WHERE versao_id=?)", (vid,))
    for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        if r["name"] != "versoes" and any(c["name"] == "versao_id" for c in con.execute(f"PRAGMA table_info({r['name']})")):
            con.execute(f"DELETE FROM {r['name']} WHERE versao_id=?", (vid,))
    con.execute("DELETE FROM versoes WHERE id=?", (vid,))


def impactos(con: sqlite3.Connection, base: int, outro: int, ano: int, autor: str) -> dict:
    kpi_base, kpi_outro = metricas(con, base, ano), metricas(con, outro, ano)
    mudaram = [(n, t) for n, t in GRUPOS if _conteudo(con, t, base) != _conteudo(con, t, outro)]
    b, o = arr.obter_versao(con, base), arr.obter_versao(con, outro)
    divida_diferente = b["divida_importacao_id"] != o["divida_importacao_id"]
    fatores: List[dict] = []
    soma = {k: 0.0 for k, *_ in KPIS}
    candidatos = list(mudaram) + ([("Base de dívidas vigentes", [])] if divida_diferente else [])
    for nome, tabelas in candidatos:
        tmp = arr.copiar_versao(con, base, "revisao", "_temporario", autor)
        try:
            _trocar(con, tabelas, tmp, outro)
            if not tabelas:
                con.execute("UPDATE versoes SET divida_importacao_id=? WHERE id=?", (o["divida_importacao_id"], tmp))
            m = metricas(con, tmp, ano)
        finally:
            _apagar_versao(con, tmp)
        efeitos = {k: m[k] - kpi_base[k] for k in kpi_base}
        for k in soma:
            soma[k] += efeitos[k]
        fatores.append({"grupo": nome, "efeitos": efeitos})
    total = {k: kpi_outro[k] - kpi_base[k] for k in kpi_base}
    return {"kpis": [{"id": k, "nome": n, "base": kpi_base[k], "valor": kpi_outro[k], "delta": total[k]} for k, n, *_ in KPIS],
            "fatores": fatores, "combinado": {k: total[k] - soma[k] for k in soma}}


def comparar(con: sqlite3.Connection, base: int, outros: List[int], ano: int, itens: List[str], com_impacto: bool, autor: str) -> dict:
    if not outros:
        raise Invalido("Escolha ao menos um orçamento para comparar com o base")
    if base in outros:
        raise Invalido("O orçamento base não pode ser comparado com ele mesmo")
    vs = [dict(arr.obter_versao(con, v)) for v in [base] + list(outros)]
    for v in vs:
        if ano not in arr.anos_da_versao(v):
            raise Invalido(f"O orçamento '{v['nome']}' não tem o ano {ano}")
    validos = {i["id"]: i for i in ITENS}
    secoes = [_secao(con, validos[i], [v["id"] for v in vs], ano) for i in itens if i in validos]
    res = {"ano": ano, "orcamentos": [{"id": v["id"], "nome": v["nome"], "tipo": v["tipo"], "origem_id": v["origem_id"]} for v in vs], "secoes": secoes,
           "impactos": [], "kpis_nomes": [{"id": k, "nome": n} for k, n, *_ in KPIS]}
    if com_impacto:
        for v in vs[1:]:
            res["impactos"].append({"orcamento_id": v["id"], "nome": v["nome"], **impactos(con, base, v["id"], ano, autor)})
    return res


# ---------------------------------------------------------------- impressão de um orçamento (todos os anos)
def _demonstrativo_anos(con: sqlite3.Connection, item: str, vid: int, anos: List[int]) -> List[dict]:
    from . import balanco as svc_bp
    from . import demonstrativos as svc_demo
    from . import dre as svc_dre
    from . import fluxo as svc_fluxo
    por_anos = lambda serie: {a: _v(serie, a) for a in anos}
    out: List[dict] = []
    if item == "dre":
        for l in svc_dre.ler(con, vid)["linhas"]:
            out.append({"nome": l["nome"], "valores": por_anos(l["valores"]), "unidade": l["unidade"], "grupo": "", "nivel": l["nivel"]})
    elif item == "balanco":
        for l in svc_bp.ler(con, vid)["linhas"]:
            if l.get("calculo") != "diferenca":
                out.append({"nome": l["nome"], "valores": por_anos(l["valores"]), "unidade": "R$ mil", "grupo": "", "nivel": l["nivel"]})
    elif item == "fluxo":
        p = svc_fluxo.projetar(con, vid)
        for sc in svc_demo.ler_fluxo(con, vid, p).get("indireto", []):
            for l in sc["linhas"]:
                out.append({"nome": l["nome"], "valores": por_anos(l["valores"]), "unidade": "R$ mil", "grupo": sc["titulo"], "nivel": 0, "total": l.get("estilo") == "total"})
    else:
        for i in svc_demo.indicadores(con, vid).get("indicadores", []):
            esc = 100.0 if i.get("percentual") else 1.0                                        # percentuais guardados em decimal (0,3 = 30%)
            out.append({"nome": i["nome"], "valores": {a: (v * esc if v is not None else None) for a, v in por_anos(i["valores"]).items()}, "unidade": "%" if i.get("percentual") else "", "grupo": "", "nivel": 0, "casas": i.get("casas", 2)})
    return out


def imprimir(con: sqlite3.Connection, vid: int, itens: List[str]) -> dict:
    """Premissas e demonstrativos de um orçamento, ano a ano, para o relatório em PDF."""
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    validos = {i["id"]: i for i in ITENS}
    escolhidos = [validos[i] for i in itens if i in validos]
    if not escolhidos:
        raise Invalido("Escolha ao menos um item para imprimir")
    secoes = []
    for it in escolhidos:
        if it["id"] in ("dre", "balanco", "fluxo", "indicadores"):
            linhas = _demonstrativo_anos(con, it["id"], vid, anos)
        else:
            por_ano = {a: {r["nome"]: r for r in _linhas(con, it["id"], vid, a)} for a in anos}
            ordem: List[str] = []
            for a in anos:
                for n in por_ano[a]:
                    if n not in ordem:
                        ordem.append(n)
            linhas = []
            for n in ordem:
                ref = next(por_ano[a][n] for a in anos if n in por_ano[a])
                linhas.append({"nome": n, "unidade": ref["unidade"], "grupo": ref.get("grupo", ""), "nivel": ref.get("nivel", 0), "valores": {a: por_ano[a][n]["valor"] if n in por_ano[a] else None for a in anos}})
        secoes.append({"id": it["id"], "titulo": it["nome"], "tipo": it["grupo"], "linhas": linhas})
    return {"orcamento": {"id": v["id"], "nome": v["nome"], "tipo": v["tipo"], "status": v["status"], "ano_base": v["ano_base"], "horizonte": v["horizonte"]}, "anos": anos, "secoes": secoes}
