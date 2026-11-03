"""Áreas trabalhadas por cultura: o usuário adiciona os produtos que vai cultivar na versão
e lança os hectares por ano. Não há validação contra a área disponível."""
from __future__ import annotations

import sqlite3
from typing import Dict

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado


def _cultura(con: sqlite3.Connection, cid: int) -> sqlite3.Row:
    c = con.execute("SELECT * FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado(f"Produto {cid} não existe")
    return c


def _na_versao(con: sqlite3.Connection, vid: int, cid: int) -> bool:
    return bool(con.execute("SELECT 1 FROM culturas_da_versao WHERE versao_id=? AND cultura_id=?", (vid, cid)).fetchone())


def _exigir_na_versao(con: sqlite3.Connection, vid: int, c: sqlite3.Row) -> None:
    if not _na_versao(con, vid, c["id"]):
        raise Invalido(f"Adicione {c['nome']} à lista de produtos desta versão antes de lançar a área")


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    areas: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT cultura_id, ano, area_ha FROM areas_cultura WHERE versao_id=?", (vid,)):
        areas.setdefault(r["cultura_id"], {})[r["ano"]] = r["area_ha"]
    culturas, adicionaveis = [], []
    for c in con.execute("SELECT * FROM culturas ORDER BY grupo, nome COLLATE NOCASE"):
        if _na_versao(con, vid, c["id"]):
            culturas.append({
                "id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "ativa": bool(c["ativa"]),
                "anos": {a: areas.get(c["id"], {}).get(a, 0.0) for a in anos},
            })
        elif c["ativa"]:
            adicionaveis.append({"id": c["id"], "nome": c["nome"], "grupo": c["grupo"]})
    resumo = {a: {"plantado": sum(c["anos"][a] for c in culturas)} for a in anos}
    return {"versao": v, "anos": anos, "culturas": culturas, "adicionaveis": adicionaveis,
            "total_cadastradas": con.execute("SELECT COUNT(*) FROM culturas").fetchone()[0], "resumo": resumo}


def adicionar_cultura(con: sqlite3.Connection, vid: int, cid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c = _cultura(con, cid)
    if not c["ativa"]:
        raise Invalido(f"{c['nome']} está inativa no cadastro de Produtos")
    if _na_versao(con, vid, cid):
        raise Invalido(f"{c['nome']} já está na lista desta versão")
    con.execute("INSERT INTO culturas_da_versao(versao_id, cultura_id) VALUES(?,?)", (vid, cid))
    con.execute("INSERT OR IGNORE INTO custos_culturas(versao_id, cultura_id) VALUES(?,?)", (vid, cid))      # já aparece em Custos variáveis
    arr.auditar(con, autor, vid, "adicionar_cultura_area", c["nome"])


def remover_cultura(con: sqlite3.Connection, vid: int, cid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c = _cultura(con, cid)
    con.execute("DELETE FROM areas_cultura WHERE versao_id=? AND cultura_id=?", (vid, cid))
    for telas, tabela in ((("produtividade",), "produtividade"), (("precos", "produtividade"), "precos_venda")):     # as adicionadas à mão ficam (Preços acompanha a Produtividade)
        marcas = ",".join("?" * len(telas))
        if not con.execute(f"SELECT 1 FROM culturas_extras WHERE versao_id=? AND cultura_id=? AND tela IN ({marcas})", (vid, cid, *telas)).fetchone():
            con.execute(f"DELETE FROM {tabela} WHERE versao_id=? AND cultura_id=?", (vid, cid))
    con.execute("DELETE FROM custos_cultura WHERE versao_id=? AND cultura_id=?", (vid, cid))
    con.execute("DELETE FROM custos_grupos_cultura WHERE versao_id=? AND cultura_id=?", (vid, cid))
    con.execute("DELETE FROM custos_culturas WHERE versao_id=? AND cultura_id=?", (vid, cid))
    for tabela in ("prem_valores", "prem_itens", "prem_culturas"):
        con.execute(f"DELETE FROM {tabela} WHERE versao_id=? AND cultura_id=?", (vid, cid))
    con.execute("DELETE FROM culturas_da_versao WHERE versao_id=? AND cultura_id=?", (vid, cid))
    arr.auditar(con, autor, vid, "remover_cultura_area", c["nome"])


def salvar_area(con: sqlite3.Connection, vid: int, cid: int, ano: int, area_ha: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    c = _cultura(con, cid)
    _exigir_na_versao(con, vid, c)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if area_ha < 0:
        raise Invalido("A área não pode ser negativa")
    con.execute(
        "INSERT INTO areas_cultura(versao_id, cultura_id, ano, area_ha) VALUES(?,?,?,?) "
        "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET area_ha=excluded.area_ha",
        (vid, cid, ano, area_ha),
    )
    arr.auditar(con, autor, vid, "salvar_area", f"{c['nome']} {ano}: {area_ha} ha")


def replicar(con: sqlite3.Connection, vid: int, cid: int, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    c = _cultura(con, cid)
    _exigir_na_versao(con, vid, c)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    o = con.execute("SELECT area_ha FROM areas_cultura WHERE versao_id=? AND cultura_id=? AND ano=?",
                    (vid, cid, ano_origem)).fetchone()
    valor = o["area_ha"] if o else 0.0
    destinos = [a for a in anos if a > ano_origem]
    for a in destinos:
        con.execute(
            "INSERT INTO areas_cultura(versao_id, cultura_id, ano, area_ha) VALUES(?,?,?,?) "
            "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET area_ha=excluded.area_ha",
            (vid, cid, a, valor),
        )
    arr.auditar(con, autor, vid, "replicar_area", f"{c['nome']}: {valor} ha de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todas(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    """Copia, para todos os produtos da lista, a área do ano de origem para os anos seguintes."""
    v = arr.versao_editavel(con, vid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    ids = [r["cultura_id"] for r in con.execute("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", (vid,))]
    if not ids:
        raise Invalido("Nenhum produto adicionado para replicar")
    for cid in ids:
        o = con.execute("SELECT area_ha FROM areas_cultura WHERE versao_id=? AND cultura_id=? AND ano=?",
                        (vid, cid, ano_origem)).fetchone()
        valor = o["area_ha"] if o else 0.0
        for a in destinos:
            con.execute(
                "INSERT INTO areas_cultura(versao_id, cultura_id, ano, area_ha) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET area_ha=excluded.area_ha",
                (vid, cid, a, valor),
            )
    arr.auditar(con, autor, vid, "replicar_todas_areas", f"{len(ids)} cultura(s) de {ano_origem} para {len(destinos)} ano(s)")
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
    nomes = {c["id"]: c["nome"] for c in la["culturas"] + lb["culturas"]}
    culturas = {
        nomes[i]: {an: delta(ia.get(i, {"anos": {}})["anos"].get(an, 0.0), ib.get(i, {"anos": {}})["anos"].get(an, 0.0))
                   for an in anos}
        for i in sorted(nomes, key=lambda k: nomes[k].lower())
    }
    total = {an: delta(la["resumo"][an]["plantado"], lb["resumo"][an]["plantado"]) for an in anos}
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "culturas": culturas, "total": total}
