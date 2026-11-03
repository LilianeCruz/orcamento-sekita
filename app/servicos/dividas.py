"""Base de dívidas: importa o 'Endividamento alterado.xlsx' (gerado pelo sistema de Endividamento)
e resume os títulos em aberto por ano, mês, banco e tipo. Cada importação é uma foto; a versão
do orçamento aponta para uma delas, para o Orçado aprovado não mudar quando houver base mais nova."""
from __future__ import annotations

import datetime as dt
import io
import os
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado

ARQUIVO_PADRAO = Path(os.environ.get(
    "ENDIVIDAMENTO_ARQUIVO",
    Path(__file__).resolve().parents[3] / "Endividamento_Sekita" / "Endividamento alterado.xlsx"))

# grupos de empresas do modelo: Agropecuária = MESO + AFAL; Transportadora = ST + TAL
EMPRESAS = {"agro": ("MESO", "AFAL"), "transp": ("ST", "TAL"), "todas": None}
GRUPOS_DIVIDA = ("capital_giro", "investimento")
TIPO_PARA_GRUPO = {"investimento": "investimento", "custeio": "capital_giro",
                   "capital de giro": "capital_giro", "egf": "capital_giro"}
OBRIGATORIAS = ["Situação", "Empresa", "Tipo", "Banco", "Data Vencimento", "Vr. Principal", "Vr. Juros"]


# ---------------------------------------------------------------- leitura do arquivo
def _data(v) -> Tuple[Optional[str], bool]:
    """(data ISO, veio_como_texto). Aceita datetime/date e texto dd/mm/aaaa."""
    if isinstance(v, dt.datetime):
        return v.date().isoformat(), False
    if isinstance(v, dt.date):
        return v.isoformat(), False
    if isinstance(v, str) and v.strip():
        t = v.strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return dt.datetime.strptime(t, fmt).date().isoformat(), True
            except ValueError:
                pass
    return None, False


def _num(v) -> float:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(".", "").replace(",", ".")) if "," in v else float(v)
        except ValueError:
            return 0.0
    return 0.0


def _txt(v) -> str:
    return "" if v is None else str(v).strip()


def ler_planilha(conteudo: bytes) -> Tuple[List[dict], List[str]]:
    from openpyxl import load_workbook
    try:
        wb = load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    except Exception:
        raise Invalido("Não consegui abrir o arquivo. Use o 'Endividamento alterado.xlsx' do sistema de Endividamento.")
    if "Dados" not in wb.sheetnames:
        raise Invalido("O arquivo não tem a aba 'Dados'. Use o 'Endividamento alterado.xlsx' do sistema de Endividamento.")
    linhas = wb["Dados"].iter_rows(values_only=True)
    cab = [(_txt(c)) for c in next(linhas, ())]
    faltam = [h for h in OBRIGATORIAS if h not in cab]
    if faltam:
        raise Invalido("Faltam colunas na aba 'Dados': " + ", ".join(faltam))
    ix = {h: i for i, h in enumerate(cab) if h}
    titulos: List[dict] = []
    avisos: List[str] = []
    como_texto = sem_venc = tipo_desc = 0
    for r in linhas:
        if all(c is None for c in r):
            continue
        g = lambda k: r[ix[k]] if k in ix and ix[k] < len(r) else None
        situacao = _txt(g("Situação")).upper()
        if situacao not in ("AB", "PG"):
            continue
        tipo = _txt(g("Tipo"))
        grupo = TIPO_PARA_GRUPO.get(tipo.lower(), "indefinido")
        venc, texto = _data(g("Data Vencimento"))
        if venc is None and all(g(k) is not None for k in ("Dia Vencimento", "Mês Vencimento", "Ano Vencimento")):
            try:
                venc = dt.date(int(g("Ano Vencimento")), int(g("Mês Vencimento")), int(g("Dia Vencimento"))).isoformat()
                texto = True
            except (ValueError, TypeError):
                pass
        operacao, _ = _data(g("Data Operação"))
        taxa = g("Juros")
        doc = _txt(g("Número do Documento"))
        principal, juros = _num(g("Vr. Principal")), _num(g("Vr. Juros"))
        outras = _num(g("Vr. Outras Despesas"))
        titulos.append({
            "situacao": situacao, "empresa": _txt(g("Empresa")).upper(), "tipo": tipo, "grupo": grupo,
            "banco": _txt(g("Banco")), "tipo_recurso": _txt(g("Tipo do Recurso")), "linha_credito": _txt(g("Linha de Crédito")),
            "documento": doc, "contrato": doc.split("/")[0].strip(),
            "taxa": float(taxa) if isinstance(taxa, (int, float)) and not isinstance(taxa, bool) else None,
            "data_operacao": operacao, "data_vencimento": venc,
            "principal": principal, "juros": juros, "outras_despesas": outras,
            "bruto": _num(g("Vr. Bruto Aberto")) or (principal + juros + outras),
            "produto": _txt(g("PRODUTO")), "observacao": _txt(g("Observação")),
        })
        if situacao == "AB":
            como_texto += 1 if texto else 0
            sem_venc += 1 if venc is None else 0
            tipo_desc += 1 if grupo == "indefinido" else 0
    if not titulos:
        raise Invalido("A aba 'Dados' não tem nenhum título (situação AB ou PG).")
    if como_texto:
        avisos.append(f"{como_texto} vencimento(s) em aberto estavam como texto e foram convertidos em data")
    if sem_venc:
        avisos.append(f"{sem_venc} título(s) em aberto estão sem data de vencimento e não entram nos totais por ano")
    if tipo_desc:
        avisos.append(f"{tipo_desc} título(s) em aberto têm um tipo desconhecido e ficaram fora de capital de giro e investimento")
    return titulos, avisos


