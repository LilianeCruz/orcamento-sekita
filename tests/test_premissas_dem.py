import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app import db
from app.main import app
import test_dre as td

BP = [("SA", "Ativo", "", "group"), ("SA06", "Circulante", "SA", "group"), ("SA07", "Caixa e aplicações financeiras", "SA06", "account"),
      ("SA08", "Contas a receber - Clientes", "SA06", "account"), ("SA19", "Imobilizado", "SA", "group"),
      ("SA20", "Terras", "SA19", "account"), ("SA26", "(-) Depreciação acumulada de bens", "SA19", "account"),
      ("SP", "Passivo e patrimônio líquido", "", "group"), ("SP08", "Dívida Custeio + Capital de Giro", "SP", "account")]


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _arquivo(sint=td.SINT, com_bp=True):
    wb = load_workbook(io.BytesIO(td.xlsx(sint=sint)))
    if com_bp:
        ws = wb.create_sheet("BP Sintético")
        ws.append(td.COLS)
        for i, (c, n, p, k) in enumerate(BP, 1):
            ws.append([c, n, p, k, i * 10, True, "", "", ""])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _importar(api, **kw):
    r = api.post("/api/dre/importar", params={"arquivo": "f.xlsx"}, content=_arquivo(**kw), headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200, r.text
    return r.json()


def _versao(api, h=3):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": h}).json()["id"]


def _criar(api, nome="Aluguel", dem="dre", conta="DS038", sinal=-1):
    return api.post("/api/premissas-dem", json={"nome": nome, "demonstrativo": dem, "conta_codigo": conta, "sinal": sinal})


def _pid(api, vid=None, **kw):
    """Cadastra a premissa e, se vid for dado, já a adiciona à versão (como no botão 'Adicionar premissa' da aba)."""
    r = _criar(api, **kw)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    if vid:
        assert api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": pid}).status_code == 200
    return pid


def _valor(api, vid, pid, ano, v):
    r = api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/{ano}", json={"valor": v})
    assert r.status_code == 200, r.text


def _val(api, vid, codigo, ano):
    d = api.get(f"/api/versoes/{vid}/dre").json()
    return next(l for l in d["linhas"] if l["codigo"] == codigo)["valores"][str(ano)]


# ---------------------------------------------------------------- importação do balanço pequeno
def test_importa_o_bp_sintetico_junto_com_a_dre(api):
    assert _importar(api)["balanco"] == len(BP)
    assert _importar(api, com_bp=False)["balanco"] == 0


def test_contas_de_cada_demonstrativo(api):
    _importar(api)
    d = api.get(f"/api/versoes/{_versao(api)}/premissas-dem").json()
    dre = {c["codigo"]: c for c in d["contas"]["dre"]}
    assert "DS007" not in dre and "DS018" not in dre and "DS031" not in dre            # totais e grupos não recebem premissa
    assert dre["DS038"]["caminho"] == ["(-) Outras Despesas Operacionais", "Despesas administrativas"] and dre["DS038"]["sinal_padrao"] == -1
    assert dre["DS032"]["sinal_padrao"] == -1 and dre["DS047"]["sinal_padrao"] == -1
    assert dre["DS035"]["sinal_padrao"] == 1                                            # "Outras Receitas Arrendamento" é receita, mesmo no grupo (-)
    assert dre["DS009"]["sinal_padrao"] == 1 and dre["DS052"]["sinal_padrao"] == 1
    bal = {c["codigo"]: c for c in d["contas"]["balanco"]}
    assert set(bal) == {"SA08", "SA20", "SA26", "SP08"}                                 # só as contas, sem os grupos e sem o caixa (vem do fluxo de caixa)
    assert bal["SA26"]["sinal_padrao"] == -1 and bal["SA20"]["sinal_padrao"] == 1
    assert bal["SA20"]["caminho"] == ["Ativo", "Imobilizado", "Terras"]
    assert d["estrutura"] == {"dre": True, "balanco": True}


def test_sem_estrutura_nao_ha_contas(api):
    d = api.get(f"/api/versoes/{_versao(api)}/premissas-dem").json()
    assert d["contas"] == {"dre": [], "balanco": []} and d["estrutura"] == {"dre": False, "balanco": False}
    assert _criar(api).status_code == 422


# ---------------------------------------------------------------- cadastro: a conta é obrigatória
def test_nao_cria_premissa_sem_conta(api):
    _importar(api)
    for conta in ("", "  "):
        r = _criar(api, conta=conta)
        assert r.status_code == 422 and "vinculada a uma conta" in r.json()["erro"]
    assert api.post("/api/premissas-dem", json={"nome": "X", "demonstrativo": "dre"}).status_code == 422       # nem omitindo o campo
    assert api.get(f"/api/versoes/{_versao(api)}/premissas-dem").json()["blocos"]["dre"] == []


def test_conta_precisa_existir_e_ser_do_demonstrativo(api):
    _importar(api)
    assert _criar(api, conta="ZZ999").status_code == 422
    assert "não aceita premissa" in _criar(api, conta="DS007").json()["erro"]           # total da DRE
    assert _criar(api, conta="DS018").status_code == 422                                # linha calculada
    assert _criar(api, conta="SA07", dem="dre").status_code == 422                      # conta do balanço no bloco da DRE
    assert _criar(api, conta="DS038", dem="balanco").status_code == 422
    assert _criar(api, conta="SA06", dem="balanco").status_code == 422                  # grupo do balanço


def test_outras_validacoes_do_cadastro(api):
    _importar(api)
    assert _criar(api, nome="  ").status_code == 422
    assert _criar(api, dem="caixa").status_code == 422
    assert _criar(api, sinal=2).status_code == 422
    _pid(api)
    r = _criar(api, nome="aluguel")                                                      # mesmo nome, sem diferenciar maiúsculas
    assert r.status_code == 422 and "Já existe" in r.json()["erro"]
    assert _criar(api, nome="Aluguel", dem="balanco", conta="SA20", sinal=1).status_code == 200   # em outro demonstrativo pode


def test_editar_trocar_conta_continua_obrigatoria_e_excluir(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid)
    assert api.put(f"/api/premissas-dem/{pid}", json={"conta_codigo": ""}).status_code == 422
    assert api.put(f"/api/premissas-dem/{pid}", json={"conta_codigo": "DS007"}).status_code == 422
    assert api.put(f"/api/premissas-dem/{pid}", json={"conta_codigo": "DS047", "nome": "Depreciação extra", "sinal": -1}).status_code == 200
    p = api.get(f"/api/versoes/{vid}/premissas-dem").json()["blocos"]["dre"][0]
    assert (p["nome"], p["conta_codigo"], p["conta"]) == ("Depreciação extra", "DS047", "(-) Depreciação")
    _pid(api, nome="Outra")
    assert api.put(f"/api/premissas-dem/{pid}", json={"nome": "outra"}).status_code == 422
    _valor(api, vid, pid, 2027, 10)
    assert api.delete(f"/api/premissas-dem/{pid}").status_code == 200
    d = api.get(f"/api/versoes/{vid}/premissas-dem").json()
    assert d["blocos"]["dre"] == [] and [x["nome"] for x in d["cadastradas"]["dre"]] == ["Outra"]
    assert api.delete(f"/api/premissas-dem/{pid}").status_code == 404
    assert api.put("/api/premissas-dem/999", json={"nome": "x"}).status_code == 404


# ---------------------------------------------------------------- o valor cai e soma na conta da DRE
def test_o_valor_digitado_cai_na_conta_e_soma_nos_grupos(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid, nome="Aluguel do escritório", conta="DS038", sinal=-1)
    _valor(api, vid, pid, 2027, 100)
    assert _val(api, vid, "DS038", 2027) == -100                                        # despesa: o valor digitado (positivo) é subtraído
    assert _val(api, vid, "DS030", 2027) == -100                                        # Outras Despesas Operacionais
    assert _val(api, vid, "DS044", 2027) == -100                                        # Ebitda = resultado bruto (0) - 100
    assert _val(api, vid, "DS062", 2027) == -100                                        # lucro líquido
    assert _val(api, vid, "DS038", 2028) == 0


def test_varias_premissas_na_mesma_conta_somam(api):
    _importar(api)
    vid = _versao(api)
    a, b = _pid(api, vid, nome="Aluguel", conta="DS038", sinal=-1), _pid(api, vid, nome="Internet", conta="DS038", sinal=-1)
    _valor(api, vid, a, 2027, 100); _valor(api, vid, b, 2027, 40)
    assert _val(api, vid, "DS038", 2027) == -140


def test_premissa_de_receita_soma_positivo(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid, nome="Receita extra", conta="DS009", sinal=1)
    _valor(api, vid, pid, 2027, 50)
    assert _val(api, vid, "DS009", 2027) == 50 and _val(api, vid, "DS007", 2027) == 50 and _val(api, vid, "DS018", 2027) == 50


def test_premissa_soma_ao_que_vem_do_modulo(api):
    vid, _ = td._ligado(api)                                                             # arrendamento do módulo: -R$ 80 mil
    pid = _pid(api, vid, nome="Arrendamento extra", conta="DS032", sinal=-1)
    _valor(api, vid, pid, 2027, 20)
    assert _val(api, vid, "DS032", 2027) == pytest.approx(-100.0)
    d = api.get(f"/api/versoes/{vid}/dre").json()
    ln = next(l for l in d["linhas"] if l["codigo"] == "DS032")
    assert ln["premissas"] == ["Arrendamento extra"] and "Arrendamento extra" in ln["explicacao"] and "Arrendamentos" in ln["explicacao"]


def test_a_dre_explica_a_origem_de_uma_conta_so_de_premissa(api):
    _importar(api)
    vid = _versao(api)
    _pid(api, vid, nome="Aluguel")
    ln = next(l for l in api.get(f"/api/versoes/{vid}/dre").json()["linhas"] if l["codigo"] == "DS038")
    assert ln["origem"] == "Premissas · valores digitados" and ln["explicacao"].startswith("Soma das premissas da DRE vinculadas a esta conta: Aluguel")


def test_premissa_de_balanco_nao_mexe_na_dre(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid, nome="Caixa mínimo", dem="balanco", conta="SA20", sinal=1)
    _valor(api, vid, pid, 2027, 500)
    d = api.get(f"/api/versoes/{vid}/dre").json()
    assert all(v == 0 for l in d["linhas"] for v in l["valores"].values())
    b = api.get(f"/api/versoes/{vid}/premissas-dem").json()["blocos"]
    assert b["balanco"][0]["conta"] == "Terras" and b["balanco"][0]["valores"]["2027"] == 500 and b["dre"] == []
    from app.servicos import premissas_dem as pd
    con = db.conectar()
    try:
        assert pd.efeitos(con, vid, "balanco", [2027])["SA20"] == [{"nome": "Caixa mínimo", "valores": {2027: 500.0}}]
    finally:
        con.close()


def test_conta_que_saiu_da_estrutura_nao_e_aplicada(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid)
    _valor(api, vid, pid, 2027, 100)
    _importar(api, sint=[l for l in td.SINT if l[0] != "DS038"])
    p = api.get(f"/api/versoes/{vid}/premissas-dem").json()["blocos"]["dre"][0]
    assert p["conta_existe"] is False and p["conta"] is None
    assert _val(api, vid, "DS030", 2027) == 0


# ---------------------------------------------------------------- valores, versões
def test_valores_replicar_e_validacoes(api):
    _importar(api)
    vid = _versao(api)
    a, b = _pid(api, vid, nome="A", conta="DS038"), _pid(api, vid, nome="B", conta="DS047")
    c = _pid(api, vid, nome="C", dem="balanco", conta="SA20", sinal=1)
    _valor(api, vid, a, 2027, 10); _valor(api, vid, b, 2027, 20); _valor(api, vid, c, 2027, 30)
    assert api.put(f"/api/versoes/{vid}/premissas-dem/{a}/2040", json={"valor": 1}).status_code == 422
    assert api.put(f"/api/versoes/{vid}/premissas-dem/999/2027", json={"valor": 1}).status_code == 404
    assert api.post(f"/api/versoes/{vid}/premissas-dem/{a}/replicar", json={"ano": 2027}).json()["anos_alterados"] == 2
    assert _val(api, vid, "DS038", 2029) == -10 and _val(api, vid, "DS047", 2028) == 0
    r = api.post(f"/api/versoes/{vid}/premissas-dem/replicar-todas", json={"ano": 2027, "demonstrativo": "dre"})
    assert r.json() == {"premissas": 2, "anos_alterados": 2}
    assert _val(api, vid, "DS047", 2029) == -20
    bal = api.get(f"/api/versoes/{vid}/premissas-dem").json()["blocos"]["balanco"][0]["valores"]
    assert bal["2028"] == 0                                                              # só o bloco da DRE foi replicado
    assert api.post(f"/api/versoes/{vid}/premissas-dem/replicar-todas", json={"ano": 2029}).status_code == 422


def test_travada_reprojetado_e_comparacao(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid)
    _valor(api, vid, pid, 2027, 100)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/2027", json={"valor": 1}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/premissas-dem/{pid}/replicar", json={"ano": 2027}).status_code == 409
    assert api.post(f"/api/versoes/{vid}/premissas-dem/replicar-todas", json={"ano": 2027}).status_code == 409
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _val(api, rep, "DS038", 2027) == -100                                         # o Reprojetado nasce com os valores
    _valor(api, rep, pid, 2027, 150)
    assert _val(api, vid, "DS038", 2027) == -100 and _val(api, rep, "DS038", 2027) == -150
    c = api.get(f"/api/comparar-premissas-dem?a={vid}&b={rep}").json()
    [x] = c["premissas"]
    assert x["nome"] == "Aluguel" and x["demonstrativo"] == "dre" and x["anos"]["2027"] == {"a": 100, "b": 150, "delta": 50, "pct": 50.0}


