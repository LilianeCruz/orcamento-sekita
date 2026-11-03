import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "t.db")
    with TestClient(app) as c:
        yield c


def _versao(api):
    return api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]


def _nota(api, vid, chave="1|receita_bruta_anual|2027", cor="amarelo", comentario="", tela="resultado"):
    return api.put(f"/api/versoes/{vid}/anotacoes", json={"tela": tela, "chave": chave, "cor": cor, "comentario": comentario})


def _lista(api, vid, tela="resultado"):
    return api.get(f"/api/versoes/{vid}/anotacoes", params={"tela": tela}).json()


def test_marca_texto_e_comentario_ficam_salvos(api):
    vid = _versao(api)
    assert _lista(api, vid) == {}
    assert _nota(api, vid, cor="verde", comentario="Subiu por causa do preço").status_code == 200
    n = _lista(api, vid)["1|receita_bruta_anual|2027"]
    assert n["cor"] == "verde" and n["comentario"] == "Subiu por causa do preço" and n["autor"] == "local"


def test_so_cor_ou_so_comentario_e_trocar_a_cor(api):
    vid = _versao(api)
    _nota(api, vid, cor="vermelho")
    assert _lista(api, vid)["1|receita_bruta_anual|2027"]["comentario"] == ""
    _nota(api, vid, cor="", comentario="só uma observação")
    assert _lista(api, vid)["1|receita_bruta_anual|2027"] == {**_lista(api, vid)["1|receita_bruta_anual|2027"], "cor": "", "comentario": "só uma observação"}
    _nota(api, vid, cor="amarelo", comentario="só uma observação")
    assert _lista(api, vid)["1|receita_bruta_anual|2027"]["cor"] == "amarelo"
    assert len(_lista(api, vid)) == 1                                                       # a mesma célula não duplica


def test_sem_cor_e_sem_comentario_remove(api):
    vid = _versao(api)
    _nota(api, vid, cor="verde", comentario="x")
    assert _nota(api, vid, cor="", comentario="  ").status_code == 200
    assert _lista(api, vid) == {}


def test_validacoes(api):
    vid = _versao(api)
    assert _nota(api, vid, cor="azul").status_code == 422
    assert _nota(api, vid, chave=" ").status_code == 422
    assert _nota(api, vid, comentario="a" * 2001).status_code == 422
    assert api.put("/api/versoes/999/anotacoes", json={"tela": "resultado", "chave": "k", "cor": "verde"}).status_code == 404
    assert api.get("/api/versoes/999/anotacoes", params={"tela": "resultado"}).status_code == 404


def test_cada_versao_e_cada_tela_tem_as_suas(api):
    v1 = _versao(api)
    v2 = api.post(f"/api/versoes/{v1}/copiar", json={}).json()["id"]
    _nota(api, v1, cor="amarelo")
    _nota(api, v1, cor="verde", tela="dre")
    assert _lista(api, v2) == {} and list(_lista(api, v1, "dre")) == ["1|receita_bruta_anual|2027"]
    assert _lista(api, v1, "dre")["1|receita_bruta_anual|2027"]["cor"] == "verde"


def test_vale_em_versao_aprovada_e_travada(api):
    vid = _versao(api)
    assert api.post(f"/api/versoes/{vid}/aprovar").status_code == 200
    assert _nota(api, vid, cor="vermelho", comentario="conferir").status_code == 200
    assert _lista(api, vid)["1|receita_bruta_anual|2027"]["cor"] == "vermelho"


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
        assert c.get("/api/versoes/1/anotacoes", params={"tela": "resultado"}).json() == {}


def test_guarda_o_valor_da_hora_da_anotacao(api):
    vid = _versao(api)
    api.put(f"/api/versoes/{vid}/anotacoes", json={"tela": "resultado", "chave": "k", "cor": "verde", "comentario": "ok", "valor": 133836.5})
    n = _lista(api, vid)["k"]
    assert n["valor"] == 133836.5 and n["atualizado_em"]
    api.put(f"/api/versoes/{vid}/anotacoes", json={"tela": "resultado", "chave": "k", "cor": "verde", "comentario": "ok", "valor": 121836})
    assert _lista(api, vid)["k"]["valor"] == 121836                                          # salvar de novo confirma o valor atual
    _nota(api, vid, chave="sem-valor", cor="amarelo")
    assert _lista(api, vid)["sem-valor"]["valor"] is None


