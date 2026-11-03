"""Roda no Python as mesmas operações de versões e produtos que o teste de paridade roda em TypeScript.
Uso: python3 ferramentas/paridade_versoes.py <banco.db> <saida_depois.json>   (o banco é copiado; o original não muda)"""
import json, os, shutil, sys, tempfile
copia = os.path.join(tempfile.mkdtemp(), "p.db")
shutil.copy(sys.argv[1], copia)
os.environ["ORCAMENTO_DB"] = copia
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from app import db
from app.servicos import arrendamentos as arr, culturas as cult
from exportar_sqlite import exportar
db.iniciar()
con = db.conectar()
res = {}
res["origem"] = con.execute("SELECT MIN(id) FROM versoes").fetchone()[0]
res["novo"] = arr.criar_orcado(con, 2030, None, "t@x.com")
res["copia1"] = arr.copiar_versao(con, res["origem"], "revisao", None, "t@x.com")
res["copia2"] = arr.copiar_versao(con, res["copia1"], "reprojetado", "Teste copia 2", "t@x.com")
arr.alterar_periodo(con, res["copia2"], "Novo nome", 2026, 2031, "t@x.com")
arr.alterar_horizonte(con, res["copia2"], 4, "t@x.com")
res["cultura"] = cult.criar(con, {"nome": "ZZ Teste", "grupo": "Grãos", "unidade": "kg", "embalagem": "Saca", "qtd_por_embalagem": 60, "ativa": True, "receita_tipo": "operacional", "estoque_destino": "produto"}, "t@x.com")
cult.atualizar(con, res["cultura"], {"nome": "ZZ Teste 2", "grupo": "Hortifruti", "unidade": "kg", "embalagem": "", "qtd_por_embalagem": 0, "ativa": True, "receita_tipo": "operacional", "estoque_destino": "produto"}, "t@x.com")
res["lista"] = [dict(c) for c in cult.listar(con)]
cult.excluir(con, res["cultura"], "t@x.com")
con.commit()
json.dump({"resultados": res, "depois": exportar(copia)}, open(sys.argv[2], "w"), ensure_ascii=False, default=str)
