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


def _cult(api, nome, grupo="Hortifruti", **kw):
    r = api.post("/api/culturas", json={"nome": nome, "grupo": grupo, **kw})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _add(api, vid, cid, tela="produtividade"):
    return api.post(f"/api/versoes/{vid}/{'produtividade' if tela == 'produtividade' else 'precos-venda'}/culturas", json={"cultura_id": cid})


def _lista(api, vid, tela="produtividade"):
    return {c["nome"]: c for c in api.get(f"/api/versoes/{vid}/{'produtividade' if tela == 'produtividade' else 'precos-venda'}").json()["culturas"]}


def test_cultura_sem_area_entra_na_produtividade_e_recebe_valores(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária", unidade="kg")
    assert _lista(api, vid) == {}
    assert _add(api, vid, carne).status_code == 200
    c = _lista(api, vid)["Carne"]
    assert c["removivel"] is True and c["grupo"] == "Pecuária" and c["anos"] == {"2027": 0.0, "2028": 0.0, "2029": 0.0}
    assert api.put(f"/api/versoes/{vid}/produtividade/{carne}/2027", json={"valor": 12000}).status_code == 200
    assert _lista(api, vid)["Carne"]["anos"]["2027"] == 12000
    assert api.get(f"/api/versoes/{vid}/areas").json()["culturas"] == []                    # a área continua vazia: ninguém foi plantado


def test_precos_tem_a_sua_propria_lista(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    _add(api, vid, carne, "precos")
    assert "Carne" in _lista(api, vid, "precos") and "Carne" not in _lista(api, vid, "produtividade")           # uma tela não adiciona na outra
    assert api.put(f"/api/versoes/{vid}/precos-venda/{carne}/2027", json={"preco": 18.5}).status_code == 200
    assert _lista(api, vid, "precos")["Carne"]["anos"]["2027"] == 18.5
    assert api.put(f"/api/versoes/{vid}/produtividade/{carne}/2027", json={"valor": 1}).status_code == 422     # não está na lista de produtividade


def test_sem_estar_na_lista_nao_aceita_valor_e_a_mensagem_explica(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    r = api.put(f"/api/versoes/{vid}/produtividade/{carne}/2027", json={"valor": 1})
    assert r.status_code == 422 and "botão +" in r.json()["erro"]


def test_validacoes_ao_adicionar(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    assert _add(api, vid, carne).status_code == 200
    r = _add(api, vid, carne)
    assert r.status_code == 422 and "já está na lista" in r.json()["erro"]
    assert _add(api, vid, 999).status_code == 404
    inativa = _cult(api, "Velha", "Outros")
    api.put(f"/api/culturas/{inativa}", json={"nome": "Velha", "grupo": "Outros", "ativa": False})
    assert _add(api, vid, inativa).status_code == 422
    soja = _cult(api, "Soja", "Grãos")
    api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": soja})
    assert _add(api, vid, soja).status_code == 422                                           # já vem de Áreas por cultura
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert _add(api, vid, _cult(api, "Ovos", "Pecuária")).status_code == 409                # versão travada


def test_disponiveis_nao_traz_o_que_ja_esta_na_lista_nem_inativas(api):
    vid = _versao(api)
    a, b = _cult(api, "A", "Pecuária"), _cult(api, "B", "Pecuária")
    inativa = _cult(api, "Z", "Outros")
    api.put(f"/api/culturas/{inativa}", json={"nome": "Z", "grupo": "Outros", "ativa": False})
    _add(api, vid, a)
    d = api.get(f"/api/versoes/{vid}/produtividade").json()
    assert [x["nome"] for x in d["disponiveis"]] == ["B"] and d["disponiveis"][0]["grupo"] == "Pecuária"
    p = api.get(f"/api/versoes/{vid}/precos-venda").json()
    assert [x["nome"] for x in p["disponiveis"]] == ["B"]                                    # Preços acompanha a Produtividade: A já está lá


def test_remover_so_as_adicionadas_a_mao(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    soja = _cult(api, "Soja", "Grãos")
    api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": soja})
    _add(api, vid, carne)                                                                     # Preços a traz sozinho, vinda da Produtividade
    assert _add(api, vid, carne, "precos").status_code == 422
    api.put(f"/api/versoes/{vid}/produtividade/{carne}/2027", json={"valor": 10})
    api.put(f"/api/versoes/{vid}/precos-venda/{carne}/2027", json={"preco": 5})
    r = api.delete(f"/api/versoes/{vid}/produtividade/culturas/{soja}")
    assert r.status_code == 422 and "Áreas por produto" in r.json()["erro"]
    assert _lista(api, vid)["Soja"]["removivel"] is False
    assert api.delete(f"/api/versoes/{vid}/produtividade/culturas/{carne}").status_code == 200
    assert "Carne" not in _lista(api, vid) and "Carne" not in _lista(api, vid, "precos")      # sai das duas: Preços acompanha a Produtividade
    assert api.delete(f"/api/versoes/{vid}/produtividade/culturas/{carne}").status_code == 422   # já não está
    _add(api, vid, carne)
    assert _lista(api, vid)["Carne"]["anos"]["2027"] == 0                                      # voltou sem valores
    assert _lista(api, vid, "precos")["Carne"]["anos"]["2027"] == 5                           # e o preço que ela tinha volta junto


def test_tirar_da_area_nao_apaga_o_que_foi_adicionado_a_mao(api):
    vid = _versao(api)
    soja = _cult(api, "Soja", "Grãos")
    _add(api, vid, soja)                                                                      # adicionada à mão em Produtividade...
    api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": soja})                 # ...e depois também em Áreas
    api.put(f"/api/versoes/{vid}/produtividade/{soja}/2027", json={"valor": 3000})
    api.put(f"/api/versoes/{vid}/precos-venda/{soja}/2027", json={"preco": 2})
    assert _lista(api, vid)["Soja"]["removivel"] is False                                     # vem de Áreas: só sai de lá
    api.delete(f"/api/versoes/{vid}/areas/culturas/{soja}")
    assert _lista(api, vid)["Soja"]["anos"]["2027"] == 3000 and _lista(api, vid)["Soja"]["removivel"] is True     # a produtividade ficou
    assert _lista(api, vid, "precos")["Soja"]["anos"]["2027"] == 2                            # em Preços ela acompanha a Produtividade: ficou
    outra = _cult(api, "Milho", "Grãos")
    api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": outra})
    api.put(f"/api/versoes/{vid}/produtividade/{outra}/2027", json={"valor": 5000})
    api.delete(f"/api/versoes/{vid}/areas/culturas/{outra}")
    assert "Milho" not in _lista(api, vid)                                                    # regra antiga mantida: quem estava só em Áreas some


def test_replicar_todas_e_reprojetado_e_comparacao_incluem_as_adicionadas(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    _add(api, vid, carne)
    api.put(f"/api/versoes/{vid}/produtividade/{carne}/2027", json={"valor": 100})
    assert api.post(f"/api/versoes/{vid}/produtividade/replicar-todas", json={"ano": 2027}).json() == {"culturas": 1, "anos_alterados": 2}
    assert _lista(api, vid)["Carne"]["anos"]["2029"] == 100
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _lista(api, rep)["Carne"]["anos"]["2029"] == 100 and _lista(api, rep)["Carne"]["removivel"] is True
    api.put(f"/api/versoes/{rep}/produtividade/{carne}/2027", json={"valor": 120})
    c = api.get(f"/api/comparar-produtividade?a={vid}&b={rep}").json()
    assert c["culturas"]["Carne"]["grupo"] == "Pecuária" and c["culturas"]["Carne"]["anos"]["2027"]["delta"] == 20


def test_nao_exclui_cultura_que_foi_adicionada_em_alguma_tela(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    _add(api, vid, carne, "precos")
    assert api.get("/api/culturas").json()["culturas"][0]["em_uso"] is True
    r = api.delete(f"/api/culturas/{carne}")
    assert r.status_code == 422 and "Produtividade ou Preços" in r.json()["erro"]


def test_o_resultado_inclui_o_produto_sem_area_que_tem_produtividade(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    assert api.get(f"/api/versoes/{vid}/resultado").json()["culturas"] == []          # sem produtividade lançada, fica de fora
    _add(api, vid, carne)
    assert [c["nome"] for c in api.get(f"/api/versoes/{vid}/resultado").json()["culturas"]] == ["Carne"]


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
        assert c.get("/api/versoes/1/produtividade").json()["culturas"] == []


def test_precos_traz_sozinho_o_que_tem_produtividade_pecuaria_e_o_leite(api):
    vid = _versao(api)
    carne = _cult(api, "Carne", "Pecuária")
    leite = _cult(api, "Leite", "Pecuária", unidade="litro")
    assert _lista(api, vid, "precos") == {}                                                   # nada lançado ainda
    _add(api, vid, carne)                                                                     # produtividade de um produto da pecuária...
    assert list(_lista(api, vid, "precos")) == ["Carne"]                                      # ...já pede preço
    assert api.put(f"/api/versoes/{vid}/precos-venda/{carne}/2027", json={"preco": 18}).status_code == 200
    api.put(f"/api/versoes/{vid}/pecuaria/animais/2027", json={"valor": 40})                  # produtividade do leite
    api.put(f"/api/versoes/{vid}/pecuaria/kg_animal_dia/2027", json={"valor": 22})
    p = _lista(api, vid, "precos")
    assert sorted(p) == ["Carne", "Leite"] and p["Leite"]["unidade"] == "litro"
    assert api.put(f"/api/versoes/{vid}/precos-venda/{leite}/2027", json={"preco": 2.5}).status_code == 200
