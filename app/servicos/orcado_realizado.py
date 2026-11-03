"""Orçado × realizado do mesmo período.

O realizado vem de um período do ano em andamento (ex.: janeiro a junho, ou abril a junho) e o orçamento é anual. Duas leituras:

  * DRE: o orçado do período é o orçado do ano × (meses do período ÷ 12). O "falta realizar" é o orçado do ano menos o realizado.
  * Produtos: com a quantidade vendida informada, o sistema calcula o preço médio e o custo unitário realizados e compara com os orçados.
    A diferença de resultado de cada produto se separa em três efeitos (todos em R$, na base receita bruta − custo do produto vendido):
        volume = (quantidade realizada − quantidade orçada proporcional ao período) × (preço orçado − custo unitário orçado)
        preço  = quantidade realizada × (preço médio realizado − preço orçado)
        custo  = − quantidade realizada × (custo unitário realizado − custo unitário orçado)
    e somam exatamente a diferença entre o resultado realizado e o orçado proporcional do produto.
  * Ponte do lucro: do lucro orçado do período ao realizado, com os efeitos dos produtos e o restante da DRE (soma exata).
Pecuária: o realizado só tem o total do grupo, então as quantidades aparecem sem preço médio.
"""
from __future__ import annotations

import sqlite3
import unicodedata
from typing import Dict, List, Optional

from . import arrendamentos as arr
from . import realizado as svc_real
from .arrendamentos import Invalido

FORMULAS_PCT = {"DS028": ("DS027", "DS018"), "DS045": ("DS044", "DS018"), "DS049": ("DS048", "DS018"), "DS063": ("DS062", "DS018")}
# linhas que somam o lucro líquido (todas as outras da DRE são subtotais ou detalhes delas)
PONTE = [("DS007", "Receita bruta (demais)"), ("DS015", "Deduções da receita"), ("DS020", "Custo do produto vendido (demais)"), ("DS030", "Outras despesas operacionais"),
         ("DS047", "Depreciação"), ("DS051", "Resultado financeiro"), ("DS054", "Outras receitas não operacionais"), ("DS060", "CSLL e IRPJ")]
PAI_REC_CULTURA, PAI_CPV_CULTURA = "DS008", "DS020"


def _norm(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if not unicodedata.combining(c)).strip().lower()


def _g(serie: dict, ano: int) -> float:
    v = serie.get(ano, serie.get(str(ano)))
    return float(v) if v is not None else 0.0


def _validar_periodo(v: dict, p: dict) -> None:
    """O orçamento precisa cobrir o ano do realizado; senão os períodos não são comparáveis."""
    anos = arr.anos_da_versao(v)
    if p["ano"] not in anos:
        raise Invalido(f"Períodos diferentes: o orçamento '{v['nome']}' cobre {anos[0]} a {anos[-1]} e o realizado escolhido é de {p['ano']}. Escolha um orçamento que tenha o ano {p['ano']}.")


