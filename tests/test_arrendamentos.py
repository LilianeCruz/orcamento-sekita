import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.servicos import arrendamentos as svc


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _cultura(api, nome="Soja", embalagem="Saco", qtd=60):
    """Cadastra (uma vez) o produto no cadastro único e devolve o id."""
    cache = api.__dict__.setdefault("_culturas", {})
    if nome not in cache:
        r = api.post("/api/culturas", json={"nome": nome, "grupo": "Grãos", "embalagem": embalagem, "qtd_por_embalagem": qtd})
        assert r.status_code == 200, r.text
        cache[nome] = r.json()["id"]
    return cache[nome]


def _orcado(api, ano=2027):
    return api.post("/api/versoes", json={"ano_base": ano}).json()["id"]


def _fazenda(api, vid, **kw):
    d = {"nome": "Faz A", "tipo": "arrendada", "arrendador": "João", "forma": "reais"}
    d.update(kw)
    r = api.post(f"/api/versoes/{vid}/fazendas", json=d)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------------------------------------------------------- gerador
def test_gerar_parcelas_trimestral_fecha_100():
    p = svc.gerar_parcelas(4, "trimestral", 3)
    assert [x["mes"] for x in p] == [3, 6, 9, 12]
    assert sum(x["percentual"] for x in p) == pytest.approx(100)


def test_gerar_parcelas_absorve_arredondamento():
    p = svc.gerar_parcelas(3, "mensal", 1)
    assert sum(x["percentual"] for x in p) == pytest.approx(100, abs=1e-9)


def test_gerar_parcelas_passa_de_dezembro():
    with pytest.raises(svc.Invalido):
        svc.gerar_parcelas(4, "trimestral", 6)


# ---------------------------------------------------------------- cálculo
def test_arrendamento_em_reais_e_cronograma(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid)
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 100, "valor": 2000})
    api.put(f"/api/fazendas/{fid}/parcelas", json=[{"mes": 3, "percentual": 50}, {"mes": 9, "percentual": 50}])
    r = api.get(f"/api/versoes/{vid}/arrendamentos").json()["calculo"]
    res = r["resumo"]["2027"]
    assert res["custo"] == 200000
    assert res["mensal"][2] == 100000 and res["mensal"][8] == 100000
    assert r["avisos"] == []


def test_arrendamento_em_soja_usa_preco_do_ano(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid, forma="produto", cultura_id=_cultura(api, "Soja"))
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 100, "valor": 40})
    api.put(f"/api/fazendas/{fid}/anos/2028", json={"area_ha": 100, "valor": 40})
    api.put(f"/api/fazendas/{fid}/parcelas", json=[{"mes": 6, "percentual": 100}])
    api.put(f"/api/versoes/{vid}/precos", json=[
        {"cultura_id": _cultura(api, "Soja"), "ano": 2027, "preco": 120}, {"cultura_id": _cultura(api, "Soja"), "ano": 2028, "preco": 130}])
    r = api.get(f"/api/versoes/{vid}/arrendamentos").json()["calculo"]["resumo"]
    assert r["2027"]["sacas"]["Soja"] == 4000
    assert r["2027"]["custo"] == 4000 * 120
    assert r["2028"]["custo"] == 4000 * 130
    assert r["2027"]["mensal"][5] == 480000


def test_falta_preco_gera_aviso(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid, forma="produto", cultura_id=_cultura(api, "Milho"))
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 10, "valor": 20})
    avisos = api.get(f"/api/versoes/{vid}/arrendamentos").json()["calculo"]["avisos"]
    assert any("valor padrão de Milho" in a for a in avisos)


def test_propria_nao_gera_custo_mas_soma_area(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid, nome="Sede", tipo="propria", arrendador="")
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 500, "valor": 999})
    res = api.get(f"/api/versoes/{vid}/arrendamentos").json()["calculo"]["resumo"]["2027"]
    assert res["area_propria"] == 500 and res["area_total"] == 500 and res["custo"] == 0


