import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
import test_balanco as tb
import test_captacoes as tcap
import test_dre as td
import test_fluxo as tf
import test_investimentos as ti
import test_patrimonio as tpat
import test_resultado as tr


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _fx(api, vid):
    return api.get(f"/api/versoes/{vid}/fluxo-caixa").json()


def _l(d, bloco, id_):
    return next(l for s in d[bloco] for l in s["linhas"] if l["id"] == id_)["valores"]


def _uf(api, vid):
    return api.get(f"/api/versoes/{vid}/usos-fontes").json()


def _ind(api, vid):
    return {i["codigo"]: i for i in api.get(f"/api/versoes/{vid}/indicadores").json()["indicadores"]}


def _compra_de_terras(api, taxa=None):
    tb._importar(api, tpat.BP_PL)
    vid = ti._versao(api)
    tf._premissa_bp(api, vid, "SA20", "Terras", {2027: 1000})                                          # compra em 2027 e baixa em 2028 (o nível volta a zero)
    if taxa:
        tf._taxa(api, vid, 2027, taxa); tf._taxa(api, vid, 2028, taxa)
    return vid


def test_sem_estrutura_nada_e_calculado(api):
    vid = ti._versao(api)
    assert _fx(api, vid)["estrutura"] is False or "indireto" not in _fx(api, vid)
    assert _uf(api, vid)["estrutura"] is False
    assert api.get(f"/api/versoes/{vid}/indicadores").json()["indicadores"] == []


def test_fluxo_indireto_fecha_com_o_caixa_do_balanco(api):
    vid = _compra_de_terras(api)
    d = _fx(api, vid)
    assert _l(d, "indireto", "fci") == {"2027": pytest.approx(-1000), "2028": pytest.approx(1000), "2029": 0}          # compra e depois baixa
    assert _l(d, "indireto", "outras_imob")["2027"] == pytest.approx(-1000) and _l(d, "indireto", "capex")["2027"] == 0
    assert _l(d, "indireto", "N") == {"2027": pytest.approx(1000), "2028": pytest.approx(-1000), "2029": 0}            # dívida de giro gerada e depois amortizada
    assert _l(d, "indireto", "variacao") == {"2027": 0, "2028": 0, "2029": 0}
    assert all(abs(v) < 1e-6 for v in _l(d, "indireto", "ver").values())                                              # verificação: saldo final = caixa do balanço


def test_juros_da_divida_automatica_aparecem_no_resultado_financeiro_do_fluxo(api):
    vid = _compra_de_terras(api, taxa=10)
    d = _fx(api, vid)
    assert _l(d, "indireto", "res_fin")["2027"] == pytest.approx(-52.6316, abs=1e-3)                                  # 10% × 1.052,63 ÷ 2
    assert _l(d, "indireto", "N")["2027"] == pytest.approx(1052.6316, abs=1e-3)
    assert _l(d, "indireto", "fcf")["2027"] == pytest.approx(1000, abs=1e-3)                                          # 1.052,63 − 52,63
    assert _l(d, "indireto", "fco")["2027"] == pytest.approx(0, abs=1e-6)                                             # o juro está no financiamento, como na planilha
    assert all(abs(v) < 1e-6 for v in _l(d, "indireto", "ver").values())


def test_fluxo_simplificado_bate_com_o_indireto(api):
    vid, _ = td._ligado(api)
    tb._importar(api, tpat.BP_PL)
    tf._premissa_bp(api, vid, "SA20", "Terras", {2027: 300, 2028: 300})
    tcap._cap(api, vid, nome="Custeio", tipo="custeio", ano=2027, valor=700, taxa=9, prazo=2)
    d = _fx(api, vid)
    for ano in ("2027", "2028"):                                                                                         # o cenário tem 2 anos de horizonte
        assert _l(d, "simplificado", "apos")[ano] == pytest.approx(_l(d, "indireto", "variacao")[ano], abs=1e-6)
        assert _l(d, "simplificado", "caixa_fim")[ano] == pytest.approx(_l(d, "indireto", "caixa_fim")[ano], abs=1e-6)
        assert _l(d, "simplificado", "rb")[ano] + _l(d, "simplificado", "ded")[ano] + _l(d, "simplificado", "despesas")[ano] == pytest.approx(_l(d, "simplificado", "ebitda")[ano])
    assert all(abs(v) < 1e-6 for v in _l(d, "simplificado", "ver").values()) and all(abs(v) < 1e-6 for v in _l(d, "indireto", "ver").values())


