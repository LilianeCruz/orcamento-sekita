import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _cult(api, nome="Cenoura", grupo="Hortifruti", **kw):
    r = api.post("/api/culturas", json={"nome": nome, "grupo": grupo, **kw})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _add(api, vid, cid):
    r = api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": cid})
    assert r.status_code == 200, r.text


def _versao(api, ano=2027, h=5):
    return api.post("/api/versoes", json={"ano_base": ano, "horizonte": h}).json()["id"]


# ---------------------------------------------------------------- culturas
def test_cadastro_comeca_vazio(api):
    d = api.get("/api/culturas").json()
    assert d["culturas"] == [] and "Hortifruti" in d["grupos"]


def test_criar_editar_e_nome_unico(api):
    cid = _cult(api, "Cenoura", embalagem="Caixa", qtd_por_embalagem=20)
    c = api.get("/api/culturas").json()["culturas"][0]
    assert c["embalagem"] == "Caixa" and c["qtd_por_embalagem"] == 20 and c["ativa"] is True
    assert api.post("/api/culturas", json={"nome": "cenoura", "grupo": "Hortifruti"}).status_code == 422
    r = api.put(f"/api/culturas/{cid}", json={"nome": "Cenoura Lavada", "grupo": "Hortifruti", "embalagem": "Caixa", "qtd_por_embalagem": 29})
    assert r.status_code == 200
    assert api.get("/api/culturas").json()["culturas"][0]["nome"] == "Cenoura Lavada"


def test_validacoes_de_cultura(api):
    assert api.post("/api/culturas", json={"nome": " ", "grupo": "Hortifruti"}).status_code == 422
    assert api.post("/api/culturas", json={"nome": "X", "grupo": "Inventado"}).status_code == 422
    assert api.post("/api/culturas", json={"nome": "X", "grupo": "Grãos", "qtd_por_embalagem": -1}).status_code == 422
    # embalagem sem peso não faz sentido
    assert api.post("/api/culturas", json={"nome": "Y", "grupo": "Grãos", "embalagem": "Saco"}).status_code == 422
    assert api.put("/api/culturas/99", json={"nome": "X", "grupo": "Grãos"}).status_code == 404


def test_excluir_cultura_sem_uso_e_com_uso(api):
    livre, usada = _cult(api, "Alho"), _cult(api, "Soja", "Grãos")
    vid = _versao(api)
    _add(api, vid, usada)
    assert api.delete(f"/api/culturas/{livre}").status_code == 200
    assert api.delete(f"/api/culturas/{usada}").status_code == 422


# ---------------------------------------------------------------- áreas
def test_so_aparecem_as_culturas_adicionadas(api):
    vid = _versao(api)
    a, b, c = _cult(api, "Cenoura"), _cult(api, "Alho"), _cult(api, "Soja", "Grãos")
    d = api.get(f"/api/versoes/{vid}/areas").json()
    assert d["culturas"] == [] and len(d["adicionaveis"]) == 3 and d["total_cadastradas"] == 3
    _add(api, vid, a); _add(api, vid, c)
    d = api.get(f"/api/versoes/{vid}/areas").json()
    assert [x["nome"] for x in d["culturas"]] == ["Soja", "Cenoura"]          # ordenadas por grupo e nome
    assert [x["nome"] for x in d["adicionaveis"]] == ["Alho"]


def test_adicionar_com_area_zero_ja_aparece(api):
    vid = _versao(api)
    a = _cult(api)
    _add(api, vid, a)
    d = api.get(f"/api/versoes/{vid}/areas").json()
    assert d["culturas"][0]["anos"]["2027"] == 0


def test_adicionar_duas_vezes_e_cultura_inativa(api):
    vid = _versao(api)
    a, b = _cult(api, "Cenoura"), _cult(api, "Alho")
    _add(api, vid, a)
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": a}).status_code == 422
    api.put(f"/api/culturas/{b}", json={"nome": "Alho", "grupo": "Hortifruti", "ativa": False})
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": b}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": 999}).status_code == 404


def test_lancar_area_exige_cultura_adicionada(api):
    vid = _versao(api)
    a = _cult(api)
    r = api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 10})
    assert r.status_code == 422 and "Adicione" in r.json()["erro"]


