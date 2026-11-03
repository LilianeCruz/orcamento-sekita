"""Demonstrativos realizados (Balanço e DRE de anos já fechados). Valem para todas as versões e servem de base para
os prazos médios do Capital de giro, o saldo inicial do balanço e a comparação com o orçado.

Três formatos de arquivo:
  0. Planilha "Fechamento Financeiro" (abas Balanco9anos e Comparativo de AV): contas ligadas à estrutura pelo nome; anos ainda não fechados são ignorados.
  1. Banco do Fechamento Contábil (abas "Fechamentos" e "Fechamento Linhas"), consolidado, visão sintética: o Balanço é o do fechamento
     que termina em 31/12; a DRE é a soma dos fechamentos do ano (cada fechamento traz só o seu período, ex.: 4 trimestres) ou um
     fechamento anual. Se os períodos não cobrirem o ano inteiro, só o Balanço entra e o sistema avisa.
  2. Planilha modelo (aba "Realizado"): Ano | Demonstrativo (BP ou DRE) | Código | Conta | Valor, valores em R$.
Subir um ano de novo substitui o que havia daquele ano e demonstrativo.
"""
from __future__ import annotations

import calendar
import datetime as dt
import io
import re
import sqlite3
from typing import Dict, List, Optional, Tuple

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado


def dias_do_ano(ano: int) -> float:
    """Quantidade real de dias do ano (365 ou 366)."""
    return 366.0 if calendar.isleap(ano) else 365.0

DEMONSTRATIVOS = ("BP", "DRE")

# Contas do Balanço sintético que cada prazo médio usa, e a base da DRE (RL = receita líquida, CPV = custo do produto vendido).
PRAZOS = {
    "dias_receber": (["SA08"], "RL"),
    "dias_rotacao": (["SA13"], "CPV"),
    "dias_preparo": (["SA14"], "CPV"),
    "dias_insumos": (["SA11"], "CPV"),
    "dias_lavoura": (["SA12"], "CPV"),
    "dias_fornecedores": (["SP07"], "CPV"),
    "dias_outras": (["SP10"], "CPV"),
    "dias_trabalhistas": (["SP11"], "CPV"),
    "dias_impostos": (["SP09"], "DED"),
}
# contas financeiras: não têm prazo, o balanço realizado dá o saldo (R$) de cada ano
SALDOS = {"saldo_outros_creditos": ["SA09"], "saldo_realizavel": ["SA17"], "saldo_participacoes": ["SA18"], "saldo_intangivel": ["SA27"],
          "saldo_consorcios_curto": ["SP13"], "saldo_consorcios_longo": ["SP19"], "saldo_outras_lp": ["SP20"], "saldo_caixa": ["SA07"]}
CODIGO_RECEITA_LIQUIDA, CODIGO_CPV, CODIGO_DEDUCOES = "DS018", "DS020", "DS015"


# ---------------------------------------------------------------- leitura dos arquivos
def _numero(x) -> Optional[float]:
    if x is None or x == "":
        return None
    if isinstance(x, (int, float)):
        return float(x)
    t = str(x).strip().replace("R$", "").replace(" ", "")
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def _periodos_do_ano(fechs: List[dict]) -> Optional[List[dict]]:
    """Fechamentos cujo conjunto cobre de 1º/jan a 31/dez do ano, sem buraco nem sobreposição (um anual, ou 4 trimestres, etc.)."""
    anual = [f for f in fechs if f["inicio"].endswith("-01-01") and f["fim"].endswith("-12-31")]
    if anual:
        return [max(anual, key=lambda f: f["criado"])]
    por_inicio = {}
    for f in sorted(fechs, key=lambda f: f["criado"]):         # se um período foi refeito, vale o mais recente
        por_inicio[(f["inicio"], f["fim"])] = f
    seq = sorted(por_inicio.values(), key=lambda f: f["inicio"])
    if not seq or not seq[0]["inicio"].endswith("-01-01") or not seq[-1]["fim"].endswith("-12-31"):
        return None
    for a, b in zip(seq, seq[1:]):
        if dt.date.fromisoformat(b["inicio"]) != dt.date.fromisoformat(a["fim"]) + dt.timedelta(days=1):
            return None
    return seq


