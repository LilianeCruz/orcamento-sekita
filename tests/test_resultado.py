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


def _cultura(api, vid, nome="Cenoura", grupo="Hortifruti", **kw):
    cid = api.post("/api/culturas", json={"nome": nome, "grupo": grupo, **kw}).json()["id"]
    assert api.post(f"/api/versoes/{vid}/areas/culturas", json={"cultura_id": cid}).status_code == 200
    return cid


def _serie(api, url_fn, vid, cid, valores, chave="valor", **extra):
    for ano, v in valores.items():
        r = api.put(url_fn(vid, cid, ano), json={chave: v, **extra})
        assert r.status_code == 200, r.text


def _area(api, vid, cid, v):
    _serie(api, lambda vid, cid, a: f"/api/versoes/{vid}/areas/{cid}/{a}", vid, cid, v, "area_ha")


def _prod(api, vid, cid, v):
    _serie(api, lambda vid, cid, a: f"/api/versoes/{vid}/produtividade/{cid}/{a}", vid, cid, v)


def _preco(api, vid, cid, v):
    _serie(api, lambda vid, cid, a: f"/api/versoes/{vid}/precos-venda/{cid}/{a}", vid, cid, v, "preco")


def _premissa(api, vid, cid, tipo, v):
    api.post(f"/api/versoes/{vid}/premissas/culturas", json={"cultura_id": cid})
    api.post(f"/api/versoes/{vid}/premissas/{cid}/tipos", json={"tipo": tipo})
    _serie(api, lambda vid, cid, a: f"/api/versoes/{vid}/premissas/{cid}/{tipo}/{a}", vid, cid, v)


def _custo(api, vid, cid, nome, classificacao, v):
    g = api.post("/api/grupos-custo", json={"nome": nome, "classificacao": classificacao}).json()["id"]
    api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": cid})
    api.post(f"/api/versoes/{vid}/custos/{cid}/grupos", json={"grupo_id": g})
    _serie(api, lambda vid, cid, a: f"/api/versoes/{vid}/custos/{cid}/{g}/{a}", vid, cid, v)


def _res(api, vid):
    return api.get(f"/api/versoes/{vid}/resultado").json()


def _linha(r, cultura, bloco, id_):
    c = r["consolidado"] if cultura is None else next(x for x in r["culturas"] if x["nome"] == cultura)
    return next(l for l in c[bloco] if l["id"] == id_)["valores"]


def _v(r, cultura, bloco, id_, ano):
    return _linha(r, cultura, bloco, id_)[str(ano)]


def cenario(api):
    """Cenoura, 10 ha, 1.000 kg/ha. Preço 2/3/4; descarte 10/20/0 %; dedução 5 %; estocada 2.000 kg em 2027; sementes 500 kg em 2027.
    Custo direto R$ 500/ha (e um indireto de R$ 999/ha que NÃO deve entrar)."""
    vid = _versao(api)
    cid = _cultura(api, vid)
    anos = (2027, 2028, 2029)
    _area(api, vid, cid, {a: 10 for a in anos}); _prod(api, vid, cid, {a: 1000 for a in anos})
    _preco(api, vid, cid, {2027: 2, 2028: 3, 2029: 4})
    _premissa(api, vid, cid, "descarte", {2027: 10, 2028: 20, 2029: 0})
    _premissa(api, vid, cid, "deducao_receita", {a: 5 for a in anos})
    _premissa(api, vid, cid, "estoque", {2027: 2000, 2028: 0, 2029: 0})
    _premissa(api, vid, cid, "sementes", {2027: 500, 2028: 0, 2029: 0})
    _custo(api, vid, cid, "Insumos", "direto", {a: 500 for a in anos})
    _custo(api, vid, cid, "Administrativo", "indireto", {a: 999 for a in anos})
    return vid, cid


