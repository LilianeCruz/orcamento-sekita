import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
import test_balanco as tb
import test_investimentos as ti
import test_resultado as tr


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _cap(api, vid, **extra):
    d = {"nome": "Custeio safra", "tipo": "custeio", "ano": 2027, "valor": 1000, "taxa": 10, "prazo": 2, "carencia": 0}
    d.update(extra)
    return api.post(f"/api/versoes/{vid}/captacoes", json=d)


def _ler(api, vid):
    return api.get(f"/api/versoes/{vid}/captacoes").json()


def _linha(c, id_):
    return next(l for l in c["linhas"] if l["id"] == id_)


def _v(c, id_):
    return {a: pytest.approx(v) for a, v in _linha(c, id_)["valores"].items()}


def test_cronograma_sac_com_juros_sobre_o_saldo_medio(api):
    vid = ti._versao(api)
    assert _cap(api, vid).status_code == 200
    c = _ler(api, vid)["captacoes"][0]
    assert _v(c, "captado") == {"2027": 1000, "2028": 0, "2029": 0}
    assert _v(c, "amort") == {"2027": 0, "2028": 500, "2029": 500}                              # 1.000 ÷ 2 parcelas, a partir do ano seguinte
    assert _v(c, "saldo") == {"2027": 1000, "2028": 500, "2029": 0}
    assert _v(c, "juros") == {"2027": 50, "2028": 75, "2029": 25}                                # 10% × saldo médio: meio ano; (1.000+500)/2; (500+0)/2
    assert _v(c, "curto") == {"2027": 500, "2028": 500, "2029": 0} and _v(c, "longo") == {"2027": 500, "2028": 0, "2029": 0}


def test_carencia_adia_a_amortizacao_e_o_curto_prazo_olha_o_ano_seguinte_ao_horizonte(api):
    vid = ti._versao(api)
    _cap(api, vid, carencia=1)
    c = _ler(api, vid)["captacoes"][0]
    assert _v(c, "amort") == {"2027": 0, "2028": 0, "2029": 500} and _v(c, "saldo") == {"2027": 1000, "2028": 1000, "2029": 500}
    assert _v(c, "juros") == {"2027": 50, "2028": 100, "2029": 75}
    assert _v(c, "curto") == {"2027": 0, "2028": 500, "2029": 500} and _v(c, "longo")["2029"] == 0   # a parcela de 2030 já é curto prazo em 2029


def test_amortizacao_e_juros_podem_ser_alterados_e_o_saldo_acompanha(api):
    vid = ti._versao(api)
    _cap(api, vid)
    chave = _ler(api, vid)["captacoes"][0]["chave"]
    put = lambda campo, ano, v: api.put(f"/api/versoes/{vid}/cronograma-captacao/{chave}/{campo}/{ano}", json={"valor": v})
    assert put("amort", 2028, 0).status_code == 200 and put("juros", 2029, 99).status_code == 200
    c = _ler(api, vid)["captacoes"][0]
    assert _v(c, "amort") == {"2027": 0, "2028": 0, "2029": 500} and _v(c, "saldo") == {"2027": 1000, "2028": 1000, "2029": 500}
    assert _v(c, "juros") == {"2027": 50, "2028": 100, "2029": 99}                                # 2028 recalcula pelo saldo novo; 2029 ficou como digitado
    assert _linha(c, "amort")["alterado"] == {"2027": False, "2028": True, "2029": False} and _linha(c, "amort")["calculado"]["2028"] == pytest.approx(500)
    assert put("amort", 2028, 5000).status_code == 200
    assert _ler(api, vid)["captacoes"][0]["linhas"][1]["valores"]["2028"] == pytest.approx(1000)   # não amortiza mais do que deve
    assert api.delete(f"/api/versoes/{vid}/cronograma-captacao/{chave}").status_code == 200
    assert _v(_ler(api, vid)["captacoes"][0], "amort") == {"2027": 0, "2028": 500, "2029": 500}
    assert put("amort", 2028, -1).status_code == 422 and put("saldo", 2028, 1).status_code == 422 and put("amort", 2040, 1).status_code == 422
    assert api.put(f"/api/versoes/{vid}/cronograma-captacao/cap-999/amort/2028", json={"valor": 1}).status_code in (404, 422)


