import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app import db
from app.main import app
import test_resultado as tr


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _xlsx(wb):
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def _planilha(linhas):
    wb = Workbook()
    ws = wb.active
    ws.title = "Realizado"
    ws.append(["Ano", "Demonstrativo", "Código", "Conta", "Valor"])
    for l in linhas:
        ws.append(list(l))
    return _xlsx(wb)


# 2024 tem 366 dias: receita líquida 3.660.000 (10.000 por dia), CPV 1.830.000 (5.000 por dia)
# 2025 tem 365 dias: receita líquida 3.650.000 (10.000 por dia), CPV 1.825.000 (5.000 por dia)
DADOS = [
    (2024, "DRE", "DS018", "Receita Líquida", 3660000), (2024, "DRE", "DS020", "CPV", -1830000),
    (2024, "BP", "SA08", "Clientes", 450000), (2024, "BP", "SA13", "Rotação", 20000), (2024, "BP", "SA14", "Preparo", 30000),
    (2024, "BP", "SA11", "Insumos", 300000), (2024, "BP", "SP07", "Fornecedores", 180000),
    (2025, "DRE", "DS018", "Receita Líquida", 3650000), (2025, "DRE", "DS020", "CPV", -1825000),
    (2025, "BP", "SA08", "Clientes", 300000), (2025, "BP", "SA11", "Insumos", 365000), (2025, "BP", "SP07", "Fornecedores", 182500),
    (2025, "BP", "SA12", "Lavoura", 182500),
]


def _subir(api, conteudo, nome="realizado.xlsx"):
    return api.post(f"/api/realizado/importar?arquivo={nome}", content=conteudo, headers={"Content-Type": "application/octet-stream"})


def test_importa_planilha_e_mostra_em_reais_mil(api):
    r = _subir(api, _planilha(DADOS))
    assert r.status_code == 200, r.text
    assert r.json()["anos"] == [2024, 2025] and r.json()["linhas"] == len(DADOS)
    d = api.get("/api/realizado").json()
    assert d["anos"] == [2024, 2025] and d["ultimo_ano"] == 2025
    bp = {l["codigo"]: l["valores"] for l in d["bp"]}
    assert bp["SA08"] == {"2024": 450.0, "2025": 300.0}                                     # R$ 450.000 = R$ mil 450
    assert d["importacoes"]["2024"]["BP"]["arquivo"] == "realizado.xlsx"


def test_prazos_realizados_usam_os_dias_reais_de_cada_ano(api):
    _subir(api, _planilha(DADOS))
    p = api.get("/api/realizado").json()["prazos"]
    c = p["campos"]
    assert c["dias_receber"]["2024"] == pytest.approx(45.0) and c["dias_receber"]["2025"] == pytest.approx(30.0)   # 450.000 ÷ (3.660.000 ÷ 366)
    assert c["dias_insumos"]["2024"] == pytest.approx(60.0) and c["dias_insumos"]["2025"] == pytest.approx(73.0)   # 365.000 ÷ (1.825.000 ÷ 365)
    assert c["dias_fornecedores"]["2024"] == pytest.approx(36.0) and c["dias_fornecedores"]["2025"] == pytest.approx(36.5)
    assert c["dias_rotacao"]["2024"] == pytest.approx(4.0) and c["dias_preparo"]["2024"] == pytest.approx(6.0)   # 20.000 e 30.000 ÷ 5.000 por dia de CPV
    assert c["dias_lavoura"]["2025"] == pytest.approx(36.5) and c["dias_lavoura"]["2024"] == pytest.approx(0.0)


def test_subir_o_mesmo_ano_substitui(api):
    _subir(api, _planilha(DADOS))
    _subir(api, _planilha([(2025, "BP", "SA08", "Clientes", 600000)]))
    bp = {l["codigo"]: l["valores"] for l in api.get("/api/realizado").json()["bp"]}
    assert bp["SA08"]["2025"] == 600.0 and "SA11" in bp and bp["SA11"].get("2025") is None   # as demais contas de 2025 do BP saíram; 2024 ficou
    assert bp["SA08"]["2024"] == 450.0


def test_validacoes_da_planilha(api):
    assert _subir(api, _planilha([(2025, "XX", "SA08", "x", 1)])).status_code == 422
    assert _subir(api, _planilha([(None, "BP", "SA08", "x", 1)])).status_code == 422
    assert _subir(api, _planilha([(2025, "BP", "", "x", 1)])).status_code == 422
    assert _subir(api, _planilha([(2025, "BP", "SA08", "x", 1), (2025, "BP", "SA08", "x", 2)])).status_code == 422
    assert _subir(api, b"isto nao e excel").status_code == 422
    assert _subir(api, _planilha([(2025, "BP", "SA08", "x", None)])).status_code == 422     # nada para importar
    assert api.get("/api/realizado").json()["anos"] == []