# ---------------------------------------------------------------- resultado da safra (R$ mil)
def test_resultado_da_safra_2027(api):
    vid, _ = cenario(api)
    r = _res(api, vid)
    assert _v(r, "Cenoura", "safra", "producao", 2027) == 10000
    assert _v(r, "Cenoura", "safra", "sementes", 2027) == 500
    assert _v(r, "Cenoura", "safra", "perda_safra", 2027) == pytest.approx(1000)          # descarte de 10 % sobre a produção
    assert _v(r, "Cenoura", "safra", "comerc_safra", 2027) == pytest.approx(8500)         # 10.000 - 1.000 de descarte - 500 de sementes (sementes DEPOIS do descarte)
    assert _v(r, "Cenoura", "safra", "receita_bruta_safra", 2027) == pytest.approx(17.0)  # 8.500 kg x R$ 2 = R$ 17.000
    assert _v(r, "Cenoura", "safra", "deducoes_safra", 2027) == pytest.approx(-0.85)
    assert _v(r, "Cenoura", "safra", "receita_liquida_safra", 2027) == pytest.approx(16.15)
    assert _v(r, "Cenoura", "safra", "custo_total", 2027) == pytest.approx(-4.75)          # R$ 500/ha x 10 ha = R$ 5.000, descontada a semente: x 9.500/10.000
    assert _v(r, "Cenoura", "safra", "margem_contribuicao", 2027) == pytest.approx(11.4)
    assert _v(r, "Cenoura", "safra", "receita_ha", 2027) == pytest.approx(1615.0)          # R$/ha (não em mil)
    assert _v(r, "Cenoura", "safra", "margem_ha", 2027) == pytest.approx(1140.0)
    assert _v(r, "Cenoura", "safra", "margem_contribuicao_pct", 2027) == pytest.approx(11.4 / 16.15 * 100)


def test_custos_indiretos_nao_entram(api):
    vid, _ = cenario(api)
    assert _v(_res(api, vid), "Cenoura", "safra", "custo_ha", 2028) == 500                 # e não 1.499


# ---------------------------------------------------------------- resultado anual, com estoque
def test_resultado_anual_2027_com_estoque_e_sementes(api):
    vid, _ = cenario(api)
    r = _res(api, vid)
    a = lambda i: _v(r, "Cenoura", "anual", i, 2027)
    assert a("producao_anual") == 9500                                                    # disponível: 10.000 - 500 de sementes
    assert (a("estocada"), a("estoque_pct")) == (2000, pytest.approx(2000 / 9500 * 100))
    assert a("vendida_pct") == pytest.approx(100 - 2000 / 9500 * 100)
    assert a("perda") == pytest.approx(800)                                               # descarte de 10 % sobre os 8.000 kg brutos que vão à venda
    assert a("comercializada") == pytest.approx(6700)                                     # 8.000 - 800 - 500 de sementes
    assert a("receita_producao") == pytest.approx(13.4) and a("receita_estoque") == 0
    assert a("receita_bruta_anual") == pytest.approx(13.4)
    assert a("deducoes_anual") == pytest.approx(-0.67)
    assert a("receita_liquida_anual") == pytest.approx(12.73)
    assert a("custo_medio") == pytest.approx(0.5)                                          # R$/kg: custo total / volume produzido (10.000 kg)
    assert a("cpv_producao") == pytest.approx(-(9500 - 2000) * 0.5 / 1000)
    assert a("cpv") == pytest.approx(-3.75)
    assert a("margem_bruta") == pytest.approx(12.73 - 3.75)
    e = lambda i: _v(r, "Cenoura", "estoque", i, 2027)
    assert e("estoque_valor") == pytest.approx(2000 * 0.5 / 1000)                          # estoque a custo médio
    assert e("estoque_semente") == pytest.approx(500 * 0.5 / 1000)
    assert (e("vendida_anterior"), e("vendida_corrente"), e("comerc_total")) == (0, pytest.approx(6700), pytest.approx(6700))