def test_banco_com_a_tabela_sem_a_coluna_valor(tmp_path, monkeypatch):
    import sqlite3
    caminho = tmp_path / "meio.db"
    con = sqlite3.connect(caminho)
    con.execute("CREATE TABLE versoes(id INTEGER PRIMARY KEY AUTOINCREMENT, ano_base INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL, "
                "status TEXT NOT NULL DEFAULT 'rascunho', horizonte INTEGER NOT NULL DEFAULT 5, origem_id INTEGER, criado_em TEXT NOT NULL, "
                "aprovado_em TEXT, autor TEXT NOT NULL DEFAULT 'local')")
    con.execute("INSERT INTO versoes(ano_base, tipo, nome, criado_em) VALUES(2027,'orcado','Antigo','x')")
    con.execute("CREATE TABLE anotacoes(versao_id INTEGER NOT NULL, tela TEXT NOT NULL, chave TEXT NOT NULL, cor TEXT NOT NULL DEFAULT '', "
                "comentario TEXT NOT NULL DEFAULT '', autor TEXT NOT NULL DEFAULT 'local', atualizado_em TEXT NOT NULL, PRIMARY KEY(versao_id, tela, chave))")
    con.execute("INSERT INTO anotacoes VALUES(1,'resultado','k','verde','velha','local','2026-01-01T10:00:00')")
    con.commit(); con.close()
    monkeypatch.setattr(db, "DB_PATH", caminho)
    with TestClient(app) as c:
        n = c.get("/api/versoes/1/anotacoes", params={"tela": "resultado"}).json()["k"]
        assert n["comentario"] == "velha" and n["valor"] is None


# ---------------------------------------------------------------- tela com todas as anotações
import test_resultado as tr                                                   # noqa: E402
import test_dre as td                                                         # noqa: E402


def _todas(api, vid):
    r = api.get(f"/api/versoes/{vid}/anotacoes/todas")
    assert r.status_code == 200, r.text
    return r.json()


def test_todas_traz_caminho_linha_data_e_valor_de_hoje(api):
    vid, cid = tr.cenario(api)
    api.put(f"/api/versoes/{vid}/anotacoes", json={"tela": "resultado", "chave": f"{cid}|receita_bruta_anual|2027", "cor": "verde",
                                                   "comentario": "Conferir preço", "valor": 13.4})
    [n] = _todas(api, vid)
    assert n["caminho"] == ["Resultado por produto", "Cenoura", "Resultado anual"]
    assert n["linha"] == "Receita bruta anual" and n["ano"] == 2027 and n["unidade"] == "R$ mil"
    assert n["cor"] == "verde" and n["comentario"] == "Conferir preço" and n["atualizado_em"]
    assert n["valor_atual"] == pytest.approx(13.4) and n["mudou"] is False and n["modulo"] == "resultado" and n["cultura"] == str(cid)


def test_todas_avisa_quando_o_valor_mudou(api):
    vid, cid = tr.cenario(api)
    api.put(f"/api/versoes/{vid}/anotacoes", json={"tela": "resultado", "chave": f"{cid}|receita_bruta_anual|2027", "cor": "amarelo", "valor": 10.0})
    [n] = _todas(api, vid)
    assert n["mudou"] is True and n["valor_anotado"] == 10.0                      # hoje é 13,4


def test_todas_da_dre_mostra_a_trilha_da_hierarquia(api):
    vid, _ = td._ligado(api)
    api.put(f"/api/versoes/{vid}/anotacoes", json={"tela": "dre", "chave": "DS032|2027", "cor": "vermelho", "comentario": "alto", "valor": -70})
    [n] = _todas(api, vid)
    assert n["caminho"] == ["DRE", "(-) Outras Despesas Operacionais", "Arrendamento"] and n["linha"] == "Despesas Arrendamentos"
    assert n["valor_atual"] == pytest.approx(-80) and n["mudou"] is True


