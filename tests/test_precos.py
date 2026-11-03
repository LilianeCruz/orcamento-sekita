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


def _preco(api, vid, cid, ano, v):
    r = api.put(f"/api/versoes/{vid}/precos-venda/{cid}/{ano}", json={"preco": v})
    assert r.status_code == 200, r.text


def _ler(api, vid):
    return api.get(f"/api/versoes/{vid}/precos-venda").json()


def test_so_culturas_da_lista_de_areas_em_kg_ou_litro(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura", embalagem="Caixa", qtd_por_embalagem=20)
    l = _cult(api, "Leite", "Pecuária", unidade="litro")
    _cult(api, "Alho")                                           # cadastrada, mas fora de Áreas
    assert _ler(api, vid)["culturas"] == []
    _add(api, vid, a); _add(api, vid, l)
    d = {c["nome"]: c for c in _ler(api, vid)["culturas"]}
    assert set(d) == {"Cenoura", "Leite"}
    assert d["Cenoura"]["unidade"] == "kg" and d["Leite"]["unidade"] == "litro"      # preço por kg, não por caixa
    assert d["Cenoura"]["anos"] == {"2027": None, "2028": None, "2029": None, "2030": None}


def test_preco_de_venda_e_independente_do_valor_padrao_de_arrendamentos(api):
    """São coisas apartadas: cada tela tem os seus números."""
    vid = _versao(api)
    soja = _cult(api, "Soja", "Grãos", embalagem="Saco", qtd_por_embalagem=60)
    _add(api, vid, soja)
    fid = api.post(f"/api/versoes/{vid}/fazendas",
                   json={"nome": "F", "tipo": "arrendada", "forma": "produto", "cultura_id": soja}).json()["id"]
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 100, "valor": 40})
    api.put(f"/api/versoes/{vid}/precos", json=[{"cultura_id": soja, "ano": 2027, "preco": 120}])   # valor padrão (R$/saco)
    _preco(api, vid, soja, 2027, 2.5)                                                              # venda (R$/kg)
    assert _ler(api, vid)["culturas"][0]["anos"]["2027"] == 2.5
    arr = api.get(f"/api/versoes/{vid}/arrendamentos").json()
    assert arr["precos"][str(soja)]["2027"] == 120                                                 # arrendamento não mudou
    assert arr["calculo"]["resumo"]["2027"]["custo"] == 100 * 40 * 120
    _preco(api, vid, soja, 2027, 3.0)                                                              # mexer na venda...
    assert api.get(f"/api/versoes/{vid}/arrendamentos").json()["calculo"]["resumo"]["2027"]["custo"] == 100 * 40 * 120   # ...não afeta o arrendamento


