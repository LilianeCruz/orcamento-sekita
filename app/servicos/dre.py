"""DRE: a estrutura (linhas, hierarquia e ordem) vem do Fechamento Contábil; os valores NÃO são digitados: vêm dos módulos do
orçamento (por versão e por ano), em R$ e com o sinal que afetam o resultado (receitas positivas; custos e despesas negativos).
As linhas sem módulo de origem ainda ficam zeradas.

Tipos de linha na DRE sintética:
  entrada   = conta sem filhas: recebe o valor do módulo de origem (ou fica zerada se ainda não há origem)
  soma      = grupo com filhas: soma das filhas ativas
  calculada = grupo sem filhas com fórmula conhecida (Receita Líquida, Resultado Bruto, Ebitda, Ebit, Ebt, Lucro Líquido)
  pct       = margem em % de uma linha sobre a Receita Líquida
  sem_formula = grupo sem filhas e sem fórmula: aparece vazio
"""
from __future__ import annotations

import datetime as dt
import io
import os
import sqlite3
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from . import arrendamentos as arr
from . import dividas as svc_div
from . import resultado as svc_resultado
from . import arrendamentos as svc_arr
from .arrendamentos import Invalido, NaoEncontrado

MIL = 1000.0

ARQUIVO_PADRAO = Path(os.environ.get(
    "FECHAMENTO_ARQUIVO",
    Path(__file__).resolve().parents[3] / "fechamento contábil" / "fechamento-contabil.xlsx"))

# fórmulas das linhas calculadas, pelos códigos da DRE sintética da Sekita
FORMULAS: Dict[str, tuple] = {
    "DS018": ("soma", ["DS007", "DS015"]),                 # Receita Líquida = Receita Bruta + Deduções
    "DS027": ("soma", ["DS018", "DS020"]),                 # Resultado Bruto = Receita Líquida + CPV
    "DS028": ("pct", "DS027", "DS018"),                    # % Margem de Contribuição
    "DS044": ("soma", ["DS027", "DS030"]),                 # Ebitda = Resultado Bruto + Outras Despesas Operacionais
    "DS045": ("pct", "DS044", "DS018"),                    # Margem Ebitda
    "DS048": ("soma", ["DS044", "DS047"]),                 # Ebit = Ebitda + Depreciação
    "DS049": ("pct", "DS048", "DS018"),                    # Margem Ebit
    "DS058": ("soma", ["DS048", "DS051", "DS054"]),        # Ebt = Ebit + Resultado Financeiro + Outras Receitas não Operacionais
    "DS062": ("soma", ["DS058", "DS060"]),                 # Lucro Líquido = Ebt + CSLL e IRPJ
    "DS063": ("pct", "DS062", "DS018"),                    # Margem Líquida
}
COLUNAS = ["code", "name", "parent", "kind", "order", "active", "target"]


# ---------------------------------------------------------------- importação da estrutura
def _ler_aba(wb, nome: str) -> List[dict]:
    if nome not in wb.sheetnames:
        raise Invalido(f"O arquivo não tem a aba '{nome}'. Use o banco do Fechamento Contábil (fechamento-contabil.xlsx).")
    it = wb[nome].iter_rows(values_only=True)
    cab = [str(c).strip() if c is not None else "" for c in next(it, ())]
    faltam = [c for c in COLUNAS if c not in cab]
    if faltam:
        raise Invalido(f"Faltam colunas na aba '{nome}': {', '.join(faltam)}")
    ix = {c: cab.index(c) for c in COLUNAS}
    linhas = []
    for r in it:
        if not r or r[ix["code"]] in (None, ""):
            continue
        g = lambda k: r[ix[k]] if ix[k] < len(r) and r[ix[k]] is not None else ""
        try:
            ordem = int(float(g("order") or 0))
        except (TypeError, ValueError):
            ordem = 0
        ativa = str(g("active")).strip().lower() not in ("false", "0", "não", "nao", "no")
        linhas.append({"codigo": str(g("code")).strip(), "nome": str(g("name")).strip(), "pai": str(g("parent")).strip(),
                       "tipo": "group" if str(g("kind")).strip() == "group" else "account", "ordem": ordem,
                       "ativa": 1 if ativa else 0, "destino": str(g("target")).strip()})
    if not linhas:
        raise Invalido(f"A aba '{nome}' está vazia.")
    return linhas