def test_validacoes_da_captacao_e_investimento_nao_e_tipo_de_captacao(api):
    vid = ti._versao(api)
    r = _cap(api, vid, tipo="investimento")
    assert r.status_code == 422 and "tela Investimentos" in r.json()["erro"]
    for extra in ({"nome": " "}, {"tipo": "outro"}, {"ano": 2040}, {"valor": 0}, {"taxa": 101}, {"taxa": -1}, {"prazo": 0}, {"carencia": -1}):
        assert _cap(api, vid, **extra).status_code == 422, extra
    assert _ler(api, vid)["captacoes"] == []


def test_editar_excluir_e_nao_mistura_versoes(api):
    vid = ti._versao(api)
    cid = _cap(api, vid).json()["id"]
    d = {"nome": "Giro", "tipo": "capital_giro", "ano": 2028, "valor": 600, "taxa": 12, "prazo": 3, "carencia": 0}
    assert api.put(f"/api/versoes/{vid}/captacoes/{cid}", json=d).status_code == 200
    c = _ler(api, vid)["captacoes"][0]
    assert c["nome"] == "Giro" and c["tipo_nome"] == "Capital de giro" and _v(c, "captado") == {"2027": 0, "2028": 600, "2029": 0}
    outra = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3, "nome": "Outra"}).json()["id"]
    assert api.put(f"/api/versoes/{outra}/captacoes/{cid}", json=d).status_code == 404
    assert api.delete(f"/api/versoes/{vid}/captacoes/{cid}").status_code == 200
    assert _ler(api, vid)["captacoes"] == [] and api.delete(f"/api/versoes/{vid}/captacoes/{cid}").status_code == 404


# ---------------------------------------------------------------- investimento financiado
def _financiado(api, vid, valor=600, **extra):
    """Máquinas: R$ 1.000 mil investidos em 2027, dos quais `valor` são financiados (digitado junto com o investimento, não no cadastro do tipo)."""
    tb._importar(api)
    t = ti._tipo(api, "Máquinas", conta="SA10", carrega=False, **extra)
    ti._put(api, vid, t, "novo", 2027, 1000)
    assert ti._put(api, vid, t, "financiado", 2027, valor).status_code == 200
    return t


def _premissas(api, vid, taxa=8, prazo=4, carencia=1, ano=2027):
    for campo, v in (("taxa", taxa), ("prazo", prazo), ("carencia", carencia)):
        assert api.put(f"/api/versoes/{vid}/financiamento/{campo}/{ano}", json={"valor": v}).status_code == 200


def test_investimento_financiado_vira_captacao_com_a_premissa_do_ano(api):
    vid = ti._versao(api)
    t = _financiado(api, vid)
    _premissas(api, vid)
    caps = _ler(api, vid)["captacoes"]
    assert len(caps) == 1 and caps[0]["origem"] == "investimento" and caps[0]["tipo_nome"] == "Investimento" and caps[0]["chave"] == f"inv-{t}-2027"
    c = caps[0]
    assert c["valor"] == pytest.approx(600) and c["percentual"] == 60                              # 60% de 1.000 investidos
    assert _v(c, "amort") == {"2027": 0, "2028": 0, "2029": 150}                                  # 600 ÷ 4, depois de 1 ano de carência
    assert _v(c, "saldo") == {"2027": 600, "2028": 600, "2029": 450}
    assert _v(c, "juros") == {"2027": 24, "2028": 48, "2029": 42}                                  # 8% × 300; × 600; × (600+450)/2


def test_valor_financiado_maior_que_o_investido_e_limitado_com_aviso(api):
    vid = ti._versao(api)
    t = _financiado(api, vid, valor=1500)
    _premissas(api, vid)
    inv = ti._inv(api, vid)
    tipo = next(x for x in inv["tipos"] if x["id"] == t)
    assert ti._linha(tipo, "financiado")["2027"] == 1000 and "maior que o investido" in tipo["avisos"][0]
    c = _ler(api, vid)["captacoes"][0]
    assert c["valor"] == pytest.approx(1000) and c["percentual"] == pytest.approx(100)


