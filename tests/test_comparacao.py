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


def _cenario(api):
    vid, cid = td._ligado(api)                                            # Cenoura 10 ha x 1.000 kg x R$ 2; custo R$ 500/ha
    r = api.post(f"/api/versoes/{vid}/copiar", json={"nome": "Cenário otimista", "tipo": "revisao"})
    assert r.status_code == 200
    return vid, r.json()["id"], cid


def _comparar(api, base, outros, ano=2027, itens=("prem_precos", "dre"), impactos=True):
    r = api.post("/api/comparacao", json={"base": base, "outros": outros, "ano": ano, "itens": list(itens), "impactos": impactos})
    assert r.status_code == 200, r.text
    return r.json()


def test_cenario_copiado_nasce_igual_e_guarda_o_orcamento_pai(api):
    vid, filho, cid = _cenario(api)
    versoes = {v["id"]: v for v in api.get("/api/versoes").json()}
    assert versoes[filho]["origem_id"] == vid and versoes[filho]["tipo"] == "revisao" and versoes[filho]["nome"] == "Cenário otimista"
    r = _comparar(api, vid, [filho])
    assert all(s["linhas"] == [] for s in r["secoes"])                    # nada varia
    assert all(abs(k["delta"]) < 1e-9 for k in r["impactos"][0]["kpis"]) and r["impactos"][0]["fatores"] == []


def test_so_traz_o_que_varia_e_o_impacto_vai_para_o_grupo_certo(api):
    vid, filho, cid = _cenario(api)
    tr._preco(api, filho, cid, {2027: 3, 2028: 3})                        # preço de 2 para 3
    r = _comparar(api, vid, [filho])
    precos = next(s for s in r["secoes"] if s["id"] == "prem_precos")
    assert [l["nome"] for l in precos["linhas"]] == ["Cenoura"] and precos["linhas"][0]["valores"] == [2, 3]
    dre = next(s for s in r["secoes"] if s["id"] == "dre")
    assert any(l["nome"].startswith("(=) Receita Líquida") or "Receita" in l["nome"] for l in dre["linhas"])
    imp = r["impactos"][0]
    assert [f["grupo"] for f in imp["fatores"]] == ["Preços de venda"]
    rl = next(k for k in imp["kpis"] if k["id"] == "receita_liquida")
    assert rl["delta"] > 0 and imp["fatores"][0]["efeitos"]["receita_liquida"] == pytest.approx(rl["delta"])      # um grupo só: explica tudo
    assert abs(imp["combinado"]["receita_liquida"]) < 1e-6
    assert len(api.get("/api/versoes").json()) == 2                       # a cópia temporária foi apagada


def test_comparar_varios_com_o_base_e_validacoes(api):
    vid, filho, cid = _cenario(api)
    outro = api.post(f"/api/versoes/{vid}/copiar", json={"nome": "Conservador", "tipo": "revisao"}).json()["id"]
    tr._custo(api, outro, cid, "Frete", "direto", {2027: 100, 2028: 100})
    r = _comparar(api, vid, [filho, outro], itens=("prem_custos",), impactos=False)
    assert [o["nome"] for o in r["orcamentos"]][1:] == ["Cenário otimista", "Conservador"]
    custos = next(s for s in r["secoes"] if s["id"] == "prem_custos")
    assert len(custos["linhas"]) == 1 and custos["linhas"][0]["valores"][0] is None and custos["linhas"][0]["valores"][2] == 100
    assert api.post("/api/comparacao", json={"base": vid, "outros": [vid], "ano": 2027, "itens": []}).status_code == 422
    assert api.post("/api/comparacao", json={"base": vid, "outros": [filho], "ano": 2040, "itens": []}).status_code == 422
