import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
import test_dre as td
import test_realizado as trl


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


REAL = [  # R$: receita líquida R$ 3.660 mil / 3.650 mil; adm = 2% e 4% da receita líquida; custo (CPV) 1.830 mil; arrendamento 15% do CPV em 2025; revenda +40 / −20 mil
    (2024, "DRE", "DS018", "Receita Líquida", 3660000), (2025, "DRE", "DS018", "Receita Líquida", 3650000),
    (2024, "DRE", "DS020", "CPV", -1830000), (2025, "DRE", "DS020", "CPV", -1830000),
    (2024, "DRE", "DS038", "Despesas administrativas", -73200), (2025, "DRE", "DS038", "Despesas administrativas", -146000),
    (2025, "DRE", "DS032", "Despesas Arrendamentos", -274500),
    (2024, "DRE", "DS055", "Revenda", 40000), (2025, "DRE", "DS055", "Revenda", -20000),
]


def _cenario(api):
    vid, _ = td._ligado(api)                                              # Cenoura: receita bruta R$ 20 mil, receita líquida R$ 19 mil em 2027 e 2028
    assert trl._subir(api, trl._planilha(REAL)).status_code == 200
    return vid


def test_previa_mostra_o_percentual_e_a_media_do_realizado(api):
    vid = _cenario(api)
    p = api.get(f"/api/versoes/{vid}/dre-padrao/previa").json()
    adm = next(c for c in p["campos"] if c["codigo"] == "DS038")
    assert adm["unidade"] == "%" and adm["base"] == "Receita líquida"
    assert adm["por_ano"] == {"2024": pytest.approx(2.0), "2025": pytest.approx(4.0)}
    assert adm["por_opcao"]["2"] == pytest.approx(3.0)
    rev = next(c for c in p["campos"] if c["codigo"] == "DS055")
    assert rev["unidade"] == "R$ mil" and rev["por_opcao"]["2"] == pytest.approx(10.0)      # valor médio com sinal: (40 − 20) ÷ 2


def test_media_gravada_calcula_as_contas_na_dre(api):
    vid = _cenario(api)
    d0 = td._dre(api, vid)
    assert td._val(d0, "DS038", 2027) == 0                                # nada é gravado sozinho
    r = api.post(f"/api/versoes/{vid}/dre-padrao/atualizar", json={"anos": [2024, 2025]})
    assert r.status_code == 200 and r.json()["anos_alterados"] == 2
    d = td._dre(api, vid)
    assert td._val(d, "DS038", 2027) == pytest.approx(-0.03 * 19.0)      # 3% da receita líquida de R$ 19 mil
    assert td._val(d, "DS055", 2027) == pytest.approx(10.0)              # valor médio
    ln = next(l for l in d["linhas"] if l["codigo"] == "DS038")
    assert ln["origem"].startswith("Premissas da DRE")
    assert td._val(d, "DS032", 2027) != 0                                 # arrendamento: % do CPV (média 7,5%) no lugar da tela de arrendamentos


def test_digitar_replicar_e_validar(api):
    vid = _cenario(api)
    assert api.put(f"/api/versoes/{vid}/dre-padrao/DS038/2027", json={"valor": 5}).status_code == 200
    assert api.put(f"/api/versoes/{vid}/dre-padrao/DS038/2027", json={"valor": -1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/dre-padrao/DS009/2027", json={"valor": 1}).status_code == 422       # produção fica de fora
    assert api.put(f"/api/versoes/{vid}/dre-padrao/DS055/2027", json={"valor": -7}).status_code == 200      # revenda aceita sinal
    assert api.post(f"/api/versoes/{vid}/dre-padrao/DS038/replicar", json={"ano": 2027}).json()["anos_alterados"] == 1
    d = td._dre(api, vid)
    assert td._val(d, "DS038", 2028) == pytest.approx(-0.05 * 19.0)
    tela = api.get(f"/api/versoes/{vid}/dre-padrao").json()
    assert tela["ultimo_ano"] == 2025
    assert next(l for l in tela["resultado"] if l["codigo"] == "DS038")["realizado"] == pytest.approx(-146.0)