def test_parcelas_que_nao_fecham_100_geram_aviso_e_impedem_aprovar(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid)
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 10, "valor": 100})
    api.put(f"/api/fazendas/{fid}/parcelas", json=[{"mes": 3, "percentual": 40}, {"mes": 9, "percentual": 40}])
    assert any("somam 80%" in a for a in api.get(f"/api/versoes/{vid}/arrendamentos").json()["calculo"]["avisos"])
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 422


def test_ano_fora_do_horizonte(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid)
    assert api.put(f"/api/fazendas/{fid}/anos/2040", json={"area_ha": 1, "valor": 1}).status_code == 422


def test_mes_repetido_nas_parcelas(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid)
    r = api.put(f"/api/fazendas/{fid}/parcelas", json=[{"mes": 3, "percentual": 50}, {"mes": 3, "percentual": 50}])
    assert r.status_code == 422


# ---------------------------------------------------------------- versões, trava e comparação
def _orcamento_pronto(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid, forma="produto", cultura_id=_cultura(api, "Soja"))
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 100, "valor": 40})
    api.put(f"/api/fazendas/{fid}/parcelas", json=[{"mes": 3, "percentual": 50}, {"mes": 9, "percentual": 50}])
    api.put(f"/api/versoes/{vid}/precos", json=[{"cultura_id": _cultura(api, "Soja"), "ano": 2027, "preco": 120}])
    return vid, fid


def test_aprovado_fica_travado(api):
    vid, fid = _orcamento_pronto(api)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 1, "valor": 1}).status_code == 409
    assert api.put(f"/api/versoes/{vid}/precos", json=[{"cultura_id": _cultura(api, "Soja"), "ano": 2027, "preco": 1}]).status_code == 409
    assert api.delete(f"/api/fazendas/{fid}").status_code == 409
    assert api.post(f"/api/versoes/{vid}/fazendas",
                    json={"nome": "X", "tipo": "propria"}).status_code == 409


def test_reprojetado_copia_e_nao_mexe_no_orcado(api):
    vid, fid = _orcamento_pronto(api)
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={"nome": "Reprojetado 2027"}).json()["id"]
    dados = api.get(f"/api/versoes/{rep}/arrendamentos").json()
    assert dados["versao"]["tipo"] == "reprojetado" and dados["versao"]["status"] == "rascunho"
    fid_rep = dados["fazendas"][0]["id"]
    assert fid_rep != fid
    assert dados["calculo"]["resumo"]["2027"]["custo"] == 100 * 40 * 120

    # altera preço e valor só no reprojetado
    api.put(f"/api/versoes/{rep}/precos", json=[{"cultura_id": _cultura(api, "Soja"), "ano": 2027, "preco": 132}])
    api.put(f"/api/fazendas/{fid_rep}/anos/2027", json={"area_ha": 100, "valor": 42})

    orc = api.get(f"/api/versoes/{vid}/arrendamentos").json()["calculo"]["resumo"]["2027"]
    assert orc["custo"] == 480000
    novo = api.get(f"/api/versoes/{rep}/arrendamentos").json()["calculo"]["resumo"]["2027"]
    assert novo["custo"] == 100 * 42 * 132


def test_comparar_orcado_x_reprojetado(api):
    vid, _ = _orcamento_pronto(api)
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    api.put(f"/api/versoes/{rep}/precos", json=[{"cultura_id": _cultura(api, "Soja"), "ano": 2027, "preco": 132}])
    c = api.get(f"/api/comparar?a={vid}&b={rep}").json()
    custo = c["resumo"]["2027"]["custo"]
    assert custo["a"] == 480000 and custo["b"] == 528000
    assert custo["delta"] == 48000 and custo["pct"] == pytest.approx(10)
    assert c["resumo"]["2027"]["mensal"][2]["delta"] == 24000
    assert c["resumo"]["2027"]["sacas"]["Soja"]["delta"] == 0
    assert c["fazendas"]["Faz A"]["2027"]["custo"]["delta"] == 48000


def test_cultura_usada_em_arrendamento_nao_pode_ser_excluida(api):
    vid, _ = _orcamento_pronto(api)
    r = api.delete(f"/api/culturas/{_cultura(api, 'Soja')}")
    assert r.status_code == 422 and "Arrendamentos" in r.json()["erro"]


