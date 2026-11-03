import datetime as dt
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app import db
from app.main import app
from app.servicos import dividas as svc_div

CAB = ["Situação", "Nº Ordem", "Empresa", "Tipo", "Banco", "Tipo do Recurso", "Linha de Crédito", "Conta de Provisão",
       "Número do Documento", "Proponente", "Avalista I", "Avalista II", "Juros", "Data Operação", "Data Crédito",
       "Data Contabilização", "Data Vencimento", "Vr. Provisionado", "Vr. Pago", "Vr. Bruto Aberto", "Vr. Juros",
       "Vr. Outras Despesas", "Vr. Desp. Financeiras", "Vr. Principal", "PRODUTO", "Tipo Bem", "Observação",
       "Dia Emissão", "Mês Emissão", "Ano Emissão", "Dia Vencimento", "Mês Vencimento", "Ano Vencimento"]


def linha(situacao="AB", empresa="MESO", tipo="Custeio", banco="Banco do Brasil", doc="123/1", taxa=0.12,
          venc=dt.datetime(2027, 3, 10), principal=1000.0, juros=100.0, outras=None, dia=None,
          op=dt.datetime(2026, 1, 5), linha_credito="Linha X"):
    r = {k: None for k in CAB}
    r.update({"Situação": situacao, "Empresa": empresa, "Tipo": tipo, "Banco": banco, "Número do Documento": doc,
              "Juros": taxa, "Data Operação": op, "Data Vencimento": venc, "Vr. Principal": principal,
              "Vr. Juros": juros, "Vr. Outras Despesas": outras, "Vr. Bruto Aberto": principal + juros + (outras or 0),
              "Linha de Crédito": linha_credito, "PRODUTO": "Custeio Agrícola"})
    if dia:
        r.update({"Dia Vencimento": dia[0], "Mês Vencimento": dia[1], "Ano Vencimento": dia[2]})
    return [r[k] for k in CAB]


def xlsx(linhas, cab=CAB, aba="Dados"):
    wb = Workbook()
    ws = wb.active
    ws.title = aba
    ws.append(cab)
    for r in linhas:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _versao(api, h=5):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": h}).json()["id"]


def _importar(api, linhas, vid=None, nome="teste.xlsx", **kw):
    params = {"arquivo": nome}
    if vid:
        params["versao_id"] = vid
    return api.post("/api/dividas/importar", params=params, content=xlsx(linhas, **kw),
                    headers={"Content-Type": "application/octet-stream"})


def _resumo(api, vid, empresas="agro"):
    return api.get(f"/api/versoes/{vid}/dividas", params={"empresas": empresas}).json()


# ---------------------------------------------------------------- importação
def test_importa_e_vincula_a_versao(api):
    vid = _versao(api)
    r = _importar(api, [linha(), linha("PG"), linha(empresa="ST")], vid)
    assert r.status_code == 200, r.text
    assert r.json()["titulos"] == 3 and r.json()["abertos"] == 2
    d = _resumo(api, vid, "todas")
    assert d["importacao"]["arquivo"] == "teste.xlsx" and d["total"]["titulos"] == 2     # só os abertos entram nos totais


def test_versao_sem_base_volta_vazia(api):
    vid = _versao(api)
    d = _resumo(api, vid)
    assert d["importacao"] is None and d["total"] is None and d["por_ano"] == {}


def test_grupo_pelo_tipo_do_titulo(api):
    vid = _versao(api)
    _importar(api, [linha(tipo="Custeio", principal=100), linha(tipo="Capital de Giro", principal=10),
                    linha(tipo="EGF", principal=1), linha(tipo="Investimento", principal=1000)], vid)
    a = _resumo(api, vid)["por_ano"]["2027"]
    assert a["capital_giro"]["principal"] == 111 and a["investimento"]["principal"] == 1000 and a["indefinido"]["principal"] == 0


def test_tipo_desconhecido_vira_indefinido_e_avisa(api):
    vid = _versao(api)
    r = _importar(api, [linha(tipo="Leasing")], vid).json()
    assert any("tipo desconhecido" in a for a in r["avisos"])
    assert _resumo(api, vid)["por_ano"]["2027"]["indefinido"]["principal"] == 1000


