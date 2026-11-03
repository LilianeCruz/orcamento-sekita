"""Investimentos e desinvestimentos (orçamento anual, R$ mil).

Cadastro único de TIPOS (vale para todas as versões): nome, natureza (investimento ou desinvestimento), conta padrão do balanço (ativo),
classificação (cadastro próprio, dá para criar novas) e, só nos investimentos, se "carrega o saldo do ano anterior".

Por versão e ano:
  Investimento que carrega saldo:  saldo do ano anterior (digitado no 1º ano; depois = saldo a carregar do ano anterior)
                                   + novo orçamento do ano = total a investir;  investido no ano = total − saldo a carregar (digitado).
  Investimento sem saldo:          só o orçamento do ano; investido = orçamento.
  Desinvestimento:                 só o valor do ano; não traz saldo do ano anterior.
  Valor financiado (só investimento): digitado junto com o valor do ano, vira uma captação (ver captacoes.py); limitado ao investido do ano.
No balanço, a conta padrão de cada tipo vira: saldo realizado (último ano fechado) + investido − desinvestido, ano a ano.

Depreciação (R$ mil, por ano; tudo calculado e editável):
  Bens existentes  = taxa média × base depreciável. A base é o imobilizado bruto do último balanço realizado menos os desinvestimentos
                     (de contas do imobilizado) acumulados até o ano, a partir do próprio ano da baixa. A taxa média sai do realizado:
                     depreciação do último ano da DRE ÷ imobilizado bruto (contas do imobilizado, sem a depreciação acumulada). Pode ser alterada.
  Investimentos novos, por tipo = cada ano investido forma uma safra que deprecia em linha reta: investido × (1 − residual) ÷ vida útil,
                     por "vida útil" anos, começando depois da carência (ano cheio no primeiro ano). Tipo com vida útil 0 não deprecia.
  Qualquer valor calculado pode ser trocado à mão; o botão "voltar ao calculado" desfaz.
A depreciação total vai para a DRE e para a depreciação acumulada do balanço.
"""
from __future__ import annotations

import datetime as dt
import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado

NATUREZAS = ("investimento", "desinvestimento")
CAMPOS = ("novo", "a_carregar", "saldo_ini", "financiado")
RAIZ_ATIVO = "SA"


def _agora() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


# ---------------------------------------------------------------- classificações
def classificacoes(con: sqlite3.Connection) -> List[dict]:
    uso = {r["classificacao_id"]: r["n"] for r in con.execute("SELECT classificacao_id, COUNT(*) AS n FROM investimento_tipos GROUP BY classificacao_id")}
    return [{"id": r["id"], "nome": r["nome"], "ativa": bool(r["ativa"]), "em_uso": uso.get(r["id"], 0) > 0}
            for r in con.execute("SELECT * FROM investimento_classificacoes ORDER BY id")]


def criar_classificacao(con: sqlite3.Connection, nome: str, autor: str) -> int:
    nome = (nome or "").strip()
    if not nome:
        raise Invalido("Informe o nome da classificação")
    if con.execute("SELECT 1 FROM investimento_classificacoes WHERE nome=? COLLATE NOCASE", (nome,)).fetchone():
        raise Invalido(f"Já existe a classificação '{nome}'")
    cur = con.execute("INSERT INTO investimento_classificacoes(nome) VALUES(?)", (nome,))
    arr.auditar(con, autor, None, "criar_classificacao_investimento", nome)
    return cur.lastrowid


# ---------------------------------------------------------------- contas do balanço que aceitam investimento
def contas(con: sqlite3.Connection) -> List[dict]:
    from . import premissas_dem as svc_pd
    return [c for c in svc_pd.contas(con, "balanco") if c["codigo"].startswith(RAIZ_ATIVO)]


def _conta(con: sqlite3.Connection, codigo: str) -> dict:
    lista = contas(con)
    if not lista:
        raise Invalido("Importe antes a estrutura do Fechamento Contábil na tela DRE: ela traz as contas do balanço")
    c = next((x for x in lista if x["codigo"] == codigo), None)
    if c is None:
        raise Invalido("Escolha uma conta do ativo do balanço (a que recebe o investimento)")
    return c


