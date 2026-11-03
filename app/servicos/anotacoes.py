"""Anotações nos números dos relatórios: marca-texto (amarelo, verde, vermelho) e um comentário por número.
Ficam salvas por versão e tela. São observações, não dados do orçamento: valem também em versão aprovada e travada."""
from __future__ import annotations

import sqlite3
from typing import Dict, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado

CORES = ("", "amarelo", "verde", "vermelho")
LIMITE_COMENTARIO = 2000


def listar(con: sqlite3.Connection, vid: int, tela: str) -> Dict[str, dict]:
    arr.obter_versao(con, vid)
    return {r["chave"]: {"cor": r["cor"], "comentario": r["comentario"], "valor": r["valor"], "validado": bool(r["validado"]), "validado_em": r["validado_em"], "validado_por": r["validado_por"], "autor": r["autor"], "atualizado_em": r["atualizado_em"]}
            for r in con.execute("SELECT * FROM anotacoes WHERE versao_id=? AND tela=?", (vid, tela))}


def salvar(con: sqlite3.Connection, vid: int, tela: str, chave: str, cor: str, comentario: str, autor: str,
           valor: Optional[float] = None) -> dict:
    arr.obter_versao(con, vid)
    if not tela.strip() or not chave.strip():
        raise Invalido("Informe a tela e o número a anotar")
    if cor not in CORES:
        raise Invalido("Cor inválida; use amarelo, verde ou vermelho")
    comentario = (comentario or "").strip()
    if len(comentario) > LIMITE_COMENTARIO:
        raise Invalido(f"O comentário pode ter até {LIMITE_COMENTARIO} caracteres")
    if not cor and not comentario:                                    # sem marca e sem comentário: some
        con.execute("DELETE FROM anotacoes WHERE versao_id=? AND tela=? AND chave=?", (vid, tela, chave))
        arr.auditar(con, autor, vid, "limpar_anotacao", f"{tela} {chave}")
        return {}
    con.execute(
        "INSERT INTO anotacoes(versao_id, tela, chave, cor, comentario, valor, autor, atualizado_em) VALUES(?,?,?,?,?,?,?,?) "
        "ON CONFLICT(versao_id, tela, chave) DO UPDATE SET cor=excluded.cor, comentario=excluded.comentario, valor=excluded.valor, "
        "autor=excluded.autor, atualizado_em=excluded.atualizado_em", (vid, tela, chave, cor, comentario, valor, autor, arr._agora()))
    arr.auditar(con, autor, vid, "anotar", f"{tela} {chave} {cor}")
    return {"cor": cor, "comentario": comentario, "valor": valor}


def validar(con: sqlite3.Connection, vid: int, tela: str, chave: str, validado: bool, autor: str) -> dict:
    """Check de conferência da anotação. Vale também em versão travada, como a própria anotação."""
    arr.obter_versao(con, vid)
    if not con.execute("SELECT 1 FROM anotacoes WHERE versao_id=? AND tela=? AND chave=?", (vid, tela, chave)).fetchone():
        raise NaoEncontrado("Anotação não encontrada")
    quando = arr._agora() if validado else None
    con.execute("UPDATE anotacoes SET validado=?, validado_em=?, validado_por=? WHERE versao_id=? AND tela=? AND chave=?",
                (1 if validado else 0, quando, autor if validado else None, vid, tela, chave))
    arr.auditar(con, autor, vid, "validar_anotacao" if validado else "desvalidar_anotacao", f"{tela} {chave}")
    return {"validado": validado, "validado_em": quando, "validado_por": autor if validado else None}


# ---------------------------------------------------------------- visão geral: todas as anotações de uma versão, com o caminho
CASAS = {"R$ mil": 0, "%": 1, "R$/kg": 2, "R$/litro": 2, "R$/uni": 2}                       # como os valores aparecem nas telas
SECOES_RESULTADO = (("safra", "Resultado da safra"), ("anual", "Resultado anual"), ("estoque", "Estoque"))


