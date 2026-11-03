"""Balanço patrimonial (BP Sintético do Fechamento Contábil, o balanço pequeno). Somente leitura: os valores NÃO são digitados.
Cada conta recebe, em R$ e por ano (saldo em 31/12):
  * Estoque de produtos acabados      ← estoque dos produtos no Resultado por produto (valor a custo);
  * Dívidas (circulante e não circ.)  ← principal em aberto no Endividamento (todas as empresas):
        curto prazo (vence até 31/12 do ano seguinte) e longo prazo, separados em Custeio + Capital de Giro × Investimento;
  * Resultado do Exercício            ← Lucro Líquido do ano na DRE;
  * qualquer conta                    ← premissas de balanço adicionadas à versão (valor digitado × sinal da premissa).
As demais contas ficam zeradas até existir o módulo ou a premissa que as alimente. Se houver balanço realizado de um ano anterior ao horizonte, ele aparece como Saldo inicial (coluna só de leitura). Grupos são a soma das contas; no fim aparece a
diferença entre o Ativo e o Passivo + Patrimônio Líquido.
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional, Tuple

from . import arrendamentos as arr
from .arrendamentos import Invalido
from . import realizado as svc_real

MIL = 1000.0
RAIZ_ATIVO, RAIZ_PASSIVO = "SA", "SP"
LINHA_ESTOQUE, LINHA_RESULTADO = "SA10", "SP26"
LINHA_ESTOQUE_GADO = "SA10G"          # linha só do orçamento: estoque de gado de corte, separado do estoque de produtos acabados
# Capital de giro → conta do balanço
LINHAS_CAPITAL_GIRO = {"receber": "SA08", "outros_creditos": "SA09", "realizavel": "SA17", "participacoes": "SA18", "intangivel": "SA27",
                       "consorcios_curto": "SP13", "consorcios_longo": "SP19", "outras_lp": "SP20", "rotacao": "SA13", "preparo": "SA14", "insumos": "SA11", "lavoura": "SA12",
                       "fornecedores": "SP07", "outras": "SP10", "trabalhistas": "SP11", "impostos": "SP09"}
LINHAS_DIVIDA = {("curto", "giro"): "SP08", ("curto", "invest"): "SP12", ("longo", "giro"): "SP17", ("longo", "invest"): "SP18"}

COMO = {
    "estoque_gado": "Valor a custo do gado de corte estocado para o ano seguinte (Resultado por produto, produtos marcados com estoque em gado): quantidade estocada × custo médio do ano.",
    "estoque": "Valor a custo da produção estocada para o ano seguinte (Resultado por produto, soma das culturas): quantidade estocada × custo médio do ano.",
    "resultado": "Lucro Líquido do ano da DRE (saldo do exercício).",
    "depreciacao": "Depreciação acumulada do último balanço realizado, menos a depreciação de cada ano (bens existentes e novos investimentos, tela Investimentos), acumulada ano a ano. Fica negativa.",
    "patrimonio": "Patrimônio líquido projetado (tela Premissas de dividendos): lucros acumulados = saldo anterior + resultado do ano anterior − distribuição de lucros; capital = saldo anterior + aportes; ajustes de avaliação = saldo anterior + variação. O saldo anterior do primeiro ano é o do último balanço realizado.",
    "mantem": "Mantém o saldo do último balanço realizado, sem variação, porque esta conta ainda não tem módulo nem regra no orçamento: o que já existia na empresa carrega para frente. Investimentos, desinvestimentos e premissas de balanço vinculados a ela somam sobre esse saldo.",
    "investimentos": "Saldo do último balanço realizado + investimentos do ano − desinvestimentos do ano, acumulado ano a ano, dos tipos de investimento vinculados a esta conta (tela Investimentos). A depreciação está na depreciação acumulada.",
    ("cg", "receber"): "Contas a receber do Capital de giro: receita líquida × prazo médio de receber ÷ dias do ano.",
    **{("cg", k): "Saldo digitado por ano, ou a média dos saldos dos anos fechados que você escolheu ao gravar (tela Capital de giro, contas de saldo). Enquanto nada for gravado, a conta mantém o saldo do último balanço realizado."
       for k in ("realizavel", "participacoes", "intangivel", "consorcios_curto", "consorcios_longo", "outras_lp")},
    ("cg", "outros_creditos"): "Outros créditos a receber do Capital de giro: saldo digitado por ano, ou a média dos saldos dos anos fechados que você escolheu ao gravar.",
    ("cg", "rotacao"): "Rotação de cultura a apropriar do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
    ("cg", "preparo"): "Preparo de solo e despesas a apropriar do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
    ("cg", "insumos"): "Estoque de insumos do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
    ("cg", "lavoura"): "Lavoura em formação do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
    ("cg", "fornecedores"): "Fornecedores do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
    ("cg", "outras"): "Outras obrigações do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
    ("cg", "impostos"): "Impostos a pagar do Capital de giro: deduções da receita × prazo médio ÷ dias do ano.",
    ("cg", "trabalhistas"): "Obrigações trabalhistas do Capital de giro: custo do produto vendido × prazo médio ÷ dias do ano.",
    "caixa": "Caixa de fechamento do Fluxo de caixa: caixa do ano anterior + fluxo do ano (operacional, investimentos e financiamentos) + dívida de giro automática gerada, ou − a que foi amortizada com a sobra de caixa. Nunca fica abaixo do caixa mínimo (% do custo de produção do Capital de giro) porque o sistema gera dívida de giro.",
    ("curto", "giro"): "Principal em aberto em 31/12 que vence até 31/12 do ano seguinte, dos tipos Custeio, Capital de Giro e demais (exceto Investimento), todas as empresas do Endividamento, mais as novas captações de custeio e capital de giro. A dívida de giro gerada pelo Fluxo de caixa aparece na linha própria logo abaixo.",
    "divida_auto": "Dívida de curto prazo gerada automaticamente pelo Fluxo de caixa quando o caixa ficaria abaixo do mínimo (% do custo de produção do Capital de giro). Em cada ano: saldo anterior + dívida gerada − a amortizada com a sobra de caixa. Os juros dela estão nas despesas financeiras da DRE. Substitui o plug de dívida da planilha.",
    ("curto", "invest"): "Principal em aberto em 31/12 que vence até 31/12 do ano seguinte, do tipo Investimento (parcela de curto prazo), todas as empresas do Endividamento, mais o financiamento dos investimentos (tela Investimentos).",
    ("longo", "giro"): "Principal em aberto em 31/12 que vence depois de 31/12 do ano seguinte, dos tipos Custeio, Capital de Giro e demais (exceto Investimento), todas as empresas, mais as novas captações de custeio e capital de giro.",
    ("longo", "invest"): "Principal em aberto em 31/12 que vence depois de 31/12 do ano seguinte, do tipo Investimento, todas as empresas do Endividamento, mais o financiamento dos investimentos (tela Investimentos).",
}
TEXTO_ORIGEM = {"estoque": "Resultado por produto · estoque", "estoque_gado": "Resultado por produto · estoque de gado", "resultado": "DRE · lucro líquido", "investimentos": "Investimentos · tipos vinculados", "mantem": "Balanço realizado · saldo mantido", "caixa": "Fluxo de caixa · caixa de fechamento", "divida_auto": "Fluxo de caixa · dívida de giro automática", "patrimonio": "Premissas de dividendos", "depreciacao": "Investimentos · depreciação",
                **{("cg", k): "Capital de giro · " + k for k in LINHAS_CAPITAL_GIRO},
                ("curto", "giro"): "Endividamento · curto prazo", ("curto", "invest"): "Endividamento · curto prazo investimento",
                ("longo", "giro"): "Endividamento · longo prazo", ("longo", "invest"): "Endividamento · longo prazo investimento"}


def _com_estoque_gado(estrutura: List[dict]) -> List[dict]:
    """Insere no ativo circulante, logo depois do estoque de produtos acabados, a linha do estoque de gado de corte (entra na soma do grupo)."""
    i = next((k for k, l in enumerate(estrutura) if l["codigo"] == LINHA_ESTOQUE), None)
    if i is None:
        return estrutura
    ref = estrutura[i]
    nova = {**ref, "codigo": LINHA_ESTOQUE_GADO, "nome": "Estoque de gado de corte", "filhos": [], "calculo": "entrada", "tipo": "account", "ordem": ref.get("ordem", 0) + 0.5}
    pai = next((l for l in estrutura if l["codigo"] == ref["pai"]), None)
    if pai is not None:
        pai["filhos"] = list(pai["filhos"]) + [LINHA_ESTOQUE_GADO]
    return estrutura[: i + 1] + [nova] + estrutura[i + 1:]


def _estrutura(con: sqlite3.Connection) -> List[dict]:
    rows = [dict(r) for r in con.execute("SELECT * FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo")]
    por_pai: Dict[str, List[dict]] = {}
    for r in rows:
        por_pai.setdefault(r["pai"], []).append(r)
    ordenada: List[dict] = []

    def visitar(pai: str, nivel: int) -> None:
        for r in por_pai.get(pai, []):
            filhos = por_pai.get(r["codigo"], [])
            r["nivel_hierarquia"], r["filhos"] = nivel, [f["codigo"] for f in filhos]
            r["calculo"] = "soma" if filhos else ("entrada" if r["tipo"] == "account" else "sem_formula")
            ordenada.append(r)
            visitar(r["codigo"], nivel + 1)

    visitar("", 0)
    return _com_estoque_gado(ordenada)


def _calcular(estrutura: List[dict], entradas: Dict[str, Dict[int, float]], anos: List[int]) -> Dict[str, Dict[int, float]]:
    por_codigo = {l["codigo"]: l for l in estrutura}
    memo: Dict[str, Dict[int, float]] = {}

    def valor(c: str) -> Dict[int, float]:
        if c in memo:
            return memo[c]
        memo[c] = {a: 0.0 for a in anos}
        l = por_codigo.get(c)
        if l is None:
            return memo[c]
        if l["calculo"] == "entrada":
            memo[c] = {a: entradas.get(c, {}).get(a, 0.0) for a in anos}
        elif l["calculo"] == "soma":
            memo[c] = {a: sum(valor(f)[a] for f in l["filhos"]) for a in anos}
        return memo[c]

    for l in estrutura:
        valor(l["codigo"])
    return memo


def _eh_investimento(tipo: str) -> bool:
    return (tipo or "").strip().lower().startswith("invest")


def _origens(con: sqlite3.Connection, vid: int, estrutura: List[dict], anos: List[int], juros_auto: Dict[int, float]) -> tuple:
    """(valores por conta, origem de cada conta, premissas por conta, extras). Sem o caixa e sem a dívida de giro automática: eles vêm do fluxo de caixa."""
    from . import dividas as svc_div
    from . import dre as svc_dre
    from . import premissas_dem as svc_pd
    from . import resultado as svc_res

    contas = {l["codigo"] for l in estrutura if l["calculo"] == "entrada"}
    auto: Dict[str, Dict[int, float]] = {}
    origem: Dict[str, object] = {}

    def somar(cod: str, serie: Dict[int, float], chave) -> None:
        if cod not in contas:
            return
        acc = auto.setdefault(cod, {a: 0.0 for a in anos})
        for a in anos:
            acc[a] += serie.get(a, 0.0)
        origem[cod] = chave

    res = svc_res.calcular(con, vid)
    est = next((l for l in res["consolidado"].get("estoque", []) if l["id"] == "estoque_valor"), None)
    est_gado = next((l for l in res["consolidado"].get("estoque", []) if l["id"] == "estoque_valor_gado"), None)
    gado = {int(a): v for a, v in est_gado["valores"].items()} if est_gado else {}
    total = {int(a): v for a, v in est["valores"].items()} if est else {}
    somar(LINHA_ESTOQUE, {a: v - gado.get(a, 0.0) for a, v in total.items()}, "estoque")
    somar(LINHA_ESTOQUE_GADO, gado, "estoque_gado")
    dre = svc_dre.ler(con, vid, juros_auto)
    ll = next((l for l in dre["linhas"] if l["codigo"] == "DS062"), None)
    if ll:
        somar(LINHA_RESULTADO, {int(a): v for a, v in ll["valores"].items()}, "resultado")
    from . import capital_giro as svc_cg
    cg = {l["id"]: l for sec in svc_cg.ler(con, vid)["resultado"] for l in sec["linhas"]}
    extras = {"cg": cg}
    for chave, cod in LINHAS_CAPITAL_GIRO.items():
        if chave in cg and cg[chave].get("informado", True):                  # conta de saldo sem nada gravado: mantém o saldo realizado
            somar(cod, {int(a): v for a, v in cg[chave]["valores"].items()}, ("cg", chave))
    from . import investimentos as svc_inv
    ini = svc_real.saldo_inicial(con, anos[0])
    for cod, fluxo in svc_inv.efeitos_balanco(con, vid, anos).items():      # conta padrão dos investimentos: saldo realizado + investido − desinvestido
        saldo = (ini["valores"].get(cod, 0.0) if ini else 0.0)
        serie = {}
        for a in anos:
            saldo += fluxo[a]
            serie[a] = saldo
        somar(cod, serie, "investimentos")
    dep = svc_inv.depreciacao(con, vid, anos)                                  # depreciação acumulada: saldo realizado (negativo) − depreciação de cada ano
    if dep["existente"] or any(dep["total"].values()):
        acumulada = dep["existente"]["acumulada"] if dep["existente"] else 0.0
        serie = {}
        for a in anos:
            acumulada -= dep["total"][a]
            serie[a] = acumulada
        somar(svc_inv.CODIGO_DEPR_ACUMULADA, serie, "depreciacao")
    d = svc_div.balanco(con, vid, "todas")
    from . import captacoes as svc_cap
    novas = svc_cap.calcular(con, vid, anos)                                  # novas captações e financiamento dos investimentos (já em R$)
    for prazo in ("curto", "longo"):
        for grupo in ("giro", "invest"):
            serie = {a: 0.0 for a in anos}
            for tipo, por_ano in d[prazo].items():
                if _eh_investimento(tipo) == (grupo == "invest"):
                    for a in anos:
                        serie[a] += por_ano.get(a, 0.0) / MIL
            for c in novas:
                if c["grupo"] == grupo:
                    for a in anos:
                        serie[a] += c[prazo][a]
            somar(LINHAS_DIVIDA[(prazo, grupo)], serie, (prazo, grupo))
    from . import patrimonio as svc_pat
    pat = svc_pat.calcular(con, vid, anos, juros_auto)
    extras["patrimonio"] = pat
    for cod, serie in svc_pat.efeitos_de_calculo(pat).items():                # lucros acumulados, capital e ajustes de avaliação
        somar(cod, serie, "patrimonio")
    if ini:                                                                   # o que já existe na empresa carrega para frente
        for cod in sorted(contas):
            if cod in origem or ini["valores"].get(cod) is None:
                continue
            somar(cod, {a: ini["valores"][cod] for a in anos}, "mantem")
    prem: Dict[str, List[str]] = {}
    for cod, lista in svc_pd.efeitos(con, vid, "balanco", anos).items():
        if cod not in contas:
            continue
        acc = auto.setdefault(cod, {a: 0.0 for a in anos})
        for p in lista:
            for a in anos:
                acc[a] += p["valores"][a]
            prem.setdefault(cod, []).append(p["nome"])
    return auto, origem, prem, extras


CODIGO_DIVIDA_AUTO = "SPAUTO"          # linha só do orçamento: não existe no balanço do Fechamento Contábil


def _com_divida_automatica(estrutura: List[dict]) -> List[dict]:
    """Insere no passivo circulante, logo depois de SP08, a linha da dívida de giro gerada pelo fluxo de caixa (entra na soma do grupo)."""
    i = next((k for k, l in enumerate(estrutura) if l["codigo"] == "SP08"), None)
    if i is None:
        return estrutura
    ref = estrutura[i]
    nova = {**ref, "codigo": CODIGO_DIVIDA_AUTO, "nome": "Dívida de giro automática (gerada pelo fluxo de caixa)", "filhos": [], "calculo": "entrada", "tipo": "account",
            "ordem": ref.get("ordem", 0) + 0.5}
    pai = next((l for l in estrutura if l["codigo"] == ref["pai"]), None)
    if pai is not None:
        pai["filhos"] = list(pai["filhos"]) + [CODIGO_DIVIDA_AUTO]
    return estrutura[: i + 1] + [nova] + estrutura[i + 1:]


def _texto_origem(origem, premissas) -> Optional[str]:
    base = TEXTO_ORIGEM.get(origem)
    if premissas:
        return f"{base} + premissas" if base else "Premissas · valores digitados"
    return base


def _explicacao(l: dict, por_codigo: Dict[str, dict], origem, premissas: List[str]) -> str:
    nome = lambda c: por_codigo[c]["nome"] if c in por_codigo else c
    if l["calculo"] == "soma":
        return "Soma das linhas abaixo: " + "; ".join(nome(c) for c in l["filhos"]) + "."
    if l["calculo"] != "entrada":
        return ""
    extra = f" Inclui as premissas de balanço vinculadas a esta conta: {', '.join(premissas)} (valor digitado, ou % sobre o campo base, com o sinal da premissa)." if premissas else ""
    if origem is not None:
        return COMO[origem] + extra
    if premissas:
        return f"Soma das premissas de balanço vinculadas a esta conta: {', '.join(premissas)} (valor digitado, ou % sobre o campo base, com o sinal da premissa; em R$)."
    return "Ainda não há módulo do orçamento nem premissa vinculada a esta conta; fica zerada até existir."


def ler(con: sqlite3.Connection, vid: int, fl: Optional[dict] = None) -> dict:
    """fl: resultado de fluxo.projetar, quando quem chama já o calculou (evita refazer)."""
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    base = {"versao": v, "anos": anos, "linhas": [], "estrutura": False}
    estrutura = _estrutura(con)
    if not estrutura:
        return base
    from . import fluxo as svc_fluxo
    fl = fl or svc_fluxo.projetar(con, vid)                                 # caixa de fechamento e dívida de giro automática (já com os juros convergidos)
    if fl["ativo"]:
        auto, origem, prem = fl["auto"], fl["origem"], fl["prem"]
        auto["SA07"] = dict(fl["caixa"]); origem["SA07"] = "caixa"
        estrutura = _com_divida_automatica(estrutura)                       # linha própria, logo abaixo da dívida de custeio e capital de giro
        auto[CODIGO_DIVIDA_AUTO] = dict(fl["divida"]); origem[CODIGO_DIVIDA_AUTO] = "divida_auto"
        calc = _calcular(estrutura, auto, anos)                             # as premissas percentuais já foram aplicadas dentro do fluxo de caixa
    else:
        auto, origem, prem, _ = _origens(con, vid, estrutura, anos, {a: 0.0 for a in anos})
        from . import premissas_dem as svc_pd                               # premissas percentuais: % × campo base
        calc, _, nomes_pct = svc_pd.aplicar_percentuais(con, vid, "balanco", anos, auto, lambda e: _calcular(estrutura, e, anos))
        for cod, nomes in nomes_pct.items():
            prem.setdefault(cod, []).extend(nomes)
    por_codigo = {l["codigo"]: l for l in estrutura}
    linhas = [{"codigo": l["codigo"], "nome": l["nome"], "pai": l["pai"], "nivel": l["nivel_hierarquia"], "calculo": l["calculo"],
               "unidade": "R$ mil", "valores": calc[l["codigo"]],
               "origem": _texto_origem(origem.get(l["codigo"]), prem.get(l["codigo"])),
               "premissas": prem.get(l["codigo"], []), "explicacao": _explicacao(l, por_codigo, origem.get(l["codigo"]), prem.get(l["codigo"], []))}
              for l in estrutura]
    if RAIZ_ATIVO in calc and RAIZ_PASSIVO in calc:                      # conferência do balanço
        linhas.append({"codigo": "DIF", "nome": "Diferença (Ativo − Passivo e patrimônio líquido)", "pai": "", "nivel": 0, "calculo": "diferenca",
                       "unidade": "R$ mil", "valores": {a: calc[RAIZ_ATIVO][a] - calc[RAIZ_PASSIVO][a] for a in anos}, "origem": None, "premissas": [],
                       "explicacao": "Ativo total − Passivo e patrimônio líquido total. Fica diferente de zero enquanto houver contas sem origem; "
                                     "o balanço fecha quando a diferença for zero."})
    ini = svc_real.saldo_inicial(con, anos[0])                              # balanço realizado do último ano fechado, antes do horizonte
    if ini:
        val = ini["valores"]
        for l in linhas:
            if l["calculo"] != "diferenca":
                l["inicial"] = val.get(l["codigo"])
        for l in linhas:
            if l["calculo"] == "diferenca":
                l["inicial"] = val.get(RAIZ_ATIVO, 0.0) - val.get(RAIZ_PASSIVO, 0.0)
        base["saldo_inicial"] = {"ano": ini["ano"], "meses": ini.get("meses")}
    base.update(linhas=linhas, estrutura=True)
    return base


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    ib = {l["codigo"]: l for l in lb["linhas"]}
    linhas = []
    for l in (la["linhas"] or lb["linhas"]):
        va, vb = l["valores"], ib.get(l["codigo"], l)["valores"]
        linhas.append({"codigo": l["codigo"], "nome": l["nome"], "nivel": l["nivel"], "unidade": l["unidade"], "calculo": l["calculo"],
                       "anos": {a: {"a": va.get(a, 0.0), "b": vb.get(a, 0.0), "delta": vb.get(a, 0.0) - va.get(a, 0.0),
                                    "pct": ((vb.get(a, 0.0) - va.get(a, 0.0)) / abs(va[a]) * 100.0) if va.get(a) else None} for a in anos}})
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "linhas": linhas}