def test_todas_com_numero_que_nao_existe_mais(api):
    vid = _versao(api)
    _nota(api, vid, chave="999|receita_bruta_anual|2027", cor="verde", comentario="velha")
    [n] = _todas(api, vid)
    assert n["existe"] is False and n["comentario"] == "velha" and n["caminho"] == ["Resultado por produto"]


def test_todas_ordena_da_mais_recente_e_so_da_versao(api):
    v1 = _versao(api)
    v2 = api.post("/api/versoes", json={"ano_base": 2028, "horizonte": 2}).json()["id"]
    _nota(api, v1, chave="a"); _nota(api, v1, chave="b"); _nota(api, v2, chave="c")
    assert [n["chave"] for n in _todas(api, v1)] in (["b", "a"], ["a", "b"]) and len(_todas(api, v1)) == 2 and len(_todas(api, v2)) == 1
    assert api.get("/api/versoes/999/anotacoes/todas").status_code == 404


# ---------------------------------------------------------------- check de validação
def _validar(api, vid, chave="k", validado=True, tela="resultado"):
    return api.post(f"/api/versoes/{vid}/anotacoes/validar", json={"tela": tela, "chave": chave, "validado": validado})


def test_validar_e_desfazer(api):
    vid = _versao(api)
    _nota(api, vid, chave="k", cor="verde", comentario="conferir")
    assert _lista(api, vid)["k"]["validado"] is False
    r = _validar(api, vid).json()
    assert r["validado"] is True and r["validado_em"] and r["validado_por"] == "local"
    n = _lista(api, vid)["k"]
    assert n["validado"] is True and n["validado_em"]
    r = _validar(api, vid, validado=False).json()
    assert r == {"validado": False, "validado_em": None, "validado_por": None}
    assert _lista(api, vid)["k"]["validado"] is False


def test_editar_a_anotacao_nao_perde_a_validacao(api):
    vid = _versao(api)
    _nota(api, vid, chave="k", cor="verde", comentario="a")
    _validar(api, vid)
    _nota(api, vid, chave="k", cor="amarelo", comentario="b")
    assert _lista(api, vid)["k"]["validado"] is True


def test_validar_anotacao_que_nao_existe_e_em_versao_travada(api):
    vid = _versao(api)
    assert _validar(api, vid, chave="nada").status_code == 404
    assert _validar(api, 999).status_code == 404
    _nota(api, vid, chave="k", cor="verde")
    api.post(f"/api/versoes/{vid}/aprovar")
    assert _validar(api, vid).status_code == 200


def test_apagar_a_anotacao_apaga_a_validacao(api):
    vid = _versao(api)
    _nota(api, vid, chave="k", cor="verde")
    _validar(api, vid)
    _nota(api, vid, chave="k", cor="", comentario="")
    _nota(api, vid, chave="k", cor="verde")
    assert _lista(api, vid)["k"]["validado"] is False


def test_todas_traz_o_status_de_validacao(api):
    vid = _versao(api)
    _nota(api, vid, chave="1|area|2027", cor="verde"); _nota(api, vid, chave="2|area|2027", cor="amarelo")
    _validar(api, vid, chave="1|area|2027")
    por_chave = {n["chave"]: n for n in _todas(api, vid)}
    assert por_chave["1|area|2027"]["validado"] is True and por_chave["1|area|2027"]["validado_em"]
    assert por_chave["2|area|2027"]["validado"] is False


def test_todas_inclui_anotacoes_do_balanco(api):
    import test_balanco as tb
    tb._importar(api)
    vid = api.post("/api/versoes", json={"ano_base": 2027, "horizonte": 3}).json()["id"]
    tb._dividas(api, vid)
    api.put(f"/api/versoes/{vid}/anotacoes", json={"tela": "balanco", "chave": "SP08|2027", "cor": "amarelo", "comentario": "conferir com o banco", "valor": 900})
    [n] = _todas(api, vid)
    assert n["caminho"] == ["Balanço patrimonial", "Passivo e patrimônio líquido", "Circulante"] and n["linha"] == "Dívida Custeio + Capital de Giro"
    assert n["valor_atual"] == pytest.approx(1000) and n["mudou"] is True and n["modulo"] == "balanco"
