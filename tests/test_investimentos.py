import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
import test_balanco as tb
import test_realizado as trl
import test_resultado as tr


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _versao(api):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]


def _classes(api):
    return {c["nome"]: c["id"] for c in api.get(f"/api/versoes/{_versao(api)}/investimentos").json()["classificacoes"]}


def _tipo(api, nome="Obras", natureza="investimento", conta="SA20", classe="Expansão", carrega=True, **extra):
    d = {"nome": nome, "natureza": natureza, "conta_codigo": conta, "classificacao_id": _classes(api)[classe], "carrega_saldo": carrega}
    d.update(extra)
    r = api.post("/api/investimentos/tipos", json=d)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _put(api, vid, tid, campo, ano, v):
    return api.put(f"/api/versoes/{vid}/investimentos/{tid}/{campo}/{ano}", json={"valor": v})


def _inv(api, vid):
    return api.get(f"/api/versoes/{vid}/investimentos").json()


def _linha(tipo, id_):
    return next(l for l in tipo["linhas"] if l["id"] == id_)["valores"]


def test_classificacoes_iniciais_e_nova_classificacao(api):
    nomes = list(_classes(api))
    assert nomes == ["Expansão", "Manutenção", "Melhoria da Capacidade Produtiva", "Substituição", "Redução de Risco de Produção", "A Classificar"]
    assert api.post("/api/investimentos/classificacoes", json={"nome": "Sustentabilidade"}).status_code == 200
    assert "Sustentabilidade" in _classes(api)
    assert api.post("/api/investimentos/classificacoes", json={"nome": "sustentabilidade"}).status_code == 422       # repetida, sem diferenciar maiúscula
    assert api.post("/api/investimentos/classificacoes", json={"nome": "  "}).status_code == 422


def test_cadastro_de_tipos_e_validacoes(api):
    tb._importar(api)
    _tipo(api)
    base = {"nome": "Máquinas", "natureza": "investimento", "conta_codigo": "SA20", "classificacao_id": _classes(api)["Substituição"]}
    assert api.post("/api/investimentos/tipos", json={**base, "nome": " "}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "natureza": "venda"}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "conta_codigo": "SP08"}).status_code == 422         # passivo não recebe investimento
    assert api.post("/api/investimentos/tipos", json={**base, "conta_codigo": "SA"}).status_code == 422            # grupo, não conta
    assert api.post("/api/investimentos/tipos", json={**base, "conta_codigo": "XX"}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "classificacao_id": 999}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "nome": "obras"}).status_code == 422                 # nome repetido
    desinv = _tipo(api, "Venda de máquinas", "desinvestimento", carrega=True)                                      # desinvestimento nunca carrega saldo
    cad = {t["id"]: t for t in _inv(api, _versao(api))["cadastro"]}
    assert cad[desinv]["carrega_saldo"] is False and cad[desinv]["classificacao"] == "Expansão"


def test_sem_estrutura_do_balanco_pede_a_importacao(api):
    d = {"nome": "Obras", "natureza": "investimento", "conta_codigo": "SA20", "classificacao_id": 1}
    r = api.post("/api/investimentos/tipos", json=d)
    assert r.status_code == 422 and "Importe antes a estrutura" in r.json()["erro"]
    assert _inv(api, _versao(api))["estrutura"] is False


def test_saldo_do_ano_anterior_e_investido_com_saldo_a_carregar(api):
    tb._importar(api)
    tid = _tipo(api)
    vid = _versao(api)
    for campo, ano, v in (("saldo_ini", 2027, 1000), ("novo", 2027, 500), ("a_carregar", 2027, 300), ("novo", 2028, 400)):
        assert _put(api, vid, tid, campo, ano, v).status_code == 200
    t = _inv(api, vid)["tipos"][0]
    assert _linha(t, "saldo_ini") == {"2027": 1000, "2028": 300, "2029": 0}                      # 2028 traz o saldo a carregar de 2027
    assert _linha(t, "total") == {"2027": 1500, "2028": 700, "2029": 0}                          # 1.000 + 500; 300 + 400
    assert _linha(t, "investido") == {"2027": 1200, "2028": 700, "2029": 0}                      # 1.500 − 300; 700 − 0
    assert _linha(t, "a_carregar")["2027"] == 300 and t["avisos"] == []
    assert [l["editavel"]["2028"] for l in t["linhas"]] == [False, True, False, True, False, True]     # saldo do ano anterior só se digita no 1º ano


