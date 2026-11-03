"""Roda no Python a lista de operações de um teste de paridade e devolve o resultado de cada uma e o banco final.
Uso: python3 ferramentas/paridade_ops.py <banco.db> <ops.json> <saida.json>   (o banco é copiado; o original não muda)"""
import json, os, shutil, sys, tempfile
copia = os.path.join(tempfile.mkdtemp(), "p.db")
shutil.copy(sys.argv[1], copia)
os.environ["ORCAMENTO_DB"] = copia
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from app import db
from exportar_sqlite import exportar
from registro_ops import registro
db.iniciar()
con = db.conectar()
R = registro()
resultados = []
for op in json.load(open(sys.argv[2])):
    try:
        resultados.append({"ok": R[op[0]](con, *op[1:])})
        con.commit()                       # como a API: cada operação confirma no fim...
    except Exception as e:
        con.rollback()                     # ...ou desfaz tudo se der erro
        resultados.append({"erro": str(e)})
con.commit()
json.dump({"resultados": resultados, "depois": exportar(copia)}, open(sys.argv[3], "w"), ensure_ascii=False, default=str)
