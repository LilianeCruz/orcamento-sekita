import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
import test_balanco as tb
import test_captacoes as tcap
import test_dre as td
import test_investimentos as ti
import test_patrimonio as tpat
import test_resultado as tr


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _fluxo(api, vid):
    return api.get(f"/api/versoes/{vid}/fluxo-caixa").json()


def _l(d, id_):
    return next(l for s in d["linhas"] for l in s["linhas"] if l["id"] == id_)["valores"]


def _premissa_bp(api, vid, conta, nome, valores):
    pid = api.post("/api/premissas-dem", json={"nome": nome, "demonstrativo": "balanco", "conta_codigo": conta, "sinal": 1}).json()["id"]
    api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": pid})
    for ano, v in valores.items():
        api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/{ano}", json={"valor": v})


def _taxa(api, vid, ano, taxa, origem=0):
    assert api.put(f"/api/versoes/{vid}/fluxo-caixa/origem/{ano}", json={"valor": origem}).status_code == 200
    assert api.put(f"/api/versoes/{vid}/fluxo-caixa/taxa/{ano}", json={"valor": taxa}).status_code == 200


def _dif(api, vid):
    bp = tb._bp(api, vid)
    return [next(l for l in bp["linhas"] if l["codigo"] == "DIF")["valores"][str(a)] for a in bp["anos"]]


def test_sem_estrutura_do_balanco_o_fluxo_fica_inativo(api):
    d = _fluxo(api, ti._versao(api))
    assert d["estrutura"] is False and d["linhas"] == [] and [p["campo"] for p in d["premissas"]] == ["origem", "taxa", "efetiva"]


def test_falta_de_caixa_gera_divida_de_giro_e_a_sobra_amortiza(api):
    tb._importar(api, tpat.BP_PL)
    vid = ti._versao(api)
    _premissa_bp(api, vid, "SA20", "Terras", {2027: 1000})                                            # compra em 2027 e baixa em 2028 (o nível volta a zero)
    d = _fluxo(api, vid)
    assert _l(d, "variacao") == {"2027": pytest.approx(1000), "2028": pytest.approx(-1000), "2029": 0}   # gera 1.000 e depois amortiza
    assert _l(d, "divida") == {"2027": pytest.approx(1000), "2028": 0, "2029": 0}
    assert _l(d, "caixa_fim") == {"2027": 0, "2028": 0, "2029": 0} and _l(d, "imob")["2027"] == pytest.approx(-1000)
    bp = tb._bp(api, vid)
    assert [tb._v(bp, "SPAUTO", a) for a in (2027, 2028, 2029)] == [pytest.approx(1000), 0, 0]         # a dívida automática tem linha própria no passivo circulante
    assert [tb._v(bp, "SP08", a) for a in (2027, 2028, 2029)] == [0, 0, 0]
    assert [tb._v(bp, "SA07", a) for a in (2027, 2028, 2029)] == [0, 0, 0]
    assert _dif(api, vid) == [pytest.approx(0, abs=1e-6)] * 3                                         # o balanço fecha sozinho: sem plug digitado
    assert next(l for l in bp["linhas"] if l["codigo"] == "SA07")["origem"] == "Fluxo de caixa · caixa de fechamento"


def test_sobra_de_caixa_acumula_no_caixa_quando_nao_ha_divida(api):
    tb._importar(api, tpat.BP_PL)
    vid = ti._versao(api)
    _premissa_bp(api, vid, "SP23", "Aporte", {2027: 500, 2028: 500, 2029: 500})                      # nível de capital: +500 em 2027 e depois parado
    d = _fluxo(api, vid)
    assert _l(d, "caixa_fim") == {"2027": pytest.approx(500), "2028": pytest.approx(500), "2029": pytest.approx(500)}
    assert _l(d, "divida") == {"2027": 0, "2028": 0, "2029": 0} and _dif(api, vid) == [pytest.approx(0, abs=1e-6)] * 3