def importar_estrutura(con: sqlite3.Connection, conteudo: bytes, arquivo: str, autor: str) -> dict:
    from openpyxl import load_workbook
    try:
        wb = load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    except Exception:
        raise Invalido("Não consegui abrir o arquivo. Use o banco do Fechamento Contábil (fechamento-contabil.xlsx).")
    sint, anal = _ler_aba(wb, "DRE Sintética"), _ler_aba(wb, "DRE Analítica")
    codigos = {l["codigo"] for l in sint}
    if len(codigos) != len(sint):
        raise Invalido("A DRE sintética tem códigos repetidos.")
    sem_pai = sorted({l["pai"] for l in sint if l["pai"] and l["pai"] not in codigos})
    if sem_pai:
        raise Invalido(f"A DRE sintética tem linhas cujo grupo não existe: {', '.join(sem_pai)}")
    bp = _ler_aba(wb, "BP Sintético") if "BP Sintético" in wb.sheetnames else []
    bp_codigos = {l["codigo"] for l in bp}
    if len(bp_codigos) != len(bp):
        raise Invalido("O BP sintético tem códigos repetidos.")
    sem_pai_bp = sorted({l["pai"] for l in bp if l["pai"] and l["pai"] not in bp_codigos})
    if sem_pai_bp:
        raise Invalido(f"O BP sintético tem linhas cujo grupo não existe: {', '.join(sem_pai_bp)}")
    con.execute("DELETE FROM dre_linhas")
    con.executemany(
        "INSERT INTO dre_linhas(codigo, nivel, nome, pai, tipo, ordem, ativa, destino) VALUES(?,?,?,?,?,?,?,?)",
        [(l["codigo"], "sintetica", l["nome"], l["pai"], l["tipo"], l["ordem"], l["ativa"], l["destino"]) for l in sint]
        + [(l["codigo"], "analitica", l["nome"], l["pai"], l["tipo"], l["ordem"], l["ativa"], l["destino"]) for l in anal if l["codigo"] not in codigos])
    if bp:                                                                 # o balanço pequeno (BP Sintético) usa a mesma importação
        con.execute("DELETE FROM bp_linhas")
        con.executemany("INSERT INTO bp_linhas(codigo, nome, pai, tipo, ordem, ativa) VALUES(?,?,?,?,?,?)",
                        [(l["codigo"], l["nome"], l["pai"], l["tipo"], l["ordem"], l["ativa"]) for l in bp])
    # valores de linhas que deixaram de existir não fazem mais sentido
    con.execute("DELETE FROM dre_valores WHERE codigo NOT IN (SELECT codigo FROM dre_linhas WHERE nivel='sintetica')")
    con.execute("INSERT INTO dre_importacao(id, arquivo, importado_em, qtd_sinteticas, qtd_analiticas) VALUES(1,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET arquivo=excluded.arquivo, importado_em=excluded.importado_em, "
                "qtd_sinteticas=excluded.qtd_sinteticas, qtd_analiticas=excluded.qtd_analiticas",
                (arquivo, dt.datetime.now().isoformat(timespec="seconds"), len(sint), len(anal)))
    arr.auditar(con, autor, None, "importar_estrutura_dre", f"{arquivo}: {len(sint)} sintéticas, {len(anal)} analíticas")
    return {"sinteticas": len(sint), "analiticas": len(anal), "balanco": len(bp)}


def importar_arquivo_padrao(con: sqlite3.Connection, autor: str) -> dict:
    if not ARQUIVO_PADRAO.exists():
        raise Invalido(f"Não encontrei o banco do Fechamento Contábil em {ARQUIVO_PADRAO}. Use 'Escolher arquivo…'.")
    return importar_estrutura(con, ARQUIVO_PADRAO.read_bytes(), ARQUIVO_PADRAO.name, autor)


