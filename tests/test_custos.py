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


def _areas(api, vid, nome="Cenoura", grupo="Hortifruti"):
    """Produto que será plantado (está em Áreas por produto); ele já aparece em Custos variáveis, sem rubricas."""
    cid = api.post("/api/culturas", json={"nome": nome, "grupo": grupo}).json()["id"]
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": cid}).status_code == 200
    return cid


def _cult(api, vid, nome="Cenoura", grupo="Hortifruti"):
    cid = _areas(api, vid, nome, grupo)             # entrar em Áreas já coloca o produto em Custos variáveis
    assert api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": cid}).status_code == 422     # logo, já está lá
    return cid


def _grupo(api, nome="Insumos", classificacao="direto", **kw):
    r = api.post("/api/grupos-custo", json={"nome": nome, "classificacao": classificacao, **kw})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _add(api, vid, cid, gid):
    r = api.post(f"/api/versoes/{vid}/custos/{cid}/grupos", json={"grupo_id": gid})
    assert r.status_code == 200, r.text


def _custo(api, vid, cid, gid, ano, v):
    r = api.put(f"/api/versoes/{vid}/custos/{cid}/{gid}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _ler(api, vid):
    return api.get(f"/api/versoes/{vid}/custos").json()


def _cultura(d, nome):
    return next(c for c in d["culturas"] if c["nome"] == nome)


# ---------------------------------------------------------------- estrutura
def test_produtos_de_areas_entram_sozinhos_e_os_demais_ficam_para_escolher(api):
    vid = _versao(api)
    api.post("/api/culturas", json={"nome": "Leite", "grupo": "Pecuária"})               # cadastrado, sem área
    d = _ler(api, vid)
    assert d["culturas"] == [] and [c["nome"] for c in d["culturas_escolhiveis"]] == ["Leite"] and d["total_culturas_areas"] == 1
    _areas(api, vid, "Cenoura"); _areas(api, vid, "Soja", "Grãos")
    d = _ler(api, vid)
    assert [c["nome"] for c in d["culturas"]] == ["Soja", "Cenoura"] and all(c["grupos"] == [] for c in d["culturas"])    # vêm sem rubricas
    assert [c["nome"] for c in d["culturas_escolhiveis"]] == ["Leite"]


def test_escolher_um_produto_sem_area_cria_o_quadro_dele(api):
    vid = _versao(api)
    _areas(api, vid, "Cenoura")
    leite = api.post("/api/culturas", json={"nome": "Leite", "grupo": "Pecuária", "unidade": "litro"}).json()["id"]
    assert api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": leite}).status_code == 200
    d = _ler(api, vid)
    assert sorted(c["nome"] for c in d["culturas"]) == ["Cenoura", "Leite"] and d["culturas_escolhiveis"] == []
    assert api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": leite}).status_code == 422     # já está


def test_aceita_produto_sem_area_mas_nao_inativo_nem_inexistente(api):
    vid = _versao(api)
    alho = api.post("/api/culturas", json={"nome": "Alho", "grupo": "Hortifruti"}).json()["id"]
    assert api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": alho}).status_code == 200
    inativo = api.post("/api/culturas", json={"nome": "Milho", "grupo": "Grãos", "ativa": False}).json()["id"]
    r = api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": inativo})
    assert r.status_code == 422 and "inativo" in r.json()["erro"]
    assert api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": 999}).status_code == 404


def test_apagar_o_produto_limpa_rubricas_e_valores_mas_ele_continua_com_area(api):
    vid = _versao(api)
    cid, g = _cult(api, vid), _grupo(api)
    _add(api, vid, cid, g); _custo(api, vid, cid, g, 2027, 50)
    assert api.delete(f"/api/versoes/{vid}/custos/culturas/{cid}").status_code == 200
    d = _ler(api, vid)
    assert _cultura(d, "Cenoura")["grupos"] == [] and d["culturas_escolhiveis"] == []        # continua (tem área), zerada
    assert api.delete(f"/api/versoes/{vid}/custos/culturas/999").status_code == 404


def test_pecuaria_e_leite_entram_sozinhos_quando_tem_produtividade(api):
    vid = _versao(api)
    carne = api.post("/api/culturas", json={"nome": "Carne", "grupo": "Pecuária"}).json()["id"]
    leite = api.post("/api/culturas", json={"nome": "Leite", "grupo": "Pecuária", "unidade": "litro"}).json()["id"]
    assert _ler(api, vid)["culturas"] == []
    api.post(f"/api/versoes/{vid}/produtividade/culturas", json={"cultura_id": carne})        # produtividade pecuária
    assert [c["nome"] for c in _ler(api, vid)["culturas"]] == ["Carne"]
    api.put(f"/api/versoes/{vid}/pecuaria/animais/2027", json={"valor": 10})                  # produtividade do leite
    assert sorted(c["nome"] for c in _ler(api, vid)["culturas"]) == ["Carne", "Leite"]
    g = _grupo(api)
    _add(api, vid, leite, g)                                                                  # dá para lançar rubricas neles
    assert [x["nome"] for x in _cultura(_ler(api, vid), "Leite")["grupos"]] == ["Insumos"]


def test_grupo_so_entra_em_cultura_ja_escolhida(api):
    vid = _versao(api)
    cid, g = api.post("/api/culturas", json={"nome": "Cenoura", "grupo": "Hortifruti"}).json()["id"], _grupo(api)
    r = api.post(f"/api/versoes/{vid}/custos/{cid}/grupos", json={"grupo_id": g})
    assert r.status_code == 422 and "Adicione Cenoura em Custos variáveis" in r.json()["erro"]


def test_adicionar_grupo_cria_uma_linha_zerada(api):
    vid = _versao(api)
    cid, gid = _cult(api, vid), _grupo(api, "Insumos")
    assert _cultura(_ler(api, vid), "Cenoura")["grupos"] == []
    _add(api, vid, cid, gid)
    g = _cultura(_ler(api, vid), "Cenoura")["grupos"]
    assert [(x["nome"], x["classificacao"]) for x in g] == [("Insumos", "direto")]
    assert g[0]["anos"] == {"2027": 0, "2028": 0, "2029": 0, "2030": 0}


def test_grupos_adicionaveis_so_os_ativos_que_ainda_nao_estao_na_cultura(api):
    vid = _versao(api)
    cid = _cult(api, vid)
    a, b, c = _grupo(api, "Insumos"), _grupo(api, "Energia", "indireto"), _grupo(api, "Antigo", ativa=False)
    assert [x["nome"] for x in _cultura(_ler(api, vid), "Cenoura")["adicionaveis"]] == ["Insumos", "Energia"]     # diretos primeiro
    _add(api, vid, cid, a)
    assert [x["nome"] for x in _cultura(_ler(api, vid), "Cenoura")["adicionaveis"]] == ["Energia"]
    assert api.post(f"/api/versoes/{vid}/custos/{cid}/grupos", json={"grupo_id": c}).status_code == 422      # inativo


def test_mesmo_grupo_em_cada_cultura_e_diretos_antes_dos_indiretos(api):
    vid = _versao(api)
    cen, alho = _cult(api, vid, "Cenoura"), _cult(api, vid, "Alho")
    ins, mo, adm = _grupo(api, "Insumos"), _grupo(api, "Mão de obra"), _grupo(api, "Administrativo", "indireto")
    for g in (adm, mo, ins):
        _add(api, vid, cen, g)
    _add(api, vid, alho, ins)
    d = _ler(api, vid)
    assert [g["nome"] for g in _cultura(d, "Cenoura")["grupos"]] == ["Insumos", "Mão de obra", "Administrativo"]
    assert [g["nome"] for g in _cultura(d, "Alho")["grupos"]] == ["Insumos"]
    assert api.post(f"/api/versoes/{vid}/custos/{cen}/grupos", json={"grupo_id": ins}).status_code == 422     # repetido na mesma cultura


def test_adicionar_valida_cultura_e_grupo(api):
    vid = _versao(api)
    alho = api.post("/api/culturas", json={"nome": "Alho", "grupo": "Hortifruti"}).json()["id"]   # fora de Áreas e de Custos
    g = _grupo(api)
    r = api.post(f"/api/versoes/{vid}/custos/{alho}/grupos", json={"grupo_id": g})
    assert r.status_code == 422 and "Custos variáveis" in r.json()["erro"]
    cid = _cult(api, vid)
    assert api.post(f"/api/versoes/{vid}/custos/{cid}/grupos", json={"grupo_id": 999}).status_code == 404
    assert api.post(f"/api/versoes/{vid}/custos/999/grupos", json={"grupo_id": g}).status_code == 404


# ---------------------------------------------------------------- valores e totais
def test_lancar_custo_exige_o_grupo_na_cultura_e_valida(api):
    vid = _versao(api, h=2)
    cid, g = _cult(api, vid), _grupo(api)
    r = api.put(f"/api/versoes/{vid}/custos/{cid}/{g}/2027", json={"valor": 10})
    assert r.status_code == 422 and "Adicione" in r.json()["erro"]
    _add(api, vid, cid, g)
    assert api.put(f"/api/versoes/{vid}/custos/{cid}/{g}/2030", json={"valor": 10}).status_code == 422       # fora do horizonte
    assert api.put(f"/api/versoes/{vid}/custos/{cid}/{g}/2027", json={"valor": -1}).status_code == 422


def test_totais_direto_indireto_e_custo_total_com_a_area(api):
    vid = _versao(api)
    cid = _cult(api, vid)
    ins, mo, adm = _grupo(api, "Insumos"), _grupo(api, "Mão de obra"), _grupo(api, "Administrativo", "indireto")
    for g, v in ((ins, 9000), (mo, 3000), (adm, 500)):
        _add(api, vid, cid, g); _custo(api, vid, cid, g, 2027, v)
    api.put(f"/api/versoes/{vid}/areas/{cid}/2027", json={"area_ha": 100})
    c = _cultura(_ler(api, vid), "Cenoura")
    assert (c["totais"]["direto"]["2027"], c["totais"]["indireto"]["2027"], c["totais"]["total"]["2027"]) == (12000, 500, 12500)
    assert c["area_ha"]["2027"] == 100 and c["custo_total"]["2027"] == 1250000                          # R$/ha x hectares
    assert c["totais"]["total"]["2028"] == 0 and c["custo_total"]["2028"] == 0


def test_reclassificar_o_grupo_muda_os_totais(api):
    vid = _versao(api)
    cid, g = _cult(api, vid), _grupo(api, "Insumos", "direto")
    _add(api, vid, cid, g); _custo(api, vid, cid, g, 2027, 100)
    api.put(f"/api/grupos-custo/{g}", json={"nome": "Insumos", "classificacao": "indireto"})
    t = _cultura(_ler(api, vid), "Cenoura")["totais"]
    assert (t["direto"]["2027"], t["indireto"]["2027"]) == (0, 100)


# ---------------------------------------------------------------- replicar e remover
def test_replicar_uma_linha_e_todas(api):
    vid = _versao(api)
    cen, alho = _cult(api, vid, "Cenoura"), _cult(api, vid, "Alho")
    a, b = _grupo(api, "Insumos"), _grupo(api, "Energia", "indireto")
    for cid, g in ((cen, a), (cen, b), (alho, a)):
        _add(api, vid, cid, g)
    _custo(api, vid, cen, a, 2028, 100); _custo(api, vid, cen, b, 2028, 20); _custo(api, vid, alho, a, 2028, 7); _custo(api, vid, cen, a, 2030, 999)
    assert api.post(f"/api/versoes/{vid}/custos/{cen}/{a}/replicar", json={"ano": 2028}).json()["anos_alterados"] == 2
    d = _ler(api, vid)
    ins = next(g for g in _cultura(d, "Cenoura")["grupos"] if g["nome"] == "Insumos")
    assert [ins["anos"][str(y)] for y in (2027, 2028, 2029, 2030)] == [0, 100, 100, 100]
    assert next(g for g in _cultura(d, "Cenoura")["grupos"] if g["nome"] == "Energia")["anos"]["2029"] == 0       # outra linha não mudou
    r = api.post(f"/api/versoes/{vid}/custos/replicar-todos", json={"ano": 2028})
    assert r.json() == {"linhas": 3, "anos_alterados": 2}
    d = _ler(api, vid)
    assert _cultura(d, "Alho")["grupos"][0]["anos"]["2030"] == 7
    assert _cultura(d, "Cenoura")["totais"]["total"]["2029"] == 120


def test_replicar_validacoes(api):
    vid = _versao(api, h=3)
    assert api.post(f"/api/versoes/{vid}/custos/replicar-todos", json={"ano": 2027}).status_code == 422       # nada lançado
    cid, g = _cult(api, vid), _grupo(api)
    _add(api, vid, cid, g)
    assert api.post(f"/api/versoes/{vid}/custos/replicar-todos", json={"ano": 2029}).status_code == 422       # último ano
    assert api.post(f"/api/versoes/{vid}/custos/{cid}/{g}/replicar", json={"ano": 2040}).status_code == 422


def test_remover_grupo_apaga_os_valores_dele(api):
    vid = _versao(api)
    cid, a, b = _cult(api, vid), _grupo(api, "Insumos"), _grupo(api, "Energia", "indireto")
    for g in (a, b):
        _add(api, vid, cid, g); _custo(api, vid, cid, g, 2027, 50)
    assert api.delete(f"/api/versoes/{vid}/custos/{cid}/grupos/{a}").status_code == 200
    c = _cultura(_ler(api, vid), "Cenoura")
    assert [g["nome"] for g in c["grupos"]] == ["Energia"] and c["totais"]["total"]["2027"] == 50
    _add(api, vid, cid, a)                                                                                    # volta zerado
    assert next(g for g in _cultura(_ler(api, vid), "Cenoura")["grupos"] if g["nome"] == "Insumos")["anos"]["2027"] == 0


def test_remover_cultura_de_areas_apaga_os_custos_dela(api):
    vid = _versao(api)
    cid, g = _cult(api, vid), _grupo(api)
    _add(api, vid, cid, g); _custo(api, vid, cid, g, 2027, 50)
    api.delete(f"/api/versoes/{vid}/areas/culturas/{cid}")
    d = _ler(api, vid)
    assert d["culturas"] == [] and [c["nome"] for c in d["culturas_escolhiveis"]] == ["Cenoura"]          # sai daqui e volta como opção
    api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": cid})
    d = _ler(api, vid)
    assert d["culturas_escolhiveis"] == [] and _cultura(d, "Cenoura")["grupos"] == []                       # volta sozinha, sem rubricas


def test_grupo_em_uso_nao_pode_ser_excluido(api):
    vid = _versao(api)
    cid, g = _cult(api, vid), _grupo(api)
    _add(api, vid, cid, g)
    r = api.delete(f"/api/grupos-custo/{g}")
    assert r.status_code == 422 and "Custos variáveis" in r.json()["erro"]
    api.delete(f"/api/versoes/{vid}/custos/{cid}/grupos/{g}")
    assert api.delete(f"/api/grupos-custo/{g}").status_code == 200


# ---------------------------------------------------------------- versões
def test_travada_reprojetado_copia_e_comparacao(api):
    vid = _versao(api)
    cid, g = _cult(api, vid), _grupo(api, "Insumos")
    _add(api, vid, cid, g); _custo(api, vid, cid, g, 2027, 1000)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/custos/{cid}/{g}/2027", json={"valor": 1}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/custos/{cid}/{g}/replicar", json={"ano": 2027}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/custos/replicar-todos", json={"ano": 2027}).status_code == 409
    assert api.delete(f"/api/versoes/{vid}/custos/{cid}/grupos/{g}").status_code == 409
    assert api.delete(f"/api/versoes/{vid}/custos/culturas/{cid}").status_code == 409
    outro = _grupo(api, "Energia", "indireto")
    assert api.post(f"/api/versoes/{vid}/custos/{cid}/grupos", json={"grupo_id": outro}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _cultura(_ler(api, rep), "Cenoura")["grupos"][0]["anos"]["2027"] == 1000
    _custo(api, rep, cid, g, 2027, 1200)
    _add(api, rep, cid, outro); _custo(api, rep, cid, outro, 2027, 80)
    assert _cultura(_ler(api, vid), "Cenoura")["totais"]["total"]["2027"] == 1000                           # orçado intacto
    c = api.get(f"/api/comparar-custos?a={vid}&b={rep}").json()
    assert c["culturas"]["Cenoura"]["total"]["2027"] == {"a": 1000, "b": 1280, "delta": 280, "pct": pytest.approx(28)}
    assert c["culturas"]["Cenoura"]["grupos"]["Insumos"]["2027"]["delta"] == 200
    assert c["culturas"]["Cenoura"]["grupos"]["Energia"]["2027"] == {"a": 0, "b": 80, "delta": 80, "pct": None}   # grupo só no reprojetado


def test_banco_antigo_ganha_as_tabelas_de_custos(tmp_path, monkeypatch):
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
        assert c.get("/api/versoes/1/custos").json()["culturas"] == []


def test_travada_nao_aceita_escolher_cultura_e_reprojetado_copia_as_escolhidas(api):
    vid = _versao(api)
    cen = _cult(api, vid, "Cenoura")
    soja = api.post("/api/culturas", json={"nome": "Soja", "grupo": "Grãos"}).json()["id"]          # cadastrada, sem área
    api.post(f"/api/versoes/{vid}/aprovar")
    assert api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": soja}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    d = _ler(api, rep)
    assert [c["nome"] for c in d["culturas"]] == ["Cenoura"] and [c["nome"] for c in d["culturas_escolhiveis"]] == ["Soja"]
    assert api.post(f"/api/versoes/{rep}/custos/culturas", json={"cultura_id": soja}).status_code == 200      # só no reprojetado
    assert [c["nome"] for c in _ler(api, vid)["culturas"]] == ["Cenoura"]


# ---------------------------------------------------------------- adicionar a rubrica para todas as culturas
def test_adicionar_rubrica_para_todas_as_culturas(api):
    vid = _versao(api)
    cen, alho, soja = _cult(api, vid, "Cenoura"), _cult(api, vid, "Alho"), _cult(api, vid, "Soja", "Grãos")
    milho = _areas(api, vid, "Milho", "Grãos")                                   # em Áreas: entra sozinho em Custos
    api.post("/api/culturas", json={"nome": "Leite", "grupo": "Pecuária"})        # cadastrado, mas ninguém o escolheu
    ins, adm = _grupo(api, "Insumos"), _grupo(api, "Administrativo", "indireto")
    _add(api, vid, alho, ins); _custo(api, vid, alho, ins, 2027, 777)             # Alho já tinha Insumos, com valor
    r = api.post(f"/api/versoes/{vid}/custos/grupos-todas", json={"grupo_id": ins})
    assert r.json() == {"adicionadas": 3, "ja_tinham": 1}
    d = _ler(api, vid)
    for nome in ("Cenoura", "Alho", "Soja", "Milho"):
        assert [g["nome"] for g in _cultura(d, nome)["grupos"]] == ["Insumos"]
    assert _cultura(d, "Alho")["grupos"][0]["anos"]["2027"] == 777                # o que já existia não foi mexido
    assert _cultura(d, "Cenoura")["grupos"][0]["anos"]["2027"] == 0               # as novas entram zeradas
    assert all(c["nome"] != "Leite" for c in d["culturas"])                       # produto não escolhido não entra
    # repetir não duplica
    assert api.post(f"/api/versoes/{vid}/custos/grupos-todas", json={"grupo_id": ins}).json() == {"adicionadas": 0, "ja_tinham": 4}
    # a rubrica deixa de ser oferecida nas culturas
    assert all(a["nome"] != "Insumos" for c in d["culturas"] for a in c["adicionaveis"])
    assert api.post(f"/api/versoes/{vid}/custos/grupos-todas", json={"grupo_id": adm}).json()["adicionadas"] == 4
    assert milho


def test_adicionar_para_todos_validacoes_e_trava(api):
    vid = _versao(api)
    g = _grupo(api)
    r = api.post(f"/api/versoes/{vid}/custos/grupos-todas", json={"grupo_id": g})
    assert r.status_code == 422 and "pelo menos um produto" in r.json()["erro"]
    _cult(api, vid)
    inativo = _grupo(api, "Antigo", ativa=False)
    assert api.post(f"/api/versoes/{vid}/custos/grupos-todas", json={"grupo_id": inativo}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/custos/grupos-todas", json={"grupo_id": 999}).status_code == 404
    api.post(f"/api/versoes/{vid}/aprovar")
    assert api.post(f"/api/versoes/{vid}/custos/grupos-todas", json={"grupo_id": g}).status_code == 409