def test_total_plantado_sem_validar_area_disponivel(api):
    vid = _versao(api)
    a, b = _cult(api, "Cenoura"), _cult(api, "Alho")
    _add(api, vid, a); _add(api, vid, b)
    api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 300})
    r = api.put(f"/api/versoes/{vid}/areas/{b}/2027", json={"area_ha": 5000})     # não há área em Arrendamentos: tudo bem
    assert r.status_code == 200
    d = api.get(f"/api/versoes/{vid}/areas").json()
    assert d["resumo"]["2027"]["plantado"] == 5300
    assert "avisos" not in d and "disponivel" not in d["resumo"]["2027"]
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200              # e não impede aprovar


def test_validacoes_de_area(api):
    vid = _versao(api, h=2)
    a = _cult(api)
    _add(api, vid, a)
    assert api.put(f"/api/versoes/{vid}/areas/{a}/2030", json={"area_ha": 1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": -5}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/areas/99/2027", json={"area_ha": 1}).status_code == 404


def test_replicar_area(api):
    vid = _versao(api, h=4)
    a = _cult(api)
    _add(api, vid, a)
    api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 10})
    api.put(f"/api/versoes/{vid}/areas/{a}/2028", json={"area_ha": 80})
    api.put(f"/api/versoes/{vid}/areas/{a}/2029", json={"area_ha": 90})
    r = api.post(f"/api/versoes/{vid}/areas/{a}/replicar", json={"ano": 2028})
    assert r.json()["anos_alterados"] == 2
    anos = api.get(f"/api/versoes/{vid}/areas").json()["culturas"][0]["anos"]
    assert anos["2027"] == 10 and anos["2028"] == 80 and anos["2029"] == 80 and anos["2030"] == 80


def test_replicar_todas_as_areas(api):
    vid = _versao(api, h=4)
    a, b, c = _cult(api, "Cenoura"), _cult(api, "Alho"), _cult(api, "Soja", "Grãos")
    _add(api, vid, a); _add(api, vid, b)                 # Soja fica de fora da lista
    api.put(f"/api/versoes/{vid}/areas/{a}/2028", json={"area_ha": 100})
    api.put(f"/api/versoes/{vid}/areas/{b}/2028", json={"area_ha": 40})
    api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 7})
    api.put(f"/api/versoes/{vid}/areas/{a}/2030", json={"area_ha": 999})
    r = api.post(f"/api/versoes/{vid}/areas/replicar-todas", json={"ano": 2028})
    assert r.json() == {"culturas": 2, "anos_alterados": 2}
    d = {x["nome"]: x["anos"] for x in api.get(f"/api/versoes/{vid}/areas").json()["culturas"]}
    assert d["Cenoura"] == {"2027": 7, "2028": 100, "2029": 100, "2030": 100}      # 2027 não muda; 2030 é substituído
    assert d["Alho"] == {"2027": 0, "2028": 40, "2029": 40, "2030": 40}
    assert "Soja" not in d


def test_replicar_todas_validacoes_e_trava(api):
    vid = _versao(api, h=3)
    assert api.post(f"/api/versoes/{vid}/areas/replicar-todas", json={"ano": 2027}).status_code == 422   # sem culturas
    a = _cult(api)
    _add(api, vid, a)
    assert api.post(f"/api/versoes/{vid}/areas/replicar-todas", json={"ano": 2029}).status_code == 422   # último ano
    assert api.post(f"/api/versoes/{vid}/areas/replicar-todas", json={"ano": 2040}).status_code == 422   # fora do horizonte
    api.post(f"/api/versoes/{vid}/aprovar")
    assert api.post(f"/api/versoes/{vid}/areas/replicar-todas", json={"ano": 2027}).status_code == 409