# ---------------------------------------------------------------- importação
def importar(con: sqlite3.Connection, conteudo: bytes, nome_arquivo: str, vid: Optional[int], autor: str) -> dict:
    if vid is not None:
        arr.versao_editavel(con, vid)               # falha antes de ler o arquivo se a versão estiver travada
    titulos, avisos = ler_planilha(conteudo)
    cur = con.execute(
        "INSERT INTO divida_importacoes(arquivo, importado_em, autor, qtd_titulos, qtd_abertos, avisos) VALUES(?,?,?,?,?,?)",
        (nome_arquivo, dt.datetime.now().isoformat(timespec="seconds"), autor, len(titulos),
         sum(1 for t in titulos if t["situacao"] == "AB"), "\n".join(avisos)),
    )
    iid = cur.lastrowid
    con.executemany(
        "INSERT INTO divida_titulos(importacao_id, situacao, empresa, tipo, grupo, banco, tipo_recurso, linha_credito, "
        "documento, contrato, taxa, data_operacao, data_vencimento, principal, juros, outras_despesas, bruto, produto, observacao) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [(iid, t["situacao"], t["empresa"], t["tipo"], t["grupo"], t["banco"], t["tipo_recurso"], t["linha_credito"],
          t["documento"], t["contrato"], t["taxa"], t["data_operacao"], t["data_vencimento"], t["principal"], t["juros"],
          t["outras_despesas"], t["bruto"], t["produto"], t["observacao"]) for t in titulos],
    )
    arr.auditar(con, autor, vid, "importar_dividas", f"{nome_arquivo}: {len(titulos)} títulos")
    if vid is not None:
        con.execute("UPDATE versoes SET divida_importacao_id=? WHERE id=?", (iid, vid))
    return {"importacao_id": iid, "titulos": len(titulos), "abertos": sum(1 for t in titulos if t["situacao"] == "AB"),
            "avisos": avisos}


def importar_arquivo_padrao(con: sqlite3.Connection, vid: Optional[int], autor: str) -> dict:
    if not ARQUIVO_PADRAO.exists():
        raise Invalido(f"Não encontrei o arquivo do sistema de Endividamento em {ARQUIVO_PADRAO}. Use 'Escolher arquivo…'.")
    return importar(con, ARQUIVO_PADRAO.read_bytes(), ARQUIVO_PADRAO.name, vid, autor)


def listar_importacoes(con: sqlite3.Connection) -> List[dict]:
    return [dict(r) | {"avisos": [x for x in r["avisos"].split("\n") if x]} for r in
            con.execute("SELECT * FROM divida_importacoes ORDER BY id DESC")]


def vincular(con: sqlite3.Connection, vid: int, importacao_id: Optional[int], autor: str) -> None:
    arr.versao_editavel(con, vid)
    if importacao_id is not None and not con.execute("SELECT 1 FROM divida_importacoes WHERE id=?", (importacao_id,)).fetchone():
        raise NaoEncontrado(f"Importação {importacao_id} não existe")
    con.execute("UPDATE versoes SET divida_importacao_id=? WHERE id=?", (importacao_id, vid))
    arr.auditar(con, autor, vid, "vincular_base_dividas", str(importacao_id))