def test_saldo_a_carregar_maior_que_o_total_e_limitado_com_aviso(api):
    tb._importar(api)
    tid = _tipo(api)
    vid = _versao(api)
    _put(api, vid, tid, "novo", 2027, 100)
    _put(api, vid, tid, "a_carregar", 2027, 250)
    t = _inv(api, vid)["tipos"][0]
    assert _linha(t, "investido")["2027"] == 0 and _linha(t, "saldo_ini")["2028"] == 100         # leva só os 100 que existem
    assert "2027" in t["avisos"][0] and "maior que o total" in t["avisos"][0]


def test_tipo_sem_saldo_e_desinvestimento(api):
    tb._importar(api)
    maq = _tipo(api, "Máquinas", carrega=False, conta="SA10", classe="Substituição")
    ven = _tipo(api, "Venda de máquinas", "desinvestimento", conta="SA10", classe="Substituição")
    vid = _versao(api)
    _put(api, vid, maq, "novo", 2027, 100); _put(api, vid, ven, "novo", 2027, 40); _put(api, vid, ven, "novo", 2028, 10)
    d = _inv(api, vid)
    por_nome = {t["nome"]: t for t in d["tipos"]}
    assert [l["id"] for l in por_nome["Máquinas"]["linhas"]] == ["novo", "financiado"] and por_nome["Máquinas"]["linhas"][0]["nome"] == "Orçamento do ano (investido)"
    assert por_nome["Venda de máquinas"]["linhas"][0]["nome"] == "Desinvestimento do ano"
    assert _put(api, vid, maq, "a_carregar", 2027, 5).status_code == 422                         # não carrega saldo
    assert _put(api, vid, ven, "saldo_ini", 2027, 5).status_code == 422
    t = d["resumo"]["totais"]
    assert t["investido"]["2027"] == 100 and t["desinvestido"]["2027"] == 40 and t["liquido"] == {"2027": 60, "2028": -10, "2029": 0}


def test_validacoes_dos_valores(api):
    tb._importar(api)
    tid = _tipo(api)
    vid = _versao(api)
    assert _put(api, vid, tid, "novo", 2027, -1).status_code == 422
    assert _put(api, vid, tid, "novo", 2040, 1).status_code == 422
    assert _put(api, vid, tid, "saldo_ini", 2028, 1).status_code == 422                          # só no primeiro ano
    assert _put(api, vid, tid, "outro", 2027, 1).status_code == 422
    assert _put(api, vid, 999, "novo", 2027, 1).status_code == 404


def test_resumo_por_classificacao_e_por_conta(api):
    tb._importar(api)
    a = _tipo(api, "Obras", conta="SA20", classe="Expansão", carrega=False)
    b = _tipo(api, "Pivôs", conta="SA20", classe="Manutenção", carrega=False)
    c = _tipo(api, "Frota", conta="SA10", classe="Expansão", carrega=False)
    vid = _versao(api)
    _put(api, vid, a, "novo", 2027, 100); _put(api, vid, b, "novo", 2027, 50); _put(api, vid, c, "novo", 2027, 30)
    r = _inv(api, vid)["resumo"]
    assert {x["nome"]: x["investido"]["2027"] for x in r["por_classificacao"]} == {"Expansão": 130, "Manutenção": 50}
    assert {x["codigo"]: x["liquido"]["2027"] for x in r["por_conta"]} == {"SA20": 150, "SA10": 30}


