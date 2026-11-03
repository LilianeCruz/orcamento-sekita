"""Produtividade por produto e ano. Os produtos vêm de 'Áreas por produto' (a lista da versão)."""
from __future__ import annotations

import sqlite3
from typing import Dict, List

from . import arrendamentos as arr
from . import extras
from .arrendamentos import Invalido, NaoEncontrado


def _na_lista(con: sqlite3.Connection, vid: int, cid: int) -> sqlite3.Row:
    return extras.na_lista(con, vid, "produtividade", cid)


def ler(con: sqlite3.Connection, vid: int) -> dict:
    """Uma linha por produto da lista de Áreas por produto; produtividade por hectare em kg (ou litro, p/ leite)."""
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    prod: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT cultura_id, ano, valor FROM produtividade WHERE versao_id=?", (vid,)):
        prod.setdefault(r["cultura_id"], {})[r["ano"]] = r["valor"]
    culturas: List[dict] = []
    ids = extras.ids_da_lista(con, vid, "produtividade")
    removiveis = extras.sem_area(con, vid, "produtividade")
    for c in con.execute(
        f"SELECT * FROM culturas WHERE id IN ({','.join('?' * len(ids)) or 'NULL'}) ORDER BY grupo, nome COLLATE NOCASE", ids
    ):
        culturas.append({
            "id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "ativa": bool(c["ativa"]),
            "unidade": c["unidade"], "removivel": c["id"] in removiveis,
            "anos": {a: prod.get(c["id"], {}).get(a, 0.0) for a in anos},
        })
    return {"versao": v, "anos": anos, "culturas": culturas, "disponiveis": extras.disponiveis(con, vid, "produtividade")}


def salvar(con: sqlite3.Connection, vid: int, cid: int, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    c = _na_lista(con, vid, cid)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("A produtividade não pode ser negativa")
    con.execute(
        "INSERT INTO produtividade(versao_id, cultura_id, ano, valor) VALUES(?,?,?,?) "
        "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET valor=excluded.valor",
        (vid, cid, ano, valor),
    )
    arr.auditar(con, autor, vid, "salvar_produtividade", f"{c['nome']} {ano}: {valor}")


def _copiar_para_frente(con: sqlite3.Connection, vid: int, cid: int, ano_origem: int, destinos: List[int]) -> None:
    o = con.execute("SELECT valor FROM produtividade WHERE versao_id=? AND cultura_id=? AND ano=?",
                    (vid, cid, ano_origem)).fetchone()
    valor = o["valor"] if o else 0.0
    for a in destinos:
        con.execute(
            "INSERT INTO produtividade(versao_id, cultura_id, ano, valor) VALUES(?,?,?,?) "
            "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET valor=excluded.valor",
            (vid, cid, a, valor),
        )


def replicar(con: sqlite3.Connection, vid: int, cid: int, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    c = _na_lista(con, vid, cid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    _copiar_para_frente(con, vid, cid, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_produtividade", f"{c['nome']}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todas(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    ids = extras.ids_da_lista(con, vid, "produtividade")
    if not ids:
        raise Invalido("Nenhum produto na lista de produtividade para replicar")
    for cid in ids:
        _copiar_para_frente(con, vid, cid, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_todas_produtividades", f"{len(ids)} cultura(s) de {ano_origem}")
    return {"culturas": len(ids), "anos_alterados": len(destinos)}


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")

    def delta(x: float, y: float) -> dict:
        return {"a": x, "b": y, "delta": y - x, "pct": ((y - x) / x * 100.0) if x else None}

    ia = {c["id"]: c for c in la["culturas"]}
    ib = {c["id"]: c for c in lb["culturas"]}
    info = {c["id"]: c for c in la["culturas"] + lb["culturas"]}
    culturas = {
        info[i]["nome"]: {
            "unidade": info[i]["unidade"], "grupo": info[i]["grupo"],
            "anos": {an: delta(ia.get(i, {"anos": {}})["anos"].get(an, 0.0), ib.get(i, {"anos": {}})["anos"].get(an, 0.0))
                     for an in anos},
        }
        for i in sorted(info, key=lambda k: info[k]["nome"].lower())
    }
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "culturas": culturas}