def _do_fechamento(wb) -> Tuple[List[Tuple[int, str, str, str, float]], List[str]]:
    """Balanço: fechamento que termina em 31/12. DRE: os fechamentos do ano somados (cada fechamento traz só o seu período)."""
    por_ano: Dict[int, List[dict]] = {}
    for i, r in enumerate(wb["Fechamentos"].iter_rows(values_only=True)):
        if i == 0 or not r[0] or not r[3] or not r[4]:
            continue
        ini, fim = str(r[3])[:10], str(r[4])[:10]
        if ini[:4] == fim[:4]:
            por_ano.setdefault(int(fim[:4]), []).append({"id": r[0], "inicio": ini, "fim": fim, "criado": str(r[5] or "")})
    anos = {a: f for a, f in por_ano.items() if any(x["fim"].endswith("-12-31") for x in f)}
    if not anos:
        raise Invalido("Esse arquivo não tem nenhum fechamento terminado em 31/12. Suba o fechamento do 4º trimestre (ou use a planilha modelo).")
    bp_de = {a: max((x for x in f if x["fim"].endswith("-12-31")), key=lambda x: x["criado"]) for a, f in anos.items()}
    dre_de: Dict[int, List[dict]] = {}
    avisos = []
    for a, f in sorted(anos.items()):
        seq = _periodos_do_ano(f)
        if seq:
            dre_de[a] = seq
        else:
            avisos.append(f"{a}: a DRE não foi importada porque os fechamentos do arquivo não cobrem o ano inteiro (de 1º/jan a 31/dez, sem buracos). O Balanço foi importado.")
    quer = {x["id"] for x in bp_de.values()} | {x["id"] for seq in dre_de.values() for x in seq}
    bp: Dict[Tuple[int, str], Tuple[str, float]] = {}
    dre: Dict[Tuple[int, str], Tuple[str, float]] = {}
    ano_de = {x["id"]: a for a, f in anos.items() for x in f}
    bp_ids = {x["id"]: a for a, x in bp_de.items()}
    dre_ids = {x["id"]: a for a, seq in dre_de.items() for x in seq}
    for i, r in enumerate(wb["Fechamento Linhas"].iter_rows(values_only=True)):
        if i == 0 or r[0] not in quer or r[1] != "CONSOLIDADO" or r[5] != "SINTETICO" or r[4] not in DEMONSTRATIVOS:
            continue
        nome, valor = str(r[7] or ""), _numero(r[11])
        if valor is None or "%" in nome:                      # linhas de margem (%) não são valores em R$
            continue
        if r[4] == "BP" and r[0] in bp_ids:
            bp[(bp_ids[r[0]], str(r[6]))] = (nome, valor)
        elif r[4] == "DRE" and r[0] in dre_ids:
            k = (dre_ids[r[0]], str(r[6]))
            dre[k] = (nome, dre.get(k, ("", 0.0))[1] + valor)
    out = [(a, "BP", c, n, v) for (a, c), (n, v) in bp.items()] + [(a, "DRE", c, n, v) for (a, c), (n, v) in dre.items()]
    return out, avisos



# ---------------------------------------------------------------- planilha "Fechamento Financeiro" (Balanco9anos + Comparativo de AV)
def _norm(t) -> str:
    import re
    import unicodedata
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", t)


def _casar(nome: str, candidatos: List[dict]) -> Optional[dict]:
    n = _norm(nome)
    for c in candidatos:
        if _norm(c["nome"]) == n:
            return c
    if len(n) >= 10:                                          # rótulo abreviado ("CPLTD - Amortização Dívida Bancária")
        for c in candidatos:
            m = _norm(c["nome"])
            if m.startswith(n) or n.startswith(m):
                return c
    return None


def _do_fechamento_financeiro(con: sqlite3.Connection, wb) -> Tuple[List[Tuple[int, str, str, str, float]], List[str]]:
    bp_estrutura = [dict(r) for r in con.execute("SELECT codigo, nome, pai FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo")]
    dre_estrutura = [dict(r) for r in con.execute("SELECT codigo, nome FROM dre_linhas WHERE nivel='sintetica' AND ativa=1 ORDER BY ordem, codigo")]
    if not bp_estrutura or not dre_estrutura:
        raise Invalido("Importe antes a estrutura do Fechamento Contábil na tela DRE (botão 'Importar do Fechamento Contábil'): ela dá os códigos das contas.")
    hoje = dt.date.today().year
    out: List[Tuple[int, str, str, str, float]] = []
    avisos: List[str] = []
    ignorados = set()
    parcial: List[Tuple[int, str, str, str, float]] = []                     # ano em andamento (a partir do ano corrente): guardado à parte

    def anos_do_cabecalho(linha, pular_av=False):
        cols = {}
        for i, c in enumerate(linha):
            if isinstance(c, (int, float)) and 1990 <= c <= 2100 and float(c).is_integer():
                cols[i] = int(c)
        return cols

    # ---- Balanço: ativo à esquerda (rótulo na col. B), passivo à direita (rótulo na col. N)
    linhas = [list(r) for r in wb["Balanco9anos"].iter_rows(values_only=True)]
    k0 = next((k for k, r in enumerate(linhas) if len(anos_do_cabecalho(r)) >= 3), None)
    if k0 is None:
        raise Invalido("Não achei a linha de anos na aba Balanco9anos")
    cab = anos_do_cabecalho(linhas[k0])
    linhas = linhas[k0:]
    for rotulo_col, secao_raiz in ((1, "SA"), (13, "SP")):
        cols = {i: a for i, a in cab.items() if (i < 12) == (rotulo_col == 1)}
        raiz_circ, raiz_nao = (("SA06", "SA16") if secao_raiz == "SA" else ("SP06", "SP16"))
        secao = None
        for r in linhas[1:]:
            nome = r[rotulo_col] if rotulo_col < len(r) else None
            if not nome or not str(nome).strip():
                continue
            n = _norm(nome)
            if n in ("ativototal", "passivototal"):
                cand = [c for c in bp_estrutura if c["codigo"] == secao_raiz]
            elif n == "circulante":
                secao = raiz_circ; cand = [c for c in bp_estrutura if c["codigo"] == secao]
            elif n == "naocirculante":
                secao = raiz_nao; cand = [c for c in bp_estrutura if c["codigo"] == secao]
            else:
                cand = [c for c in bp_estrutura if c["codigo"].startswith(secao_raiz) and c["codigo"] not in (raiz_circ, raiz_nao)]
                achado = _casar(nome, [c for c in cand if c["pai"] == secao or _paiavo(c, bp_estrutura) == secao]) or _casar(nome, cand)
                cand = [achado] if achado else []
            if not cand:
                continue
            for i, a in cols.items():
                v = _numero(r[i]) if i < len(r) else None
                if v is None:
                    continue
                if a >= hoje:
                    ignorados.add(a); parcial.append((a, "BP", cand[0]["codigo"], cand[0]["nome"], v)); continue
                out.append((a, "BP", cand[0]["codigo"], cand[0]["nome"], v))
    # ---- DRE: percorre a estrutura em ordem, casando cada linha da planilha com a próxima de mesmo nome
    linhas = [list(r) for r in wb["Comparativo de AV"].iter_rows(values_only=True)]
    k0 = next((k for k, r in enumerate(linhas) if len(anos_do_cabecalho(r)) >= 3), None)
    if k0 is None:
        raise Invalido("Não achei a linha de anos na aba Comparativo de AV")
    cab = anos_do_cabecalho(linhas[k0])
    ponteiro = 0
    for r in linhas[k0 + 1:]:
        nome = r[0]
        if not nome or not str(nome).strip():
            continue
        n = _norm(nome)
        achou = None
        for k in range(ponteiro, len(dre_estrutura)):
            if _norm(dre_estrutura[k]["nome"]) == n:
                achou, ponteiro = dre_estrutura[k], k + 1
                break
        if not achou:
            continue
        for i, a in cab.items():
            v = _numero(r[i]) if i < len(r) else None
            if v is None:
                continue
            if a >= hoje:
                ignorados.add(a); parcial.append((a, "DRE", achou["codigo"], achou["nome"], v)); continue
            out.append((a, "DRE", achou["codigo"], achou["nome"], v))
    if ignorados:
        avisos.append(f"{', '.join(map(str, sorted(ignorados)))} ainda não está fechado.")
    return out, avisos, parcial


