"""Motor do caixa: caixa de fechamento e dívida de giro automática, ano a ano. Não é o demonstrativo de fluxo de caixa: serve para calcular o caixa do balanço.

Substitui os "plugs" manuais da planilha de orçamento (Plug - Caixa e Plug - Dívida) por um cálculo automático:

  Fluxo do ano (a partir da variação de cada conta do balanço, antes do caixa e da dívida automática):
      lucro líquido + depreciação − variação do capital de giro operacional ± outros ativos e passivos        = fluxo operacional
      − investimentos líquidos no imobilizado                                                                 = fluxo de investimentos
      ± captações e amortizações das dívidas (existentes, novas e financiamentos de investimentos) − distribuição de lucros
      ± capital e ajustes de avaliação ± outras variações do patrimônio                                       = fluxo de financiamento
  Caixa mínimo = % do custo de produção informado no Capital de giro.

  Dívida de giro automática (curto prazo; linha própria no passivo circulante do balanço, logo abaixo da dívida de custeio e capital de giro):
      se o caixa antes dela ficar abaixo do mínimo, o sistema gera dívida; se sobrar, amortiza o saldo dessa dívida; acabando a dívida, a sobra fica no caixa.
      A dívida entra (ou sai) no meio do ano e os juros incidem sobre o saldo médio. Os juros reduzem o caixa do mesmo ano, e isso tem solução direta:
          K = caixa anterior + fluxo sem os juros da dívida automática − taxa × saldo anterior
          variação da dívida N = (caixa mínimo − K) ÷ (1 − taxa ÷ 2), limitada a −saldo anterior
          juros = taxa × (saldo anterior + saldo novo) ÷ 2
      Como a DRE e o imposto também dependem dos juros, o cálculo repete até convergir (poucas voltas).
  Taxa por ano: digitada, ou a média (ponderada pelo valor) das captações de custeio ou de capital de giro cadastradas naquele ano.
  Com isso o balanço fecha: a diferença entre ativo e passivo deve ser zero.
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido

ORIGENS = {0: "Digitar a taxa", 1: "Média das captações de custeio do ano", 2: "Média das captações de capital de giro do ano"}
CONTA_CAIXA, CONTA_DIVIDA_GIRO_CP = "SA07", "SP08"
NCG_ATIVO = ("SA08", "SA10", "SA10G", "SA11", "SA12", "SA13", "SA14")
NCG_PASSIVO = ("SP07", "SP09", "SP10", "SP11")
OUTROS_ATIVO = ("SA09", "SA17", "SA18", "SA27")
OUTROS_PASSIVO = ("SP13", "SP19", "SP20")
DIVIDAS = ("SP08", "SP12", "SP17", "SP18")
DEPRECIACAO = "SA26"
CAPITAL_AJUSTES = ("SP23", "SP24")
LUCROS, RESULTADO = "SP25", "SP26"
MAX_VOLTAS, TOLERANCIA = 12, 1e-6


# ---------------------------------------------------------------- premissas da taxa da dívida automática
def _premissas(con: sqlite3.Connection, vid: int) -> Dict[str, Dict[int, float]]:
    d: Dict[str, Dict[int, float]] = {"origem": {}, "taxa": {}}
    for r in con.execute("SELECT campo, ano, valor FROM giro_auto_premissas WHERE versao_id=?", (vid,)):
        d.setdefault(r["campo"], {})[r["ano"]] = r["valor"]
    return d


def salvar_premissa(con: sqlite3.Connection, vid: int, campo: str, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    if campo not in ("origem", "taxa"):
        raise Invalido("Campo inválido")
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    if campo == "origem" and int(valor) not in ORIGENS:
        raise Invalido("A origem da taxa deve ser: 0 (digitar), 1 (média de custeio) ou 2 (média de capital de giro)")
    if campo == "taxa" and not 0 <= valor <= 100:
        raise Invalido("A taxa de juros fica entre 0 e 100% ao ano")
    con.execute("INSERT INTO giro_auto_premissas(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, ano, float(int(valor)) if campo == "origem" else valor))
    arr.auditar(con, autor, vid, "salvar_taxa_divida_giro", f"{campo} {ano}: {valor}")


def replicar_premissa(con: sqlite3.Connection, vid: int, campo: str, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    if campo not in ("origem", "taxa"):
        raise Invalido("Campo inválido")
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido(f"{ano_origem} é o último ano do horizonte; não há anos seguintes para replicar")
    r = con.execute("SELECT valor FROM giro_auto_premissas WHERE versao_id=? AND campo=? AND ano=?", (vid, campo, ano_origem)).fetchone()
    for a in destinos:
        con.execute("INSERT INTO giro_auto_premissas(versao_id, campo, ano, valor) VALUES(?,?,?,?) "
                    "ON CONFLICT(versao_id, campo, ano) DO UPDATE SET valor=excluded.valor", (vid, campo, a, r["valor"] if r else 0.0))
    arr.auditar(con, autor, vid, "replicar_taxa_divida_giro", f"{campo}: de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def _taxas(con: sqlite3.Connection, vid: int, anos: List[int]) -> dict:
    """Taxa efetiva (% a.a.) de cada ano, com a origem usada e os avisos."""
    prem = _premissas(con, vid)
    caps = con.execute("SELECT tipo, ano, valor, taxa FROM novas_captacoes WHERE versao_id=?", (vid,)).fetchall()
    taxa, origem, avisos = {}, {}, []
    for a in anos:
        o = int(prem["origem"].get(a, 0))
        origem[a] = o
        if o == 0:
            taxa[a] = prem["taxa"].get(a, 0.0)
            continue
        tipo = "custeio" if o == 1 else "capital_giro"
        do_ano = [c for c in caps if c["tipo"] == tipo and c["ano"] == a]
        total = sum(c["valor"] for c in do_ano)
        if total > 0:
            taxa[a] = sum(c["valor"] * c["taxa"] for c in do_ano) / total
        else:
            taxa[a] = 0.0
            avisos.append(f"{a}: não há captação de {'custeio' if o == 1 else 'capital de giro'} cadastrada nesse ano para calcular a média; usei taxa zero. Cadastre uma captação ou digite a taxa.")
    return {"taxa": taxa, "origem": origem, "avisos": avisos, "premissas": prem}


# ---------------------------------------------------------------- cálculo
def _serie(auto: Dict[str, Dict[int, float]], ini: Dict[str, float], cod: str, anos: List[int]) -> Dict[int, float]:
    """Valores da conta em cada ano (antes do caixa e da dívida automática); a chave anos[0]-1 traz o saldo realizado."""
    s = {anos[0] - 1: ini.get(cod, 0.0)}
    for a in anos:
        s[a] = auto.get(cod, {}).get(a, 0.0)
    return s


def _projetar_uma_volta(con: sqlite3.Connection, vid: int, estrutura: List[dict], anos: List[int], ini: Dict[str, float], ji: Dict[int, float], tx: dict) -> dict:
    from . import balanco as svc_bp
    auto, origem, prem, extras = svc_bp._origens(con, vid, estrutura, anos, ji)
    from . import premissas_dem as svc_pd                                                    # premissas percentuais de balanço também movem o caixa
    _, auto, nomes_pct = svc_pd.aplicar_percentuais(con, vid, "balanco", anos, auto, lambda e: svc_bp._calcular(estrutura, e, anos))
    for cod, nomes in nomes_pct.items():
        prem.setdefault(cod, []).extend(nomes)
    sp = lambda cod: _serie(auto, ini, cod, anos)
    delta = lambda cod: {a: sp(cod)[a] - sp(cod)[a - 1] for a in anos}
    soma = lambda cods, f: {a: sum(f(c)[a] for c in cods) for a in anos}
    contas = [l["codigo"] for l in estrutura if l["calculo"] == "entrada"]
    todos_ativos = [c for c in contas if c.startswith("SA") and c != CONTA_CAIXA]
    todos_passivos = [c for c in contas if c.startswith("SP")]
    total = {a: sum(delta(c)[a] for c in todos_passivos) - sum(delta(c)[a] for c in todos_ativos) for a in anos}      # variação do caixa pela identidade do balanço
    cg = extras["cg"]
    minimo = {a: cg["caixa"]["valores"].get(a, cg["caixa"]["valores"].get(str(a), 0.0)) if "caixa" in cg else 0.0 for a in anos}
    pat = extras["patrimonio"]
    lucro = {a: auto.get(RESULTADO, {}).get(a, 0.0) for a in anos}
    dist = {a: pat["distribuicao"][a] for a in anos}
    # categorias do fluxo
    dep = {a: -delta(DEPRECIACAO)[a] for a in anos}
    ncg = {a: -sum(delta(c)[a] for c in NCG_ATIVO if c in contas) + sum(delta(c)[a] for c in NCG_PASSIVO if c in contas) for a in anos}
    imob = {a: -sum(delta(c)[a] for c in _imobilizado(con) if c in contas) for a in anos}
    dividas = {a: sum(delta(c)[a] for c in DIVIDAS if c in contas) for a in anos}
    cap_aj = {a: sum(delta(c)[a] for c in CAPITAL_AJUSTES if c in contas) for a in anos}
    outros_pl = {a: delta(LUCROS)[a] + delta(RESULTADO)[a] - (lucro[a] - dist[a]) for a in anos}
    listados = {a: lucro[a] + dep[a] + ncg[a] + imob[a] + dividas[a] - dist[a] + cap_aj[a] + outros_pl[a] for a in anos}
    outros = {a: total[a] - listados[a] for a in anos}                                       # demais contas: saldos, realizável, participações, consórcios etc.
    # caixa e dívida automática
    caixa, divida, juros, var = {}, {}, {}, {}
    c_ant = ini.get(CONTA_CAIXA, 0.0)
    d_ant = 0.0
    for a in anos:
        r = tx["taxa"][a] / 100.0
        fluxo_sem_juros = total[a] + ji.get(a, 0.0)                                         # o fluxo calculado já tem os juros da volta anterior descontados no lucro
        k = c_ant + fluxo_sem_juros - r * d_ant
        n = max((minimo[a] - k) / (1.0 - r / 2.0), -d_ant)
        d_novo = d_ant + n
        juros[a] = r * (d_ant + d_novo) / 2.0
        caixa[a] = k + n * (1.0 - r / 2.0)
        divida[a], var[a] = d_novo, n
        c_ant, d_ant = caixa[a], d_novo
    return {"auto": auto, "origem": origem, "prem": prem, "juros": juros, "caixa": caixa, "divida": divida, "variacao": var, "minimo": minimo,
            "linhas": {"lucro": lucro, "dep": dep, "ncg": ncg, "outros": outros, "imob": imob, "dividas": dividas, "dist": dist, "cap_aj": cap_aj, "outros_pl": outros_pl},
            "total": total}


def _imobilizado(con: sqlite3.Connection) -> set:
    from . import investimentos as svc_inv
    return svc_inv._contas_imobilizado(con)


def projetar(con: sqlite3.Connection, vid: int) -> dict:
    """Caixa e dívida de giro automática por ano, convergindo os juros. Sem estrutura do balanço, devolve tudo zerado."""
    from . import balanco as svc_bp
    from . import realizado as svc_real
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    zero = {a: 0.0 for a in anos}
    estrutura = svc_bp._estrutura(con)
    vazio = {"anos": anos, "ativo": False, "juros_auto": dict(zero), "caixa": dict(zero), "divida": dict(zero), "variacao": dict(zero), "avisos": [], "auto": None, "origem": None, "prem": None}
    contas = {l["codigo"] for l in estrutura if l["calculo"] == "entrada"}
    if not estrutura or CONTA_CAIXA not in contas:
        return vazio
    ini = (svc_real.saldo_inicial(con, anos[0]) or {}).get("valores", {})
    tx = _taxas(con, vid, anos)
    ji = dict(zero)
    res = None
    for volta in range(MAX_VOLTAS):
        res = _projetar_uma_volta(con, vid, estrutura, anos, ini, ji, tx)
        if max(abs(res["juros"][a] - ji[a]) for a in anos) < TOLERANCIA:
            break
        ji = res["juros"]
    avisos = list(tx["avisos"])
    if max(abs(res["juros"][a] - ji[a]) for a in anos) >= 1e-3:
        avisos.append("Os juros da dívida de giro automática não convergiram por completo; confira o motor do caixa.")
    res.update(anos=anos, ativo=True, juros_auto=res["juros"], avisos=avisos, taxas=tx, saldo_inicial=ini)
    return res


def juros_auto(con: sqlite3.Connection, vid: int) -> Dict[int, float]:
    return projetar(con, vid)["juros_auto"]


# ---------------------------------------------------------------- tela
def ler(con: sqlite3.Connection, vid: int, p: Optional[dict] = None) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    p = p or projetar(con, vid)
    base = {"versao": v, "anos": anos, "estrutura": p["ativo"], "avisos": p["avisos"], "linhas": [], "premissas": []}
    tx = _taxas(con, vid, anos)
    base["premissas"] = [
        {"campo": "origem", "nome": "Origem da taxa de juros", "valores": {a: tx["origem"][a] for a in anos}, "opcoes": [{"id": k, "nome": n} for k, n in ORIGENS.items()]},
        {"campo": "taxa", "nome": "Taxa digitada (% a.a.)", "valores": {a: tx["premissas"]["taxa"].get(a, 0.0) for a in anos}},
        {"campo": "efetiva", "nome": "Taxa usada (% a.a.)", "valores": {a: tx["taxa"][a] for a in anos}, "somente_leitura": True},
    ]
    if not p["ativo"]:
        return base
    ini = p["saldo_inicial"]
    L = lambda id_, nome, valores, expl, estilo="": {"id": id_, "nome": nome, "valores": valores, "explicacao": expl, "estilo": estilo}
    l, soma = p["linhas"], lambda *ds: {a: sum(d[a] for d in ds) for a in anos}
    operacional = soma(l["lucro"], l["dep"], l["ncg"], l["outros"])
    investimentos = l["imob"]
    financiamento = soma(l["dividas"], {a: -l["dist"][a] for a in anos}, l["cap_aj"], l["outros_pl"])
    antes = soma(operacional, investimentos, financiamento)
    caixa_ini = {a: (p["caixa"][a - 1] if a - 1 in p["caixa"] else ini.get(CONTA_CAIXA, 0.0)) for a in anos}
    base["linhas"] = [
        {"titulo": "Operacional", "linhas": [
            L("lucro", "Lucro líquido do ano", l["lucro"], "Lucro líquido da DRE do ano (já com os juros da dívida de giro automática)."),
            L("dep", "(+) Depreciação", l["dep"], "Despesa que não sai do caixa: variação da depreciação acumulada."),
            L("ncg", "(−) Variação do capital de giro operacional", l["ncg"], "Clientes, estoques, lavoura e despesas a apropriar (aumento consome caixa) menos fornecedores, impostos, outras obrigações e trabalhistas (aumento gera caixa)."),
            L("outros", "(+/−) Outros ativos e passivos", l["outros"], "Variação das demais contas do balanço: outros créditos, realizável a longo prazo, participações, intangível, consórcios e outras obrigações de longo prazo."),
            L("operacional", "Operacional", operacional, "Soma das linhas acima.", "total")]},
        {"titulo": "Investimentos", "linhas": [
            L("imob", "(−) Investimentos líquidos no imobilizado", l["imob"], "Variação das contas de imobilizado (sem a depreciação): investimentos menos desinvestimentos.", "total")]},
        {"titulo": "Financiamentos", "linhas": [
            L("dividas", "(+/−) Captações e amortizações das dívidas", l["dividas"], "Variação das dívidas existentes (Endividamento), novas captações e financiamentos de investimentos, sem a dívida de giro automática."),
            L("dist", "(−) Distribuição de lucros", {a: -l["dist"][a] for a in anos}, "Lucro de um ano distribuído aos sócios no ano seguinte (tela Patrimônio líquido)."),
            L("cap_aj", "(+/−) Capital e ajustes de avaliação", l["cap_aj"], "Variação do capital integralizado e dos ajustes de avaliação patrimonial."),
            L("outros_pl", "(+/−) Outras variações do patrimônio", l["outros_pl"], "Qualquer outra variação em lucros acumulados ou no resultado (premissas de balanço)."),
            L("financiamento", "Financiamentos", financiamento, "Soma das linhas acima.", "total")]},
        {"titulo": "Caixa e dívida de giro automática", "linhas": [
            L("antes", "Variação do caixa antes da dívida de giro automática", antes, "Fluxo operacional + investimentos + financiamentos, sem a dívida de giro automática e com os juros dela já descontados."),
            L("variacao", "(+/−) Dívida de giro automática: geração (+) ou amortização (−)", p["variacao"], "Gerada quando o caixa ficaria abaixo do mínimo; a sobra amortiza o saldo desta dívida."),
            L("caixa_ini", "Caixa no início do ano", caixa_ini, "Caixa do fim do ano anterior (o primeiro vem do último balanço realizado)."),
            L("caixa_fim", "Caixa no fim do ano", p["caixa"], "Caixa do início + variação do caixa. Vai para Caixa e aplicações financeiras do balanço.", "total"),
            L("minimo", "Caixa mínimo", p["minimo"], "% do custo de produção informado no Capital de giro (Caixa mínimo)."),
            L("divida", "Saldo da dívida de giro automática", p["divida"], "Saldo em 31/12; aparece no passivo circulante do balanço na linha própria \"Dívida de giro automática\", logo abaixo da dívida de custeio e capital de giro."),
            L("juros", "Juros da dívida de giro automática", p["juros_auto"], "Taxa × saldo médio do ano (meio do ano na geração). Vai para as despesas financeiras da DRE.")]},
    ]
    return base
