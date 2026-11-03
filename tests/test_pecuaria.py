import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _versao(api, h=3):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": h}).json()["id"]


def _lanc(api, vid, campo, ano, v):
    r = api.put(f"/api/versoes/{vid}/pecuaria/{campo}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _linhas(api, vid):
    return {l["id"]: l for l in api.get(f"/api/versoes/{vid}/pecuaria").json()["linhas"]}


def test_campos_da_planilha_e_valores_iniciais_zerados(api):
    d = api.get(f"/api/versoes/{_versao(api)}/pecuaria").json()
    assert d["atividade"] == "Leite" and d["anos"] == [2027, 2028, 2029] and d["dias_no_ano"] == 365
    assert [(l["id"], l["nome"], l["unidade"], l["entrada"]) for l in d["linhas"]] == [
        ("animais", "Total de animais em lactação", "uni", True),
        ("kg_animal_dia", "Total diária (por animal)", "kg/dia", True),
        ("producao_dia", "Total produção diária", "kg/dia", False),
        ("producao_ano", "Total produção anual", "kg/ano", False)]
    assert all(v == 0 for l in d["linhas"] for v in l["valores"].values())


def test_producao_diaria_e_anual_sao_calculadas(api):
    vid = _versao(api)
    _lanc(api, vid, "animais", 2027, 1000); _lanc(api, vid, "kg_animal_dia", 2027, 30)
    l = _linhas(api, vid)
    assert l["producao_dia"]["valores"]["2027"] == 30000                       # 1.000 animais x 30 kg
    assert l["producao_ano"]["valores"]["2027"] == 10_950_000                  # x 365 dias
    assert l["producao_dia"]["valores"]["2028"] == 0


def test_mesmos_numeros_da_planilha_de_orcamento(api):
    vid = _versao(api)
    _lanc(api, vid, "animais", 2027, 1140); _lanc(api, vid, "kg_animal_dia", 2027, 33.77541216053833)
    l = _linhas(api, vid)
    assert l["producao_dia"]["valores"]["2027"] == pytest.approx(38503.97, abs=0.01)
    assert l["producao_ano"]["valores"]["2027"] == pytest.approx(14053949, abs=1)


def test_so_os_campos_de_entrada_e_valores_validos(api):
    vid = _versao(api)
    for campo in ("producao_dia", "producao_ano", "x"):
        r = api.put(f"/api/versoes/{vid}/pecuaria/{campo}/2027", json={"valor": 1})
        assert r.status_code == 422 and "calculado pelo sistema" in r.json()["erro"]
    assert api.put(f"/api/versoes/{vid}/pecuaria/animais/2040", json={"valor": 1}).status_code == 422       # fora do horizonte
    assert api.put(f"/api/versoes/{vid}/pecuaria/animais/2027", json={"valor": -1}).status_code == 422
    assert api.put("/api/versoes/999/pecuaria/animais/2027", json={"valor": 1}).status_code == 404


def test_replicar_um_campo_e_todos(api):
    vid = _versao(api)
    _lanc(api, vid, "animais", 2027, 500); _lanc(api, vid, "kg_animal_dia", 2027, 25)
    assert api.post(f"/api/versoes/{vid}/pecuaria/animais/replicar", json={"ano": 2027}).json()["anos_alterados"] == 2
    l = _linhas(api, vid)
    assert l["animais"]["valores"]["2029"] == 500 and l["kg_animal_dia"]["valores"]["2028"] == 0
    assert api.post(f"/api/versoes/{vid}/pecuaria/replicar-todos", json={"ano": 2027}).json() == {"campos": 2, "anos_alterados": 2}
    assert _linhas(api, vid)["producao_ano"]["valores"]["2029"] == 500 * 25 * 365
    assert api.post(f"/api/versoes/{vid}/pecuaria/producao_dia/replicar", json={"ano": 2027}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/pecuaria/replicar-todos", json={"ano": 2029}).status_code == 422     # último ano


def test_versao_travada_reprojetado_e_comparacao(api):
    vid = _versao(api)
    _lanc(api, vid, "animais", 2027, 1000); _lanc(api, vid, "kg_animal_dia", 2027, 30)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/pecuaria/animais/2027", json={"valor": 1}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/pecuaria/animais/replicar", json={"ano": 2027}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/pecuaria/replicar-todos", json={"ano": 2027}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _linhas(api, rep)["producao_ano"]["valores"]["2027"] == 10_950_000                  # o Reprojetado nasce com os valores
    _lanc(api, rep, "animais", 2027, 1100)
    assert _linhas(api, vid)["animais"]["valores"]["2027"] == 1000                             # orçado intacto
    c = api.get(f"/api/comparar-pecuaria?a={vid}&b={rep}").json()
    ln = {l["id"]: l for l in c["linhas"]}
    assert ln["animais"]["anos"]["2027"] == {"a": 1000, "b": 1100, "delta": 100, "pct": 10.0}
    assert ln["producao_ano"]["anos"]["2027"]["delta"] == pytest.approx(100 * 30 * 365)


def test_banco_antigo_ganha_a_tabela(tmp_path, monkeypatch):
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
        assert c.get("/api/versoes/1/pecuaria").json()["linhas"][0]["valores"]["2027"] == 0