def test_o_cadastro_do_tipo_nao_tem_financiamento(api):
    tb._importar(api)
    t = ti._tipo(api, "Máquinas", conta="SA10", carrega=False, financiado_pct=60, fin_taxa=12)      # campos antigos são ignorados
    tipo = next(x for x in ti._inv(api, ti._versao(api))["cadastro"] if x["id"] == t)
    assert "financiado_pct" not in tipo and "fin_taxa" not in tipo
    vid = ti._versao(api)
    ti._put(api, vid, t, "novo", 2027, 1000)
    assert _ler(api, vid)["captacoes"] == []                                                          # sem valor financiado digitado, não há captação


def test_sem_prazo_considera_uma_parcela_e_avisa(api):
    vid = ti._versao(api)
    _financiado(api, vid)
    c = _ler(api, vid)["captacoes"][0]
    assert "Sem prazo de pagamento" in c["avisos"][0] and _v(c, "amort") == {"2027": 0, "2028": 600, "2029": 0}


def test_cada_ano_com_valor_financiado_gera_uma_captacao(api):
    vid = ti._versao(api)
    t = _financiado(api, vid, valor=500)
    ti._put(api, vid, t, "novo", 2028, 400); ti._put(api, vid, t, "financiado", 2028, 200)
    _premissas(api, vid); _premissas(api, vid, ano=2028, taxa=9, prazo=2, carencia=0)
    caps = _ler(api, vid)["captacoes"]
    assert [(c["chave"].split("-")[2], c["valor"]) for c in caps] == [("2027", 500), ("2028", 200)]
    assert caps[1]["taxa"] == 9 and caps[1]["prazo"] == 2 and caps[0]["percentual"] == pytest.approx(50)    # a captação de 2028 usa a premissa de 2028
    ti._put(api, vid, t, "financiado", 2028, 0)
    assert len(_ler(api, vid)["captacoes"]) == 1                                                       # zerou o valor: a captação some


def test_valor_financiado_so_para_investimento_valida_e_replica(api):
    tb._importar(api)
    vid = ti._versao(api)
    inv = ti._tipo(api, "Máquinas", conta="SA10", carrega=False)
    desin = ti._tipo(api, "Venda", "desinvestimento", conta="SA10")
    assert ti._put(api, vid, desin, "financiado", 2027, 10).status_code == 422                        # desinvestimento não se financia
    assert ti._put(api, vid, inv, "financiado", 2027, -1).status_code == 422
    assert ti._put(api, vid, inv, "financiado", 2040, 1).status_code == 422
    for ano in (2027, 2028, 2029):
        ti._put(api, vid, inv, "novo", ano, 100)
    ti._put(api, vid, inv, "financiado", 2027, 40)
    assert api.post(f"/api/versoes/{vid}/investimentos/{inv}/financiado/replicar", json={"ano": 2027}).json()["anos_alterados"] == 2
    tipo = next(x for x in ti._inv(api, vid)["tipos"] if x["id"] == inv)
    assert ti._linha(tipo, "financiado") == {"2027": 40, "2028": 40, "2029": 40}
    assert [l["id"] for l in tipo["linhas"]] == ["novo", "financiado"]


def test_premissas_de_financiamento_validam_e_replicam(api):
    vid = ti._versao(api)
    put = lambda campo, ano, v: api.put(f"/api/versoes/{vid}/financiamento/{campo}/{ano}", json={"valor": v})
    assert put("taxa", 2027, 101).status_code == 422 and put("prazo", 2027, 2.5).status_code == 422 and put("prazo", 2027, -1).status_code == 422
    assert put("outro", 2027, 1).status_code == 422 and put("taxa", 2040, 1).status_code == 422
    put("taxa", 2027, 9)
    assert api.post(f"/api/versoes/{vid}/financiamento/taxa/replicar", json={"ano": 2027}).json()["anos_alterados"] == 2
    assert next(p for p in _ler(api, vid)["premissas"] if p["campo"] == "taxa")["valores"] == {"2027": 9, "2028": 9, "2029": 9}
    assert api.post(f"/api/versoes/{vid}/financiamento/taxa/replicar", json={"ano": 2029}).status_code == 422