# ---------------------------------------------------------------- estrutura e cálculo
def _estrutura(con: sqlite3.Connection, vid: Optional[int] = None) -> List[dict]:
    """Linhas da DRE sintética ativas, em ordem de apresentação (pai antes dos filhos), com nível e tipo de cálculo."""
    rows = [dict(r) for r in con.execute("SELECT * FROM dre_linhas WHERE nivel='sintetica' AND ativa=1 ORDER BY ordem, codigo")]
    if vid is not None:
        rows += _linhas_dos_produtos(con, vid, rows)
        rows.sort(key=lambda r: (r["ordem"], r["codigo"]))
    por_pai: Dict[str, List[dict]] = {}
    for r in rows:
        por_pai.setdefault(r["pai"], []).append(r)
    ordenada: List[dict] = []

    def visitar(pai: str, nivel: int) -> None:
        for r in por_pai.get(pai, []):
            filhos = por_pai.get(r["codigo"], [])
            r["nivel_hierarquia"], r["filhos"] = nivel, [f["codigo"] for f in filhos]
            if filhos:
                r["calculo"] = "soma"
            elif r["codigo"] in FORMULAS:
                r["calculo"] = "pct" if FORMULAS[r["codigo"]][0] == "pct" else "calculada"
            elif r["tipo"] == "account":
                r["calculo"] = "entrada"
            else:
                r["calculo"] = "sem_formula"
            ordenada.append(r)
            visitar(r["codigo"], nivel + 1)

    visitar("", 0)
    # linhas ativas cujo grupo está inativo não aparecem
    return ordenada


def _pais_do_produto(grupo: str, codigos: set) -> Tuple[str, str]:
    """(pai da receita, pai do CPV): produtos do grupo Pecuária entram nos subgrupos Pecuária da DRE, como no Fechamento Contábil; os demais, nos de culturas."""
    if grupo == "Pecuária" and PAI_RECEITA_PECUARIA in codigos and PAI_CPV_PECUARIA in codigos:
        return PAI_RECEITA_PECUARIA, PAI_CPV_PECUARIA
    return PAI_RECEITA_CULTURA, PAI_CPV_CULTURA


def _linhas_dos_produtos(con: sqlite3.Connection, vid: int, rows: List[dict]) -> List[dict]:
    """Produto de receita operacional que está no orçamento e não tem linha com o seu nome na DRE ganha uma linha de receita
    (em Receitas da Atividade Agropecuária, ou no subgrupo Pecuária) e uma de custo do produto vendido, no fim da lista de cada grupo."""
    codigos = {r["codigo"] for r in rows}
    existentes = {(r["pai"], _norm(r["nome"])) for r in rows}
    novas: List[dict] = []
    from . import extras
    lista = extras.ids_com_produtividade(con, vid)                       # produtos com área ou produtividade (inclui pecuária e leite)
    for c in con.execute(
        f"SELECT c.id, c.nome, c.grupo FROM culturas c WHERE c.id IN ({','.join('?' * len(lista)) or 'NULL'}) "
        "AND c.ativa=1 AND c.receita_tipo='operacional' ORDER BY c.nome COLLATE NOCASE", lista
    ):
        for pai, prefixo in zip(_pais_do_produto(c["grupo"], codigos), ("PR", "PC")):
            if pai not in codigos or (pai, _norm(c["nome"])) in existentes:
                continue
            irmas = [r["ordem"] for r in rows + novas if r["pai"] == pai]
            novas.append({"codigo": f"{prefixo}{c['id']}", "nivel": "sintetica", "nome": c["nome"], "pai": pai, "tipo": "account",
                          "ordem": (max(irmas) if irmas else 0) + 0.01, "ativa": 1, "destino": ""})
    return novas


def _calcular(estrutura: List[dict], entradas: Dict[str, Dict[int, float]], anos: List[int]) -> Dict[str, Dict[int, float]]:
    por_codigo = {l["codigo"]: l for l in estrutura}
    memo: Dict[str, Dict[int, float]] = {}

    def valor(codigo: str) -> Dict[int, float]:
        if codigo in memo:
            return memo[codigo]
        l = por_codigo.get(codigo)
        memo[codigo] = {a: 0.0 for a in anos}                 # protege contra ciclos
        if l is None:
            return memo[codigo]
        if l["calculo"] == "entrada":
            res = {a: entradas.get(codigo, {}).get(a, 0.0) for a in anos}
        elif l["calculo"] == "soma":
            res = {a: sum(valor(f)[a] for f in l["filhos"]) for a in anos}
        elif l["calculo"] == "calculada":
            res = {a: sum(valor(c)[a] for c in FORMULAS[codigo][1]) for a in anos}
        elif l["calculo"] == "pct":
            _, num, den = FORMULAS[codigo]
            n, d = valor(num), valor(den)
            res = {a: (n[a] / d[a] * 100.0 if d[a] else 0.0) for a in anos}
        else:
            res = {a: 0.0 for a in anos}
        memo[codigo] = res
        return res

    for l in estrutura:
        valor(l["codigo"])
    return memo