# ---------------------------------------------------------------- cadastro de tipos
def _validar(con: sqlite3.Connection, d: dict, tid: int = 0) -> dict:
    nome = str(d.get("nome", "")).strip()
    if not nome:
        raise Invalido("Informe o nome do tipo de investimento")
    if d.get("natureza") not in NATUREZAS:
        raise Invalido("A natureza deve ser investimento ou desinvestimento")
    conta = _conta(con, str(d.get("conta_codigo") or ""))
    if not con.execute("SELECT 1 FROM investimento_classificacoes WHERE id=?", (d.get("classificacao_id"),)).fetchone():
        raise Invalido("Escolha a classificação")
    if con.execute("SELECT 1 FROM investimento_tipos WHERE nome=? COLLATE NOCASE AND id<>?", (nome, tid)).fetchone():
        raise Invalido(f"Já existe um tipo chamado '{nome}'")
    carrega = 1 if (d.get("natureza") == "investimento" and d.get("carrega_saldo")) else 0   # desinvestimento nunca carrega saldo
    vida, residual, carencia = float(d.get("vida_util") or 0), float(d.get("residual_pct") or 0), int(d.get("carencia") or 0)
    if vida < 0 or vida > 100:
        raise Invalido("A vida útil fica entre 0 e 100 anos (0 = não deprecia)")
    if residual < 0 or residual >= 100:
        raise Invalido("O valor residual é um percentual entre 0 e 100")
    if carencia < 0 or carencia > 50:
        raise Invalido("A carência é um número de anos entre 0 e 50")
    if d.get("natureza") != "investimento":
        vida, residual, carencia = 0.0, 0.0, 0                                                # só investimento deprecia
    return {"nome": nome, "natureza": d["natureza"], "conta_codigo": conta["codigo"], "classificacao_id": int(d["classificacao_id"]),
            "carrega_saldo": carrega, "ativo": 1 if d.get("ativo", True) else 0, "vida_util": vida, "residual_pct": residual, "carencia": carencia}


def criar_tipo(con: sqlite3.Connection, d: dict, autor: str, vid: Optional[int] = None, adicionar: bool = True) -> int:
    """Com `vid`, o tipo nasce no cadastro e só entra no orçamento dessa versão se `adicionar`; nas outras versões ele não aparece."""
    v = _validar(con, d)
    if vid is not None:
        v["ativo"] = 1
    cur = con.execute("INSERT INTO investimento_tipos(nome, natureza, conta_codigo, classificacao_id, carrega_saldo, ativo, criado_em, vida_util, residual_pct, carencia) VALUES(?,?,?,?,?,?,?,?,?,?)",
                      (v["nome"], v["natureza"], v["conta_codigo"], v["classificacao_id"], v["carrega_saldo"], v["ativo"], _agora(), v["vida_util"], v["residual_pct"], v["carencia"]))
    if vid is not None:
        for r in con.execute("SELECT id FROM versoes WHERE id<>?" if adicionar else "SELECT id FROM versoes", (vid,) if adicionar else ()).fetchall():
            con.execute("INSERT OR IGNORE INTO investimento_excluidos(versao_id, tipo_id) VALUES(?,?)", (r["id"], cur.lastrowid))
    arr.auditar(con, autor, None, "criar_tipo_investimento", v["nome"])
    return cur.lastrowid


def _obter(con: sqlite3.Connection, tid: int) -> sqlite3.Row:
    r = con.execute("SELECT * FROM investimento_tipos WHERE id=?", (tid,)).fetchone()
    if not r:
        raise NaoEncontrado(f"Tipo de investimento {tid} não existe")
    return r