def comparar(con: sqlite3.Connection, versao_id: int, ano: int) -> dict:
    from . import balanco as svc_bp
    from . import dre as svc_dre
    from . import resultado as svc_res
    p = svc_real.periodo_do_ano(con, ano)
    if not p or not p["DRE"]:
        raise Invalido(f"Não há DRE realizada importada de {ano}. Suba o arquivo na tela Realizado (aba Importações).")
    v = dict(arr.obter_versao(con, versao_id))
    _validar_periodo(v, p)
    vid, ano = v["id"], p["ano"]
    dur = p["meses"] - p["mes_inicio"] + 1
    f = dur / 12.0
    periodo = svc_real._rotulo_periodo(p["mes_inicio"], p["meses"])
    cab = {"versao": {"id": vid, "nome": v["nome"], "status": v["status"], "tipo": v["tipo"], "ano_base": v["ano_base"], "horizonte": v["horizonte"]}, "ano": ano, "periodo": periodo,
           "meses": dur, "fracao": f, "parcial": dur < 12 or p["meses"] < 12, "arquivo": p.get("arquivo", "")}

    # ---- DRE
    d = svc_dre.ler(con, vid)
    real = p["DRE"]
    orc = {l["codigo"]: _g(l["valores"], ano) for l in d["linhas"]}
    linhas: List[dict] = []
    for l in d["linhas"]:
        cod = l["codigo"]
        if l["unidade"] == "%":
            num, den = FORMULAS_PCT.get(cod, (None, None))
            r = (real[num] / real[den] * 100.0) if (num in real and den in real and real[den]) else None
            linhas.append({"codigo": cod, "nome": l["nome"], "nivel": l["nivel"], "unidade": "%", "orcado_ano": orc[cod], "orcado_periodo": orc[cod], "realizado": r,
                           "dif": (r - orc[cod]) if r is not None else None, "dif_pct": None, "falta": None})
            continue
        o_ano = orc[cod]
        o_per = o_ano * f
        r = real.get(cod)
        if not o_ano and not r:
            continue
        dif = (r - o_per) if r is not None else None
        linhas.append({"codigo": cod, "nome": l["nome"], "nivel": l["nivel"], "unidade": "R$ mil", "orcado_ano": o_ano, "orcado_periodo": o_per, "realizado": r,
                       "dif": dif, "dif_pct": (dif / abs(o_per) * 100.0) if (dif is not None and o_per) else None, "falta": (o_ano - r) if r is not None else None})

    # ---- produtos (preço médio e efeitos)
    quant = {x["cultura_id"]: x["quantidade"] for x in con.execute("SELECT cultura_id, quantidade FROM realizado_quantidades WHERE ano=?", (ano,))}
    est = {r["codigo"]: r for r in con.execute("SELECT codigo, nome, pai FROM dre_linhas WHERE nivel='sintetica' AND ativa=1")}
    por_nome = {(e["pai"], _norm(e["nome"])): c for c, e in est.items()}
    res = svc_res.calcular(con, vid)
    produtos: List[dict] = []
    ef = {"volume": 0.0, "preco": 0.0, "custo": 0.0}
    rb_prod_diff = cpv_prod_diff = 0.0
    for c in res["culturas"]:
        serie = {l["id"]: l["valores"] for l in c["anual"]}
        q_o = _g(serie.get("comercializada", {}), ano)
        rb_o, cpv_o = _g(serie.get("receita_bruta_anual", {}), ano), -_g(serie.get("cpv", {}), ano)
        q_r = quant.get(c["id"])
        un = next((x["unidade"] for x in con.execute("SELECT unidade FROM culturas WHERE id=?", (c["id"],))), "")
        if not q_o and not q_r:
            continue
        rec = por_nome.get((PAI_REC_CULTURA, _norm(c["nome"])))
        cus = por_nome.get((PAI_CPV_CULTURA, _norm(c["nome"])))
        rev_r = real.get(rec) if rec else None
        cpv_r = -real[cus] if (cus and cus in real) else None
        q_p = q_o * f
        row = {"id": c["id"], "nome": c["nome"], "unidade": un, "qtd_orcada": q_o, "qtd_periodo_orcada": q_p, "qtd_real": q_r,
               "pct_ano": (q_r / q_o * 100.0) if (q_r is not None and q_o) else None, "falta_qtd": (q_o - q_r) if q_r is not None else None,
               "preco_orcado": (rb_o * 1000.0 / q_o) if q_o else None, "custo_orcado": (cpv_o * 1000.0 / q_o) if q_o else None,
               "receita_real": rev_r, "custo_real": cpv_r, "preco_real": None, "custo_unit_real": None, "efeitos": None,
               "motivo": ""}
        if q_r and rev_r is not None and cpv_r is not None and q_o:
            p_o, c_o = row["preco_orcado"], row["custo_orcado"]
            p_r, c_r = rev_r * 1000.0 / q_r, cpv_r * 1000.0 / q_r
            e_vol, e_pre, e_cus = (q_r - q_p) * (p_o - c_o) / 1000.0, q_r * (p_r - p_o) / 1000.0, -q_r * (c_r - c_o) / 1000.0
            row.update(preco_real=p_r, custo_unit_real=c_r, efeitos={"volume": e_vol, "preco": e_pre, "custo": e_cus},
                       margem_orcada_periodo=q_p * (p_o - c_o) / 1000.0, margem_real=rev_r - cpv_r, margem_orcada_qtd_real=q_r * (p_o - c_o) / 1000.0)
            ef["volume"] += e_vol; ef["preco"] += e_pre; ef["custo"] += e_cus
            rb_prod_diff += rev_r - f * rb_o
            cpv_prod_diff += -cpv_r + f * cpv_o
            maior = max(row["efeitos"].items(), key=lambda kv: abs(kv[1]))
            row["motivo"] = {"volume": "quantidade vendida", "preco": "preço médio", "custo": "custo por unidade"}[maior[0]]
        elif q_r and (rev_r is None or cpv_r is None):
            row["motivo"] = "sem receita e custo próprios do produto no realizado (só o total do grupo)"
        produtos.append(row)

    # ---- ponte do lucro
    lucro_o = sum(orc.get(cod, 0.0) for cod, _ in PONTE) * f
    lucro_r = sum(real.get(cod, 0.0) for cod, _ in PONTE)
    itens = []
    if produtos and any(x["efeitos"] for x in produtos):
        itens += [("Produtos · quantidade vendida", ef["volume"]), ("Produtos · preço médio de venda", ef["preco"]), ("Produtos · custo por unidade", ef["custo"])]
    for cod, nome in PONTE:
        dif = real.get(cod, 0.0) - orc.get(cod, 0.0) * f
        if cod == "DS007":
            dif -= rb_prod_diff
        elif cod == "DS020":
            dif -= cpv_prod_diff
        itens.append((nome, dif))
    ponte = {"orcado": lucro_o, "realizado": lucro_r, "itens": [{"nome": n, "valor": x} for n, x in itens if abs(x) > 0.05],
             "soma": lucro_o + sum(x for _, x in itens)}

    # ---- balanço (data final do período × 31/12 do orçamento)
    b = svc_bp.ler(con, vid)
    balanco = []
    for l in b["linhas"]:
        if l.get("calculo") == "diferenca":
            continue
        o, r = _g(l["valores"], ano), p["BP"].get(l["codigo"])
        if not o and not r:
            continue
        balanco.append({"codigo": l["codigo"], "nome": l["nome"], "nivel": l["nivel"], "orcado_ano": o, "realizado": r, "dif": (r - o) if r is not None else None})

    return {**cab, "dre": linhas, "produtos": produtos, "ponte": ponte, "balanco": balanco, "resumo": _resumo(cab, orc, real, f, produtos, ponte, ef)}


