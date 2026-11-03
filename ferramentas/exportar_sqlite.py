"""Exporta todas as tabelas de um banco SQLite para JSON: {tabela: {"colunas": [...], "linhas": [[...], ...]}}.
Uso: python3 ferramentas/exportar_sqlite.py <banco.db> <saida.json>
Serve para a migração dos dados para o Supabase e para os testes de paridade (Python x TypeScript)."""
import json, sqlite3, sys

def exportar(caminho: str) -> dict:
    con = sqlite3.connect(caminho)
    saida = {}
    for (nome,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name"):
        cur = con.execute(f"SELECT * FROM {nome}")
        saida[nome] = {"colunas": [d[0] for d in cur.description], "linhas": [list(l) for l in cur.fetchall()]}
    return saida

if __name__ == "__main__":
    json.dump(exportar(sys.argv[1]), open(sys.argv[2], "w"), ensure_ascii=False)
