"""Premissas dos demonstrativos (DRE e Balanço): o usuário cadastra uma premissa, é OBRIGADO a vincular uma conta do demonstrativo
e digita um valor por ano. O valor cai na conta vinculada, multiplicado pelo sinal da premissa (1 soma, -1 subtrai).

Tipos: "valor" (o valor digitado cai na conta) e "percentual" (o valor digitado é um % e a conta recebe % × o campo BASE do mesmo demonstrativo,
ex.: IR e CSLL = % sobre o Ebt). O campo base pode ser qualquer linha do demonstrativo, inclusive totais e subtotais; o sistema recusa bases
que dependam da própria conta (cálculo circular). O cadastro PERGUNTA o que fazer quando o campo base for negativo (ex.: prejuízo antes do
imposto): "calcular" (o % incide normalmente e o efeito inverte o sinal, como um crédito) ou "zerar" (a premissa não gera efeito).

Fluxo na tela: "Nova premissa" cadastra (nome, demonstrativo, conta, sinal); em cada aba (DRE / Balanço) o usuário ADICIONA à versão
uma premissa já cadastrada, e ela vira uma linha com os anos para digitar. Só as premissas adicionadas à versão têm efeito.

Contas:
  * DRE     = contas de entrada da DRE sintética do Fechamento Contábil (as que não têm filhas nem fórmula);
  * Balanço = contas do BP Sintético do Fechamento Contábil (o balanço pequeno, sem filhas).
Os totais e subtotais dos demonstrativos são calculados pelo sistema; a premissa só alimenta a conta.
"""
from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

from . import arrendamentos as arr
from .arrendamentos import Invalido, NaoEncontrado

DEMONSTRATIVOS = {"dre": "DRE", "balanco": "Balanço"}
TIPOS = {"valor": "Valor", "percentual": "Percentual"}
BASE_NEGATIVA = {"calcular": "Calcular normalmente", "zerar": "Zerar (não gera efeito)"}
NATUREZA_RECEITA = ("receita", "outras receitas", "resultado")          # contas que ficam dentro de um grupo "(-)" mas são receita


def _agora() -> str:
    return arr._agora()


# ---------------------------------------------------------------- contas dos demonstrativos
def _caminho(por_codigo: Dict[str, dict], codigo: str) -> List[str]:
    nomes, atual, vistos = [], por_codigo.get(codigo), set()
    while atual and atual["codigo"] not in vistos:
        vistos.add(atual["codigo"])
        nomes.insert(0, atual["nome"])
        atual = por_codigo.get(atual["pai"])
    return nomes


def contas(con: sqlite3.Connection, demonstrativo: str) -> List[dict]:
    """Contas que aceitam premissa, na ordem do demonstrativo, com o caminho e o sinal sugerido."""
    if demonstrativo == "dre":
        from . import dre as svc_dre
        est = svc_dre._estrutura(con)
        por_codigo = {l["codigo"]: l for l in est}
        saida = []
        for l in est:
            if l["calculo"] != "entrada":
                continue
            caminho = _caminho(por_codigo, l["codigo"])
            despesa = caminho[0].strip().startswith("(-)") and not l["nome"].strip().lower().startswith(NATUREZA_RECEITA)
            saida.append({"codigo": l["codigo"], "nome": l["nome"], "caminho": caminho, "sinal_padrao": -1 if despesa else 1})
        return saida
    if demonstrativo == "balanco":
        linhas = [dict(r) for r in con.execute("SELECT * FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo")]
        por_codigo = {l["codigo"]: l for l in linhas}
        com_filhas = {l["pai"] for l in linhas}
        return [{"codigo": l["codigo"], "nome": l["nome"], "caminho": _caminho(por_codigo, l["codigo"]),
                 "sinal_padrao": -1 if l["nome"].strip().startswith("(-)") else 1}
                for l in linhas if l["tipo"] == "account" and l["codigo"] not in com_filhas and l["codigo"] != "SA07"]      # o caixa vem do Fluxo de caixa
    raise Invalido("Demonstrativo inválido; use DRE ou Balanço")


