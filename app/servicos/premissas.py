"""Premissas de culturas: escolhe-se o produto (com área ou com produtividade) e vinculam-se a ele os tipos de
premissa; cada tipo vira uma linha com valores por ano. Mesma lógica da tela de Custos variáveis."""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from . import extras
from .arrendamentos import Invalido, NaoEncontrado

# chave -> (nome, natureza). Percentuais ficam entre 0 e 100; quantidades usam a medida da cultura (kg ou litro).
TIPOS: Dict[str, dict] = {
    "deducao_receita": {"nome": "% dedução de receita", "natureza": "pct"},
    "descarte": {"nome": "% descarte", "natureza": "pct"},
    "estoque": {"nome": "Quantidade estocada", "natureza": "qtd"},
    "sementes": {"nome": "Sementes salvas", "natureza": "qtd"},
    # valores únicos do ano anterior ao primeiro ano do orçamento (31/12 do ano que antecede o horizonte): o estoque de passagem que o orçamento recebe
    "estoque_ant": {"nome": "Estoque de passagem do ano anterior", "natureza": "qtd", "unico": True},
    "custo_estoque_ant": {"nome": "Custo médio do estoque do ano anterior", "natureza": "moeda", "unico": True},
}


def _tipo(tipo: str) -> dict:
    if tipo not in TIPOS:
        raise Invalido("Tipo de premissa inválido")
    return TIPOS[tipo]