def test_remover_cultura_apaga_as_areas_dela(api):
    vid = _versao(api)
    a, b = _cult(api, "Cenoura"), _cult(api, "Alho")
    _add(api, vid, a); _add(api, vid, b)
    api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 100})
    api.put(f"/api/versoes/{vid}/areas/{b}/2027", json={"area_ha": 50})
    assert api.delete(f"/api/versoes/{vid}/areas/culturas/{a}").status_code == 200
    d = api.get(f"/api/versoes/{vid}/areas").json()
    assert [x["nome"] for x in d["culturas"]] == ["Alho"] and d["resumo"]["2027"]["plantado"] == 50
    assert {x["nome"] for x in d["adicionaveis"]} == {"Cenoura"}
    # ao adicionar de novo, volta zerada
    _add(api, vid, a)
    por_nome = {x["nome"]: x for x in api.get(f"/api/versoes/{vid}/areas").json()["culturas"]}
    assert por_nome["Cenoura"]["anos"]["2027"] == 0 and por_nome["Alho"]["anos"]["2027"] == 50


def test_cultura_inativa_adicionada_continua_na_lista(api):
    vid = _versao(api)
    a = _cult(api)
    _add(api, vid, a)
    api.put(f"/api/culturas/{a}", json={"nome": "Cenoura", "grupo": "Hortifruti", "ativa": False})
    d = api.get(f"/api/versoes/{vid}/areas").json()
    assert [x["nome"] for x in d["culturas"]] == ["Cenoura"] and d["culturas"][0]["ativa"] is False
    assert d["adicionaveis"] == []


# ---------------------------------------------------------------- versões
def test_travada_e_reprojetado_copia_lista_e_areas(api):
    vid = _versao(api)
    a, b = _cult(api), _cult(api, "Alho")
    _add(api, vid, a)
    api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 100})
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 1}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/areas/{a}/replicar", json={"ano": 2027}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": b}).status_code == 409
    assert api.delete(f"/api/versoes/{vid}/areas/culturas/{a}").status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    d = api.get(f"/api/versoes/{rep}/areas").json()
    assert [x["nome"] for x in d["culturas"]] == ["Cenoura"] and d["culturas"][0]["anos"]["2027"] == 100
    _add(api, rep, b)                                                   # só no reprojetado
    api.put(f"/api/versoes/{rep}/areas/{a}/2027", json={"area_ha": 120})
    orig = api.get(f"/api/versoes/{vid}/areas").json()
    assert [x["nome"] for x in orig["culturas"]] == ["Cenoura"] and orig["culturas"][0]["anos"]["2027"] == 100


def test_comparar_areas(api):
    vid = _versao(api)
    a, b = _cult(api, "Cenoura"), _cult(api, "Alho")
    _add(api, vid, a); _add(api, vid, b)
    api.put(f"/api/versoes/{vid}/areas/{a}/2027", json={"area_ha": 100})
    api.put(f"/api/versoes/{vid}/areas/{b}/2027", json={"area_ha": 50})
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    api.put(f"/api/versoes/{rep}/areas/{a}/2027", json={"area_ha": 120})
    c = api.get(f"/api/comparar-areas?a={vid}&b={rep}").json()
    assert c["culturas"]["Cenoura"]["2027"]["delta"] == 20
    assert c["culturas"]["Cenoura"]["2027"]["pct"] == pytest.approx(20)
    assert c["culturas"]["Alho"]["2027"]["delta"] == 0
    assert c["total"]["2027"] == {"a": 150, "b": 170, "delta": 20, "pct": pytest.approx(13.3333, rel=1e-3)}


def test_banco_antigo_com_areas_ganha_lista_de_culturas(tmp_path, monkeypatch):
    """Versões que já tinham áreas lançadas mantêm essas produtos na lista."""
    import sqlite3
    caminho = tmp_path / "antigo.db"
    con = sqlite3.connect(caminho)
    con.executescript("""
    CREATE TABLE versoes(id INTEGER PRIMARY KEY AUTOINCREMENT, ano_base INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'rascunho', horizonte INTEGER NOT NULL DEFAULT 5, origem_id INTEGER, criado_em TEXT NOT NULL,
      aprovado_em TEXT, autor TEXT NOT NULL DEFAULT 'local');
    INSERT INTO versoes(ano_base, tipo, nome, criado_em) VALUES(2027,'orcado','Antigo','x');
    CREATE TABLE culturas(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, grupo TEXT NOT NULL,
      unidade TEXT NOT NULL DEFAULT 'kg', embalagem TEXT NOT NULL DEFAULT '', qtd_por_embalagem REAL NOT NULL DEFAULT 0,
      ativa INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL);
    INSERT INTO culturas(nome, grupo, criado_em) VALUES('Cenoura','Hortifruti','x');
    INSERT INTO culturas(nome, grupo, criado_em) VALUES('Alho','Hortifruti','x');
    CREATE TABLE areas_cultura(versao_id INTEGER NOT NULL, cultura_id INTEGER NOT NULL, ano INTEGER NOT NULL,
      area_ha REAL NOT NULL DEFAULT 0, PRIMARY KEY(versao_id, cultura_id, ano));
    INSERT INTO areas_cultura VALUES(1,1,2027,100);
    """)
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        d = c.get("/api/versoes/1/areas").json()
        assert [x["nome"] for x in d["culturas"]] == ["Cenoura"] and d["culturas"][0]["anos"]["2027"] == 100
        assert [x["nome"] for x in d["adicionaveis"]] == ["Alho"]