def bases(con: sqlite3.Connection, demonstrativo: str) -> List[dict]:
    """Linhas do demonstrativo que podem ser base de um percentual (todas as que têm valor em R$, inclusive totais)."""
    if demonstrativo == "dre":
        from . import dre as svc_dre
        est = [l for l in svc_dre._estrutura(con) if l["calculo"] in ("entrada", "soma", "calculada")]
        todas = {l["codigo"]: l for l in svc_dre._estrutura(con)}
        return [{"codigo": l["codigo"], "nome": l["nome"], "caminho": _caminho(todas, l["codigo"])} for l in est]
    if demonstrativo == "balanco":
        linhas = [dict(r) for r in con.execute("SELECT * FROM bp_linhas WHERE ativa=1 ORDER BY ordem, codigo")]
        por_codigo = {l["codigo"]: l for l in linhas}
        return [{"codigo": l["codigo"], "nome": l["nome"], "caminho": _caminho(por_codigo, l["codigo"])} for l in linhas]
    raise Invalido("Demonstrativo inválido; use DRE ou Balanço")


def _dependencias(con: sqlite3.Connection, demonstrativo: str):
    """Função: código da linha -> conjunto de contas (de entrada) de que o valor dela depende."""
    if demonstrativo == "dre":
        from . import dre as svc_dre
        est = {l["codigo"]: l for l in svc_dre._estrutura(con)}

        def filhos(c: str) -> List[str]:
            l = est.get(c)
            if not l:
                return []
            if l["calculo"] == "soma":
                return l["filhos"]
            f = svc_dre.FORMULAS.get(c)
            if f and f[0] == "soma":
                return list(f[1])
            if f and f[0] == "pct":
                return [f[1], f[2]]
            return []
        eh_conta = lambda c: est.get(c, {}).get("calculo") == "entrada"
    else:
        linhas = {r["codigo"]: dict(r) for r in con.execute("SELECT * FROM bp_linhas WHERE ativa=1")}
        por_pai: Dict[str, List[str]] = {}
        for l in linhas.values():
            por_pai.setdefault(l["pai"], []).append(l["codigo"])
        filhos = lambda c: por_pai.get(c, [])
        eh_conta = lambda c: c in linhas and not por_pai.get(c)

    def deps(codigo: str, vistos: Optional[set] = None) -> set:
        vistos = vistos if vistos is not None else set()
        if codigo in vistos:
            return set()
        vistos.add(codigo)
        if eh_conta(codigo):
            return {codigo}
        out: set = set()
        for f in filhos(codigo):
            out |= deps(f, vistos)
        return out
    return deps


def _validar_base(con: sqlite3.Connection, demonstrativo: str, conta: str, base: str, ignorar_pid: Optional[int] = None) -> dict:
    if not (base or "").strip():
        raise Invalido("Premissa percentual: escolha o campo sobre o qual o percentual incide")
    achada = next((b for b in bases(con, demonstrativo) if b["codigo"] == base), None)
    if not achada:
        raise Invalido(f"Esse campo não pode ser base no {DEMONSTRATIVOS[demonstrativo]}")
    deps = _dependencias(con, demonstrativo)
    if conta in deps(base):
        raise Invalido("Cálculo circular: o campo base depende da própria conta da premissa. Escolha outro campo base")
    # ciclo entre premissas percentuais: conta A depende da base de A; se a base de A depende da conta de B e vice-versa, não fecha
    arestas: Dict[str, set] = {conta: set(deps(base))}
    for p in con.execute("SELECT * FROM premissas_dem WHERE demonstrativo=? AND tipo='percentual' AND id IS NOT ?", (demonstrativo, ignorar_pid)):
        arestas.setdefault(p["conta_codigo"], set()).update(deps(p["base_codigo"]) if p["base_codigo"] else set())

    def ciclo(no: str, pilha: set, feitos: set) -> bool:
        if no in pilha:
            return True
        if no in feitos:
            return False
        feitos.add(no)
        pilha.add(no)
        if any(ciclo(v, pilha, feitos) for v in arestas.get(no, ())):
            return True
        pilha.discard(no)
        return False
    if ciclo(conta, set(), set()):
        raise Invalido("Cálculo circular entre premissas percentuais. Escolha outro campo base")
    return achada


