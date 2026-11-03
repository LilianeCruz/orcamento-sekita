import datetime as dt
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app import db
from app.main import app
from app.servicos import dre as svc_dre

COLS = ["code", "name", "parent", "kind", "order", "active", "target", "note", "source"]

# mini-estrutura nos códigos da DRE sintética da Sekita
SINT = [
    ("DS007", "(+) Receita Operacional Bruta", "", "group"), ("DS009", "Alho", "DS007", "account"), ("DS011", "Cenoura", "DS007", "account"),
    ("DS015", "(-) Deduções da Receita", "", "group"), ("DS016", "(-) Deduções Agro", "DS015", "account"),
    ("DS018", "(=) Receita Líquida", "", "group"),
    ("DS020", "(-) Custo do Produto Vendido", "", "group"), ("DS021", "CPV Alho", "DS020", "account"),
    ("DS027", "(=) Resultado Bruto", "", "group"), ("DS028", "% Margem de Contribuição", "", "group"),
    ("DS030", "(-) Outras Despesas Operacionais", "", "group"), ("DS031", "Arrendamento", "DS030", "group"),
    ("DS032", "Despesas Arrendamentos", "DS031", "account"), ("DS035", "Outras Receitas Arrendamento", "DS031", "account"),
    ("DS038", "Despesas administrativas", "DS030", "account"),
    ("DS044", "(=) Ebitda", "", "group"), ("DS045", "Margem Ebitda (%)", "", "group"),
    ("DS047", "(-) Depreciação", "", "account"), ("DS048", "(=) Ebit", "", "group"), ("DS049", "Margem Ebit (%)", "", "group"),
    ("DS051", "(-) Resultado Financeiro", "", "group"), ("DS052", "Receitas financeiras", "DS051", "account"), ("DS053", "Despesas financeiras", "DS051", "account"),
    ("DS054", "(+) Outras Receitas não Operacionais", "", "group"), ("DS055", "Resultado de revenda", "DS054", "account"),
    ("DS058", "(=) Ebt", "", "group"), ("DS060", "(-) CSLL e IRPJ", "", "account"),
    ("DS062", "(=) Lucro Líquido", "", "group"), ("DS063", "% Margem Líquida", "", "group"),
]
ANAL = [("DA007", "Alho", "DA006", "account", "DS009"), ("DA031", "CPV Alho", "DA030", "account", "DS021")]


def xlsx(sint=SINT, anal=ANAL, abas=("DRE Sintética", "DRE Analítica"), cab=COLS, inativas=()):
    wb = Workbook()
    wb.remove(wb.active)
    ws = wb.create_sheet(abas[0])
    ws.append(cab)
    for i, (c, n, p, k) in enumerate(sint, 1):
        ws.append([c, n, p, k, i * 10, c not in inativas, "", "", ""])
    ws2 = wb.create_sheet(abas[1])
    ws2.append(cab)
    for i, (c, n, p, k, t) in enumerate(anal, 1):
        ws2.append([c, n, p, k, i * 10, True, t, "", ""])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _versao(api, h=3):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": h}).json()["id"]


