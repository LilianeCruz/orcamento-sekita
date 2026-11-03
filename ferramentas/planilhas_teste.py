"""Gera planilhas .xlsx de teste (um arquivo por formato aceito na importação do realizado) a partir da estrutura de um banco.
Uso: python3 ferramentas/planilhas_teste.py <banco.db> <pasta de saída>. Serve ao teste de paridade (testes/paridade_fase3.test.mts)."""
import os, sqlite3, sys
from openpyxl import Workbook

def gerar(banco: str, pasta: str) -> None:
    con = sqlite3.connect(banco)
    bp = con.execute("SELECT codigo, nome, pai FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo").fetchall()
    dre = con.execute("SELECT codigo, nome FROM dre_linhas WHERE nivel='sintetica' AND ativa=1 ORDER BY ordem, codigo").fetchall()
    os.makedirs(pasta, exist_ok=True)
    v = lambda i, a: round(1000.0 * (i * 37 % 101 + 1) * (1 + (a - 2000) / 50), 2)

    # 1. planilha modelo (Realizado): BP e DRE de 2019 e 2020, e um 2021 só de BP
    wb = Workbook(); ws = wb.active; ws.title = "Realizado"
    ws.append(["Ano", "Demonstrativo", "Código", "Conta", "Valor"])
    for ano in (2019, 2020, 2021):
        for i, (c, n, _) in enumerate(bp):
            ws.append([ano, "BP", c, n, v(i, ano) if i % 3 else None])
        if ano != 2021:
            for i, (c, n) in enumerate(dre):
                if "%" not in n: ws.append([ano, "DRE", c, n, -v(i, ano) if i % 2 else v(i, ano)])
    ws.append([2019, "bp", "SX99", "Conta nova fora da estrutura", "1.234,50"])
    wb.save(os.path.join(pasta, "modelo.xlsx"))
    wb = Workbook(); ws = wb.active; ws.title = "Realizado"        # com erro: demonstrativo inválido
    ws.append(["Ano", "Demonstrativo", "Código", "Conta", "Valor"]); ws.append([2019, "XX", "SA07", "x", 10]); wb.save(os.path.join(pasta, "modelo_erro.xlsx"))
    wb = Workbook(); ws = wb.active; ws.title = "Realizado"        # com conta repetida no mesmo ano
    ws.append(["Ano", "Demonstrativo", "Código", "Conta", "Valor"]); ws.append([2019, "BP", "SA07", "x", 10]); ws.append([2019, "BP", "SA07", "x", 11]); wb.save(os.path.join(pasta, "modelo_dup.xlsx"))

    # 2. banco do Fechamento Contábil: 2022 anual (criado 2x), 2023 em 4 trimestres, 2024 só até setembro (BP não termina em 31/12 → ignorado)
    wb = Workbook(); fs = wb.active; fs.title = "Fechamentos"
    fs.append(["id", "x", "y", "inicio", "fim", "criado"])
    fech = [(1, "2022-01-01", "2022-12-31", "2023-02-01 10:00:00"), (2, "2022-01-01", "2022-12-31", "2023-03-01 10:00:00"),
            (3, "2023-01-01", "2023-03-31", "2023-04-10"), (4, "2023-04-01", "2023-06-30", "2023-07-10"), (5, "2023-07-01", "2023-09-30", "2023-10-10"), (6, "2023-10-01", "2023-12-31", "2024-01-10"),
            (7, "2024-01-01", "2024-09-30", "2024-10-10"), (8, "2025-01-01", "2025-06-30", "2025-07-10"), (9, "2025-07-01", "2025-12-31", "2025-12-31")]
    for f in fech: fs.append([f[0], "", "", f[1], f[2], f[3]])
    ls = wb.create_sheet("Fechamento Linhas")
    ls.append(["id", "cons", "", "", "dem", "vis", "cod", "nome", "", "", "", "valor"])
    for fid, *_ in fech:
        for i, (c, n, _) in enumerate(bp):
            ls.append([fid, "CONSOLIDADO", "", "", "BP", "SINTETICO", c, n, "", "", "", v(i, 2000 + fid)])
        for i, (c, n) in enumerate(dre):
            ls.append([fid, "CONSOLIDADO", "", "", "DRE", "SINTETICO", c, n, "", "", "", ("%d" % (i * 7)) if "%" in n else (v(i, 2000 + fid) if i % 2 else "-%s" % v(i, 2000 + fid))])
        ls.append([fid, "OUTRA", "", "", "DRE", "SINTETICO", "DS007", "ignorada", "", "", "", 5])
    wb.save(os.path.join(pasta, "fechamento.xlsx"))
    wb = Workbook(); fs = wb.active; fs.title = "Fechamentos"; fs.append(["id", "x", "y", "inicio", "fim", "criado"]); fs.append([1, "", "", "2024-01-01", "2024-06-30", "x"])
    wb.create_sheet("Fechamento Linhas").append(["id"]); wb.save(os.path.join(pasta, "fechamento_sem_dezembro.xlsx"))

    # 3. Fechamento Financeiro: Balanco9anos (ativo: rótulo col. B, anos antes da col. M; passivo: rótulo col. N, anos depois) e Comparativo de AV
    wb = Workbook(); b = wb.active; b.title = "Balanco9anos"
    anos = [2023, 2024, 2025, 2026]
    cab = [None] * 30
    for k, a in enumerate(anos): cab[2 + k] = a; cab[14 + k] = a
    b.append(cab)
    nomes = {"SA": [], "SP": []}
    def rotulos(sec):
        out = [("Circulante", None), ]
        for c, n, pai in bp:
            if c.startswith(sec) and len(c) > 2: out.append((n, c))
        return out
    ativo = [("Circulante", None)] + [(n, c) for c, n, p in bp if c.startswith("SA") and p == "SA06"] + [("Não Circulante", None)] + [(n, c) for c, n, p in bp if c.startswith("SA") and p in ("SA16", "SA19")] + [("Ativo Total", None)]
    passivo = [("Circulante", None)] + [(n, c) for c, n, p in bp if c.startswith("SP") and p == "SP06"] + [("Não Circulante", None)] + [(n, c) for c, n, p in bp if c.startswith("SP") and p in ("SP16", "SP22")] + [("Passivo Total", None)]
    for k in range(max(len(ativo), len(passivo))):
        row = [None] * 30
        if k < len(ativo):
            row[1] = ativo[k][0]
            for j, a in enumerate(anos): row[2 + j] = v(k, a)
        if k < len(passivo):
            row[13] = passivo[k][0]
            for j, a in enumerate(anos): row[14 + j] = v(k + 5, a)
        b.append(row)
    d = wb.create_sheet("Comparativo de AV")
    d.append(["Conta"] + anos + ["AV"])
    for i, (c, n) in enumerate(dre):
        d.append([n] + [v(i, a) * (-1 if i % 2 else 1) for a in anos])
    d.append(["Linha que não existe na estrutura", 1, 2, 3, 4])
    wb.save(os.path.join(pasta, "financeiro.xlsx"))

if __name__ == "__main__":
    gerar(sys.argv[1], sys.argv[2])