def test_vencimento_em_texto_e_pelas_colunas_de_dia_mes_ano(api):
    vid = _versao(api)
    r = _importar(api, [linha(venc="13/11/2026"), linha(venc=None, dia=(5, 7, 2028)), linha(venc="lixo", dia=(1, 2, 2029))], vid).json()
    anos = _resumo(api, vid)["por_ano"]
    assert set(anos) == {"2026", "2028", "2029"}
    assert any("3 vencimento(s)" in a and "texto" in a for a in r["avisos"])


def test_sem_vencimento_fica_separado_e_avisa(api):
    vid = _versao(api)
    r = _importar(api, [linha(), linha(venc=None, principal=500, juros=50)], vid).json()
    d = _resumo(api, vid)
    assert d["sem_vencimento"] == {"titulos": 1, "principal": 500, "juros": 50}
    assert d["total"]["principal"] == 1500 and sum(a["principal"] for a in d["por_ano"].values()) == 1000
    assert any("sem data de vencimento" in a for a in r["avisos"])


def test_arquivo_invalido(api):
    vid = _versao(api)
    assert api.post("/api/dividas/importar", content=b"nao e xlsx").status_code == 422
    assert api.post("/api/dividas/importar", content=b"").status_code == 422
    r = _importar(api, [linha()], vid, aba="Outra")
    assert r.status_code == 422 and "aba 'Dados'" in r.json()["erro"]
    r = _importar(api, [["AB", "MESO"]], vid, cab=["Situação", "Empresa"])
    assert r.status_code == 422 and "Faltam colunas" in r.json()["erro"] and "Vr. Principal" in r.json()["erro"]
    r = _importar(api, [], vid)
    assert r.status_code == 422
    assert _resumo(api, vid)["importacao"] is None                       # nada foi vinculado


# ---------------------------------------------------------------- resumos
def test_filtro_de_empresas(api):
    vid = _versao(api)
    _importar(api, [linha(empresa="MESO", principal=100), linha(empresa="AFAL", principal=10),
                    linha(empresa="ST", principal=1), linha(empresa="TAL", principal=2), linha(empresa="SAL", principal=4)], vid)
    assert _resumo(api, vid, "agro")["total"]["principal"] == 110
    assert _resumo(api, vid, "transp")["total"]["principal"] == 3
    assert _resumo(api, vid, "todas")["total"]["principal"] == 117
    # cada empresa separada, sem somar com as outras
    assert [_resumo(api, vid, e)["total"]["principal"] for e in ("MESO", "AFAL", "ST", "TAL", "SAL")] == [100, 10, 1, 2, 4]
    assert _resumo(api, vid, "meso")["total"]["principal"] == 100                       # a sigla não diferencia maiúsculas
    assert _resumo(api, vid, "XYZ")["total"]["titulos"] == 0                            # empresa sem dívida: zerado, não erro
    assert api.get(f"/api/versoes/{vid}/dividas", params={"empresas": " "}).status_code == 422
    # várias empresas selecionadas: a soma delas
    assert _resumo(api, vid, "MESO,AFAL")["total"]["principal"] == 110
    assert _resumo(api, vid, "meso, st , sal")["total"]["principal"] == 105
    assert _resumo(api, vid, "MESO,MESO")["total"]["principal"] == 100                  # repetida não duplica


def test_totais_por_banco_tipo_e_taxa_media(api):
    vid = _versao(api)
    _importar(api, [linha(banco="BB", principal=300, juros=30, taxa=0.10), linha(banco="BB", principal=100, juros=10, taxa=0.20),
                    linha(banco="Itaú", tipo="Investimento", principal=600, juros=60, taxa=None)], vid)
    d = _resumo(api, vid)
    assert [(b["banco"], b["principal"], b["titulos"]) for b in d["por_banco"]] == [("Itaú", 600, 1), ("BB", 400, 2)]
    assert {(t["tipo"], t["principal"]) for t in d["por_tipo"]} == {("Custeio", 400), ("Investimento", 600)}
    assert d["total"]["taxa_media"] == pytest.approx((300 * 0.10 + 100 * 0.20) / 400)       # só quem tem taxa entra