def _paiavo(c: dict, estrutura: List[dict]) -> Optional[str]:
    pai = next((x for x in estrutura if x["codigo"] == c["pai"]), None)
    return pai["pai"] if pai else None


def _da_planilha(wb) -> List[Tuple[int, str, str, str, float]]:
    ws = wb["Realizado"] if "Realizado" in wb.sheetnames else wb[wb.sheetnames[0]]
    linhas = list(ws.iter_rows(values_only=True))
    if not linhas:
        raise Invalido("A planilha está vazia")
    cab = [str(c or "").strip().lower() for c in linhas[0]]
    def col(*nomes):
        for n in nomes:
            for i, c in enumerate(cab):
                if c.startswith(n):
                    return i
        return None
    i_ano, i_dem, i_cod, i_nome, i_val = col("ano"), col("demonstrativo"), col("código", "codigo"), col("conta", "nome"), col("valor")
    if None in (i_ano, i_dem, i_cod, i_val):
        raise Invalido("A primeira linha precisa ter as colunas: Ano, Demonstrativo, Código, Conta e Valor")
    out = []
    for n, r in enumerate(linhas[1:], start=2):
        if all(c in (None, "") for c in r):
            continue
        valor = _numero(r[i_val]) if i_val < len(r) else None
        if valor is None:
            continue                                          # linha sem valor: simplesmente não entra
        ano = _numero(r[i_ano]) if i_ano < len(r) else None
        dem = str(r[i_dem] or "").strip().upper()
        cod = str(r[i_cod] or "").strip()
        if ano is None or not 1990 <= int(ano) <= 2100:
            raise Invalido(f"Linha {n}: informe o ano (ex.: 2024)")
        if dem not in DEMONSTRATIVOS:
            raise Invalido(f"Linha {n}: o demonstrativo deve ser BP ou DRE")
        if not cod:
            raise Invalido(f"Linha {n}: informe o código da conta")
        out.append((int(ano), dem, cod, str(r[i_nome] or "") if i_nome is not None and i_nome < len(r) else "", valor))
    return out


MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def _rotulo_periodo(mes_inicio: int, mes_fim: int) -> str:
    return f"{MESES_NOME[mes_inicio - 1]} a {MESES_NOME[mes_fim - 1]}" if mes_inicio != mes_fim else MESES_NOME[mes_fim - 1]


def _meses_do_arquivo(arquivo: str, ano: int) -> Optional[int]:
    """Meses fechados do ano em andamento, pelo nome do arquivo (ex.: '2t2026' = 2º trimestre = 6 meses)."""
    m = re.search(r"([1-4])\s*[tT]\s*" + str(ano), arquivo or "")
    return int(m.group(1)) * 3 if m else None