# ---------------------------------------------------------------- resumo
def _filtro(empresas: str) -> Tuple[str, list]:
    """Uma ou mais siglas de empresa separadas por vírgula (MESO, AFAL, ST...; vários = soma) ou, por compatibilidade,
    os grupos 'agro', 'transp' e 'todas'."""
    if empresas in EMPRESAS:
        siglas = EMPRESAS[empresas]
        if not siglas:
            return "", []
        return f" AND empresa IN ({','.join('?' * len(siglas))})", list(siglas)
    siglas = [x.strip().upper() for x in (empresas or "").split(",") if x.strip()]
    if not siglas:
        raise Invalido("Informe a empresa")
    if len(siglas) == 1:
        return " AND empresa=?", siglas
    return f" AND empresa IN ({','.join('?' * len(siglas))})", siglas      # várias empresas: os números são a soma delas


def empresas_da_base(con: sqlite3.Connection, importacao_id: int) -> List[dict]:
    """Empresas que têm títulos em aberto na base, da maior para a menor dívida."""
    return [dict(r) for r in con.execute(
        "SELECT empresa AS sigla, COUNT(*) titulos, SUM(principal) principal, SUM(juros) juros FROM divida_titulos "
        "WHERE importacao_id=? AND situacao='AB' GROUP BY empresa ORDER BY principal DESC", (importacao_id,))]


def _importacao_da_versao(con: sqlite3.Connection, vid: int) -> Optional[dict]:
    v = arr.obter_versao(con, vid)
    if not v["divida_importacao_id"]:
        return None
    r = con.execute("SELECT * FROM divida_importacoes WHERE id=?", (v["divida_importacao_id"],)).fetchone()
    if not r:
        return None
    d = dict(r)
    d["avisos"] = [x for x in d["avisos"].split("\n") if x]
    return d


def resumo(con: sqlite3.Connection, vid: int, empresas: str = "agro") -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos_versao = arr.anos_da_versao(v)
    imp = _importacao_da_versao(con, vid)
    base = {"versao": v, "empresas": empresas, "importacao": imp, "anos_versao": anos_versao, "empresas_disponiveis": []}
    if not imp:
        return {**base, "total": None, "por_ano": {}, "por_banco": [], "por_tipo": [], "sem_vencimento": None}
    disponiveis = empresas_da_base(con, imp["id"])
    base["empresas_disponiveis"] = disponiveis
    if not empresas:                                  # sem escolha: começa pela empresa de maior dívida
        empresas = disponiveis[0]["sigla"] if disponiveis else "todas"
    base["empresas"] = empresas
    filtro, args = _filtro(empresas)
    onde, params = "importacao_id=? AND situacao='AB'" + filtro, [imp["id"]] + args

    t = con.execute(
        f"SELECT COUNT(*) n, COALESCE(SUM(principal),0) p, COALESCE(SUM(juros),0) j, COALESCE(SUM(outras_despesas),0) o "
        f"FROM divida_titulos WHERE {onde}", params).fetchone()
    tx = con.execute(
        f"SELECT SUM(principal*taxa)/SUM(principal) FROM divida_titulos WHERE {onde} AND taxa IS NOT NULL AND principal>0",
        params).fetchone()[0]
    total = {"titulos": t["n"], "principal": t["p"], "juros": t["j"], "outras_despesas": t["o"], "taxa_media": tx}

    por_ano: Dict[str, dict] = {}
    for r in con.execute(
        f"SELECT strftime('%Y', data_vencimento) ano, grupo, SUM(principal) p, SUM(juros) j, COUNT(*) n "
        f"FROM divida_titulos WHERE {onde} AND data_vencimento IS NOT NULL GROUP BY ano, grupo", params):
        a = por_ano.setdefault(r["ano"], {"capital_giro": {"principal": 0.0, "juros": 0.0}, "investimento": {"principal": 0.0, "juros": 0.0},
                                          "indefinido": {"principal": 0.0, "juros": 0.0}, "titulos": 0})
        a[r["grupo"]]["principal"] += r["p"]; a[r["grupo"]]["juros"] += r["j"]; a["titulos"] += r["n"]
    for a in por_ano.values():
        a["principal"] = sum(a[g]["principal"] for g in ("capital_giro", "investimento", "indefinido"))
        a["juros"] = sum(a[g]["juros"] for g in ("capital_giro", "investimento", "indefinido"))
    por_ano = dict(sorted(por_ano.items()))

    por_banco = [dict(r) for r in con.execute(
        f"SELECT banco, COUNT(*) titulos, SUM(principal) principal, SUM(juros) juros FROM divida_titulos "
        f"WHERE {onde} GROUP BY banco ORDER BY principal DESC", params)]
    por_tipo = [dict(r) for r in con.execute(
        f"SELECT tipo, grupo, COUNT(*) titulos, SUM(principal) principal, SUM(juros) juros FROM divida_titulos "
        f"WHERE {onde} GROUP BY tipo, grupo ORDER BY principal DESC", params)]
    sv = con.execute(
        f"SELECT COUNT(*) n, COALESCE(SUM(principal),0) p, COALESCE(SUM(juros),0) j FROM divida_titulos "
        f"WHERE {onde} AND data_vencimento IS NULL", params).fetchone()
    sem = {"titulos": sv["n"], "principal": sv["p"], "juros": sv["j"]} if sv["n"] else None
    return {**base, "total": total, "por_ano": por_ano, "por_banco": por_banco, "por_tipo": por_tipo, "sem_vencimento": sem}


