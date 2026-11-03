"""Saídas do Python para o teste de paridade de Arrendamentos, grupos de custo e parcelas.
Uso: python3 ferramentas/paridade_arrendamentos.py <banco.db> <saida.json>"""
import json, os, shutil, sys, tempfile
copia = os.path.join(tempfile.mkdtemp(), "p.db")
shutil.copy(sys.argv[1], copia)
os.environ["ORCAMENTO_DB"] = copia
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app import db
from app.servicos import arrendamentos as arr, grupos_custo as gc
db.iniciar()
con = db.conectar()
vs = [r["id"] for r in con.execute("SELECT id FROM versoes ORDER BY id")]
saida = {"versoes": vs, "ler": {}, "calcular": {}}
for v in vs:
    d = arr.ler(con, v); d["calculo"] = arr.calcular(con, v)
    saida["ler"][v] = d
saida["parcelas"] = {f"{n}-{p}-{m}": arr.gerar_parcelas(n, p, m) for n, p, m in [(3, "mensal", 1), (7, "mensal", 1), (4, "trimestral", 3), (6, "bimestral", 1), (12, "mensal", 1)]}
saida["grupos"] = gc.listar(con)
if len(vs) >= 1:
    # com duas versões iguais (a original e uma cópia) a comparação precisa dar zero de diferença
    nova = arr.copiar_versao(con, vs[0], "revisao", None, "t")
    saida["comparar"] = arr.comparar(con, vs[0], nova)
json.dump(saida, open(sys.argv[2], "w"), ensure_ascii=False, default=str)