def _guardar_parcial(con: sqlite3.Connection, parcial: list, arquivo: str, autor: str, meses: Optional[int], avisos: List[str],
                     mes_inicio: Optional[int] = None, versao_id: Optional[int] = None) -> Optional[dict]:
    """O ano em andamento (ex.: jan a jun) entra à parte: aparece na tela Realizado e nos indicadores, mas não alimenta saldo inicial, prazos nem médias."""
    if not parcial:
        return None
    ano = max(a for a, *_ in parcial)
    linhas = [l for l in parcial if l[0] == ano]
    meses = meses or _meses_do_arquivo(arquivo, ano)
    mes_inicio = mes_inicio or 1
    if meses and not 1 <= mes_inicio <= meses:
        raise Invalido("O mês inicial do período não pode ser depois do mês final")
    if not meses or not 1 <= meses <= 11:
        avisos.append(f"{ano} está em andamento e não foi importado: não consegui saber quantos meses estão fechados. Informe o período (ex.: o nome do arquivo com '2t{ano}' para jan a jun).")
        return None
    agora = dt.datetime.now().isoformat(timespec="seconds")
    con.execute("DELETE FROM realizado_parcial WHERE ano=?", (ano,))
    if versao_id is None:                                                       # orçamento comparado: o aprovado (travado) que tem esse ano
        r = con.execute("SELECT id FROM versoes WHERE status='aprovado' AND ano_base<=? AND ano_base+horizonte>? ORDER BY id DESC LIMIT 1", (ano, ano)).fetchone()
        versao_id = r["id"] if r else None
    con.execute("INSERT INTO realizado_parcial_anos(ano, meses, arquivo, importado_em, importado_por, mes_inicio, versao_id) VALUES(?,?,?,?,?,?,?) "
                "ON CONFLICT(ano) DO UPDATE SET meses=excluded.meses, arquivo=excluded.arquivo, importado_em=excluded.importado_em, importado_por=excluded.importado_por, "
                "mes_inicio=excluded.mes_inicio, versao_id=excluded.versao_id", (ano, meses, arquivo, agora, autor, mes_inicio, versao_id))
    con.executemany("INSERT OR REPLACE INTO realizado_parcial(ano, demonstrativo, codigo, nome, valor) VALUES(?,?,?,?,?)", [(a, d, c, n, v) for a, d, c, n, v in linhas])
    avisos.append(f"{ano} foi importado como período em andamento ({_rotulo_periodo(mes_inicio, meses)}): aparece na tela Realizado, nos indicadores e na comparação com o orçado; não entra nas médias nem nos prazos.")
    arr.auditar(con, autor, None, "importar_realizado_parcial", f"{arquivo}: {ano}, {meses} meses, {len(linhas)} linhas")
    return {"ano": ano, "meses": meses, "linhas": len(linhas)}