def _fechamento(periodos, linhas):
    wb = Workbook()
    f = wb.active
    f.title = "Fechamentos"
    f.append(["id", "periodCode", "periodName", "start", "end", "createdAt"])
    for p in periodos:
        f.append([p[0], "x", "x", p[1], p[2], p[3] if len(p) > 3 else "2026-10-05T10:00:00"])
    l = wb.create_sheet("Fechamento Linhas")
    l.append(["closureId", "scope", "companyCode", "companyName", "statement", "view", "code", "name", "parent", "kind", "order", "amount"])
    for fid, escopo, dem, visao, cod, nome, v in linhas:
        l.append([fid, escopo, "", "", dem, visao, cod, nome, None, "account", 1, v])
    return _xlsx(wb)


TRI = [("T1", "2025-01-01", "2025-03-31"), ("T2", "2025-04-01", "2025-06-30"), ("T3", "2025-07-01", "2025-09-30"), ("T4", "2025-10-01", "2025-12-31")]


def test_fechamento_contabil_trimestral_soma_a_dre_e_pega_o_balanco_de_dezembro(api):
    linhas = []
    for fid, v in zip(["T1", "T2", "T3", "T4"], [100, 200, 300, 400]):
        linhas += [(fid, "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "(=) Receita Líquida", v * 1000),
                   (fid, "CONSOLIDADO", "BP", "SINTETICO", "SA08", "Clientes", v * 10)]
    linhas += [("T4", "CONSOLIDADO", "BP", "ANALITICO", "A011", "Caixa", 5),                       # analítico: fora
               ("T4", "EMPRESA", "BP", "SINTETICO", "SA08", "Clientes", 7),                          # por empresa: fora
               ("T4", "CONSOLIDADO", "DRE", "SINTETICO", "DS045", "Margem Ebitda (%)", 0.2)]         # margem em %: fora
    r = _subir(api, _fechamento(TRI, linhas), "fechamento-contabil.xlsx")
    assert r.status_code == 200, r.text
    assert r.json()["anos"] == [2025] and r.json()["linhas"] == 2 and r.json()["avisos"] == []
    d = api.get("/api/realizado").json()
    assert {l["codigo"]: l["valores"]["2025"] for l in d["bp"]} == {"SA08": 4.0}                     # só o 4T: R$ 4.000 = R$ mil 4
    assert {l["codigo"]: l["valores"]["2025"] for l in d["dre"]} == {"DS018": 1000.0}                # 100+200+300+400 mil = R$ mil 1.000


def test_fechamento_anual_unico_vale_como_esta(api):
    linhas = [("ANO", "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "Receita", 5000000), ("ANO", "CONSOLIDADO", "BP", "SINTETICO", "SA08", "Clientes", 900000)]
    r = _subir(api, _fechamento([("ANO", "2024-01-01", "2024-12-31")], linhas))
    assert r.status_code == 200 and r.json()["anos"] == [2024]
    assert api.get("/api/realizado").json()["dre"][0]["valores"]["2024"] == 5000.0


def test_fechamento_incompleto_importa_so_o_balanco_e_avisa(api):
    pers = [TRI[0], TRI[1], TRI[3]]                                                                  # falta o 3T
    linhas = [(fid, "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "Receita", 1000) for fid, _, _ in pers]
    linhas += [("T4", "CONSOLIDADO", "BP", "SINTETICO", "SA08", "Clientes", 8000)]
    r = _subir(api, _fechamento(pers, linhas))
    assert r.status_code == 200, r.text
    assert r.json()["demonstrativos"] == [{"ano": 2025, "demonstrativo": "BP"}] and "DRE não foi importada" in r.json()["avisos"][0]
    d = api.get("/api/realizado").json()
    assert d["dre"] == [] and d["ultimo_ano"] is None


def test_periodo_refeito_vale_o_mais_recente(api):
    linhas = [("T1", "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "Receita", 1000), ("T1B", "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "Receita", 1500),
              ("T2", "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "Receita", 2000), ("T3", "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "Receita", 3000),
              ("T4", "CONSOLIDADO", "DRE", "SINTETICO", "DS018", "Receita", 4000), ("T4", "CONSOLIDADO", "BP", "SINTETICO", "SA08", "Clientes", 1)]
    pers = [("T1", TRI[0][1], TRI[0][2], "2026-01-01"), ("T1B", TRI[0][1], TRI[0][2], "2026-02-01")] + TRI[1:]
    assert _subir(api, _fechamento(pers, linhas)).status_code == 200
    assert api.get("/api/realizado").json()["dre"][0]["valores"]["2025"] == pytest.approx(10.5)       # 1.500 + 2.000 + 3.000 + 4.000 = 10.500 R$ = 10,5 mil


def test_fechamento_sem_dezembro_e_recusado(api):
    assert _subir(api, _fechamento([TRI[0]], [])).status_code == 422


def test_excluir_ano(api):
    _subir(api, _planilha(DADOS))
    assert api.delete("/api/realizado/2025").status_code == 200
    d = api.get("/api/realizado").json()
    assert d["anos"] == [2024] and d["ultimo_ano"] == 2024
    assert api.delete("/api/realizado/2025").status_code == 404


def test_modelo_para_baixar_abre_e_importa(api):
    r = api.get("/api/realizado/modelo")
    assert r.status_code == 200 and r.content[:2] == b"PK"
    from openpyxl import load_workbook
    ws = load_workbook(io.BytesIO(r.content))["Realizado"]
    assert [c.value for c in ws[1]] == ["Ano", "Demonstrativo", "Código", "Conta", "Valor"]
    assert _subir(api, r.content).status_code == 422                                          # modelo em branco: nada para importar


def test_ano_com_so_balanco_nao_gera_prazo(api):
    _subir(api, _planilha([(2025, "BP", "SA08", "Clientes", 300000)]))
    d = api.get("/api/realizado").json()
    assert d["ultimo_ano"] is None and d["prazos"]["anos"] == []


# ---------------------------------------------------------------- Capital de giro usa o último ano realizado
def _cg(api, vid):
    return api.get(f"/api/versoes/{vid}/capital-giro").json()


def _l(d, id_, ano):
    for sec in d["premissas"] + d["resultado"]:
        for l in sec["linhas"]:
            if l["id"] == id_:
                return l["valores"][str(ano)]
    raise KeyError(id_)


def _atualizar(api, vid):
    return api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos")


def test_botao_atualiza_todos_os_prazos_com_o_ultimo_fechamento(api):
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = _cg(api, vid)
    assert d["realizado"]["ultimo_ano"] == 2025 and _l(d, "dias_insumos", 2027) == 0              # nada é preenchido sozinho
    r = _atualizar(api, vid)
    assert r.status_code == 200 and r.json() == {"ano_realizado": 2025, "anos_usados": [2025], "campos": 16, "anos_alterados": 3}
    d = _cg(api, vid)
    for ano in (2027, 2028, 2029):                                                                # replica para todos os anos do horizonte
        assert _l(d, "dias_receber", ano) == pytest.approx(30.0) and _l(d, "dias_fornecedores", ano) == pytest.approx(36.5)   # clientes e fornecedores também
        assert _l(d, "dias_insumos", ano) == pytest.approx(73.0) and _l(d, "dias_lavoura", ano) == pytest.approx(36.5)


def test_prazo_calculado_mostra_a_origem_e_digitar_remove_a_marca(api):
    _estrutura(api)
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    _atualizar(api, vid)
    linha = lambda: next(l for s in _cg(api, vid)["premissas"] for l in s["linhas"] if l["id"] == "dias_receber")
    assert linha()["origem"] == {"2027": 2025, "2028": 2025, "2029": 2025}
    assert "realizado de 2025" in linha()["explicacao"] and "Contas a receber - Clientes (SA08)" in linha()["explicacao"]
    assert "saldo de Contas a receber - Clientes (SA08) em 31/12/2025 = R$ 300 mil ÷ (receita líquida R$ 3.650 mil ÷ 365 dias) = 30,0 dias" in linha()["explicacao"]
    assert api.put(f"/api/versoes/{vid}/capital-giro/dias_receber/2028", json={"valor": 45}).status_code == 200      # a pessoa edita
    o = linha()["origem"]
    assert o["2028"] is None and o["2027"] == 2025 and _l(_cg(api, vid), "dias_receber", 2028) == 45


def test_replicar_leva_a_marca_de_origem_junto(api):
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    _atualizar(api, vid)
    linha = lambda: next(l for s in _cg(api, vid)["premissas"] for l in s["linhas"] if l["id"] == "dias_receber")
    api.put(f"/api/versoes/{vid}/capital-giro/dias_receber/2029", json={"valor": 5})
    assert linha()["origem"]["2029"] is None
    api.post(f"/api/versoes/{vid}/capital-giro/dias_receber/replicar", json={"ano": 2028})      # 2028 é calculado: 2029 volta a ser calculado
    assert linha()["valores"]["2029"] == pytest.approx(30.0) and linha()["origem"]["2029"] == 2025
    api.put(f"/api/versoes/{vid}/capital-giro/dias_receber/2027", json={"valor": 99})
    api.post(f"/api/versoes/{vid}/capital-giro/dias_receber/replicar", json={"ano": 2027})      # 2027 é digitado: os seguintes perdem a marca
    assert linha()["valores"]["2029"] == 99 and linha()["origem"]["2029"] is None


def test_copia_de_versao_leva_a_origem(api):
    _subir(api, _planilha(DADOS))
    vid, _ = tr.cenario(api)
    _atualizar(api, vid)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    linha = next(l for s in _cg(api, rep)["premissas"] for l in s["linhas"] if l["id"] == "dias_receber")
    assert linha["origem"]["2027"] == 2025 and linha["valores"]["2027"] == pytest.approx(30.0)


def test_botao_sem_realizado_ou_em_versao_travada(api):
    vid, _ = tr.cenario(api)
    assert _atualizar(api, vid).status_code == 422
    _subir(api, _planilha(DADOS))
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert _atualizar(api, vid).status_code == 409


def test_sem_realizado_o_capital_de_giro_segue_como_antes(api):
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = _cg(api, vid)
    assert d["realizado"] == {"anos": [], "ultimo_ano": None, "ncg_inicial": None} and _l(d, "dias_insumos", 2027) == 0


# ---------------------------------------------------------------- planilha "Fechamento Financeiro" (Balanco9anos + Comparativo de AV)
def _estrutura(api):
    con = db.conectar()
    con.executemany("INSERT INTO bp_linhas(codigo, nome, pai, tipo, ordem, ativa) VALUES(?,?,?,?,?,1)", [
        ("SA", "Ativo", "", "group", 0), ("SA06", "Circulante", "SA", "group", 1), ("SA08", "Contas a receber - Clientes", "SA06", "account", 2),
        ("SP", "Passivo e patrimônio líquido", "", "group", 10), ("SP06", "Circulante", "SP", "group", 11), ("SP10", "Outras Obrigações", "SP06", "account", 12),
        ("SP16", "Não Circulante", "SP", "group", 20), ("SP20", "Outras Obrigações", "SP16", "account", 21),
        ("SP12", "CPLTD - Amortização Dívida Bancária Existente", "SP06", "account", 13)])
    con.executemany("INSERT INTO dre_linhas(codigo, nivel, nome, pai, tipo, ordem, ativa) VALUES(?, 'sintetica', ?, '', 'account', ?, 1)", [
        ("DS009", "Alho", 1), ("DS018", "(=) Receita Líquida", 2), ("DS021", "Alho", 3), ("DS020", "(-) Custo do Produto Vendido", 2.5)])
    con.commit(); con.close()


def test_planilha_fechamento_financeiro(api):
    _estrutura(api)
    wb = Workbook()
    b = wb.active
    b.title = "Balanco9anos"
    b.append([None] * 3)                                                                  # linhas em branco antes dos anos, como na planilha real
    b.append([None, None, 2024, 2025, 2026, None, None, None, None, None, None, None, None, None, 2024, 2025, 2026])
    b.append([None, "Circulante", 10, 20, 30] + [None] * 8 + ["Circulante", 100, 200, 300])
    b.append([None, "Contas a receber - Clientes ", 1, 2, 3] + [None] * 8 + ["Outras Obrigações", 7, 8, 9])
    b.append([None, "ATIVO TOTAL", 11, 22, 33] + [None] * 8 + ["CPLTD - Amortização Dívida Bancária ", 5, 6, 7])
    b.append([None] * 13 + ["Não Circulante", None, None, None])
    b.append([None] * 13 + ["Outras Obrigações", 70, 80, 90])
    d = wb.create_sheet("Comparativo de AV")
    d.append(["DEMONSTRATIVO DO RESULTADO DO EXERCICIO"])
    d.append([None, 2024, "AV 2024", 2025, "AV 2025", 2026, "AV 2026"])
    d.append(["Alho ", 50, 1, 60, 1, 70, 1])
    d.append(["(=) Receita Líquida", 100, 1, 120, 1, 130, 1])
    d.append(["Linha que não existe na estrutura", 9, 0, 9, 0, 9, 0])
    d.append(["(-) Custo do Produto Vendido ", -40, 0, -50, 0, -55, 0])
    d.append(["Alho", -20, 0, -25, 0, -27, 0])
    r = _subir(api, _xlsx(wb), "Fechamento_Financeiro.xlsx")
    assert r.status_code == 200, r.text
    assert r.json()["anos"] == [2024, 2025] and "2026" in r.json()["avisos"][0]               # o ano em andamento fica de fora
    d = api.get("/api/realizado").json()
    bp = {l["codigo"]: l["valores"] for l in d["bp"]}
    assert bp["SA06"]["2025"] == pytest.approx(0.02) and bp["SA08"]["2024"] == pytest.approx(0.001) and bp["SA"]["2025"] == pytest.approx(0.022)
    assert bp["SP06"]["2025"] == pytest.approx(0.2) and bp["SP10"]["2025"] == pytest.approx(0.008)        # "Outras Obrigações" do circulante
    assert bp["SP20"]["2025"] == pytest.approx(0.08) and bp["SP12"]["2024"] == pytest.approx(0.005)       # a do não circulante; nome abreviado também casa
    dre = {l["codigo"]: l["valores"] for l in d["dre"]}
    assert dre["DS009"]["2025"] == pytest.approx(0.06) and dre["DS021"]["2025"] == pytest.approx(-0.025)  # "Alho" repetido: receita e custo na ordem certa
    assert dre["DS018"]["2024"] == pytest.approx(0.1) and dre["DS020"]["2024"] == pytest.approx(-0.04)


def test_fechamento_financeiro_exige_a_estrutura(api):
    wb = Workbook()
    wb.active.title = "Balanco9anos"
    wb.create_sheet("Comparativo de AV")
    assert _subir(api, _xlsx(wb)).status_code == 422


# ---------------------------------------------------------------- saldo inicial: o último balanço realizado antes do horizonte
def test_balanco_mostra_o_realizado_como_saldo_inicial(api):
    _estrutura(api)
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = api.get(f"/api/versoes/{vid}/balanco-patrimonial").json()
    assert d["saldo_inicial"] == {"ano": 2025}                                              # 2026 não tem realizado: vale o último fechado
    ini = {l["codigo"]: l["inicial"] for l in d["linhas"]}
    assert ini["SA08"] == pytest.approx(300.0)                                              # R$ 300.000 = R$ mil 300
    assert ini["SP10"] is None and ini["DIF"] == 0                                          # conta sem valor realizado; sem SA e SP no arquivo a diferença é 0


def test_balanco_sem_realizado_nao_tem_saldo_inicial(api):
    _estrutura(api)
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = api.get(f"/api/versoes/{vid}/balanco-patrimonial").json()
    assert "saldo_inicial" not in d and all("inicial" not in l for l in d["linhas"])


def test_realizado_posterior_ao_horizonte_nao_vira_saldo_inicial(api):
    _estrutura(api)
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2025, "horizonte": 3}).json()["id"]    # o horizonte já começa em 2025
    d = api.get(f"/api/versoes/{vid}/balanco-patrimonial").json()
    assert d["saldo_inicial"] == {"ano": 2024}


def test_investimento_em_cg_do_primeiro_ano_parte_da_ncg_realizada(api):
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = _cg(api, vid)
    assert d["realizado"]["ncg_inicial"] == {"ano": 2025, "valor": pytest.approx(0.665 * 1000)}   # (300 + 365 + 182,5) − 182,5 = 665 (R$ mil)
    assert _l(d, "ncg", 2027) == 0 and _l(d, "inv_cg", 2027) == pytest.approx(-665.0)               # sem base na projeção, a NCG zera: libera 665


def test_ano_inicial_descarta_os_anos_anteriores(api):
    r = api.post("/api/realizado/importar?arquivo=x.xlsx&ano_inicial=2025", content=_planilha(DADOS), headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200 and r.json()["anos"] == [2025]
    assert api.get("/api/realizado").json()["anos"] == [2025]


# ---------------------------------------------------------------- período da média dos prazos
def _previa(api, vid):
    return api.get(f"/api/versoes/{vid}/capital-giro/previa-prazos").json()


def _linha_cg(api, vid, campo):
    return next(l for s in _cg(api, vid)["premissas"] for l in s["linhas"] if l["id"] == campo)


def test_previa_mostra_cada_ano_e_a_media_dos_atalhos(api):
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    p = _previa(api, vid)
    assert p["anos"] == [2024, 2025] and p["padrao"] == [2024, 2025]
    assert [(o["id"], o["anos"]) for o in p["opcoes"]] == [("1", [2025]), ("2", [2024, 2025])]     # 3, 5 e todos repetiriam o "2": não aparecem
    rec = next(c for c in p["campos"] if c["id"] == "dias_receber")
    assert rec["por_ano"] == {"2024": pytest.approx(45.0), "2025": pytest.approx(30.0)}
    assert rec["por_opcao"] == {"1": pytest.approx(30.0), "2": pytest.approx(37.5)}                # (45 + 30) ÷ 2


def test_atalhos_de_5_e_todos_so_aparecem_com_historico_suficiente(api):
    dados = []
    for ano in range(2019, 2026):
        dados += [(ano, "DRE", "DS018", "RL", 3650000), (ano, "DRE", "DS020", "CPV", -1825000), (ano, "BP", "SA08", "Clientes", 100000 * (ano - 2018))]
    _subir(api, _planilha(dados))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    p = _previa(api, vid)
    assert [(o["id"], len(o["anos"])) for o in p["opcoes"]] == [("1", 1), ("2", 2), ("3", 3), ("5", 5), ("todos", 7)]
    assert p["padrao"] == [2023, 2024, 2025]


def test_media_simples_dos_anos_escolhidos_e_origem_com_o_calculo_de_cada_ano(api):
    _estrutura(api)
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    r = api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2025, 2024]})
    assert r.status_code == 200 and r.json()["anos_usados"] == [2024, 2025] and r.json()["ano_realizado"] == 2025
    d = _cg(api, vid)
    assert _l(d, "dias_receber", 2027) == pytest.approx(37.5) and _l(d, "dias_insumos", 2029) == pytest.approx(66.5)      # (60 + 73) ÷ 2
    l = _linha_cg(api, vid, "dias_receber")
    assert l["origem_anos"]["2028"] == [2024, 2025] and l["origem"]["2028"] == 2025
    t = l["explicacao"]
    assert "média simples de 2024, 2025" in t and "2024: saldo de Contas a receber - Clientes (SA08) em 31/12/2024 = R$ 450 mil" in t
    assert "2025: saldo" in t and "Média = (45,0 + 30,0) ÷ 2 = 37,5 dias" in t


def test_ano_sem_base_fica_de_fora_da_media_so_naquela_conta(api):
    dados = DADOS + [(2023, "DRE", "DS018", "RL", 3650000), (2023, "BP", "SA08", "Clientes", 365000), (2023, "BP", "SA11", "Insumos", 999999)]   # 2023 sem CPV
    _estrutura(api)
    _subir(api, _planilha(dados))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    assert api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2023, 2024, 2025]}).status_code == 200
    d = _cg(api, vid)
    assert _l(d, "dias_receber", 2027) == pytest.approx((36.5 + 45 + 30) / 3, abs=0.05)             # 365.000 ÷ (3.650.000 ÷ 365) = 36,5 dias em 2023
    assert _l(d, "dias_insumos", 2027) == pytest.approx(66.5)                                      # 2023 não tem CPV: só 2024 e 2025
    assert "2023: sem custo do produto vendido, ficou de fora" in _linha_cg(api, vid, "dias_insumos")["explicacao"]