def test_tipo_inativo_sai_da_tela_e_excluir_exige_tipo_sem_valores(api):
    tb._importar(api)
    tid = _tipo(api)
    vid = _versao(api)
    _put(api, vid, tid, "novo", 2027, 10)
    assert api.delete(f"/api/investimentos/tipos/{tid}").status_code == 422                      # tem valores: desative
    d = {"nome": "Obras", "natureza": "investimento", "conta_codigo": "SA20", "classificacao_id": _classes(api)["Expansão"], "carrega_saldo": True, "ativo": False}
    assert api.put(f"/api/investimentos/tipos/{tid}", json=d).status_code == 200
    assert _inv(api, vid)["tipos"] == [] and _put(api, vid, tid, "novo", 2028, 1).status_code == 422
    livre = _tipo(api, "Outro", carrega=False)
    assert api.delete(f"/api/investimentos/tipos/{livre}").status_code == 200


def test_nao_troca_natureza_com_valores(api):
    tb._importar(api)
    tid = _tipo(api)
    vid = _versao(api)
    _put(api, vid, tid, "novo", 2027, 10)
    d = {"nome": "Obras", "natureza": "desinvestimento", "conta_codigo": "SA20", "classificacao_id": _classes(api)["Expansão"]}
    assert api.put(f"/api/investimentos/tipos/{tid}", json=d).status_code == 422


def test_replicar_trava_e_copia_da_versao(api):
    tb._importar(api)
    vid, _ = tr.cenario(api)                                                                      # versão que pode ser aprovada (ano base 2027)
    tid = _tipo(api)
    _put(api, vid, tid, "novo", 2027, 500); _put(api, vid, tid, "a_carregar", 2027, 50)
    assert api.post(f"/api/versoes/{vid}/investimentos/{tid}/novo/replicar", json={"ano": 2027}).json()["anos_alterados"] >= 1
    t = next(t for t in _inv(api, vid)["tipos"])
    assert all(_linha(t, "novo")[str(a)] == 500 for a in (2027, 2028, 2029))
    assert api.post(f"/api/versoes/{vid}/investimentos/{tid}/saldo_ini/replicar", json={"ano": 2027}).status_code == 422
    r = api.post(f"/api/versoes/{vid}/investimentos/replicar-todos", json={"ano": 2027})
    assert r.status_code == 200 and r.json()["campos"] == 3
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert _put(api, vid, tid, "novo", 2027, 1).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _linha(_inv(api, rep)["tipos"][0], "novo")["2028"] == 500                              # o Reprojetado nasce com os valores


def test_comparar_versoes(api):
    tb._importar(api)
    vid, _ = tr.cenario(api)
    tid = _tipo(api, carrega=False)
    _put(api, vid, tid, "novo", 2027, 100)
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    _put(api, rep, tid, "novo", 2027, 160)
    c = api.get(f"/api/comparar-investimentos?a={vid}&b={rep}").json()
    l = next(x for x in c["linhas"] if x["id"] == tid)
    assert l["anos"]["2027"] == {"a": 100, "b": 160, "delta": 60, "pct": 60.0}
    assert next(x for x in c["linhas"] if x["id"] == "total")["anos"]["2027"]["delta"] == 60


def test_balanco_acumula_saldo_realizado_mais_investido_menos_desinvestido(api):
    tb._importar(api)
    trl._subir(api, trl._planilha([(2025, "BP", "SA20", "Terras", 5_000_000)]))                 # saldo realizado: R$ 5.000 mil
    vid = _versao(api)
    obras = _tipo(api, "Obras", conta="SA20")
    venda = _tipo(api, "Venda de terra", "desinvestimento", conta="SA20")
    for campo, ano, v in (("saldo_ini", 2027, 1000), ("novo", 2027, 500), ("a_carregar", 2027, 300), ("novo", 2028, 400)):
        _put(api, vid, obras, campo, ano, v)
    _put(api, vid, venda, "novo", 2028, 100)
    d = tb._bp(api, vid)
    assert d["saldo_inicial"] == {"ano": 2025}
    assert [tb._v(d, "SA20", a) for a in (2027, 2028, 2029)] == [6200, 6800, 6800]                # 5.000+1.200 | +700−100 | sem movimento
    l = next(x for x in d["linhas"] if x["codigo"] == "SA20")
    assert l["origem"] == "Investimentos · tipos vinculados" and "A depreciação está na depreciação acumulada" in l["explicacao"]
    assert tb._v(d, "SA10", 2027) == 0                                                            # conta sem tipo vinculado continua zerada