def _importar(api, **kw):
    r = api.post("/api/dre/importar", params={"arquivo": "fech.xlsx"}, content=xlsx(**kw), headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200, r.text
    return r.json()


def _lanc(api, vid, codigo, ano, v):
    r = api.put(f"/api/versoes/{vid}/dre/{codigo}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _dre(api, vid):
    return api.get(f"/api/versoes/{vid}/dre").json()


def _val(d, codigo, ano):
    return next(l for l in d["linhas"] if l["codigo"] == codigo)["valores"][str(ano)]


# ---------------------------------------------------------------- estrutura
def test_sem_estrutura_a_tela_pede_a_importacao(api):
    d = _dre(api, _versao(api))
    assert d["importacao"] is None and d["linhas"] == []


def test_importa_e_mantem_a_hierarquia_e_a_ordem(api):
    assert _importar(api) == {"sinteticas": len(SINT), "analiticas": len(ANAL), "balanco": 0}
    d = _dre(api, _versao(api))
    assert d["importacao"]["arquivo"] == "fech.xlsx" and d["importacao"]["qtd_sinteticas"] == len(SINT)
    nomes = [(l["nivel"], l["nome"]) for l in d["linhas"]][:6]
    assert nomes == [(0, "(+) Receita Operacional Bruta"), (1, "Alho"), (1, "Cenoura"), (0, "(-) Deduções da Receita"), (1, "(-) Deduções Agro"), (0, "(=) Receita Líquida")]
    arvore = {l["codigo"]: l for l in d["linhas"]}
    assert arvore["DS031"]["nivel"] == 1 and arvore["DS032"]["nivel"] == 2


def test_tipos_de_linha(api):
    _importar(api)
    t = {l["codigo"]: l["calculo"] for l in _dre(api, _versao(api))["linhas"]}
    assert t["DS009"] == "entrada" and t["DS047"] == "entrada" and t["DS060"] == "entrada"
    assert t["DS007"] == "soma" and t["DS031"] == "soma" and t["DS051"] == "soma"
    assert t["DS018"] == "calculada" and t["DS044"] == "calculada" and t["DS062"] == "calculada"
    assert t["DS028"] == "pct" and t["DS063"] == "pct"


def test_linhas_inativas_nao_aparecem(api):
    _importar(api, inativas=("DS011",))
    assert all(l["codigo"] != "DS011" for l in _dre(api, _versao(api))["linhas"])


def test_arquivo_invalido(api):
    h = {"Content-Type": "application/octet-stream"}
    assert api.post("/api/dre/importar", content=b"nao e xlsx", headers=h).status_code == 422
    assert api.post("/api/dre/importar", content=b"").status_code == 422
    r = api.post("/api/dre/importar", content=xlsx(abas=("Outra", "DRE Analítica")), headers=h)
    assert r.status_code == 422 and "DRE Sintética" in r.json()["erro"]
    r = api.post("/api/dre/importar", content=xlsx(cab=["code", "name"]), headers=h)
    assert r.status_code == 422 and "Faltam colunas" in r.json()["erro"]
    r = api.post("/api/dre/importar", content=xlsx(sint=[("DS007", "Raiz", "", "group"), ("DS009", "Filha órfã", "XX", "account")]), headers=h)
    assert r.status_code == 422 and "não existe" in r.json()["erro"]
    r = api.post("/api/dre/importar", content=xlsx(sint=[("DS007", "A", "", "group"), ("DS007", "B", "", "group")]), headers=h)
    assert r.status_code == 422 and "repetidos" in r.json()["erro"]
    assert _dre(api, _versao(api))["importacao"] is None


def test_importar_padrao_sem_o_arquivo(api, tmp_path, monkeypatch):
    monkeypatch.setattr(svc_dre, "ARQUIVO_PADRAO", tmp_path / "nao-existe.xlsx")
    r = api.post("/api/dre/importar-padrao")
    assert r.status_code == 422 and "Escolher arquivo" in r.json()["erro"]
    assert api.get("/api/dre/arquivo-padrao").json()["existe"] is False
    arq = tmp_path / "fechamento-contabil.xlsx"
    arq.write_bytes(xlsx())
    monkeypatch.setattr(svc_dre, "ARQUIVO_PADRAO", arq)
    assert api.get("/api/dre/arquivo-padrao").json()["existe"] is True
    assert api.post("/api/dre/importar-padrao").status_code == 200


def test_a_dre_nao_aceita_digitacao(api):
    vid = _versao(api)
    _importar(api)
    assert api.put(f"/api/versoes/{vid}/dre/DS009/2027", json={"valor": 5}).status_code in (404, 405)
    assert api.post(f"/api/versoes/{vid}/dre/DS009/replicar", json={"ano": 2027}).status_code in (404, 405)
    assert api.post(f"/api/versoes/{vid}/dre/replicar-todas", json={"ano": 2027}).status_code in (404, 405)
    assert all("ajuste" not in l for l in _dre(api, vid)["linhas"])


# ---------------------------------------------------------------- cálculo (R$ mil, com sinal): totais, subtotais e margens
def _calc(entradas):
    """Roda o cálculo da DRE sobre valores de entrada dados (a estrutura já importada)."""
    con = db.conectar()
    try:
        return svc_dre._calcular(svc_dre._estrutura(con), {c: {2027: v} for c, v in entradas.items()}, [2027, 2028])
    finally:
        con.close()


ENTRADAS = {"DS009": 1000, "DS011": 500, "DS016": -75, "DS021": -600, "DS032": -120, "DS035": 20, "DS038": -80,
            "DS047": -50, "DS052": 10, "DS053": -90, "DS055": 30, "DS060": -40}


def test_grupos_somam_as_filhas(api):
    _importar(api)
    c = _calc(ENTRADAS)
    assert c["DS007"][2027] == 1500                              # receita bruta
    assert c["DS015"][2027] == -75
    assert c["DS031"][2027] == -100                              # arrendamento: despesa -120 + receita 20
    assert c["DS030"][2027] == -180                              # arrendamento -100 + administrativas -80
    assert c["DS051"][2027] == -80                               # resultado financeiro 10 - 90
    assert c["DS054"][2027] == 30


def test_linhas_calculadas_e_margens(api):
    _importar(api)
    c = _calc(ENTRADAS)
    assert c["DS018"][2027] == 1425                              # receita líquida = 1.500 - 75
    assert c["DS027"][2027] == 825                               # resultado bruto = 1.425 - 600
    assert c["DS028"][2027] == pytest.approx(825 / 1425 * 100)
    assert c["DS044"][2027] == 645                               # ebitda = 825 - 180
    assert c["DS045"][2027] == pytest.approx(645 / 1425 * 100)
    assert c["DS048"][2027] == 595                               # ebit = 645 - 50
    assert c["DS049"][2027] == pytest.approx(595 / 1425 * 100)
    assert c["DS058"][2027] == 545                               # ebt = 595 - 80 + 30
    assert c["DS062"][2027] == 505                               # lucro líquido = 545 - 40
    assert c["DS063"][2027] == pytest.approx(505 / 1425 * 100)


def test_ano_sem_receita_nao_divide_por_zero_e_unidades(api):
    vid = _versao(api)
    _importar(api)
    c = _calc(ENTRADAS)
    assert c["DS062"][2028] == 0 and c["DS063"][2028] == 0
    un = {l["codigo"]: l["unidade"] for l in _dre(api, vid)["linhas"]}
    assert un["DS018"] == "R$ mil" and un["DS028"] == "%"


# ---------------------------------------------------------------- ligação com os módulos do orçamento
import test_resultado as tr                      # noqa: E402  (cenários da Cenoura)
from test_dividas import linha as linha_divida, xlsx as xlsx_divida   # noqa: E402

SINT_LIGADA = [l for l in SINT if l[0] not in ("DS009", "DS011", "DS021")] + [
    ("DS008", "Receitas da Atividade Agropecuária", "DS007", "group"),
    ("DS009", "Alho", "DS008", "account"), ("DS011", "Cenoura", "DS008", "account"),
    ("DS021", "Alho", "DS020", "account"), ("DS023", "Cenoura", "DS020", "account"),
    ("DS013", "Pecuária", "DS008", "account"), ("DS025", "Pecuária", "DS020", "account"),
]
SINT_LIGADA = [(c, n, ("DS007" if c == "DS008" else p), k) for c, n, p, k in SINT_LIGADA]
SINT_LIGADA.insert(SINT_LIGADA.index(next(l for l in SINT_LIGADA if l[0] == "DS055")) + 1,
                   ("DS057", "Resultados de outras atividades operacionais", "DS054", "account"))


def _ligado(api):
    """Cenoura 10 ha x 1.000 kg x R$ 2, dedução 5 %, custo direto R$ 500/ha; arrendamento R$ 80 mil; juros R$ 50 mil (MESO)."""
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 2}).json()["id"]
    cid = tr._cultura(api, vid)
    tr._area(api, vid, cid, {2027: 10, 2028: 10}); tr._prod(api, vid, cid, {2027: 1000, 2028: 1000})
    tr._preco(api, vid, cid, {2027: 2, 2028: 2})
    tr._premissa(api, vid, cid, "deducao_receita", {2027: 5, 2028: 5})
    tr._custo(api, vid, cid, "Insumos", "direto", {2027: 500, 2028: 500})
    fid = api.post(f"/api/versoes/{vid}/fazendas", json={"nome": "Faz A", "tipo": "arrendada", "arrendador": "J", "forma": "reais"}).json()["id"]
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 100, "valor": 800})
    _importar(api, sint=SINT_LIGADA)
    r = api.post("/api/dividas/importar", params={"arquivo": "d.xlsx", "versao_id": vid},
                 content=xlsx_divida([linha_divida(venc=dt.datetime(2027, 6, 1), principal=1000.0, juros=50000.0)]),
                 headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200, r.text
    return vid, cid


def test_receita_deducao_e_cpv_vem_do_resultado_por_cultura(api):
    vid, _ = _ligado(api)
    d = _dre(api, vid)
    assert _val(d, "DS011", 2027) == pytest.approx(20.0)                 # 10.000 kg x R$ 2 = R$ 20 mil
    assert _val(d, "DS016", 2027) == pytest.approx(-1.0)                 # 5 % de dedução
    assert _val(d, "DS023", 2027) == pytest.approx(-5.0)                 # custo direto R$ 500/ha x 10 ha
    assert _val(d, "DS009", 2027) == 0                                   # Alho: sem cultura no orçamento
    assert next(l for l in d["linhas"] if l["codigo"] == "DS011")["origem"].startswith("Resultado por produto")


def test_arrendamento_e_juros_entram_com_sinal_negativo(api):
    d = _dre(api, _ligado(api)[0])
    assert _val(d, "DS032", 2027) == pytest.approx(-80.0)                # 100 ha x R$ 800
    assert _val(d, "DS053", 2027) == pytest.approx(-50.0)                # juros que vencem em 2027
    assert _val(d, "DS032", 2028) == 0 and _val(d, "DS053", 2028) == 0


def test_subtotais_usam_os_valores_ligados(api):
    d = _dre(api, _ligado(api)[0])
    assert _val(d, "DS007", 2027) == pytest.approx(20.0)
    assert _val(d, "DS018", 2027) == pytest.approx(19.0)                 # 20 - 1
    assert _val(d, "DS027", 2027) == pytest.approx(14.0)                 # 19 - 5
    assert _val(d, "DS044", 2027) == pytest.approx(14.0 - 80.0)          # ebitda: menos o arrendamento
    assert _val(d, "DS051", 2027) == pytest.approx(-50.0)


def test_linhas_sem_origem_ficam_zeradas(api):
    d = _dre(api, _ligado(api)[0])
    ln = next(l for l in d["linhas"] if l["codigo"] == "DS038")
    assert ln["origem"] is None and ln["valores"]["2027"] == 0


def _milho(api, vid, tipo=None):
    milho = tr._cultura(api, vid, "Milho", "Grãos")
    tr._area(api, vid, milho, {2027: 5}); tr._prod(api, vid, milho, {2027: 100}); tr._preco(api, vid, milho, {2027: 1})
    if tipo:
        api.put(f"/api/culturas/{milho}", json={"nome": "Milho", "grupo": "Grãos", "receita_tipo": tipo})
    return milho


def test_produto_novo_de_receita_operacional_ganha_linha_de_receita_e_de_cpv(api):
    vid, _ = _ligado(api)
    milho = _milho(api, vid)                                              # receita operacional (padrão): 5 ha x 100 kg x R$ 1 = R$ 0,5 mil
    d = _dre(api, vid)
    rec = next(l for l in d["linhas"] if l["codigo"] == f"PR{milho}")
    cpv = next(l for l in d["linhas"] if l["codigo"] == f"PC{milho}")
    assert rec["nome"] == "Milho" and rec["pai"] == "DS008" and cpv["pai"] == "DS020"
    assert rec["valores"]["2027"] == pytest.approx(0.5) and rec["origem"].startswith("Resultado por produto")
    assert _val(d, "DS007", 2027) == pytest.approx(20.5)                  # entra na receita operacional bruta
    assert not any("Milho" in a for a in d["avisos"])


def test_produtos_da_pecuaria_entram_nos_subgrupos_pecuaria_da_dre(api):
    vid, _ = _ligado(api)
    gado = tr._produto(api, "Gado de corte", "Pecuária", unidade="uni")
    api.post(f"/api/versoes/{vid}/produtividade/culturas", json={"cultura_id": gado})
    tr._prod(api, vid, gado, {2027: 100}); tr._preco(api, vid, gado, {2027: 10})              # 100 un x R$ 10 = R$ 1 mil
    d = _dre(api, vid)
    rec = next(l for l in d["linhas"] if l["codigo"] == f"PR{gado}")
    cpv = next(l for l in d["linhas"] if l["codigo"] == f"PC{gado}")
    assert rec["pai"] == "DS013" and cpv["pai"] == "DS025"                  # subgrupos Pecuária, como no Fechamento Contábil
    pec = next(l for l in d["linhas"] if l["codigo"] == "DS013")
    assert pec["calculo"] == "soma" and pec["valores"]["2027"] == pytest.approx(1.0)
    assert _val(d, "DS007", 2027) == pytest.approx(21.0)                    # entra na receita operacional bruta


def test_produto_de_receita_nao_operacional_vai_para_outras_atividades(api):
    vid, _ = _ligado(api)
    milho = _milho(api, vid, "nao_operacional")
    d = _dre(api, vid)
    assert not any(l["codigo"] in (f"PR{milho}", f"PC{milho}") for l in d["linhas"])      # sem linha própria
    assert _val(d, "DS007", 2027) == pytest.approx(20.0)                  # fora da receita operacional
    assert _val(d, "DS057", 2027) == pytest.approx(0.5)                   # Resultados de outras atividades operacionais
    assert next(l for l in d["linhas"] if l["codigo"] == "DS057")["origem"] == "Resultado por produto · receita não operacional"
    assert _val(d, "DS054", 2027) == pytest.approx(0.5)                   # e soma em Outras Receitas não Operacionais


def test_tipo_de_receita_e_validado_e_volta_no_cadastro(api):
    r = api.post("/api/culturas", json={"nome": "Feno", "grupo": "Outros", "receita_tipo": "talvez"})
    assert r.status_code == 422 and "operacional" in r.json()["erro"]
    cid = api.post("/api/culturas", json={"nome": "Feno", "grupo": "Outros"}).json()["id"]
    assert next(c for c in api.get("/api/culturas").json()["culturas"] if c["id"] == cid)["receita_tipo"] == "operacional"
    api.put(f"/api/culturas/{cid}", json={"nome": "Feno", "grupo": "Outros", "receita_tipo": "nao_operacional"})
    assert next(c for c in api.get("/api/culturas").json()["culturas"] if c["id"] == cid)["receita_tipo"] == "nao_operacional"


def test_o_que_muda_nos_modulos_muda_na_dre(api):
    vid, cid = _ligado(api)
    tr._preco(api, vid, cid, {2027: 3})                                   # preço sobe de 2 para 3
    d = _dre(api, vid)
    assert _val(d, "DS011", 2027) == pytest.approx(30.0) and _val(d, "DS016", 2027) == pytest.approx(-1.5)


def test_reprojetado_e_comparacao(api):
    vid, cid = _ligado(api)
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    tr._preco(api, rep, cid, {2027: 3})                                   # só o Reprojetado muda
    assert _val(_dre(api, vid), "DS011", 2027) == pytest.approx(20.0)     # orçado intacto
    c = api.get(f"/api/comparar-dre?a={vid}&b={rep}").json()
    ln = {l["codigo"]: l for l in c["linhas"]}
    assert ln["DS011"]["anos"]["2027"]["a"] == pytest.approx(20.0) and ln["DS011"]["anos"]["2027"]["b"] == pytest.approx(30.0)
    assert ln["DS011"]["anos"]["2027"]["delta"] == pytest.approx(10.0) and ln["DS028"]["unidade"] == "%"


def test_sem_modulos_preenchidos_a_dre_continua_zerada(api):
    vid = _versao(api)
    _importar(api, sint=SINT_LIGADA)
    d = _dre(api, vid)
    assert _val(d, "DS062", 2027) == 0 and d["avisos"] == []


def test_estrutura_e_unica_para_todas_as_versoes(api):
    v1, v2 = _versao(api), api.post("/api/versoes", json={"ano_base": 2030, "horizonte": 2}).json()["id"]
    _importar(api)
    assert len(_dre(api, v1)["linhas"]) == len(_dre(api, v2)["linhas"]) == len(SINT)


def test_banco_antigo_ganha_as_tabelas_da_dre(tmp_path, monkeypatch):
    import sqlite3
    caminho = tmp_path / "antigo.db"
    con = sqlite3.connect(caminho)
    con.execute("CREATE TABLE versoes(id INTEGER PRIMARY KEY AUTOINCREMENT, ano_base INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL, "
                "status TEXT NOT NULL DEFAULT 'rascunho', horizonte INTEGER NOT NULL DEFAULT 5, origem_id INTEGER, criado_em TEXT NOT NULL, "
                "aprovado_em TEXT, autor TEXT NOT NULL DEFAULT 'local')")
    con.execute("INSERT INTO versoes(ano_base, tipo, nome, criado_em) VALUES(2027,'orcado','Antigo','x')")
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        assert c.get("/api/versoes/1/dre").json()["linhas"] == []


def test_cada_linha_explica_como_e_calculada(api):
    vid, _ = _ligado(api)
    ln = {l["codigo"]: l for l in _dre(api, vid)["linhas"]}
    assert "Receita bruta anual do produto" in ln["DS011"]["explicacao"]
    assert "custo do estoque do ano anterior" in ln["DS023"]["explicacao"]
    assert "Arrendamentos" in ln["DS032"]["explicacao"] and "Endividamento" in ln["DS053"]["explicacao"]
    assert ln["DS038"]["explicacao"].startswith("Ainda não há módulo")
    assert ln["DS007"]["explicacao"].startswith("Soma das linhas abaixo:") and "Receitas da Atividade Agropecuária" in ln["DS007"]["explicacao"]
    assert ln["DS018"]["explicacao"].startswith("Soma de: (+) Receita Operacional Bruta")
    assert ln["DS028"]["explicacao"] == "(=) Resultado Bruto ÷ (=) Receita Líquida × 100."