def _conta_valida(con: sqlite3.Connection, demonstrativo: str, codigo: str) -> dict:
    if not (codigo or "").strip():
        raise Invalido("Toda premissa precisa estar vinculada a uma conta do demonstrativo")
    for c in contas(con, demonstrativo):
        if c["codigo"] == codigo:
            return c
    if demonstrativo == "balanco" and codigo == "SA07":
        raise Invalido("O caixa é calculado pelo Fluxo de caixa (caixa de fechamento com dívida de giro automática); escolha outra conta")
    raise Invalido(f"Essa conta não aceita premissa no {DEMONSTRATIVOS[demonstrativo]} (escolha uma conta, não um total)")


def _sinal(sinal) -> int:
    if sinal not in (1, -1):
        raise Invalido("Informe se a premissa soma (+) ou subtrai (−) da conta")
    return int(sinal)


# ---------------------------------------------------------------- cadastro
def criar(con: sqlite3.Connection, nome: str, demonstrativo: str, conta_codigo: str, sinal: int, autor: str,
          tipo: str = "valor", base_codigo: str = "", base_negativa: str = "") -> int:
    nome = (nome or "").strip()
    if not nome:
        raise Invalido("Informe o nome da premissa")
    if demonstrativo not in DEMONSTRATIVOS:
        raise Invalido("Demonstrativo inválido; use DRE ou Balanço")
    _conta_valida(con, demonstrativo, conta_codigo)
    sinal = _sinal(sinal)
    if tipo not in TIPOS:
        raise Invalido("Tipo inválido; use Valor ou Percentual")
    base_codigo = (base_codigo or "").strip() if tipo == "percentual" else ""
    if tipo == "percentual":
        _validar_base(con, demonstrativo, conta_codigo, base_codigo)
        if base_negativa not in BASE_NEGATIVA:
            raise Invalido("Informe o que fazer quando o campo base for negativo: calcular normalmente ou zerar")
    else:
        base_negativa = "calcular"
    if con.execute("SELECT 1 FROM premissas_dem WHERE demonstrativo=? AND nome=?", (demonstrativo, nome)).fetchone():
        raise Invalido(f"Já existe uma premissa '{nome}' no {DEMONSTRATIVOS[demonstrativo]}")
    cur = con.execute("INSERT INTO premissas_dem(demonstrativo, nome, conta_codigo, sinal, tipo, base_codigo, base_negativa, criada_em) VALUES(?,?,?,?,?,?,?,?)",
                      (demonstrativo, nome, conta_codigo, sinal, tipo, base_codigo, base_negativa, _agora()))
    arr.auditar(con, autor, None, "criar_premissa_dem", f"{DEMONSTRATIVOS[demonstrativo]}: {nome} → {conta_codigo}" + (f" ({base_codigo})" if base_codigo else ""))
    return cur.lastrowid


def _obter(con: sqlite3.Connection, pid: int) -> sqlite3.Row:
    r = con.execute("SELECT * FROM premissas_dem WHERE id=?", (pid,)).fetchone()
    if not r:
        raise NaoEncontrado("Premissa não encontrada")
    return r


