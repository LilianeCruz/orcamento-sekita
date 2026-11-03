import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
import test_dre as td
import test_resultado as tr


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _lanc(api, vid, campo, ano, v):
    r = api.put(f"/api/versoes/{vid}/capital-giro/{campo}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _cg(api, vid):
    return api.get(f"/api/versoes/{vid}/capital-giro").json()


def _l(d, id_, ano):
    for sec in d["premissas"] + d["resultado"]:
        for l in sec["linhas"]:
            if l["id"] == id_:
                return l["valores"][str(ano)]
    raise KeyError(id_)


def _prazos(api, vid, ano=2027, **extra):
    base = {"dias_ano": 360, "dias_receber": 30, "dias_rotacao": 12, "dias_preparo": 24, "dias_insumos": 60, "dias_lavoura": 90,
            "dias_fornecedores": 36, "dias_outras": 72, "dias_trabalhistas": 18, "pct_caixa": 20}
    base.update(extra)
    for campo, v in base.items():
        _lanc(api, vid, campo, ano, v)


def test_estrutura_das_premissas_e_zerada_sem_dados(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = _cg(api, vid)
    assert [s["titulo"] for s in d["premissas"]] == ["Geral", "Prazo médio do ativo", "Prazo médio do passivo", "Contas de saldo (R$ mil)", "Caixa"]
    assert [l["id"] for l in d["premissas"][1]["linhas"]] == ["dias_receber", "dias_rotacao", "dias_preparo", "dias_insumos", "dias_lavoura"]
    assert [s["titulo"].split(" (")[0] for s in d["resultado"]] == ["Base", "Ativo circulante operacional", "Passivo circulante operacional", "Contas de saldo", "Capital de giro", "Ciclos", "Caixa"]
    assert _l(d, "ncg", 2027) == 0 and _l(d, "caixa", 2027) == 0 and _l(d, "giro", 2027) == 0
    assert d["origem"] == "Resultado por produto"                                         # sem a estrutura da DRE importada


def test_calculo_com_a_base_da_dre(api):
    vid, _ = td._ligado(api)                                                              # DRE: receita líquida 19, CPV 5 (R$ mil)
    _prazos(api, vid)
    d = _cg(api, vid)
    assert d["origem"] == "DRE"
    assert _l(d, "receita", 2027) == pytest.approx(19.0) and _l(d, "cpv", 2027) == pytest.approx(5.0)
    assert _l(d, "receber", 2027) == pytest.approx(19 * 30 / 360)                          # 1,5833
    assert _l(d, "rotacao", 2027) == pytest.approx(5 * 12 / 360)                           # 0,1667: dias sobre o CPV (custo da safra seguinte pago antes)
    assert _l(d, "preparo", 2027) == pytest.approx(5 * 24 / 360)                           # 0,3333
    assert _l(d, "insumos", 2027) == pytest.approx(5 * 60 / 360)                           # 0,8333
    assert _l(d, "lavoura", 2027) == pytest.approx(5 * 90 / 360)                           # 1,25
    assert _l(d, "fornecedores", 2027) == pytest.approx(5 * 36 / 360) and _l(d, "outras", 2027) == pytest.approx(1.0) and _l(d, "trabalhistas", 2027) == pytest.approx(0.25)
    assert _l(d, "ac", 2027) == pytest.approx(19 * 30 / 360 + 5 * 12 / 360 + 5 * 24 / 360 + 0 + 5 * 60 / 360 + 5 * 90 / 360)   # 4,1667
    assert _l(d, "pc", 2027) == pytest.approx(1.75)
    assert _l(d, "ncg", 2027) == pytest.approx(4.1667 - 1.75, abs=1e-3)
    assert _l(d, "caixa", 2027) == pytest.approx(1.0)                                      # 20 % do custo de produção (5)


def test_ciclos_e_giro(api):
    vid, _ = td._ligado(api)
    _prazos(api, vid)
    d = _cg(api, vid)
    assert _l(d, "ciclo_oper", 2027) == pytest.approx(0 + 30 + 90 + 60)                    # estoque PA 0 + receber + lavoura + insumos (a despesa antecipada não entra)
    assert _l(d, "ciclo_fin", 2027) == pytest.approx(180 - 36)
    assert _l(d, "giro", 2027) == pytest.approx(360 / 144)                                 # 2,5


def test_valores_por_ano_e_investimento_em_cg(api):
    vid, _ = td._ligado(api)
    _prazos(api, vid, 2027)
    _prazos(api, vid, 2028, dias_receber=60)                                              # em 2028 o prazo de recebimento dobra
    d = _cg(api, vid)
    assert _l(d, "receber", 2028) == pytest.approx(19 * 60 / 360)                          # 3,1667
    assert _l(d, "ncg", 2028) == pytest.approx(19 * 60 / 360 + 5 * 12 / 360 + 5 * 24 / 360 + 5 * 60 / 360 + 5 * 90 / 360 - 1.75)    # 4,0
    assert d["resultado"][4]["linhas"][1]["valores"]["2027"] is None                       # sem ano anterior no 1º ano
    assert _l(d, "inv_cg", 2028) == pytest.approx(4.0 - (4.1666667 - 1.75))                # 1,5833


def test_dias_no_ano_padrao_e_o_ano_real_e_pode_ser_alterado(api):
    vid, _ = td._ligado(api)
    d = _cg(api, vid)
    dias = d["premissas"][0]["linhas"][0]
    assert dias["valores"] == {"2027": 365.0, "2028": 366.0} and dias["padrao"] == {"2027": 365.0, "2028": 366.0}      # 2028 é bissexto
    assert dias["personalizado"] == {"2027": False, "2028": False}
    _lanc(api, vid, "dias_receber", 2027, 36); _lanc(api, vid, "dias_receber", 2028, 36)
    d = _cg(api, vid)
    assert _l(d, "receber", 2027) == pytest.approx(19 * 36 / 365) and _l(d, "receber", 2028) == pytest.approx(19 * 36 / 366)
    _lanc(api, vid, "dias_ano", 2027, 360)                                                 # a pessoa altera o ano de 2027
    d = _cg(api, vid)
    assert _l(d, "receber", 2027) == pytest.approx(19 * 36 / 360) and _l(d, "receber", 2028) == pytest.approx(19 * 36 / 366)
    assert d["premissas"][0]["linhas"][0]["personalizado"] == {"2027": True, "2028": False}
    _lanc(api, vid, "dias_ano", 2027, 0)                                                   # apagar volta ao padrão
    assert _l(_cg(api, vid), "receber", 2027) == pytest.approx(19 * 36 / 365)


def test_estoque_de_produtos_acabados_vem_do_resultado_e_mostra_os_dias(api):
    vid, _ = tr.cenario(api)                                                              # sem a DRE importada: usa o Resultado por cultura
    d = _cg(api, vid)
    assert d["origem"] == "Resultado por produto"
    assert _l(d, "receita", 2027) == pytest.approx(12.73) and _l(d, "cpv", 2027) == pytest.approx(3.75)
    assert _l(d, "estoque_pa", 2027) == pytest.approx(1.0)                                 # 2.000 kg x R$ 0,50
    assert not any(l["id"] == "dias_pa" for sec in d["premissas"] for l in sec["linhas"])      # estoque não é prazo médio: só o saldo aparece
    assert _l(d, "ciclo_oper", 2027) == 0                                                  # o estoque de produtos acabados não entra no ciclo
    _lanc(api, vid, "dias_insumos", 2027, 60)
    assert _l(_cg(api, vid), "insumos", 2027) == pytest.approx(3.75 * 60 / 365)


def test_validacoes(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    for campo in ("receber", "ncg", "x"):
        r = api.put(f"/api/versoes/{vid}/capital-giro/{campo}/2027", json={"valor": 1})
        assert r.status_code == 422 and "calculado pelo sistema" in r.json()["erro"]
    assert api.put(f"/api/versoes/{vid}/capital-giro/dias_receber/2040", json={"valor": 1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/capital-giro/dias_receber/2027", json={"valor": -1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/capital-giro/pct_caixa/2027", json={"valor": 101}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/capital-giro/dias_ano/2027", json={"valor": 0.5}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/capital-giro/dias_ano/2027", json={"valor": 0}).status_code == 200      # 0 = voltar ao padrão
    assert api.put("/api/versoes/999/capital-giro/dias_receber/2027", json={"valor": 1}).status_code == 404


def test_replicar_um_campo_e_todos(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    _prazos(api, vid)
    assert api.post(f"/api/versoes/{vid}/capital-giro/dias_receber/replicar", json={"ano": 2027}).json()["anos_alterados"] == 2
    d = _cg(api, vid)
    assert d["premissas"][1]["linhas"][0]["valores"]["2029"] == 30 and d["premissas"][1]["linhas"][1]["valores"]["2028"] == 0
    r = api.post(f"/api/versoes/{vid}/capital-giro/replicar-todos", json={"ano": 2027})
    assert r.json() == {"campos": 19, "anos_alterados": 2}
    assert _l(_cg(api, vid), "dias_lavoura", 2029) == 90
    assert api.post(f"/api/versoes/{vid}/capital-giro/ncg/replicar", json={"ano": 2027}).status_code == 422
    assert api.post(f"/api/versoes/{vid}/capital-giro/replicar-todos", json={"ano": 2029}).status_code == 422


def test_travada_reprojetado_e_comparacao(api):
    vid, _ = tr.cenario(api)                                                              # receita líquida 12,73 (R$ mil) em 2027
    _prazos(api, vid)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/capital-giro/dias_receber/2027", json={"valor": 1}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/capital-giro/dias_receber/replicar", json={"ano": 2027}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/capital-giro/replicar-todos", json={"ano": 2027}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _l(_cg(api, rep), "receber", 2027) == pytest.approx(12.73 * 30 / 360)          # o Reprojetado nasce com os prazos
    _lanc(api, rep, "dias_receber", 2027, 60)
    assert _l(_cg(api, vid), "receber", 2027) == pytest.approx(12.73 * 30 / 360)          # orçado intacto
    c = api.get(f"/api/comparar-capital-giro?a={vid}&b={rep}").json()
    ln = {l["id"]: l for l in c["linhas"]}
    assert ln["dias_receber"]["anos"]["2027"] == {"a": 30, "b": 60, "delta": 30, "pct": 100.0}
    assert ln["receber"]["anos"]["2027"]["delta"] == pytest.approx(12.73 * 30 / 360)
    assert ln["inv_cg"]["anos"]["2027"]["a"] == 0                                         # None vira 0 na comparação


def test_banco_antigo_ganha_a_tabela(tmp_path, monkeypatch):
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
        assert c.get("/api/versoes/1/capital-giro").json()["premissas"][0]["linhas"][0]["id"] == "dias_ano"


def test_impostos_a_pagar_calculados_sobre_as_deducoes_da_receita_e_somados_ao_passivo(api):
    vid, _ = td._ligado(api)
    _prazos(api, vid, dias_impostos=30)
    d = _cg(api, vid)
    ded = _l(d, "deducoes", 2027)
    assert ded > 0 and _l(d, "impostos", 2027) == pytest.approx(ded * 30 / 360)
    assert _l(d, "pc", 2027) == pytest.approx(1.75 + ded * 30 / 360)                                       # fornecedores + outras + trabalhistas (1,75) + impostos