def test_juros_da_divida_automatica_saem_da_dre_do_mesmo_ano_e_o_balanco_fecha(api):
    tb._importar(api, tpat.BP_PL)
    vid = ti._versao(api)
    _premissa_bp(api, vid, "SA20", "Terras", {2027: 1000})
    _taxa(api, vid, 2027, 10); _taxa(api, vid, 2028, 10)
    d = _fluxo(api, vid)
    # 2027: N = 1.000 ÷ (1 − 10% ÷ 2) = 1.052,6316; juros = 10% × (0 + 1.052,6316) ÷ 2 = 52,6316 (meio ano)
    assert _l(d, "divida")["2027"] == pytest.approx(1052.6316, abs=1e-3) and _l(d, "juros")["2027"] == pytest.approx(52.6316, abs=1e-3)
    # 2028: K = 1.000 − 10% × 1.052,6316 = 894,7368; N = −K ÷ 0,95 = −941,8283; dívida = 110,8033; juros = 10% × (1.052,6316 + 110,8033) ÷ 2 = 58,1717
    assert _l(d, "divida")["2028"] == pytest.approx(110.8033, abs=1e-3) and _l(d, "juros")["2028"] == pytest.approx(58.1717, abs=1e-3)
    assert _l(d, "caixa_fim")["2027"] == pytest.approx(0, abs=1e-6) and _l(d, "caixa_fim")["2028"] == pytest.approx(0, abs=1e-6)
    dre = api.get(f"/api/versoes/{vid}/dre").json()
    fin = next(l for l in dre["linhas"] if l["codigo"] == "DS053")
    assert fin["valores"]["2027"] == pytest.approx(-52.6316, abs=1e-3) and fin["valores"]["2028"] == pytest.approx(-58.1717, abs=1e-3)
    assert "novas dívidas" in fin["origem"]
    assert _l(d, "lucro")["2027"] == pytest.approx(-52.6316, abs=1e-3)                                 # o juro reduz o lucro do ano
    assert _dif(api, vid) == [pytest.approx(0, abs=1e-6)] * 3                                          # e mesmo assim o balanço fecha


def test_taxa_pela_media_ponderada_das_captacoes_do_ano(api):
    tb._importar(api, tpat.BP_PL)
    vid = ti._versao(api)
    tcap._cap(api, vid, nome="A", tipo="custeio", ano=2027, valor=1000, taxa=10)
    tcap._cap(api, vid, nome="B", tipo="custeio", ano=2027, valor=3000, taxa=20)
    tcap._cap(api, vid, nome="C", tipo="capital_giro", ano=2027, valor=500, taxa=30)
    _taxa(api, vid, 2027, 99, origem=1)                                                                 # a taxa digitada é ignorada quando a origem é a média de custeio
    p = {x["campo"]: x for x in _fluxo(api, vid)["premissas"]}
    assert p["efetiva"]["valores"]["2027"] == pytest.approx(17.5)                                      # (1.000×10 + 3.000×20) ÷ 4.000
    _taxa(api, vid, 2027, 99, origem=2)
    assert {x["campo"]: x for x in _fluxo(api, vid)["premissas"]}["efetiva"]["valores"]["2027"] == pytest.approx(30)
    _taxa(api, vid, 2027, 99, origem=0)
    assert {x["campo"]: x for x in _fluxo(api, vid)["premissas"]}["efetiva"]["valores"]["2027"] == 99


def test_media_sem_captacao_no_ano_avisa_e_usa_taxa_zero(api):
    tb._importar(api, tpat.BP_PL)
    vid = ti._versao(api)
    _premissa_bp(api, vid, "SA20", "Terras", {2027: 1000})
    _taxa(api, vid, 2028, 0, origem=2)
    d = _fluxo(api, vid)
    assert any("2028" in a and "capital de giro" in a for a in d["avisos"])
    assert {x["campo"]: x for x in d["premissas"]}["efetiva"]["valores"]["2028"] == 0


def test_caixa_minimo_do_capital_de_giro_e_respeitado(api):
    tb._importar(api, tpat.BP_PL)
    vid, _ = td._ligado(api)                                                                           # receita líquida 19 e CPV 5 (R$ mil) em 2027
    assert api.put(f"/api/versoes/{vid}/capital-giro/pct_caixa/2027", json={"valor": 20}).status_code == 200      # mínimo = 20% do CPV = 1,0
    d = _fluxo(api, vid)
    assert _l(d, "minimo")["2027"] == pytest.approx(1.0)
    assert _l(d, "caixa_fim")["2027"] >= 1.0 - 1e-9
    assert all(abs(x) < 1e-6 for x in _dif(api, vid))


