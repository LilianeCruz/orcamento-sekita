"""Premissas de transportadora (Sekita Transportes): receita e custo direto no estilo da aba "Sekita Transp - Cen Base" da planilha.
Não há demonstrativo separado: o resultado alimenta as linhas de transportes da DRE (receita, deduções e custo) e o restante
(depreciação, compra e venda de caminhões, dívidas) fica nas premissas de investimento, captações e média da DRE.

  Km rodado total  = caminhões × km por caminhão
  Receita bruta    = km rodado total × preço por km                      (DRE: Receitas da Atividade de Transportes)
  Deduções         = receita bruta × % de deduções                       (DRE: Deduções da Atividade de Transportes)
  Custo direto     = km rodado total × soma das rubricas variáveis, fixas e despesas em R$/km        (DRE: Custo do Produto Vendido · Transportes)
Valores guardados em R$ e R$/km; o resultado sai em R$, com o sinal da DRE (custos e deduções negativos).
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List

from . import arrendamentos as arr
from .arrendamentos import Invalido

MIL = 1000.0
LINHA_RECEITA, LINHA_DEDUCOES, LINHA_CUSTO = "DS014", "DS017", "DS026"

# (grupo, [(campo, rótulo, unidade)])
GRUPOS = [
    ("Operação", [("caminhoes", "Quantidade de caminhões", "uni"), ("km_caminhao", "Km rodado por caminhão", "km/caminhão"),
                  ("preco_km", "Preço por km rodado", "R$/km"), ("deducoes_pct", "Deduções da receita", "% da receita")]),
    ("Custos variáveis", [("combustivel", "Combustível", "R$/km"), ("mdo", "Mão de obra (MDO)", "R$/km"),
                          ("manutencao", "Manutenção, conservação e reparos de veículos", "R$/km"), ("outros_var", "Outros custos", "R$/km")]),
    ("Custos fixos", [("salario_fixo", "Salário fixo + encargos", "R$/km"), ("ipva", "IPVA", "R$/km"),
                      ("rastreamento", "Rastreamento de veículos", "R$/km"), ("seguro", "Seguro de veículos", "R$/km")]),
    ("Despesas", [("desp_indireto", "Despesa / custo indireto", "R$/km"), ("moi", "M.O.I", "R$/km")]),
]
CAMPOS = {c: (nome, un, g) for g, linhas in GRUPOS for c, nome, un in linhas}
VARIAVEIS = [c for c, _, _ in GRUPOS[1][1]]
FIXOS = [c for c, _, _ in GRUPOS[2][1]]
DESPESAS = [c for c, _, _ in GRUPOS[3][1]]


def _valores(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {}
    for r in con.execute("SELECT campo, ano, valor FROM transportadora_valores WHERE versao_id=?", (vid,)):
        d.setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def calcular(val: Dict[str, Dict[int, float]], anos: List[int]) -> Dict[str, Dict[int, float]]:
    g = lambda c, a: val.get(c, {}).get(a, 0.0)
    out: Dict[str, Dict[int, float]] = {k: {} for k in ("km_total", "receita_bruta", "deducoes", "receita_liquida", "custo_variavel", "custo_fixo", "custo_total", "despesas", "resultado_bruto", "margem")}
    for a in anos:
        km = g("caminhoes", a) * g("km_caminhao", a)
        rec = km * g("preco_km", a) / MIL
        ded = -rec * g("deducoes_pct", a) / 100.0
        var = -km * sum(g(c, a) for c in VARIAVEIS) / MIL
        fix = -km * sum(g(c, a) for c in FIXOS) / MIL
        desp = -km * sum(g(c, a) for c in DESPESAS) / MIL
        liq = rec + ded
        bruto = liq + var + fix + desp
        for k, v in (("km_total", km), ("receita_bruta", rec), ("deducoes", ded), ("receita_liquida", liq), ("custo_variavel", var), ("custo_fixo", fix),
                     ("custo_total", var + fix + desp), ("despesas", desp), ("resultado_bruto", bruto), ("margem", bruto / liq * 100.0 if liq else 0.0)):
            out[k][a] = v
    return out


def series(con: sqlite3.Connection, vid: int, anos: List[int]) -> Dict[str, Dict[int, float]]:
    """O que a DRE recebe, por linha: receita (+), deduções (−) e custo direto (−), em R$."""
    r = calcular(_valores(con, vid), anos)
    return {LINHA_RECEITA: r["receita_bruta"], LINHA_DEDUCOES: r["deducoes"], LINHA_CUSTO: r["custo_total"]}


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    val = _valores(con, vid)
    return {"versao": v, "anos": anos,
            "grupos": [{"titulo": g, "linhas": [{"campo": c, "nome": n, "unidade": u, "valores": {a: val.get(c, {}).get(a) for a in anos}} for c, n, u in linhas]} for g, linhas in GRUPOS],
            "resultado": calcular(val, anos)}


def _campo(campo: str) -> None:
    if campo not in CAMPOS:
        raise Invalido("Campo desconhecido nas premissas de transportadora")


def salvar(con: sqlite3.Connection, vid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    _campo(campo)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("O valor não pode ser negativo")
    if campo == "deducoes_pct" and valor > 100:
        raise Invalido("As deduções ficam entre 0 e 100% da receita")
    con.execute("INSERT INTO transportadora_valores(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, ano, valor))
    arr.auditar(con, autor, vid, "salvar_transportadora", f"{CAMPOS[campo][0]} {ano}: {valor}")


def _replicar(con: sqlite3.Connection, vid: int, campos: List[str], ano_origem: int) -> int:
    v = arr.obter_versao(con, vid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    for c in campos:
        r = con.execute("SELECT valor FROM transportadora_valores WHERE versao_id=? AND campo=? AND ano=?", (vid, c, ano_origem)).fetchone()
        for a in destinos:
            con.execute("INSERT INTO transportadora_valores(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                        "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, c, a, r["valor"] if r else 0.0))
    return len(destinos)


def replicar(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, autor: str) -> int:
    arr.versao_editavel(con, vid)
    _campo(campo)
    n = _replicar(con, vid, [campo], ano_origem)
    arr.auditar(con, autor, vid, "replicar_transportadora", f"{CAMPOS[campo][0]} de {ano_origem}")
    return n


def replicar_todos(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    arr.versao_editavel(con, vid)
    n = _replicar(con, vid, list(CAMPOS), ano_origem)
    arr.auditar(con, autor, vid, "replicar_transportadora", f"todos os campos de {ano_origem}")
    return {"campos": len(CAMPOS), "anos_alterados": n}
