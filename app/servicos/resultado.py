"""Resultado por produto: calcula, para cada produto de 'Áreas por produto', o resultado da safra e o resultado anual
com estoque, a partir de área, produtividade, preço de venda, custos variáveis diretos e premissas de produtos.

Regras (combinadas com o usuário):
  * valores em R$; quantidades em kg (ou litro); preço em R$/kg;
  * só custos diretos entram (as rubricas indiretas ficam de fora);
  * descarte e dedução de receita são os do ANO DA VENDA, inclusive para o estoque vendido no ano seguinte;
  * ordem das quantidades: produção - descarte - sementes salvas = quantidade comercializada (safra e anual usam a mesma conta);
  * o estoque (estocada) sai do que sobra da produção depois das sementes e é guardado SEM descarte (o descarte é o do ano da venda);
  * estoque inicial = o estoque de passagem do ano anterior informado em Premissas de produtos (zero se não houver), com o custo médio informado; o estoque do ano anterior é vendido ao preço do ano da venda e custa o custo médio do ano em que foi produzido;
  * premissa ou preço faltando: assume zero e avisa;
  * produtos sem área (pecuária, leite): a quantidade produzida do ano é a própria produtividade lançada (o leite vem do bloco
    animais × kg por animal × dias) e os custos variáveis diretos são em R$ por kg (ou litro, ou unidade) produzido.
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from . import extras
from .arrendamentos import Invalido

MIL = 1000.0
TODAS = "Todos os produtos"


def quantidades_sem_area(con: sqlite3.Connection, vid: int) -> Dict[int, Dict[int, float]]:
    """Quantidade produzida por ano dos produtos sem área (pecuária): a produtividade lançada; no leite, o total anual do bloco de animais."""
    areas = {r["cultura_id"] for r in con.execute("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", (vid,))}
    ids = [i for i in extras.ids_com_produtividade(con, vid) if i not in areas]
    out: Dict[int, Dict[int, float]] = {i: {} for i in ids}
    for r in con.execute("SELECT cultura_id, ano, valor FROM produtividade WHERE versao_id=?", (vid,)):
        if r["cultura_id"] in out:
            out[r["cultura_id"]][r["ano"]] = r["valor"]
    for r in con.execute("SELECT id FROM culturas WHERE estoque_destino='gado'"):          # rebanho: a "produção" do ano são as vendas lançadas na movimentação
        if r["id"] in out:
            out[r["id"]] = {x["ano"]: x["valor"] for x in con.execute("SELECT ano, valor FROM rebanho_valores WHERE versao_id=? AND cultura_id=? AND campo='vendas'", (vid, r["id"]))}
    leite = extras._leite_id(con, vid)
    if leite in out:
        from . import pecuaria as svc_pec
        out[leite] = dict(next(l for l in svc_pec.ler(con, vid)["linhas"] if l["id"] == "producao_ano")["valores"])
    return out


def _carregar(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    sem_area = quantidades_sem_area(con, vid)
    ids = list(dict.fromkeys([r["cultura_id"] for r in con.execute("SELECT cultura_id FROM culturas_da_versao WHERE versao_id=?", (vid,))] + list(sem_area)))
    culturas = [dict(r, sem_area=r["id"] in sem_area) for r in con.execute(
        f"SELECT c.* FROM culturas c WHERE c.id IN ({','.join('?' * len(ids)) or 'NULL'}) ORDER BY c.grupo, c.nome COLLATE NOCASE", ids)]

    def por_cultura(sql: str, *args) -> Dict[int, Dict[int, float]]:
        d: Dict[int, Dict[int, float]] = {}
        for r in con.execute(sql, args):
            d.setdefault(r[0], {})[r[1]] = r[2]
        return d

    dados = {
        "versao": v, "anos": arr.anos_da_versao(v), "culturas": culturas,
        "area": por_cultura("SELECT cultura_id, ano, area_ha FROM areas_cultura WHERE versao_id=?", vid),
        "prod": {**por_cultura("SELECT cultura_id, ano, valor FROM produtividade WHERE versao_id=?", vid), **sem_area},
        "preco": por_cultura("SELECT cultura_id, ano, preco FROM precos_venda WHERE versao_id=?", vid),
        "custo": por_cultura(
            "SELECT cc.cultura_id, cc.ano, SUM(cc.valor) FROM custos_cultura cc JOIN grupos_custo g ON g.id=cc.grupo_id "
            "WHERE cc.versao_id=? AND g.classificacao='direto' GROUP BY cc.cultura_id, cc.ano", vid),
        "prem": {}, "prem_vinculada": set(), "rebanho": {},
    }
    for r in con.execute("SELECT cultura_id, campo, ano, valor FROM rebanho_valores WHERE versao_id=?", (vid,)):
        dados["rebanho"].setdefault(r["cultura_id"], {}).setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    for r in con.execute("SELECT cultura_id, tipo, ano, valor FROM prem_valores WHERE versao_id=?", (vid,)):
        dados["prem"].setdefault((r["cultura_id"], r["tipo"]), {})[r["ano"]] = r["valor"]
    for r in con.execute("SELECT cultura_id, tipo FROM prem_itens WHERE versao_id=?", (vid,)):
        dados["prem_vinculada"].add((r["cultura_id"], r["tipo"]))
    return dados


def eh_rebanho(c: dict) -> bool:
    return c.get("estoque_destino") == "gado" and bool(c.get("sem_area"))


def _numeros_rebanho(c: dict, d: dict) -> dict:
    """Produto com estoque em gado de corte: a movimentação do rebanho (cabeças) manda no cálculo.

    custo médio = (valor do saldo inicial + custos variáveis diretos do ano, que incluem a compra dos animais) ÷ (saldo inicial + compras + nascimentos);
    vendas × custo médio é o CPV; mortes × custo médio é perda que também vai para o CPV; saldo final × custo médio é o estoque do balanço."""
    cid, anos = c["id"], d["anos"]
    rv = d["rebanho"].get(cid, {})
    g = lambda campo, a: rv.get(campo, {}).get(a, 0.0)
    pegar = lambda chave, a: d[chave].get(cid, {}).get(a, 0.0)
    ded_pct = lambda a: d["prem"].get((cid, "deducao_receita"), {}).get(a, 0.0) / 100.0
    chaves = ("area", "prod_ha", "producao", "sementes", "disponivel", "descarte", "comerc_safra", "preco", "rb_safra", "ded_pct", "ded_safra", "rl_safra", "custo_ha",
              "custo_total", "mc", "estocada", "estoque_anterior", "vender", "perda", "comerc", "rec_producao", "rec_estoque", "rb", "ded", "rl", "custo_medio", "cpv_producao",
              "cpv_estoque", "cpv", "mb", "estoque_valor", "perda_safra", "producao_anual", "estoque_pct", "custo_safra", "estoque_semente", "custo_semente_ant", "qtd_prod",
              "reb_ini", "reb_compras", "reb_nasc", "reb_mortes", "reb_vendas", "reb_fim", "reb_valor_ini", "reb_custos", "reb_custo_medio")
    r: Dict[str, Dict[int, float]] = {k: {} for k in chaves}
    ini, valor_ini = g("saldo_ini", anos[0]), g("valor_ini", anos[0])
    limitou: List[int] = []
    for a in anos:
        compras, nasc, mortes, vendas, preco, ct = g("compras", a), g("nascimentos", a), g("mortes", a), g("vendas", a), pegar("preco", a), pegar("custo", a)
        cab = ini + compras + nasc
        cm = (valor_ini + ct) / cab if cab > 0 else 0.0
        mortes_ef = min(mortes, cab)
        disponivel = max(cab - mortes_ef, 0.0)
        vendas_ef = min(vendas, disponivel)
        if vendas > disponivel + 1e-9:
            limitou.append(a)
        fim = disponivel - vendas_ef
        rb = vendas_ef * preco
        dd = -rb * ded_pct(a)
        rl = rb + dd
        cpv = -(vendas_ef + mortes_ef) * cm
        est = fim * cm
        vals = dict(area=0.0, prod_ha=0.0, producao=vendas_ef, sementes=0.0, disponivel=disponivel, descarte=0.0, comerc_safra=vendas_ef, preco=preco, rb_safra=rb,
                    ded_pct=ded_pct(a) * 100, ded_safra=dd, rl_safra=rl, custo_ha=0.0, custo_total=ct, mc=rl + cpv, estocada=fim, estoque_anterior=ini, vender=vendas_ef,
                    perda=mortes_ef, comerc=vendas_ef, rec_producao=rb, rec_estoque=0.0, rb=rb, ded=dd, rl=rl, custo_medio=cm, cpv_producao=cpv, cpv_estoque=0.0, cpv=cpv,
                    mb=rl + cpv, estoque_valor=est, perda_safra=0.0, producao_anual=vendas_ef, estoque_pct=(fim / cab * 100.0 if cab > 0 else 0.0), custo_safra=-cpv,
                    estoque_semente=0.0, custo_semente_ant=0.0, qtd_prod=vendas_ef, reb_ini=ini, reb_compras=compras, reb_nasc=nasc, reb_mortes=mortes_ef, reb_vendas=vendas_ef,
                    reb_fim=fim, reb_valor_ini=valor_ini, reb_custos=ct, reb_custo_medio=cm)
        for k, x in vals.items():
            r[k][a] = x
        ini, valor_ini = fim, est
    r["_limitou"] = limitou                                    # type: ignore[assignment]
    return r


def _numeros(c: dict, d: dict) -> dict:
    """Séries numéricas (em R$ e kg) da cultura, ano a ano."""
    if eh_rebanho(c):
        return _numeros_rebanho(c, d)
    cid, anos = c["id"], d["anos"]
    pegar = lambda chave, a: d[chave].get(cid, {}).get(a, 0.0)
    prem = lambda tipo, a: d["prem"].get((cid, tipo), {}).get(a, 0.0)
    campos = ("area", "prod_ha", "producao", "sementes", "disponivel", "descarte", "comerc_safra", "preco", "rb_safra", "ded_pct",
              "ded_safra", "rl_safra", "custo_ha", "custo_total", "mc", "estocada", "estoque_anterior", "vender", "perda", "comerc",
              "rec_producao", "rec_estoque", "rb", "ded", "rl", "custo_medio", "cpv_producao", "cpv_estoque", "cpv", "mb", "estoque_valor", "perda_safra", "producao_anual", "estoque_pct", "custo_safra", "estoque_semente", "custo_semente_ant", "qtd_prod")
    r: Dict[str, Dict[int, float]] = {k: {} for k in campos}
    est_ant, cm_ant, sem_ant = prem("estoque_ant", anos[0] - 1), prem("custo_estoque_ant", anos[0] - 1), 0.0       # estoque de passagem do ano anterior (zero se não informado)
    limitou: List[int] = []
    for a in anos:
        area, pha, preco = pegar("area", a), pegar("prod", a), pegar("preco", a)
        producao = pha if c.get("sem_area") else area * pha            # sem área (pecuária): a produtividade lançada já é a quantidade do ano
        sementes = prem("sementes", a)
        base = max(producao - sementes, 0.0)                    # produção menos sementes: teto do que pode ser estocado e base do custo médio
        desc, ded = prem("descarte", a) / 100.0, prem("deducao_receita", a) / 100.0
        # ---- resultado da safra: toda a produção do ano vista como vendida no próprio ano (produção - descarte - sementes)
        perda_s = producao * desc
        com_s = max(producao - perda_s - sementes, 0.0)
        rb_s = com_s * preco
        dd_s = -rb_s * ded
        rl_s = rb_s + dd_s
        cha = pegar("custo", a)
        ct = cha * (producao if c.get("sem_area") else area)            # sem área: custo em R$ por kg/litro/unidade produzido
        # ---- resultado anual: o que de fato é vendido no ano (produção do ano - estocada + estoque do ano anterior)
        est_pedida = prem("estoque", a)
        est = min(est_pedida, base)
        if est_pedida > base + 1e-9:
            limitou.append(a)
        vender = producao - est + est_ant                       # bruto: antes do descarte e das sementes
        perda = vender * desc
        qtd_prod = max((producao - est) * (1 - desc) - sementes, 0.0)   # da produção do ano: descarte primeiro, depois as sementes
        comerc = qtd_prod + est_ant * (1 - desc)
        rec_prod, rec_est = qtd_prod * preco, est_ant * (1 - desc) * preco
        rb = rec_prod + rec_est
        dd = -rb * ded
        rl = rb + dd
        cm = ct / producao if producao > 0 else 0.0             # custo médio: custo total de produção do ano / volume produzido (como na planilha)
        custo_safra = cm * base                                 # custos variáveis diretos "descontada a semente"
        cpv_p, cpv_e = -(base - est) * cm, -est_ant * cm_ant
        vals = dict(area=area, prod_ha=pha, producao=producao, sementes=sementes, disponivel=base, descarte=desc * 100, perda_safra=perda_s, comerc_safra=com_s,
                    preco=preco, rb_safra=rb_s, ded_pct=ded * 100, ded_safra=dd_s, rl_safra=rl_s, custo_ha=cha, custo_total=ct,
                    mc=rl_s - custo_safra, estocada=est, estoque_anterior=est_ant, vender=vender, perda=perda, comerc=comerc,
                    rec_producao=rec_prod, rec_estoque=rec_est, rb=rb, ded=dd, rl=rl, custo_medio=cm, cpv_producao=cpv_p,
                    cpv_estoque=cpv_e, cpv=cpv_p + cpv_e, mb=rl + cpv_p + cpv_e, estoque_valor=est * cm, producao_anual=producao, estoque_pct=(est / base * 100.0 if base > 0 else 0.0),
                    custo_safra=custo_safra, estoque_semente=sementes * cm, custo_semente_ant=-sem_ant * cm_ant, qtd_prod=qtd_prod)
        for k, x in vals.items():
            r[k][a] = x
        est_ant, cm_ant, sem_ant = est, cm, sementes
    r["_limitou"] = limitou                                    # type: ignore[assignment]
    return r


def _L(id_: str, nome: str, unidade: str, serie: Dict[int, float], estilo: str = "", opcional: bool = False) -> dict:
    escala = MIL if unidade == "R$ mil" else 1.0
    return {"id": id_, "nome": nome, "unidade": unidade, "estilo": estilo, "opcional": opcional,
            "valores": {a: v / escala for a, v in serie.items()}}


def _pct(num: Dict[int, float], den: Dict[int, float]) -> Dict[int, float]:
    return {a: (num[a] / den[a] * 100.0 if den[a] else 0.0) for a in num}


def _por_ha(serie: Dict[int, float], area: Dict[int, float]) -> Dict[int, float]:
    return {a: (serie[a] / area[a] if area[a] else 0.0) for a in serie}


def _blocos(n: dict, un: Optional[str], nome: str = "") -> dict:
    """Linhas no formato da planilha de orçamento (bloco do Alho). un = kg/litro do produto; None = consolidado (sem quantidades).
    'opcional' = a tela esconde a linha quando todos os anos são zero (descarte)."""
    safra: List[dict] = [_L("area", "Área plantada", "ha", n["area"], "dim")]
    if un:
        safra += [_L("produtividade", "Produtividade", f"{un}/ha", n["prod_ha"]), _L("producao", "Volume produzido", un, n["producao"]),
                  _L("descarte", "Descarte", "%", n["descarte"], "dim", True),
                  _L("perda_safra", "(–) Perda por descarte", un, n["perda_safra"], "dim", True),
                  _L("sementes", "(–) Sementes salvas", un, n["sementes"], "dim"),
                  _L("comerc_safra", "Quantidade disponível para venda no ano", un, n["comerc_safra"]),
                  _L("preco", "Preço", f"R$/{un}", n["preco"], "dim")]
    safra += [
        _L("receita_bruta_safra", "Receita bruta de produção", "R$ mil", n["rb_safra"]),
        _L("deducoes_safra", "(–) Deduções da receita", "R$ mil", n["ded_safra"]),
        _L("deducoes_pct", "% da receita", "%", n["ded_pct"], "dim"),
        _L("receita_liquida_safra", "Receita líquida", "R$ mil", n["rl_safra"], "total"),
        _L("receita_ha", "Receita líquida por hectare", "R$/ha", _por_ha(n["rl_safra"], n["area"]), "dim"),
        _L("custo_total", "Custos variáveis diretos totais (descontada a semente)", "R$ mil", {a: -v for a, v in n["custo_safra"].items()}),
        _L("custo_ha", "Custo total de produção por hectare", "R$/ha", _por_ha(n["custo_total"], n["area"]), "dim"),
        _L("margem_contribuicao", "Margem de contribuição", "R$ mil", n["mc"], "total"),
        _L("margem_ha", "Margem de contribuição por hectare", "R$/ha", _por_ha(n["mc"], n["area"]), "dim"),
        _L("margem_contribuicao_pct", "Margem de contribuição (%)", "%", _pct(n["mc"], n["rl_safra"]), "dim"),
    ]
    anual: List[dict] = []
    if un:
        anual += [_L("producao_anual", "Quantidade disponível para venda no ano", un, n["disponivel"]),
                  _L("estoque_pct", "Estoque de passagem", "%", n["estoque_pct"], "dim"),
                  _L("estocada", "Quantidade estocada", un, n["estocada"], "dim"),
                  _L("custo_medio", "Custo médio do produto produzido", f"R$/{un}", n["custo_medio"], "dim"),
                  _L("vendida_pct", "% da produção vendida no ano", "%", {a: 100.0 - v for a, v in n["estoque_pct"].items()}, "dim"),
                  _L("perda", "(–) Perda por descarte (do ano da venda)", un, n["perda"], "dim", True),
                  _L("comercializada", "Produção vendida no ano", un, n["qtd_prod"])]
    anual += [
        _L("receita_producao", "Receita de produção do ano", "R$ mil", n["rec_producao"]),
        _L("cpv_producao", "Custo de produção do produto vendido no ano", "R$ mil", n["cpv_producao"]),
        _L("receita_estoque", "Receita de produção do ano anterior (estoque)", "R$ mil", n["rec_estoque"]),
        _L("cpv_estoque", "Custo de produção do ano anterior (estoque)", "R$ mil", n["cpv_estoque"]),
    ]
    if un:
        anual.append(_L("custo_semente_ant", "Custo da semente produzida no ano anterior", "R$ mil", n["custo_semente_ant"], "dim"))
    anual += [
        _L("receita_bruta_anual", "Receita bruta anual", "R$ mil", n["rb"], "total"),
        _L("deducoes_anual", "(–) Deduções da receita (% do ano da venda)", "R$ mil", n["ded"]),
        _L("receita_liquida_anual", "Receita líquida anual", "R$ mil", n["rl"], "total"),
        _L("cpv", "Custo do produto vendido", "R$ mil", n["cpv"], "total"),
        _L("margem_bruta", "Margem bruta do período", "R$ mil", n["mb"], "total"),
        _L("margem_bruta_pct", "Margem bruta do período (%)", "%", _pct(n["mb"], n["rl"]), "dim"),
    ]
    estoque: List[dict] = [_L("estoque_valor", f"Estoque de {nome.lower()}" if nome else "Estoque do produto", "R$ mil", n["estoque_valor"])]
    if un:
        estoque += [_L("estoque_semente", f"Estoque de semente de {nome.lower()}" if nome else "Estoque de semente", "R$ mil", n["estoque_semente"]),
                    _L("vendida_anterior", "Estoque inicial (saldo de 31/12 do ano anterior, vendido no ano)", un, n["estoque_anterior"], "dim"),
                    _L("vendida_corrente", "Quantidade vendida do ano corrente", un, n["qtd_prod"], "dim"),
                    _L("comerc_total", "Quantidade total comercializada no ano", un, n["comerc"], "dim")]
    return {"safra": safra, "anual": anual, "estoque": estoque}


def _avisos_rebanho(c: dict, d: dict, n: dict) -> List[str]:
    anos, nome = d["anos"], c["nome"]
    anos_txt = lambda l: ", ".join(str(a) for a in l)
    out: List[str] = []
    sem_preco = [a for a in anos if n["reb_vendas"][a] > 0 and not n["preco"][a]]
    if sem_preco:
        out.append(f"{nome}: falta o preço de venda em {anos_txt(sem_preco)} (assumido zero)")
    sem_custo = [a for a in anos if n["reb_compras"][a] > 0 and not n["reb_custos"][a]]
    if sem_custo:
        out.append(f"{nome}: há compras sem custo variável lançado (compra dos animais) em {anos_txt(sem_custo)}")
    if n["_limitou"]:
        out.append(f"{nome}: as vendas são maiores que o rebanho disponível em {anos_txt(n['_limitou'])}; foram limitadas ao disponível")
    return out


def _avisos(c: dict, d: dict, n: dict) -> List[str]:
    if eh_rebanho(c):
        return _avisos_rebanho(c, d, n)
    cid, anos, nome = c["id"], d["anos"], c["nome"]
    com_area = [a for a in anos if n["area"][a] > 0]
    if not com_area:
        return []
    def anos_txt(lista): return ", ".join(map(str, lista))
    out = []
    for a_chave, rotulo in (("prod_ha", "a produtividade"), ("preco", "o preço de venda"), ("custo_ha", "o custo variável direto")):
        faltam = [a for a in com_area if not n[a_chave][a]]
        if faltam:
            out.append(f"{nome}: falta {rotulo} em {anos_txt(faltam)} (assumido zero)")
    for tipo, rotulo in (("descarte", "% descarte"), ("deducao_receita", "% dedução de receita")):
        if (cid, tipo) not in d["prem_vinculada"]:
            out.append(f"{nome}: sem a premissa {rotulo} (assumido zero)")
    if n["_limitou"]:
        out.append(f"{nome}: a quantidade estocada é maior que a disponível em {anos_txt(n['_limitou'])}; foi limitada ao disponível")
    return out


def calcular(con: sqlite3.Connection, vid: int) -> dict:
    d = _carregar(con, vid)
    anos = d["anos"]
    culturas, avisos = [], []
    soma = None
    gado = {a: 0.0 for a in anos}                                         # estoque (a custo) dos produtos marcados como gado de corte
    for c in d["culturas"]:
        n = _numeros(c, d)
        av = _avisos(c, d, n)
        avisos += av
        blocos = _blocos(n, c["unidade"], c["nome"])
        if eh_rebanho(c):
            un = c["unidade"]
            blocos["estoque"] += [_L("reb_ini", "Saldo inicial do rebanho", un, n["reb_ini"], "dim"), _L("reb_compras", "(+) Compras", un, n["reb_compras"], "dim"),
                                  _L("reb_nasc", "(+) Nascimentos", un, n["reb_nasc"], "dim"), _L("reb_mortes", "(–) Mortes", un, n["reb_mortes"], "dim"),
                                  _L("reb_vendas", "(–) Vendas", un, n["reb_vendas"], "dim"), _L("reb_fim", "Saldo final do rebanho", un, n["reb_fim"], "total"),
                                  _L("reb_custo_medio", "Custo médio por cabeça", "R$/" + un, n["reb_custo_medio"], "dim")]
        culturas.append({"id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "unidade": c["unidade"], "sem_area": bool(c.get("sem_area")), "rebanho": eh_rebanho(c),
                         **blocos, "avisos": av})
        base = {k: v for k, v in n.items() if k != "_limitou"}
        if c.get("estoque_destino") == "gado":
            for a in anos:
                gado[a] += n["estoque_valor"][a]
        if soma is None:
            soma = {k: dict(v) for k, v in base.items()}
        else:
            for k, v in base.items():
                if k in ("area", "rb_safra", "ded_safra", "rl_safra", "custo_total", "custo_safra", "estoque_semente", "custo_semente_ant", "qtd_prod", "mc", "rec_producao", "rec_estoque", "rb", "ded",
                         "rl", "cpv_producao", "cpv_estoque", "cpv", "mb", "estoque_valor"):
                    for a in anos:
                        soma[k][a] += v[a]
    consolidado = _blocos(soma, None) if soma else {"safra": [], "anual": [], "estoque": []}
    if soma:
        consolidado["estoque"] = consolidado["estoque"] + [_L("estoque_valor_gado", "Estoque de gado de corte", "R$ mil", gado)]      # já está dentro de estoque_valor (total)
    return {"versao": d["versao"], "anos": anos, "culturas": culturas, "consolidado": consolidado, "avisos": avisos}


CHAVES_COMPARACAO = ("receita_liquida_safra", "margem_contribuicao", "receita_bruta_anual", "receita_liquida_anual", "cpv", "margem_bruta")


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    ra, rb = calcular(con, a_id), calcular(con, b_id)
    anos = sorted(set(ra["anos"]) & set(rb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")

    def delta(x: float, y: float) -> dict:
        return {"a": x, "b": y, "delta": y - x, "pct": ((y - x) / abs(x) * 100.0) if x else None}

    def linhas(bloco_a: dict, bloco_b: dict) -> dict:
        la = {l["id"]: l for l in bloco_a["safra"] + bloco_a["anual"]}
        lb = {l["id"]: l for l in bloco_b["safra"] + bloco_b["anual"]}
        out = {}
        for chave in CHAVES_COMPARACAO:
            nome = (la.get(chave) or lb.get(chave) or {"nome": chave})["nome"]
            va = la.get(chave, {"valores": {}})["valores"]
            vb = lb.get(chave, {"valores": {}})["valores"]
            out[nome] = {an: delta(va.get(an, 0.0), vb.get(an, 0.0)) for an in anos}
        return out

    vazio = {"safra": [], "anual": [], "estoque": []}
    res = {TODAS: linhas(ra["consolidado"], rb["consolidado"])}
    ia = {c["id"]: c for c in ra["culturas"]}
    ib = {c["id"]: c for c in rb["culturas"]}
    nomes = {c["id"]: c["nome"] for c in ra["culturas"] + rb["culturas"]}
    for cid in sorted(nomes, key=lambda k: nomes[k].lower()):
        res[nomes[cid]] = linhas(ia.get(cid, vazio), ib.get(cid, vazio))
    return {"a": ra["versao"], "b": rb["versao"], "anos": anos, "unidade": "R$ mil", "resultados": res}


def numeros_rebanho(con: sqlite3.Connection, vid: int) -> Dict[int, dict]:
    """Séries da movimentação do rebanho de cada produto com estoque em gado de corte (a tela de Produtividade pecuária lê daqui)."""
    d = _carregar(con, vid)
    return {c["id"]: _numeros_rebanho(c, d) for c in d["culturas"] if eh_rebanho(c)}
