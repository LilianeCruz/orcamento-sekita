"""Tela de Preços: preço de venda por produto e ano, em R$ por kg (ou por litro, no leite).
É independente do 'valor padrão' usado em Arrendamentos (tabela 'precos'). Os produtos vêm de 'Áreas por produto', da Produtividade pecuária e do Leite."""
from __future__ import annotations

import sqlite3
from typing import Dict, List

from . import arrendamentos as arr
from . import extras
from .arrendamentos import Invalido, NaoEncontrado


def _na_lista(con: sqlite3.Connection, vid: int, cid: int) -> sqlite3.Row:
    return extras.na_lista(con, vid, "precos", cid)


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    precos: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT cultura_id, ano, preco FROM precos_venda WHERE versao_id=?", (vid,)):
        precos.setdefault(r["cultura_id"], {})[r["ano"]] = r["preco"]
    culturas: List[dict] = []
    ids = extras.ids_da_lista(con, vid, "precos")
    removiveis = extras.sem_area(con, vid, "precos")
    for c in con.execute(
        f"SELECT * FROM culturas WHERE id IN ({','.join('?' * len(ids)) or 'NULL'}) ORDER BY grupo, nome COLLATE NOCASE", ids
    ):
        culturas.append({
            "id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "ativa": bool(c["ativa"]),
            "unidade": c["unidade"], "removivel": c["id"] in removiveis,      # kg, litro ou uni
            "anos": {a: precos.get(c["id"], {}).get(a) for a in anos},
        })
    return {"versao": v, "anos": anos, "culturas": culturas, "disponiveis": extras.disponiveis(con, vid, "precos")}


def salvar(con: sqlite3.Connection, vid: int, cid: int, ano: int, preco: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    c = _na_lista(con, vid, cid)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if preco < 0:
        raise Invalido("O preço não pode ser negativo")
    con.execute(
        "INSERT INTO precos_venda(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?) "
        "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET preco=excluded.preco",
        (vid, cid, ano, preco),
    )
    arr.auditar(con, autor, vid, "salvar_preco_venda", f"{c['nome']} {ano}: {preco}")


def _copiar(con: sqlite3.Connection, vid: int, cid: int, ano_origem: int, destinos: List[int]) -> bool:
    o = con.execute("SELECT preco FROM precos_venda WHERE versao_id=? AND cultura_id=? AND ano=?",
                    (vid, cid, ano_origem)).fetchone()
    if not o:
        return False
    for a in destinos:
        con.execute(
            "INSERT INTO precos_venda(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?) "
            "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET preco=excluded.preco",
            (vid, cid, a, o["preco"]),
        )
    return True


def replicar(con: sqlite3.Connection, vid: int, cid: int, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    c = _na_lista(con, vid, cid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    if not _copiar(con, vid, cid, ano_origem, destinos):
        raise Invalido(f"Não há preço de {c['nome']} em {ano_origem} para replicar")
    arr.auditar(con, autor, vid, "replicar_preco_venda", f"{c['nome']}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todas(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    """Copia o preço do ano de origem para os anos seguintes, em todos os produtos da lista que tenham preço nesse ano."""
    v = arr.versao_editavel(con, vid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    ids = extras.ids_da_lista(con, vid, "precos")
    if not ids:
        raise Invalido("Nenhum produto em Áreas por produto para replicar")
    feitas = sum(1 for cid in ids if _copiar(con, vid, cid, ano_origem, destinos))
    if not feitas:
        raise Invalido(f"Nenhum produto tem preço em {ano_origem} para replicar")
    arr.auditar(con, autor, vid, "replicar_todos_precos_venda", f"{feitas} cultura(s) de {ano_origem}")
    return {"culturas": feitas, "anos_alterados": len(destinos)}


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")

    def delta(x, y) -> dict:
        x, y = x or 0.0, y or 0.0
        return {"a": x, "b": y, "delta": y - x, "pct": ((y - x) / x * 100.0) if x else None}

    ia = {c["id"]: c for c in la["culturas"]}
    ib = {c["id"]: c for c in lb["culturas"]}
    info = {c["id"]: c for c in la["culturas"] + lb["culturas"]}
    culturas = {
        info[i]["nome"]: {
            "unidade": info[i]["unidade"],
            "anos": {an: delta(ia.get(i, {"anos": {}})["anos"].get(an), ib.get(i, {"anos": {}})["anos"].get(an)) for an in anos},
        }
        for i in sorted(info, key=lambda k: info[k]["nome"].lower())
    }
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "culturas": culturas}
