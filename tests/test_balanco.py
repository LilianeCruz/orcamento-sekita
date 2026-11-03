import datetime as dt
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app import db
from app.main import app
import test_dre as td
import test_resultado as tr
from test_dividas import linha as linha_divida, xlsx as xlsx_divida

BP = [("SA", "Ativo", "", "group"), ("SA06", "Circulante", "SA", "group"), ("SA07", "Caixa e aplicações financeiras", "SA06", "account"),
      ("SA10", "Estoque de produtos acabados", "SA06", "account"), ("SA16", "Não Circulante", "SA", "group"),
      ("SA20", "Terras", "SA16", "account"), ("SA26", "(-) Depreciação acumulada de bens", "SA16", "account"),
      ("SP", "Passivo e patrimônio líquido", "", "group"), ("SP06", "Circulante", "SP", "group"),
      ("SP08", "Dívida Custeio + Capital de Giro", "SP06", "account"), ("SP12", "CPLTD - Amortização Dívida Bancária Existente", "SP06", "account"),
      ("SP16", "Não Circulante", "SP", "group"), ("SP17", "Dívida Custeio + Capital de Giro", "SP16", "account"),
      ("SP18", "Dívida Bancária Investimentos", "SP16", "account"), ("SP22", "Patrimônio Líquido", "SP", "group"),
      ("SP23", "Capital integralizado", "SP22", "account"), ("SP26", "Resultado do Exercício", "SP22", "account")]


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _importar(api, bp=BP):
    wb = load_workbook(io.BytesIO(td.xlsx(sint=td.SINT_LIGADA)))
    ws = wb.create_sheet("BP Sintético")
    ws.append(td.COLS)
    for i, (c, n, p, k) in enumerate(bp, 1):
        ws.append([c, n, p, k, i * 10, True, "", "", ""])
    buf = io.BytesIO(); wb.save(buf)
    r = api.post("/api/dre/importar", params={"arquivo": "f.xlsx"}, content=buf.getvalue(), headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200, r.text


def _bp(api, vid):
    return api.get(f"/api/versoes/{vid}/balanco-patrimonial").json()


def _v(d, codigo, ano):
    return next(l for l in d["linhas"] if l["codigo"] == codigo)["valores"][str(ano)]


def _dividas(api, vid):
    """Custeio R$ 1.000 mil vence 03/2028; Investimento R$ 200 mil vence 09/2028 e R$ 600 mil vence 06/2030."""
    linhas = [linha_divida(tipo="Custeio", venc=dt.datetime(2028, 3, 10), principal=1_000_000.0, juros=0.0, doc="1/1"),
              linha_divida(tipo="Investimento", venc=dt.datetime(2028, 9, 1), principal=200_000.0, juros=0.0, doc="2/1"),
              linha_divida(tipo="Investimento", venc=dt.datetime(2030, 6, 1), principal=600_000.0, juros=0.0, doc="3/1")]
    r = api.post("/api/dividas/importar", params={"arquivo": "d.xlsx", "versao_id": vid}, content=xlsx_divida(linhas),
                 headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200, r.text


def test_sem_estrutura_pede_a_importacao(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = _bp(api, vid)
    assert d["estrutura"] is False and d["linhas"] == []


def test_estrutura_e_hierarquia_do_bp_sintetico(api):
    _importar(api)
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = _bp(api, vid)
    assert d["estrutura"] is True
    assert [(l["nivel"], l["nome"]) for l in d["linhas"]][:5] == [(0, "Ativo"), (1, "Circulante"), (2, "Caixa e aplicações financeiras"),
                                                                    (2, "Estoque de produtos acabados"), (2, "Estoque de gado de corte")]
    tipos = {l["codigo"]: l["calculo"] for l in d["linhas"]}
    assert tipos["SA"] == "soma" and tipos["SA06"] == "soma" and tipos["SA07"] == "entrada" and tipos["DIF"] == "diferenca"


def test_dividas_caem_em_curto_e_longo_por_tipo(api):
    _importar(api)
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    _dividas(api, vid)
    d = _bp(api, vid)
    # saldo em 31/12/2027: vence em 2028 = curto; de 2029 em diante = longo
    assert _v(d, "SP08", 2027) == pytest.approx(1000.0)                 # custeio que vence em 2028
    assert _v(d, "SP12", 2027) == pytest.approx(200.0)                  # investimento que vence em 2028
    assert _v(d, "SP17", 2027) == 0                                     # nenhum custeio depois de 2028
    assert _v(d, "SP18", 2027) == pytest.approx(600.0)                  # investimento que vence em 2030
    assert _v(d, "SP06", 2027) == pytest.approx(1200.0) and _v(d, "SP16", 2027) == pytest.approx(600.0)
    assert _v(d, "SP", 2027) == pytest.approx(1800.0)
    # 31/12/2028: o custeio e o investimento de 2028 já foram pagos; o de 2030 ainda é longo prazo (vence depois de 2029)
    assert _v(d, "SP08", 2028) == 0 and _v(d, "SP12", 2028) == 0 and _v(d, "SP18", 2028) == pytest.approx(600.0)
    # 31/12/2029: o investimento de 2030 passa para o curto prazo
    assert _v(d, "SP12", 2029) == pytest.approx(600.0) and _v(d, "SP18", 2029) == 0


def test_estoque_e_resultado_do_exercicio_vem_dos_modulos(api):
    vid, _ = td._ligado(api)                                            # importa a DRE ligada; o BP vem em seguida
    _importar(api)
    d = _bp(api, vid)
    assert _v(d, "SA10", 2027) == pytest.approx(0.0)                    # a cenoura do _ligado não estoca nada
    dre = api.get(f"/api/versoes/{vid}/dre").json()
    lucro = next(l for l in dre["linhas"] if l["codigo"] == "DS062")["valores"]["2027"]
    assert lucro != 0 and _v(d, "SP26", 2027) == pytest.approx(lucro)
    assert _v(d, "SP22", 2027) == pytest.approx(lucro)


def test_estoque_a_custo_das_culturas(api):
    vid, _ = tr.cenario(api)                                            # Cenoura: 2.000 kg estocados em 2027, custo médio R$ 0,50/kg
    _importar(api)
    d = _bp(api, vid)
    assert _v(d, "SA10", 2027) == pytest.approx(1.0)                    # 2.000 kg x R$ 0,50 = R$ 1 mil
    assert _v(d, "SA", 2027) - _v(d, "SA07", 2027) == pytest.approx(1.0)                              # o resto do ativo é o caixa de fechamento
    assert _v(d, "SA10", 2028) == 0                                     # vendido em 2028


def test_estoque_de_gado_tem_linha_propria_e_fecha_o_balanco(api):
    vid, _ = tr.cenario(api)
    _importar(api)
    cult = api.get("/api/culturas").json()["culturas"][0]
    assert cult["estoque_destino"] == "produto"
    corpo = {k: cult[k] for k in ("nome", "grupo", "unidade", "embalagem", "qtd_por_embalagem", "ativa", "receita_tipo")}
    assert api.put(f"/api/culturas/{cult['id']}", json={**corpo, "estoque_destino": "invalido"}).status_code == 422
    assert api.put(f"/api/culturas/{cult['id']}", json={**corpo, "estoque_destino": "gado"}).status_code == 200
    d = _bp(api, vid)
    assert _v(d, "SA10G", 2027) == pytest.approx(1.0) and _v(d, "SA10", 2027) == pytest.approx(0.0)      # o estoque saiu de produtos acabados e foi para gado
    assert _v(d, "SA06", 2027) == pytest.approx(_v(d, "SA07", 2027) + 1.0)                              # o grupo circulante soma a nova linha
    assert _v(d, "SA", 2027) - _v(d, "SA07", 2027) == pytest.approx(1.0)


def test_premissa_de_balanco_soma_na_conta_e_na_diferenca(api):
    _importar(api)
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    assert api.post("/api/premissas-dem", json={"nome": "Caixa", "demonstrativo": "balanco", "conta_codigo": "SA07", "sinal": 1}).status_code == 422     # o caixa vem do fluxo de caixa
    pid = api.post("/api/premissas-dem", json={"nome": "Terras novas", "demonstrativo": "balanco", "conta_codigo": "SA20", "sinal": 1}).json()["id"]
    dep = api.post("/api/premissas-dem", json={"nome": "Depreciação do ano", "demonstrativo": "balanco", "conta_codigo": "SA26", "sinal": -1}).json()["id"]
    for p in (pid, dep):
        api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": p})
    api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/2027", json={"valor": 500})
    api.put(f"/api/versoes/{vid}/premissas-dem/{dep}/2027", json={"valor": 80})
    d = _bp(api, vid)
    assert _v(d, "SA20", 2027) == 500 and _v(d, "SA26", 2027) == -80    # depreciação acumulada reduz o ativo
    assert _v(d, "SA", 2027) == pytest.approx(420)                      # caixa em zero: não há de onde pagar as terras
    assert _v(d, "SPAUTO", 2027) == pytest.approx(420)                  # o sistema gera dívida de giro automática, em linha própria, para cobrir (500 de terras − 80 de depreciação que não sai do caixa)
    assert _v(d, "SP08", 2027) == 0 and _v(d, "SP06", 2027) == pytest.approx(420)   # fica fora da dívida de custeio e entra na soma do passivo circulante
    assert next(l for l in d["linhas"] if l["codigo"] == "SPAUTO")["origem"] == "Fluxo de caixa · dívida de giro automática"
    assert _v(d, "DIF", 2027) == pytest.approx(0)                       # e o balanço fecha
    ln = next(l for l in d["linhas"] if l["codigo"] == "SA20")
    assert ln["premissas"] == ["Terras novas"] and ln["origem"] == "Balanço realizado · saldo mantido + premissas" or ln["origem"] == "Premissas · valores digitados"


def test_o_balanco_fecha_quando_ativo_e_passivo_se_igualam(api):
    _importar(api)
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    for nome, conta, valor in (("Terras", "SA20", 700), ("Capital", "SP23", 700)):
        dem = "balanco"
        p = api.post("/api/premissas-dem", json={"nome": nome, "demonstrativo": dem, "conta_codigo": conta, "sinal": 1}).json()["id"]
        api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": p})
        api.put(f"/api/versoes/{vid}/premissas-dem/{p}/2027", json={"valor": valor})
    assert _v(_bp(api, vid), "DIF", 2027) == 0


def test_explicacoes_e_comparacao(api):
    _importar(api)
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    _dividas(api, vid)
    d = _bp(api, vid)
    ln = {l["codigo"]: l for l in d["linhas"]}
    assert "vence até 31/12 do ano seguinte" in ln["SP08"]["explicacao"] and "Investimento" in ln["SP18"]["explicacao"]
    assert ln["SA06"]["explicacao"].startswith("Soma das linhas abaixo:") and ln["SA20"]["explicacao"].startswith("Ainda não há módulo")
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    p = api.post("/api/premissas-dem", json={"nome": "Terras", "demonstrativo": "balanco", "conta_codigo": "SA20", "sinal": 1}).json()["id"]
    api.post(f"/api/versoes/{rep}/premissas-dem/itens", json={"premissa_id": p})
    api.put(f"/api/versoes/{rep}/premissas-dem/{p}/2027", json={"valor": 50})
    c = api.get(f"/api/comparar-balanco-patrimonial?a={vid}&b={rep}").json()
    x = {l["codigo"]: l for l in c["linhas"]}["SA20"]["anos"]["2027"]
    assert x == {"a": 0, "b": 50, "delta": 50, "pct": None}


def test_capital_de_giro_calculado_vai_para_o_balanco_e_o_resto_fica_zerado(api):
    extra = [("SA08", "Contas a receber - Clientes", "SA06", "account"), ("SA09", "Outros créditos a receber", "SA06", "account"),
             ("SA11", "Estoque de insumos", "SA06", "account"), ("SA12", "Lavoura em formação", "SA06", "account"),
             ("SA13", "Rotação de cultura a apropriar", "SA06", "account"),
             ("SA14", "Preparo de solo e despesas de fazendas a apropriar", "SA06", "account"),
             ("SP07", "Contas a Pagar - Fornecedores", "SP06", "account"), ("SP10", "Outras Obrigações", "SP06", "account"),
             ("SP11", "Obrigações Trabalhistas", "SP06", "account")]
    _importar(api, BP + extra)
    vid, _ = td._ligado(api)                                                              # DRE: receita líquida 19 e CPV 5 (R$ mil) em 2027
    for campo, v in {"dias_ano": 360, "dias_receber": 30, "dias_rotacao": 12, "dias_preparo": 24, "dias_insumos": 60, "dias_lavoura": 90,
                     "dias_fornecedores": 36, "dias_outras": 72, "dias_trabalhistas": 18, "pct_caixa": 20}.items():
        assert api.put(f"/api/versoes/{vid}/capital-giro/{campo}/2027", json={"valor": v}).status_code == 200
    d = _bp(api, vid)
    assert _v(d, "SA08", 2027) == pytest.approx(19 * 30 / 360) and _v(d, "SA13", 2027) == pytest.approx(5 * 12 / 360) and _v(d, "SA14", 2027) == pytest.approx(5 * 24 / 360)
    assert _v(d, "SA11", 2027) == pytest.approx(5 * 60 / 360) and _v(d, "SA12", 2027) == pytest.approx(5 * 90 / 360)
    assert _v(d, "SP07", 2027) == pytest.approx(0.5) and _v(d, "SP10", 2027) == pytest.approx(1.0) and _v(d, "SP11", 2027) == pytest.approx(0.25)
    assert _v(d, "SA07", 2027) == pytest.approx(1.0)                                        # caixa: 20 % do CPV
    assert _v(d, "SA09", 2027) == 0 and _v(d, "SA20", 2027) == 0                            # outros créditos sem saldo digitado e terras sem módulo: zerados
    l = next(x for x in d["linhas"] if x["codigo"] == "SA08")
    assert l["origem"] == "Capital de giro · receber" and "prazo médio de receber" in l["explicacao"]
    assert next(x for x in d["linhas"] if x["codigo"] == "SA20")["origem"] is None


def test_outros_creditos_do_capital_de_giro_vai_para_a_conta(api):
    _importar(api, BP + [("SA09", "Outros créditos a receber", "SA06", "account")])
    vid, _ = td._ligado(api)
    assert api.put(f"/api/versoes/{vid}/capital-giro/saldo_outros_creditos/2027", json={"valor": 80}).status_code == 200
    d = _bp(api, vid)
    assert _v(d, "SA09", 2027) == 80 and _v(d, "SA09", 2028) == 0
    assert "saldo digitado por ano" in next(x for x in d["linhas"] if x["codigo"] == "SA09")["explicacao"]


def test_impostos_a_pagar_vem_do_capital_de_giro(api):
    _importar(api, BP + [("SP09", "Impostos", "SP06", "account")])
    vid, _ = td._ligado(api)
    for campo, v in {"dias_ano": 360, "dias_impostos": 30}.items():
        assert api.put(f"/api/versoes/{vid}/capital-giro/{campo}/2027", json={"valor": v}).status_code == 200
    ded = next(l for s in api.get(f"/api/versoes/{vid}/capital-giro").json()["resultado"] for l in s["linhas"] if l["id"] == "deducoes")["valores"]["2027"]
    d = _bp(api, vid)
    assert _v(d, "SP09", 2027) == pytest.approx(ded * 30 / 360) and ded > 0
    assert next(x for x in d["linhas"] if x["codigo"] == "SP09")["origem"] == "Capital de giro · impostos"