def test_anos_invalidos_na_media(api):
    _subir(api, _planilha(DADOS))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    assert api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2019]}).status_code == 422       # sem realizado
    assert api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": []}).status_code == 200            # vazio: o último ano
    assert _l(_cg(api, vid), "dias_receber", 2027) == pytest.approx(30.0)


def test_marca_com_varios_anos_acompanha_replicar_e_a_copia_da_versao(api):
    _subir(api, _planilha(DADOS))
    vid, _ = tr.cenario(api)
    api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2024, 2025]})
    api.put(f"/api/versoes/{vid}/capital-giro/dias_receber/2029", json={"valor": 5})
    api.post(f"/api/versoes/{vid}/capital-giro/dias_receber/replicar", json={"ano": 2028})
    assert _linha_cg(api, vid, "dias_receber")["origem_anos"]["2029"] == [2024, 2025]
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _linha_cg(api, rep, "dias_receber")["origem_anos"]["2027"] == [2024, 2025]


def test_banco_antigo_ganha_a_coluna_dos_anos_da_media(tmp_path, monkeypatch):
    import sqlite3
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "antigo.db")
    con = sqlite3.connect(db.DB_PATH)
    con.execute("CREATE TABLE capital_giro_origem(versao_id INTEGER NOT NULL, campo TEXT NOT NULL, ano INTEGER NOT NULL, ano_realizado INTEGER NOT NULL, PRIMARY KEY(versao_id, campo, ano))")
    con.commit(); con.close()
    db.iniciar()
    con = sqlite3.connect(db.DB_PATH)
    assert "anos" in {r[1] for r in con.execute("PRAGMA table_info(capital_giro_origem)")}
    con.close()