def editar_tipo(con: sqlite3.Connection, tid: int, d: dict, autor: str) -> None:
    atual = _obter(con, tid)
    v = _validar(con, d, tid)
    if v["natureza"] != atual["natureza"] and con.execute("SELECT 1 FROM investimento_valores WHERE tipo_id=? AND valor<>0 LIMIT 1", (tid,)).fetchone():
        raise Invalido("Este tipo já tem valores digitados; não dá para trocar entre investimento e desinvestimento. Crie outro tipo e desative este.")
    con.execute("UPDATE investimento_tipos SET nome=?, natureza=?, conta_codigo=?, classificacao_id=?, carrega_saldo=?, ativo=?, vida_util=?, residual_pct=?, carencia=? WHERE id=?",
                (v["nome"], v["natureza"], v["conta_codigo"], v["classificacao_id"], v["carrega_saldo"], v["ativo"], v["vida_util"], v["residual_pct"], v["carencia"], tid))
    if not v["carrega_saldo"]:
        con.execute("DELETE FROM investimento_valores WHERE tipo_id=? AND campo IN ('a_carregar','saldo_ini')", (tid,))
    if v["natureza"] != "investimento":
        con.execute("DELETE FROM investimento_valores WHERE tipo_id=? AND campo='financiado'", (tid,))
    arr.auditar(con, autor, None, "editar_tipo_investimento", v["nome"])


def excluir_tipo(con: sqlite3.Connection, tid: int, autor: str) -> None:
    t = _obter(con, tid)
    if con.execute("SELECT 1 FROM investimento_valores WHERE tipo_id=? LIMIT 1", (tid,)).fetchone():
        raise Invalido(f"'{t['nome']}' tem valores em alguma versão. Remova-o do orçamento dessa versão em vez de excluir o cadastro.")
    con.execute("DELETE FROM investimento_tipos WHERE id=?", (tid,))
    arr.auditar(con, autor, None, "excluir_tipo_investimento", t["nome"])


def cadastro(con: sqlite3.Connection, vid: Optional[int] = None) -> List[dict]:
    """Com `vid`, `ativo` diz se o tipo faz parte do orçamento dessa versão (ativo no cadastro e não retirado dela)."""
    fora = {r["tipo_id"] for r in con.execute("SELECT tipo_id FROM investimento_excluidos WHERE versao_id=?", (vid,))} if vid is not None else set()
    nomes = {c["codigo"]: c for c in contas(con)}
    uso = {r["tipo_id"] for r in con.execute("SELECT DISTINCT tipo_id FROM investimento_valores")}
    out = []
    for r in con.execute("SELECT t.*, c.nome AS classificacao FROM investimento_tipos t JOIN investimento_classificacoes c ON c.id=t.classificacao_id ORDER BY t.ativo DESC, t.natureza, t.nome COLLATE NOCASE"):
        d = dict(r)
        conta = nomes.get(r["conta_codigo"])
        d.update(carrega_saldo=bool(r["carrega_saldo"]), ativo=bool(r["ativo"]) and r["id"] not in fora, ativo_cadastro=bool(r["ativo"]), em_uso=r["id"] in uso,
                 conta_nome=conta["nome"] if conta else r["conta_codigo"], conta_caminho=conta["caminho"] if conta else [])
        out.append(d)
    return out


# ---------------------------------------------------------------- cálculo
def _valores(con: sqlite3.Connection, vid: int) -> Dict[int, Dict[str, Dict[int, float]]]:
    d: Dict[int, Dict[str, Dict[int, float]]] = {}
    for r in con.execute("SELECT tipo_id, campo, ano, valor FROM investimento_valores WHERE versao_id=?", (vid,)):
        d.setdefault(r["tipo_id"], {}).setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def _calcular_base(t: dict, val: Dict[str, Dict[int, float]], anos: List[int]) -> dict:
    novo = {a: val.get("novo", {}).get(a, 0.0) for a in anos}
    anterior = {a: 0.0 for a in anos}
    total, carregar, investido, avisos = dict(novo), {a: 0.0 for a in anos}, {a: 0.0 for a in anos}, []
    if t["natureza"] == "desinvestimento":
        return {"novo": novo, "anterior": anterior, "total": novo, "carregar": carregar, "investido": investido, "desinvestido": dict(novo), "avisos": avisos}
    if not t["carrega_saldo"]:
        return {"novo": novo, "anterior": anterior, "total": novo, "carregar": carregar, "investido": dict(novo), "desinvestido": {a: 0.0 for a in anos}, "avisos": avisos}
    pedido = {a: val.get("a_carregar", {}).get(a, 0.0) for a in anos}
    for i, a in enumerate(anos):
        anterior[a] = val.get("saldo_ini", {}).get(a, 0.0) if i == 0 else carregar[anos[i - 1]]
        total[a] = anterior[a] + novo[a]
        carregar[a] = min(pedido[a], total[a])
        if pedido[a] > total[a] + 1e-9:
            avisos.append(f"{a}: o saldo a carregar ({pedido[a]:,.0f}) é maior que o total a investir ({total[a]:,.0f}); considerei o total.".replace(",", "."))
        investido[a] = total[a] - carregar[a]
    return {"novo": novo, "anterior": anterior, "total": total, "carregar": carregar, "investido": investido, "desinvestido": {a: 0.0 for a in anos}, "avisos": avisos}