def test_o_estoque_e_vendido_no_ano_seguinte_com_a_deducao_e_o_preco_do_ano_da_venda(api):
    vid, _ = cenario(api)
    r = _res(api, vid)
    a = lambda i: _v(r, "Cenoura", "anual", i, 2028)
    assert (a("producao_anual"), a("estocada")) == (10000, 0)
    assert a("perda") == pytest.approx(2400)                                              # 20 % de descarte de 2028 sobre TUDO que é vendido em 2028 (12.000 kg)
    assert a("comercializada") == pytest.approx(8000)                                     # produção do ano: 10.000 x 0,8
    assert a("receita_producao") == pytest.approx(24.0)                                   # 8.000 x R$ 3
    assert a("receita_estoque") == pytest.approx(4.8)                                     # 2.000 x 0,8 x R$ 3: preço e descarte de 2028
    assert a("receita_bruta_anual") == pytest.approx(28.8)
    assert a("deducoes_anual") == pytest.approx(-1.44)                                    # 5 % sobre a receita bruta do ano da venda
    assert a("receita_liquida_anual") == pytest.approx(27.36)
    assert a("custo_medio") == pytest.approx(0.5)
    assert a("cpv_producao") == pytest.approx(-5.0)
    assert a("cpv_estoque") == pytest.approx(-2000 * 0.5 / 1000)                           # custo médio de 2027, o ano em que foi produzido
    assert a("custo_semente_ant") == pytest.approx(-500 * 0.5 / 1000)                      # semente salva em 2027
    assert a("margem_bruta") == pytest.approx(27.36 - 5.0 - 1.0)
    e = lambda i: _v(r, "Cenoura", "estoque", i, 2028)
    assert e("estoque_valor") == 0 and e("vendida_anterior") == 2000


def test_ultimo_ano_sem_estoque_nem_descarte(api):
    vid, _ = cenario(api)
    a = lambda i: _v(_res(api, vid), "Cenoura", "anual", i, 2029)
    assert a("comercializada") == 10000 and a("perda") == 0 and a("receita_bruta_anual") == pytest.approx(40.0)
    assert a("receita_liquida_anual") == pytest.approx(38.0) and a("margem_bruta") == pytest.approx(33.0)
    assert _v(_res(api, vid), "Cenoura", "anual", "margem_bruta_pct", 2029) == pytest.approx(33 / 38 * 100)


def test_estoque_inicial_e_zero(api):
    vid, _ = cenario(api)
    assert _v(_res(api, vid), "Cenoura", "estoque", "vendida_anterior", 2027) == 0


def test_o_estoque_que_sai_de_um_ano_e_o_que_entra_no_seguinte(api):
    vid, _ = cenario(api)
    r = _res(api, vid)
    est = [_v(r, "Cenoura", "anual", "estocada", a) for a in (2027, 2028, 2029)]
    ant = [_v(r, "Cenoura", "estoque", "vendida_anterior", a) for a in (2027, 2028, 2029)]
    assert ant[1:] == est[:-1]


# ---------------------------------------------------------------- avisos, limites e exclusões
def test_estocada_maior_que_a_disponivel_e_limitada_com_aviso(api):
    vid = _versao(api, h=1)
    cid = _cultura(api, vid)
    _area(api, vid, cid, {2027: 1}); _prod(api, vid, cid, {2027: 100}); _preco(api, vid, cid, {2027: 1})
    _premissa(api, vid, cid, "estoque", {2027: 999})
    r = _res(api, vid)
    assert _v(r, "Cenoura", "anual", "estocada", 2027) == 100 and _v(r, "Cenoura", "anual", "comercializada", 2027) == 0
    assert any("estocada é maior que a disponível" in a for a in r["avisos"])


def test_sementes_maiores_que_a_producao_nao_deixam_negativo(api):
    vid = _versao(api, h=1)
    cid = _cultura(api, vid)
    _area(api, vid, cid, {2027: 1}); _prod(api, vid, cid, {2027: 100})
    _premissa(api, vid, cid, "sementes", {2027: 500})
    assert _v(_res(api, vid), "Cenoura", "safra", "comerc_safra", 2027) == 0


def test_premissa_ou_preco_faltando_assume_zero_e_avisa(api):
    vid = _versao(api, h=2)
    cid = _cultura(api, vid)
    _area(api, vid, cid, {2027: 10, 2028: 10}); _prod(api, vid, cid, {2027: 1000})        # sem produtividade em 2028, sem preço, sem custo
    r = _res(api, vid)
    avisos = " | ".join(r["avisos"])
    assert "falta a produtividade em 2028" in avisos and "falta o preço de venda em 2027, 2028" in avisos
    assert "falta o custo variável direto em 2027, 2028" in avisos
    assert "sem a premissa % descarte" in avisos and "sem a premissa % dedução de receita" in avisos
    assert _v(r, "Cenoura", "safra", "receita_bruta_safra", 2027) == 0 and _v(r, "Cenoura", "safra", "margem_contribuicao", 2027) == 0


def test_cultura_sem_area_nao_gera_aviso(api):
    vid = _versao(api)
    _cultura(api, vid)
    assert _res(api, vid)["avisos"] == []