def test_banco_antigo_ganha_as_tabelas(tmp_path, monkeypatch):
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
        d = c.get("/api/versoes/1/premissas-dem").json()
        assert d["blocos"] == {"dre": [], "balanco": []}


# ---------------------------------------------------------------- cadastrar × adicionar à versão (abas)
def _lista(api, vid):
    return api.get(f"/api/versoes/{vid}/premissas-dem").json()


def test_cadastrada_mas_fora_da_versao_nao_aparece_nem_tem_efeito(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api)                                                                      # só cadastrada
    d = _lista(api, vid)
    assert d["blocos"]["dre"] == [] and d["cadastradas"]["dre"][0]["na_versao"] is False
    r = api.put(f"/api/versoes/{vid}/premissas-dem/{pid}/2027", json={"valor": 100})
    assert r.status_code == 422 and "Adicione a premissa" in r.json()["erro"]            # não lança valor sem adicionar
    assert api.post(f"/api/versoes/{vid}/premissas-dem/{pid}/replicar", json={"ano": 2027}).status_code == 422


def test_adicionar_vira_linha_e_remover_apaga_so_os_valores_da_versao(api):
    _importar(api)
    v1 = _versao(api)
    v2 = api.post("/api/versoes", json={"ano_base": 2028, "horizonte": 2}).json()["id"]
    pid = _pid(api, v1)
    assert api.post(f"/api/versoes/{v1}/premissas-dem/itens", json={"premissa_id": pid}).status_code == 422     # já está
    assert api.post(f"/api/versoes/{v1}/premissas-dem/itens", json={"premissa_id": 999}).status_code == 404
    _valor(api, v1, pid, 2027, 100)
    assert [p["nome"] for p in _lista(api, v1)["blocos"]["dre"]] == ["Aluguel"] and _lista(api, v2)["blocos"]["dre"] == []   # outra versão não vê
    assert api.post(f"/api/versoes/{v2}/premissas-dem/itens", json={"premissa_id": pid}).status_code == 200            # a mesma premissa em outra versão
    assert api.delete(f"/api/versoes/{v1}/premissas-dem/itens/{pid}").status_code == 200
    d = _lista(api, v1)
    assert d["blocos"]["dre"] == [] and d["cadastradas"]["dre"][0]["na_versao"] is False        # o cadastro continua
    assert _val(api, v1, "DS038", 2027) == 0                                                    # e o efeito sumiu da DRE
    assert len(_lista(api, v2)["blocos"]["dre"]) == 1