def mensal(con: sqlite3.Connection, vid: int, ano: int, empresas: str = "agro") -> dict:
    """Vencimentos em aberto mês a mês de um ano: é a base do fluxo de caixa mensal (amortização e juros)."""
    imp = _importacao_da_versao(con, vid)
    meses = [{"mes": m, "capital_giro": {"principal": 0.0, "juros": 0.0}, "investimento": {"principal": 0.0, "juros": 0.0},
              "indefinido": {"principal": 0.0, "juros": 0.0}} for m in range(1, 13)]
    if not imp:
        return {"ano": ano, "importacao": None, "meses": meses}
    filtro, args = _filtro(empresas)
    for r in con.execute(
        "SELECT CAST(strftime('%m', data_vencimento) AS INTEGER) m, grupo, SUM(principal) p, SUM(juros) j FROM divida_titulos "
        "WHERE importacao_id=? AND situacao='AB' AND data_vencimento IS NOT NULL AND strftime('%Y', data_vencimento)=?" + filtro +
        " GROUP BY m, grupo", [imp["id"], str(ano)] + args):
        meses[r["m"] - 1][r["grupo"]]["principal"] += r["p"]
        meses[r["m"] - 1][r["grupo"]]["juros"] += r["j"]
    return {"ano": ano, "importacao": imp, "meses": meses}


def contratos(con: sqlite3.Connection, vid: int, empresas: str = "agro", ano: Optional[int] = None,
              grupo: Optional[str] = None) -> dict:
    """Lista no formato da aba Endividamento da planilha de orçamento: uma linha por título em aberto,
    ordenada por vencimento, para o frontend agrupar por ano de vencimento e abrir a grade mensal."""
    if grupo not in (None, "", "capital_giro", "investimento"):
        raise Invalido("Grupo deve ser 'capital_giro' ou 'investimento'")
    imp = _importacao_da_versao(con, vid)
    if not imp:
        return {"importacao": None, "anos": [], "linhas": []}
    filtro, args = _filtro(empresas)
    onde, params = "importacao_id=? AND situacao='AB'" + filtro, [imp["id"]] + args
    if grupo:
        onde += " AND grupo=?"; params.append(grupo)
    anos = [int(r[0]) for r in con.execute(
        f"SELECT DISTINCT strftime('%Y', data_vencimento) a FROM divida_titulos WHERE {onde} AND data_vencimento IS NOT NULL ORDER BY a",
        params)]
    if ano is not None:
        onde += " AND strftime('%Y', data_vencimento)=?"; params.append(str(ano))
    linhas = [dict(r) for r in con.execute(
        f"SELECT empresa, tipo, grupo, taxa, banco, linha_credito, produto, documento, data_operacao, data_vencimento, "
        f"principal, juros, outras_despesas, bruto FROM divida_titulos WHERE {onde} "
        f"ORDER BY data_vencimento IS NULL, data_vencimento, banco, documento, id", params)]
    return {"importacao": imp, "anos": anos, "linhas": linhas}


ORDEM_TIPOS = ["Custeio", "Capital de Giro", "Investimento", "EGF"]