def test_fazenda_em_produto_exige_cultura_do_cadastro(api):
    vid = _orcado(api)
    sem = api.post(f"/api/versoes/{vid}/fazendas", json={"nome": "X", "tipo": "arrendada", "forma": "produto"})
    assert sem.status_code == 422 and "Escolha o produto" in sem.json()["erro"]
    inexistente = api.post(f"/api/versoes/{vid}/fazendas",
                           json={"nome": "X", "tipo": "arrendada", "forma": "produto", "cultura_id": 999})
    assert inexistente.status_code == 422
    ok = api.post(f"/api/versoes/{vid}/fazendas",
                  json={"nome": "X", "tipo": "arrendada", "forma": "produto", "cultura_id": _cultura(api, "Soja")})
    assert ok.status_code == 200


def test_preco_so_aceita_cultura_do_cadastro(api):
    vid = _orcado(api)
    r = api.put(f"/api/versoes/{vid}/precos", json=[{"cultura_id": 999, "ano": 2027, "preco": 1}])
    assert r.status_code == 422


def test_leitura_traz_culturas_do_cadastro_com_rotulo(api):
    vid = _orcado(api)
    _cultura(api, "Soja")
    api.post("/api/culturas", json={"nome": "Leite", "grupo": "Pecuária", "unidade": "litro"})
    d = api.get(f"/api/versoes/{vid}/arrendamentos").json()
    rot = {c["nome"]: c["rotulo"] for c in d["culturas"]}
    assert rot == {"Leite": "litro", "Soja": "Saco"}


def test_versao_inexistente(api):
    assert api.get("/api/versoes/999/arrendamentos").status_code == 404


# ---------------------------------------------------------------- horizonte configurável
def test_horizonte_na_criacao_e_alteracao(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 4}).json()["id"]
    assert api.get(f"/api/versoes/{vid}/arrendamentos").json()["anos"] == [2027, 2028, 2029, 2030]
    assert api.put(f"/api/versoes/{vid}/horizonte", json={"horizonte": 6}).status_code == 200
    assert api.get(f"/api/versoes/{vid}/arrendamentos").json()["anos"][-1] == 2032
    assert api.put(f"/api/versoes/{vid}/horizonte", json={"horizonte": 0}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/horizonte", json={"horizonte": 99}).status_code == 422


def test_horizonte_aprovado_nao_muda_e_reprojetado_herda(api):
    vid, _ = _orcamento_pronto(api)
    api.put(f"/api/versoes/{vid}/horizonte", json={"horizonte": 3})
    api.post(f"/api/versoes/{vid}/aprovar")
    assert api.put(f"/api/versoes/{vid}/horizonte", json={"horizonte": 5}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert api.get(f"/api/versoes/{rep}/arrendamentos").json()["anos"] == [2027, 2028, 2029]


def test_reduzir_horizonte_nao_perde_dados(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 5}).json()["id"]
    fid = _fazenda(api, vid)
    api.put(f"/api/fazendas/{fid}/anos/2030", json={"area_ha": 10, "valor": 100})
    api.put(f"/api/versoes/{vid}/horizonte", json={"horizonte": 2})
    assert api.put(f"/api/fazendas/{fid}/anos/2030", json={"area_ha": 1, "valor": 1}).status_code == 422
    api.put(f"/api/versoes/{vid}/horizonte", json={"horizonte": 5})
    d = api.get(f"/api/versoes/{vid}/arrendamentos").json()
    assert d["fazendas"][0]["anos"]["2030"]["area_ha"] == 10


# ---------------------------------------------------------------- replicar
def test_replicar_fazenda_area_e_valor(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 4}).json()["id"]
    fid = _fazenda(api, vid)
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 100, "valor": 2000})
    api.put(f"/api/fazendas/{fid}/anos/2029", json={"area_ha": 999, "valor": 999})
    r = api.post(f"/api/fazendas/{fid}/replicar", json={"ano": 2027, "campos": ["area_ha", "valor"]})
    assert r.json()["anos_alterados"] == 3
    anos = api.get(f"/api/versoes/{vid}/arrendamentos").json()["fazendas"][0]["anos"]
    assert all(anos[str(a)] == {"area_ha": 100, "valor": 2000} for a in (2027, 2028, 2029, 2030))


