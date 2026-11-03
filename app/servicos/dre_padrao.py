"""Premissas padronizadas das contas da DRE que não têm origem em outro módulo (abaixo do resultado bruto).

Cada conta é calculada de um jeito, e o padrão de cada ano é a média do realizado:
  * % de uma base (receita líquida, receita bruta ou custo do produto vendido): valor = % × base do ano (a base vem da própria DRE projetada).
    O % do realizado é o valor da conta ÷ a base do ano, e a média é a média simples dos anos escolhidos;
  * valor médio: a conta é o valor digitado (ou a média dos valores realizados dos anos escolhidos).
Despesas saem negativas e receitas positivas na DRE; o % e o valor se digitam positivos. Só as contas de resultado de revenda, de venda de produtos
não operacionais e de outras atividades podem ser negativas (digita-se o valor com sinal).
Enquanto nenhum valor for gravado, a conta fica zerada. O botão da média grava o resultado nos anos do orçamento depois do último ano escolhido.
As contas de produção (receita, deduções e CPV) e as de transportes ficam de fora."""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido

BASES = {"RL": ("DS018", "Receita líquida"), "RB": ("DS007", "Receita bruta"), "CPV": ("DS020", "Custo do produto vendido")}
# (conta, base, sinal): sinal -1 despesa, +1 receita, 0 valor com sinal digitado
LINHAS = [("DS032", "CPV", -1), ("DS033", None, 1), ("DS034", None, 1), ("DS035", None, 1), ("DS036", "CPV", -1), ("DS038", "RL", -1), ("DS039", "RL", -1),
          ("DS040", "RL", -1), ("DS041", "RB", -1), ("DS042", "CPV", -1), ("DS043", "CPV", -1), ("DS052", None, 1), ("DS055", None, 0), ("DS056", None, 0), ("DS057", None, 0),
          ("DS060", "RL", -1)]
CODIGOS = [c for c, _, _ in LINHAS]
ARRENDAMENTO = "DS032"


def _info() -> Dict[str, tuple]:
    return {c: (b, s) for c, b, s in LINHAS}


def _nomes(con: sqlite3.Connection) -> Dict[str, str]:
    return {r["codigo"]: r["nome"] for r in con.execute("SELECT codigo, nome FROM dre_linhas WHERE nivel='sintetica'")}


