"""Novas captações de dívida (R$ mil, ano a ano) e o financiamento dos investimentos.

Duas origens, o mesmo cronograma:
  * Captação cadastrada aqui, só de Custeio ou Capital de Giro: valor, ano, taxa média (% a.a.), prazo (parcelas anuais) e carência.
  * Investimento financiado: na tela Investimentos você digita o valor financiado de cada tipo e ano; cada um gera uma captação do tipo Investimento,
    com a taxa, o prazo e a carência da premissa de financiamento do ano.

Cronograma de cada captação (ano da captação = A; o dinheiro entra no meio do ano):
  amortização calculada = valor ÷ prazo, em parcelas anuais iguais (SAC), começando em A + 1 + carência;
  saldo do fim do ano  = saldo anterior + captado − amortização;
  juros calculados     = taxa × saldo médio do ano ((saldo do início + saldo do fim) ÷ 2); no ano da captação o saldo do início é zero,
                         o que dá meio ano de juros;
  curto prazo          = a amortização do ano seguinte; longo prazo = o resto do saldo.
Amortização e juros de cada ano podem ser trocados à mão (o botão "voltar ao calculado" desfaz); o saldo e o curto/longo seguem os valores efetivos.
Custeio e Capital de Giro vão para as contas de dívida de custeio/giro do balanço; o financiamento de investimentos, para as contas de
dívida de investimento. Os juros entram na despesa financeira da DRE.
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado

TIPOS = {"custeio": "Custeio", "capital_giro": "Capital de giro"}
CAMPOS_PREMISSA = {"taxa": ("Taxa média de juros", "% ao ano", 100.0), "prazo": ("Prazo de pagamento", "parcelas anuais", 50.0), "carencia": ("Carência", "anos", 20.0)}


# ---------------------------------------------------------------- cadastro
def _validar(d: dict, anos: List[int]) -> dict:
    nome = str(d.get("nome", "")).strip()
    if not nome:
        raise Invalido("Informe o nome da captação")
    tipo = d.get("tipo")
    if tipo == "investimento":
        raise Invalido("Investimento financiado nasce na tela Investimentos (digite o valor financiado ao lançar o investimento)")
    if tipo not in TIPOS:
        raise Invalido("O tipo da captação deve ser Custeio ou Capital de giro")
    ano = int(d.get("ano") or 0)
    if ano not in anos:
        raise Invalido("O ano da captação precisa estar no horizonte da versão")
    valor = float(d.get("valor") or 0)
    if valor <= 0:
        raise Invalido("Informe o valor da captação (maior que zero, em R$)")
    taxa = float(d.get("taxa") or 0)
    if taxa < 0 or taxa > 100:
        raise Invalido("A taxa média de juros fica entre 0 e 100% ao ano")
    prazo = int(d.get("prazo") or 0)
    if prazo < 1 or prazo > 50:
        raise Invalido("O prazo é o número de parcelas anuais, de 1 a 50")
    carencia = int(d.get("carencia") or 0)
    if carencia < 0 or carencia > 20:
        raise Invalido("A carência fica entre 0 e 20 anos")
    return {"nome": nome, "tipo": tipo, "ano": ano, "valor": valor, "taxa": taxa, "prazo": prazo, "carencia": carencia}


def criar(con: sqlite3.Connection, vid: int, d: dict, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    c = _validar(d, arr.anos_da_versao(v))
    cur = con.execute("INSERT INTO novas_captacoes(versao_id, nome, tipo, ano, valor, taxa, prazo, carencia) VALUES(?,?,?,?,?,?,?,?)",
                      (vid, c["nome"], c["tipo"], c["ano"], c["valor"], c["taxa"], c["prazo"], c["carencia"]))
    arr.auditar(con, autor, vid, "criar_captacao", f"{c['nome']}: R$ {c['valor']:,.0f} mil em {c['ano']}".replace(",", "."))
    return cur.lastrowid


def _obter(con: sqlite3.Connection, vid: int, cid: int) -> sqlite3.Row:
    r = con.execute("SELECT * FROM novas_captacoes WHERE id=? AND versao_id=?", (cid, vid)).fetchone()
    if not r:
        raise NaoEncontrado(f"Captação {cid} não existe nesta versão")
    return r


def editar(con: sqlite3.Connection, vid: int, cid: int, d: dict, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    _obter(con, vid, cid)
    c = _validar(d, arr.anos_da_versao(v))
    con.execute("UPDATE novas_captacoes SET nome=?, tipo=?, ano=?, valor=?, taxa=?, prazo=?, carencia=? WHERE id=?",
                (c["nome"], c["tipo"], c["ano"], c["valor"], c["taxa"], c["prazo"], c["carencia"], cid))
    arr.auditar(con, autor, vid, "editar_captacao", c["nome"])


def excluir(con: sqlite3.Connection, vid: int, cid: int, autor: str) -> None:
    arr.versao_editavel(con, vid)
    c = _obter(con, vid, cid)
    con.execute("DELETE FROM captacao_valores WHERE versao_id=? AND chave=?", (vid, f"cap-{cid}"))
    con.execute("DELETE FROM novas_captacoes WHERE id=?", (cid,))
    arr.auditar(con, autor, vid, "excluir_captacao", c["nome"])


def copiar(con: sqlite3.Connection, origem_id: int, novo: int) -> None:
    """Copia captações, alterações à mão e premissas de financiamento para a versão nova (os ids das captações mudam)."""
    novos = {}
    for r in con.execute("SELECT * FROM novas_captacoes WHERE versao_id=?", (origem_id,)).fetchall():
        cur = con.execute("INSERT INTO novas_captacoes(versao_id, nome, tipo, ano, valor, taxa, prazo, carencia) VALUES(?,?,?,?,?,?,?,?)",
                          (novo, r["nome"], r["tipo"], r["ano"], r["valor"], r["taxa"], r["prazo"], r["carencia"]))
        novos[f"cap-{r['id']}"] = f"cap-{cur.lastrowid}"
    for r in con.execute("SELECT * FROM captacao_valores WHERE versao_id=?", (origem_id,)).fetchall():
        chave = novos.get(r["chave"], r["chave"] if not r["chave"].startswith("cap-") else None)
        if chave:
            con.execute("INSERT INTO captacao_valores(versao_id, chave, campo, ano, valor) VALUES(?,?,?,?,?)", (novo, chave, r["campo"], r["ano"], r["valor"]))
    con.execute("INSERT INTO financiamento_premissas(versao_id, campo, ano, valor) SELECT ?, campo, ano, valor FROM financiamento_premissas WHERE versao_id=?", (novo, origem_id))


# ---------------------------------------------------------------- premissas do financiamento dos investimentos
def _premissas(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {c: {} for c in CAMPOS_PREMISSA}
    for r in con.execute("SELECT campo, ano, valor FROM financiamento_premissas WHERE versao_id=?", (vid,)):
        d.setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def salvar_premissa(con: sqlite3.Connection, vid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    if campo not in CAMPOS_PREMISSA:
        raise Invalido("Campo inválido")
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    rotulo, _, maximo = CAMPOS_PREMISSA[campo]
    if valor < 0 or valor > maximo:
        raise Invalido(f"{rotulo} fica entre 0 e {maximo:g}")
    if campo in ("prazo", "carencia") and valor != int(valor):
        raise Invalido(f"{rotulo} é um número inteiro de anos")
    con.execute("INSERT INTO financiamento_premissas(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, ano, valor))
    arr.auditar(con, autor, vid, "salvar_premissa_financiamento", f"{rotulo} {ano}: {valor}")


def replicar_premissa(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    if campo not in CAMPOS_PREMISSA:
        raise Invalido("Campo inválido")
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    r = con.execute("SELECT valor FROM financiamento_premissas WHERE versao_id=? AND campo=? AND ano=?", (vid, campo, ano_origem)).fetchone()
    for a in destinos:
        con.execute("INSERT INTO financiamento_premissas(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                    "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, a, r["valor"] if r else 0.0))
    arr.auditar(con, autor, vid, "replicar_premissa_financiamento", f"{CAMPOS_PREMISSA[campo][0]}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


# ---------------------------------------------------------------- alterações à mão
def _alteracoes(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[str, Dict[int, float]]]:
    d: Dict[str, Dict[str, Dict[int, float]]] = {}
    for r in con.execute("SELECT chave, campo, ano, valor FROM captacao_valores WHERE versao_id=?", (vid,)):
        d.setdefault(r["chave"], {}).setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def _chave_valida(con: sqlite3.Connection, vid: int, chave: str) -> None:
    if chave.startswith("cap-") and chave[4:].isdigit():
        _obter(con, vid, int(chave[4:]))
        return
    partes = chave.split("-")
    if len(partes) == 3 and partes[0] == "inv" and partes[1].isdigit() and partes[2].isdigit():
        if con.execute("SELECT 1 FROM investimento_tipos WHERE id=?", (int(partes[1]),)).fetchone():
            return
    raise Invalido("Captação inexistente")


def salvar_valor(con: sqlite3.Connection, vid: int, chave: str, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    _chave_valida(con, vid, chave)
    if campo not in ("amort", "juros"):
        raise Invalido("Só a amortização e os juros podem ser alterados")
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0:
        raise Invalido("O valor não pode ser negativo")
    con.execute("INSERT INTO captacao_valores(versao_id, chave, campo, ano, valor) VALUES(?,?,?,?,?) "
                "ON CONFLICT(versao_id, chave, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, chave, campo, ano, valor))
    arr.auditar(con, autor, vid, "salvar_cronograma_captacao", f"{chave} · {campo} {ano}: {valor}")


def voltar_ao_calculado(con: sqlite3.Connection, vid: int, chave: str, autor: str) -> None:
    arr.versao_editavel(con, vid)
    con.execute("DELETE FROM captacao_valores WHERE versao_id=? AND chave=?", (vid, chave))
    arr.auditar(con, autor, vid, "voltar_cronograma_captacao_ao_calculado", chave)


# ---------------------------------------------------------------- cálculo
def _cronograma(c: dict, anos: List[int], alt: Dict[str, Dict[int, float]]) -> dict:
    """Cronograma de uma captação para os anos da versão (e um ano a mais, para o curto prazo do último ano)."""
    ext = anos + [anos[-1] + 1]
    primeira = c["ano"] + 1 + c["carencia"]
    calc_amort = {y: (c["valor"] / c["prazo"] if primeira <= y < primeira + c["prazo"] else 0.0) for y in ext}
    saldo_ini, saldo_fim, amort, captado, juros_calc, amort_calc = {}, {}, {}, {}, {}, {}
    saldo = 0.0
    for y in ext:
        if y < c["ano"]:
            saldo_ini[y] = saldo_fim[y] = amort[y] = captado[y] = juros_calc[y] = amort_calc[y] = 0.0
            continue
        saldo_ini[y] = saldo
        captado[y] = c["valor"] if y == c["ano"] else 0.0
        disponivel = saldo + captado[y]
        amort_calc[y] = min(calc_amort[y], disponivel)
        amort[y] = min(alt.get("amort", {}).get(y, amort_calc[y]), disponivel)
        saldo = disponivel - amort[y]
        saldo_fim[y] = saldo
        juros_calc[y] = c["taxa"] / 100.0 * (saldo_ini[y] + saldo_fim[y]) / 2.0
    juros = {y: alt.get("juros", {}).get(y, juros_calc[y]) for y in anos}
    curto = {y: min(amort[y + 1], saldo_fim[y]) for y in anos}
    longo = {y: saldo_fim[y] - curto[y] for y in anos}
    return {"captado": {y: captado[y] for y in anos}, "amort": {y: amort[y] for y in anos}, "amort_calc": {y: amort_calc[y] for y in anos},
            "saldo": {y: saldo_fim[y] for y in anos}, "curto": curto, "longo": longo, "juros": juros, "juros_calc": {y: juros_calc[y] for y in anos}}


def calcular(con: sqlite3.Connection, vid: int, anos: List[int]) -> List[dict]:
    """Todas as captações da versão (cadastradas e as dos investimentos financiados) com o cronograma ano a ano."""
    from . import investimentos as svc_inv
    alt = _alteracoes(con, vid)
    saida: List[dict] = []
    for r in con.execute("SELECT * FROM novas_captacoes WHERE versao_id=? ORDER BY ano, id", (vid,)):
        c = {"chave": f"cap-{r['id']}", "id": r["id"], "origem": "cadastro", "nome": r["nome"], "tipo": r["tipo"], "tipo_nome": TIPOS[r["tipo"]], "grupo": "giro",
             "ano": r["ano"], "valor": r["valor"], "taxa": r["taxa"], "prazo": r["prazo"], "carencia": r["carencia"], "avisos": []}
        c.update(_cronograma(c, anos, alt.get(c["chave"], {})))
        saida.append(c)
    prem = _premissas(con, vid)
    val = svc_inv._valores(con, vid)
    for t in svc_inv.cadastro(con, vid):
        if not t["ativo"] or t["natureza"] != "investimento":
            continue
        c_inv = svc_inv._calcular(t, val.get(t["id"], {}), anos)
        for a in anos:
            valor = c_inv["financiado"][a]
            if valor <= 1e-9:
                continue
            taxa = prem["taxa"].get(a, 0.0)
            prazo = int(prem["prazo"].get(a, 0.0))
            carencia = int(prem["carencia"].get(a, 0.0))
            avisos = []
            if prazo < 1:
                avisos.append(f"Sem prazo de pagamento na premissa de financiamento de {a}: considerei 1 parcela.")
                prazo = 1
            c = {"chave": f"inv-{t['id']}-{a}", "id": None, "origem": "investimento", "nome": f"{t['nome']} · financiamento {a}", "tipo": "investimento",
                 "tipo_nome": "Investimento", "grupo": "invest", "ano": a, "valor": valor, "taxa": taxa, "prazo": prazo, "carencia": carencia,
                 "tipo_investimento_id": t["id"], "percentual": valor / c_inv["investido"][a] * 100.0 if c_inv["investido"][a] else None, "avisos": avisos}
            c.update(_cronograma(c, anos, alt.get(c["chave"], {})))
            saida.append(c)
    return saida


def somar(captacoes: List[dict], anos: List[int], grupo: Optional[str] = None) -> dict:
    zero = lambda: {a: 0.0 for a in anos}
    out = {k: zero() for k in ("captado", "amort", "saldo", "curto", "longo", "juros")}
    for c in captacoes:
        if grupo and c["grupo"] != grupo:
            continue
        for k in out:
            for a in anos:
                out[k][a] += c[k][a]
    return out


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    caps = calcular(con, vid, anos)
    alt = _alteracoes(con, vid)
    L = lambda id_, nome, valores, calc=None, chave=None, campo=None, mao=None: {
        "id": id_, "nome": nome, "valores": valores, "calculado": calc, "campo": campo, "editavel": campo is not None,
        "alterado": {a: (a in (mao or {})) for a in anos} if campo else None}
    tranches = []
    for c in caps:
        mao = alt.get(c["chave"], {})
        tranches.append({**{k: c[k] for k in ("chave", "id", "origem", "nome", "tipo", "tipo_nome", "grupo", "ano", "valor", "taxa", "prazo", "carencia", "avisos")},
                         "percentual": c.get("percentual"),
                         "linhas": [L("captado", "Captado no ano", c["captado"]),
                                    L("amort", "Amortização do principal", c["amort"], c["amort_calc"], c["chave"], "amort", mao.get("amort")),
                                    L("saldo", "Saldo da dívida em 31/12", c["saldo"]),
                                    L("curto", "  curto prazo (vence no ano seguinte)", c["curto"]),
                                    L("longo", "  longo prazo", c["longo"]),
                                    L("juros", "Juros do ano", c["juros"], c["juros_calc"], c["chave"], "juros", mao.get("juros"))]})
    prem = _premissas(con, vid)
    return {"versao": v, "anos": anos, "tipos": [{"id": k, "nome": n} for k, n in TIPOS.items()], "captacoes": [t for t in tranches],
            "premissas": [{"campo": k, "nome": n, "unidade": u, "valores": {a: prem[k].get(a, 0.0) for a in anos}} for k, (n, u, _) in CAMPOS_PREMISSA.items()],
            "resumo": {"giro": somar(caps, anos, "giro"), "invest": somar(caps, anos, "invest"), "total": somar(caps, anos)}}


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    linhas = []
    for id_, nome, k in (("captado", "Captado no ano", "captado"), ("amort", "Amortização do principal", "amort"), ("saldo", "Saldo da dívida nova em 31/12", "saldo"),
                         ("juros", "Juros do ano", "juros")):
        sa, sb = la["resumo"]["total"][k], lb["resumo"]["total"][k]
        linhas.append({"id": id_, "nome": nome, "anos": {a: {"a": sa[a], "b": sb[a], "delta": sb[a] - sa[a],
                                                              "pct": ((sb[a] - sa[a]) / abs(sa[a]) * 100.0) if sa[a] else None} for a in anos}})
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "linhas": linhas}