def _resumo(cab: dict, orc: dict, real: dict, f: float, produtos: List[dict], ponte: dict, ef: dict) -> List[str]:
    mi = lambda x: "R$ " + f"{abs(x):,.0f}".replace(",", ".") + " mil"
    out: List[str] = []
    rb_o, rb_r = orc.get("DS007", 0.0), real.get("DS007")
    if rb_r is not None and rb_o:
        out.append(f"Receita bruta: você realizou {mi(rb_r)} em {cab['periodo']} ({rb_r / rb_o * 100:.0f}% do orçado do ano, de {mi(rb_o)}). O período representa {f * 100:.0f}% do ano, então "
                   + ("o ritmo está abaixo do orçado." if rb_r / rb_o < f - 0.005 else "o ritmo está dentro ou acima do orçado.") + f" Faltam {mi(max(rb_o - rb_r, 0.0))} para o orçado do ano.")
    lo, lr = ponte["orcado"], ponte["realizado"]
    sinal = "acima" if lr >= lo else "abaixo"
    out.append(f"Lucro líquido: o realizado do período foi {'-' if lr < 0 else ''}{mi(lr)}, {mi(lr - lo)} {sinal} do orçado proporcional ao período ({'-' if lo < 0 else ''}{mi(lo)}).")
    maiores = sorted(ponte["itens"], key=lambda x: abs(x["valor"]), reverse=True)[:3]
    if maiores:
        out.append("Principais motivos: " + "; ".join(f"{x['nome'].lower()} ({'+' if x['valor'] > 0 else '-'}{mi(x['valor'])})" for x in maiores) + ".")
    for x in produtos:
        if x["qtd_real"] is not None and x["qtd_orcada"]:
            falta = max(x["qtd_orcada"] - x["qtd_real"], 0.0)
            txt = f"{x['nome']}: vendeu {x['qtd_real']:,.0f} {x['unidade']} de {x['qtd_orcada']:,.0f} orçados no ano ({x['pct_ano']:.0f}%); faltam {falta:,.0f}.".replace(",", ".")
            if x["preco_real"] is not None:
                pr, po = f"{x['preco_real']:.2f}".replace(".", ","), f"{x['preco_orcado']:.2f}".replace(".", ",")
                txt += f" Preço médio R$ {pr}/{x['unidade']} (orçado R$ {po})."
            out.append(txt)
    return out
