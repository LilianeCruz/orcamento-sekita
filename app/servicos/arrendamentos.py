"""Regras da tela de Arrendamentos: versões, cadastro de fazendas, parcelas, preços e cálculo."""
from __future__ import annotations

import datetime as dt
import sqlite3
from typing import Dict, List, Optional

HORIZONTE = 5          # horizonte padrão (anos a partir do ano base)
HORIZONTE_MAX = 30
PERIODICIDADE = {"mensal": 1, "bimestral": 2, "trimestral": 3, "semestral": 6, "anual": 12}


class Travada(Exception):
    """Versão aprovada: não aceita alteração."""


class NaoEncontrado(Exception):
    pass


class Invalido(Exception):
    pass


def anos_da_versao(v) -> List[int]:
    return list(range(v["ano_base"], v["ano_base"] + v["horizonte"]))


def _agora() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def auditar(con: sqlite3.Connection, autor: str, versao_id: Optional[int], acao: str, detalhe: str = "") -> None:
    con.execute(
        "INSERT INTO auditoria(quando, autor, versao_id, acao, detalhe) VALUES(?,?,?,?,?)",
        (_agora(), autor, versao_id, acao, detalhe),
    )


# ---------------------------------------------------------------- versões
def obter_versao(con: sqlite3.Connection, vid: int) -> sqlite3.Row:
    v = con.execute("SELECT * FROM versoes WHERE id=?", (vid,)).fetchone()
    if not v:
        raise NaoEncontrado(f"Versão {vid} não existe")
    return v


def versao_editavel(con: sqlite3.Connection, vid: int) -> sqlite3.Row:
    v = obter_versao(con, vid)
    if v["status"] == "aprovado":
        raise Travada(f"A versão '{v['nome']}' está aprovada e travada. Crie um Reprojetado para ajustar.")
    return v


def versao_da_fazenda(con: sqlite3.Connection, fid: int) -> int:
    r = con.execute("SELECT versao_id FROM fazendas WHERE id=?", (fid,)).fetchone()
    if not r:
        raise NaoEncontrado(f"Fazenda {fid} não existe")
    return r["versao_id"]


def listar_versoes(con: sqlite3.Connection) -> List[dict]:
    return [dict(r) for r in con.execute("SELECT * FROM versoes ORDER BY ano_base DESC, id DESC")]


def _validar_horizonte(h: int) -> None:
    if not 1 <= h <= HORIZONTE_MAX:
        raise Invalido(f"O horizonte deve ficar entre 1 e {HORIZONTE_MAX} anos")


def _periodo(data_inicio: Optional[str], data_fim: Optional[str]):
    """Converte o período em datas para (ano_base, horizonte). O orçamento é anual: vale do ano da data inicial ao da final."""
    try:
        ini, fim = dt.date.fromisoformat(data_inicio), dt.date.fromisoformat(data_fim)
    except (TypeError, ValueError):
        raise Invalido("Informe as datas de início e fim do orçamento")
    if fim <= ini:
        raise Invalido("A data final deve ser depois da data inicial")
    return ini.year, fim.year - ini.year + 1


def criar_orcado(con: sqlite3.Connection, ano_base: Optional[int], nome: Optional[str], autor: str,
                 horizonte: int = HORIZONTE, data_inicio: Optional[str] = None, data_fim: Optional[str] = None) -> int:
    if data_inicio or data_fim:
        ano_base, horizonte = _periodo(data_inicio, data_fim)
    elif ano_base is None:
        raise Invalido("Informe o período do orçamento")
    nome = (nome or f"Orçamento {ano_base}").strip()
    _validar_horizonte(horizonte)
    cur = con.execute(
        "INSERT INTO versoes(ano_base, tipo, nome, horizonte, data_inicio, data_fim, criado_em, autor) VALUES(?,?,?,?,?,?,?,?)",
        (ano_base, "orcado", nome, horizonte, data_inicio or None, data_fim or None, _agora(), autor),
    )
    auditar(con, autor, cur.lastrowid, "criar_orcado", nome)
    return cur.lastrowid