def test_por_ano_separa_principal_e_juros(api):
    vid = _versao(api)
    _importar(api, [linha(venc=dt.datetime(2027, 3, 1), principal=100, juros=10),
                    linha(venc=dt.datetime(2027, 9, 1), tipo="Investimento", principal=200, juros=20),
                    linha(venc=dt.datetime(2029, 1, 1), principal=50, juros=5)], vid)
    a = _resumo(api, vid)["por_ano"]
    assert list(a) == ["2027", "2029"]                                    # ordenado
    assert (a["2027"]["principal"], a["2027"]["juros"], a["2027"]["titulos"]) == (300, 30, 2)
    assert a["2027"]["capital_giro"] == {"principal": 100, "juros": 10}
    assert a["2027"]["investimento"] == {"principal": 200, "juros": 20}


def test_mensal(api):
    vid = _versao(api)
    _importar(api, [linha(venc=dt.datetime(2027, 3, 10), principal=100, juros=10),
                    linha(venc=dt.datetime(2027, 3, 25), tipo="Investimento", principal=40, juros=4),
                    linha(venc=dt.datetime(2027, 12, 31), principal=7, juros=1),
                    linha(venc=dt.datetime(2028, 3, 10), principal=999)], vid)
    m = api.get(f"/api/versoes/{vid}/dividas/mensal", params={"ano": 2027}).json()["meses"]
    assert len(m) == 12
    assert m[2]["capital_giro"] == {"principal": 100, "juros": 10} and m[2]["investimento"] == {"principal": 40, "juros": 4}
    assert m[11]["capital_giro"]["principal"] == 7 and m[0]["capital_giro"]["principal"] == 0
    vazio = api.get(f"/api/versoes/{_versao(api)}/dividas/mensal", params={"ano": 2027}).json()
    assert vazio["importacao"] is None and len(vazio["meses"]) == 12


def test_pagos_nao_entram_no_cronograma(api):
    vid = _versao(api)
    _importar(api, [linha("PG", principal=5000), linha("AB", principal=10)], vid)
    assert _resumo(api, vid)["total"]["principal"] == 10