def test_adicionar_de_novo_comeca_sem_valores_e_o_cadastro_serve_a_outros_demonstrativos(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid)
    _valor(api, vid, pid, 2027, 100)
    api.delete(f"/api/versoes/{vid}/premissas-dem/itens/{pid}")
    api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": pid})
    assert _lista(api, vid)["blocos"]["dre"][0]["valores"]["2027"] == 0


def test_adicionar_e_remover_em_versao_travada_dao_409(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid)
    outra = _pid(api, nome="Outra", conta="DS047")
    api.post(f"/api/versoes/{vid}/aprovar")
    assert api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": outra}).status_code == 409
    assert api.delete(f"/api/versoes/{vid}/premissas-dem/itens/{pid}").status_code == 409


def test_reprojetado_herda_as_premissas_adicionadas(api):
    _importar(api)
    vid = _versao(api)
    pid = _pid(api, vid)
    _valor(api, vid, pid, 2027, 100)
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert [p["nome"] for p in _lista(api, rep)["blocos"]["dre"]] == ["Aluguel"] and _val(api, rep, "DS038", 2027) == -100
    api.delete(f"/api/versoes/{rep}/premissas-dem/itens/{pid}")                          # tirar no Reprojetado não mexe no Orçado
    assert _val(api, vid, "DS038", 2027) == -100 and _val(api, rep, "DS038", 2027) == 0