# ---------------------------------------------------------------- ligação com os módulos do orçamento
LINHA_DEDUCOES_AGRO = "DS016"
LINHA_ARRENDAMENTO = "DS032"
LINHA_DESPESA_FINANCEIRA = "DS053"
PAI_RECEITA_CULTURA, PAI_CPV_CULTURA = "DS008", "DS020"
PAI_RECEITA_PECUARIA, PAI_CPV_PECUARIA = "DS013", "DS025"      # subgrupos Pecuária da receita e do CPV: gado de corte, genética, leite...
LINHA_OUTRAS_ATIVIDADES = "DS057"          # Resultados de outras atividades operacionais (receitas não operacionais)


def _norm(txt: str) -> str:
    sem = unicodedata.normalize("NFD", txt or "")
    return "".join(c for c in sem if not unicodedata.combining(c)).strip().lower()


def _origens(con: sqlite3.Connection, vid: int, estrutura: List[dict], anos: List[int], juros_auto: Optional[Dict[int, float]] = None) -> Tuple[Dict[str, Dict[int, float]], Dict[str, str], List[str], Dict[str, List[str]]]:
    """Valores (R$ mil, com sinal) que os outros módulos já informam, por linha da DRE; o texto da origem de cada linha; e avisos."""
    auto: Dict[str, Dict[int, float]] = {}
    origem: Dict[str, str] = {}
    avisos: List[str] = []
    contas = {l["codigo"] for l in estrutura if l["calculo"] == "entrada"}

    def somar(cod: str, serie: Dict[int, float], texto: str) -> None:
        if cod not in contas:
            return
        acc = auto.setdefault(cod, {a: 0.0 for a in anos})
        for a in anos:
            acc[a] += serie.get(a, 0.0)
        origem[cod] = texto

    por_nome = {}
    for l in estrutura:
        if l["calculo"] == "entrada" and l["pai"] in (PAI_RECEITA_CULTURA, PAI_CPV_CULTURA, PAI_RECEITA_PECUARIA, PAI_CPV_PECUARIA):
            por_nome[(l["pai"], _norm(l["nome"]))] = l["codigo"]
    res = svc_resultado.calcular(con, vid)
    tipos = {r["id"]: r["receita_tipo"] for r in con.execute("SELECT id, receita_tipo FROM culturas")}
    grupos = {r["id"]: r["grupo"] for r in con.execute("SELECT id, grupo FROM culturas")}
    codigos_dre = {l["codigo"] for l in estrutura}
    sem_linha = []
    for c in res["culturas"]:
        anual = {l["id"]: {int(a): v for a, v in l["valores"].items()} for l in c["anual"]}
        if tipos.get(c["id"]) == "nao_operacional":              # receita não operacional: só o resultado (receita − deduções − CPV) entra na DRE
            resultado = {a: anual["receita_bruta_anual"].get(a, 0.0) + anual["deducoes_anual"].get(a, 0.0) + anual["cpv"].get(a, 0.0) for a in anos}
            somar(LINHA_OUTRAS_ATIVIDADES, resultado, "Resultado por produto · receita não operacional")
            continue
        pai_rec, pai_cpv = _pais_do_produto(grupos.get(c["id"], ""), codigos_dre)
        rec = por_nome.get((pai_rec, _norm(c["nome"])))
        cpv = por_nome.get((pai_cpv, _norm(c["nome"])))
        if not rec and not cpv:
            if any(anual["receita_bruta_anual"].get(a) for a in anos):
                sem_linha.append(c["nome"])
            continue
        if rec:
            somar(rec, anual["receita_bruta_anual"], "Resultado por produto · receita bruta anual")
            somar(LINHA_DEDUCOES_AGRO, anual["deducoes_anual"], "Resultado por produto · deduções da receita")
        if cpv:
            somar(cpv, anual["cpv"], "Resultado por produto · custo do produto vendido")
    if sem_linha:
        avisos.append("Sem linha correspondente na DRE (ficam fora): " + ", ".join(sorted(sem_linha)) + ". A estrutura importada não tem os grupos de receita e de custo dos produtos.")
    arrend = svc_arr.calcular(con, vid)["resumo"]
    somar(LINHA_ARRENDAMENTO, {a: -arrend.get(a, {}).get("custo", 0.0) / MIL for a in anos}, "Arrendamentos · custo do ano")
    from . import transportadora as svc_tr
    for cod, serie in svc_tr.series(con, vid, anos).items():
        somar(cod, serie, "Premissas de transportadora · receita, deduções e custo direto")
    from . import investimentos as svc_inv
    dep = svc_inv.depreciacao(con, vid, anos)["total"]
    somar(svc_inv.CODIGO_DEPRECIACAO_DRE, {a: -v for a, v in dep.items()}, "Investimentos · depreciação dos bens existentes e dos novos investimentos")
    juros = {int(a): -d["juros"] / MIL for a, d in svc_div.resumo(con, vid, "todas")["por_ano"].items()}
    from . import captacoes as svc_cap
    novos = svc_cap.somar(svc_cap.calcular(con, vid, anos), anos)["juros"]
    for a in anos:
        juros[a] = juros.get(a, 0.0) - novos[a] - (juros_auto or {}).get(a, 0.0)          # juros da dívida de giro automática (fluxo de caixa)
    somar(LINHA_DESPESA_FINANCEIRA, juros, "Endividamento · juros que vencem no ano (todas as empresas) e das novas dívidas")
    from . import dre_padrao as svc_dp                                      # premissas padronizadas das contas sem origem (média do realizado)
    base_calc = _calcular(estrutura, {k: dict(v) for k, v in auto.items()}, anos)       # receita líquida, bruta e CPV não dependem das contas abaixo
    for cod, serie in svc_dp.series(con, vid, anos, base_calc).items():
        if cod == svc_dp.ARRENDAMENTO and any(serie.values()):
            auto.pop(cod, None); origem.pop(cod, None)                       # a média sobre o custo substitui o valor da tela de arrendamentos
        if any(serie.values()):
            somar(cod, serie, "Premissas da DRE · média do realizado (% da base ou valor)")
    from . import premissas_dem as svc_pd                                   # premissas cadastradas que caem em contas da DRE
    prem: Dict[str, List[str]] = {}
    for cod, lista in svc_pd.efeitos(con, vid, "dre", anos).items():
        if cod not in contas:
            continue
        acc = auto.setdefault(cod, {a: 0.0 for a in anos})
        for p in lista:
            for a in anos:
                acc[a] += p["valores"][a]
            prem.setdefault(cod, []).append(p["nome"])
    return auto, origem, avisos, prem