def editar(con: sqlite3.Connection, pid: int, nome: Optional[str], conta_codigo: Optional[str], sinal: Optional[int], autor: str,
           base_codigo: Optional[str] = None, base_negativa: Optional[str] = None) -> None:
    p = _obter(con, pid)
    novo_nome = p["nome"] if nome is None else nome.strip()
    if not novo_nome:
        raise Invalido("Informe o nome da premissa")
    nova_conta = p["conta_codigo"] if conta_codigo is None else conta_codigo
    _conta_valida(con, p["demonstrativo"], nova_conta)
    novo_sinal = p["sinal"] if sinal is None else _sinal(sinal)
    if con.execute("SELECT 1 FROM premissas_dem WHERE demonstrativo=? AND nome=? AND id<>?", (p["demonstrativo"], novo_nome, pid)).fetchone():
        raise Invalido(f"Já existe uma premissa '{novo_nome}' no {DEMONSTRATIVOS[p['demonstrativo']]}")
    nova_base = p["base_codigo"]
    if p["tipo"] == "percentual":
        nova_base = p["base_codigo"] if base_codigo is None else base_codigo
        _validar_base(con, p["demonstrativo"], nova_conta, nova_base, ignorar_pid=pid)
    nova_neg = p["base_negativa"]
    if base_negativa is not None and p["tipo"] == "percentual":
        if base_negativa not in BASE_NEGATIVA:
            raise Invalido("Informe o que fazer quando o campo base for negativo: calcular normalmente ou zerar")
        nova_neg = base_negativa
    con.execute("UPDATE premissas_dem SET nome=?, conta_codigo=?, sinal=?, base_codigo=?, base_negativa=? WHERE id=?",
                (novo_nome, nova_conta, novo_sinal, nova_base, nova_neg, pid))
    arr.auditar(con, autor, None, "editar_premissa_dem", f"{novo_nome} → {nova_conta}")


def excluir(con: sqlite3.Connection, pid: int, autor: str) -> None:
    p = _obter(con, pid)
    con.execute("DELETE FROM premissas_dem_valores WHERE premissa_id=?", (pid,))
    con.execute("DELETE FROM premissas_dem_itens WHERE premissa_id=?", (pid,))
    con.execute("DELETE FROM premissas_dem WHERE id=?", (pid,))
    arr.auditar(con, autor, None, "excluir_premissa_dem", p["nome"])


# ---------------------------------------------------------------- valores por versão
def ler(con: sqlite3.Connection, vid: int) -> dict:
    v = dict(arr.obter_versao(con, vid))
    anos = arr.anos_da_versao(v)
    valores: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT premissa_id, ano, valor FROM premissas_dem_valores WHERE versao_id=?", (vid,)):
        valores.setdefault(r["premissa_id"], {})[r["ano"]] = r["valor"]
    plano = {d: contas(con, d) for d in DEMONSTRATIVOS}
    campos_base = {d: bases(con, d) for d in DEMONSTRATIVOS}
    nome_base = {d: {b["codigo"]: b for b in campos_base[d]} for d in DEMONSTRATIVOS}
    por_conta = {d: {c["codigo"]: c for c in plano[d]} for d in DEMONSTRATIVOS}
    em_uso = {r["premissa_id"] for r in con.execute("SELECT premissa_id FROM premissas_dem_itens WHERE versao_id=?", (vid,))}
    blocos: Dict[str, list] = {d: [] for d in DEMONSTRATIVOS}
    cadastradas: Dict[str, list] = {d: [] for d in DEMONSTRATIVOS}
    for p in con.execute("SELECT * FROM premissas_dem ORDER BY id"):
        conta = por_conta[p["demonstrativo"]].get(p["conta_codigo"])
        base = nome_base[p["demonstrativo"]].get(p["base_codigo"]) if p["tipo"] == "percentual" else None
        cadastradas[p["demonstrativo"]].append({"id": p["id"], "nome": p["nome"], "conta": conta["nome"] if conta else None,
                                                "caminho": conta["caminho"] if conta else [], "sinal": p["sinal"], "na_versao": p["id"] in em_uso,
                                                "tipo": p["tipo"], "base": base["nome"] if base else None})
        if p["id"] not in em_uso:
            continue
        blocos[p["demonstrativo"]].append({
            "id": p["id"], "nome": p["nome"], "conta_codigo": p["conta_codigo"], "sinal": p["sinal"], "tipo": p["tipo"],
            "unidade": "%" if p["tipo"] == "percentual" else "R$ mil", "base_codigo": p["base_codigo"], "base_negativa": p["base_negativa"],
            "base": base["nome"] if base else None, "base_caminho": base["caminho"] if base else [],
            "conta": conta["nome"] if conta else None, "caminho": conta["caminho"] if conta else [],
            "conta_existe": conta is not None, "valores": {a: valores.get(p["id"], {}).get(a, 0.0) for a in anos}})
    return {"versao": v, "anos": anos, "blocos": blocos, "cadastradas": cadastradas, "contas": plano, "bases": campos_base,
            "estrutura": {"dre": bool(con.execute("SELECT 1 FROM dre_importacao").fetchone()),
                          "balanco": bool(con.execute("SELECT 1 FROM bp_linhas LIMIT 1").fetchone())}}