def _calcular(t: dict, val: Dict[str, Dict[int, float]], anos: List[int]) -> dict:
    """Cálculo do tipo + o valor financiado de cada ano (o digitado, limitado ao investido do ano)."""
    c = _calcular_base(t, val, anos)
    pedido = {a: val.get("financiado", {}).get(a, 0.0) for a in anos}
    if t["natureza"] != "investimento":
        c["financiado"] = {a: 0.0 for a in anos}
        return c
    c["financiado"] = {a: min(pedido[a], c["investido"][a]) for a in anos}
    c["avisos"] = c["avisos"] + [f"{a}: o valor financiado ({pedido[a]:,.0f}) é maior que o investido do ano ({c['investido'][a]:,.0f}); considerei o investido.".replace(",", ".")
                                 for a in anos if pedido[a] > c["investido"][a] + 1e-9]
    return c


def _linhas(t: dict, c: dict, anos: List[int]) -> List[dict]:
    todos = {a: True for a in anos}
    primeiro = {a: a == anos[0] for a in anos}
    nenhum = {a: False for a in anos}
    L = lambda id_, nome, valores, editavel, expl, campo=None, estilo="": {"id": id_, "campo": campo, "nome": nome, "valores": valores, "editavel": editavel, "explicacao": expl, "estilo": estilo}
    if t["natureza"] == "desinvestimento":
        return [L("novo", "Desinvestimento do ano", c["novo"], todos,
                  "Valor que sai da conta padrão do balanço no ano (venda ou baixa), em R$. Não traz saldo do ano anterior.", "novo")]
    financiado = L("financiado", "Valor financiado", c["financiado"], todos,
                   "Parte do investido do ano que será financiada, em R$. Vira uma captação do tipo Investimento na tela Novas captações, com a taxa, o prazo e a carência "
                   "da premissa de financiamento do ano; o saldo soma na dívida de investimento do balanço e os juros na DRE.", "financiado")
    if not t["carrega_saldo"]:
        return [L("novo", "Orçamento do ano (investido)", c["novo"], todos,
                  "Valor investido no ano, em R$. Entra na conta padrão do balanço.", "novo"), financiado]
    return [
        L("saldo_ini", "Saldo a realizar do ano anterior", c["anterior"], primeiro,
          "No primeiro ano você digita o que ficou aprovado e ainda não foi investido no ano anterior; nos demais anos é o saldo a carregar do ano anterior.", "saldo_ini"),
        L("novo", "Novo orçamento do ano", c["novo"], todos, "Orçamento aprovado para o ano, em R$.", "novo"),
        L("total", "Total a investir no ano", c["total"], nenhum, "Saldo do ano anterior + novo orçamento.", None, "total"),
        L("a_carregar", "Saldo a carregar para o ano seguinte", c["carregar"], todos,
          "Parte do total que não será investida no ano e fica a realizar. Digite o valor; não pode passar do total a investir.", "a_carregar"),
        L("investido", "Investido no ano", c["investido"], nenhum, "Total a investir − saldo a carregar. É o que entra na conta padrão do balanço.", None, "total"),
        financiado,
    ]


