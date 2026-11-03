import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _criar(api, nome="Insumos", classificacao="direto", **kw):
    r = api.post("/api/grupos-custo", json={"nome": nome, "classificacao": classificacao, **kw})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _lista(api):
    return api.get("/api/grupos-custo").json()["grupos"]


def test_cadastro_comeca_vazio_e_traz_as_classificacoes(api):
    d = api.get("/api/grupos-custo").json()
    assert d["grupos"] == [] and set(d["classificacoes"]) == {"direto", "indireto"}


def test_cria_e_classifica_como_direto_ou_indireto(api):
    _criar(api, "Insumos", "direto")
    _criar(api, "Administrativo", "indireto")
    g = {x["nome"]: x for x in _lista(api)}
    assert g["Insumos"]["classificacao"] == "direto" and g["Administrativo"]["classificacao"] == "indireto"
    assert g["Insumos"]["ativa"] is True


def test_lista_ordenada_por_classificacao_e_nome(api):
    for n, c in (("Mão de obra", "direto"), ("Energia", "indireto"), ("Insumos", "direto"), ("Aluguel", "indireto")):
        _criar(api, n, c)
    assert [x["nome"] for x in _lista(api)] == ["Insumos", "Mão de obra", "Aluguel", "Energia"]      # diretos primeiro


def test_nome_obrigatorio_unico_e_sem_espacos_sobrando(api):
    assert api.post("/api/grupos-custo", json={"nome": "  ", "classificacao": "direto"}).status_code == 422
    _criar(api, "  Mão   de obra ", "direto")
    assert _lista(api)[0]["nome"] == "Mão de obra"
    r = api.post("/api/grupos-custo", json={"nome": "mão de OBRA", "classificacao": "indireto"})
    assert r.status_code == 422 and "Já existe" in r.json()["erro"]


def test_classificacao_obrigatoria_e_valida(api):
    assert api.post("/api/grupos-custo", json={"nome": "X", "classificacao": ""}).status_code == 422
    assert api.post("/api/grupos-custo", json={"nome": "X", "classificacao": "misto"}).status_code == 422
    assert api.post("/api/grupos-custo", json={"nome": "X"}).status_code == 422


def test_atualiza_nome_classificacao_e_ativa(api):
    gid = _criar(api, "Insumos", "direto")
    assert api.put(f"/api/grupos-custo/{gid}", json={"nome": "Insumos agrícolas", "classificacao": "indireto", "ativa": False}).status_code == 200
    g = _lista(api)[0]
    assert (g["nome"], g["classificacao"], g["ativa"]) == ("Insumos agrícolas", "indireto", False)
    outro = _criar(api, "Energia", "indireto")
    r = api.put(f"/api/grupos-custo/{outro}", json={"nome": "insumos agrícolas", "classificacao": "indireto"})
    assert r.status_code == 422                                              # não pode virar nome de outro grupo
    assert api.put(f"/api/grupos-custo/{gid}", json={"nome": "Insumos agrícolas", "classificacao": "direto"}).status_code == 200   # mantém o próprio nome
    assert api.put("/api/grupos-custo/999", json={"nome": "X", "classificacao": "direto"}).status_code == 404


def test_exclui_grupo(api):
    gid = _criar(api)
    assert api.delete(f"/api/grupos-custo/{gid}").status_code == 200 and _lista(api) == []
    assert api.delete(f"/api/grupos-custo/{gid}").status_code == 404


def test_banco_antigo_ganha_a_tabela(tmp_path, monkeypatch):
    import sqlite3
    caminho = tmp_path / "antigo.db"
    con = sqlite3.connect(caminho)
    con.execute("CREATE TABLE versoes(id INTEGER PRIMARY KEY AUTOINCREMENT, ano_base INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL, "
                "status TEXT NOT NULL DEFAULT 'rascunho', horizonte INTEGER NOT NULL DEFAULT 5, origem_id INTEGER, criado_em TEXT NOT NULL, "
                "aprovado_em TEXT, autor TEXT NOT NULL DEFAULT 'local')")
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        assert c.get("/api/grupos-custo").json()["grupos"] == []