def copiar_versao(con: sqlite3.Connection, origem_id: int, tipo: str, nome: Optional[str], autor: str) -> int:
    """Cria uma versão nova (rascunho) copiando todo o conteúdo de Arrendamentos da origem."""
    o = obter_versao(con, origem_id)
    nome = (nome or f"{'Reprojetado' if tipo == 'reprojetado' else 'Revisão'} {o['ano_base']}").strip()
    cur = con.execute(
        "INSERT INTO versoes(ano_base, tipo, nome, horizonte, data_inicio, data_fim, divida_importacao_id, origem_id, criado_em, autor) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (o["ano_base"], tipo, nome, o["horizonte"], o["data_inicio"], o["data_fim"], o["divida_importacao_id"], origem_id, _agora(), autor),
    )
    novo = cur.lastrowid
    mapa: Dict[int, int] = {}
    for f in con.execute("SELECT * FROM fazendas WHERE versao_id=?", (origem_id,)).fetchall():
        c = con.execute(
            "INSERT INTO fazendas(versao_id, nome, tipo, arrendador, forma, cultura_id, observacao) VALUES(?,?,?,?,?,?,?)",
            (novo, f["nome"], f["tipo"], f["arrendador"], f["forma"], f["cultura_id"], f["observacao"]),
        )
        mapa[f["id"]] = c.lastrowid
    for antigo, nova in mapa.items():
        con.execute(
            "INSERT INTO fazenda_anos(fazenda_id, ano, area_ha, valor) SELECT ?, ano, area_ha, valor FROM fazenda_anos WHERE fazenda_id=?",
            (nova, antigo),
        )
        con.execute(
            "INSERT INTO parcelas(fazenda_id, mes, percentual) SELECT ?, mes, percentual FROM parcelas WHERE fazenda_id=?",
            (nova, antigo),
        )
    con.execute(
        "INSERT INTO precos(versao_id, cultura_id, ano, preco) SELECT ?, cultura_id, ano, preco FROM precos WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO culturas_da_versao(versao_id, cultura_id) SELECT ?, cultura_id FROM culturas_da_versao WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO produtividade(versao_id, cultura_id, ano, valor) SELECT ?, cultura_id, ano, valor FROM produtividade WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO precos_venda(versao_id, cultura_id, ano, preco) SELECT ?, cultura_id, ano, preco FROM precos_venda WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute("INSERT INTO transportadora_valores(versao_id, campo, ano, valor) SELECT ?, campo, ano, valor FROM transportadora_valores WHERE versao_id=?", (novo, origem_id))
    con.execute(
        "INSERT INTO capital_giro(versao_id, campo, ano, valor) SELECT ?, campo, ano, valor FROM capital_giro WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO capital_giro_origem(versao_id, campo, ano, ano_realizado, anos) SELECT ?, campo, ano, ano_realizado, anos FROM capital_giro_origem WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO investimento_valores(versao_id, tipo_id, campo, ano, valor) SELECT ?, tipo_id, campo, ano, valor FROM investimento_valores WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute("INSERT INTO dre_padrao(versao_id, codigo, ano, valor) SELECT ?, codigo, ano, valor FROM dre_padrao WHERE versao_id=?", (novo, origem_id))
    con.execute("INSERT INTO rebanho_valores(versao_id, cultura_id, campo, ano, valor) SELECT ?, cultura_id, campo, ano, valor FROM rebanho_valores WHERE versao_id=?", (novo, origem_id))
    con.execute("INSERT INTO investimento_excluidos(versao_id, tipo_id) SELECT ?, tipo_id FROM investimento_excluidos WHERE versao_id=?", (novo, origem_id))
    from . import captacoes as svc_cap
    svc_cap.copiar(con, origem_id, novo)
    con.execute("INSERT INTO patrimonio_valores(versao_id, campo, ano, valor) SELECT ?, campo, ano, valor FROM patrimonio_valores WHERE versao_id=?", (novo, origem_id))
    con.execute("INSERT INTO giro_auto_premissas(versao_id, campo, ano, valor) SELECT ?, campo, ano, valor FROM giro_auto_premissas WHERE versao_id=?", (novo, origem_id))
    con.execute("INSERT INTO indicadores_metas(versao_id, indicador, ano, valor) SELECT ?, indicador, ano, valor FROM indicadores_metas WHERE versao_id=?", (novo, origem_id))
    con.execute(
        "INSERT INTO depreciacao_valores(versao_id, chave, ano, valor) SELECT ?, chave, ano, valor FROM depreciacao_valores WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO culturas_extras(versao_id, cultura_id, tela) SELECT ?, cultura_id, tela FROM culturas_extras WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO pecuaria_leite(versao_id, ano, animais, kg_animal_dia) SELECT ?, ano, animais, kg_animal_dia FROM pecuaria_leite WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO premissas_dem_itens(versao_id, premissa_id) SELECT ?, premissa_id FROM premissas_dem_itens WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO premissas_dem_valores(versao_id, premissa_id, ano, valor) SELECT ?, premissa_id, ano, valor FROM premissas_dem_valores WHERE versao_id=?",
        (novo, origem_id),
    )
    for tabela, colunas in (("prem_culturas", "cultura_id"), ("prem_itens", "cultura_id, tipo"), ("prem_valores", "cultura_id, tipo, ano, valor")):
        con.execute(f"INSERT INTO {tabela}(versao_id, {colunas}) SELECT ?, {colunas} FROM {tabela} WHERE versao_id=?", (novo, origem_id))
    con.execute(
        "INSERT INTO custos_culturas(versao_id, cultura_id) SELECT ?, cultura_id FROM custos_culturas WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO custos_grupos_cultura(versao_id, cultura_id, grupo_id) SELECT ?, cultura_id, grupo_id FROM custos_grupos_cultura WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO custos_cultura(versao_id, cultura_id, grupo_id, ano, valor) SELECT ?, cultura_id, grupo_id, ano, valor FROM custos_cultura WHERE versao_id=?",
        (novo, origem_id),
    )
    con.execute(
        "INSERT INTO areas_cultura(versao_id, cultura_id, ano, area_ha) "
        "SELECT ?, cultura_id, ano, area_ha FROM areas_cultura WHERE versao_id=?",
        (novo, origem_id),
    )
    auditar(con, autor, novo, "copiar_versao", f"{tipo} a partir de {origem_id}")
    return novo


def aprovar(con: sqlite3.Connection, vid: int, autor: str) -> None:
    v = versao_editavel(con, vid)
    problemas = [a for a in calcular(con, vid)["avisos"]]
    if problemas:
        raise Invalido("Corrija antes de aprovar: " + "; ".join(problemas))
    con.execute("UPDATE versoes SET status='aprovado', aprovado_em=?, autor=? WHERE id=?", (_agora(), autor, vid))
    auditar(con, autor, vid, "aprovar", v["nome"])


# ---------------------------------------------------------------- cadastro
def _validar_fazenda(con: sqlite3.Connection, d: dict) -> Optional[int]:
    """Valida e devolve o produto de pagamento (None quando não se aplica)."""
    if not str(d.get("nome", "")).strip():
        raise Invalido("Informe o nome da fazenda")
    if d.get("tipo") not in ("propria", "arrendada"):
        raise Invalido("Tipo deve ser 'propria' ou 'arrendada'")
    if d.get("forma") not in ("reais", "produto"):
        raise Invalido("Forma de pagamento deve ser 'reais' ou 'produto'")
    if d["tipo"] != "arrendada" or d["forma"] != "produto":
        return None
    cid = d.get("cultura_id")
    if not cid:
        raise Invalido("Escolha o produto usada no pagamento (cadastre em Produtos, se ainda não existir)")
    if not con.execute("SELECT 1 FROM culturas WHERE id=?", (cid,)).fetchone():
        raise Invalido("Produto não encontrada no cadastro de Produtos")
    return cid


def criar_fazenda(con: sqlite3.Connection, vid: int, d: dict, autor: str) -> int:
    versao_editavel(con, vid)
    cid = _validar_fazenda(con, d)
    cur = con.execute(
        "INSERT INTO fazendas(versao_id, nome, tipo, arrendador, forma, cultura_id, observacao) VALUES(?,?,?,?,?,?,?)",
        (vid, d["nome"].strip(), d["tipo"], d.get("arrendador", "").strip(), d["forma"], cid, d.get("observacao", "")),
    )
    auditar(con, autor, vid, "criar_fazenda", d["nome"])
    return cur.lastrowid


def atualizar_fazenda(con: sqlite3.Connection, fid: int, d: dict, autor: str) -> None:
    vid = versao_da_fazenda(con, fid)
    versao_editavel(con, vid)
    cid = _validar_fazenda(con, d)
    con.execute(
        "UPDATE fazendas SET nome=?, tipo=?, arrendador=?, forma=?, cultura_id=?, observacao=? WHERE id=?",
        (d["nome"].strip(), d["tipo"], d.get("arrendador", "").strip(), d["forma"], cid, d.get("observacao", ""), fid),
    )
    auditar(con, autor, vid, "atualizar_fazenda", d["nome"])


def excluir_fazenda(con: sqlite3.Connection, fid: int, autor: str) -> None:
    vid = versao_da_fazenda(con, fid)
    versao_editavel(con, vid)
    con.execute("DELETE FROM fazendas WHERE id=?", (fid,))
    auditar(con, autor, vid, "excluir_fazenda", str(fid))


def salvar_ano(con: sqlite3.Connection, fid: int, ano: int, area_ha: float, valor: float, autor: str) -> None:
    vid = versao_da_fazenda(con, fid)
    v = versao_editavel(con, vid)
    anos = anos_da_versao(v)
    if ano not in anos:
        raise Invalido(f"Ano fora do horizonte ({anos[0]} a {anos[-1]})")
    if area_ha < 0 or valor < 0:
        raise Invalido("Área e valor não podem ser negativos")
    con.execute(
        "INSERT INTO fazenda_anos(fazenda_id, ano, area_ha, valor) VALUES(?,?,?,?) "
        "ON CONFLICT(fazenda_id, ano) DO UPDATE SET area_ha=excluded.area_ha, valor=excluded.valor",
        (fid, ano, area_ha, valor),
    )
    auditar(con, autor, vid, "salvar_ano", f"fazenda {fid} ano {ano}: {area_ha} ha, {valor}")


def salvar_parcelas(con: sqlite3.Connection, fid: int, parcelas: List[dict], autor: str) -> None:
    vid = versao_da_fazenda(con, fid)
    versao_editavel(con, vid)
    meses = [p["mes"] for p in parcelas]
    if len(set(meses)) != len(meses):
        raise Invalido("Há dois vencimentos no mesmo mês")
    for p in parcelas:
        if not 1 <= p["mes"] <= 12:
            raise Invalido("Mês deve estar entre 1 e 12")
        if p["percentual"] < 0:
            raise Invalido("Percentual não pode ser negativo")
    con.execute("DELETE FROM parcelas WHERE fazenda_id=?", (fid,))
    con.executemany(
        "INSERT INTO parcelas(fazenda_id, mes, percentual) VALUES(?,?,?)",
        [(fid, p["mes"], p["percentual"]) for p in parcelas],
    )
    auditar(con, autor, vid, "salvar_parcelas", f"fazenda {fid}: {len(parcelas)} parcelas")


def salvar_precos(con: sqlite3.Connection, vid: int, precos: List[dict], autor: str) -> None:
    v = versao_editavel(con, vid)
    for p in precos:
        if not con.execute("SELECT 1 FROM culturas WHERE id=?", (p["cultura_id"],)).fetchone():
            raise Invalido("Produto não encontrada no cadastro de Produtos")
        if p["ano"] not in anos_da_versao(v):
            raise Invalido("Ano fora do horizonte")
        if p["preco"] < 0:
            raise Invalido("Preço não pode ser negativo")
        con.execute(
            "INSERT INTO precos(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?) "
            "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET preco=excluded.preco",
            (vid, p["cultura_id"], p["ano"], p["preco"]),
        )
    auditar(con, autor, vid, "salvar_precos", f"{len(precos)} valores")


def alterar_horizonte(con: sqlite3.Connection, vid: int, horizonte: int, autor: str) -> None:
    v = versao_editavel(con, vid)
    _validar_horizonte(horizonte)
    con.execute("UPDATE versoes SET horizonte=? WHERE id=?", (horizonte, vid))
    auditar(con, autor, vid, "alterar_horizonte", f"{v['horizonte']} -> {horizonte}")


def alterar_periodo(con: sqlite3.Connection, vid: int, nome: str, ano_inicial: int, ano_final: int, autor: str) -> None:
    """Muda nome e período (anos inicial e final) de um orçamento em elaboração. Os dados são guardados por ano:
    os de anos que saem do período ficam guardados (escondidos) e voltam se o ano for incluído de novo."""
    v = versao_editavel(con, vid)
    nome = (nome or "").strip()
    if not nome:
        raise Invalido("Informe o nome do orçamento")
    if ano_final < ano_inicial:
        raise Invalido("O ano final deve ser igual ou depois do ano inicial")
    horizonte = ano_final - ano_inicial + 1
    _validar_horizonte(horizonte)
    con.execute("UPDATE versoes SET nome=?, ano_base=?, horizonte=?, data_inicio=NULL, data_fim=NULL WHERE id=?",
                (nome, ano_inicial, horizonte, vid))
    auditar(con, autor, vid, "alterar_periodo", f"{v['ano_base']}+{v['horizonte']} -> {ano_inicial}+{horizonte}")


def replicar_fazenda(con: sqlite3.Connection, fid: int, ano_origem: int, campos: List[str], autor: str) -> int:
    """Copia área e/ou valor do ano de origem para todos os anos seguintes do horizonte."""
    vid = versao_da_fazenda(con, fid)
    v = versao_editavel(con, vid)
    anos = anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    if not campos or any(c not in ("area_ha", "valor") for c in campos):
        raise Invalido("Escolha área e/ou valor para replicar")
    o = con.execute("SELECT area_ha, valor FROM fazenda_anos WHERE fazenda_id=? AND ano=?", (fid, ano_origem)).fetchone()
    origem = {"area_ha": o["area_ha"] if o else 0.0, "valor": o["valor"] if o else 0.0}
    destinos = [a for a in anos if a > ano_origem]
    for a in destinos:
        atual = con.execute("SELECT area_ha, valor FROM fazenda_anos WHERE fazenda_id=? AND ano=?", (fid, a)).fetchone()
        novo = {"area_ha": atual["area_ha"] if atual else 0.0, "valor": atual["valor"] if atual else 0.0}
        for c in campos:
            novo[c] = origem[c]
        con.execute(
            "INSERT INTO fazenda_anos(fazenda_id, ano, area_ha, valor) VALUES(?,?,?,?) "
            "ON CONFLICT(fazenda_id, ano) DO UPDATE SET area_ha=excluded.area_ha, valor=excluded.valor",
            (fid, a, novo["area_ha"], novo["valor"]),
        )
    auditar(con, autor, vid, "replicar_fazenda", f"fazenda {fid}: {'+'.join(campos)} de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


def replicar_preco(con: sqlite3.Connection, vid: int, cultura_id: int, ano_origem: int, autor: str) -> int:
    v = versao_editavel(con, vid)
    anos = anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte")
    c = con.execute("SELECT nome FROM culturas WHERE id=?", (cultura_id,)).fetchone()
    if not c:
        raise Invalido("Produto não encontrada no cadastro de Produtos")
    o = con.execute("SELECT preco FROM precos WHERE versao_id=? AND cultura_id=? AND ano=?",
                    (vid, cultura_id, ano_origem)).fetchone()
    if not o:
        raise Invalido(f"Não há preço de {c['nome']} em {ano_origem} para replicar")
    destinos = [a for a in anos if a > ano_origem]
    for a in destinos:
        con.execute(
            "INSERT INTO precos(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?) "
            "ON CONFLICT(versao_id, cultura_id, ano) DO UPDATE SET preco=excluded.preco",
            (vid, cultura_id, a, o["preco"]),
        )
    auditar(con, autor, vid, "replicar_preco", f"{c['nome']}: {o['preco']} de {ano_origem} para {len(destinos)} ano(s)")
    return len(destinos)


# ---------------------------------------------------------------- gerador de parcelas
def gerar_parcelas(n: int, periodicidade: str, mes_inicio: int) -> List[dict]:
    """Parcelas iguais. A última absorve o arredondamento para fechar 100%."""
    if periodicidade not in PERIODICIDADE:
        raise Invalido("Periodicidade inválida")
    if n < 1:
        raise Invalido("Número de parcelas deve ser pelo menos 1")
    if not 1 <= mes_inicio <= 12:
        raise Invalido("Mês inicial deve estar entre 1 e 12")
    passo = PERIODICIDADE[periodicidade]
    meses = [mes_inicio + i * passo for i in range(n)]
    if meses[-1] > 12:
        raise Invalido(
            f"{n} parcelas ({periodicidade}) a partir do mês {mes_inicio} passam de dezembro "
            f"(a última cairia no mês {meses[-1]} do ano)"
        )
    base = round(100.0 / n, 4)
    pcts = [base] * n
    pcts[-1] = round(100.0 - base * (n - 1), 4)
    return [{"mes": m, "percentual": p} for m, p in zip(meses, pcts)]


# ---------------------------------------------------------------- leitura e cálculo
def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(obter_versao(con, vid))
    anos = anos_da_versao(v)
    fazendas = []
    for f in con.execute("SELECT * FROM fazendas WHERE versao_id=? ORDER BY tipo DESC, nome", (vid,)).fetchall():
        d = dict(f)
        d["anos"] = {
            r["ano"]: {"area_ha": r["area_ha"], "valor": r["valor"]}
            for r in con.execute("SELECT * FROM fazenda_anos WHERE fazenda_id=?", (f["id"],))
        }
        d["parcelas"] = [
            {"mes": r["mes"], "percentual": r["percentual"]}
            for r in con.execute("SELECT * FROM parcelas WHERE fazenda_id=? ORDER BY mes", (f["id"],))
        ]
        fazendas.append(d)
    precos: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT * FROM precos WHERE versao_id=? ORDER BY cultura_id, ano", (vid,)):
        precos.setdefault(r["cultura_id"], {})[r["ano"]] = r["preco"]
    culturas = []
    for c in con.execute("SELECT * FROM culturas ORDER BY grupo, nome COLLATE NOCASE"):
        if not c["ativa"] and c["id"] not in precos:
            continue
        culturas.append({
            "id": c["id"], "nome": c["nome"], "grupo": c["grupo"], "ativa": bool(c["ativa"]),
            "unidade": c["unidade"], "embalagem": c["embalagem"], "qtd_por_embalagem": c["qtd_por_embalagem"],
            "rotulo": c["embalagem"] or c["unidade"],      # em que se mede a quantidade e o preço
        })
    nomes = {c["id"]: c["nome"] for c in culturas}
    for f in fazendas:
        f["cultura_nome"] = nomes.get(f["cultura_id"], "")
    return {"versao": v, "anos": anos, "fazendas": fazendas, "precos": precos, "culturas": culturas}


def calcular(con: sqlite3.Connection, vid: int) -> dict:
    dados = ler(con, vid)
    anos = dados["anos"]
    precos = dados["precos"]
    nomes = {c["id"]: c["nome"] for c in con.execute("SELECT id, nome FROM culturas")}
    avisos: List[str] = []
    por_fazenda = []
    resumo = {
        a: {"area_propria": 0.0, "area_arrendada": 0.0, "area_total": 0.0, "custo": 0.0,
            "sacas": {}, "mensal": [0.0] * 12}
        for a in anos
    }
    for f in dados["fazendas"]:
        linha = {"id": f["id"], "nome": f["nome"], "tipo": f["tipo"], "anos": {}}
        soma_parcelas = round(sum(p["percentual"] for p in f["parcelas"]), 4)
        if f["tipo"] == "arrendada" and f["parcelas"] and abs(soma_parcelas - 100) > 0.01:
            avisos.append(f"{f['nome']}: as parcelas somam {soma_parcelas:g}% (deveriam somar 100%)")
        tem_custo = False
        for a in anos:
            reg = f["anos"].get(a, {"area_ha": 0.0, "valor": 0.0})
            area = reg["area_ha"]
            custo = sacas = 0.0
            if f["tipo"] == "arrendada":
                if f["forma"] == "reais":
                    custo = area * reg["valor"]
                else:
                    sacas = area * reg["valor"]
                    cultura = nomes.get(f["cultura_id"], "")
                    preco = precos.get(f["cultura_id"], {}).get(a)
                    if sacas and not cultura:
                        avisos.append(f"{f['nome']}: escolha o produto usada no pagamento")
                    elif sacas and not preco:
                        avisos.append(f"{f['nome']} {a}: falta o valor padrão de {cultura} em {a}")
                    custo = sacas * (preco or 0.0)
            mensal = [0.0] * 12
            if custo:
                tem_custo = True
                for p in f["parcelas"]:
                    mensal[p["mes"] - 1] += custo * p["percentual"] / 100.0
            linha["anos"][a] = {"area_ha": area, "custo": custo, "sacas": sacas, "mensal": mensal}
            r = resumo[a]
            r["area_propria" if f["tipo"] == "propria" else "area_arrendada"] += area
            r["area_total"] += area
            r["custo"] += custo
            if sacas:
                nome_cult = nomes.get(f["cultura_id"], "(sem cultura)")
                r["sacas"][nome_cult] = r["sacas"].get(nome_cult, 0.0) + sacas
            for i in range(12):
                r["mensal"][i] += mensal[i]
        if f["tipo"] == "arrendada" and tem_custo and not f["parcelas"]:
            avisos.append(f"{f['nome']}: sem parcelas cadastradas — o pagamento não entra no fluxo mensal")
        por_fazenda.append(linha)
    return {"versao": dados["versao"], "anos": anos, "resumo": resumo, "fazendas": por_fazenda,
            "avisos": sorted(set(avisos))}


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    """b em relação a a (normalmente a = Orçado, b = Reprojetado)."""
    ca, cb = calcular(con, a_id), calcular(con, b_id)
    anos = sorted(set(ca["anos"]) & set(cb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")

    def delta(x: float, y: float) -> dict:
        return {"a": x, "b": y, "delta": y - x, "pct": ((y - x) / x * 100.0) if x else None}

    out = {"a": ca["versao"], "b": cb["versao"], "anos": anos, "resumo": {}, "fazendas": {}}
    for ano in anos:
        ra, rb = ca["resumo"][ano], cb["resumo"][ano]
        produtos = sorted(set(ra["sacas"]) | set(rb["sacas"]))
        out["resumo"][ano] = {
            "area_total": delta(ra["area_total"], rb["area_total"]),
            "custo": delta(ra["custo"], rb["custo"]),
            "sacas": {p: delta(ra["sacas"].get(p, 0.0), rb["sacas"].get(p, 0.0)) for p in produtos},
            "mensal": [delta(ra["mensal"][i], rb["mensal"][i]) for i in range(12)],
        }
    nomes = {f["nome"]: {} for f in ca["fazendas"]}
    nomes.update({f["nome"]: {} for f in cb["fazendas"]})
    ia = {f["nome"]: f for f in ca["fazendas"]}
    ib = {f["nome"]: f for f in cb["fazendas"]}
    for nome in sorted(nomes):
        out["fazendas"][nome] = {
            ano: {
                "area_ha": delta(ia.get(nome, {"anos": {}})["anos"].get(ano, {"area_ha": 0.0})["area_ha"],
                                 ib.get(nome, {"anos": {}})["anos"].get(ano, {"area_ha": 0.0})["area_ha"]),
                "custo": delta(ia.get(nome, {"anos": {}})["anos"].get(ano, {"custo": 0.0})["custo"],
                               ib.get(nome, {"anos": {}})["anos"].get(ano, {"custo": 0.0})["custo"]),
            }
            for ano in anos
        }
    return out