def _produto(api, nome, grupo, **kw):
    """Produto cadastrado, mas sem entrar em Áreas (como os da pecuária)."""
    return api.post("/api/culturas", json={"nome": nome, "grupo": grupo, **kw}).json()["id"]


def test_pecuaria_so_entra_quando_tem_produtividade(api):
    vid = _versao(api)
    _produto(api, "Leite", "Pecuária", unidade="litro")                    # cadastrado, mas sem produtividade lançada
    _cultura(api, vid, "Soja", "Grãos")
    assert [c["nome"] for c in _res(api, vid)["culturas"]] == ["Soja"]


def test_produto_da_pecuaria_usa_a_quantidade_e_o_custo_por_unidade(api):
    vid = _versao(api, h=1)
    gado = _produto(api, "Gado de corte", "Pecuária")
    api.post(f"/api/versoes/{vid}/produtividade/culturas", json={"cultura_id": gado})
    _prod(api, vid, gado, {2027: 1000})                                    # 1.000 kg produzidos no ano (sem área)
    _preco(api, vid, gado, {2027: 10})                                     # R$ 10 por kg
    api.post(f"/api/versoes/{vid}/custos/culturas", json={"cultura_id": gado}); _custo(api, vid, gado, "Ração", "direto", {2027: 2})   # R$ 2 por kg produzido
    r = _res(api, vid)
    assert [c["nome"] for c in r["culturas"]] == ["Gado de corte"]
    assert _v(r, "Gado de corte", "anual", "receita_bruta_anual", 2027) == pytest.approx(10.0)      # 1.000 kg x R$ 10 = R$ 10 mil
    assert _v(r, "Gado de corte", "anual", "cpv", 2027) == pytest.approx(-2.0)                      # 1.000 kg x R$ 2 = R$ 2 mil


def test_leite_usa_a_producao_anual_do_bloco_de_animais(api):
    vid = _versao(api, h=1)
    leite = _produto(api, "Leite", "Pecuária", unidade="litro")
    api.put(f"/api/versoes/{vid}/pecuaria/animais/2027", json={"valor": 10})
    api.put(f"/api/versoes/{vid}/pecuaria/kg_animal_dia/2027", json={"valor": 20})      # 10 animais x 20 por dia x 365
    _preco(api, vid, leite, {2027: 2})
    r = _res(api, vid)
    assert [c["nome"] for c in r["culturas"]] == ["Leite"]
    assert _v(r, "Leite", "anual", "receita_bruta_anual", 2027) == pytest.approx(10 * 20 * 365 * 2 / 1000)


def test_so_calcula_culturas_de_areas(api):
    vid = _versao(api)
    api.post("/api/culturas", json={"nome": "Alho", "grupo": "Hortifruti"})
    assert _res(api, vid)["culturas"] == [] and _res(api, vid)["consolidado"] == {"safra": [], "anual": [], "estoque": []}


def test_unidade_litro_aparece_nas_quantidades(api):
    vid = _versao(api, h=1)
    cid = _cultura(api, vid, "Suco", "Outros", unidade="litro")
    _area(api, vid, cid, {2027: 1}); _prod(api, vid, cid, {2027: 100})
    linhas = {l["id"]: l for l in next(c for c in _res(api, vid)["culturas"] if c["nome"] == "Suco")["safra"]}
    assert linhas["producao"]["unidade"] == "litro" and linhas["preco"]["unidade"] == "R$/litro"


# ---------------------------------------------------------------- consolidado e versões
def test_consolidado_soma_as_culturas(api):
    vid, _ = cenario(api)
    soja = _cultura(api, vid, "Soja", "Grãos")
    anos = (2027, 2028, 2029)
    _area(api, vid, soja, {a: 100 for a in anos}); _prod(api, vid, soja, {a: 50 for a in anos}); _preco(api, vid, soja, {a: 2 for a in anos})
    _custo(api, vid, soja, "Sementes", "direto", {a: 10 for a in anos})
    r = _res(api, vid)
    assert [c["nome"] for c in r["culturas"]] == ["Soja", "Cenoura"]
    assert _v(r, None, "safra", "area", 2027) == 110
    assert _v(r, None, "safra", "receita_bruta_safra", 2027) == pytest.approx(17.0 + 10.0)        # Soja: 5.000 kg x R$ 2 = R$ 10 mil
    assert _v(r, None, "safra", "margem_contribuicao", 2027) == pytest.approx(11.4 + (10.0 - 1.0))
    assert _v(r, None, "anual", "receita_bruta_anual", 2028) == pytest.approx(28.8 + 10.0)
    assert not any(l["id"] in ("producao", "preco") for l in r["consolidado"]["safra"])            # sem quantidades misturadas