def incluir(con: sqlite3.Connection, vid: int, pid: int, autor: str) -> None:
    """Adiciona à versão uma premissa já cadastrada (ela vira uma linha na aba do demonstrativo)."""
    arr.versao_editavel(con, vid)
    p = _obter(con, pid)
    if con.execute("SELECT 1 FROM premissas_dem_itens WHERE versao_id=? AND premissa_id=?", (vid, pid)).fetchone():
        raise Invalido(f"A premissa '{p['nome']}' já está nesta versão")
    con.execute("INSERT INTO premissas_dem_itens(versao_id, premissa_id) VALUES(?,?)", (vid, pid))
    arr.auditar(con, autor, vid, "incluir_premissa_dem", p["nome"])


def remover(con: sqlite3.Connection, vid: int, pid: int, autor: str) -> None:
    """Tira a premissa desta versão (apaga os valores dela aqui); o cadastro continua."""
    arr.versao_editavel(con, vid)
    p = _obter(con, pid)
    con.execute("DELETE FROM premissas_dem_valores WHERE versao_id=? AND premissa_id=?", (vid, pid))
    con.execute("DELETE FROM premissas_dem_itens WHERE versao_id=? AND premissa_id=?", (vid, pid))
    arr.auditar(con, autor, vid, "remover_premissa_dem", p["nome"])


def _exigir_na_versao(con: sqlite3.Connection, vid: int, p: sqlite3.Row) -> None:
    if not con.execute("SELECT 1 FROM premissas_dem_itens WHERE versao_id=? AND premissa_id=?", (vid, p["id"])).fetchone():
        raise Invalido(f"Adicione a premissa '{p['nome']}' à versão antes de lançar valores")


def salvar_valor(con: sqlite3.Connection, vid: int, pid: int, ano: int, valor: float, autor: str) -> None:
    v = arr.versao_editavel(con, vid)
    p = _obter(con, pid)
    _exigir_na_versao(con, vid, p)
    if ano not in arr.anos_da_versao(v):
        raise Invalido("Ano fora do horizonte da versão")
    con.execute("INSERT INTO premissas_dem_valores(versao_id, premissa_id, ano, valor) VALUES(?,?,?,?) "
                "ON CONFLICT(versao_id, premissa_id, ano) DO UPDATE SET valor=excluded.valor", (vid, pid, ano, valor))
    arr.auditar(con, autor, vid, "salvar_premissa_dem", f"{p['nome']} {ano}: {valor}")


