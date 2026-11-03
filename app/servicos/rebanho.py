"""Movimentação do rebanho (gado de corte): saldo inicial, compras, nascimentos, mortes e vendas, em cabeças por ano.

Vale para os produtos com "Estoque em: gado de corte". O saldo inicial (cabeças e valor em R$) é digitado só no primeiro ano; nos demais, vem do
saldo final do ano anterior. O preço de venda vem da aba Preços e os custos (inclusive a compra dos animais) vêm dos custos variáveis, em valor total do ano.
O cálculo (custo médio, CPV, estoque) está em resultado._numeros_rebanho."""
from __future__ import annotations

import sqlite3
from typing import Dict, List

from . import arrendamentos as arr
from . import resultado as svc_res
from .arrendamentos import Invalido, NaoEncontrado

CAMPOS = {"saldo_ini": "Saldo inicial", "valor_ini": "Valor do saldo inicial", "compras": "Compras", "nascimentos": "Nascimentos", "mortes": "Mortes previstas", "vendas": "Vendas previstas"}
SO_PRIMEIRO_ANO = ("saldo_ini", "valor_ini")


def _digitados(con: sqlite3.Connection, vid: int) -> Dict[int, Dict[str, Dict[int, float]]]:
    d: Dict[int, Dict[str, Dict[int, float]]] = {}
    for r in con.execute("SELECT cultura_id, campo, ano, valor FROM rebanho_valores WHERE versao_id=?", (vid,)):
        d.setdefault(r["cultura_id"], {}).setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    nums, dig = svc_res.numeros_rebanho(con, vid), _digitados(con, vid)
    nomes = {r["id"]: dict(r) for r in con.execute("SELECT id, nome, unidade FROM culturas")}
    produtos = []
    for cid, n in nums.items():
        t = dig.get(cid, {})
        L = lambda id_, nome, unidade, valores, editavel=None, estilo="": {"id": id_, "nome": nome, "unidade": unidade, "valores": valores, "estilo": estilo,
                                                                          "editavel": {a: bool(editavel and editavel(a)) for a in anos}}
        tudo, primeiro = (lambda a: True), (lambda a: a == anos[0])
        digitado = lambda campo: {a: t.get(campo, {}).get(a, 0.0) for a in anos}
        un = nomes[cid]["unidade"]
        produtos.append({"id": cid, "nome": nomes[cid]["nome"], "unidade": un, "linhas": [
            L("saldo_ini", "Saldo inicial", un, n["reb_ini"], primeiro),
            L("valor_ini", "Valor do saldo inicial", "R$", n["reb_valor_ini"], primeiro),
            L("compras", "(+) Compras", un, digitado("compras"), tudo),
            L("nascimentos", "(+) Nascimentos", un, digitado("nascimentos"), tudo),
            L("mortes", "(–) Mortes previstas", un, digitado("mortes"), tudo),
            L("vendas", "(–) Vendas previstas", un, digitado("vendas"), tudo),
            L("saldo_fim", "Saldo final", un, n["reb_fim"], None, "total"),
            L("custos", "Custos do ano (custos variáveis, inclui a compra dos animais)", "R$", n["reb_custos"]),
            L("custo_medio", "Custo médio por cabeça", "R$", n["reb_custo_medio"]),
            L("estoque", "Valor do estoque final", "R$", n["estoque_valor"], None, "total")]})
    return {"versao": v, "anos": anos, "produtos": produtos}


def _produto(con: sqlite3.Connection, vid: int, cid: int) -> sqlite3.Row:
    c = con.execute("SELECT * FROM culturas WHERE id=?", (cid,)).fetchone()
    if not c:
        raise NaoEncontrado("Produto não encontrado")
    if c["estoque_destino"] != "gado":
        raise Invalido(f"{c['nome']} não tem o estoque em gado de corte (mude em Produtos › Estoque em)")
    return c


def salvar(con: sqlite3.Connection, vid: int, cid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    c = _produto(con, vid, cid)
    if campo not in CAMPOS:
        raise Invalido("Campo desconhecido")
    anos = arr.anos_da_versao(v)
    if ano not in anos:
        raise Invalido("Ano fora do horizonte da versão")
    if campo in SO_PRIMEIRO_ANO and ano != anos[0]:
        raise Invalido(f"{CAMPOS[campo]} só se digita no primeiro ano; nos demais vem do saldo final do ano anterior")
    if valor < 0:
        raise Invalido("O valor não pode ser negativo")
    con.execute("INSERT INTO rebanho_valores(versao_id, cultura_id, campo, ano, valor) VALUES(?,?,?,?,?) "
                "ON CONFLICT(versao_id, cultura_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, cid, campo, ano, valor))
    arr.auditar(con, autor, vid, "salvar_rebanho", f"{c['nome']} · {CAMPOS[campo]} {ano}: {valor}")


def replicar(con: sqlite3.Connection, vid: int, cid: int, campo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    c = _produto(con, vid, cid)
    if campo not in CAMPOS or campo in SO_PRIMEIRO_ANO:
        raise Invalido("Só compras, nascimentos, mortes e vendas se replicam")
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    r = con.execute("SELECT valor FROM rebanho_valores WHERE versao_id=? AND cultura_id=? AND campo=? AND ano=?", (vid, cid, campo, ano_origem)).fetchone()
    valor = r["valor"] if r else 0.0
    for a in destinos:
        con.execute("INSERT INTO rebanho_valores(versao_id, cultura_id, campo, ano, valor) VALUES(?,?,?,?,?) "
                    "ON CONFLICT(versao_id, cultura_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, cid, campo, a, valor))
    arr.auditar(con, autor, vid, "replicar_rebanho", f"{c['nome']} · {CAMPOS[campo]}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)