def test_lancar_preco_exige_cultura_na_lista(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    r = api.put(f"/api/versoes/{vid}/precos-venda/{a}/2027", json={"preco": 5})
    assert r.status_code == 422 and "Áreas por produto" in r.json()["erro"]
    assert api.put(f"/api/versoes/{vid}/precos-venda/999/2027", json={"preco": 5}).status_code == 404
    _add(api, vid, a)
    assert api.put(f"/api/versoes/{vid}/precos-venda/{a}/2040", json={"preco": 5}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/precos-venda/{a}/2027", json={"preco": -1}).status_code == 422


def test_remover_de_areas_apaga_o_preco_de_venda_mas_nao_o_valor_padrao(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    _preco(api, vid, a, 2027, 55)
    api.put(f"/api/versoes/{vid}/precos", json=[{"cultura_id": a, "ano": 2027, "preco": 7}])
    api.delete(f"/api/versoes/{vid}/areas/culturas/{a}")
    _add(api, vid, a)
    assert _ler(api, vid)["culturas"][0]["anos"]["2027"] is None
    assert api.get(f"/api/versoes/{vid}/arrendamentos").json()["precos"][str(a)]["2027"] == 7


def test_replicar_um_preco(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    assert api.post(f"/api/versoes/{vid}/precos-venda/{a}/replicar", json={"ano": 2027}).status_code == 422   # sem preço na origem
    _preco(api, vid, a, 2028, 4)
    assert api.post(f"/api/versoes/{vid}/precos-venda/{a}/replicar", json={"ano": 2028}).json()["anos_alterados"] == 2
    assert [_ler(api, vid)["culturas"][0]["anos"][str(y)] for y in (2027, 2028, 2029, 2030)] == [None, 4, 4, 4]


def test_replicar_todos_os_precos(api):
    vid = _versao(api)
    a, b, c = _cult(api, "Cenoura"), _cult(api, "Alho"), _cult(api, "Soja", "Grãos")
    for x in (a, b, c):
        _add(api, vid, x)
    _preco(api, vid, a, 2028, 5); _preco(api, vid, b, 2028, 13); _preco(api, vid, a, 2030, 99)
    r = api.post(f"/api/versoes/{vid}/precos-venda/replicar-todas", json={"ano": 2028})
    assert r.json() == {"culturas": 2, "anos_alterados": 2}      # Soja não tem preço em 2028: fica de fora
    d = {x["nome"]: x["anos"] for x in _ler(api, vid)["culturas"]}
    assert [d["Cenoura"][str(y)] for y in (2027, 2028, 2029, 2030)] == [None, 5, 5, 5]
    assert d["Alho"]["2030"] == 13 and d["Soja"]["2030"] is None


def test_replicar_todos_validacoes_e_trava(api):
    vid = _versao(api, h=3)
    assert api.post(f"/api/versoes/{vid}/precos-venda/replicar-todas", json={"ano": 2027}).status_code == 422     # sem culturas
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    assert api.post(f"/api/versoes/{vid}/precos-venda/replicar-todas", json={"ano": 2027}).status_code == 422     # ninguém tem preço
    assert api.post(f"/api/versoes/{vid}/precos-venda/replicar-todas", json={"ano": 2029}).status_code == 422     # último ano
    _preco(api, vid, a, 2027, 10)
    api.post(f"/api/versoes/{vid}/aprovar")
    assert api.post(f"/api/versoes/{vid}/precos-venda/replicar-todas", json={"ano": 2027}).status_code == 409
    assert api.put(f"/api/versoes/{vid}/precos-venda/{a}/2027", json={"preco": 1}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/precos-venda/{a}/replicar", json={"ano": 2027}).status_code == 409


def test_reprojetado_e_comparacao(api):
    vid = _versao(api)
    a = _cult(api, "Cenoura", embalagem="Caixa", qtd_por_embalagem=20)
    _add(api, vid, a)
    _preco(api, vid, a, 2027, 2.5)
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _ler(api, rep)["culturas"][0]["anos"]["2027"] == 2.5
    _preco(api, rep, a, 2027, 3.0)
    assert _ler(api, vid)["culturas"][0]["anos"]["2027"] == 2.5                 # orçado intacto
    c = api.get(f"/api/comparar-precos-venda?a={vid}&b={rep}").json()
    y = c["culturas"]["Cenoura"]["anos"]["2027"]
    assert (y["a"], y["b"], y["delta"]) == (2.5, 3.0, 0.5) and y["pct"] == pytest.approx(20)
    assert c["culturas"]["Cenoura"]["unidade"] == "kg"
    assert c["culturas"]["Cenoura"]["anos"]["2028"]["pct"] is None              # sem preço nos dois: sem %


def test_cultura_com_preco_de_venda_nao_e_excluida_sem_aviso(api):
    """A exclusão é barrada quando o produto está em Áreas (e, portanto, pode ter preço de venda)."""
    vid = _versao(api)
    a = _cult(api, "Cenoura")
    _add(api, vid, a)
    _preco(api, vid, a, 2027, 2)
    assert api.delete(f"/api/culturas/{a}").status_code == 422