COMO_ORIGEM = {
    "Resultado por produto · receita não operacional": "Soma do resultado dos produtos cadastrados com receita não operacional: receita bruta anual − deduções − custo do produto vendido, "
        "calculados no Resultado por produto. Esses produtos não têm linha própria de receita nem de custo.",
    "Resultado por produto · receita bruta anual": "Receita bruta anual do produto no Resultado por produto: (produção do ano − estocada) × (1 − descarte) − sementes salvas, "
        "ao preço do ano, mais o estoque do ano anterior vendido ao preço e ao descarte do ano da venda.",
    "Resultado por produto · deduções da receita": "Soma das deduções de receita dos produtos ligadas à DRE: receita bruta anual × % de dedução do ano da venda "
        "(premissa % dedução de receita), em negativo.",
    "Resultado por produto · custo do produto vendido": "Custo do produto vendido do produto no Resultado por produto, em negativo: custo da produção vendida no ano + custo do estoque do "
        "ano anterior, pelo custo médio (custo total de produção ÷ volume produzido). Só custos variáveis diretos.",
    "Premissas de transportadora · receita, deduções e custo direto": "Premissas de transportadora: receita = caminhões × km por caminhão × preço por km; deduções = receita × % de deduções; "
        "custo direto = km rodado × soma das rubricas variáveis, fixas e despesas (despesa indireta e M.O.I) em R$/km. Depreciação, compra e venda de caminhões ficam em Investimentos.",
    "Arrendamentos · custo do ano": "Custo dos arrendamentos do ano (módulo Arrendamentos): hectares × valor por hectare, ou sacas × valor padrão da saca, "
        "somando todas as fazendas arrendadas, em negativo.",
    "Endividamento · juros que vencem no ano (todas as empresas) e das novas dívidas": "Juros dos contratos que vencem no ano (módulo Endividamento), somando todas as empresas, mais os juros das novas captações, dos financiamentos dos investimentos (tela Novas captações) e da dívida de giro automática (tela Fluxo de caixa), em negativo.",
}