def test_necessidade_de_capital_de_giro_e_ciclos(api):
    vid, _ = td._ligado(api)                                                                                           # receita líquida 19 e CPV 5 (R$ mil) em 2027
    tb._importar(api, tpat.BP_PL + [("SA08", "Clientes", "SA06", "account"), ("SA11", "Insumos", "SA06", "account"), ("SP07", "Fornecedores", "SP06", "account")])
    for campo, v in {"dias_ano": 360, "dias_receber": 30, "dias_insumos": 60, "dias_fornecedores": 36}.items():
        assert api.put(f"/api/versoes/{vid}/capital-giro/{campo}/2027", json={"valor": v}).status_code == 200
    d = _fx(api, vid)
    assert _l(d, "capital_giro", "clientes")["2027"] == pytest.approx(19 * 30 / 360)                                  # 1,5833
    assert _l(d, "capital_giro", "estoques")["2027"] == pytest.approx(5 * 60 / 360)                                   # 0,8333 (insumos; estoque de produtos acabados e lavoura = 0)
    assert _l(d, "capital_giro", "forn")["2027"] == pytest.approx(5 * 36 / 360)                                       # 0,5
    assert _l(d, "capital_giro", "ncg")["2027"] == pytest.approx(19 * 30 / 360 + 5 * 60 / 360 - 0.5)                  # 1,9167
    assert _l(d, "capital_giro", "inv_cg")["2027"] == pytest.approx(_l(d, "capital_giro", "ncg")["2027"])             # sem balanço realizado, parte de zero
    assert _l(d, "capital_giro", "d_receber")["2027"] == pytest.approx(30) and _l(d, "capital_giro", "d_estoque")["2027"] == pytest.approx(60)
    assert _l(d, "capital_giro", "ciclo_oper")["2027"] == pytest.approx(90) and _l(d, "capital_giro", "d_pagar")["2027"] == pytest.approx(36)
    assert _l(d, "capital_giro", "ciclo_fin")["2027"] == pytest.approx(54)                                           # 90 − 36


def test_usos_e_fontes_fecham_com_verificacao_zero(api):
    vid = _compra_de_terras(api)
    d = _uf(api, vid)
    fontes = {l["id"]: l["valores"] for l in d["fontes"]}
    usos = {l["id"]: l["valores"] for l in d["usos"]}
    assert fontes["auto_f"]["2027"] == pytest.approx(1000) and usos["imob_outras_u"]["2027"] == pytest.approx(1000)   # 2027: gera dívida de giro para comprar a terra
    assert fontes["imob_outras_f"]["2028"] == pytest.approx(1000) and usos["auto_u"]["2028"] == pytest.approx(1000)   # 2028: vende a terra e amortiza a dívida
    assert fontes["total_fontes"]["2027"] == pytest.approx(1000) and usos["total_usos"]["2027"] == pytest.approx(1000)
    assert all(abs(v) < 1e-6 for v in d["verificacao"]["valores"].values())


def test_usos_e_fontes_do_cenario_rico_tambem_fecham(api):
    vid, _ = td._ligado(api)
    tb._importar(api, tpat.BP_PL)
    tipo = ti._tipo(api, "Máquinas", conta="SA20", carrega=False, vida_util=10)
    ti._put(api, vid, tipo, "novo", 2027, 400); ti._put(api, vid, tipo, "financiado", 2027, 250)
    for campo, v in (("taxa", 12), ("prazo", 5), ("carencia", 0)):
        api.put(f"/api/versoes/{vid}/financiamento/{campo}/2027", json={"valor": v})
    tcap._cap(api, vid, nome="Custeio", tipo="custeio", ano=2027, valor=700, taxa=9, prazo=2)
    api.put(f"/api/versoes/{vid}/patrimonio/dist_valor/2026", json={"valor": 15})
    d = _uf(api, vid)
    assert all(abs(v) < 1e-6 for v in d["verificacao"]["valores"].values())
    fontes = {l["id"]: l["valores"] for l in d["fontes"]}
    assert fontes["ebitda"]["2027"] != 0 and {l["id"]: l["valores"] for l in d["usos"]}["venda_u"]["2027"] == pytest.approx(400)   # CAPEX do ano entre os usos