def test_replicar_todas_so_das_premissas_da_versao(api):
    _importar(api)
    vid = _versao(api)
    dentro = _pid(api, vid, nome="Dentro")
    _pid(api, nome="Fora", conta="DS047")                                                # cadastrada, mas não adicionada
    _valor(api, vid, dentro, 2027, 10)
    assert api.post(f"/api/versoes/{vid}/premissas-dem/replicar-todas", json={"ano": 2027}).json() == {"premissas": 1, "anos_alterados": 2}


# ---------------------------------------------------------------- premissas percentuais (% sobre um campo base)
def _pct(api, vid=None, nome="IR e CSLL", conta="DS060", base="DS058", sinal=-1, dem="dre", neg="calcular"):
    r = api.post("/api/premissas-dem", json={"nome": nome, "demonstrativo": dem, "conta_codigo": conta, "sinal": sinal, "tipo": "percentual", "base_codigo": base, "base_negativa": neg})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    if vid:
        api.post(f"/api/versoes/{vid}/premissas-dem/itens", json={"premissa_id": pid})
    return pid


def _base_ebt(api, vid):
    """Receita 1.000 (+) e despesa administrativa 200 (−) em 2027 e 2028: Ebt = 800."""
    r = _pid(api, vid, nome="Receita", conta="DS009", sinal=1)
    d = _pid(api, vid, nome="Adm", conta="DS038", sinal=-1)
    for ano in (2027, 2028):
        _valor(api, vid, r, ano, 1000); _valor(api, vid, d, ano, 200)