# ---------------------------------------------------------------- outros créditos: saldo (R$ mil) com a média dos anos escolhidos
def _com_outros_creditos(api):
    _estrutura(api)
    dados = DADOS + [(2024, "BP", "SA09", "Outros créditos", 100000), (2025, "BP", "SA09", "Outros créditos", 300000)]
    _subir(api, _planilha(dados))
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]


def test_saldo_de_outros_creditos_na_previa_e_na_media(api):
    vid = _com_outros_creditos(api)
    c = next(c for c in _previa(api, vid)["campos"] if c["id"] == "saldo_outros_creditos")
    assert c["unidade"] == "R$ mil" and c["por_ano"] == {"2024": pytest.approx(100.0), "2025": pytest.approx(300.0)}
    assert c["por_opcao"] == {"1": pytest.approx(300.0), "2": pytest.approx(200.0)}                  # média dos saldos, não de prazo
    api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2024, 2025]})
    d = _cg(api, vid)
    assert _l(d, "saldo_outros_creditos", 2027) == pytest.approx(200.0) and _l(d, "outros_creditos", 2029) == pytest.approx(200.0)
    assert _l(d, "ncg", 2027) == 0                                                                    # conta financeira: fora da necessidade de capital de giro
    assert "Média = (100 + 300) ÷ 2 = R$ 200 mil" in _linha_cg(api, vid, "saldo_outros_creditos")["explicacao"]
    assert api.put(f"/api/versoes/{vid}/capital-giro/saldo_outros_creditos/2028", json={"valor": 250}).status_code == 200   # e dá para mudar na mão
    assert _l(_cg(api, vid), "saldo_outros_creditos", 2028) == 250 and _linha_cg(api, vid, "saldo_outros_creditos")["origem"]["2028"] is None


