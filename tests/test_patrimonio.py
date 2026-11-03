import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
import test_balanco as tb
import test_investimentos as ti
import test_realizado as trl
import test_resultado as tr


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


BP_PL = tb.BP + [("SP24", "Ajustes de Avaliaçao Patrimonial", "SP22", "account"), ("SP25", "Lucro e Prejuizo Acumulados", "SP22", "account")]


def _cenario(api):
    """Último balanço realizado (2025): lucros acumulados R$ 1.000 mil, capital R$ 5.000 mil, ajustes R$ 300 mil e resultado do exercício R$ 200 mil."""
    tb._importar(api, BP_PL)
    trl._subir(api, trl._planilha([(2025, "BP", "SP25", "Lucros", 1_000_000), (2025, "BP", "SP23", "Capital", 5_000_000),
                                   (2025, "BP", "SP24", "Ajustes", 300_000), (2025, "BP", "SP26", "Resultado", 200_000)]))
    return ti._versao(api)


def _put(api, vid, campo, ano, v):
    r = api.put(f"/api/versoes/{vid}/patrimonio/{campo}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _ler(api, vid):
    return api.get(f"/api/versoes/{vid}/patrimonio").json()


def _l(d, id_):
    return next(l for s in d["resultado"] for l in s["linhas"] if l["id"] == id_)["valores"]


def _lucro_dre(api, vid):
    dre = api.get(f"/api/versoes/{vid}/dre").json()
    return {a: v for a, v in next(x for x in dre["linhas"] if x["codigo"] == "DS062")["valores"].items()}


def test_primeiro_ano_parte_do_ultimo_balanco_realizado(api):
    vid = _cenario(api)
    _put(api, vid, "dist_valor", 2026, 150)                                                            # lucro do ano anterior ao horizonte: distribuído em 2027
    d = _ler(api, vid)
    assert d["saldo_inicial"] == {"ano": 2025} and d["anos_extras"] == [2026]
    assert _l(d, "anterior")["2027"] == 1000 and _l(d, "transferido")["2027"] == 200                  # saldo e resultado do último realizado
    assert _l(d, "lucro_base")["2026"] == 200 and _l(d, "dist_gerada")["2026"] == 150                 # a regra do ano anterior ao horizonte usa o resultado realizado
    assert _l(d, "distribuicao")["2027"] == 150 and _l(d, "lucros")["2027"] == pytest.approx(1050)    # 1.000 + 200 − 150


def test_distribuicao_do_lucro_do_ano_e_paga_no_ano_seguinte(api):
    vid = _cenario(api)
    _put(api, vid, "dist_valor", 2026, 150)
    _put(api, vid, "dist_pct", 2027, 50)                                                               # 50% do lucro de 2027, paga em 2028
    lucro = _lucro_dre(api, vid)
    d = _ler(api, vid)
    assert _l(d, "lucro_base")["2027"] == pytest.approx(lucro["2027"])
    dist = 0.5 * max(lucro["2027"], 0)
    assert _l(d, "dist_gerada")["2027"] == pytest.approx(dist)
    assert _l(d, "distribuicao")["2027"] == 150 and _l(d, "distribuicao")["2028"] == pytest.approx(dist)   # o que é pago em cada ano vem do lucro do ano anterior
    assert _l(d, "transferido")["2028"] == pytest.approx(lucro["2027"])
    assert _l(d, "lucros")["2028"] == pytest.approx(1050 + lucro["2027"] - dist)
    assert _l(d, "lucros")["2029"] == pytest.approx(_l(d, "lucros")["2028"] + lucro["2028"])           # nada decidido para o lucro de 2028: nada pago em 2029


def test_com_lucro_vale_o_percentual_e_o_valor_base_e_o_minimo_sem_lucro(api):
    vid = _cenario(api)                                                                                # o lucro do ano anterior ao horizonte (2026) é o realizado: R$ 200 mil
    for pct, minimo, esperado in ((100, 150, 200), (100, 250, 200), (50, 0, 100), (0, 90, 90), (50, 150, 100), (0, 0, 0)):
        _put(api, vid, "dist_pct", 2026, pct); _put(api, vid, "dist_valor", 2026, minimo)
        assert _l(_ler(api, vid), "dist_gerada")["2026"] == pytest.approx(esperado), (pct, minimo)    # com lucro e % informado, vale o % (mesmo abaixo do valor base); sem % paga o valor base
    prem = {p["campo"]: p["valores"]["2026"] for p in _ler(api, vid)["premissas"]}
    assert prem == {"dist_pct": 0, "dist_valor": 0}                                                    # preencher um não zera o outro: os dois convivem


def test_valor_base_distribui_mesmo_sem_lucro_e_percentual_nao(api):
    vid = _cenario(api)
    tb._importar(api, BP_PL)
    api.post("/api/premissas-dem", json={"nome": "Prejuízo", "demonstrativo": "dre", "conta_codigo": "DS038", "sinal": -1, "tipo": "valor"})
    pid = 1
    api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": pid})
    api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/2027", json={"valor": 50_000})                  # despesa enorme em 2027: prejuízo
    api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/2028", json={"valor": 50_000})
    _put(api, vid, "dist_pct", 2027, 100); _put(api, vid, "dist_valor", 2028, 30)
    lucro = _lucro_dre(api, vid)
    assert lucro["2027"] < 0 and lucro["2028"] < 0
    d = _ler(api, vid)
    assert _l(d, "distribuicao")["2028"] == 0                                                          # percentual de um prejuízo: nada
    assert _l(d, "distribuicao")["2029"] == 30                                                         # valor base (mínimo): paga mesmo com prejuízo
    assert _l(d, "lucros")["2028"] == pytest.approx(_l(d, "lucros")["2027"] + lucro["2027"])           # o prejuízo reduz os lucros acumulados


def test_capital_e_ajustes_trazem_o_ano_anterior_e_podem_ser_alterados(api):
    vid = _cenario(api)
    d = _ler(api, vid)
    assert _l(d, "capital") == {"2027": 5000, "2028": 5000, "2029": 5000} and _l(d, "ajustes") == {"2027": 300, "2028": 300, "2029": 300}    # trazem o saldo realizado
    _put(api, vid, "capital", 2028, 6000)                                                              # alterado à mão: vale daí em diante
    _put(api, vid, "ajustes", 2029, -80)                                                               # ajustes de avaliação podem ser negativos
    d = _ler(api, vid)
    assert _l(d, "capital") == {"2027": 5000, "2028": 6000, "2029": 6000} and _l(d, "ajustes") == {"2027": 300, "2028": 300, "2029": -80}
    linha = next(l for s in d["resultado"] for l in s["linhas"] if l["id"] == "capital")
    assert linha["editavel"] and linha["alterado"] == {"2027": False, "2028": True, "2029": False} and linha["calculado"]["2028"] == 5000    # o calculado (o que viria do ano anterior) continua visível
    assert api.put(f"/api/versoes/{vid}/patrimonio/capital/2027", json={"valor": -1}).status_code == 422
    assert api.delete(f"/api/versoes/{vid}/patrimonio/capital").status_code == 200
    assert _l(_ler(api, vid), "capital") == {"2027": 5000, "2028": 5000, "2029": 5000}                 # voltou ao calculado
    assert api.delete(f"/api/versoes/{vid}/patrimonio/dist_pct").status_code == 422


def test_distribuicao_que_deixa_os_lucros_negativos_avisa(api):
    vid = _cenario(api)
    _put(api, vid, "dist_valor", 2026, 5000)
    d = _ler(api, vid)
    assert d["avisos"] and "2027" in d["avisos"][0] and "negativos" in d["avisos"][0]


def test_validacoes_e_replicar(api):
    vid = _cenario(api)
    put = lambda campo, ano, v: api.put(f"/api/versoes/{vid}/patrimonio/{campo}/{ano}", json={"valor": v})
    assert put("dist_valor", 2027, -1).status_code == 422 and put("dist_pct", 2027, 101).status_code == 422
    assert put("outro", 2027, 1).status_code == 422 and put("dist_valor", 2040, 1).status_code == 422
    assert put("dist_valor", 2025, 1).status_code == 422                                               # só o ano anterior ao horizonte (2026) também tem regra
    assert put("capital", 2026, 1).status_code == 422                                                  # capital só dentro do horizonte
    assert put("aporte", 2027, 1).status_code == 422
    assert put("dist_valor", 2026, 100).status_code == 200
    assert api.post(f"/api/versoes/{vid}/patrimonio/dist_valor/replicar", json={"ano": 2026}).json()["anos_alterados"] == 3
    assert _l(_ler(api, vid), "distribuicao") == {"2027": 100, "2028": 100, "2029": 100}
    assert api.post(f"/api/versoes/{vid}/patrimonio/dist_valor/replicar", json={"ano": 2029}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/patrimonio/capital/replicar", json={"ano": 2027}).status_code == 422
    r = api.post(f"/api/versoes/{vid}/patrimonio/replicar-todos", json={"ano": 2026})
    assert r.status_code == 200 and r.json() == {"campos": 2, "anos_alterados": 3}


def test_balanco_usa_o_patrimonio_projetado(api):
    vid = _cenario(api)
    _put(api, vid, "dist_valor", 2026, 150); _put(api, vid, "capital", 2028, 5700); _put(api, vid, "ajustes", 2029, 340)
    bp = tb._bp(api, vid)
    assert [tb._v(bp, "SP25", a) for a in (2027,)] == [pytest.approx(1050)]
    assert [tb._v(bp, "SP23", a) for a in (2027, 2028, 2029)] == [5000, 5700, 5700]
    assert [tb._v(bp, "SP24", a) for a in (2027, 2028, 2029)] == [300, 300, 340]
    l = next(x for x in bp["linhas"] if x["codigo"] == "SP25")
    assert l["origem"] == "Premissas de dividendos" and "distribuição de lucros" in l["explicacao"]
    lucro = _lucro_dre(api, vid)
    assert tb._v(bp, "SP26", 2027) == pytest.approx(lucro["2027"])                                      # o resultado do ano continua em Resultado do Exercício


def test_sem_realizado_acumula_so_os_resultados_projetados(api):
    tb._importar(api, BP_PL)
    vid = ti._versao(api)
    d = _ler(api, vid)
    assert d["saldo_inicial"] is None and _l(d, "anterior")["2027"] == 0 and _l(d, "lucros")["2027"] == 0


def test_trava_copia_e_comparacao(api):
    vid, _ = tr.cenario(api)
    tb._importar(api, BP_PL)
    _put(api, vid, "capital", 2027, 100)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/patrimonio/capital/2027", json={"valor": 1}).status_code == 409
    assert api.delete(f"/api/versoes/{vid}/patrimonio/capital").status_code == 409
    assert api.post(f"/api/versoes/{vid}/patrimonio/replicar-todos", json={"ano": 2027}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _l(_ler(api, rep), "capital")["2027"] == 100
    _put(api, rep, "capital", 2027, 160)
    c = api.get(f"/api/comparar-patrimonio?a={vid}&b={rep}").json()
    l = next(x for x in c["linhas"] if x["id"] == "capital")
    assert l["anos"]["2027"]["delta"] == 60