def test_percentual_exige_campo_base(api):
    _importar(api)
    for corpo in ({"tipo": "percentual", "base_negativa": "calcular"}, {"tipo": "percentual", "base_codigo": "  ", "base_negativa": "calcular"}):
        r = api.post("/api/premissas-dem", json={"nome": "IR", "demonstrativo": "dre", "conta_codigo": "DS060", "sinal": -1, **corpo})
        assert r.status_code == 422 and "campo sobre o qual" in r.json()["erro"]
    assert api.post("/api/premissas-dem", json={"nome": "IR", "demonstrativo": "dre", "conta_codigo": "DS060", "sinal": -1, "tipo": "x"}).status_code == 422
    r = api.post("/api/premissas-dem", json={"nome": "IR", "demonstrativo": "dre", "conta_codigo": "DS060", "sinal": -1, "tipo": "percentual", "base_codigo": "ZZ", "base_negativa": "calcular"})
    assert r.status_code == 422 and "não pode ser base" in r.json()["erro"]
    assert api.post("/api/premissas-dem", json={"nome": "IR", "demonstrativo": "dre", "conta_codigo": "DS060", "sinal": -1, "tipo": "percentual",
                                                 "base_codigo": "SA07", "base_negativa": "calcular"}).status_code == 422          # campo de outro demonstrativo