def test_rotacao_e_preparo_usam_o_custo_como_base(api):
    _subir(api, _planilha(DADOS + [(2025, "BP", "SA13", "Rotação", 50000), (2025, "BP", "SA14", "Preparo", 100000)]))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    c = _previa(api, vid)["campos"]
    assert next(x for x in c if x["id"] == "dias_rotacao")["por_ano"]["2025"] == pytest.approx(10.0)    # 50.000 ÷ (1.825.000 ÷ 365)
    assert next(x for x in c if x["id"] == "dias_preparo")["por_ano"]["2025"] == pytest.approx(20.0)
    assert not any(x["id"] == "dias_despesas" for x in c)


def test_banco_antigo_perde_o_prazo_de_despesas_do_exercicio_seguinte(tmp_path, monkeypatch):
    import sqlite3
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "antigo2.db")
    db.iniciar()
    con = sqlite3.connect(db.DB_PATH)
    con.execute("PRAGMA foreign_keys=OFF")
    con.execute("INSERT INTO capital_giro(versao_id, campo, ano, valor) VALUES(1,'dias_despesas',2027,12)")
    con.commit(); con.close()
    db.iniciar()
    con = sqlite3.connect(db.DB_PATH)
    assert con.execute("SELECT COUNT(*) FROM capital_giro WHERE campo='dias_despesas'").fetchone()[0] == 0
    con.close()


