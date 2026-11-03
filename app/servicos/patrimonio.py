"""Patrimônio líquido projetado (R$ mil, ano a ano).

  Lucros e prejuízos acumulados (SP25):
      saldo do ano = saldo do ano anterior + resultado do exercício do ano anterior (transferido) − distribuição paga no ano
      (no primeiro ano, o saldo anterior e o resultado são os do último balanço realizado)
  Distribuição de lucros: a empresa distribui aos sócios, no ano seguinte, uma parte do lucro de cada ano. A regra é definida por ano do lucro:
      um % do lucro líquido do ano e/ou um valor base, que é o MÍNIMO que a empresa paga quando não há lucro. Com lucro e % informado, a distribuição
      é o % do lucro (mesmo que dê menos que o valor base); sem lucro, ou sem % informado, paga o valor base.
      Os dividendos ficam dentro dos lucros e prejuízos acumulados (não há saldo de dividendos a pagar no passivo).
      A distribuição do lucro de 2027, por exemplo, é paga em 2028 e reduz os lucros acumulados de 2028. O ano anterior ao horizonte
      também tem regra, porque o lucro dele é distribuído no primeiro ano projetado.
  Capital integralizado (SP23) e Ajustes de avaliação patrimonial (SP24): trazem o saldo do ano anterior; qualquer ano pode ser alterado à mão
      (o valor alterado vale a partir dele, porque o ano seguinte traz o saldo do anterior). O botão "voltar ao calculado" desfaz.
  Resultado do exercício (SP26)          = lucro líquido do ano da DRE
O saldo anterior do primeiro ano vem do último balanço realizado antes do horizonte (tela Realizado).
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List

from . import arrendamentos as arr
from .arrendamentos import Invalido

CAMPOS = {
    "dist_pct": ("Distribuição de lucros — % do lucro líquido do ano", "% do lucro"),
    "dist_valor": ("Distribuição de lucros — valor base (mínimo)", "R$ mil"),
}
SALDOS_ALTERAVEIS = {"capital": "Capital integralizado", "ajustes": "Ajustes de avaliação patrimonial"}   # saldo alterado à mão, por ano
CONTA_LUCROS, CONTA_CAPITAL, CONTA_AJUSTES, CONTA_RESULTADO = "SP25", "SP23", "SP24", "SP26"
LINHA_LUCRO_LIQUIDO = "DS062"


def _valores(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {c: {} for c in list(CAMPOS) + list(SALDOS_ALTERAVEIS)}
    for r in con.execute("SELECT campo, ano, valor FROM patrimonio_valores WHERE versao_id=?", (vid,)):
        d.setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def anos_com_regra(anos: List[int]) -> List[int]:
    """Anos do horizonte mais o ano anterior a ele: o lucro desse ano anterior é distribuído no primeiro ano projetado."""
    return [anos[0] - 1] + list(anos)


def salvar(con: sqlite3.Connection, vid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    if campo not in CAMPOS and campo not in SALDOS_ALTERAVEIS:
        raise Invalido("Campo inválido")
    anos = arr.anos_da_versao(v)
    if ano not in (anos_com_regra(anos) if campo in CAMPOS else anos):
        raise Invalido("Ano fora do horizonte da versão" if campo not in CAMPOS else "Ano fora do horizonte da versão (só o ano anterior a ele também tem regra de distribuição)")
    if valor < 0 and campo != "ajustes":                                                # ajustes de avaliação podem ser negativos
        raise Invalido("O valor não pode ser negativo")
    if campo == "dist_pct" and valor > 100:
        raise Invalido("O percentual do lucro distribuído fica entre 0 e 100")
    con.execute("INSERT INTO patrimonio_valores(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, ano, valor))
    nome = CAMPOS[campo][0] if campo in CAMPOS else SALDOS_ALTERAVEIS[campo]
    arr.auditar(con, autor, vid, "salvar_patrimonio", f"{nome} {ano}: {valor}")


def voltar_ao_calculado(con: sqlite3.Connection, vid: int, campo: str, autor: str) -> None:
    arr.versao_editavel(con, vid)
    if campo not in SALDOS_ALTERAVEIS:
        raise Invalido("Só o capital e os ajustes de avaliação têm valores alterados à mão")
    con.execute("DELETE FROM patrimonio_valores WHERE versao_id=? AND campo=?", (vid, campo))
    arr.auditar(con, autor, vid, "voltar_patrimonio_ao_calculado", campo)


def _destinos(v, ano_origem: int) -> List[int]:
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos_com_regra(anos):
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    return destinos


def _copiar(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, destinos: List[int]) -> None:
    r = con.execute("SELECT valor FROM patrimonio_valores WHERE versao_id=? AND campo=? AND ano=?", (vid, campo, ano_origem)).fetchone()
    for a in destinos:
        con.execute("INSERT INTO patrimonio_valores(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                    "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, a, r["valor"] if r else 0.0))


def replicar(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    if campo not in CAMPOS:
        raise Invalido("Campo inválido")
    destinos = _destinos(v, ano_origem)
    _copiar(con, vid, campo, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_patrimonio", f"{CAMPOS[campo][0]}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todos(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    destinos = _destinos(v, ano_origem)
    for campo in CAMPOS:
        _copiar(con, vid, campo, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_todos_patrimonio", f"de {ano_origem}")
    return {"campos": len(CAMPOS), "anos_alterados": len(destinos)}


def calcular(con: sqlite3.Connection, vid: int, anos: List[int], juros_auto=None) -> dict:
    """Saldos de lucros acumulados, capital e ajustes por ano, com os passos do cálculo (todos em R$)."""
    from . import dre as svc_dre
    from . import realizado as svc_real
    val = _valores(con, vid)
    ini = svc_real.saldo_inicial(con, anos[0])
    base = ini["valores"] if ini else {}
    ll = next((l for l in svc_dre.ler(con, vid, juros_auto)["linhas"] if l["codigo"] == LINHA_LUCRO_LIQUIDO), None)
    lucro = {a: (ll["valores"].get(a, ll["valores"].get(str(a), 0.0)) if ll else 0.0) for a in anos}
    out = {k: {} for k in ("lucro_ano", "anterior", "transferido", "distribuicao", "lucros", "capital_anterior", "capital", "capital_calc", "ajuste_anterior", "ajustes", "ajustes_calc",
                           "lucro_base", "dist_gerada")}
    avisos = []
    ext = anos_com_regra(anos)
    out["lucro_base"] = {t: (base.get(CONTA_RESULTADO, 0.0) if t == ext[0] else lucro[t]) for t in ext}       # o ano anterior ao horizonte usa o resultado realizado
    for t in ext:                                                                            # distribuição decidida para o lucro de cada ano (paga no seguinte)
        minimo = val["dist_valor"].get(t, 0.0)                                                # valor base: o mínimo que a empresa paga
        pct = val["dist_pct"].get(t, 0.0)
        out["dist_gerada"][t] = pct / 100.0 * out["lucro_base"][t] if (pct > 0 and out["lucro_base"][t] > 0) else minimo      # com lucro, vale o %; sem lucro (ou sem %), o valor base
    lucros, capital, ajustes = base.get(CONTA_LUCROS, 0.0), base.get(CONTA_CAPITAL, 0.0), base.get(CONTA_AJUSTES, 0.0)
    for i, a in enumerate(anos):
        transferido = out["lucro_base"][a - 1] if i == 0 else lucro[anos[i - 1]]
        dist = out["dist_gerada"][a - 1]                                                      # paga no ano seguinte ao do lucro
        out["lucro_ano"][a], out["anterior"][a], out["transferido"][a], out["distribuicao"][a] = lucro[a], lucros, transferido, dist
        lucros = lucros + transferido - dist
        out["lucros"][a] = lucros
        if lucros < -1e-9 and dist > 0:
            avisos.append(f"{a}: a distribuição deixa os lucros acumulados negativos (R$ {lucros:,.0f} mil).".replace(",", "."))
        out["capital_anterior"][a], out["capital_calc"][a] = capital, capital                  # traz o saldo do ano anterior
        capital = val["capital"].get(a, capital)                                              # ...ou o valor alterado à mão
        out["capital"][a] = capital
        out["ajuste_anterior"][a], out["ajustes_calc"][a] = ajustes, ajustes
        ajustes = val["ajustes"].get(a, ajustes)
        out["ajustes"][a] = ajustes
    out["avisos"] = avisos
    out["saldo_inicial"] = {"ano": ini["ano"], "meses": ini.get("meses")} if ini else None
    out["premissas"] = val
    return out


def efeitos_de_calculo(c: dict) -> Dict[str, Dict[int, float]]:
    return {CONTA_LUCROS: c["lucros"], CONTA_CAPITAL: c["capital"], CONTA_AJUSTES: c["ajustes"]}


def efeitos_balanco(con: sqlite3.Connection, vid: int, anos: List[int], juros_auto=None) -> Dict[str, Dict[int, float]]:
    return efeitos_de_calculo(calcular(con, vid, anos, juros_auto))


def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    c = calcular(con, vid, anos)
    ext = anos_com_regra(anos)
    P = lambda campo: {"campo": campo, "nome": CAMPOS[campo][0], "unidade": CAMPOS[campo][1], "valores": {a: c["premissas"][campo].get(a, 0.0) for a in ext}}
    L = lambda id_, nome, valores, expl, estilo="": {"id": id_, "nome": nome, "valores": valores, "explicacao": expl, "estilo": estilo, "editavel": False}

    def A(id_, nome, valores, calculado, expl):                                              # linha que traz o ano anterior e pode ser alterada
        mao = c["premissas"][id_]
        return {**L(id_, nome, valores, expl, "total"), "editavel": True, "campo": id_, "calculado": calculado, "alterado": {a: a in mao for a in anos}}
    return {
        "versao": v, "anos": anos, "anos_extras": ext[:1], "saldo_inicial": c["saldo_inicial"], "avisos": c["avisos"],
        "premissas": [P("dist_pct"), P("dist_valor")],
        "resultado": [
            {"titulo": "Distribuição de lucros", "estendida": True, "linhas": [
                L("lucro_base", "Lucro líquido do ano (base da distribuição)", c["lucro_base"], "Lucro líquido da DRE do ano. No ano anterior ao horizonte é o resultado do último balanço realizado."),
                L("dist_gerada", "Distribuição do lucro do ano (paga no ano seguinte)", c["dist_gerada"], "Com lucro no ano e % informado, o % do lucro líquido; sem lucro (ou sem %), o valor base, que é o mínimo que a empresa paga. É paga aos sócios no ano seguinte e reduz os lucros acumulados daquele ano.", "total")]},
            {"titulo": "Lucros e prejuízos acumulados", "linhas": [
                L("anterior", "Saldo do ano anterior", c["anterior"], "No primeiro ano, o saldo do último balanço realizado; depois, o saldo final do ano anterior."),
                L("transferido", "(+) Resultado do exercício do ano anterior", c["transferido"], "O resultado do ano anterior passa para lucros acumulados quando o ano vira. No primeiro ano é o resultado do último balanço realizado; depois, o lucro líquido da DRE do ano anterior."),
                L("distribuicao", "(−) Distribuição paga no ano", c["distribuicao"], "Distribuição decidida para o lucro do ano anterior, paga neste ano."),
                L("lucros", "Saldo de lucros e prejuízos acumulados", c["lucros"], "Saldo do ano anterior + resultado transferido − distribuição. Vai para a conta Lucros e Prejuízos Acumulados do balanço.", "total")]},
            {"titulo": "Capital integralizado", "linhas": [
                L("capital_anterior", "Saldo do ano anterior", c["capital_anterior"], "Saldo do último balanço realizado, depois o saldo final do ano anterior."),
                A("capital", "Capital integralizado", c["capital"], c["capital_calc"], "Traz o saldo do ano anterior. Digite outro valor em qualquer ano para alterar (aporte ou redução); os anos seguintes trazem o novo saldo.")]},
            {"titulo": "Ajustes de avaliação patrimonial", "linhas": [
                L("ajuste_anterior", "Saldo do ano anterior", c["ajuste_anterior"], "Saldo do último balanço realizado, depois o saldo final do ano anterior."),
                A("ajustes", "Ajustes de avaliação patrimonial", c["ajustes"], c["ajustes_calc"], "Traz o saldo do ano anterior. Digite outro valor em qualquer ano para alterar (reavaliações, por exemplo); os anos seguintes trazem o novo saldo.")]},
        ],
    }


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    achatar = lambda d: {l["id"]: l for s in d["resultado"] for l in s["linhas"]}
    ia, ib = achatar(la), achatar(lb)
    linhas = []
    for id_, l in ia.items():
        q = ib.get(id_, l)
        linhas.append({"id": id_, "nome": l["nome"], "anos": {a: {"a": l["valores"][a], "b": q["valores"][a], "delta": q["valores"][a] - l["valores"][a],
                                                                    "pct": ((q["valores"][a] - l["valores"][a]) / abs(l["valores"][a]) * 100.0) if l["valores"][a] else None} for a in anos}})
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "linhas": linhas}