def test_balanco_sem_realizado_parte_de_zero(api):
    tb._importar(api)
    vid = _versao(api)
    t = _tipo(api, "Obras", conta="SA20", carrega=False)
    _put(api, vid, t, "novo", 2027, 800)
    d = tb._bp(api, vid)
    assert [tb._v(d, "SA20", a) for a in (2027, 2028)] == [800, 800]


def test_classificacoes_semeadas_so_uma_vez(tmp_path, monkeypatch):
    import sqlite3
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "s.db")
    db.iniciar(); db.iniciar()
    con = sqlite3.connect(db.DB_PATH)
    assert con.execute("SELECT COUNT(*) FROM investimento_classificacoes").fetchone()[0] == 6
    con.close()


# ---------------------------------------------------------------- depreciação
def _realizado_2025(api):
    """Imobilizado bruto R$ 500.000 mil (400.000 líquido + 100.000 de depreciação acumulada) e depreciação de 2025 de R$ 20.000 mil: taxa média de 4%."""
    trl._subir(api, trl._planilha([(2025, "BP", "SA19", "Imobilizado", 400_000_000), (2025, "BP", "SA26", "Depreciação acumulada", -100_000_000),
                                   (2025, "DRE", "DS047", "(-) Depreciação", -20_000_000)]))


def _cenario_depreciacao(api):
    tb._importar(api)
    _realizado_2025(api)
    vid = _versao(api)
    abacate = _tipo(api, "Abacate", conta="SA20", carrega=False, vida_util=10, residual_pct=10, carencia=2)
    frota = _tipo(api, "Frota", conta="SA10", carrega=False, vida_util=5, residual_pct=0, carencia=0, classe="Substituição")
    _put(api, vid, abacate, "novo", 2027, 1000); _put(api, vid, abacate, "novo", 2028, 500)
    _put(api, vid, frota, "novo", 2027, 100); _put(api, vid, frota, "novo", 2028, 50)
    return vid, abacate, frota


def _dep(api, vid):
    d = _inv(api, vid)["depreciacao"]
    return d, {l["chave"]: l for l in d["linhas"]}


def test_depreciacao_dos_existentes_usa_a_taxa_media_do_realizado(api):
    vid, _, _ = _cenario_depreciacao(api)
    d, l = _dep(api, vid)
    assert d["existente"]["bruto"] == pytest.approx(500_000) and d["existente"]["depreciacao_ano"] == pytest.approx(20_000)
    assert d["taxa"] == pytest.approx(4.0) and d["taxa_alterada"] is False
    assert l["existentes"]["valores"] == {"2027": pytest.approx(20_000), "2028": pytest.approx(20_000), "2029": pytest.approx(20_000)}   # 4% × 500.000


def test_depreciacao_dos_novos_por_vida_util_residual_e_carencia(api):
    vid, abacate, frota = _cenario_depreciacao(api)
    d, l = _dep(api, vid)
    assert l[f"tipo-{abacate}"]["valores"] == {"2027": 0, "2028": 0, "2029": pytest.approx(90)}           # 1.000 × 90% ÷ 10 anos, depois de 2 anos de carência
    assert l[f"tipo-{frota}"]["valores"] == {"2027": pytest.approx(20), "2028": pytest.approx(30), "2029": pytest.approx(30)}   # 100 ÷ 5; + 50 ÷ 5 a partir de 2028
    assert d["total"] == {"2027": pytest.approx(20_020), "2028": pytest.approx(20_030), "2029": pytest.approx(20_120)}
    assert "carência 2 ano(s)" in l[f"tipo-{abacate}"]["regra"]


