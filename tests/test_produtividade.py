import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _cult(api, nome, grupo="Hortifruti", **kw):
    r = api.post("/api/culturas", json={"nome": nome, "grupo": grupo, **kw})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _versao(api, h=4):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": h}).json()["id"]


def _add(api, vid, cid):
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": cid}).status_code == 200


def _area(api, vid, cid, ano, ha):
    assert api.put(f"/api/versoes/{vid}/areas/{cid}/{ano}", json={"area_ha": ha}).status_code == 200


def _prod(api, vid, cid, ano, v):
    r = api.put(f"/api/versoes/{vid}/produtividade/{cid}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _ler(api, vid):
    return api.get(f"/api/versoes/{vid}/produtividade").json()


# ---------------------------------------------------------------- lista vem de Áreas por cultura
def test_so_aparecem_as_culturas_da_lista_de_areas(api):
    vid = _versao(api)
    a, b = _cult(api, "Cenoura"), _cult(api, "Alho")
    assert _ler(api, vid)["culturas"] == []
    _add(api, vid, a)
    assert [c["nome"] for c in _ler(api, vid)["culturas"]] == ["Cenoura"]
    _add(api, vid, b)
    assert [c["nome"] for c in _ler(api, vid)["culturas"]] == ["Alho", "Cenoura"]


def test_remover_da_lista_de_areas_tira_da_produtividade(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    _prod(api, vid, a, 2027, 2000)
    api.delete(f"/api/versoes/{vid}/areas/culturas/{a}")
    assert _ler(api, vid)["culturas"] == []
    _add(api, vid, a)                                      # volta zerada
    assert _ler(api, vid)["culturas"][0]["anos"]["2027"] == 0


def test_nao_lanca_produtividade_de_cultura_fora_da_lista(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    r = api.put(f"/api/versoes/{vid}/produtividade/{a}/2027", json={"valor": 5})
    assert r.status_code == 422 and "Áreas por produto" in r.json()["erro"]
    assert api.put(f"/api/versoes/{vid}/produtividade/999/2027", json={"valor": 5}).status_code == 404


# ---------------------------------------------------------------- valores (sempre por hectare, em kg ou litro)
def test_uma_linha_por_cultura_em_kg_por_hectare(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura", embalagem="Caixa", qtd_por_embalagem=20)      # a embalagem não interfere aqui
    s = _cult(api, "Sorgo", "Grãos")
    for c in (a, s):
        _add(api, vid, c)
    _prod(api, vid, a, 2027, 50000)
    d = {c["nome"]: c for c in _ler(api, vid)["culturas"]}
    assert d["Cenoura"]["anos"]["2027"] == 50000 and d["Cenoura"]["anos"]["2028"] == 0
    assert d["Cenoura"]["unidade"] == "kg" and d["Sorgo"]["unidade"] == "kg"
    assert set(d["Cenoura"]) == {"id", "nome", "grupo", "ativa", "unidade", "anos", "removivel"}      # sem conversões nem produção


def test_leite_fica_em_litros_por_hectare(api):
    vid = _versao(api)
    l = _cult(api, "Leite", "Pecuária", unidade="litro")
    _add(api, vid, l)
    assert _ler(api, vid)["culturas"][0]["unidade"] == "litro"


def test_sem_avisos_nem_validacao_de_area(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    _area(api, vid, a, 2027, 100)                           # há área e nenhuma produtividade: tudo bem
    assert "avisos" not in _ler(api, vid)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200


def test_validacoes(api):
    vid = _versao(api, h=2)
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    assert api.put(f"/api/versoes/{vid}/produtividade/{a}/2030", json={"valor": 1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/produtividade/{a}/2027", json={"valor": -1}).status_code == 422


# ---------------------------------------------------------------- replicar
def test_replicar_uma_e_todas(api):
    vid = _versao(api)
    a, b = _cult(api, "Cenoura"), _cult(api, "Alho")
    _add(api, vid, a); _add(api, vid, b)
    _prod(api, vid, a, 2028, 100); _prod(api, vid, b, 2028, 40); _prod(api, vid, a, 2030, 999)
    assert api.post(f"/api/versoes/{vid}/produtividade/{a}/replicar", json={"ano": 2028}).json()["anos_alterados"] == 2
    c = {x["nome"]: x["anos"] for x in _ler(api, vid)["culturas"]}
    assert [c["Cenoura"][str(y)] for y in (2027, 2028, 2029, 2030)] == [0, 100, 100, 100]
    assert c["Alho"]["2029"] == 0                           # a outra cultura não mudou
    r = api.post(f"/api/versoes/{vid}/produtividade/replicar-todas", json={"ano": 2028})
    assert r.json() == {"culturas": 2, "anos_alterados": 2}
    c = {x["nome"]: x["anos"] for x in _ler(api, vid)["culturas"]}
    assert c["Alho"]["2030"] == 40 and c["Alho"]["2027"] == 0


def test_replicar_todas_validacoes(api):
    vid = _versao(api, h=3)
    assert api.post(f"/api/versoes/{vid}/produtividade/replicar-todas", json={"ano": 2027}).status_code == 422
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    assert api.post(f"/api/versoes/{vid}/produtividade/replicar-todas", json={"ano": 2029}).status_code == 422


# ---------------------------------------------------------------- versões
def test_trava_reprojetado_e_comparacao(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    _prod(api, vid, a, 2027, 50000)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/produtividade/{a}/2027", json={"valor": 1}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/produtividade/{a}/replicar", json={"ano": 2027}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/produtividade/replicar-todas", json={"ano": 2027}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _ler(api, rep)["culturas"][0]["anos"]["2027"] == 50000
    _prod(api, rep, a, 2027, 60000)
    assert _ler(api, vid)["culturas"][0]["anos"]["2027"] == 50000               # orçado intacto
    c = api.get(f"/api/comparar-produtividade?a={vid}&b={rep}").json()
    y = c["culturas"]["Cenoura"]["anos"]["2027"]
    assert y["a"] == 50000 and y["b"] == 60000 and y["delta"] == 10000 and y["pct"] == pytest.approx(20)
    assert c["culturas"]["Cenoura"]["unidade"] == "kg"


def test_banco_antigo_ganha_a_tabela(tmp_path, monkeypatch):
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
        assert c.get("/api/versoes/1/produtividade").json()["culturas"] == []
