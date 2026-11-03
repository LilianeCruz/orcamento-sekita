"""Produtividade pecuária (leite), por versão e ano. Segue os campos da planilha de orçamento (aba Produtividade, bloco Leite):

  Total de animais em lactação   [uni]              entrada
  Total diária                   [kg/dia por animal] entrada (produtividade diária de cada animal)
  Total produção diária          [kg/dia]           = animais × kg por animal por dia
  Total produção anual           [kg/ano]           = produção diária × 365
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List

from . import arrendamentos as arr
from .arrendamentos import Invalido

DIAS_NO_ANO = 365
# campos digitados -> coluna da tabela, rótulo e unidade (como na planilha)
CAMPOS = {
    "animais": ("animais", "Total de animais em lactação", "uni"),
    "kg_animal_dia": ("kg_animal_dia", "Total diária (por animal)", "kg/dia"),
}


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    reg = {r["ano"]: r for r in con.execute("SELECT * FROM pecuaria_leite WHERE versao_id=?", (vid,))}
    animais = {a: reg[a]["animais"] if a in reg else 0.0 for a in anos}
    kg = {a: reg[a]["kg_animal_dia"] if a in reg else 0.0 for a in anos}
    dia = {a: animais[a] * kg[a] for a in anos}
    ano = {a: dia[a] * DIAS_NO_ANO for a in anos}
    linhas = [
        {"id": "animais", "nome": CAMPOS["animais"][1], "unidade": "uni", "entrada": True, "valores": animais},
        {"id": "kg_animal_dia", "nome": CAMPOS["kg_animal_dia"][1], "unidade": "kg/dia", "entrada": True, "valores": kg},
        {"id": "producao_dia", "nome": "Total produção diária", "unidade": "kg/dia", "entrada": False, "valores": dia},
        {"id": "producao_ano", "nome": "Total produção anual", "unidade": "kg/ano", "entrada": False, "valores": ano},
    ]
    return {"versao": v, "anos": anos, "atividade": "Leite", "dias_no_ano": DIAS_NO_ANO, "linhas": linhas}


def _campo(campo: str) -> str:
    if campo not in CAMPOS:
        raise Invalido("Esse campo é calculado pelo sistema; só dá para lançar os animais em lactação e a produtividade diária por animal")
    return CAMPOS[campo][0]


def _gravar(con: sqlite3.Connection, vid: int, coluna: str, ano: int, valor: float) -> None:
    con.execute(f"INSERT INTO pecuaria_leite(versao_id, ano, {coluna}) VALUES(?,?,?) "
                f"ON CONFLICT(versao_id, ano) DO UPDATE SET {coluna}=excluded.{coluna}", (vid, ano, valor))


def salvar(con: sqlite3.Connection, vid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    coluna = _campo(campo)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("O valor não pode ser negativo")
    _gravar(con, vid, coluna, ano, valor)
    arr.auditar(con, autor, vid, "salvar_pecuaria", f"{CAMPOS[campo][1]} {ano}: {valor}")


def _copiar(con: sqlite3.Connection, vid: int, coluna: str, ano_origem: int, destinos: List[int]) -> None:
    r = con.execute(f"SELECT {coluna} v FROM pecuaria_leite WHERE versao_id=? AND ano=?", (vid, ano_origem)).fetchone()
    for a in destinos:
        _gravar(con, vid, coluna, a, r["v"] if r else 0.0)


def _destinos(v, ano_origem: int) -> List[int]:
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    return destinos


def replicar(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    coluna = _campo(campo)
    destinos = _destinos(v, ano_origem)
    _copiar(con, vid, coluna, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_pecuaria", f"{CAMPOS[campo][1]}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todos(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    destinos = _destinos(v, ano_origem)
    for campo in CAMPOS:
        _copiar(con, vid, CAMPOS[campo][0], ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_todos_pecuaria", f"de {ano_origem}")
    return {"campos": len(CAMPOS), "anos_alterados": len(destinos)}


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    ib = {l["id"]: l for l in lb["linhas"]}
    linhas = [{"id": l["id"], "nome": l["nome"], "unidade": l["unidade"], "entrada": l["entrada"],
               "anos": {a: {"a": l["valores"][a], "b": ib[l["id"]]["valores"][a], "delta": ib[l["id"]]["valores"][a] - l["valores"][a],
                            "pct": ((ib[l["id"]]["valores"][a] - l["valores"][a]) / l["valores"][a] * 100.0) if l["valores"][a] else None} for a in anos}}
              for l in la["linhas"]]
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "atividade": "Leite", "linhas": linhas}
