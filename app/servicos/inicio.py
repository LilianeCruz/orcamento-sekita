"""Tela inicial: andamento do preenchimento das premissas do orçamento aberto, próximos passos e última alteração.
Cada grupo de premissas tem verificações simples (já há valores lançados?). Grupo concluído = todas feitas; não iniciado = nenhuma; senão mostra as pendências."""
from __future__ import annotations

import sqlite3
from typing import List, Optional

from . import arrendamentos as arr

# (grupo, módulo do menu, [(título do passo, detalhe, módulo, consulta que retorna >0 quando está feito)])
V = "versao_id=?"
GRUPOS = [
    ("Produção", "areas", [
        ("Informar as áreas por produto", "Premissas de produção · Áreas", "areas", f"SELECT COUNT(*) FROM areas_cultura WHERE {V} AND area_ha>0"),
        ("Informar a produtividade", "Premissas de produção · Produtividade", "produtividade", f"SELECT COUNT(*) FROM produtividade WHERE {V} AND valor>0"),
        ("Informar os preços de venda", "Premissas de produção · Preços", "precos", f"SELECT COUNT(*) FROM precos_venda WHERE {V} AND preco>0"),
        ("Informar os custos variáveis", "Premissas de produção · Custos variáveis", "variaveis", f"SELECT COUNT(*) FROM custos_cultura WHERE {V}")]),
    ("Investimentos", "invest", [
        ("Lançar os investimentos", "Premissas de investimento · valores ainda não preenchidos", "invest", f"SELECT COUNT(*) FROM investimento_valores WHERE {V} AND valor<>0")]),
    ("DRE", "premdem", [
        ("Preencher as premissas da DRE", "Premissas da DRE · valores ainda não preenchidos", "premdem",
         f"SELECT (SELECT COUNT(*) FROM dre_padrao WHERE {V} AND valor<>0) + (SELECT COUNT(*) FROM premissas_dem_valores WHERE {V} AND valor<>0)")]),
    ("Balanço", "capgiro", [
        ("Definir o prazo de recebimento de clientes", "Premissas de balanço · Contas a receber", "capgiro", f"SELECT COUNT(*) FROM capital_giro WHERE {V} AND campo='dias_receber' AND valor>0"),
        ("Definir o prazo de pagamento a fornecedores", "Premissas de balanço · Fornecedores", "capgiro", f"SELECT COUNT(*) FROM capital_giro WHERE {V} AND campo='dias_fornecedores' AND valor>0"),
        ("Definir o caixa mínimo", "Premissas de balanço · Caixa mínimo", "capgiro", f"SELECT COUNT(*) FROM capital_giro WHERE {V} AND campo IN ('pct_caixa','saldo_caixa') AND valor>0")]),
    ("Dividendos", "patrimonio", [
        ("Definir política de dividendos", "Premissas ainda não preenchidas", "patrimonio", f"SELECT COUNT(*) FROM patrimonio_valores WHERE {V} AND valor<>0")]),
    ("Dívidas", "dividas", [
        ("Vincular a base de dívidas", "Premissas de dívidas · importação de endividamento", "dividas", "SELECT COUNT(*) FROM versoes WHERE id=? AND divida_importacao_id IS NOT NULL"),
        ("Revisar captações e financiamentos", "Premissas de dívidas · novas captações", "dividas",
         f"SELECT (SELECT COUNT(*) FROM novas_captacoes WHERE {V}) + (SELECT COUNT(*) FROM financiamento_premissas WHERE {V} AND valor>0)")]),
]

# (trecho do nome da ação na auditoria, rótulo da tela, módulo); a primeira que casar vale
ACOES = [("transportadora", "Premissas de transportadora", "transp"), ("premissa_dem", "Premissas da DRE", "premdem"), ("dre_padrao", "Premissas da DRE", "premdem"),
         ("capital_giro", "Premissas de balanço", "capgiro"), ("investimento", "Premissas de investimento", "invest"), ("patrimonio", "Premissas de dividendos", "patrimonio"),
         ("captacao", "Premissas de dívidas", "dividas"), ("divida", "Premissas de dívidas", "dividas"), ("financiamento", "Premissas de dívidas", "dividas"),
         ("preco", "Premissas de produção · Preços", "precos"), ("produtividade", "Premissas de produção · Produtividade", "produtividade"),
         ("pecuaria", "Premissas de produção · Produtividade", "produtividade"), ("rebanho", "Premissas de produção · Produtividade", "produtividade"),
         ("custo", "Premissas de produção · Custos variáveis", "variaveis"), ("area", "Premissas de produção · Áreas", "areas"),
         ("anota", "Anotações", "anotacoes"), ("aprovar", "Orçamentos", "orcamentos")]


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    grupos, passos, feitos, total = [], [], 0, 0
    for nome, modulo, checks in GRUPOS:
        pend = []
        for titulo, detalhe, mod, sql in checks:
            total += 1
            if con.execute(sql, (vid,) * sql.count("?")).fetchone()[0] > 0:
                feitos += 1
            else:
                pend.append({"titulo": titulo, "detalhe": detalhe, "modulo": mod})
        n = len(checks)
        estado = "concluido" if not pend else ("nao_iniciado" if len(pend) == n else "pendencias")
        grupos.append({"nome": nome, "modulo": modulo, "estado": estado, "pendencias": len(pend)})
        passos += pend
    ultima: Optional[dict] = None
    r = con.execute("SELECT quando, acao, detalhe FROM auditoria WHERE versao_id=? AND acao NOT IN ('copiar_versao','criar_versao') ORDER BY id DESC LIMIT 1", (vid,)).fetchone()
    if r:
        rot, mod = next(((t, m) for k, t, m in ACOES if k in r["acao"]), ("Orçamento", "orcamentos"))
        ultima = {"quando": r["quando"], "tela": rot, "modulo": mod, "detalhe": r["detalhe"] or ""}
    from . import anotacoes as svc_not
    notas = svc_not.listar_todas(con, vid)
    pend = [n for n in notas if not n["validado"]]
    anotacoes = {"total": len(notas), "validadas": len(notas) - len(pend), "pendentes": len(pend), "alteradas": sum(1 for n in pend if n.get("mudou")),
                 "vermelhas": sum(1 for n in pend if n["cor"] == "vermelho")}
    atual = con.execute("SELECT MAX(quando) FROM auditoria WHERE versao_id=?", (vid,)).fetchone()[0]
    return {"versao": v, "atualizado_em": atual or v.get("criado_em"), "percentual": round(feitos / total * 100) if total else 0,
            "concluidos": sum(1 for g in grupos if g["estado"] == "concluido"), "grupos": grupos, "passos": passos, "ultima": ultima, "anotacoes": anotacoes}