def _existe(con: sqlite3.Connection, cid: int) -> sqlite3.Row:
    c = con.execute("SELECT * FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado(f"Produto {cid} não existe")
    return c


def _escolhida(con: sqlite3.Connection, vid: int, cid: int) -> sqlite3.Row:
    c = _existe(con, cid)
    if not con.execute("SELECT 1 FROM prem_culturas WHERE versao_id=? AND cultura_id=?", (vid, cid)).fetchone():
        raise Invalido(f"Adicione {c['nome']} em Premissas de produtos antes de vincular as premissas")
    return c


def _tem(con: sqlite3.Connection, vid: int, cid: int, tipo: str) -> bool:
    return bool(con.execute("SELECT 1 FROM prem_itens WHERE versao_id=? AND cultura_id=? AND tipo=?", (vid, cid, tipo)).fetchone())


def _unidade(cultura: sqlite3.Row, tipo: str) -> str:
    nat = TIPOS[tipo]["natureza"]
    return "%" if nat == "pct" else f"R$/{cultura['unidade']}" if nat == "moeda" else cultura["unidade"]


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    valores: Dict[tuple, Dict[int, float]] = {}
    for r in con.execute("SELECT cultura_id, tipo, ano, valor FROM prem_valores WHERE versao_id=?", (vid,)):
        valores.setdefault((r["cultura_id"], r["tipo"]), {})[r["ano"]] = r["valor"]
    itens: Dict[int, List[str]] = {}
    for r in con.execute("SELECT cultura_id, tipo FROM prem_itens WHERE versao_id=?", (vid,)):
        itens.setdefault(r["cultura_id"], []).append(r["tipo"])
    ordem = list(TIPOS)
    culturas = []
    for c in con.execute(
        "SELECT c.* FROM culturas c JOIN prem_culturas pc ON pc.cultura_id=c.id AND pc.versao_id=? "
        "ORDER BY c.grupo, c.nome COLLATE NOCASE", (vid,)
    ):
        tipos = sorted(itens.get(c["id"], []), key=ordem.index)
        culturas.append({
            "id": c["id"], "nome": c["nome"], "grupo": c["grupo"],
            "premissas": [{"tipo": t, "nome": TIPOS[t]["nome"], "unidade": _unidade(c, t),
                           "unico": bool(TIPOS[t].get("unico")),
                           "anos": {a: valores.get((c["id"], t), {}).get(a, 0.0) for a in ([anos[0] - 1] if TIPOS[t].get("unico") else anos)}} for t in tipos],
            "adicionaveis": [{"tipo": t, "nome": TIPOS[t]["nome"]} for t in ordem if t not in tipos],
        })
    lista = extras.ids_com_produtividade(con, vid)           # produtos com área ou com produtividade (pecuária, leite)
    escolhiveis = [dict(r) for r in con.execute(
        f"SELECT c.id, c.nome, c.grupo FROM culturas c WHERE c.id IN ({','.join('?' * len(lista)) or 'NULL'}) "
        "AND c.id NOT IN (SELECT cultura_id FROM prem_culturas WHERE versao_id=?) ORDER BY c.grupo, c.nome COLLATE NOCASE", lista + [vid])]
    n_areas = len(lista)
    return {"versao": v, "anos": anos, "ano_anterior": anos[0] - 1, "culturas": culturas, "culturas_escolhiveis": escolhiveis, "total_culturas_areas": n_areas,
            "tipos": [{"tipo": t, "nome": d["nome"], "natureza": d["natureza"]} for t, d in TIPOS.items()]}


def adicionar_cultura(con: sqlite3.Connection, vid: int, cid: int, autor: str) -> None:
    """Aceita os produtos com área (Áreas por produto) ou com produtividade lançada (pecuária e leite) nesta versão."""
    arr.versao_editavel(con, vid)
    c = _existe(con, cid)
    if cid not in extras.ids_com_produtividade(con, vid):
        raise Invalido(f"{c['nome']} não está em Áreas por produto nem tem produtividade lançada. Só entram aqui os produtos que têm área ou produtividade; adicione-o lá primeiro")
    if con.execute("SELECT 1 FROM prem_culturas WHERE versao_id=? AND cultura_id=?", (vid, cid)).fetchone():
        raise Invalido(f"{c['nome']} já está em Premissas de produtos")
    con.execute("INSERT INTO prem_culturas(versao_id, cultura_id) VALUES(?,?)", (vid, cid))
    arr.auditar(con, autor, vid, "adicionar_cultura_premissa", c["nome"])


def remover_cultura(con: sqlite3.Connection, vid: int, cid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c = _escolhida(con, vid, cid)
    for tabela in ("prem_valores", "prem_itens", "prem_culturas"):
        con.execute(f"DELETE FROM {tabela} WHERE versao_id=? AND cultura_id=?", (vid, cid))
    arr.auditar(con, autor, vid, "remover_cultura_premissa", c["nome"])


def adicionar_tipo(con: sqlite3.Connection, vid: int, cid: int, tipo: str, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c = _escolhida(con, vid, cid)
    t = _tipo(tipo)
    if _tem(con, vid, cid, tipo):
        raise Invalido(f"{t['nome']} já está em {c['nome']}")
    con.execute("INSERT INTO prem_itens(versao_id, cultura_id, tipo) VALUES(?,?,?)", (vid, cid, tipo))
    arr.auditar(con, autor, vid, "adicionar_premissa", f"{c['nome']}: {t['nome']}")


def adicionar_tipo_a_todas(con: sqlite3.Connection, vid: int, tipo: str, autor: str) -> dict:
    """Vincula o tipo de premissa a todos os produtos da tela que ainda não o têm (as que já têm ficam como estão)."""
    arr.versao_editavel(con, vid)
    t = _tipo(tipo)
    culturas = [r["cultura_id"] for r in con.execute("SELECT cultura_id FROM prem_culturas WHERE versao_id=?", (vid,))]
    if not culturas:
        raise Invalido("Adicione pelo menos um produto antes de vincular a premissa a todas")
    novas = [cid for cid in culturas if not _tem(con, vid, cid, tipo)]
    con.executemany("INSERT INTO prem_itens(versao_id, cultura_id, tipo) VALUES(?,?,?)", [(vid, cid, tipo) for cid in novas])
    arr.auditar(con, autor, vid, "adicionar_premissa_a_todas", f"{t['nome']}: {len(novas)} cultura(s)")
    return {"adicionadas": len(novas), "ja_tinham": len(culturas) - len(novas)}


def remover_tipo(con: sqlite3.Connection, vid: int, cid: int, tipo: str, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c = _escolhida(con, vid, cid)
    t = _tipo(tipo)
    con.execute("DELETE FROM prem_valores WHERE versao_id=? AND cultura_id=? AND tipo=?", (vid, cid, tipo))
    con.execute("DELETE FROM prem_itens WHERE versao_id=? AND cultura_id=? AND tipo=?", (vid, cid, tipo))
    arr.auditar(con, autor, vid, "remover_premissa", f"{c['nome']}: {t['nome']}")


def _exigir(con: sqlite3.Connection, vid: int, cid: int, tipo: str):
    c, t = _escolhida(con, vid, cid), _tipo(tipo)
    if not _tem(con, vid, cid, tipo):
        raise Invalido(f"Vincule {t['nome']} a {c['nome']} antes de lançar o valor")
    return c, t


def salvar(con: sqlite3.Connection, vid: int, cid: int, tipo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    c, t = _exigir(con, vid, cid, tipo)
    anos = arr.anos_da_versao(v)
    if t.get("unico"):
        if ano != anos[0] - 1:
            raise Invalido(f"{t['nome']} vale só para o ano anterior ao orçamento ({anos[0] - 1})")
    elif ano not in anos:
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("O valor não pode ser negativo")
    if t["natureza"] == "pct" and valor > 100:
        raise Invalido(f"{t['nome']} deve ficar entre 0 e 100")
    con.execute(
        "INSERT INTO prem_valores(versao_id, cultura_id, tipo, ano, valor) VALUES(?,?,?,?,?) "
        "ON CONFLICT(versao_id, cultura_id, tipo, ano) DO UPDATE SET valor=excluded.valor",
        (vid, cid, tipo, ano, valor),
    )
    arr.auditar(con, autor, vid, "salvar_premissa", f"{c['nome']} / {t['nome']} {ano}: {valor}")


def _copiar(con: sqlite3.Connection, vid: int, cid: int, tipo: str, ano_origem: int, destinos: List[int]) -> None:
    o = con.execute("SELECT valor FROM prem_valores WHERE versao_id=? AND cultura_id=? AND tipo=? AND ano=?",
                    (vid, cid, tipo, ano_origem)).fetchone()
    valor = o["valor"] if o else 0.0
    for a in destinos:
        con.execute(
            "INSERT INTO prem_valores(versao_id, cultura_id, tipo, ano, valor) VALUES(?,?,?,?,?) "
            "ON CONFLICT(versao_id, cultura_id, tipo, ano) DO UPDATE SET valor=excluded.valor",
            (vid, cid, tipo, a, valor),
        )


def replicar(con: sqlite3.Connection, vid: int, cid: int, tipo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    c, t = _exigir(con, vid, cid, tipo)
    if t.get("unico"):
        raise Invalido(f"{t['nome']} é um valor único do ano anterior e não se replica")
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    _copiar(con, vid, cid, tipo, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_premissa", f"{c['nome']} / {t['nome']}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todas(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    pares = [(r["cultura_id"], r["tipo"]) for r in con.execute("SELECT cultura_id, tipo FROM prem_itens WHERE versao_id=?", (vid,)) if not TIPOS[r["tipo"]].get("unico")]
    if not pares:
        raise Invalido("Nenhuma premissa lançada para replicar")
    for cid, tipo in pares:
        _copiar(con, vid, cid, tipo, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_todas_premissas", f"{len(pares)} linha(s) de {ano_origem}")
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
        pa = {p["tipo"]: p for p in (ia[cid]["premissas"] if cid in ia else [])}
        pb = {p["tipo"]: p for p in (ib[cid]["premissas"] if cid in ib else [])}
        z = {an: 0.0 for an in anos}
        culturas[nomes[cid]] = {TIPOS[t]["nome"]: {
            "unidade": (pa.get(t) or pb.get(t))["unidade"],
            "anos": {an: delta(pa.get(t, {"anos": z})["anos"].get(an, 0.0), pb.get(t, {"anos": z})["anos"].get(an, 0.0)) for an in anos}}
            for t in TIPOS if t in pa or t in pb}
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "culturas": culturas}