def test_cultura_so_em_kg_nao_guarda_peso(api):
    cid = _cult(api, "Sorgo", "Grãos", qtd_por_embalagem=50)      # sem embalagem: a quantidade é ignorada
    c = api.get("/api/culturas").json()["culturas"][0]
    assert c["unidade"] == "kg" and c["embalagem"] == "" and c["qtd_por_embalagem"] == 0 and c["id"] == cid


def test_leite_em_litros_com_embalagem(api):
    _cult(api, "Leite", "Pecuária", unidade="litro", embalagem="Galão", qtd_por_embalagem=50)
    c = api.get("/api/culturas").json()["culturas"][0]
    assert c["unidade"] == "litro" and c["embalagem"] == "Galão" and c["qtd_por_embalagem"] == 50
    r = api.post("/api/culturas", json={"nome": "X", "grupo": "Grãos", "unidade": "tonelada"})
    assert r.status_code == 422 and "kg, litro ou unidade" in r.json()["erro"]
    r = api.post("/api/culturas", json={"nome": "Z", "grupo": "Pecuária", "unidade": "litro", "embalagem": "Galão"})
    assert "litros" in r.json()["erro"]


def test_migra_culturas_da_primeira_versao(tmp_path, monkeypatch):
    import sqlite3
    caminho = tmp_path / "velho.db"
    con = sqlite3.connect(caminho)
    con.executescript("""
    CREATE TABLE culturas(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, grupo TEXT NOT NULL,
      unidade TEXT NOT NULL DEFAULT 'kg', kg_por_unidade REAL NOT NULL DEFAULT 0, ativa INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL);
    INSERT INTO culturas(nome, grupo, unidade, kg_por_unidade, criado_em) VALUES('Cenoura','Hortifruti','caixa',20,'x');
    INSERT INTO culturas(nome, grupo, unidade, kg_por_unidade, criado_em) VALUES('Sorgo','Grãos','kg',0,'x');
    INSERT INTO culturas(nome, grupo, unidade, kg_por_unidade, criado_em) VALUES('Leite','Pecuária','litro',0,'x');
    """)
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        p = {x["nome"]: x for x in c.get("/api/culturas").json()["culturas"]}
        assert (p["Cenoura"]["unidade"], p["Cenoura"]["embalagem"], p["Cenoura"]["qtd_por_embalagem"]) == ("kg", "caixa", 20)
        assert (p["Sorgo"]["unidade"], p["Sorgo"]["embalagem"], p["Sorgo"]["qtd_por_embalagem"]) == ("kg", "", 0)
        assert (p["Leite"]["unidade"], p["Leite"]["embalagem"]) == ("litro", "")


def test_migra_culturas_da_segunda_versao(tmp_path, monkeypatch):
    import sqlite3
    caminho = tmp_path / "meio.db"
    con = sqlite3.connect(caminho)
    con.executescript("""
    CREATE TABLE culturas(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, grupo TEXT NOT NULL,
      embalagem TEXT NOT NULL DEFAULT '', kg_por_embalagem REAL NOT NULL DEFAULT 0, ativa INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL);
    INSERT INTO culturas(nome, grupo, embalagem, kg_por_embalagem, criado_em) VALUES('Soja','Grãos','Saco',60,'x');
    """)
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        x = c.get("/api/culturas").json()["culturas"][0]
        assert (x["unidade"], x["embalagem"], x["qtd_por_embalagem"]) == ("kg", "Saco", 60)