def balanco(con: sqlite3.Connection, vid: int, empresas: str = "agro") -> dict:
    """Dívida em aberto em 31/12 de cada ano, em curto e longo prazo, com a abertura por tipo.

    No balanço de 31/12/Y, curto prazo é o que vence até 31/12 do ano seguinte (ano Y+1) e longo prazo é o que
    vem depois (Y+2 em diante). Usa o saldo de principal em aberto. A primeira data é 31/12 do ano da importação:
    datas anteriores ficariam incompletas, porque os títulos já pagos não estão mais em aberto.
    Também traz os juros que vencem em cada ano (custo da dívida), com a mesma abertura por tipo."""
    imp = _importacao_da_versao(con, vid)
    base = {"importacao": imp, "empresas": empresas, "anos": [], "tipos": [], "curto": {}, "longo": {},
            "curto_total": {}, "longo_total": {}, "total": {}, "juros": {}, "juros_total": {}, "sem_vencimento": None}
    if not imp:
        return base
    filtro, args = _filtro(empresas)
    onde, params = "importacao_id=? AND situacao='AB'" + filtro, [imp["id"]] + args
    por: Dict[Tuple[int, str], dict] = {}
    for r in con.execute(
        f"SELECT CAST(strftime('%Y', data_vencimento) AS INTEGER) a, tipo, SUM(principal) p, SUM(juros) j FROM divida_titulos "
        f"WHERE {onde} AND data_vencimento IS NOT NULL GROUP BY a, tipo", params):
        por[(r["a"], r["tipo"] or "(sem tipo)")] = {"p": r["p"], "j": r["j"]}
    sv = con.execute(f"SELECT COUNT(*) n, COALESCE(SUM(principal),0) v FROM divida_titulos WHERE {onde} AND data_vencimento IS NULL",
                     params).fetchone()
    base["sem_vencimento"] = {"titulos": sv["n"], "valor": sv["v"]} if sv["n"] else None
    anos_venc = sorted({a for a, _ in por})
    if not anos_venc:
        return base
    presentes = {t for _, t in por}
    tipos = [t for t in ORDEM_TIPOS if t in presentes] + sorted(presentes - set(ORDEM_TIPOS))
    anos = list(range(min(int(imp["importado_em"][:4]), anos_venc[0]), anos_venc[-1] + 1))
    curto = {t: {} for t in tipos}; longo = {t: {} for t in tipos}; juros = {t: {} for t in tipos}
    for y in anos:
        for t in tipos:
            curto[t][y] = por.get((y + 1, t), {}).get("p", 0.0)
            longo[t][y] = sum(v["p"] for (a, tt), v in por.items() if tt == t and a >= y + 2)
            juros[t][y] = por.get((y, t), {}).get("j", 0.0)
    soma = lambda d: {y: sum(d[t][y] for t in tipos) for y in anos}
    ct, lt = soma(curto), soma(longo)
    base.update({"anos": anos, "tipos": tipos, "curto": curto, "longo": longo, "curto_total": ct, "longo_total": lt,
                 "total": {y: ct[y] + lt[y] for y in anos}, "juros": juros, "juros_total": soma(juros)})
    return base


def mensal_por_ano(con: sqlite3.Connection, vid: int, empresas: str = "agro") -> dict:
    """Vencimentos em aberto por ano, mês e tipo (principal e juros): base do resumo mensal.
    'dados' traz só as combinações que existem; quem monta a tabela soma o que precisar."""
    imp = _importacao_da_versao(con, vid)
    base = {"importacao": imp, "empresas": empresas, "anos": [], "tipos": [], "dados": [], "sem_vencimento": None}
    if not imp:
        return base
    filtro, args = _filtro(empresas)
    onde, params = "importacao_id=? AND situacao='AB'" + filtro, [imp["id"]] + args
    dados = [{"ano": r["a"], "mes": r["m"], "tipo": r["tipo"] or "(sem tipo)", "principal": r["p"], "juros": r["j"]} for r in con.execute(
        f"SELECT CAST(strftime('%Y', data_vencimento) AS INTEGER) a, CAST(strftime('%m', data_vencimento) AS INTEGER) m, tipo, "
        f"SUM(principal) p, SUM(juros) j FROM divida_titulos WHERE {onde} AND data_vencimento IS NOT NULL "
        f"GROUP BY a, m, tipo ORDER BY a, m", params)]
    sv = con.execute(f"SELECT COUNT(*) n, COALESCE(SUM(principal),0) v FROM divida_titulos WHERE {onde} AND data_vencimento IS NULL",
                     params).fetchone()
    base["sem_vencimento"] = {"titulos": sv["n"], "valor": sv["v"]} if sv["n"] else None
    if not dados:
        return base
    presentes = {d["tipo"] for d in dados}
    base["tipos"] = [t for t in ORDEM_TIPOS if t in presentes] + sorted(presentes - set(ORDEM_TIPOS))
    base["anos"] = list(range(min(d["ano"] for d in dados), max(d["ano"] for d in dados) + 1))
    base["dados"] = dados
    return base