def _soma(series: List[Dict[int, float]], anos: List[int]) -> Dict[int, float]:
    return {a: sum(s.get(a, 0.0) for s in series) for a in anos}


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    val = _valores(con, vid)
    cad = cadastro(con, vid)
    tipos, por_class, por_conta = [], {}, {}
    for t in cad:
        if not t["ativo"]:
            continue
        c = _calcular(t, val.get(t["id"], {}), anos)
        tipos.append({**{k: t[k] for k in ("id", "nome", "natureza", "conta_codigo", "conta_nome", "conta_caminho", "classificacao_id", "classificacao", "carrega_saldo", "vida_util", "residual_pct", "carencia")},
                      "linhas": _linhas(t, c, anos), "investido": c["investido"], "desinvestido": c["desinvestido"], "avisos": c["avisos"]})
        k = por_class.setdefault(t["classificacao"], {"nome": t["classificacao"], "inv": [], "des": []})
        k["inv"].append(c["investido"]); k["des"].append(c["desinvestido"])
        k = por_conta.setdefault(t["conta_codigo"], {"codigo": t["conta_codigo"], "nome": t["conta_nome"], "inv": [], "des": []})
        k["inv"].append(c["investido"]); k["des"].append(c["desinvestido"])
    inv_total = _soma([t["investido"] for t in tipos], anos)
    des_total = _soma([t["desinvestido"] for t in tipos], anos)
    return {
        "versao": v, "anos": anos, "estrutura": bool(contas(con)), "classificacoes": classificacoes(con), "contas": contas(con), "cadastro": cad, "tipos": tipos,
        "depreciacao": depreciacao(con, vid, anos),
        "resumo": {
            "por_classificacao": [{"nome": k["nome"], "investido": _soma(k["inv"], anos), "desinvestido": _soma(k["des"], anos)} for k in por_class.values()],
            "por_conta": [{"codigo": k["codigo"], "nome": k["nome"], "investido": _soma(k["inv"], anos), "desinvestido": _soma(k["des"], anos),
                           "liquido": {a: _soma(k["inv"], anos)[a] - _soma(k["des"], anos)[a] for a in anos}} for k in por_conta.values()],
            "totais": {"investido": inv_total, "desinvestido": des_total, "liquido": {a: inv_total[a] - des_total[a] for a in anos}},
        },
    }


def efeitos_balanco(con: sqlite3.Connection, vid: int, anos: List[int]) -> Dict[str, Dict[int, float]]:
    """Movimento líquido do ano (investido − desinvestido) por conta padrão do balanço, em R$."""
    val = _valores(con, vid)
    out: Dict[str, Dict[int, float]] = {}
    for t in cadastro(con, vid):
        if not t["ativo"]:
            continue
        c = _calcular(t, val.get(t["id"], {}), anos)
        acc = out.setdefault(t["conta_codigo"], {a: 0.0 for a in anos})
        for a in anos:
            acc[a] += c["investido"][a] - c["desinvestido"][a]
    return out


# ---------------------------------------------------------------- digitação
def _tipo_ativo(con: sqlite3.Connection, tid: int, vid: Optional[int] = None) -> sqlite3.Row:
    t = _obter(con, tid)
    if not t["ativo"] or (vid is not None and con.execute("SELECT 1 FROM investimento_excluidos WHERE versao_id=? AND tipo_id=?", (vid, tid)).fetchone()):
        raise Invalido(f"'{t['nome']}' não faz parte deste orçamento")
    return t


def _campo_valido(t: sqlite3.Row, campo: str, ano: int, anos: List[int]) -> None:
    if campo not in CAMPOS:
        raise Invalido("Campo inválido")
    if campo == "financiado" and t["natureza"] != "investimento":
        raise Invalido(f"'{t['nome']}' é desinvestimento: não há o que financiar")
    if campo in ("a_carregar", "saldo_ini") and not t["carrega_saldo"]:
        raise Invalido(f"'{t['nome']}' não carrega saldo do ano anterior")
    if campo == "saldo_ini" and ano != anos[0]:
        raise Invalido("O saldo do ano anterior só se digita no primeiro ano; nos demais ele vem do saldo a carregar")