def _explicacao(l: dict, por_codigo: Dict[str, dict], origem: Optional[str], premissas: Optional[List[str]] = None) -> str:
    """Texto de 'como é calculado' de uma linha da DRE."""
    nome = lambda c: por_codigo[c]["nome"] if c in por_codigo else c
    if l["calculo"] == "entrada":
        extra = f" Inclui as premissas da DRE vinculadas a esta conta: {', '.join(premissas)} (valor digitado, ou % sobre o campo base, com o sinal da premissa)." if premissas else ""
        if origem:
            return COMO_ORIGEM.get(origem, "") + extra
        if premissas:
            return f"Soma das premissas da DRE vinculadas a esta conta: {', '.join(premissas)} (valor digitado, ou % sobre o campo base, com o sinal da premissa; em R$)."
        return "Ainda não há módulo do orçamento nem premissa vinculada a esta linha; fica zerada até existir."
    if l["calculo"] == "soma":
        return "Soma das linhas abaixo: " + "; ".join(nome(c) for c in l["filhos"]) + "."
    f = FORMULAS.get(l["codigo"])
    if f and f[0] == "soma":
        return "Soma de: " + "; ".join(nome(c) for c in f[1]) + " (as despesas já entram negativas)."
    if f and f[0] == "pct":
        return f"{nome(f[1])} ÷ {nome(f[2])} × 100."
    return ""


def ler(con: sqlite3.Connection, vid: int, juros_auto: Optional[Dict[int, float]] = None) -> dict:
    """juros_auto: juros da dívida de giro automática por ano. None = calcula pelo fluxo de caixa; {} = sem esses juros (usado para ler só as bases)."""
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    imp = con.execute("SELECT * FROM dre_importacao WHERE id=1").fetchone()
    base = {"versao": v, "anos": anos, "importacao": dict(imp) if imp else None, "linhas": [], "avisos": []}
    if not imp:
        return base
    if juros_auto is None:
        from . import fluxo as svc_fluxo
        juros_auto = svc_fluxo.juros_auto(con, vid)
    estrutura = _estrutura(con, vid)
    auto, origem, avisos, prem = _origens(con, vid, estrutura, anos, juros_auto)
    from . import premissas_dem as svc_pd                                   # premissas percentuais: % × campo base
    calc, entradas, nomes_pct = svc_pd.aplicar_percentuais(con, vid, "dre", anos, auto, lambda e: _calcular(estrutura, e, anos))
    for cod, nomes in nomes_pct.items():
        prem.setdefault(cod, []).extend(nomes)
    base["avisos"] = avisos
    base["linhas"] = [{"codigo": l["codigo"], "nome": l["nome"], "pai": l["pai"], "nivel": l["nivel_hierarquia"], "tipo": l["tipo"],
                       "calculo": l["calculo"], "filhos": l["filhos"], "unidade": "%" if l["calculo"] == "pct" else "R$ mil",
                       "valores": calc[l["codigo"]], "origem": origem.get(l["codigo"]) or ("Premissas · valores digitados" if prem.get(l["codigo"]) else None),
                       "premissas": prem.get(l["codigo"], []),
                       "explicacao": _explicacao(l, {x["codigo"]: x for x in estrutura}, origem.get(l["codigo"]), prem.get(l["codigo"], []))}
                      for l in estrutura]
    return base


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    ia = {l["codigo"]: l for l in la["linhas"]}
    ib = {l["codigo"]: l for l in lb["linhas"]}
    linhas = []
    for l in (la["linhas"] or lb["linhas"]):
        va, vb = ia.get(l["codigo"], l)["valores"], ib.get(l["codigo"], l)["valores"]
        linhas.append({"codigo": l["codigo"], "nome": l["nome"], "nivel": l["nivel"], "unidade": l["unidade"], "calculo": l["calculo"],
                       "anos": {a: {"a": va.get(a, 0.0), "b": vb.get(a, 0.0), "delta": vb.get(a, 0.0) - va.get(a, 0.0),
                                    "pct": ((vb.get(a, 0.0) - va.get(a, 0.0)) / abs(va[a]) * 100.0) if va.get(a) else None} for a in anos}})
    return {"a": la["versao"], "b": lb["versao"], "anos": anos, "linhas": linhas}