def _copiar(con: sqlite3.Connection, vid: int, pid: int, ano_origem: int, destinos: List[int]) -> None:
    r = con.execute("SELECT valor FROM premissas_dem_valores WHERE versao_id=? AND premissa_id=? AND ano=?", (vid, pid, ano_origem)).fetchone()
    valor = r["valor"] if r else 0.0
    for a in destinos:
        con.execute("INSERT INTO premissas_dem_valores(versao_id, premissa_id, ano, valor) VALUES(?,?,?,?) "
                    "ON CONFLICT(versao_id, premissa_id, ano) DO UPDATE SET valor=excluded.valor", (vid, pid, a, valor))


def replicar(con: sqlite3.Connection, vid: int, pid: int, ano_origem: int, autor: str) -> int:
    v = arr.versao_editavel(con, vid)
    p = _obter(con, pid)
    _exigir_na_versao(con, vid, p)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido("Não há anos depois do escolhido para replicar")
    _copiar(con, vid, pid, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_premissa_dem", f"{p['nome']} de {ano_origem}")
    return len(destinos)


def replicar_todas(con: sqlite3.Connection, vid: int, ano_origem: int, autor: str, demonstrativo: Optional[str] = None) -> dict:
    v = arr.versao_editavel(con, vid)
    anos = arr.anos_da_versao(v)
    if ano_origem not in anos:
        raise Invalido("Ano de origem fora do horizonte da versão")
    destinos = [a for a in anos if a > ano_origem]
    if not destinos:
        raise Invalido("Não há anos depois do escolhido para replicar")
    ps = [r["id"] for r in con.execute(
        "SELECT p.id FROM premissas_dem p JOIN premissas_dem_itens i ON i.premissa_id=p.id AND i.versao_id=?"
        + (" WHERE p.demonstrativo=?" if demonstrativo else ""), (vid, demonstrativo) if demonstrativo else (vid,))]
    if not ps:
        raise Invalido("Não há premissas nesta versão para replicar")
    for pid in ps:
        _copiar(con, vid, pid, ano_origem, destinos)
    arr.auditar(con, autor, vid, "replicar_todas_premissas_dem", f"de {ano_origem}")
    return {"premissas": len(ps), "anos_alterados": len(destinos)}


# ---------------------------------------------------------------- efeito nos demonstrativos
def efeitos(con: sqlite3.Connection, vid: int, demonstrativo: str, anos: List[int]) -> Dict[str, List[dict]]:
    """Por conta do demonstrativo: as premissas que caem nela, com o valor já multiplicado pelo sinal."""
    validas = {c["codigo"] for c in contas(con, demonstrativo)}
    valores: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT premissa_id, ano, valor FROM premissas_dem_valores WHERE versao_id=?", (vid,)):
        valores.setdefault(r["premissa_id"], {})[r["ano"]] = r["valor"]
    saida: Dict[str, List[dict]] = {}
    for p in con.execute("SELECT p.* FROM premissas_dem p JOIN premissas_dem_itens i ON i.premissa_id=p.id AND i.versao_id=? "
                         "WHERE p.demonstrativo=? AND p.tipo='valor' ORDER BY p.id", (vid, demonstrativo)):
        if p["conta_codigo"] not in validas:
            continue
        saida.setdefault(p["conta_codigo"], []).append(
            {"nome": p["nome"], "valores": {a: p["sinal"] * valores.get(p["id"], {}).get(a, 0.0) for a in anos}})
    return saida


def percentuais(con: sqlite3.Connection, vid: int, demonstrativo: str, anos: List[int]) -> List[dict]:
    """Premissas percentuais da versão: conta, campo base, sinal e o % de cada ano."""
    validas = {c["codigo"] for c in contas(con, demonstrativo)}
    nomes_base = {b["codigo"]: b["nome"] for b in bases(con, demonstrativo)}
    bases_ok = set(nomes_base)
    valores: Dict[int, Dict[int, float]] = {}
    for r in con.execute("SELECT premissa_id, ano, valor FROM premissas_dem_valores WHERE versao_id=?", (vid,)):
        valores.setdefault(r["premissa_id"], {})[r["ano"]] = r["valor"]
    saida = []
    for p in con.execute("SELECT p.* FROM premissas_dem p JOIN premissas_dem_itens i ON i.premissa_id=p.id AND i.versao_id=? "
                         "WHERE p.demonstrativo=? AND p.tipo='percentual' ORDER BY p.id", (vid, demonstrativo)):
        if p["conta_codigo"] in validas and p["base_codigo"] in bases_ok:
            saida.append({"nome": p["nome"], "conta": p["conta_codigo"], "base": p["base_codigo"], "base_nome": nomes_base[p["base_codigo"]], "sinal": p["sinal"], "zerar_negativa": p["base_negativa"] == "zerar",
                          "pct": {a: valores.get(p["id"], {}).get(a, 0.0) for a in anos}})
    return saida


def aplicar_percentuais(con: sqlite3.Connection, vid: int, demonstrativo: str, anos: List[int], entradas: Dict[str, Dict[int, float]], calcular):
    """Soma às contas o efeito das premissas percentuais: sinal × % ÷ 100 × valor do campo base no mesmo ano.
    'calcular(entradas)' devolve o demonstrativo calculado (código -> {ano: valor}). Como a base pode depender de outra premissa percentual,
    repete até estabilizar (o cadastro impede ciclos). Devolve (calculado, entradas com os percentuais, nomes das premissas por conta)."""
    lista = percentuais(con, vid, demonstrativo, anos)
    nomes: Dict[str, List[str]] = {}
    for p in lista:
        nomes.setdefault(p["conta"], []).append(f"{p['nome']} (% sobre {p['base_nome']})")
    calc = calcular(entradas)
    if not lista:
        return calc, entradas, nomes
    efeito: Dict[str, Dict[int, float]] = {}
    for _ in range(len(lista) + 3):
        novo: Dict[str, Dict[int, float]] = {}
        for p in lista:
            acc = novo.setdefault(p["conta"], {a: 0.0 for a in anos})
            for a in anos:
                base = calc.get(p["base"], {}).get(a, 0.0)
                if p["zerar_negativa"] and base < 0:
                    base = 0.0
                acc[a] += p["sinal"] * p["pct"][a] / 100.0 * base
        if novo == efeito:
            break
        efeito = novo
        final = {c: dict(v) for c, v in entradas.items()}
        for c, serie in efeito.items():
            alvo = final.setdefault(c, {a: 0.0 for a in anos})
            for a in anos:
                alvo[a] = entradas.get(c, {}).get(a, 0.0) + serie[a]
        calc = calcular(final)
    entradas_final = {c: dict(v) for c, v in entradas.items()}
    for c, serie in efeito.items():
        alvo = entradas_final.setdefault(c, {a: 0.0 for a in anos})
        for a in anos:
            alvo[a] = entradas.get(c, {}).get(a, 0.0) + serie[a]
    return calc, entradas_final, nomes


def comparar(con: sqlite3.Connection, a_id: int, b_id: int) -> dict:
    la, lb = ler(con, a_id), ler(con, b_id)
    anos = sorted(set(la["anos"]) & set(lb["anos"]))
    if not anos:
        raise Invalido("As versões não têm anos em comum")
    out = {"a": la["versao"], "b": lb["versao"], "anos": anos, "premissas": []}
    vb = {p["id"]: p for d in DEMONSTRATIVOS for p in lb["blocos"][d]}
    for d in DEMONSTRATIVOS:
        for p in la["blocos"][d]:
            q = vb.get(p["id"], p)
            out["premissas"].append({
                "demonstrativo": d, "tipo": p["tipo"], "nome": p["nome"], "conta": p["conta"] or "(conta removida)",
                "anos": {a: {"a": p["valores"][a], "b": q["valores"][a], "delta": q["valores"][a] - p["valores"][a],
                             "pct": ((q["valores"][a] - p["valores"][a]) / abs(p["valores"][a]) * 100.0) if p["valores"][a] else None} for a in anos}})
    return out