def test_depreciacao_para_ao_fim_da_vida_util(api):
    tb._importar(api)
    vid = _versao(api)
    t = _tipo(api, "Curto", conta="SA10", carrega=False, vida_util=2, residual_pct=0, carencia=0)
    _put(api, vid, t, "novo", 2027, 100)
    _, l = _dep(api, vid)
    assert l[f"tipo-{t}"]["valores"] == {"2027": 50, "2028": 50, "2029": 0}                             # 2 anos e acabou
    assert l["existentes"]["valores"] == {"2027": 0, "2028": 0, "2029": 0}                              # sem realizado: sem base


def test_tipo_sem_vida_util_e_desinvestimento_nao_depreciam(api):
    tb._importar(api)
    vid = _versao(api)
    terra = _tipo(api, "Terras novas", conta="SA20", carrega=False)                                    # vida útil 0 = não deprecia
    venda = _tipo(api, "Venda", "desinvestimento", conta="SA10", vida_util=10)                          # desinvestimento ignora vida útil
    _put(api, vid, terra, "novo", 2027, 100); _put(api, vid, venda, "novo", 2027, 10)
    d, l = _dep(api, vid)
    assert list(l) == ["existentes"] and d["total"] == {"2027": 0, "2028": 0, "2029": 0}
    assert next(t for t in _inv(api, vid)["cadastro"] if t["id"] == venda)["vida_util"] == 0


def test_validacoes_da_depreciacao_do_tipo(api):
    tb._importar(api)
    base = {"nome": "X", "natureza": "investimento", "conta_codigo": "SA20", "classificacao_id": _classes(api)["Expansão"]}
    assert api.post("/api/investimentos/tipos", json={**base, "vida_util": 101}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "vida_util": -1}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "residual_pct": 100}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "carencia": -1}).status_code == 422
    assert api.post("/api/investimentos/tipos", json={**base, "vida_util": 10, "residual_pct": 20, "carencia": 3}).status_code == 200


def test_valor_alterado_a_mao_substitui_o_calculado_e_da_para_voltar(api):
    vid, abacate, _ = _cenario_depreciacao(api)
    assert api.put(f"/api/versoes/{vid}/depreciacao/existentes/2028", json={"valor": 0}).status_code == 200      # apagar: zera
    assert api.put(f"/api/versoes/{vid}/depreciacao/tipo-{abacate}/2027", json={"valor": 15}).status_code == 200   # ou digitar um valor
    d, l = _dep(api, vid)
    assert l["existentes"]["valores"]["2028"] == 0 and l["existentes"]["alterado"] == {"2027": False, "2028": True, "2029": False}
    assert l["existentes"]["calculado"]["2028"] == pytest.approx(20_000)                              # o calculado continua visível
    assert l[f"tipo-{abacate}"]["valores"]["2027"] == 15 and d["total"]["2027"] == pytest.approx(20_000 + 15 + 20)
    assert api.delete(f"/api/versoes/{vid}/depreciacao/existentes").status_code == 200
    assert _dep(api, vid)[1]["existentes"]["valores"]["2028"] == pytest.approx(20_000)


def test_taxa_media_pode_ser_alterada(api):
    vid, _, _ = _cenario_depreciacao(api)
    assert api.put(f"/api/versoes/{vid}/depreciacao/taxa/0", json={"valor": 2}).status_code == 200
    d, l = _dep(api, vid)
    assert d["taxa"] == 2 and d["taxa_alterada"] is True and d["taxa_calculada"] == pytest.approx(4.0)
    assert l["existentes"]["valores"]["2027"] == pytest.approx(10_000)                                 # 2% × 500.000
    assert api.put(f"/api/versoes/{vid}/depreciacao/taxa/0", json={"valor": 101}).status_code == 422
    api.delete(f"/api/versoes/{vid}/depreciacao/taxa")
    assert _dep(api, vid)[0]["taxa"] == pytest.approx(4.0)