# ---------------------------------------------------------------- impostos a pagar: prazo sobre as deduções da receita
def test_prazo_de_impostos_a_pagar_usa_as_deducoes_da_receita(api):
    _estrutura(api)
    _subir(api, _planilha(DADOS + [(2025, "DRE", "DS015", "Deduções da receita", -365_000), (2025, "BP", "SP09", "Impostos", 30_000)]))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    c = next(x for x in _previa(api, vid)["campos"] if x["id"] == "dias_impostos")
    assert c["por_ano"]["2025"] == pytest.approx(30.0) and c["por_ano"]["2024"] is None                   # 30.000 ÷ (365.000 ÷ 365); 2024 sem deduções
    api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2025]})
    l = _linha_cg(api, vid, "dias_impostos")
    assert l["valores"]["2027"] == pytest.approx(30.0)
    assert "deduções da receita R$ 365 mil ÷ 365 dias) = 30,0 dias" in l["explicacao"]


def test_impostos_a_pagar_entram_na_ncg_realizada(api):
    _subir(api, _planilha(DADOS + [(2025, "BP", "SP09", "Impostos", 30_000)]))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    assert _cg(api, vid)["realizado"]["ncg_inicial"]["valor"] == pytest.approx(665.0 - 30.0)               # (300 + 365 + 182,5) − (182,5 + 30)


