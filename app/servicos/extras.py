"""Lista de produtos das telas Produtividade e Preços = produtos de 'Áreas por produto' + produtos adicionados à mão (sem área),
como os produtos da pecuária, que não têm hectares."""
from __future__ import annotations

import sqlite3
from typing import List

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado

TELAS = {"produtividade": ("produtividade", "Produtividade"), "precos": ("precos_venda", "Preços")}


def _tabela_valores(tela: str) -> str:
    if tela not in TELAS:
        raise Invalido("Tela inválida")
    return TELAS[tela][0]


def _leite_id(con: sqlite3.Connection, vid: int):
    """O produto 'Leite' do cadastro, quando já há produtividade de leite lançada nesta versão."""
    if not con.execute("SELECT 1 FROM pecuaria_leite WHERE versao_id=? AND (animais>0 OR kg_animal_dia>0)", (vid,)).fetchone():
        return None
    r = con.execute("SELECT id FROM culturas WHERE ativa=1 AND LOWER(nome) LIKE 'leite%' ORDER BY id LIMIT 1").fetchone()
    return r["id"] if r else None


def ids_da_lista(con: sqlite3.Connection, vid: int, tela: str) -> List[int]:
    _tabela_valores(tela)
    ids = [r["cultura_id"] for r in con.execute(
        "SELECT cultura_id FROM culturas_da_versao WHERE versao_id=? UNION SELECT cultura_id FROM culturas_extras WHERE versao_id=? AND tela=?",
        (vid, vid, tela))]
    if tela == "precos":          # tudo o que tem produtividade (inclusive pecuária e leite) também precisa de preço
        mais = [r["cultura_id"] for r in con.execute("SELECT cultura_id FROM culturas_extras WHERE versao_id=? AND tela='produtividade'", (vid,))]
        mais.append(_leite_id(con, vid))
        ids += [i for i in dict.fromkeys(mais) if i is not None and i not in ids]
    return ids


def ids_com_produtividade(con: sqlite3.Connection, vid: int) -> List[int]:
    """Produtos que têm produtividade nesta versão: os de Áreas por produto, os da produtividade pecuária e o Leite (quando lançado).
    É a lista de Custos variáveis."""
    ids = ids_da_lista(con, vid, "produtividade")
    leite = _leite_id(con, vid)
    return ids + ([leite] if leite is not None and leite not in ids else [])


def na_lista(con: sqlite3.Connection, vid: int, tela: str, cid: int) -> sqlite3.Row:
    c = con.execute("SELECT * FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado(f"Produto {cid} não existe")
    if cid not in ids_da_lista(con, vid, tela):
        raise Invalido(f"{c['nome']} não está na lista de {TELAS[tela][1]} desta versão; adicione-o com o botão + (ou em Áreas por produto)")
    return c


def disponiveis(con: sqlite3.Connection, vid: int, tela: str) -> List[dict]:
    """Produtos ativas do cadastro que ainda não estão na lista (para o botão +)."""
    na = set(ids_da_lista(con, vid, tela))
    return [{"id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "unidade": c["unidade"]}
            for c in con.execute("SELECT * FROM culturas WHERE ativa=1 ORDER BY grupo, nome COLLATE NOCASE") if c["id"] not in na]


def sem_area(con: sqlite3.Connection, vid: int, tela: str) -> set:
    """Produtos da lista que NÃO estão em Áreas por produto (os que podem ser removidos aqui)."""
    areas = {r["cultura_id"] for r in con.execute("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", (vid,))}
    return {r["cultura_id"] for r in con.execute("SELECT cultura_id FROM culturas_extras WHERE versao_id=? AND tela=?", (vid, tela))} - areas


def incluir(con: sqlite3.Connection, vid: int, tela: str, cid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    _tabela_valores(tela)
    c = con.execute("SELECT * FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado(f"Produto {cid} não existe")
    if not c["ativa"]:
        raise Invalido(f"{c['nome']} está inativa no cadastro de Produtos")
    if cid in ids_da_lista(con, vid, tela):
        raise Invalido(f"{c['nome']} já está na lista de {TELAS[tela][1]}")
    con.execute("INSERT INTO culturas_extras(versao_id, cultura_id, tela) VALUES(?,?,?)", (vid, cid, tela))
    arr.auditar(con, autor, vid, f"incluir_cultura_{tela}", c["nome"])


def remover(con: sqlite3.Connection, vid: int, tela: str, cid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    tabela = _tabela_valores(tela)
    c = con.execute("SELECT * FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado(f"Produto {cid} não existe")
    if cid not in sem_area(con, vid, tela):
        raise Invalido(f"{c['nome']} faz parte de Áreas por produto; para tirá-la daqui, remova-a lá")
    con.execute(f"DELETE FROM {tabela} WHERE versao_id=? AND cultura_id=?", (vid, cid))
    con.execute("DELETE FROM culturas_extras WHERE versao_id=? AND cultura_id=? AND tela=?", (vid, cid, tela))
    arr.auditar(con, autor, vid, f"remover_cultura_{tela}", c["nome"])