def test_validacoes_dos_valores_de_depreciacao_e_trava(api):
    vid, abacate, _ = _cenario_depreciacao(api)
    assert api.put(f"/api/versoes/{vid}/depreciacao/existentes/2027", json={"valor": -1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/depreciacao/existentes/2040", json={"valor": 1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/depreciacao/outra/2027", json={"valor": 1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/depreciacao/tipo-999/2027", json={"valor": 1}).status_code == 422


def test_depreciacao_alterada_acompanha_a_copia_da_versao_e_a_trava(api):
    tb._importar(api)
    _realizado_2025(api)
    vid, _ = tr.cenario(api)
    api.put(f"/api/versoes/{vid}/depreciacao/existentes/2027", json={"valor": 123})
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/depreciacao/existentes/2027", json={"valor": 1}).status_code == 409
    assert api.delete(f"/api/versoes/{vid}/depreciacao/existentes").status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _dep(api, rep)[1]["existentes"]["valores"]["2027"] == 123


def test_depreciacao_vai_para_a_dre_e_para_a_depreciacao_acumulada_do_balanco(api):
    vid, _, _ = _cenario_depreciacao(api)
    dre = api.get(f"/api/versoes/{vid}/dre").json()
    l = next(x for x in dre["linhas"] if x["codigo"] == "DS047")
    assert [l["valores"][str(a)] for a in (2027, 2028, 2029)] == [pytest.approx(-20_020), pytest.approx(-20_030), pytest.approx(-20_120)]
    assert "Investimentos" in l["origem"]
    bp = tb._bp(api, vid)
    assert [tb._v(bp, "SA26", a) for a in (2027, 2028, 2029)] == [pytest.approx(-120_020), pytest.approx(-140_050), pytest.approx(-160_170)]   # −100.000 − 20.020 − 20.030 − 20.120
    assert next(x for x in bp["linhas"] if x["codigo"] == "SA26")["origem"] == "Investimentos · depreciação"


def test_banco_antigo_ganha_as_colunas_de_depreciacao_do_tipo(tmp_path, monkeypatch):
    import sqlite3
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "antigo3.db")
    con = sqlite3.connect(db.DB_PATH)
    con.execute("CREATE TABLE investimento_tipos(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE, natureza TEXT NOT NULL, conta_codigo TEXT NOT NULL, "
                "classificacao_id INTEGER NOT NULL, carrega_saldo INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL)")
    con.commit(); con.close()
    db.iniciar()
    con = sqlite3.connect(db.DB_PATH)
    assert {"vida_util", "residual_pct", "carencia"} <= {r[1] for r in con.execute("PRAGMA table_info(investimento_tipos)")}
    con.close()


# ---------------------------------------------------------------- desinvestimento reduz a base que deprecia
BP_IMOB = [("SA", "Ativo", "", "group"), ("SA06", "Circulante", "SA", "group"), ("SA10", "Estoque de produtos acabados", "SA06", "account"),
           ("SA16", "Não Circulante", "SA", "group"), ("SA19", "Imobilizado", "SA16", "group"), ("SA20", "Terras", "SA19", "account"),
           ("SA21", "Benfeitorias", "SA19", "account"), ("SA26", "(-) Depreciação acumulada de bens", "SA19", "account"),
           ("SP", "Passivo e patrimônio líquido", "", "group")]


def test_desinvestimento_reduz_a_base_depreciavel_dos_existentes(api):
    tb._importar(api, BP_IMOB)
    _realizado_2025(api)                                                                               # bruto 500.000 mil e taxa de 4%
    vid = _versao(api)
    venda = _tipo(api, "Venda de benfeitorias", "desinvestimento", conta="SA21")
    estoque = _tipo(api, "Baixa de estoque", "desinvestimento", conta="SA10")                          # fora do imobilizado: não mexe na depreciação
    _put(api, vid, venda, "novo", 2028, 100_000); _put(api, vid, estoque, "novo", 2028, 50_000)
    d, l = _dep(api, vid)
    assert d["base_depreciavel"] == {"2027": pytest.approx(500_000), "2028": pytest.approx(400_000), "2029": pytest.approx(400_000)}
    assert l["existentes"]["valores"] == {"2027": pytest.approx(20_000), "2028": pytest.approx(16_000), "2029": pytest.approx(16_000)}   # 4% × (500.000 − 100.000)
    assert d["desinvestido_acumulado"]["2029"] == pytest.approx(100_000)


def test_desinvestimentos_acumulam_e_a_base_nao_fica_negativa(api):
    tb._importar(api, BP_IMOB)
    _realizado_2025(api)
    vid = _versao(api)
    venda = _tipo(api, "Venda", "desinvestimento", conta="SA20")
    _put(api, vid, venda, "novo", 2027, 300_000); _put(api, vid, venda, "novo", 2028, 400_000)
    d, l = _dep(api, vid)
    assert d["base_depreciavel"] == {"2027": pytest.approx(200_000), "2028": 0, "2029": 0}              # 500.000 − 300.000; − 700.000 trava em zero
    assert l["existentes"]["valores"]["2027"] == pytest.approx(8_000) and l["existentes"]["valores"]["2028"] == 0


def test_desinvestimento_de_conta_sem_o_grupo_imobilizado_usa_sa20_a_sa25(api):
    tb._importar(api)                                                                                  # estrutura de teste sem o grupo SA19
    _realizado_2025(api)
    vid = _versao(api)
    venda = _tipo(api, "Venda", "desinvestimento", conta="SA20")
    _put(api, vid, venda, "novo", 2027, 100_000)
    assert _dep(api, vid)[0]["base_depreciavel"]["2027"] == pytest.approx(400_000)


# ---------------------------------------------------------------- o que já existe carrega para frente
BP_CARREGA = [("SA", "Ativo", "", "group"), ("SA06", "Circulante", "SA", "group"), ("SA10", "Estoque de produtos acabados", "SA06", "account"),
              ("SA16", "Não Circulante", "SA", "group"), ("SA17", "Realizável a longo prazo", "SA16", "account"), ("SA19", "Imobilizado", "SA16", "group"),
              ("SA20", "Terras", "SA19", "account"), ("SA21", "Benfeitorias", "SA19", "account"), ("SA26", "(-) Depreciação acumulada de bens", "SA19", "account"),
              ("SP", "Passivo e patrimônio líquido", "", "group"), ("SP06", "Circulante", "SP", "group"), ("SP09", "Impostos", "SP06", "account"),
              ("SP22", "Patrimônio Líquido", "SP", "group"), ("SP23", "Capital integralizado", "SP22", "account"), ("SP25", "Lucro e Prejuizo Acumulados", "SP22", "account")]


def test_contas_sem_regra_mantem_o_saldo_do_ultimo_balanco_realizado(api):
    tb._importar(api, BP_CARREGA)
    trl._subir(api, trl._planilha([(2025, "BP", "SA20", "Terras", 5_000_000), (2025, "BP", "SA21", "Benfeitorias", 2_000_000), (2025, "BP", "SA17", "Realizável", 300_000),
                                   (2025, "BP", "SP09", "Impostos", 40_000), (2025, "BP", "SP23", "Capital", 9_000_000), (2025, "BP", "SP25", "Lucros acumulados", 7_000_000)]))
    vid = _versao(api)
    d = tb._bp(api, vid)
    for cod, esperado in (("SA20", 5000), ("SA21", 2000), ("SA17", 300), ("SP23", 9000)):
        assert [tb._v(d, cod, a) for a in (2027, 2028, 2029)] == [esperado] * 3, cod
    l = next(x for x in d["linhas"] if x["codigo"] == "SA20")
    assert l["origem"] == "Balanço realizado · saldo mantido" and "carrega para frente" in l["explicacao"]
    assert [tb._v(d, "SP25", a) for a in (2027, 2028, 2029)] == [7000, 7000, 7000]                  # lucros acumulados: regra própria (patrimônio líquido), sem lucro nem distribuição não mudam


def test_o_que_for_cadastrado_vale_para_frente_sobre_o_saldo_que_ja_existia(api):
    tb._importar(api, BP_CARREGA)
    trl._subir(api, trl._planilha([(2025, "BP", "SA20", "Terras", 5_000_000), (2025, "BP", "SA21", "Benfeitorias", 2_000_000)]))
    vid = _versao(api)
    obras = _tipo(api, "Obras", conta="SA21", carrega=False)
    venda = _tipo(api, "Venda de terra", "desinvestimento", conta="SA20")
    _put(api, vid, obras, "novo", 2028, 400); _put(api, vid, venda, "novo", 2029, 1000)
    d = tb._bp(api, vid)
    assert [tb._v(d, "SA21", a) for a in (2027, 2028, 2029)] == [2000, 2400, 2400]                 # 2027 igual ao realizado; o investimento de 2028 vale daí em diante
    assert [tb._v(d, "SA20", a) for a in (2027, 2028, 2029)] == [5000, 5000, 4000]                 # a venda só reduz de 2029 em diante
    assert next(x for x in d["linhas"] if x["codigo"] == "SA21")["origem"] == "Investimentos · tipos vinculados"


def test_premissa_de_balanco_soma_sobre_o_saldo_mantido(api):
    tb._importar(api, BP_CARREGA)
    trl._subir(api, trl._planilha([(2025, "BP", "SA17", "Realizável", 300_000)]))
    vid = _versao(api)
    r = api.post("/api/premissas-dem", json={"nome": "Novo realizável", "demonstrativo": "balanco", "conta_codigo": "SA17", "sinal": 1, "tipo": "valor"})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": pid})
    api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/2028", json={"valor": 50})
    d = tb._bp(api, vid)
    assert [tb._v(d, "SA17", a) for a in (2027, 2028, 2029)] == [300, 350, 300]
    assert next(x for x in d["linhas"] if x["codigo"] == "SA17")["origem"] == "Balanço realizado · saldo mantido + premissas"


def test_retirar_tipo_so_desta_versao_apaga_valores_e_mantem_cadastro_e_outras_versoes(api):
    tb._importar(api)
    tid = _tipo(api)
    v1 = _versao(api)
    _put(api, v1, tid, "novo", 2027, 10)
    v2 = api.post("/api/versoes", json={"ano_base": 2028, "horizonte": 3}).json()["id"]
    _put(api, v2, tid, "novo", 2028, 5)
    assert api.delete(f"/api/investimentos/tipos/{tid}").status_code == 422
    assert api.post(f"/api/versoes/{v1}/investimentos/{tid}/retirar").status_code == 200
    d1, d2 = _inv(api, v1), _inv(api, v2)
    assert d1["tipos"] == [] and [t["id"] for t in d2["tipos"]] == [tid]
    assert [c["id"] for c in d1["cadastro"]] == [tid] and d1["cadastro"][0]["ativo"] is False
    assert _put(api, v1, tid, "novo", 2027, 1).status_code == 422
    assert api.post(f"/api/versoes/{v1}/investimentos/{tid}/incluir").status_code == 200
    d1 = _inv(api, v1)
    assert [t["id"] for t in d1["tipos"]] == [tid] and d1["resumo"]["totais"]["investido"]["2027"] == 0      # os valores foram apagados


def test_tipo_novo_so_entra_no_orcamento_se_for_adicionado(api):
    tb._importar(api)
    vid = _versao(api)
    base = {"nome": "Galpão", "natureza": "investimento", "conta_codigo": "SA20", "classificacao_id": _classes(api)["Expansão"], "versao_id": vid}
    solto = api.post("/api/investimentos/tipos", json={**base, "adicionar": False}).json()["id"]
    assert _inv(api, vid)["tipos"] == [] and [c["id"] for c in _inv(api, vid)["cadastro"]] == [solto]
    api.post(f"/api/versoes/{vid}/investimentos/{solto}/incluir")
    assert [t["id"] for t in _inv(api, vid)["tipos"]] == [solto]
    outro = api.post("/api/investimentos/tipos", json={**base, "nome": "Silo", "adicionar": True}).json()["id"]
    assert {t["id"] for t in _inv(api, vid)["tipos"]} == {solto, outro}
    v2 = api.post("/api/versoes", json={"ano_base": 2028, "horizonte": 3}).json()["id"]
    assert {t["id"] for t in _inv(api, v2)["tipos"]} == {solto, outro}      # versão criada depois: todo tipo cadastrado entra por padrão