# ---------------------------------------------------------------- versões
def test_orcado_travado_mantem_a_base_e_reprojetado_pode_trocar(api):
    vid = _versao(api)
    _importar(api, [linha(principal=100)], vid, nome="velha.xlsx")
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    # versão travada não aceita nova importação nem troca de base
    assert _importar(api, [linha(principal=1)], vid, nome="x.xlsx").status_code == 409
    assert api.put(f"/api/versoes/{vid}/divida-importacao", json={"importacao_id": None}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _resumo(api, rep)["importacao"]["arquivo"] == "velha.xlsx"            # herda a base
    r = _importar(api, [linha(principal=300)], rep, nome="nova.xlsx")
    assert r.status_code == 200
    assert _resumo(api, rep)["total"]["principal"] == 300
    assert _resumo(api, vid)["total"]["principal"] == 100                          # o orçado não mudou
    assert len(api.get("/api/dividas/importacoes").json()["importacoes"]) == 2


def test_trocar_a_base_usada_pela_versao(api):
    vid = _versao(api)
    a = _importar(api, [linha(principal=100)], vid, nome="a.xlsx").json()["importacao_id"]
    b = _importar(api, [linha(principal=200)], vid, nome="b.xlsx").json()["importacao_id"]
    assert _resumo(api, vid)["importacao"]["id"] == b
    assert api.put(f"/api/versoes/{vid}/divida-importacao", json={"importacao_id": a}).status_code == 200
    assert _resumo(api, vid)["total"]["principal"] == 100
    assert api.put(f"/api/versoes/{vid}/divida-importacao", json={"importacao_id": 999}).status_code == 404
    assert api.put(f"/api/versoes/{vid}/divida-importacao", json={"importacao_id": None}).status_code == 200
    assert _resumo(api, vid)["importacao"] is None


def test_importar_sem_versao_so_cria_a_foto(api):
    vid = _versao(api)
    assert _importar(api, [linha()]).status_code == 200
    assert _resumo(api, vid)["importacao"] is None
    assert len(api.get("/api/dividas/importacoes").json()["importacoes"]) == 1


def test_importar_padrao(api, tmp_path, monkeypatch):
    vid = _versao(api)
    arq = tmp_path / "Endividamento alterado.xlsx"
    monkeypatch.setattr(svc_div, "ARQUIVO_PADRAO", arq)
    r = api.post("/api/dividas/importar-padrao", params={"versao_id": vid})
    assert r.status_code == 422 and "Escolher arquivo" in r.json()["erro"]          # arquivo não existe
    assert api.get("/api/dividas/importacoes").json()["arquivo_padrao_existe"] is False
    arq.write_bytes(xlsx([linha(principal=77)]))
    assert api.get("/api/dividas/importacoes").json()["arquivo_padrao_existe"] is True
    assert api.post("/api/dividas/importar-padrao", params={"versao_id": vid}).status_code == 200
    assert _resumo(api, vid)["total"]["principal"] == 77


def test_banco_antigo_ganha_as_tabelas_de_divida(tmp_path, monkeypatch):
    import sqlite3
    caminho = tmp_path / "antigo.db"
    con = sqlite3.connect(caminho)
    con.executescript("""
    CREATE TABLE versoes(id INTEGER PRIMARY KEY AUTOINCREMENT, ano_base INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'rascunho', horizonte INTEGER NOT NULL DEFAULT 5, origem_id INTEGER, criado_em TEXT NOT NULL,
      aprovado_em TEXT, autor TEXT NOT NULL DEFAULT 'local');
    INSERT INTO versoes(ano_base, tipo, nome, criado_em) VALUES(2027,'orcado','Antigo','x');
    """)
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        d = c.get("/api/versoes/1/dividas").json()
        assert d["importacao"] is None and d["versao"]["nome"] == "Antigo"
        assert c.post("/api/dividas/importar", params={"versao_id": 1}, content=xlsx([linha()])).status_code == 200


# ---------------------------------------------------------------- lista de contratos (formato da planilha)
def _contratos(api, vid, **params):
    return api.get(f"/api/versoes/{vid}/dividas/contratos", params=params).json()


def test_contratos_ordenados_por_vencimento_com_sem_vencimento_no_fim(api):
    vid = _versao(api)
    _importar(api, [linha(doc="C", venc=dt.datetime(2028, 1, 10)), linha(doc="A", venc=dt.datetime(2027, 6, 1)),
                    linha(doc="X", venc=None, principal=5), linha(doc="B", venc=dt.datetime(2027, 6, 1), banco="Zeta")], vid)
    c = _contratos(api, vid)
    assert [l["documento"] for l in c["linhas"]] == ["A", "B", "C", "X"]
    assert c["anos"] == [2027, 2028]
    assert c["linhas"][3]["data_vencimento"] is None


def test_contratos_trazem_as_colunas_da_planilha(api):
    vid = _versao(api)
    _importar(api, [linha(banco="Banco do Brasil", doc="40/10626-8", taxa=0.07, principal=900, juros=90, outras=10,
                          tipo="Investimento", venc=dt.datetime(2027, 3, 10))], vid)
    l = _contratos(api, vid)["linhas"][0]
    assert (l["empresa"], l["tipo"], l["grupo"], l["banco"], l["documento"]) == ("MESO", "Investimento", "investimento", "Banco do Brasil", "40/10626-8")
    assert (l["taxa"], l["principal"], l["juros"], l["outras_despesas"], l["bruto"]) == (0.07, 900, 90, 10, 1000)
    assert l["data_vencimento"] == "2027-03-10" and l["linha_credito"] == "Linha X" and l["produto"] == "Custeio Agrícola"


def test_contratos_filtros(api):
    vid = _versao(api)
    _importar(api, [linha(empresa="MESO", venc=dt.datetime(2027, 3, 1)), linha(empresa="AFAL", venc=dt.datetime(2028, 3, 1)),
                    linha(empresa="ST", venc=dt.datetime(2027, 3, 1)), linha("PG", venc=dt.datetime(2027, 3, 1)),
                    linha(empresa="MESO", tipo="Investimento", venc=dt.datetime(2027, 9, 1))], vid)
    assert len(_contratos(api, vid)["linhas"]) == 3                                # só agro e só abertos
    assert len(_contratos(api, vid, empresas="todas")["linhas"]) == 4
    assert len(_contratos(api, vid, empresas="transp")["linhas"]) == 1
    c = _contratos(api, vid, ano=2027)
    assert len(c["linhas"]) == 2 and c["anos"] == [2027, 2028]                    # a lista de anos não encolhe com o filtro de ano
    assert len(_contratos(api, vid, grupo="investimento")["linhas"]) == 1
    assert len(_contratos(api, vid, grupo="capital_giro", ano=2028)["linhas"]) == 1
    assert api.get(f"/api/versoes/{vid}/dividas/contratos", params={"grupo": "x"}).status_code == 422


def test_contratos_sem_base(api):
    vid = _versao(api)
    assert _contratos(api, vid) == {"importacao": None, "anos": [], "linhas": []}


def test_contratos_batem_com_o_resumo(api):
    vid = _versao(api)
    _importar(api, [linha(principal=100, juros=10, venc=dt.datetime(2027, 3, 1)),
                    linha(principal=200, juros=20, venc=dt.datetime(2029, 3, 1)), linha(principal=7, juros=1, venc=None)], vid)
    c = _contratos(api, vid)["linhas"]
    r = _resumo(api, vid)
    assert sum(l["principal"] for l in c) == r["total"]["principal"] == 307
    assert sum(l["juros"] for l in c) == r["total"]["juros"] == 31


# ---------------------------------------------------------------- empresas separadas
def test_empresas_disponiveis_e_empresa_inicial(api):
    vid = _versao(api)
    _importar(api, [linha(empresa="AFAL", principal=10), linha(empresa="MESO", principal=100), linha(empresa="MESO", principal=50),
                    linha(empresa="ST", principal=1), linha("PG", empresa="TAL", principal=999)], vid)
    d = api.get(f"/api/versoes/{vid}/dividas", params={"empresas": ""}).json()
    assert [(e["sigla"], e["titulos"], e["principal"]) for e in d["empresas_disponiveis"]] == [("MESO", 2, 150), ("AFAL", 1, 10), ("ST", 1, 1)]
    assert d["empresas"] == "MESO" and d["total"]["principal"] == 150                  # começa pela maior dívida; TAL (só pago) não aparece
    assert _resumo(api, vid, "AFAL")["empresas_disponiveis"][0]["sigla"] == "MESO"     # a lista não muda com o filtro


# ---------------------------------------------------------------- balanço: curto e longo prazo, com abertura por tipo
def _balanco(api, vid, **params):
    return api.get(f"/api/versoes/{vid}/dividas/balanco", params=params).json()


def _cenario(api):
    vid = _versao(api)
    _importar(api, [
        linha(tipo="Custeio", venc=dt.datetime(2027, 4, 1), principal=100, juros=10),
        linha(tipo="Capital de Giro", venc=dt.datetime(2027, 8, 1), principal=50, juros=5),
        linha(tipo="Investimento", venc=dt.datetime(2027, 6, 1), principal=200, juros=20),
        linha(tipo="Custeio", venc=dt.datetime(2028, 4, 1), principal=1000, juros=100),
        linha(tipo="Investimento", venc=dt.datetime(2028, 6, 1), principal=2000, juros=200),
        linha(tipo="Investimento", venc=dt.datetime(2030, 6, 1), principal=4000, juros=400),
        linha(tipo="Custeio", venc=dt.datetime(2026, 9, 1), principal=7, juros=1),
    ], vid)
    return vid


def test_balanco_so_tem_curto_e_longo_prazo(api):
    b = _balanco(api, _cenario(api))
    assert set(b) >= {"curto", "longo", "curto_total", "longo_total", "total", "tipos", "anos"}
    assert not any("cpltd" in k.lower() for k in b)                                  # sem CPLTD
    assert b["anos"] == [2026, 2027, 2028, 2029, 2030]


def test_balanco_curto_e_o_que_vence_ate_31_12_do_ano_seguinte(api):
    b = _balanco(api, _cenario(api))
    # 31/12/2026: curto = vence em 2027 (100 + 50 + 200); longo = 2028 em diante
    assert b["curto_total"]["2026"] == 350 and b["longo_total"]["2026"] == 7000 and b["total"]["2026"] == 7350   # o 7 de 2026 já estará pago
    # 31/12/2027: curto = vence em 2028; longo = 2030
    assert (b["curto_total"]["2027"], b["longo_total"]["2027"]) == (3000, 4000)
    # 31/12/2028: nada vence em 2029; tudo que resta (2030) é longo
    assert (b["curto_total"]["2028"], b["longo_total"]["2028"]) == (0, 4000)
    # 31/12/2029: o que vence em 2030 é curto; não sobra longo
    assert (b["curto_total"]["2029"], b["longo_total"]["2029"]) == (4000, 0)
    assert b["total"]["2030"] == 0


def test_balanco_abre_por_tipo_e_os_tipos_somam_o_total(api):
    b = _balanco(api, _cenario(api))
    assert b["tipos"] == ["Custeio", "Capital de Giro", "Investimento"]                # ordem fixa: custeio, capital de giro, investimento
    assert b["curto"]["Custeio"]["2026"] == 100 and b["curto"]["Capital de Giro"]["2026"] == 50 and b["curto"]["Investimento"]["2026"] == 200
    assert b["longo"]["Custeio"]["2026"] == 1000 and b["longo"]["Investimento"]["2026"] == 6000
    for y in b["anos"]:
        y = str(y)
        assert sum(b["curto"][t][y] for t in b["tipos"]) == b["curto_total"][y]
        assert sum(b["longo"][t][y] for t in b["tipos"]) == b["longo_total"][y]
        assert b["curto_total"][y] + b["longo_total"][y] == b["total"][y]


def test_balanco_juros_do_ano_com_abertura_por_tipo(api):
    b = _balanco(api, _cenario(api))
    assert b["juros"]["Custeio"]["2027"] == 10 and b["juros"]["Capital de Giro"]["2027"] == 5 and b["juros"]["Investimento"]["2027"] == 20
    assert b["juros_total"]["2027"] == 35 and b["juros_total"]["2028"] == 300 and b["juros_total"]["2026"] == 1


def test_balanco_so_mostra_os_tipos_que_existem(api):
    vid = _versao(api)
    _importar(api, [linha(tipo="Investimento", venc=dt.datetime(2026, 5, 1)), linha(tipo="EGF", venc=dt.datetime(2026, 6, 1)),
                    linha(tipo="Leasing", venc=dt.datetime(2026, 7, 1))], vid)
    assert _balanco(api, vid)["tipos"] == ["Investimento", "EGF", "Leasing"]


def test_balanco_filtra_empresa_ignora_pagos_e_avisa_sem_vencimento(api):
    vid = _versao(api)
    _importar(api, [linha(venc=dt.datetime(2026, 1, 1), principal=1), linha(venc=dt.datetime(2027, 4, 1), principal=100),
                    linha(empresa="ST", venc=dt.datetime(2026, 1, 1), principal=1), linha(empresa="ST", venc=dt.datetime(2027, 4, 1), principal=9),
                    linha("PG", venc=dt.datetime(2027, 4, 1), principal=5000), linha(venc=None, principal=33)], vid)
    b = _balanco(api, vid, empresas="MESO")
    assert b["curto_total"]["2026"] == 100 and b["sem_vencimento"] == {"titulos": 1, "valor": 33}
    assert _balanco(api, vid, empresas="ST")["curto_total"]["2026"] == 9


def test_balanco_primeiro_ano_e_o_da_importacao(api):
    vid = _versao(api)
    _importar(api, [linha(venc=dt.datetime(2040, 4, 1), principal=10)], vid)
    ano_imp = dt.date.today().year
    b = _balanco(api, vid)
    assert b["anos"][0] == ano_imp and b["anos"][-1] == 2040
    assert b["longo_total"][str(ano_imp)] == 10 and b["curto_total"][str(ano_imp)] == 0
    assert b["curto_total"]["2039"] == 10 and b["longo_total"]["2039"] == 0           # em 31/12/2039, o que vence em 2040 é curto


def test_balanco_sem_base_ou_sem_titulos(api):
    vid = _versao(api)
    assert _balanco(api, vid)["anos"] == [] and _balanco(api, vid)["importacao"] is None
    _importar(api, [linha("PG")], vid)
    assert _balanco(api, vid)["anos"] == []


def test_balanco_soma_das_empresas_selecionadas(api):
    vid = _versao(api)
    _importar(api, [linha(empresa="MESO", tipo="Custeio", venc=dt.datetime(2027, 4, 1), principal=100, juros=10),
                    linha(empresa="AFAL", tipo="Custeio", venc=dt.datetime(2027, 4, 1), principal=7, juros=1),
                    linha(empresa="ST", tipo="Investimento", venc=dt.datetime(2029, 4, 1), principal=3, juros=2),
                    linha(venc=dt.datetime(2026, 1, 1), principal=1)], vid)
    meso, afal = _balanco(api, vid, empresas="MESO"), _balanco(api, vid, empresas="AFAL")
    soma = _balanco(api, vid, empresas="MESO,AFAL")
    todas = _balanco(api, vid, empresas="MESO,AFAL,ST")
    for y in ("2026", "2027"):
        assert soma["curto_total"][y] == meso["curto_total"][y] + afal["curto_total"][y]
        assert soma["juros_total"][y] == meso["juros_total"][y] + afal["juros_total"][y]
    assert soma["curto"]["Custeio"]["2026"] == 107 and soma["tipos"] == ["Custeio"]
    assert todas["tipos"] == ["Custeio", "Investimento"] and todas["longo"]["Investimento"]["2026"] == 3
    assert todas["total"]["2026"] == 110


# ---------------------------------------------------------------- resumo mensal: mês x ano, aberto por tipo
def _mensal_anos(api, vid, **params):
    return api.get(f"/api/versoes/{vid}/dividas/resumo-mensal", params=params).json()


def _valor(r, ano, mes, tipo, campo="principal"):
    return sum(d[campo] for d in r["dados"] if (d["ano"], d["mes"], d["tipo"]) == (ano, mes, tipo))


def test_resumo_mensal_agrupa_por_ano_mes_e_tipo(api):
    vid = _versao(api)
    _importar(api, [linha(tipo="Custeio", venc=dt.datetime(2027, 3, 5), principal=100, juros=10),
                    linha(tipo="Custeio", venc=dt.datetime(2027, 3, 25), principal=50, juros=5),
                    linha(tipo="Investimento", venc=dt.datetime(2027, 3, 9), principal=7, juros=1),
                    linha(tipo="Capital de Giro", venc=dt.datetime(2028, 3, 9), principal=9, juros=2),
                    linha("PG", venc=dt.datetime(2027, 3, 1), principal=5000)], vid)
    r = _mensal_anos(api, vid)
    assert r["anos"] == [2027, 2028] and r["tipos"] == ["Custeio", "Capital de Giro", "Investimento"]
    assert _valor(r, 2027, 3, "Custeio") == 150 and _valor(r, 2027, 3, "Custeio", "juros") == 15      # dois títulos do mesmo mês somam
    assert _valor(r, 2027, 3, "Investimento") == 7 and _valor(r, 2028, 3, "Capital de Giro") == 9
    assert all(d["principal"] != 5000 for d in r["dados"])                                              # pago não entra


def test_resumo_mensal_anos_sao_continuos_e_juros_sem_principal_contam(api):
    vid = _versao(api)
    _importar(api, [linha(venc=dt.datetime(2026, 5, 1)), linha(venc=dt.datetime(2029, 5, 1)),
                    linha(venc=dt.datetime(2027, 6, 1), principal=0, juros=77)], vid)              # título só de despesa financeira
    r = _mensal_anos(api, vid)
    assert r["anos"] == [2026, 2027, 2028, 2029]                                                      # 2028 sem vencimento também aparece
    assert _valor(r, 2027, 6, "Custeio", "juros") == 77


def test_resumo_mensal_bate_com_o_resumo_anual_e_filtra_empresas(api):
    vid = _versao(api)
    _importar(api, [linha(empresa="MESO", venc=dt.datetime(2027, 3, 1), principal=100, juros=10),
                    linha(empresa="AFAL", venc=dt.datetime(2027, 9, 1), principal=7, juros=1),
                    linha(empresa="ST", venc=dt.datetime(2027, 9, 1), principal=3, juros=1),
                    linha(empresa="MESO", venc=None, principal=33)], vid)
    r = _mensal_anos(api, vid, empresas="MESO,AFAL")
    assert sum(d["principal"] for d in r["dados"]) == 107 and r["sem_vencimento"] == {"titulos": 1, "valor": 33}
    anual = _resumo(api, vid, "MESO,AFAL")["por_ano"]["2027"]
    assert sum(d["principal"] for d in r["dados"] if d["ano"] == 2027) == anual["principal"]
    assert sum(d["juros"] for d in r["dados"] if d["ano"] == 2027) == anual["juros"]
    assert sum(d["principal"] for d in _mensal_anos(api, vid, empresas="ST")["dados"]) == 3


def test_resumo_mensal_sem_base(api):
    vid = _versao(api)
    assert _mensal_anos(api, vid)["dados"] == [] and _mensal_anos(api, vid)["importacao"] is None