def parametros(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {}
    for r in con.execute("SELECT codigo, ano, valor FROM dre_padrao WHERE versao_id=?", (vid,)):
        d.setdefault(r["codigo"], {})[r["ano"]] = r["valor"]
    return d


def series(con: sqlite3.Connection, vid: int, anos: List[int], calc: Dict[str, Dict[int, float]]) -> Dict[str, Dict[int, float]]:
    """Valor de cada conta por ano (R$ mil, com o sinal da DRE). calc = DRE calculada até aqui (traz as bases: receita líquida, bruta e CPV)."""
    par = parametros(con, vid)
    out: Dict[str, Dict[int, float]] = {}
    for cod, base, sinal in LINHAS:
        p = par.get(cod, {})
        if base:
            ref = calc.get(BASES[base][0], {})
            out[cod] = {a: sinal * p.get(a, 0.0) / 100.0 * abs(ref.get(a, 0.0)) for a in anos}
        else:
            out[cod] = {a: (p.get(a, 0.0) if sinal == 0 else sinal * p.get(a, 0.0)) for a in anos}
    return out


# ---------------------------------------------------------------- realizado
def _anos_realizados(con: sqlite3.Connection) -> List[int]:
    return [r["ano"] for r in con.execute("SELECT ano FROM realizado_anos WHERE demonstrativo='DRE' ORDER BY ano")]


def _realizado(con: sqlite3.Connection) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {}
    for r in con.execute("SELECT codigo, ano, valor FROM realizado WHERE demonstrativo='DRE'"):
        d.setdefault(r["codigo"], {})[r["ano"]] = r["valor"]
    return d


def _por_ano(real: Dict[str, Dict[int, float]], cod: str, anos: List[int]) -> Dict[int, Optional[float]]:
    """% sobre a base (positivo) ou valor em R$, de cada ano fechado; None quando o ano não tem a conta ou a base."""
    base, sinal = _info()[cod]
    out: Dict[int, Optional[float]] = {}
    for a in anos:
        v = real.get(cod, {}).get(a)
        if v is None:
            out[a] = None
        elif base:
            b = abs(real.get(BASES[base][0], {}).get(a, 0.0))
            out[a] = abs(v) / b * 100.0 if b else None
        else:
            out[a] = (v if sinal == 0 else abs(v)) / 1000.0
    return out


def _media(serie: Dict[int, Optional[float]], sel: List[int]) -> Optional[float]:
    v = [serie[a] for a in sel if serie.get(a) is not None]
    return sum(v) / len(v) if v else None


def previa(con: sqlite3.Connection, vid: int) -> dict:
    from .capital_giro import opcoes_periodo
    arr.obter_versao(con, vid)
    anos, real, nomes = _anos_realizados(con), _realizado(con), _nomes(con)
    opcoes = opcoes_periodo(anos)
    campos = []
    for cod, base, sinal in LINHAS:
        if cod not in nomes:
            continue
        ps = _por_ano(real, cod, anos)
        campos.append({"codigo": cod, "nome": nomes[cod], "base": BASES[base][1] if base else None, "unidade": "%" if base else "R$ mil", "sinal": sinal,
                       "por_ano": ps, "por_opcao": {o["id"]: _media(ps, o["anos"]) for o in opcoes}})
    return {"anos": anos, "opcoes": opcoes, "campos": campos, "padrao": anos[-3:]}


def atualizar(con: sqlite3.Connection, vid: int, autor: str, anos_escolhidos: Optional[List[int]] = None) -> dict:
    """Grava a média dos anos fechados escolhidos (padrão: o último) nos anos do horizonte que vêm depois do último escolhido."""
    v = arr.versao_editavel(con, vid)
    anos_real = _anos_realizados(con)
    if not anos_real:
        raise Invalido("Ainda não há DRE realizada. Suba os anos fechados na tela Realizado.")
    escolhidos = sorted(set(anos_escolhidos)) if anos_escolhidos else [anos_real[-1]]
    fora = [a for a in escolhidos if a not in anos_real]
    if fora:
        raise Invalido(f"Não há DRE realizada de {', '.join(map(str, fora))}")
    ultimo = escolhidos[-1]
    destinos = [a for a in arr.anos_da_versao(v) if a > ultimo]
    if not destinos:
        raise Invalido(f"O horizonte da versão não tem anos depois de {ultimo}")
    real, nomes, feitos = _realizado(con), _nomes(con), 0
    for cod in CODIGOS:
        if cod not in nomes:
            continue
        m = _media(_por_ano(real, cod, anos_real), escolhidos)
        if m is None:
            continue
        for a in destinos:
            con.execute("INSERT INTO dre_padrao(versao_id, codigo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, codigo, ano) DO UPDATE SET valor=excluded.valor",
                        (vid, cod, a, round(m, 4)))
        feitos += 1
    arr.auditar(con, autor, vid, "atualizar_dre_padrao", f"média de {', '.join(map(str, escolhidos))} para {len(destinos)} ano(s)")
    return {"anos_usados": escolhidos, "contas": feitos, "anos_alterados": len(destinos)}


# ---------------------------------------------------------------- digitação
def _validar(cod: str) -> None:
    if cod not in CODIGOS:
        raise Invalido("Conta sem premissa padronizada")


def salvar(con: sqlite3.Connection, vid: int, cod: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    _validar(cod)
    base, sinal = _info()[cod]
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if valor < 0 and (base or sinal != 0):
        raise Invalido("Digite o valor positivo (a DRE aplica o sinal da conta)")
    if base and valor > 1000:
        raise Invalido("O percentual está fora do esperado")
    con.execute("INSERT INTO dre_padrao(versao_id, codigo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, codigo, ano) DO UPDATE SET valor=excluded.valor", (vid, cod, ano, valor))
    arr.auditar(con, autor, vid, "salvar_dre_padrao", f"{cod} {ano}: {valor}")


def _destinos(v, ano_origem: int) -> List[int]:
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    d = [a for a in anos if a > ano_origem]
    if not d:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    return d


def replicar(con: sqlite3.Connection, vid: int, cod: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    _validar(cod)
    destinos = _destinos(v, ano_origem)
    r = con.execute("SELECT valor FROM dre_padrao WHERE versao_id=? AND codigo=? AND ano=?", (vid, cod, ano_origem)).fetchone()
    for a in destinos:
        con.execute("INSERT INTO dre_padrao(versao_id, codigo, ano, valor) VALUES(?,?,?,?) ON CONFLICT(versao_id, codigo, ano) DO UPDATE SET valor=excluded.valor",
                    (vid, cod, a, r["valor"] if r else 0.0))
    arr.auditar(con, autor, vid, "replicar_dre_padrao", f"{cod}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_todos(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str) -> dict:
    v = arr.versao_editavel(con, vid)
    destinos = _destinos(v, ano_origem)
    for cod in CODIGOS:
        replicar(con, vid, cod, ano_origem, autor)
    return {"campos": len(CODIGOS), "anos_alterados": len(destinos)}


# ---------------------------------------------------------------- tela
def ler(con: sqlite3.Connection, vid: int) -> dict:
    from . import dre as svc_dre
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    nomes, par = _nomes(con), parametros(con, vid)
    d = svc_dre.ler(con, vid)
    calc = {l["codigo"]: l["valores"] for l in d["linhas"]}
    anos_real, real = _anos_realizados(con), _realizado(con)
    ultimo = anos_real[-1] if anos_real else None
    premissas = []
    for cod, base, sinal in LINHAS:
        if cod not in nomes:
            continue
        premissas.append({"codigo": cod, "nome": nomes[cod], "base": BASES[base][1] if base else None, "unidade": "%" if base else "R$ mil", "sinal": sinal,
                          "valores": {a: par.get(cod, {}).get(a, 0.0) for a in anos}})
    resultado = []
    for cod in [BASES["RL"][0], BASES["RB"][0], BASES["CPV"][0]] + CODIGOS:
        if cod not in calc:
            continue
        resultado.append({"codigo": cod, "nome": nomes.get(cod, cod), "valores": calc[cod], "base": cod in {b[0] for b in BASES.values()},
                          "realizado": (real.get(cod, {}).get(ultimo) / 1000.0 if ultimo is not None and real.get(cod, {}).get(ultimo) is not None else None)})
    return {"versao": v, "anos": anos, "ultimo_ano": ultimo, "premissas": premissas, "resultado": resultado}