def salvar_valor(con: sqlite3.Connection, vid: int, tid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    t = _tipo_ativo(con, tid, vid)
    anos = arr.anos_da_versao(v)
    if ano not in anos:
        raise Invalido("Ano fora do horizonte da versão")
    _campo_valido(t, campo, ano, anos)
    if valor < 0:
        raise Invalido("O valor não pode ser negativo")
    con.execute("INSERT INTO investimento_valores(versao_id, tipo_id, campo, ano, valor) VALUES(?,?,?,?,?) "
                "ON CONFLICT(versao_id, tipo_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, tid, campo, ano, valor))
    arr.auditar(con, autor, vid, "salvar_investimento", f"{t['nome']} · {campo} {ano}: {valor}")


def _copiar(con: sqlite3.Connection, vid: int, tid: int, campo: str, ano_origem: int, destinos: List[int]) -> None:
    r = con.execute("SELECT valor FROM investimento_valores WHERE versao_id=? AND tipo_id=? AND campo=? AND ano=?", (vid, tid, campo, ano_origem)).fetchone()
    for a in destinos:
        con.execute("INSERT INTO investimento_valores(versao_id, tipo_id, campo, ano, valor) VALUES(?,?,?,?,?) "
                    "ON CONFLICT(versao_id, tipo_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, tid, campo, a, r["valor"] if r else 0.0))


def _destinos(v, ano_origem: int) -> List[int]:
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    return destinos


def replicar(con: sqlite3.Connection, vid: int, tid: int, campo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    t = _tipo_ativo(con, tid, vid)
    if campo not in ("novo", "a_carregar", "financiado"):
        raise Invalido("Só o novo orçamento, o saldo a carregar e o valor financiado se replicam")
    _campo_valido(t, campo, ano_origem, arr.anos_da_versao(v))
    destinos = _destinos(v, ano_origem)
    _copiar(con, vid, tid, campo, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_investimento", f"{t['nome']} · {campo}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todos(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    destinos = _destinos(v, ano_origem)
    n = 0
    for t in [x for x in cadastro(con, vid) if x["ativo"]]:
        for campo in ("novo", "a_carregar", "financiado"):
            if campo == "a_carregar" and not t["carrega_saldo"]:
                continue
            if campo == "financiado" and t["natureza"] != "investimento":
                continue
            _copiar(con, vid, t["id"], campo, ano_origem, destinos)
            n += 1
    arr.auditar(con, autor, vid, "replicar_todos_investimentos", f"de {ano_origem}")
    return {"campos": n, "anos_alterados": len(destinos)}


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    ib = {t["id"]: t for t in lb["tipos"]}
    linhas = []

    def linha(id_, nome, natureza, sa, sb):
        linhas.append({"id": id_, "nome": nome, "natureza": natureza, "anos": {a: {
            "a": sa.get(a, 0.0), "b": sb.get(a, 0.0), "delta": sb.get(a, 0.0) - sa.get(a, 0.0),
            "pct": ((sb.get(a, 0.0) - sa.get(a, 0.0)) / abs(sa[a]) * 100.0) if sa.get(a) else None} for a in anos}})
    for t in la["tipos"]:
        o = ib.get(t["id"])
        serie = lambda x, k: (x or {}).get(k, {})
        linha(t["id"], t["nome"], t["natureza"], t["investido"] if t["natureza"] == "investimento" else t["desinvestido"],
              serie(o, "investido") if t["natureza"] == "investimento" else serie(o, "desinvestido"))
    linha("total", "Investido líquido (investimentos − desinvestimentos)", "total", la["resumo"]["totais"]["liquido"], lb["resumo"]["totais"]["liquido"])
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "linhas": linhas}


# ---------------------------------------------------------------- depreciação
CODIGO_DEPRECIACAO_DRE = "DS047"
CODIGO_IMOBILIZADO, CODIGO_DEPR_ACUMULADA = "SA19", "SA26"


def _alterados(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {}
    for r in con.execute("SELECT chave, ano, valor FROM depreciacao_valores WHERE versao_id=?", (vid,)):
        d.setdefault(r["chave"], {})[r["ano"]] = r["valor"]
    return d


def _existente(con: sqlite3.Connection, anos: List[int]) -> Optional[dict]:
    """Imobilizado do último balanço realizado antes do horizonte, a depreciação daquele ano e a taxa média resultante."""
    from . import realizado as svc_real
    ini = svc_real.saldo_inicial(con, anos[0])
    if not ini:
        return None
    v, ano = ini["valores"], ini["ano"]
    acumulada = v.get(CODIGO_DEPR_ACUMULADA, 0.0)                                  # negativa
    if CODIGO_IMOBILIZADO in v:
        bruto = v[CODIGO_IMOBILIZADO] - acumulada
    else:
        bruto = sum(x for c, x in v.items() if c.startswith("SA2") and c not in (CODIGO_DEPR_ACUMULADA,) and len(c) == 4)
    dep = svc_real.valor_realizado(con, "DRE", CODIGO_DEPRECIACAO_DRE, ano)
    dep = -dep if dep is not None else None                                        # na DRE a despesa é negativa
    contas = []
    nomes = {r["codigo"]: r["nome"] for r in con.execute("SELECT codigo, nome FROM bp_linhas")}
    for r in con.execute("SELECT codigo FROM bp_linhas WHERE pai=? AND ativa=1 ORDER BY ordem, codigo", (CODIGO_IMOBILIZADO,)):
        contas.append({"codigo": r["codigo"], "nome": nomes[r["codigo"]], "saldo": v.get(r["codigo"])})
    taxa = (dep / bruto * 100.0) if (dep is not None and bruto > 0) else None
    return {"ano": ano, "meses": ini.get("meses"), "bruto": bruto, "acumulada": acumulada, "liquido": bruto + acumulada, "depreciacao_ano": dep, "taxa_calculada": taxa, "contas": contas}


def _contas_imobilizado(con: sqlite3.Connection) -> set:
    """Contas do grupo Imobilizado (SA19), sem a depreciação acumulada; sem o grupo na estrutura, SA20 a SA25."""
    linhas = {r["codigo"]: r["pai"] for r in con.execute("SELECT codigo, pai FROM bp_linhas")}
    if CODIGO_IMOBILIZADO not in linhas:
        return {f"SA{n}" for n in range(20, 26)}
    def sob(c):
        vistos = set()
        while c and c not in vistos:
            if c == CODIGO_IMOBILIZADO:
                return True
            vistos.add(c); c = linhas.get(c)
        return False
    return {c for c in linhas if c != CODIGO_IMOBILIZADO and c != CODIGO_DEPR_ACUMULADA and sob(c)}


def depreciacao(con: sqlite3.Connection, vid: int, anos: List[int]) -> dict:
    """Depreciação por ano: bens existentes e cada tipo de investimento, já com as alterações feitas à mão."""
    val = _valores(con, vid)
    alt = _alterados(con, vid)
    existente = _existente(con, anos)
    taxa_calc = existente["taxa_calculada"] if existente and existente["taxa_calculada"] is not None else 0.0
    taxa = alt.get("taxa", {}).get(0, taxa_calc)
    imob = _contas_imobilizado(con)
    baixado = {a: 0.0 for a in anos}                                                # desinvestimentos acumulados do imobilizado
    for t in cadastro(con, vid):
        if t["ativo"] and t["natureza"] == "desinvestimento" and t["conta_codigo"] in imob:
            v = _calcular(t, val.get(t["id"], {}), anos)["desinvestido"]
            acumulado = 0.0
            for a in anos:
                acumulado += v[a]
                baixado[a] += acumulado
    base_deprec = {a: (max(0.0, existente["bruto"] - baixado[a]) if existente else 0.0) for a in anos}
    base = {a: taxa / 100.0 * base_deprec[a] for a in anos}
    linhas = [{"chave": "existentes", "nome": "Bens existentes", "calculado": base, "tipo_id": None,
               "regra": "taxa média × (imobilizado bruto − desinvestimentos acumulados)"}]
    for t in cadastro(con, vid):
        if not t["ativo"] or t["natureza"] != "investimento" or t["vida_util"] <= 0:
            continue
        inv = _calcular(t, val.get(t["id"], {}), anos)["investido"]
        calc = {a: 0.0 for a in anos}
        por_ano = (1.0 - t["residual_pct"] / 100.0) / t["vida_util"]
        for s in anos:
            inicio = s + t["carencia"]
            for a in anos:
                if inicio <= a < inicio + t["vida_util"]:
                    calc[a] += inv[s] * por_ano                                     # ano cheio no primeiro ano, linear
        linhas.append({"chave": f"tipo-{t['id']}", "nome": t["nome"], "calculado": calc, "tipo_id": t["id"],
                       "regra": f"vida útil {t['vida_util']:g} ano(s), residual {t['residual_pct']:g}%, carência {t['carencia']} ano(s)"})
    for l in linhas:
        mao = alt.get(l["chave"], {})
        l["valores"] = {a: mao.get(a, l["calculado"][a]) for a in anos}
        l["alterado"] = {a: a in mao for a in anos}
    total = {a: sum(l["valores"][a] for l in linhas) for a in anos}
    return {"existente": existente, "taxa": taxa, "taxa_calculada": taxa_calc, "taxa_alterada": "taxa" in alt, "base_depreciavel": base_deprec,
            "desinvestido_acumulado": baixado, "linhas": linhas, "total": total}


def salvar_depreciacao(con: sqlite3.Connection, vid: int, chave: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    anos = arr.anos_da_versao(v)
    if chave == "taxa":
        ano = 0
        if not 0 <= valor <= 100:
            raise Invalido("A taxa média de depreciação fica entre 0 e 100% ao ano")
    else:
        if chave != "existentes" and not (chave.startswith("tipo-") and chave[5:].isdigit()
                                          and con.execute("SELECT 1 FROM investimento_tipos WHERE id=?", (int(chave[5:]),)).fetchone()):
            raise Invalido("Linha de depreciação inexistente")
        if ano not in anos:
            raise Invalido("Ano fora do horizonte da versão")
        if valor < 0:
            raise Invalido("A depreciação não pode ser negativa")
    con.execute("INSERT INTO depreciacao_valores(versao_id, chave, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, chave, ano) DO UPDATE SET valor=excluded.valor", (vid, chave, ano, valor))
    arr.auditar(con, autor, vid, "salvar_depreciacao", f"{chave} {ano}: {valor}")


def voltar_ao_calculado(con: sqlite3.Connection, vid: int, chave: str, autor: str) -> None:
    arr.versao_editavel(con, vid)
    con.execute("DELETE FROM depreciacao_valores WHERE versao_id=? AND chave=?", (vid, chave))
    arr.auditar(con, autor, vid, "voltar_depreciacao_ao_calculado", chave)


def totais(con: sqlite3.Connection, vid: int, anos: List[int]) -> Dict[str, Dict[int, float]]:
    """Total investido e desinvestido por ano, somando os tipos ativos."""
    val = _valores(con, vid)
    inv, des = {a: 0.0 for a in anos}, {a: 0.0 for a in anos}
    for t in cadastro(con, vid):
        if not t["ativo"]:
            continue
        c = _calcular(t, val.get(t["id"], {}), anos)
        for a in anos:
            inv[a] += c["investido"][a]
            des[a] += c["desinvestido"][a]
    return {"investido": inv, "desinvestido": des}


# ---------------------------------------------------------------- tipo dentro do orçamento de uma versão
def incluir_na_versao(con: sqlite3.Connection, vid: int, tid: int, autor: str) -> None:
    """Põe o tipo (já cadastrado) no orçamento da versão."""
    arr.versao_editavel(con, vid)
    t = _obter(con, tid)
    if not t["ativo"]:
        con.execute("UPDATE investimento_tipos SET ativo=1 WHERE id=?", (tid,))
        for r in con.execute("SELECT id FROM versoes WHERE id<>?", (vid,)).fetchall():      # reativado: só entra nesta versão
            con.execute("INSERT OR IGNORE INTO investimento_excluidos(versao_id, tipo_id) VALUES(?,?)", (r["id"], tid))
    con.execute("DELETE FROM investimento_excluidos WHERE versao_id=? AND tipo_id=?", (vid, tid))
    arr.auditar(con, autor, vid, "incluir_tipo_investimento", t["nome"])


def retirar_da_versao(con: sqlite3.Connection, vid: int, tid: int, autor: str) -> None:
    """Tira o tipo do orçamento só desta versão e apaga os valores lançados nela; o cadastro e as outras versões não mudam."""
    arr.versao_editavel(con, vid)
    t = _obter(con, tid)
    con.execute("DELETE FROM investimento_valores WHERE versao_id=? AND tipo_id=?", (vid, tid))
    con.execute("DELETE FROM depreciacao_valores WHERE versao_id=? AND chave=?", (vid, f"tipo-{tid}"))
    con.execute("INSERT OR IGNORE INTO investimento_excluidos(versao_id, tipo_id) VALUES(?,?)", (vid, tid))
    arr.auditar(con, autor, vid, "retirar_tipo_investimento", t["nome"])