def test_lista_de_campos_base_traz_totais_e_subtotais(api):
    _importar(api)
    d = api.get(f"/api/versoes/{_versao(api)}/premissas-dem").json()
    dre = {b["codigo"]: b for b in d["bases"]["dre"]}
    assert {"DS058", "DS018", "DS027", "DS044", "DS007", "DS009"} <= set(dre)                          # Ebt, receita líquida, resultado bruto, ebitda...
    assert "DS028" not in dre and "DS063" not in dre                                                    # margens em % não são base
    assert {"SA", "SA06", "SA07", "SP08"} <= {b["codigo"] for b in d["bases"]["balanco"]}


def test_ir_e_csll_como_percentual_do_ebt(api):
    _importar(api)
    vid = _versao(api)
    _base_ebt(api, vid)
    ir = _pct(api, vid)
    _valor(api, vid, ir, 2027, 34); _valor(api, vid, ir, 2028, 25)
    assert _val(api, vid, "DS058", 2027) == 800                                                         # Ebt
    assert _val(api, vid, "DS060", 2027) == pytest.approx(-272.0)                                       # 34 % de 800, subtraindo
    assert _val(api, vid, "DS062", 2027) == pytest.approx(528.0)                                        # lucro líquido
    assert _val(api, vid, "DS063", 2027) == pytest.approx(52.8)
    assert _val(api, vid, "DS060", 2028) == pytest.approx(-200.0) and _val(api, vid, "DS062", 2028) == pytest.approx(600.0)
    assert _val(api, vid, "DS060", 2029) == 0
    p = _lista(api, vid)["blocos"]["dre"][-1]
    assert p["tipo"] == "percentual" and p["unidade"] == "%" and p["base"] == "(=) Ebt" and p["valores"]["2027"] == 34


def test_percentual_acompanha_a_base_quando_ela_muda(api):
    _importar(api)
    vid = _versao(api)
    _base_ebt(api, vid)
    ir = _pct(api, vid)
    _valor(api, vid, ir, 2027, 10)
    assert _val(api, vid, "DS060", 2027) == pytest.approx(-80.0)
    adm = next(p for p in _lista(api, vid)["blocos"]["dre"] if p["nome"] == "Adm")["id"]
    _valor(api, vid, adm, 2027, 400)                                                                    # Ebt cai para 600
    assert _val(api, vid, "DS060", 2027) == pytest.approx(-60.0)


def test_percentual_somado_a_valor_na_mesma_conta_e_explicacao(api):
    _importar(api)
    vid = _versao(api)
    _base_ebt(api, vid)
    ir = _pct(api, vid)
    _valor(api, vid, ir, 2027, 10)
    extra = _pid(api, vid, nome="Imposto fixo", conta="DS060", sinal=-1)
    _valor(api, vid, extra, 2027, 5)
    assert _val(api, vid, "DS060", 2027) == pytest.approx(-85.0)                                        # 10 % de 800 + 5
    ln = next(l for l in api.get(f"/api/versoes/{vid}/dre").json()["linhas"] if l["codigo"] == "DS060")
    assert "IR e CSLL (% sobre (=) Ebt)" in ln["explicacao"] and "Imposto fixo" in ln["explicacao"]


def test_percentual_sobre_outro_percentual_resolve_na_ordem_certa(api):
    _importar(api)
    vid = _versao(api)
    _base_ebt(api, vid)
    comissao = _pct(api, vid, nome="Comissão", conta="DS038", base="DS027", sinal=-1)                  # despesa adm = 20 % do resultado bruto (1.000)
    ir = _pct(api, vid, nome="IR", conta="DS060", base="DS058", sinal=-1)
    api.put(f"/api/versoes/{vid}/premissas-dem/{comissao}/2027", json={"valor": 20})
    api.put(f"/api/versoes/{vid}/premissas-dem/{ir}/2027", json={"valor": 50})
    adm = next(p for p in _lista(api, vid)["blocos"]["dre"] if p["nome"] == "Adm")["id"]
    _valor(api, vid, adm, 2027, 0)                                                                      # a despesa fixa sai; só a comissão
    assert _val(api, vid, "DS038", 2027) == pytest.approx(-200.0)                                       # 20 % de 1.000
    assert _val(api, vid, "DS058", 2027) == pytest.approx(800.0)
    assert _val(api, vid, "DS060", 2027) == pytest.approx(-400.0)                                       # 50 % de 800


