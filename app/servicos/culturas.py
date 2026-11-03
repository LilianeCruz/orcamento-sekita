"""Cadastro de produtos (lista única, vale para todas as versões)."""
from __future__ import annotations

import datetime as dt
import sqlite3
from typing import List

from .arrendamentos import Invalido, NaoEncontrado, auditar

UNIDADES = ["kg", "litro", "uni"]
PLURAL = {"kg": "kg", "litro": "litros", "uni": "unidades"}
GRUPOS = ["Hortifruti", "Grãos", "Fruticultura", "Pecuária", "Outros"]
ESTOQUES = ("produto", "gado")                     # produto: Estoque de produtos acabados; gado: Estoque de gado de corte (linha própria do balanço)
RECEITAS = ("operacional", "nao_operacional")      # operacional: linhas próprias na DRE (receita bruta e CPV); não operacional: Resultados de outras atividades


def _validar(con: sqlite3.Connection, d: dict, cid: int = 0) -> dict:
    nome = str(d.get("nome", "")).strip()
    if not nome:
        raise Invalido("Informe o nome do produto")
    if d.get("grupo") not in GRUPOS:
        raise Invalido("Grupo inválido. Use: " + ", ".join(GRUPOS))
    unidade = str(d.get("unidade") or "kg").strip().lower()
    if unidade not in UNIDADES:
        raise Invalido("A produção deve ser medida em kg, litro ou unidade")
    embalagem = str(d.get("embalagem", "")).strip()
    qtd = float(d.get("qtd_por_embalagem") or 0)
    if qtd < 0:
        raise Invalido("A quantidade por embalagem não pode ser negativa")
    if embalagem and qtd <= 0:
        raise Invalido(f"Informe quantos {PLURAL[unidade]} tem cada {embalagem.lower()} (maior que zero)")
    if not embalagem:
        qtd = 0.0
    receita = str(d.get("receita_tipo") or "operacional")
    if receita not in RECEITAS:
        raise Invalido("O tipo de receita deve ser operacional ou não operacional")
    estoque = str(d.get("estoque_destino") or "produto")
    if estoque not in ESTOQUES:
        raise Invalido("O estoque deve ir para produtos acabados ou para gado de corte")
    repetida = con.execute("SELECT id FROM culturas WHERE nome=? AND id<>?", (nome, cid)).fetchone()
    if repetida:
        raise Invalido(f"Já existe um produto chamada '{nome}'")
    return {"nome": nome, "grupo": d["grupo"], "unidade": unidade, "embalagem": embalagem, "qtd_por_embalagem": qtd,
            "ativa": 1 if d.get("ativa", True) else 0, "receita_tipo": receita, "estoque_destino": estoque}


def listar(con: sqlite3.Connection) -> List[dict]:
    uso = {r["cultura_id"]: r["n"] for r in con.execute(
        "SELECT cultura_id, COUNT(*) AS n FROM ("
        " SELECT cultura_id FROM culturas_da_versao"
        " UNION ALL SELECT cultura_id FROM culturas_extras"
        " UNION ALL SELECT cultura_id FROM fazendas WHERE cultura_id IS NOT NULL"
        " UNION ALL SELECT cultura_id FROM precos WHERE preco<>0) GROUP BY cultura_id")}
    out = []
    for r in con.execute("SELECT * FROM culturas ORDER BY ativa DESC, grupo, nome COLLATE NOCASE"):
        d = dict(r)
        d["ativa"] = bool(d["ativa"])
        d["em_uso"] = uso.get(r["id"], 0) > 0
        out.append(d)
    return out


def criar(con: sqlite3.Connection, d: dict, autor: str) -> int:
    v = _validar(con, d)
    cur = con.execute(
        "INSERT INTO culturas(nome, grupo, unidade, embalagem, qtd_por_embalagem, ativa, receita_tipo, estoque_destino, criado_em) VALUES(?,?,?,?,?,?,?,?,?)",
        (v["nome"], v["grupo"], v["unidade"], v["embalagem"], v["qtd_por_embalagem"], v["ativa"], v["receita_tipo"], v["estoque_destino"],
         dt.datetime.now().isoformat(timespec="seconds")),
    )
    auditar(con, autor, None, "criar_cultura", v["nome"])
    return cur.lastrowid


def atualizar(con: sqlite3.Connection, cid: int, d: dict, autor: str) -> None:
    if not con.execute("SELECT 1 FROM culturas WHERE id=?", (cid,)).fetchone():
        raise NaoEncontrado(f"Produto {cid} não existe")
    v = _validar(con, d, cid)
    con.execute(
        "UPDATE culturas SET nome=?, grupo=?, unidade=?, embalagem=?, qtd_por_embalagem=?, ativa=?, receita_tipo=?, estoque_destino=? WHERE id=?",
        (v["nome"], v["grupo"], v["unidade"], v["embalagem"], v["qtd_por_embalagem"], v["ativa"], v["receita_tipo"], v["estoque_destino"], cid),
    )
    auditar(con, autor, None, "atualizar_cultura", v["nome"])


def excluir(con: sqlite3.Connection, cid: int, autor: str) -> None:
    c = con.execute("SELECT nome FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado(f"Produto {cid} não existe")
    if con.execute("SELECT 1 FROM culturas_da_versao WHERE cultura_id=? LIMIT 1", (cid,)).fetchone():
        raise Invalido(f"'{c['nome']}' foi adicionada em Áreas por produto em alguma versão. Desmarque 'Ativa' em vez de excluir.")
    if con.execute("SELECT 1 FROM culturas_extras WHERE cultura_id=? LIMIT 1", (cid,)).fetchone():
        raise Invalido(f"'{c['nome']}' foi adicionada em Produtividade ou Preços em alguma versão. Desmarque 'Ativa' em vez de excluir.")
    if con.execute("SELECT 1 FROM fazendas WHERE cultura_id=? LIMIT 1", (cid,)).fetchone() or \
            con.execute("SELECT 1 FROM precos WHERE cultura_id=? AND preco<>0 LIMIT 1", (cid,)).fetchone():
        raise Invalido(f"'{c['nome']}' é usada em Arrendamentos (pagamento ou preço). Desmarque 'Ativa' em vez de excluir.")
    con.execute("DELETE FROM precos WHERE cultura_id=?", (cid,))
    con.execute("DELETE FROM precos_venda WHERE cultura_id=?", (cid,))
    con.execute("DELETE FROM culturas WHERE id=?", (cid,))
    auditar(con, autor, None, "excluir_cultura", c["nome"])