def test_comparar_orcado_x_reprojetado(api):
    vid, cid = cenario(api)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    _preco(api, rep, cid, {2029: 5})                                                       # 4 -> 5 em 2029
    c = api.get(f"/api/comparar-resultado?a={vid}&b={rep}").json()
    y = c["resultados"]["Cenoura"]["Receita bruta anual"]["2029"]
    assert y["a"] == pytest.approx(40) and y["b"] == pytest.approx(50) and y["delta"] == pytest.approx(10) and y["pct"] == pytest.approx(25)
    assert c["resultados"]["Todos os produtos"]["Receita bruta anual"]["2029"]["delta"] == pytest.approx(10)
    assert c["resultados"]["Cenoura"]["Receita bruta anual"]["2027"]["delta"] == 0
    assert c["unidade"] == "R$ mil"


def test_banco_antigo_sem_dados(tmp_path, monkeypatch):
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
        assert c.get("/api/versoes/1/resultado").json()["culturas"] == []


def test_safra_e_anual_fecham_juntos_com_sementes_e_estoque(api):
    """Sem estoque, o anual tem de dar a mesma quantidade e a mesma receita da safra; com estoque, a diferença é só o que foi guardado."""
    vid, _ = cenario(api)
    r = _res(api, vid)
    for ano in (2028, 2029):                                                              # sem estocada nem sementes em 2028/29... 2028 ainda recebe o estoque de 2027
        pass
    assert _v(r, "Cenoura", "anual", "comercializada", 2029) == _v(r, "Cenoura", "safra", "comerc_safra", 2029)
    assert _v(r, "Cenoura", "anual", "receita_bruta_anual", 2029) == pytest.approx(_v(r, "Cenoura", "safra", "receita_bruta_safra", 2029))
    # 2027: a safra vende 8.500; o anual guarda 2.000 (brutos) e fica com 6.700 -> 1.800 a menos = 2.000 x (1 - 10 %)
    assert _v(r, "Cenoura", "safra", "comerc_safra", 2027) - _v(r, "Cenoura", "anual", "comercializada", 2027) == pytest.approx(1800)


# ---------------------------------------------------------------- medida "unidade" (uni)
def test_cultura_medida_em_unidade_usa_uni_em_todas_as_telas(api):
    assert api.post("/api/culturas", json={"nome": "X", "grupo": "Outros", "unidade": "caixa"}).status_code == 422
    r = api.post("/api/culturas", json={"nome": "X", "grupo": "Outros", "unidade": "uni", "embalagem": "Caixa", "qtd_por_embalagem": 0})
    assert r.status_code == 422 and "unidades" in r.json()["erro"]                          # embalagem exige a quantidade, dita em unidades
    vid = _versao(api, h=1)
    cid = _cultura(api, vid, "Mudas", "Outros", unidade="uni", embalagem="Bandeja", qtd_por_embalagem=50)
    assert [c["unidade"] for c in api.get("/api/culturas").json()["culturas"] if c["nome"] == "Mudas"] == ["uni"]
    _area(api, vid, cid, {2027: 10}); _prod(api, vid, cid, {2027: 1000}); _preco(api, vid, cid, {2027: 2})
    assert api.get(f"/api/versoes/{vid}/produtividade").json()["culturas"][0]["unidade"] == "uni"
    assert api.get(f"/api/versoes/{vid}/precos-venda").json()["culturas"][0]["unidade"] == "uni"
    r = _res(api, vid)
    ln = {l["id"]: l for l in r["culturas"][0]["safra"]}
    assert ln["produtividade"]["unidade"] == "uni/ha" and ln["producao"]["unidade"] == "uni" and ln["preco"]["unidade"] == "R$/uni"
    assert _v(r, "Mudas", "safra", "receita_bruta_safra", 2027) == pytest.approx(20.0)         # 10.000 uni x R$ 2 = R$ 20 mil
    assert api.put(f"/api/culturas/{cid}", json={"nome": "Mudas", "grupo": "Outros", "unidade": "kg"}).status_code == 200