def test_nao_aceita_base_que_depende_da_propria_conta(api):
    _importar(api)
    for conta, base in (("DS038", "DS038"), ("DS038", "DS044"), ("DS038", "DS030"), ("DS060", "DS062")):
        r = api.post("/api/premissas-dem", json={"nome": f"X{conta}{base}", "demonstrativo": "dre", "conta_codigo": conta, "sinal": -1,
                                                 "tipo": "percentual", "base_codigo": base, "base_negativa": "calcular"})
        assert r.status_code == 422 and "circular" in r.json()["erro"], (conta, base)


def test_nao_aceita_ciclo_entre_duas_premissas_percentuais(api):
    _importar(api)
    _pct(api, nome="A", conta="DS052", base="DS030", sinal=1)                                           # receita financeira = % das despesas operacionais
    r = api.post("/api/premissas-dem", json={"nome": "B", "demonstrativo": "dre", "conta_codigo": "DS038", "sinal": -1,
                                             "tipo": "percentual", "base_codigo": "DS051", "base_negativa": "calcular"})            # despesa adm = % do resultado financeiro: fecharia o ciclo
    assert r.status_code == 422 and "circular" in r.json()["erro"]


def test_editar_a_base_valida_e_o_tipo_nao_muda(api):
    _importar(api)
    vid = _versao(api)
    ir = _pct(api, vid)
    assert api.put(f"/api/premissas-dem/{ir}", json={"base_codigo": "DS044"}).status_code == 200
    assert _lista(api, vid)["blocos"]["dre"][0]["base"] == "(=) Ebitda"
    assert api.put(f"/api/premissas-dem/{ir}", json={"base_codigo": "DS062"}).status_code == 422
    assert api.put(f"/api/premissas-dem/{ir}", json={"base_codigo": ""}).status_code == 422
    val = _pid(api, vid, nome="Valor", conta="DS047")
    assert api.put(f"/api/premissas-dem/{val}", json={"base_codigo": "DS044"}).status_code == 200      # em premissa de valor a base é ignorada
    assert [p for p in _lista(api, vid)["blocos"]["dre"] if p["nome"] == "Valor"][0]["tipo"] == "valor"


def test_percentual_no_balanco(api):
    _importar(api)
    vid = _versao(api)
    terras = _pid(api, vid, nome="Terras", dem="balanco", conta="SA20", sinal=1)
    _valor(api, vid, terras, 2027, 1000)
    divida = _pct(api, vid, nome="Dívida de giro", conta="SP08", base="SA20", sinal=1, dem="balanco")   # dívida de giro = 50 % das terras
    _valor(api, vid, divida, 2027, 50)
    d = api.get(f"/api/versoes/{vid}/balanco-patrimonial").json()
    assert _val_bp(d, "SA20", 2027) == pytest.approx(1000.0) and _val_bp(d, "SA07", 2027) == pytest.approx(0.0)
    assert _val_bp(d, "SP08", 2027) == pytest.approx(500.0) and _val_bp(d, "SPAUTO", 2027) == pytest.approx(500.0)     # 500 da premissa percentual + 500 de dívida de giro automática (linha própria)
    assert _val_bp(d, "SA", 2027) == pytest.approx(1000.0) and _val_bp(d, "SP", 2027) == pytest.approx(1000.0)
    r = api.post("/api/premissas-dem", json={"nome": "Circular", "demonstrativo": "balanco", "conta_codigo": "SA08", "sinal": 1,
                                             "tipo": "percentual", "base_codigo": "SA06", "base_negativa": "calcular"})             # contas a receber dentro do próprio circulante
    assert r.status_code == 422 and "circular" in r.json()["erro"]


