"""Custos variáveis: cada produto de 'Áreas por produto' entra sozinho (e outros, como leite, podem ser acrescentados);
o usuário adiciona grupos de custo
(cada um vira uma linha) e lança o valor em R$ por hectare, por ano."""
from __future__ import annotations

import sqlite3
from typing import Dict, List

from . import arrendamentos as arr
from . import extras
from . import resultado as svc_res
from .arrendamentos import Invalido, NaoEncontrado


def _existe(con: sqlite3.Connection, cid: int) -> sqlite3.Row:
    c = con.execute("SELECT * FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado(f"Produto {cid} não existe")
    return c


def _ids_lista(con: sqlite3.Connection, vid: int) -> List[int]:
    """Produtos da tela: os que têm produtividade (áreas, pecuária, leite) e os escolhidos à mão em versões antigas."""
    manual = [r["cultura_id"] for r in con.execute("SELECT cultura_id FROM custos_culturas WHERE versao_id=?", (vid,))]
    return list(dict.fromkeys(extras.ids_com_produtividade(con, vid) + manual))


def _cultura(con: sqlite3.Connection, vid: int, cid: int) -> sqlite3.Row:
    """Produto que está na tela de Custos variáveis desta versão."""
    c = _existe(con, cid)
    if cid not in _ids_lista(con, vid):
        raise Invalido(f"Adicione {c['nome']} em Custos variáveis antes de lançar os grupos de custo")
    return c


def adicionar_cultura(con: sqlite3.Connection, vid: int, cid: int, autor: str) -> None:
    """Aceita qualquer produto ativo do cadastro, tenha ou não área (leite, genética...). Os de Áreas por produto entram sozinhos."""
    arr.versao_editavel(con, vid)
    c = _existe(con, cid)
    if not c["ativa"]:
        raise Invalido(f"{c['nome']} está inativo no cadastro de Produtos")
    if con.execute("SELECT 1 FROM custos_culturas WHERE versao_id=? AND cultura_id=?", (vid, cid)).fetchone():
        raise Invalido(f"{c['nome']} já está em Custos variáveis")
    con.execute("INSERT INTO custos_culturas(versao_id, cultura_id) VALUES(?,?)", (vid, cid))
    arr.auditar(con, autor, vid, "adicionar_cultura_custo", c["nome"])


def remover_cultura(con: sqlite3.Connection, vid: int, cid: int, autor: str) -> None:
    """Apaga as rubricas e os custos do produto. Se ele ainda tem área ou produtividade, continua na tela (sem rubricas)."""
    arr.versao_editavel(con, vid)
    c = _cultura(con, vid, cid)
    con.execute("DELETE FROM custos_cultura WHERE versao_id=? AND cultura_id=?", (vid, cid))
    con.execute("DELETE FROM custos_grupos_cultura WHERE versao_id=? AND cultura_id=?", (vid, cid))
    con.execute("DELETE FROM custos_culturas WHERE versao_id=? AND cultura_id=?", (vid, cid))
    arr.auditar(con, autor, vid, "remover_cultura_custo", c["nome"])


def _grupo(con: sqlite3.Connection, gid: int) -> sqlite3.Row:
    g = con.execute("SELECT * FROM grupos_custo WHERE id=?", (gid,)).fetchone()
    if not g:
        raise NaoEncontrado(f"Grupo de custo {gid} não existe")
    return g


def _na_cultura(con: sqlite3.Connection, vid: int, cid: int, gid: int) -> bool:
    return bool(con.execute("SELECT 1 FROM custos_grupos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=?",
                            (vid, cid, gid)).fetchone())


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    valores: Dict[tuple, Dict[int, float]] = {}
    for r in con.execute("SELECT cultura_id, grupo_id, ano, valor FROM custos_cultura WHERE versao_id=?", (vid,)):
        valores.setdefault((r["cultura_id"], r["grupo_id"]), {})[r["ano"]] = r["valor"]
    areas: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT cultura_id, ano, area_ha FROM areas_cultura WHERE versao_id=?", (vid,)):
        areas.setdefault(r["cultura_id"], {})[r["ano"]] = r["area_ha"]
    grupos = {g["id"]: dict(g) for g in con.execute("SELECT * FROM grupos_custo")}
    usados: Dict[int, List[int]] = {}
    for r in con.execute("SELECT cultura_id, grupo_id FROM custos_grupos_cultura WHERE versao_id=?", (vid,)):
        usados.setdefault(r["cultura_id"], []).append(r["grupo_id"])
    culturas = []
    lista = _ids_lista(con, vid)
    qtd_sem_area = svc_res.quantidades_sem_area(con, vid)                 # pecuária e leite: o custo é por kg/litro/unidade produzido
    for c in con.execute(
        f"SELECT c.* FROM culturas c WHERE c.id IN ({','.join('?' * len(lista)) or 'NULL'}) ORDER BY c.grupo, c.nome COLLATE NOCASE", lista
    ):
        ids = sorted(usados.get(c["id"], []), key=lambda g: (grupos[g]["classificacao"] != "direto", grupos[g]["nome"].lower()))
        linhas = [{"id": g, "nome": grupos[g]["nome"], "classificacao": grupos[g]["classificacao"], "ativa": bool(grupos[g]["ativa"]),
                   "anos": {a: valores.get((c["id"], g), {}).get(a, 0.0) for a in anos}} for g in ids]
        tot = {k: {a: sum(l["anos"][a] for l in linhas if k == "total" or l["classificacao"] == k) for a in anos}
               for k in ("direto", "indireto", "total")}
        sem_area = c["id"] in qtd_sem_area
        rebanho = sem_area and c["estoque_destino"] == "gado"                       # gado de corte: a rubrica é o valor total do ano (compra dos animais, ração...)
        area = {a: (1.0 if rebanho else qtd_sem_area[c["id"]].get(a, 0.0) if sem_area else areas.get(c["id"], {}).get(a, 0.0)) for a in anos}      # sem área: a quantidade produzida
        culturas.append({
            "id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "unidade": c["unidade"], "sem_area": sem_area, "rebanho": rebanho, "grupos": linhas, "totais": tot, "area_ha": area,
            "custo_total": {a: tot["total"][a] * area[a] for a in anos},
            "adicionaveis": [{"id": g["id"], "nome": g["nome"], "classificacao": g["classificacao"]}
                             for g in sorted(grupos.values(), key=lambda x: (x["classificacao"] != "direto", x["nome"].lower()))
                             if g["ativa"] and g["id"] not in ids],
        })
    # produtos que ainda podem ser escolhidos: qualquer ativo do cadastro que não esteja aqui (inclui os sem área, como leite)
    escolhiveis = [dict(r) for r in con.execute(
        "SELECT c.id, c.nome, c.grupo FROM culturas c WHERE c.ativa=1 "
        "AND c.id NOT IN (%s) ORDER BY c.grupo, c.nome COLLATE NOCASE" % (",".join("?" * len(lista)) or "-1"), lista)]
    n_areas = con.execute("SELECT COUNT(*) FROM culturas WHERE ativa=1").fetchone()[0]
    return {"versao": v, "anos": anos, "culturas": culturas, "culturas_escolhiveis": escolhiveis,
            "total_culturas_areas": n_areas, "total_grupos": len(grupos)}


def adicionar_grupo(con: sqlite3.Connection, vid: int, cid: int, gid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c, g = _cultura(con, vid, cid), _grupo(con, gid)
    if not g["ativa"]:
        raise Invalido(f"O grupo {g['nome']} está inativo")
    if _na_cultura(con, vid, cid, gid):
        raise Invalido(f"{g['nome']} já está em {c['nome']}")
    con.execute("INSERT INTO custos_grupos_cultura(versao_id, cultura_id, grupo_id) VALUES(?,?,?)", (vid, cid, gid))
    arr.auditar(con, autor, vid, "adicionar_grupo_custo", f"{c['nome']}: {g['nome']}")


def adicionar_grupo_a_todas(con: sqlite3.Connection, vid: int, gid: int, autor: str) -> dict:
    """Inclui a rubrica em todos os produtos da tela que ainda não a têm (as que já têm ficam como estão)."""
    arr.versao_editavel(con, vid)
    g = _grupo(con, gid)
    if not g["ativa"]:
        raise Invalido(f"O grupo {g['nome']} está inativo")
    culturas = _ids_lista(con, vid)
    if not culturas:
        raise Invalido("Adicione pelo menos um produto antes de incluir a rubrica em todas")
    novas = [cid for cid in culturas if not _na_cultura(con, vid, cid, gid)]
    con.executemany("INSERT INTO custos_grupos_cultura(versao_id, cultura_id, grupo_id) VALUES(?,?,?)", [(vid, cid, gid) for cid in novas])
    arr.auditar(con, autor, vid, "adicionar_grupo_custo_a_todas", f"{g['nome']}: {len(novas)} cultura(s)")
    return {"adicionadas": len(novas), "ja_tinham": len(culturas) - len(novas)}


def remover_grupo(con: sqlite3.Connection, vid: int, cid: int, gid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c, g = _cultura(con, vid, cid), _grupo(con, gid)
    con.execute("DELETE FROM custos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=?", (vid, cid, gid))
    con.execute("DELETE FROM custos_grupos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=?", (vid, cid, gid))
    arr.auditar(con, autor, vid, "remover_grupo_custo", f"{c['nome']}: {g['nome']}")


def _exigir(con: sqlite3.Connection, vid: int, cid: int, gid: int):
    c, g = _cultura(con, vid, cid), _grupo(con, gid)
    if not _na_cultura(con, vid, cid, gid):
        raise Invalido(f"Adicione {g['nome']} a {c['nome']} antes de lançar o custo")
    return c, g


def salvar(con: sqlite3.Connection, vid: int, cid: int, gid: int, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    c, g = _exigir(con, vid, cid, gid)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("O custo não pode ser negativo")
    con.execute(
        "INSERT INTO custos_cultura(versao_id, cultura_id, grupo_id, ano, valor) VALUES(?,?,?,?,?) "
        "ON CONFLICT(versao_id, cultura_id, grupo_id, ano) DO UPDATE SET valor=excluded.valor",
        (vid, cid, gid, ano, valor),
    )
    arr.auditar(con, autor, vid, "salvar_custo", f"{c['nome']} / {g['nome']} {ano}: {valor}")


def _copiar(con: sqlite3.Connection, vid: int, cid: int, gid: int, ano_origem: int, destinos: List[int]) -> None:
    o = con.execute("SELECT valor FROM custos_cultura WHERE versao_id=? AND cultura_id=? AND grupo_id=? AND ano=?",
                    (vid, cid, gid, ano_origem)).fetchone()
    valor = o["valor"] if o else 0.0
    for a in destinos:
        con.execute(
            "INSERT INTO custos_cultura(versao_id, cultura_id, grupo_id, ano, valor) VALUES(?,?,?,?,?) "
            "ON CONFLICT(versao_id, cultura_id, grupo_id, ano) DO UPDATE SET valor=excluded.valor",
            (vid, cid, gid, a, valor),
        )


def replicar(con: sqlite3.Connection, vid: int, cid: int, gid: int, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    c, g = _exigir(con, vid, cid, gid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    _copiar(con, vid, cid, gid, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_custo", f"{c['nome']} / {g['nome']}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todos(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    pares = [(r["cultura_id"], r["grupo_id"]) for r in con.execute(
        "SELECT cultura_id, grupo_id FROM custos_grupos_cultura WHERE versao_id=?", (vid,))]
    if not pares:
        raise Invalido("Nenhum custo lançado para replicar")
    for cid, gid in pares:
        _copiar(con, vid, cid, gid, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_todos_custos", f"{len(pares)} linha(s) de {ano_origem}")
    return {"linhas": len(pares), "anos_alterados": len(destinos)}


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
    culturas = {}
    for cid in sorted(nomes, key=lambda k: nomes[k].lower()):
        ca, cb = ia.get(cid), ib.get(cid)
        ga = {g["nome"]: g for g in (ca["grupos"] if ca else [])}
        gb = {g["nome"]: g for g in (cb["grupos"] if cb else [])}
        z = {an: 0.0 for an in anos}
        culturas[nomes[cid]] = {
            "total": {an: delta((ca["totais"]["total"] if ca else z).get(an, 0.0), (cb["totais"]["total"] if cb else z).get(an, 0.0)) for an in anos},
            "grupos": {n: {an: delta(ga.get(n, {"anos": z})["anos"].get(an, 0.0), gb.get(n, {"anos": z})["anos"].get(an, 0.0)) for an in anos}
                       for n in sorted(set(ga) | set(gb), key=str.lower)},
        }
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "culturas": culturas}