def test_alteracao_de_um_financiamento_de_investimento_e_gravada_pela_chave(api):
    vid = ti._versao(api)
    t = _financiado(api, vid)
    _premissas(api, vid)
    assert api.put(f"/api/versoes/{vid}/cronograma-captacao/inv-{t}-2027/juros/2028", json={"valor": 10}).status_code == 200
    assert _v(_ler(api, vid)["captacoes"][0], "juros")["2028"] == pytest.approx(10)


# ---------------------------------------------------------------- balanço e DRE
def test_balanco_soma_a_divida_nova_em_curto_e_longo_prazo(api):
    vid = ti._versao(api)
    _financiado(api, vid)
    _premissas(api, vid)
    _cap(api, vid)
    bp = tb._bp(api, vid)
    assert [tb._v(bp, "SP08", a) for a in (2027, 2028, 2029)] == [pytest.approx(500), pytest.approx(500), 0]    # custeio: parcela do ano seguinte (a dívida de giro automática tem linha própria)
    assert [tb._v(bp, "SP17", a) for a in (2027, 2028, 2029)] == [pytest.approx(500), 0, 0]
    assert [tb._v(bp, "SP12", a) for a in (2027, 2028, 2029)] == [0, pytest.approx(150), pytest.approx(150)]    # financiamento do investimento: curto
    assert [tb._v(bp, "SP18", a) for a in (2027, 2028, 2029)] == [pytest.approx(600), pytest.approx(450), pytest.approx(300)]
    assert "novas captações" in next(x for x in bp["linhas"] if x["codigo"] == "SP08")["explicacao"]


def test_dre_leva_os_juros_das_novas_captacoes(api):
    vid = ti._versao(api)
    _financiado(api, vid)
    _premissas(api, vid)
    _cap(api, vid)
    dre = api.get(f"/api/versoes/{vid}/dre").json()
    l = next(x for x in dre["linhas"] if x["codigo"] == "DS053")
    assert [l["valores"][str(a)] for a in (2027, 2028, 2029)] == [pytest.approx(-(50 + 24)), pytest.approx(-(75 + 48)), pytest.approx(-(25 + 42))]
    assert "novas dívidas" in l["origem"]


# ---------------------------------------------------------------- trava, cópia de versão e comparação
def test_trava_copia_da_versao_e_comparacao(api):
    tb._importar(api)
    vid, _ = tr.cenario(api)
    cid = _cap(api, vid).json()["id"]
    api.put(f"/api/versoes/{vid}/cronograma-captacao/cap-{cid}/amort/2028", json={"valor": 0})
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert _cap(api, vid).status_code == 409
    assert api.put(f"/api/versoes/{vid}/cronograma-captacao/cap-{cid}/amort/2028", json={"valor": 1}).status_code == 409
    assert api.put(f"/api/versoes/{vid}/financiamento/taxa/2027", json={"valor": 5}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    c = _ler(api, rep)["captacoes"][0]
    assert c["id"] != cid and _v(c, "amort")["2028"] == 0 and _v(c, "saldo")["2028"] == pytest.approx(1000)        # id novo, alteração acompanhou
    api.put(f"/api/versoes/{rep}/captacoes/{c['id']}", json={"nome": "Custeio safra", "tipo": "custeio", "ano": 2027, "valor": 1500, "taxa": 10, "prazo": 2, "carencia": 0})
    cmp = api.get(f"/api/comparar-captacoes?a={vid}&b={rep}").json()
    l = next(x for x in cmp["linhas"] if x["id"] == "captado")
    assert l["anos"]["2027"] == {"a": 1000, "b": 1500, "delta": 500, "pct": 50.0}
