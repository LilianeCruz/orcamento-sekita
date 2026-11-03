"""Cadastro de grupos de custos: cada grupo é classificado como custo direto ou indireto."""
from __future__ import annotations

import datetime as dt
import sqlite3
from typing import List

from .arrendamentos import Invalido, NaoEncontrado, auditar

CLASSIFICACOES = {"direto": "Custo direto", "indireto": "Custo indireto"}


def _validar(con: sqlite3.Connection, d: dict, gid: int = 0) -> dict:
    nome = " ".join(str(d.get("nome", "")).split())
    if not nome:
        raise Invalido("Informe o nome do grupo")
    if d.get("classificacao") not in CLASSIFICACOES:
        raise Invalido("Classifique o grupo como custo direto ou indireto")
    if con.execute("SELECT 1 FROM grupos_custo WHERE nome=? AND id<>?", (nome, gid)).fetchone():
        raise Invalido(f"Já existe um grupo chamado '{nome}'")
    return {"nome": nome, "classificacao": d["classificacao"], "ativa": 1 if d.get("ativa", True) else 0}


def listar(con: sqlite3.Connection) -> List[dict]:
    out = []
    for r in con.execute("SELECT * FROM grupos_custo ORDER BY ativa DESC, classificacao, nome COLLATE NOCASE"):
        d = dict(r)
        d["ativa"] = bool(d["ativa"])
        out.append(d)
    return out


def criar(con: sqlite3.Connection, d: dict, autor: str) -> int:
    v = _validar(con, d)
    cur = con.execute(
        "INSERT INTO grupos_custo(nome, classificacao, ativa, criado_em) VALUES(?,?,?,?)",
        (v["nome"], v["classificacao"], v["ativa"], dt.datetime.now().isoformat(timespec="seconds")),
    )
    auditar(con, autor, None, "criar_grupo_custo", f"{v['nome']} ({v['classificacao']})")
    return cur.lastrowid


def atualizar(con: sqlite3.Connection, gid: int, d: dict, autor: str) -> None:
    if not con.execute("SELECT 1 FROM grupos_custo WHERE id=?", (gid,)).fetchone():
        raise NaoEncontrado(f"Grupo {gid} não existe")
    v = _validar(con, d, gid)
    con.execute("UPDATE grupos_custo SET nome=?, classificacao=?, ativa=? WHERE id=?",
                (v["nome"], v["classificacao"], v["ativa"], gid))
    auditar(con, autor, None, "atualizar_grupo_custo", f"{v['nome']} ({v['classificacao']})")


def excluir(con: sqlite3.Connection, gid: int, autor: str) -> None:
    g = con.execute("SELECT nome FROM grupos_custo WHERE id=?", (gid,)).fetchone()
    if not g:
        raise NaoEncontrado(f"Grupo {gid} não existe")
    if con.execute("SELECT 1 FROM custos_grupos_cultura WHERE grupo_id=? LIMIT 1", (gid,)).fetchone():
        raise Invalido(f"'{g['nome']}' é usado em Custos variáveis. Desmarque 'ativo' em vez de excluir.")
    con.execute("DELETE FROM grupos_custo WHERE id=?", (gid,))
    auditar(con, autor, None, "excluir_grupo_custo", g["nome"])