def test_indicadores_formulas_e_metas_iniciais(api):
    vid, _ = td._ligado(api)
    tb._importar(api, tpat.BP_PL)
    tcap._cap(api, vid, nome="Custeio", tipo="custeio", ano=2027, valor=700, taxa=9, prazo=2)
    ind = _ind(api, vid)
    assert [i for i in ind] == ["alav_total", "liquidez", "capacidade", "equilibrio", "solvencia", "divida_ativo", "alav_liquida", "margem_ebitda", "alav_operacional", "roic", "roe"]
    assert {c: ind[c]["meta"]["2027"] for c in ind if c != "equilibrio"} == {
        "alav_total": 2.0, "liquidez": 1.2, "capacidade": 1.5, "solvencia": 0.65, "divida_ativo": 0.35, "alav_liquida": 2.5, "margem_ebitda": 0.3,
        "alav_operacional": 0.6, "roic": 0.14, "roe": 0.14}                                                          # os limites da planilha
    bp = {l["codigo"]: l["valores"] for l in tb._bp(api, vid)["linhas"]}
    dre = {l["codigo"]: l["valores"] for l in api.get(f"/api/versoes/{vid}/dre").json()["linhas"]}
    a = "2027"
    assert ind["margem_ebitda"]["valores"][a] == pytest.approx(dre["DS044"][a] / dre["DS018"][a])
    assert ind["margem_ebitda"]["valores"]["2028"] == pytest.approx(14 / 19)                                          # 2028: EBITDA 14 ÷ receita líquida 19
    assert ind["solvencia"]["valores"][a] == pytest.approx(bp["SP22"][a] / bp["SA"][a])
    assert ind["liquidez"]["valores"][a] == pytest.approx(bp["SA06"][a] / bp["SP06"][a])
    divida = bp["SP08"][a] + bp["SPAUTO"][a] + bp["SP12"][a] + bp["SP17"][a] + bp["SP18"][a]
    assert ind["alav_total"]["valores"][a] is None                                                                    # EBITDA negativo: a alavancagem não se aplica
    d28 = bp["SP08"]["2028"] + bp["SPAUTO"]["2028"] + bp["SP12"]["2028"] + bp["SP17"]["2028"] + bp["SP18"]["2028"]
    assert ind["alav_total"]["valores"]["2028"] == pytest.approx(d28 / dre["DS044"]["2028"])                           # dívida bancária ÷ EBITDA, sem consórcios
    assert divida == pytest.approx(700)                                                                               # a captação de 700: 350 de curto prazo e 350 de longo prazo (+ dívida automática, aqui zero)
    assert ind["divida_ativo"]["valores"][a] == pytest.approx(divida / bp["SA"][a]) if bp["SA"][a] else True
    assert ind["roe"]["valores"][a] == pytest.approx(dre["DS062"][a] / bp["SP22"][a])
    assert ind["equilibrio"]["valores"][a] == pytest.approx(dre["DS007"][a]) and ind["equilibrio"]["meta_editavel"] is False


def test_status_do_indicador_conforme_o_sentido_do_limite(api):
    vid, _ = td._ligado(api)
    tb._importar(api, tpat.BP_PL)
    ind = _ind(api, vid)
    m = ind["margem_ebitda"]                                                                                          # mínimo 30%: em 2028, 14/19 = 73,7% atende; em 2027 o EBITDA é negativo e não atende
    assert m["sentido"] == "min" and m["atende"]["2028"] is True and m["atende"]["2027"] is False
    assert api.put(f"/api/versoes/{vid}/indicadores/margem_ebitda/2028", json={"valor": 0.9}).status_code == 200      # exige 90%: deixa de atender
    assert _ind(api, vid)["margem_ebitda"]["atende"]["2028"] is False and _ind(api, vid)["margem_ebitda"]["meta"]["2028"] == 0.9
    assert _ind(api, vid)["alav_total"]["atende"]["2027"] is None                                                     # EBITDA negativo: alavancagem não se aplica
    assert _ind(api, vid)["alav_total"]["sentido"] == "max"


def test_metas_validam_replicam_e_acompanham_a_versao(api):
    tb._importar(api, tpat.BP_PL)
    vid, _ = tr.cenario(api)
    put = lambda cod, ano, v: api.put(f"/api/versoes/{vid}/indicadores/{cod}/{ano}", json={"valor": v})
    assert put("liquidez", 2027, -1).status_code == 422 and put("outro", 2027, 1).status_code == 422
    assert put("equilibrio", 2027, 1).status_code == 422 and put("liquidez", 2040, 1).status_code == 422
    assert put("liquidez", 2027, 1.5).status_code == 200
    assert api.post(f"/api/versoes/{vid}/indicadores/liquidez/replicar", json={"ano": 2027}).json()["anos_alterados"] >= 1
    assert _ind(api, vid)["liquidez"]["meta"]["2029"] == 1.5
    assert api.post(f"/api/versoes/{vid}/indicadores/liquidez/replicar", json={"ano": 2031}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert put("liquidez", 2027, 1).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _ind(api, rep)["liquidez"]["meta"]["2027"] == 1.5


def test_composicao_do_endividamento_e_custo_da_divida(api):
    vid, _ = td._ligado(api)
    tb._importar(api, tpat.BP_PL)
    tcap._cap(api, vid, nome="Custeio", tipo="custeio", ano=2027, valor=700, taxa=9, prazo=2)
    d = api.get(f"/api/versoes/{vid}/indicadores").json()
    e = {l["id"]: l["valores"] for l in d["endividamento"]}
    a = "2027"
    assert e["total"][a] == pytest.approx(e["cp"][a] + e["cpltd"][a] + e["lp"][a])
    assert e["p_cp"][a] + e["p_cpltd"][a] + e["p_lp"][a] == pytest.approx(1.0)
    assert e["custo"][a] == pytest.approx(e["desp_fin"][a] / e["total"][a])