# ---------------------------------------------------------------- demais contas de saldo: média dos anos escolhidos, editável
CONTAS_SALDO = {"saldo_realizavel": ("SA17", "realizavel"), "saldo_participacoes": ("SA18", "participacoes"), "saldo_intangivel": ("SA27", "intangivel"),
                "saldo_consorcios_curto": ("SP13", "consorcios_curto"), "saldo_consorcios_longo": ("SP19", "consorcios_longo"), "saldo_outras_lp": ("SP20", "outras_lp")}


def _dados_saldos():
    dados = []
    for campo, (cod, _) in CONTAS_SALDO.items():
        dados += [(2024, "BP", cod, cod, 100_000), (2025, "BP", cod, cod, 300_000)]
    return DADOS + dados


def test_contas_de_saldo_trazem_a_media_dos_anos_escolhidos_e_dao_para_alterar(api):
    _estrutura(api)
    _subir(api, _planilha(_dados_saldos()))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    p = {c["id"]: c for c in _previa(api, vid)["campos"]}
    for campo in CONTAS_SALDO:
        assert p[campo]["unidade"] == "R$ mil" and p[campo]["por_opcao"] == {"1": pytest.approx(300.0), "2": pytest.approx(200.0)}   # média dos saldos de 2024 e 2025
    assert api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2024, 2025]}).status_code == 200
    d = _cg(api, vid)
    for campo, (_, id_) in CONTAS_SALDO.items():
        assert _l(d, campo, 2027) == pytest.approx(200.0) and _l(d, id_, 2029) == pytest.approx(200.0)
    assert api.put(f"/api/versoes/{vid}/capital-giro/saldo_realizavel/2028", json={"valor": 250}).status_code == 200
    assert _l(_cg(api, vid), "realizavel", 2028) == 250 and _l(_cg(api, vid), "realizavel", 2027) == pytest.approx(200.0)
    assert _l(d, "ncg", 2027) == 0                                                                     # nenhuma delas entra na necessidade de capital de giro