def _val_bp(d, codigo, ano):
    return next(l for l in d["linhas"] if l["codigo"] == codigo)["valores"][str(ano)]


def test_percentual_na_comparacao_e_reprojetado(api):
    _importar(api)
    vid = _versao(api)
    _base_ebt(api, vid)
    ir = _pct(api, vid)
    _valor(api, vid, ir, 2027, 34)
    api.post(f"/api/versoes/{vid}/aprovar")
    rep = api.post(f"/api/versoes/{vid}/copiar", json={}).json()["id"]
    assert _val(api, rep, "DS060", 2027) == pytest.approx(-272.0)
    _valor(api, rep, ir, 2027, 40)
    assert _val(api, rep, "DS060", 2027) == pytest.approx(-320.0) and _val(api, vid, "DS060", 2027) == pytest.approx(-272.0)
    c = api.get(f"/api/comparar-dre?a={vid}&b={rep}").json()
    assert {l["codigo"]: l for l in c["linhas"]}["DS060"]["anos"]["2027"]["delta"] == pytest.approx(-48.0)


# ---------------------------------------------------------------- percentual com base negativa: o cadastro pergunta
def test_cadastro_exige_a_resposta_sobre_base_negativa(api):
    _importar(api)
    for neg in ("", "talvez"):
        r = api.post("/api/premissas-dem", json={"nome": "IR", "demonstrativo": "dre", "conta_codigo": "DS060", "sinal": -1, "tipo": "percentual",
                                                 "base_codigo": "DS058", "base_negativa": neg})
        assert r.status_code == 422 and "base for negativo" in r.json()["erro"]
    assert api.post("/api/premissas-dem", json={"nome": "Valor", "demonstrativo": "dre", "conta_codigo": "DS047", "sinal": -1}).status_code == 200   # valor não pergunta


def _prejuizo(api, vid):
    """Receita 100 e despesa 300 em 2027: Ebt = -200."""
    r = _pid(api, vid, nome="Receita", conta="DS009", sinal=1)
    d = _pid(api, vid, nome="Adm", conta="DS038", sinal=-1)
    _valor(api, vid, r, 2027, 100); _valor(api, vid, d, 2027, 300)


def test_base_negativa_calcular_gera_credito(api):
    _importar(api)
    vid = _versao(api)
    _prejuizo(api, vid)
    ir = _pct(api, vid, neg="calcular")
    _valor(api, vid, ir, 2027, 34)
    assert _val(api, vid, "DS058", 2027) == -200
    assert _val(api, vid, "DS060", 2027) == pytest.approx(68.0)                         # -1 × 34 % × (-200): crédito
    assert _val(api, vid, "DS062", 2027) == pytest.approx(-132.0)


def test_base_negativa_zerar_nao_gera_imposto(api):
    _importar(api)
    vid = _versao(api)
    _prejuizo(api, vid)
    ir = _pct(api, vid, neg="zerar")
    _valor(api, vid, ir, 2027, 34)
    assert _val(api, vid, "DS060", 2027) == 0 and _val(api, vid, "DS062", 2027) == pytest.approx(-200.0)
    r = _pid(api, vid, nome="Mais receita", conta="DS035", sinal=1)                      # vira lucro: o imposto volta a ser calculado
    _valor(api, vid, r, 2027, 500)
    assert _val(api, vid, "DS058", 2027) == 300 and _val(api, vid, "DS060", 2027) == pytest.approx(-102.0)


def test_editar_a_resposta_da_base_negativa(api):
    _importar(api)
    vid = _versao(api)
    _prejuizo(api, vid)
    ir = _pct(api, vid, neg="calcular")
    _valor(api, vid, ir, 2027, 34)
    assert api.put(f"/api/premissas-dem/{ir}", json={"base_negativa": "zerar"}).status_code == 200
    assert _val(api, vid, "DS060", 2027) == 0
    assert _lista(api, vid)["blocos"]["dre"][-1]["base_negativa"] == "zerar"
    assert api.put(f"/api/premissas-dem/{ir}", json={"base_negativa": "x"}).status_code == 422