def _gado(api, h=2):
    """Gado de corte com estoque em gado: 100 cabeças (R$ 200 mil) no início; em 2027 compra 100, morrem 10 e vendem 150; custo do ano R$ 300 mil (a compra)."""
    vid = _versao(api, h=h)
    gado = _produto(api, "Gado de corte", "Pecuária", unidade="uni", estoque_destino="gado")
    api.post(f"/api/versoes/{vid}/produtividade/culturas", json={"cultura_id": gado})
    _preco(api, vid, gado, {2027: 3000, 2028: 3500})
    _custo(api, vid, gado, "Compra de animais", "direto", {2027: 300000, 2028: 0})
    for campo, ano, v in (("saldo_ini", 2027, 100), ("valor_ini", 2027, 200000), ("compras", 2027, 100), ("mortes", 2027, 10), ("vendas", 2027, 150), ("vendas", 2028, 40)):
        assert api.put(f"/api/versoes/{vid}/rebanho/{gado}/{campo}/{ano}", json={"valor": v}).status_code == 200
    return vid, gado


def test_rebanho_calcula_custo_medio_cpv_e_estoque(api):
    vid, gado = _gado(api)
    r = _res(api, vid)
    assert [c["rebanho"] for c in r["culturas"]] == [True]
    assert _v(r, "Gado de corte", "anual", "receita_bruta_anual", 2027) == pytest.approx(450.0)      # 150 cab x R$ 3.000
    assert _v(r, "Gado de corte", "anual", "cpv", 2027) == pytest.approx(-400.0)                     # (150 vendidas + 10 mortas) x custo médio R$ 2.500
    assert _v(r, "Gado de corte", "estoque", "estoque_valor", 2027) == pytest.approx(100.0)          # 40 cab x R$ 2.500
    assert _v(r, "Gado de corte", "estoque", "reb_fim", 2027) == 40 and _v(r, "Gado de corte", "estoque", "reb_ini", 2028) == 40
    assert _v(r, "Gado de corte", "anual", "cpv", 2028) == pytest.approx(-100.0)                     # as 40 cabeças restantes, ao mesmo custo médio
    assert _v(r, "Gado de corte", "estoque", "estoque_valor", 2028) == 0
    assert r["consolidado"]["estoque"][-1]["id"] == "estoque_valor_gado"


def test_rebanho_tela_so_deixa_digitar_o_saldo_inicial_no_primeiro_ano(api):
    vid, gado = _gado(api)
    d = api.get(f"/api/versoes/{vid}/rebanho").json()
    linhas = {l["id"]: l for l in d["produtos"][0]["linhas"]}
    assert linhas["saldo_fim"]["valores"]["2027"] == 40 and linhas["saldo_ini"]["valores"]["2028"] == 40
    assert linhas["saldo_ini"]["editavel"] == {"2027": True, "2028": False} and linhas["vendas"]["editavel"] == {"2027": True, "2028": True}
    assert linhas["custos"]["valores"]["2027"] == 300000 and linhas["custo_medio"]["valores"]["2027"] == 2500
    assert api.put(f"/api/versoes/{vid}/rebanho/{gado}/saldo_ini/2028", json={"valor": 5}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/rebanho/{gado}/vendas/2027", json={"valor": -1}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/rebanho/{gado}/vendas/replicar", json={"ano": 2027}).json()["anos_alterados"] == 1
    outro = _produto(api, "Soja", "Grãos")
    assert api.put(f"/api/versoes/{vid}/rebanho/{outro}/vendas/2027", json={"valor": 1}).status_code == 422      # só produto com estoque em gado


def test_rebanho_limita_vendas_ao_disponivel_e_o_custo_da_tela_e_o_total_do_ano(api):
    vid, gado = _gado(api)
    api.put(f"/api/versoes/{vid}/rebanho/{gado}/vendas/2027", json={"valor": 500})
    r = _res(api, vid)
    assert _v(r, "Gado de corte", "estoque", "reb_vendas", 2027) == 190 and any("limitadas" in a for a in r["culturas"][0]["avisos"])
    cv = api.get(f"/api/versoes/{vid}/custos").json()["culturas"][0]
    assert cv["rebanho"] is True and cv["custo_total"]["2027"] == 300000