def _alvos(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[str, dict]]:
    """Por tela e chave: caminho, nome da linha, ano, unidade e o valor de hoje."""
    from . import dre as svc_dre
    from . import resultado as svc_res

    alvos: Dict[str, Dict[str, dict]] = {"resultado": {}, "dre": {}}
    res = svc_res.calcular(con, vid)
    for cid, nome, blocos in [(c["id"], c["nome"], c) for c in res["culturas"]] + [("todas", "Todos os produtos", res["consolidado"])]:
        for bloco, secao in SECOES_RESULTADO:
            for l in blocos.get(bloco, []):
                for ano, v in l["valores"].items():
                    alvos["resultado"][f"{cid}|{l['id']}|{ano}"] = {
                        "caminho": ["Resultado por produto", nome, secao], "linha": l["nome"], "ano": int(ano), "unidade": l["unidade"], "valor": v,
                        "modulo": "resultado", "cultura": str(cid)}
    d = svc_dre.ler(con, vid)
    por_cod = {l["codigo"]: l for l in d["linhas"]}
    for l in d["linhas"]:
        trilha, pai = [], l["pai"]
        while pai and pai in por_cod:
            trilha.insert(0, por_cod[pai]["nome"])
            pai = por_cod[pai]["pai"]
        for ano, v in l["valores"].items():
            alvos["dre"][f"{l['codigo']}|{ano}"] = {"caminho": ["DRE"] + trilha, "linha": l["nome"], "ano": int(ano), "unidade": l["unidade"],
                                                    "valor": v, "modulo": "dre", "cultura": ""}
    from . import balanco as svc_bp
    b = svc_bp.ler(con, vid)
    alvos["balanco"] = {}
    por_cod = {l["codigo"]: l for l in b["linhas"]}
    for l in b["linhas"]:
        trilha, pai = [], l["pai"]
        while pai and pai in por_cod:
            trilha.insert(0, por_cod[pai]["nome"])
            pai = por_cod[pai]["pai"]
        for ano, v in l["valores"].items():
            alvos["balanco"][f"{l['codigo']}|{ano}"] = {"caminho": ["Balanço patrimonial"] + trilha, "linha": l["nome"], "ano": int(ano),
                                                        "unidade": "R$ mil", "valor": v, "modulo": "balanco", "cultura": ""}
    return alvos


def listar_todas(con: sqlite3.Connection, vid: int) -> list:
    arr.obter_versao(con, vid)
    alvos = _alvos(con, vid)
    nomes_tela = {"resultado": "Resultado por produto", "dre": "DRE", "balanco": "Balanço patrimonial"}
    saida = []
    for r in con.execute("SELECT * FROM anotacoes WHERE versao_id=? ORDER BY atualizado_em DESC, tela, chave", (vid,)):
        a = alvos.get(r["tela"], {}).get(r["chave"])
        item = {"tela": r["tela"], "chave": r["chave"], "cor": r["cor"], "comentario": r["comentario"], "autor": r["autor"],
                "atualizado_em": r["atualizado_em"], "valor_anotado": r["valor"], "existe": a is not None,
                "validado": bool(r["validado"]), "validado_em": r["validado_em"], "validado_por": r["validado_por"]}
        if a:
            casas = CASAS.get(a["unidade"], 0)
            item.update(caminho=a["caminho"], linha=a["linha"], ano=a["ano"], unidade=a["unidade"], valor_atual=a["valor"],
                        modulo=a["modulo"], cultura=a["cultura"],
                        mudou=r["valor"] is not None and round(r["valor"], casas) != round(a["valor"], casas))
        else:                                                                  # a linha ou a cultura saiu da tela
            item.update(caminho=[nomes_tela.get(r["tela"], r["tela"])], linha="(esse número não existe mais na tela)", ano=None, unidade="",
                        valor_atual=None, modulo=r["tela"], cultura="", mudou=False)
        saida.append(item)
    return saida