def produtos_venda(con: sqlite3.Connection) -> List[dict]:
    """Produtos que vendem (receita operacional): a quantidade vendida de cada um é obrigatória ao importar um período em andamento."""
    return [{"id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "unidade": c["unidade"]}
            for c in con.execute("SELECT id, nome, grupo, unidade FROM culturas WHERE ativa=1 AND receita_tipo='operacional' ORDER BY grupo, nome COLLATE NOCASE")]


def _guardar_quantidades(con: sqlite3.Connection, ano: int, quantidades: Optional[Dict[int, float]], autor: str) -> None:
    """Exige a quantidade vendida de todos os produtos (0 para o que não vendeu) e guarda; se faltar, a importação inteira é desfeita."""
    prod = produtos_venda(con)
    q = quantidades or {}
    faltam = [p["nome"] for p in prod if p["id"] not in q]
    if faltam:
        raise Invalido("Informe a quantidade vendida de todos os produtos (use 0 para o que não vendeu). Faltam: " + ", ".join(faltam[:6]) + ("…" if len(faltam) > 6 else ""))
    if any(v < 0 for v in q.values()):
        raise Invalido("A quantidade vendida não pode ser negativa")
    con.execute("DELETE FROM realizado_quantidades WHERE ano=?", (ano,))
    con.executemany("INSERT INTO realizado_quantidades(ano, cultura_id, quantidade) VALUES(?,?,?)", [(ano, p["id"], float(q[p["id"]])) for p in prod])
    arr.auditar(con, autor, None, "salvar_quantidades_realizado", f"{ano}: {len(prod)} produtos")


def importar(con: sqlite3.Connection, conteudo: bytes, arquivo: str, autor: str, ano_inicial: Optional[int] = None, meses_parcial: Optional[int] = None,
             mes_inicio: Optional[int] = None, versao_id: Optional[int] = None, quantidades: Optional[Dict[int, float]] = None) -> dict:
    from openpyxl import load_workbook
    try:
        wb = load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    except Exception:
        raise Invalido("Não consegui abrir o arquivo. Use o banco do Fechamento Contábil ou a planilha modelo (.xlsx).")
    parcial: List[Tuple[int, str, str, str, float]] = []
    if "Balanco9anos" in wb.sheetnames and "Comparativo de AV" in wb.sheetnames:
        linhas, avisos, parcial = _do_fechamento_financeiro(con, wb)
    elif "Fechamento Linhas" in wb.sheetnames and "Fechamentos" in wb.sheetnames:
        linhas, avisos = _do_fechamento(wb)
    else:
        linhas, avisos = _da_planilha(wb), []
    parcial_info = _guardar_parcial(con, parcial, arquivo, autor, meses_parcial, avisos, mes_inicio, versao_id)
    if parcial_info:
        _guardar_quantidades(con, parcial_info["ano"], quantidades, autor)
    if ano_inicial:
        linhas = [l for l in linhas if l[0] >= ano_inicial]
    if not linhas:
        raise Invalido("Não encontrei nenhum valor para importar nesse arquivo")
    nomes = {(r["demonstrativo"], r["codigo"]): r["nome"] for r in con.execute(
        "SELECT 'BP' AS demonstrativo, codigo, nome FROM bp_linhas UNION ALL SELECT 'DRE', codigo, nome FROM dre_linhas WHERE nivel='sintetica'")}
    duplicadas = set()
    vistos = set()
    for ano, dem, cod, _, _ in linhas:
        if (ano, dem, cod) in vistos:
            duplicadas.add(f"{dem} {cod} ({ano})")
        vistos.add((ano, dem, cod))
    if duplicadas:
        raise Invalido("Há contas repetidas no mesmo ano: " + ", ".join(sorted(duplicadas)[:8]))
    agora = dt.datetime.now().isoformat(timespec="seconds")
    pares = sorted({(a, d) for a, d, _, _, _ in linhas})
    for ano, dem in pares:
        con.execute("DELETE FROM realizado WHERE ano=? AND demonstrativo=?", (ano, dem))
        con.execute("INSERT INTO realizado_anos(ano, demonstrativo, arquivo, importado_em, importado_por) VALUES(?,?,?,?,?) "
                    "ON CONFLICT(ano, demonstrativo) DO UPDATE SET arquivo=excluded.arquivo, importado_em=excluded.importado_em, importado_por=excluded.importado_por",
                    (ano, dem, arquivo, agora, autor))
    con.executemany("INSERT INTO realizado(ano, demonstrativo, codigo, nome, valor) VALUES(?,?,?,?,?)",
                    [(a, d, c, n or nomes.get((d, c), ""), v) for a, d, c, n, v in linhas])
    anos = sorted({a for a, _ in pares})
    arr.auditar(con, autor, None, "importar_realizado", f"{arquivo}: anos {', '.join(map(str, anos))}, {len(linhas)} linhas")
    return {"anos": anos, "linhas": len(linhas), "avisos": avisos, "parcial": parcial_info, "demonstrativos": [{"ano": a, "demonstrativo": d} for a, d in pares]}


def excluir_ano(con: sqlite3.Connection, ano: int, autor: str) -> None:
    if con.execute("SELECT 1 FROM realizado_parcial_anos WHERE ano=?", (ano,)).fetchone():             # ano em andamento (jan a jun...)
        con.execute("DELETE FROM realizado_parcial WHERE ano=?", (ano,))
        con.execute("DELETE FROM realizado_quantidades WHERE ano=?", (ano,))
        con.execute("DELETE FROM realizado_parcial_anos WHERE ano=?", (ano,))
        arr.auditar(con, autor, None, "excluir_realizado", f"{ano} (em andamento)")
        return
    if not con.execute("SELECT 1 FROM realizado_anos WHERE ano=?", (ano,)).fetchone():
        raise NaoEncontrado(f"Não há realizado de {ano}")
    con.execute("DELETE FROM realizado WHERE ano=?", (ano,))
    con.execute("DELETE FROM realizado_anos WHERE ano=?", (ano,))
    con.execute("DELETE FROM realizado_quantidades WHERE ano=?", (ano,))
    arr.auditar(con, autor, None, "excluir_realizado", str(ano))


# ---------------------------------------------------------------- consulta
def _valores(con: sqlite3.Connection) -> Dict[str, Dict[str, Dict[int, float]]]:
    d: Dict[str, Dict[str, Dict[int, float]]] = {"BP": {}, "DRE": {}}
    for r in con.execute("SELECT ano, demonstrativo, codigo, valor FROM realizado"):
        d[r["demonstrativo"]].setdefault(r["codigo"], {})[r["ano"]] = r["valor"]
    return d


def _estrutura(con: sqlite3.Connection, dem: str, valores: Dict[str, Dict[int, float]]) -> List[dict]:
    """Linhas do demonstrativo na ordem da estrutura importada; contas realizadas fora da estrutura vão no fim."""
    sql = ("SELECT codigo, nome, pai, tipo FROM bp_linhas ORDER BY ordem, codigo" if dem == "BP"
           else "SELECT codigo, nome, pai, tipo FROM dre_linhas WHERE nivel='sintetica' ORDER BY ordem, codigo")
    base = [dict(r) for r in con.execute(sql)]
    nomes = {r["codigo"]: r["nome"] for r in con.execute("SELECT codigo, nome FROM realizado WHERE demonstrativo=? AND nome<>''", (dem,))}
    conhecidos = {l["codigo"] for l in base}
    for cod in sorted(c for c in valores if c not in conhecidos):
        base.append({"codigo": cod, "nome": nomes.get(cod, cod), "pai": None, "tipo": "account"})
    pai = {l["codigo"]: l["pai"] for l in base}
    def nivel(c):
        n, vistos = 0, set()
        while pai.get(c) and pai[c] not in vistos:
            vistos.add(c); c = pai[c]; n += 1
        return n
    return [{"codigo": l["codigo"], "nome": l["nome"], "tipo": l["tipo"], "nivel": nivel(l["codigo"])} for l in base]


def ler(con: sqlite3.Connection) -> dict:
    val = _valores(con)
    anos = sorted({r["ano"] for r in con.execute("SELECT ano FROM realizado_anos")})
    por_ano = {a: {r["demonstrativo"]: {"arquivo": r["arquivo"], "importado_em": r["importado_em"], "importado_por": r["importado_por"]}
                   for r in con.execute("SELECT * FROM realizado_anos WHERE ano=?", (a,))} for a in anos}
    def tabela(dem):
        out = []
        for l in _estrutura(con, dem, val[dem]):
            v = {a: (val[dem][l["codigo"]][a] / 1000.0 if a in val[dem].get(l["codigo"], {}) else None) for a in anos}
            if any(x is not None for x in v.values()):
                out.append({**l, "valores": v})
        return out
    parcial = parcial_do_ano(con)
    bp, dre = tabela("BP"), tabela("DRE")
    if parcial:                                                          # coluna do ano em andamento, só para consulta
        for linhas, dem in ((bp, "BP"), (dre, "DRE")):
            for l in linhas:
                l["parcial"] = parcial[dem].get(l["codigo"])
    return {"anos": anos, "importacoes": por_ano, "bp": bp, "dre": dre,
            "prazos": prazos(con), "ultimo_ano": ultimo_ano(con),
            "parcial": ({"ano": parcial["ano"], "meses": parcial["meses"], "mes_inicio": parcial["mes_inicio"], "versao_id": parcial["versao_id"],
                         "periodo": _rotulo_periodo(parcial["mes_inicio"], parcial["meses"]), "arquivo": parcial["arquivo"], "importado_em": parcial["importado_em"]} if parcial else None)}


def parcial_do_ano(con: sqlite3.Connection) -> Optional[dict]:
    """Ano em andamento importado (ex.: jan a jun de 2026): valores em R$ por demonstrativo e código."""
    r = con.execute("SELECT * FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1").fetchone()
    if not r:
        return None
    v: Dict[str, Dict[str, float]] = {"BP": {}, "DRE": {}}
    for x in con.execute("SELECT demonstrativo, codigo, valor FROM realizado_parcial WHERE ano=?", (r["ano"],)):
        v[x["demonstrativo"]][x["codigo"]] = x["valor"] / 1000.0
    return {"ano": r["ano"], "meses": r["meses"], "mes_inicio": r["mes_inicio"], "versao_id": r["versao_id"], "arquivo": r["arquivo"], "importado_em": r["importado_em"], **v}


def periodo_do_ano(con: sqlite3.Connection, ano: int) -> Optional[dict]:
    """Realizado de um ano importado para comparar com o orçamento: o ano em andamento (com o período) ou um ano fechado (jan a dez), em R$."""
    p = parcial_do_ano(con)
    if p and p["ano"] == ano:
        return p
    if not con.execute("SELECT 1 FROM realizado_anos WHERE ano=?", (ano,)).fetchone():
        return None
    v: Dict[str, Dict[str, float]] = {"BP": {}, "DRE": {}}
    for x in con.execute("SELECT demonstrativo, codigo, valor FROM realizado WHERE ano=?", (ano,)):
        v[x["demonstrativo"]][x["codigo"]] = x["valor"] / 1000.0
    return {"ano": ano, "meses": 12, "mes_inicio": 1, "versao_id": None, "arquivo": "", "importado_em": "", **v}


def importacoes_comparaveis(con: sqlite3.Connection) -> List[dict]:
    """Importações que podem ser comparadas com um orçamento: cada ano fechado e o ano em andamento (com o período)."""
    out = [{"ano": a["ano"], "rotulo": a["rotulo"], "parcial": bool(a.get("parcial")), "temDRE": True} for a in quantidades_por_ano(con)["anos"]]
    for o in out:
        o["temDRE"] = bool(con.execute("SELECT 1 FROM realizado WHERE ano=? AND demonstrativo='DRE' UNION SELECT 1 FROM realizado_parcial WHERE ano=? AND demonstrativo='DRE'", (o["ano"], o["ano"])).fetchone())
    return [o for o in out if o["temDRE"]]


def ultimo_ano(con: sqlite3.Connection) -> Optional[int]:
    """Último ano que tem BP e DRE realizados (os dois são necessários para calcular prazos)."""
    r = con.execute("SELECT MAX(ano) AS a FROM realizado_anos WHERE demonstrativo='BP' AND ano IN "
                    "(SELECT ano FROM realizado_anos WHERE demonstrativo='DRE')").fetchone()
    return r["a"]


def prazos(con: sqlite3.Connection) -> dict:
    """Prazos médios realizados (em dias) por ano: saldo do balanço ÷ (base do ano ÷ dias do ano). Mesma lógica da projeção, ao contrário."""
    val = _valores(con)
    anos = sorted(a for a in {a for c in val["BP"].values() for a in c} if a in {a for c in val["DRE"].values() for a in c})
    rl, cpv = val["DRE"].get(CODIGO_RECEITA_LIQUIDA, {}), val["DRE"].get(CODIGO_CPV, {})
    campos: Dict[str, Dict[int, Optional[float]]] = {k: {} for k in PRAZOS}
    detalhe: Dict[str, Dict[int, dict]] = {k: {} for k in PRAZOS}
    saldos: Dict[str, Dict[int, float]] = {k: {a: sum(val["BP"].get(c, {}).get(a, 0.0) for c in cs) / 1000.0 for a in anos} for k, cs in SALDOS.items()}
    ded = val["DRE"].get(CODIGO_DEDUCOES, {})
    base = {"RL": {a: rl.get(a, 0.0) for a in anos}, "CPV": {a: -cpv.get(a, 0.0) for a in anos}, "DED": {a: -ded.get(a, 0.0) for a in anos}}
    for a in anos:
        for campo, (contas, b) in PRAZOS.items():
            saldo = sum(val["BP"].get(c, {}).get(a, 0.0) for c in contas)
            x = base[b][a]
            campos[campo][a] = saldo / (x / dias_do_ano(a)) if x > 0 else None
            if x > 0:                                                              # sem base no ano não há cálculo a mostrar
                detalhe[campo][a] = {"saldo": saldo, "base": x, "dias_ano": dias_do_ano(a)}
    return {"anos": anos, "campos": campos, "base": base, "detalhe": detalhe, "saldos": saldos}


def valor_realizado(con: sqlite3.Connection, demonstrativo: str, codigo: str, ano: int) -> Optional[float]:
    """Valor realizado de uma conta em um ano, em R$ (None se não houver). Ano em andamento (ex.: jan a jun): o valor do período é anualizado (× 12 ÷ meses)."""
    r = con.execute("SELECT valor FROM realizado WHERE demonstrativo=? AND codigo=? AND ano=?", (demonstrativo, codigo, ano)).fetchone()
    if r:
        return r["valor"] / 1000.0
    p = con.execute("SELECT p.valor, a.meses, a.mes_inicio FROM realizado_parcial p JOIN realizado_parcial_anos a ON a.ano=p.ano WHERE p.demonstrativo=? AND p.codigo=? AND p.ano=?",
                    (demonstrativo, codigo, ano)).fetchone()
    return p["valor"] / 1000.0 * 12.0 / (p["meses"] - p["mes_inicio"] + 1) if p else None


NCG_ATIVO = ["SA08", "SA13", "SA14", "SA10", "SA11", "SA12"]       # as mesmas contas que o Capital de giro projeta
NCG_PASSIVO = ["SP07", "SP09", "SP10", "SP11"]


def saldo_inicial(con: sqlite3.Connection, primeiro_ano: int) -> Optional[dict]:
    """Balanço realizado mais recente anterior ao primeiro ano da versão (R$ mil por código), com a NCG real dessas contas."""
    r = con.execute("SELECT MAX(ano) AS a FROM realizado WHERE demonstrativo='BP' AND ano<?", (primeiro_ano,)).fetchone()
    parcial = con.execute("SELECT ano, meses FROM realizado_parcial_anos WHERE ano<? ORDER BY ano DESC LIMIT 1", (primeiro_ano,)).fetchone()
    if parcial and (r["a"] is None or parcial["ano"] > r["a"]):               # ano em andamento mais recente (ex.: balanço de 30/06): é o ponto de partida
        ano, meses = parcial["ano"], parcial["meses"]
        v = {x["codigo"]: x["valor"] / 1000.0 for x in con.execute("SELECT codigo, valor FROM realizado_parcial WHERE demonstrativo='BP' AND ano=?", (ano,))}
    elif r["a"] is None:
        return None
    else:
        ano, meses = r["a"], None
        v = {x["codigo"]: x["valor"] / 1000.0 for x in con.execute("SELECT codigo, valor FROM realizado WHERE demonstrativo='BP' AND ano=?", (ano,))}
    ncg = sum(v.get(c, 0.0) for c in NCG_ATIVO) - sum(v.get(c, 0.0) for c in NCG_PASSIVO)
    return {"ano": ano, "meses": meses, "valores": v, "ncg": ncg}


# ---------------------------------------------------------------- período em andamento: orçamento comparado e quantidades vendidas
def periodo(con: sqlite3.Connection) -> Optional[dict]:
    """Período do realizado em andamento, o orçamento que ele compara e a lista de produtos com a quantidade vendida informada."""
    r = con.execute("SELECT * FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1").fetchone()
    if not r:
        return None
    q = {x["cultura_id"]: x["quantidade"] for x in con.execute("SELECT cultura_id, quantidade FROM realizado_quantidades WHERE ano=?", (r["ano"],))}
    produtos = [{"id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "unidade": c["unidade"], "quantidade": q.get(c["id"])}
                for c in con.execute("SELECT id, nome, grupo, unidade FROM culturas WHERE ativa=1 AND receita_tipo='operacional' ORDER BY grupo, nome COLLATE NOCASE")]
    versoes = [{"id": v["id"], "nome": v["nome"], "status": v["status"], "tipo": v["tipo"]}
               for v in con.execute("SELECT id, nome, status, tipo FROM versoes WHERE ano_base<=? AND ano_base+horizonte>? ORDER BY (status='aprovado') DESC, id", (r["ano"], r["ano"]))]
    return {"ano": r["ano"], "mes_inicio": r["mes_inicio"], "mes_fim": r["meses"], "periodo": _rotulo_periodo(r["mes_inicio"], r["meses"]), "versao_id": r["versao_id"],
            "arquivo": r["arquivo"], "produtos": produtos, "versoes": versoes}


def salvar_periodo(con: sqlite3.Connection, mes_inicio: int, mes_fim: int, versao_id: Optional[int], autor: str) -> None:
    r = con.execute("SELECT ano FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1").fetchone()
    if not r:
        raise Invalido("Não há realizado em andamento. Suba o fechamento do período na tela Realizado.")
    if not (1 <= mes_inicio <= mes_fim <= 12):
        raise Invalido("Informe o período: o mês inicial não pode ser depois do final")
    if versao_id is not None:
        arr.obter_versao(con, versao_id)
    con.execute("UPDATE realizado_parcial_anos SET mes_inicio=?, meses=?, versao_id=? WHERE ano=?", (mes_inicio, mes_fim, versao_id, r["ano"]))
    arr.auditar(con, autor, versao_id, "salvar_periodo_realizado", f"{r['ano']}: {_rotulo_periodo(mes_inicio, mes_fim)}")


def quantidades_por_ano(con: sqlite3.Connection) -> dict:
    """Quantidade vendida de cada produto por ano importado (anos fechados e o ano em andamento, com o período)."""
    anos = [{"ano": r["ano"], "rotulo": str(r["ano"])} for r in con.execute("SELECT DISTINCT ano FROM realizado_anos ORDER BY ano")]
    p = con.execute("SELECT ano, mes_inicio, meses FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1").fetchone()
    if p and p["ano"] not in {a["ano"] for a in anos}:
        anos.append({"ano": p["ano"], "rotulo": f"{p['ano']} · {_rotulo_periodo(p['mes_inicio'] or 1, p['meses'])}", "parcial": True})
    elif p:
        for a in anos:
            if a["ano"] == p["ano"]:
                a.update(rotulo=f"{p['ano']} · {_rotulo_periodo(p['mes_inicio'] or 1, p['meses'])}", parcial=True)
    q: Dict[int, Dict[int, float]] = {}
    for x in con.execute("SELECT ano, cultura_id, quantidade FROM realizado_quantidades"):
        q.setdefault(x["cultura_id"], {})[x["ano"]] = x["quantidade"]
    return {"anos": anos, "produtos": [{**pr, "valores": q.get(pr["id"], {})} for pr in produtos_venda(con)]}


def salvar_quantidade(con: sqlite3.Connection, cultura_id: int, quantidade: Optional[float], autor: str, ano: Optional[int] = None) -> None:
    if ano is None:                                                             # sem ano: o do período em andamento
        r = con.execute("SELECT ano FROM realizado_parcial_anos ORDER BY ano DESC LIMIT 1").fetchone()
        if not r:
            raise Invalido("Não há realizado em andamento. Suba o fechamento do período na tela Realizado.")
        ano = r["ano"]
    elif not (con.execute("SELECT 1 FROM realizado_anos WHERE ano=?", (ano,)).fetchone() or con.execute("SELECT 1 FROM realizado_parcial_anos WHERE ano=?", (ano,)).fetchone()):
        raise Invalido(f"Não há realizado importado de {ano}")
    if quantidade is not None and quantidade < 0:
        raise Invalido("A quantidade vendida não pode ser negativa")
    c = con.execute("SELECT nome FROM culturas WHERE id=?", (cultura_id,)).fetchone()
    if not c:
        raise NaoEncontrado("Produto não encontrado")
    if quantidade is None:
        con.execute("DELETE FROM realizado_quantidades WHERE ano=? AND cultura_id=?", (ano, cultura_id))
    else:
        con.execute("INSERT INTO realizado_quantidades(ano, cultura_id, quantidade) VALUES(?,?,?) ON CONFLICT(ano, cultura_id) DO UPDATE SET quantidade=excluded.quantidade",
                    (ano, cultura_id, quantidade))
    arr.auditar(con, autor, None, "salvar_quantidade_realizado", f"{ano} {c['nome']}: {quantidade}")


# ---------------------------------------------------------------- planilha modelo
def modelo(con: sqlite3.Connection) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    ws.title = "Realizado"
    ws.append(["Ano", "Demonstrativo", "Código", "Conta", "Valor"])
    for c in ws[1]:
        c.font = Font(bold=True)
    ano = dt.date.today().year - 1
    for dem, tab in (("BP", "SELECT codigo, nome, tipo FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo"),
                     ("DRE", "SELECT codigo, nome, tipo FROM dre_linhas WHERE nivel='sintetica' AND ativa=1 ORDER BY ordem, codigo")):
        for r in con.execute(tab):
            if "%" not in r["nome"]:
                ws.append([ano, dem, r["codigo"], r["nome"], None])
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["D"].width = 52
    ajuda = wb.create_sheet("Como preencher")
    for linha in ["Preencha só a coluna Valor, em R$ (não em R$). Linhas sem valor são ignoradas.",
                  "Troque a coluna Ano pelo ano do fechamento e copie as linhas para cada ano que quiser subir.",
                  "BP = Balanço patrimonial no dia 31/12 · DRE = resultado do ano inteiro (janeiro a dezembro).",
                  "Receitas positivas, custos e despesas negativos (como na DRE do sistema).",
                  "Subir um ano de novo substitui o que já estava lá."]:
        ajuda.append([linha])
    ajuda.column_dimensions["A"].width = 100
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
