import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _versao(api, h=4):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": h}).json()["id"]


def _areas(api, vid, nome="Cenoura", grupo="Hortifruti", **kw):
    cid = api.post("/api/culturas", json={"nome": nome, "grupo": grupo, **kw}).json()["id"]
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": cid}).status_code == 200
    return cid


def _cult(api, vid, nome="Cenoura", grupo="Hortifruti", **kw):
    cid = _areas(api, vid, nome, grupo, **kw)
    assert api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": cid}).status_code == 200
    return cid


def _add(api, vid, cid, tipo):
    r = api.post(f"/api/versoes/{vid}/premissas/{cid}/tipos", json={"tipo": tipo})
    assert r.status_code == 200, r.text


def _valor(api, vid, cid, tipo, ano, v):
    r = api.put(f"/api/versoes/{vid}/premissas/{cid}/{tipo}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _ler(api, vid):
    return api.get(f"/api/versoes/{vid}/premissas").json()


def _cultura(d, nome):
    return next(c for c in d["culturas"] if c["nome"] == nome)


def _linha(d, cultura, tipo):
    return next(p for p in _cultura(d, cultura)["premissas"] if p["tipo"] == tipo)


# ---------------------------------------------------------------- os quatro tipos
def test_catalogo_com_os_quatro_tipos_pedidos(api):
    d = _ler(api, _versao(api))
    assert [t["nome"] for t in d["tipos"]] == ["% dedução de receita", "% descarte", "Quantidade estocada", "Sementes salvas"]
    assert [t["natureza"] for t in d["tipos"]] == ["pct", "pct", "qtd", "qtd"]


# ---------------------------------------------------------------- escolher a cultura (só as de Áreas)
def test_tela_comeca_vazia_e_oferece_so_as_culturas_de_areas(api):
    vid = _versao(api)
    api.post("/api/culturas", json={"nome": "Alho", "grupo": "Hortifruti"})                # não será plantada
    _areas(api, vid, "Cenoura"); _areas(api, vid, "Soja", "Grãos")
    d = _ler(api, vid)
    assert d["culturas"] == [] and [c["nome"] for c in d["culturas_escolhiveis"]] == ["Soja", "Cenoura"] and d["total_culturas_areas"] == 2


def test_escolher_e_remover_a_cultura(api):
    vid = _versao(api)
    cen = _areas(api, vid)
    assert api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": cen}).status_code == 200
    d = _ler(api, vid)
    assert [c["nome"] for c in d["culturas"]] == ["Cenoura"] and d["culturas"][0]["premissas"] == [] and d["culturas_escolhiveis"] == []
    assert api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": cen}).status_code == 422          # já está
    _add(api, vid, cen, "descarte"); _valor(api, vid, cen, "descarte", 2027, 5)
    assert api.delete(f"/api/versoes/{vid}/premissas/culturas/{cen}").status_code == 200
    d = _ler(api, vid)
    assert d["culturas"] == [] and [c["nome"] for c in d["culturas_escolhiveis"]] == ["Cenoura"]
    api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": cen})
    assert _cultura(_ler(api, vid), "Cenoura")["premissas"] == []                                                  # volta zerada


def test_nao_aceita_cultura_fora_de_areas(api):
    vid = _versao(api)
    alho = api.post("/api/culturas", json={"nome": "Alho", "grupo": "Hortifruti"}).json()["id"]
    r = api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": alho})
    assert r.status_code == 422 and "área ou produtividade" in r.json()["erro"]
    assert api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": 999}).status_code == 404


# ---------------------------------------------------------------- vincular o tipo de premissa
def test_vincular_tipo_cria_linha_zerada_na_ordem_do_catalogo(api):
    vid = _versao(api)
    cid = _cult(api, vid)
    for t in ("sementes", "descarte", "estoque"):
        _add(api, vid, cid, t)
    d = _ler(api, vid)
    assert [p["nome"] for p in _cultura(d, "Cenoura")["premissas"]] == ["% descarte", "Quantidade estocada", "Sementes salvas"]
    assert _linha(d, "Cenoura", "descarte")["anos"] == {"2027": 0, "2028": 0, "2029": 0, "2030": 0}
    assert [a["tipo"] for a in _cultura(d, "Cenoura")["adicionaveis"]] == ["deducao_receita"]                     # o que falta vincular
    assert api.post(f"/api/versoes/{vid}/premissas/{cid}/tipos", json={"tipo": "descarte"}).status_code == 422     # repetido


def test_unidade_do_tipo_segue_a_natureza_e_a_medida_da_cultura(api):
    vid = _versao(api)
    a, l = _cult(api, vid, "Cenoura"), _cult(api, vid, "Leite", "Pecuária", unidade="litro")
    for cid in (a, l):
        for t in ("descarte", "estoque"):
            _add(api, vid, cid, t)
    d = _ler(api, vid)
    assert _linha(d, "Cenoura", "descarte")["unidade"] == "%" and _linha(d, "Cenoura", "estoque")["unidade"] == "kg"
    assert _linha(d, "Leite", "descarte")["unidade"] == "%" and _linha(d, "Leite", "estoque")["unidade"] == "litro"


def test_tipo_invalido_e_cultura_nao_escolhida(api):
    vid = _versao(api)
    fora = _areas(api, vid)
    r = api.post(f"/api/versoes/{vid}/premissas/{fora}/tipos", json={"tipo": "descarte"})
    assert r.status_code == 422 and "Adicione Cenoura em Premissas de produtos" in r.json()["erro"]
    cid = _cult(api, vid, "Soja", "Grãos")
    assert api.post(f"/api/versoes/{vid}/premissas/{cid}/tipos", json={"tipo": "inventado"}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/premissas/999/tipos", json={"tipo": "descarte"}).status_code == 404


# ---------------------------------------------------------------- valores
def test_lancar_valores_e_validar(api):
    vid = _versao(api, h=2)
    cid = _cult(api, vid)
    r = api.put(f"/api/versoes/{vid}/premissas/{cid}/descarte/2027", json={"valor": 5})
    assert r.status_code == 422 and "Vincule % descarte a Cenoura" in r.json()["erro"]
    for t in ("descarte", "deducao_receita", "estoque"):
        _add(api, vid, cid, t)
    _valor(api, vid, cid, "descarte", 2027, 12.5)
    assert _linha(_ler(api, vid), "Cenoura", "descarte")["anos"]["2027"] == 12.5
    assert api.put(f"/api/versoes/{vid}/premissas/{cid}/descarte/2027", json={"valor": 100.5}).status_code == 422     # percentual até 100
    assert api.put(f"/api/versoes/{vid}/premissas/{cid}/deducao_receita/2027", json={"valor": 100}).status_code == 200
    assert api.put(f"/api/versoes/{vid}/premissas/{cid}/descarte/2027", json={"valor": -1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/premissas/{cid}/descarte/2030", json={"valor": 1}).status_code == 422           # fora do horizonte
    _valor(api, vid, cid, "estoque", 2027, 250000)                                                                      # quantidade não tem teto de 100
    assert _linha(_ler(api, vid), "Cenoura", "estoque")["anos"]["2027"] == 250000


# ---------------------------------------------------------------- adicionar para todas, replicar, remover
def test_adicionar_tipo_para_todas_as_culturas(api):
    vid = _versao(api)
    cen, alho, soja = _cult(api, vid, "Cenoura"), _cult(api, vid, "Alho"), _cult(api, vid, "Soja", "Grãos")
    _areas(api, vid, "Milho", "Grãos")                                              # em Áreas, mas não escolhida aqui
    _add(api, vid, alho, "descarte"); _valor(api, vid, alho, "descarte", 2027, 9)
    r = api.post(f"/api/versoes/{vid}/premissas/tipos-todas", json={"tipo": "descarte"})
    assert r.json() == {"adicionadas": 2, "ja_tinham": 1}
    d = _ler(api, vid)
    assert all([p["tipo"] for p in _cultura(d, n)["premissas"]] == ["descarte"] for n in ("Cenoura", "Alho", "Soja"))
    assert _linha(d, "Alho", "descarte")["anos"]["2027"] == 9 and _linha(d, "Cenoura", "descarte")["anos"]["2027"] == 0
    assert all(c["nome"] != "Milho" for c in d["culturas"])
    assert api.post(f"/api/versoes/{vid}/premissas/tipos-todas", json={"tipo": "descarte"}).json() == {"adicionadas": 0, "ja_tinham": 3}
    assert api.post(f"/api/versoes/{vid}/premissas/tipos-todas", json={"tipo": "nada"}).status_code == 422
    assert cen and soja


def test_adicionar_para_todas_sem_culturas(api):
    vid = _versao(api)
    r = api.post(f"/api/versoes/{vid}/premissas/tipos-todas", json={"tipo": "descarte"})
    assert r.status_code == 422 and "pelo menos um produto" in r.json()["erro"]


def test_replicar_uma_linha_e_todas(api):
    vid = _versao(api)
    cen, alho = _cult(api, vid, "Cenoura"), _cult(api, vid, "Alho")
    for cid, t in ((cen, "descarte"), (cen, "estoque"), (alho, "descarte")):
        _add(api, vid, cid, t)
    _valor(api, vid, cen, "descarte", 2028, 4); _valor(api, vid, cen, "estoque", 2028, 800); _valor(api, vid, alho, "descarte", 2028, 6)
    _valor(api, vid, cen, "descarte", 2030, 99)
    assert api.post(f"/api/versoes/{vid}/premissas/{cen}/descarte/replicar", json={"ano": 2028}).json()["anos_alterados"] == 2
    d = _ler(api, vid)
    assert [_linha(d, "Cenoura", "descarte")["anos"][str(y)] for y in (2027, 2028, 2029, 2030)] == [0, 4, 4, 4]
    assert _linha(d, "Cenoura", "estoque")["anos"]["2029"] == 0                                     # outra linha não mudou
    assert api.post(f"/api/versoes/{vid}/premissas/replicar-todas", json={"ano": 2028}).json() == {"linhas": 3, "anos_alterados": 2}
    d = _ler(api, vid)
    assert _linha(d, "Cenoura", "estoque")["anos"]["2030"] == 800 and _linha(d, "Alho", "descarte")["anos"]["2029"] == 6


def test_replicar_validacoes(api):
    vid = _versao(api, h=3)
    assert api.post(f"/api/versoes/{vid}/premissas/replicar-todas", json={"ano": 2027}).status_code == 422       # nada lançado
    cid = _cult(api, vid)
    _add(api, vid, cid, "descarte")
    assert api.post(f"/api/versoes/{vid}/premissas/replicar-todas", json={"ano": 2029}).status_code == 422       # último ano
    assert api.post(f"/api/versoes/{vid}/premissas/{cid}/descarte/replicar", json={"ano": 2040}).status_code == 422


def test_remover_o_tipo_apaga_os_valores_dele(api):
    vid = _versao(api)
    cid = _cult(api, vid)
    _add(api, vid, cid, "descarte"); _add(api, vid, cid, "estoque")
    _valor(api, vid, cid, "descarte", 2027, 5); _valor(api, vid, cid, "estoque", 2027, 70)
    assert api.delete(f"/api/versoes/{vid}/premissas/{cid}/tipos/descarte").status_code == 200
    d = _ler(api, vid)
    assert [p["tipo"] for p in _cultura(d, "Cenoura")["premissas"]] == ["estoque"]
    _add(api, vid, cid, "descarte")
    assert _linha(_ler(api, vid), "Cenoura", "descarte")["anos"]["2027"] == 0                    # volta zerado


def test_remover_cultura_de_areas_apaga_as_premissas_dela(api):
    vid = _versao(api)
    cid = _cult(api, vid)
    _add(api, vid, cid, "descarte"); _valor(api, vid, cid, "descarte", 2027, 5)
    api.delete(f"/api/versoes/{vid}/areas/culturas/{cid}")
    assert _ler(api, vid)["culturas"] == [] and _ler(api, vid)["culturas_escolhiveis"] == []
    api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": cid})
    api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": cid})
    assert _cultura(_ler(api, vid), "Cenoura")["premissas"] == []


# ---------------------------------------------------------------- versões
def test_travada_reprojetado_copia_e_comparacao(api):
    vid = _versao(api)
    cid = _cult(api, vid)
    _add(api, vid, cid, "descarte"); _valor(api, vid, cid, "descarte", 2027, 10)
    soja = api.post("/api/culturas", json={"nome": "Soja", "grupo": "Grãos"}).json()["id"]
    api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": soja})
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    for chamada in (
        lambda: api.put(f"/api/versoes/{vid}/premissas/{cid}/descarte/2027", json={"valor": 1}),
        lambda: api.post(f"/api/versoes/{vid}/premissas/{cid}/tipos", json={"tipo": "estoque"}),
        lambda: api.post(f"/api/versoes/{vid}/premissas/tipos-todas", json={"tipo": "estoque"}),
        lambda: api.delete(f"/api/versoes/{vid}/premissas/{cid}/tipos/descarte"),
        lambda: api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": soja}),
        lambda: api.delete(f"/api/versoes/{vid}/premissas/culturas/{cid}"),
        lambda: api.post(f"/api/versoes/{vid}/premissas/replicar-todas", json={"ano": 2027}),
        lambda: api.post(f"/api/versoes/{vid}/premissas/{cid}/descarte/replicar", json={"ano": 2027}),
    ):
        assert chamada().status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    d = _ler(api, rep)
    assert _linha(d, "Cenoura", "descarte")["anos"]["2027"] == 10 and [c["nome"] for c in d["culturas_escolhiveis"]] == ["Soja"]
    _valor(api, rep, cid, "descarte", 2027, 12)
    _add(api, rep, cid, "estoque"); _valor(api, rep, cid, "estoque", 2027, 300)
    assert _linha(_ler(api, vid), "Cenoura", "descarte")["anos"]["2027"] == 10                       # orçado intacto
    c = api.get(f"/api/comparar-premissas?a={vid}&b={rep}").json()
    y = c["culturas"]["Cenoura"]["% descarte"]
    assert y["unidade"] == "%" and y["anos"]["2027"] == {"a": 10, "b": 12, "delta": 2, "pct": pytest.approx(20)}
    assert c["culturas"]["Cenoura"]["Quantidade estocada"]["anos"]["2027"] == {"a": 0, "b": 300, "delta": 300, "pct": None}


def test_banco_antigo_ganha_as_tabelas_de_premissas(tmp_path, monkeypatch):
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
        assert c.get("/api/versoes/1/premissas").json()["culturas"] == []