def test_conta_de_saldo_sem_valor_gravado_mantem_o_saldo_realizado_no_balanco(api):
    tb_ = __import__("test_balanco")
    tb_._importar(api, tb_.BP + [("SA17", "Realizável a longo prazo", "SA06", "account"), ("SP20", "Outras obrigações", "SP06", "account")])
    _subir(api, _planilha([(2025, "BP", "SA17", "Realizável", 300_000), (2025, "BP", "SP20", "Outras", 50_000)]))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = tb_._bp(api, vid)
    assert [tb_._v(d, "SA17", a) for a in (2027, 2028, 2029)] == [300, 300, 300]                         # nada gravado: mantém
    assert next(x for x in d["linhas"] if x["codigo"] == "SA17")["origem"] == "Balanço realizado · saldo mantido"
    api.put(f"/api/versoes/{vid}/capital-giro/saldo_realizavel/2028", json={"valor": 400})
    d = tb_._bp(api, vid)
    assert [tb_._v(d, "SA17", a) for a in (2027, 2028, 2029)] == [0, 400, 0]                             # gravou: vale o que foi digitado (os demais anos ficam em 0)
    assert next(x for x in d["linhas"] if x["codigo"] == "SA17")["origem"] == "Capital de giro · realizavel"
    assert [tb_._v(d, "SP20", a) for a in (2027, 2028, 2029)] == [50, 50, 50]                             # a outra conta continua mantida


def test_caixa_minimo_vem_da_media_do_realizado_ou_digitado(api):
    dados = DADOS + [(2024, "BP", "SA07", "Caixa", 100000), (2025, "BP", "SA07", "Caixa", 300000)]
    _subir(api, _planilha(dados))
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    d = _cg(api, vid)
    linha = next(l for s in d["premissas"] for l in s["linhas"] if l["id"] == "saldo_caixa")
    assert linha["realizado"] == {"2024": 100.0, "2025": 300.0} and _l(d, "caixa", 2027) == 0
    assert api.post(f"/api/versoes/{vid}/capital-giro/atualizar-prazos", json={"anos": [2024, 2025]}).status_code == 200
    assert _l(_cg(api, vid), "caixa", 2027) == 200.0                          # média simples dos anos marcados, em R$ mil
    api.put(f"/api/versoes/{vid}/capital-giro/saldo_caixa/2028", json={"valor": 250})
    assert _l(_cg(api, vid), "caixa", 2028) == 250.0                          # e o valor digitado vale no ano
    resultado = next(l for s in _cg(api, vid)["resultado"] for l in s["linhas"] if l["id"] == "caixa")
    assert resultado["realizado"] == 300.0