def test_replicar_so_valor_preserva_area(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid)
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 100, "valor": 2000})
    api.put(f"/api/fazendas/{fid}/anos/2028", json={"area_ha": 80, "valor": 1})
    api.post(f"/api/fazendas/{fid}/replicar", json={"ano": 2027, "campos": ["valor"]})
    anos = api.get(f"/api/versoes/{vid}/arrendamentos").json()["fazendas"][0]["anos"]
    assert anos["2028"] == {"area_ha": 80, "valor": 2000}


def test_replicar_do_meio_nao_toca_anos_anteriores(api):
    vid = _orcado(api)
    fid = _fazenda(api, vid)
    api.put(f"/api/fazendas/{fid}/anos/2027", json={"area_ha": 1, "valor": 1})
    api.put(f"/api/fazendas/{fid}/anos/2028", json={"area_ha": 50, "valor": 60})
    api.post(f"/api/fazendas/{fid}/replicar", json={"ano": 2028, "campos": ["area_ha", "valor"]})
    anos = api.get(f"/api/versoes/{vid}/arrendamentos").json()["fazendas"][0]["anos"]
    assert anos["2027"] == {"area_ha": 1, "valor": 1} and anos["2031"] == {"area_ha": 50, "valor": 60}


def test_replicar_validacoes_e_trava(api):
    vid, fid = _orcamento_pronto(api)
    assert api.post(f"/api/fazendas/{fid}/replicar", json={"ano": 2027, "campos": []}).status_code == 422
    assert api.post(f"/api/fazendas/{fid}/replicar", json={"ano": 2040, "campos": ["valor"]}).status_code == 422
    api.post(f"/api/versoes/{vid}/aprovar")
    assert api.post(f"/api/fazendas/{fid}/replicar", json={"ano": 2027, "campos": ["valor"]}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/precos/replicar", json={"cultura_id": _cultura(api, "Soja"), "ano": 2027}).status_code == 409


def test_replicar_preco(api):
    vid, _ = _orcamento_pronto(api)
    r = api.post(f"/api/versoes/{vid}/precos/replicar", json={"cultura_id": _cultura(api, "Soja"), "ano": 2027})
    assert r.json()["anos_alterados"] == 4
    precos = api.get(f"/api/versoes/{vid}/arrendamentos").json()["precos"][str(_cultura(api, "Soja"))]
    assert all(precos[str(a)] == 120 for a in range(2027, 2032))
    assert api.post(f"/api/versoes/{vid}/precos/replicar", json={"cultura_id": _cultura(api, "Milho"), "ano": 2027}).status_code == 422


def test_migracao_de_banco_antigo_sem_horizonte(tmp_path, monkeypatch):
    import sqlite3
    caminho = tmp_path / "antigo.db"
    con = sqlite3.connect(caminho)
    con.executescript("""
    CREATE TABLE versoes(id INTEGER PRIMARY KEY AUTOINCREMENT, ano_base INTEGER NOT NULL,
      tipo TEXT NOT NULL, nome TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'rascunho',
      origem_id INTEGER, criado_em TEXT NOT NULL, aprovado_em TEXT, autor TEXT NOT NULL DEFAULT 'local');
    INSERT INTO versoes(ano_base, tipo, nome, criado_em) VALUES(2027,'orcado','Antigo','2026-01-01');
    """)
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        v = c.get("/api/versoes").json()
        assert v[0]["nome"] == "Antigo" and v[0]["horizonte"] == 5
        assert c.get(f"/api/versoes/{v[0]['id']}/arrendamentos").json()["anos"] == [2027, 2028, 2029, 2030, 2031]


def test_migra_produtos_de_arrendamentos_para_culturas(tmp_path, monkeypatch):
    """Produtos digitados à mão em Arrendamentos viram produtos e os preços/fazendas são preservados."""
    import sqlite3
    caminho = tmp_path / "antes.db"
    con = sqlite3.connect(caminho)
    con.executescript("""
    CREATE TABLE versoes(id INTEGER PRIMARY KEY AUTOINCREMENT, ano_base INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'rascunho', horizonte INTEGER NOT NULL DEFAULT 5, origem_id INTEGER, criado_em TEXT NOT NULL,
      aprovado_em TEXT, autor TEXT NOT NULL DEFAULT 'local');
    CREATE TABLE fazendas(id INTEGER PRIMARY KEY AUTOINCREMENT, versao_id INTEGER NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL,
      arrendador TEXT NOT NULL DEFAULT '', forma TEXT NOT NULL DEFAULT 'reais', produto TEXT NOT NULL DEFAULT '',
      observacao TEXT NOT NULL DEFAULT '');
    CREATE TABLE fazenda_anos(fazenda_id INTEGER NOT NULL, ano INTEGER NOT NULL, area_ha REAL NOT NULL DEFAULT 0,
      valor REAL NOT NULL DEFAULT 0, PRIMARY KEY(fazenda_id, ano));
    CREATE TABLE parcelas(fazenda_id INTEGER NOT NULL, mes INTEGER NOT NULL, percentual REAL NOT NULL, PRIMARY KEY(fazenda_id, mes));
    CREATE TABLE precos(versao_id INTEGER NOT NULL, produto TEXT NOT NULL, ano INTEGER NOT NULL, preco REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(versao_id, produto, ano));
    CREATE TABLE culturas(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE COLLATE NOCASE, grupo TEXT NOT NULL,
      unidade TEXT NOT NULL DEFAULT 'kg', embalagem TEXT NOT NULL DEFAULT '', qtd_por_embalagem REAL NOT NULL DEFAULT 0,
      ativa INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL);
    INSERT INTO culturas(nome, grupo, embalagem, qtd_por_embalagem, criado_em) VALUES('soja','Grãos','Saco',60,'x');
    INSERT INTO versoes(ano_base, tipo, nome, criado_em) VALUES(2027,'orcado','Orçamento 2027','x');
    INSERT INTO fazendas(versao_id, nome, tipo, forma, produto) VALUES(1,'Fazenda 1','arrendada','produto','Milho');
    INSERT INTO fazendas(versao_id, nome, tipo, forma, produto) VALUES(1,'Fazenda 2','arrendada','produto','Soja');
    INSERT INTO fazendas(versao_id, nome, tipo, forma) VALUES(1,'Sede','propria','reais');
    INSERT INTO fazenda_anos VALUES(1,2027,150,40);
    INSERT INTO fazenda_anos VALUES(2,2027,100,10);
    INSERT INTO precos VALUES(1,'Milho',2027,78);
    INSERT INTO precos VALUES(1,'Soja',2027,47);
    INSERT INTO precos VALUES(1,'Sorgo',2027,29);
    """)
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        culturas = {x["nome"].lower(): x for x in c.get("/api/culturas").json()["culturas"]}
        assert set(culturas) == {"soja", "milho", "sorgo"}                 # Soja reaproveitada, as outras criadas
        assert culturas["soja"]["qtd_por_embalagem"] == 60                 # cadastro existente não foi alterado
        assert culturas["milho"]["embalagem"] == "Saco"
        d = c.get("/api/versoes/1/arrendamentos").json()
        assert {f["nome"]: f["cultura_nome"].lower() for f in d["fazendas"]} == {"Fazenda 1": "milho", "Fazenda 2": "soja", "Sede": ""}
        precos = {culturas[n]["id"]: v for n, v in (("milho", 78), ("soja", 47), ("sorgo", 29))}
        assert {int(k): v["2027"] for k, v in d["precos"].items()} == precos
        # o cálculo continua igual: 150 ha x 40 sacas x R$ 78
        assert d["calculo"]["resumo"]["2027"]["custo"] == 150 * 40 * 78 + 100 * 10 * 47