def test_o_fluxo_soma_as_categorias_e_o_caixa_bate_com_o_balanco(api):
    tb._importar(api, tpat.BP_PL)
    vid, _ = td._ligado(api)
    _premissa_bp(api, vid, "SA20", "Terras", {2027: 300, 2028: 300})
    d = _fluxo(api, vid)
    for ano in ("2027", "2028"):
        op = _l(d, "lucro")[ano] + _l(d, "dep")[ano] + _l(d, "ncg")[ano] + _l(d, "outros")[ano]
        fin = _l(d, "dividas")[ano] + _l(d, "dist")[ano] + _l(d, "cap_aj")[ano] + _l(d, "outros_pl")[ano]
        assert _l(d, "operacional")[ano] == pytest.approx(op) and _l(d, "financiamento")[ano] == pytest.approx(fin)
        assert _l(d, "antes")[ano] == pytest.approx(op + _l(d, "imob")[ano] + fin)
        assert _l(d, "caixa_fim")[ano] == pytest.approx(_l(d, "caixa_ini")[ano] + _l(d, "antes")[ano] + _l(d, "variacao")[ano], abs=1e-6)
    bp = tb._bp(api, vid)
    assert [tb._v(bp, "SA07", a) for a in (2027, 2028)] == [pytest.approx(_l(d, "caixa_fim")[str(a)]) for a in (2027, 2028)]


def test_investimento_financiado_captacao_e_distribuicao_entram_no_fluxo_e_o_balanco_continua_fechando(api):
    tb._importar(api, tpat.BP_PL)
    vid, _ = td._ligado(api)
    tipo = ti._tipo(api, "Máquinas", conta="SA20", carrega=False, vida_util=10)
    ti._put(api, vid, tipo, "novo", 2027, 400); ti._put(api, vid, tipo, "financiado", 2027, 250)
    for campo, v in (("taxa", 12), ("prazo", 5), ("carencia", 0)):
        api.put(f"/api/versoes/{vid}/financiamento/{campo}/2027", json={"valor": v})
    tcap._cap(api, vid, nome="Custeio", tipo="custeio", ano=2027, valor=700, taxa=9, prazo=2)
    assert api.put(f"/api/versoes/{vid}/patrimonio/dist_valor/2027", json={"valor": 40}).status_code == 200
    assert api.put(f"/api/versoes/{vid}/patrimonio/dist_valor/2026", json={"valor": 15}).status_code == 200
    d = _fluxo(api, vid)
    assert _l(d, "imob")["2027"] == pytest.approx(-400)
    assert _l(d, "dist")["2027"] == pytest.approx(-15) and _l(d, "dist")["2028"] == pytest.approx(-40)   # a distribuição do lucro do ano anterior sai no ano seguinte
    assert all(abs(x) < 1e-6 for x in _dif(api, vid))                                                  # tudo ligado: ativo = passivo em todos os anos


def test_validacoes_replicar_trava_e_copia(api):
    tb._importar(api, tpat.BP_PL)
    vid, _ = tr.cenario(api)
    put = lambda campo, ano, v: api.put(f"/api/versoes/{vid}/fluxo-caixa/{campo}/{ano}", json={"valor": v})
    assert put("taxa", 2027, 101).status_code == 422 and put("taxa", 2027, -1).status_code == 422
    assert put("origem", 2027, 3).status_code == 422 and put("outro", 2027, 1).status_code == 422 and put("taxa", 2040, 1).status_code == 422
    _taxa(api, vid, 2027, 8)
    assert api.post(f"/api/versoes/{vid}/fluxo-caixa/taxa/replicar", json={"ano": 2027}).json()["anos_alterados"] >= 1
    assert {x["campo"]: x for x in _fluxo(api, vid)["premissas"]}["taxa"]["valores"]["2029"] == 8
    assert api.post(f"/api/versoes/{vid}/fluxo-caixa/taxa/replicar", json={"ano": 2031}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert put("taxa", 2027, 1).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert {x["campo"]: x for x in _fluxo(api, rep)["premissas"]}["taxa"]["valores"]["2027"] == 8
