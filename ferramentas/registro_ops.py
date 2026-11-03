"""Registro das operações usadas no teste de paridade Python x TypeScript. Cada nome aqui tem um igual em testes/registro_ops.mts.
Uma operação é ["modulo.funcao", arg1, arg2, ...]; o autor é sempre o mesmo. Ao portar um módulo novo, acrescente as operações dele nos dois registros."""
A = "t@x.com"

def registro():
    from app.servicos import arrendamentos as arr, areas, extras, produtividade as prod, precos, pecuaria, grupos_custo as gc, anotacoes as notas, culturas, custos, premissas, rebanho, resultado
    R = {
        # versões
        "versoes.copiar": lambda c, o, tipo, nome=None: arr.copiar_versao(c, o, tipo, nome, A),
        "versoes.periodo": lambda c, v, nome, i, f: arr.alterar_periodo(c, v, nome, i, f, A),
        "versoes.horizonte": lambda c, v, h: arr.alterar_horizonte(c, v, h, A),
        # arrendamentos
        "arr.criar_fazenda": lambda c, v, d: arr.criar_fazenda(c, v, d, A),
        "arr.atualizar_fazenda": lambda c, f, d: arr.atualizar_fazenda(c, f, d, A),
        "arr.salvar_ano": lambda c, f, ano, area, valor: arr.salvar_ano(c, f, ano, area, valor, A),
        "arr.replicar_fazenda": lambda c, f, ano, campos: arr.replicar_fazenda(c, f, ano, campos, A),
        "arr.salvar_parcelas": lambda c, f, p: arr.salvar_parcelas(c, f, p, A),
        "arr.salvar_precos": lambda c, v, p: arr.salvar_precos(c, v, p, A),
        "arr.replicar_preco": lambda c, v, cid, ano: arr.replicar_preco(c, v, cid, ano, A),
        "arr.excluir_fazenda": lambda c, f: arr.excluir_fazenda(c, f, A),
        # áreas
        "areas.adicionar": lambda c, v, cid: areas.adicionar_cultura(c, v, cid, A),
        "areas.salvar": lambda c, v, cid, ano, ha: areas.salvar_area(c, v, cid, ano, ha, A),
        "areas.replicar": lambda c, v, cid, ano: areas.replicar(c, v, cid, ano, A),
        "areas.replicar_todas": lambda c, v, ano: areas.replicar_todas(c, v, ano, A),
        "areas.remover": lambda c, v, cid: areas.remover_cultura(c, v, cid, A),
        # lista de produtividade e preços
        "extras.incluir": lambda c, v, tela, cid: extras.incluir(c, v, tela, cid, A),
        "extras.remover": lambda c, v, tela, cid: extras.remover(c, v, tela, cid, A),
        # produtividade
        "prod.salvar": lambda c, v, cid, ano, val: prod.salvar(c, v, cid, ano, val, A),
        "prod.replicar": lambda c, v, cid, ano: prod.replicar(c, v, cid, ano, A),
        "prod.replicar_todas": lambda c, v, ano: prod.replicar_todas(c, v, ano, A),
        # preços de venda
        "precos.salvar": lambda c, v, cid, ano, val: precos.salvar(c, v, cid, ano, val, A),
        "precos.replicar": lambda c, v, cid, ano: precos.replicar(c, v, cid, ano, A),
        "precos.replicar_todas": lambda c, v, ano: precos.replicar_todas(c, v, ano, A),
        # pecuária
        "pec.salvar": lambda c, v, campo, ano, val: pecuaria.salvar(c, v, campo, ano, val, A),
        "pec.replicar": lambda c, v, campo, ano: pecuaria.replicar(c, v, campo, ano, A),
        "pec.replicar_todos": lambda c, v, ano: pecuaria.replicar_todos(c, v, ano, A),
        # grupos de custo e anotações
        "grupos.criar": lambda c, d: gc.criar(c, d, A),
        "grupos.atualizar": lambda c, g, d: gc.atualizar(c, g, d, A),
        "grupos.excluir": lambda c, g: gc.excluir(c, g, A),
        "notas.salvar": lambda c, v, tela, chave, cor, com, valor=None: notas.salvar(c, v, tela, chave, cor, com, A, valor),
        "notas.validar": lambda c, v, tela, chave, ok: notas.validar(c, v, tela, chave, ok, A),
    }
    R.update({
        "culturas.criar": lambda c, d: culturas.criar(c, d, A), "culturas.atualizar": lambda c, i, d: culturas.atualizar(c, i, d, A), "culturas.excluir": lambda c, i: culturas.excluir(c, i, A),
        "custos.adicionar_cultura": lambda c, v, cid: custos.adicionar_cultura(c, v, cid, A), "custos.remover_cultura": lambda c, v, cid: custos.remover_cultura(c, v, cid, A),
        "custos.adicionar_grupo": lambda c, v, cid, g: custos.adicionar_grupo(c, v, cid, g, A), "custos.adicionar_grupo_a_todas": lambda c, v, g: custos.adicionar_grupo_a_todas(c, v, g, A),
        "custos.remover_grupo": lambda c, v, cid, g: custos.remover_grupo(c, v, cid, g, A), "custos.salvar": lambda c, v, cid, g, ano, val: custos.salvar(c, v, cid, g, ano, val, A),
        "custos.replicar": lambda c, v, cid, g, ano: custos.replicar(c, v, cid, g, ano, A), "custos.replicar_todos": lambda c, v, ano: custos.replicar_todos(c, v, ano, A),
        "prem.adicionar_cultura": lambda c, v, cid: premissas.adicionar_cultura(c, v, cid, A), "prem.remover_cultura": lambda c, v, cid: premissas.remover_cultura(c, v, cid, A),
        "prem.adicionar_tipo": lambda c, v, cid, t: premissas.adicionar_tipo(c, v, cid, t, A), "prem.adicionar_tipo_a_todas": lambda c, v, t: premissas.adicionar_tipo_a_todas(c, v, t, A),
        "prem.remover_tipo": lambda c, v, cid, t: premissas.remover_tipo(c, v, cid, t, A), "prem.salvar": lambda c, v, cid, t, ano, val: premissas.salvar(c, v, cid, t, ano, val, A),
        "prem.replicar": lambda c, v, cid, t, ano: premissas.replicar(c, v, cid, t, ano, A), "prem.replicar_todas": lambda c, v, ano: premissas.replicar_todas(c, v, ano, A),
        "reb.salvar": lambda c, v, cid, campo, ano, val: rebanho.salvar(c, v, cid, campo, ano, val, A), "reb.replicar": lambda c, v, cid, campo, ano: rebanho.replicar(c, v, cid, campo, ano, A),
        "ler.custos": lambda c, v: custos.ler(c, v), "ler.premissas": lambda c, v: premissas.ler(c, v), "ler.rebanho": lambda c, v: rebanho.ler(c, v), "ler.resultado": lambda c, v: resultado.calcular(c, v),
        "comparar.custos": lambda c, a, b: custos.comparar(c, a, b), "comparar.premissas": lambda c, a, b: premissas.comparar(c, a, b), "comparar.resultado": lambda c, a, b: resultado.comparar(c, a, b),
        "ler.areas": lambda c, v: areas.ler(c, v), "ler.produtividade": lambda c, v: prod.ler(c, v), "ler.precos_venda": lambda c, v: precos.ler(c, v),
        "ler.pecuaria": lambda c, v: pecuaria.ler(c, v), "ler.arrendamentos": lambda c, v: {**arr.ler(c, v), "calculo": arr.calcular(c, v)},
        "ler.culturas": lambda c: culturas.listar(c), "ler.grupos": lambda c: gc.listar(c), "ler.notas": lambda c, v, tela: notas.listar(c, v, tela),
        "comparar.areas": lambda c, a, b: areas.comparar(c, a, b), "comparar.produtividade": lambda c, a, b: prod.comparar(c, a, b),
        "comparar.precos_venda": lambda c, a, b: precos.comparar(c, a, b), "comparar.pecuaria": lambda c, a, b: pecuaria.comparar(c, a, b),
        "comparar.arrendamentos": lambda c, a, b: arr.comparar(c, a, b),
    })
    R.update(_realizado())
    R.update(_fase4())
    R.update(_fase5())
    return R


def _realizado():
    import base64, io
    from app.servicos import realizado as real
    def importar(c, b64, arquivo, ano_inicial=None, meses=None, mes_inicio=None, versao_id=None, quantidades=None):
        q = {int(k): v for k, v in quantidades.items()} if quantidades is not None else None
        return real.importar(c, base64.b64decode(b64), arquivo, A, ano_inicial, meses, mes_inicio, versao_id, q)
    def modelo_linhas(c):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(real.modelo(c)), data_only=True)
        return {ws.title: [list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}
    return {
        "real.importar": importar, "real.excluir_ano": lambda c, ano: real.excluir_ano(c, ano, A),
        "real.salvar_periodo": lambda c, mi, mf, v=None: real.salvar_periodo(c, mi, mf, v, A),
        "real.salvar_quantidade": lambda c, cid, q, ano=None: real.salvar_quantidade(c, cid, q, A, ano),
        "ler.realizado": lambda c: real.ler(c), "ler.real_periodo": lambda c: real.periodo(c), "ler.real_quantidades": lambda c: real.quantidades_por_ano(c),
        "ler.real_produtos": lambda c: real.produtos_venda(c), "ler.real_importacoes": lambda c: real.importacoes_comparaveis(c),
        "real.saldo_inicial": lambda c, ano: real.saldo_inicial(c, ano), "real.valor": lambda c, dem, cod, ano: real.valor_realizado(c, dem, cod, ano),
        "real.ultimo_ano": lambda c: real.ultimo_ano(c), "real.periodo_do_ano": lambda c, ano: real.periodo_do_ano(c, ano), "real.modelo_linhas": modelo_linhas,
    }


def _fase4():
    import base64
    from app.servicos import (premissas_dem as pd, investimentos as inv, capital_giro as cg, captacoes as cap, dividas as div, dre_padrao as dp, dre,
                              balanco as bal, patrimonio as pat, fluxo, transportadora as transp)
    def projetar(c, v):
        p = fluxo.projetar(c, v)
        return {k: p.get(k) for k in ("ativo", "caixa", "divida", "juros_auto", "variacao", "minimo", "linhas", "total", "avisos")}
    return {
        "pd.criar": lambda c, nome, dem, conta, sinal, tipo="valor", base="", neg="": pd.criar(c, nome, dem, conta, sinal, A, tipo, base, neg),
        "pd.editar": lambda c, pid, nome=None, conta=None, sinal=None, base=None, neg=None: pd.editar(c, pid, nome, conta, sinal, A, base, neg),
        "pd.excluir": lambda c, pid: pd.excluir(c, pid, A), "pd.incluir": lambda c, v, pid: pd.incluir(c, v, pid, A), "pd.remover": lambda c, v, pid: pd.remover(c, v, pid, A),
        "pd.salvar": lambda c, v, pid, ano, val: pd.salvar_valor(c, v, pid, ano, val, A), "pd.replicar": lambda c, v, pid, ano: pd.replicar(c, v, pid, ano, A),
        "pd.replicar_todas": lambda c, v, ano, dem=None: pd.replicar_todas(c, v, ano, A, dem),
        "pd.contas": lambda c, dem: pd.contas(c, dem), "pd.bases": lambda c, dem: pd.bases(c, dem),
        "inv.criar_classificacao": lambda c, nome: inv.criar_classificacao(c, nome, A),
        "inv.criar_tipo": lambda c, d, v=None, adicionar=True: inv.criar_tipo(c, d, A, v, adicionar), "inv.editar_tipo": lambda c, tid, d: inv.editar_tipo(c, tid, d, A),
        "inv.excluir_tipo": lambda c, tid: inv.excluir_tipo(c, tid, A), "inv.incluir": lambda c, v, tid: inv.incluir_na_versao(c, v, tid, A), "inv.retirar": lambda c, v, tid: inv.retirar_da_versao(c, v, tid, A),
        "inv.salvar": lambda c, v, tid, campo, ano, val: inv.salvar_valor(c, v, tid, campo, ano, val, A), "inv.replicar": lambda c, v, tid, campo, ano: inv.replicar(c, v, tid, campo, ano, A),
        "inv.replicar_todos": lambda c, v, ano: inv.replicar_todos(c, v, ano, A),
        "inv.salvar_depreciacao": lambda c, v, chave, ano, val: inv.salvar_depreciacao(c, v, chave, ano, val, A), "inv.voltar_depreciacao": lambda c, v, chave: inv.voltar_ao_calculado(c, v, chave, A),
        "cg.atualizar_prazos": lambda c, v, anos=None: cg.atualizar_prazos(c, v, A, anos), "cg.previa": lambda c, v: cg.previa_prazos(c, v),
        "cg.salvar": lambda c, v, campo, ano, val: cg.salvar(c, v, campo, ano, val, A), "cg.replicar": lambda c, v, campo, ano: cg.replicar(c, v, campo, ano, A),
        "cg.replicar_todos": lambda c, v, ano: cg.replicar_todos(c, v, ano, A),
        "cap.criar": lambda c, v, d: cap.criar(c, v, d, A), "cap.editar": lambda c, v, cid, d: cap.editar(c, v, cid, d, A), "cap.excluir": lambda c, v, cid: cap.excluir(c, v, cid, A),
        "cap.salvar_valor": lambda c, v, chave, campo, ano, val: cap.salvar_valor(c, v, chave, campo, ano, val, A), "cap.voltar": lambda c, v, chave: cap.voltar_ao_calculado(c, v, chave, A),
        "cap.salvar_premissa": lambda c, v, campo, ano, val: cap.salvar_premissa(c, v, campo, ano, val, A), "cap.replicar_premissa": lambda c, v, campo, ano: cap.replicar_premissa(c, v, campo, ano, A),
        "div.importar": lambda c, b64, nome, v=None: div.importar(c, base64.b64decode(b64), nome, v, A), "div.importar_padrao": lambda c, v=None: div.importar_arquivo_padrao(c, v, A),
        "div.vincular": lambda c, v, imp: div.vincular(c, v, imp, A),
        "dp.atualizar": lambda c, v, anos=None: dp.atualizar(c, v, A, anos), "dp.previa": lambda c, v: dp.previa(c, v), "dp.salvar": lambda c, v, cod, ano, val: dp.salvar(c, v, cod, ano, val, A),
        "dp.replicar": lambda c, v, cod, ano: dp.replicar(c, v, cod, ano, A), "dp.replicar_todos": lambda c, v, ano: dp.replicar_todos(c, v, ano, A),
        "pat.salvar": lambda c, v, campo, ano, val: pat.salvar(c, v, campo, ano, val, A), "pat.voltar": lambda c, v, campo: pat.voltar_ao_calculado(c, v, campo, A),
        "pat.replicar": lambda c, v, campo, ano: pat.replicar(c, v, campo, ano, A), "pat.replicar_todos": lambda c, v, ano: pat.replicar_todos(c, v, ano, A),
        "fluxo.salvar_premissa": lambda c, v, campo, ano, val: fluxo.salvar_premissa(c, v, campo, ano, val, A), "fluxo.replicar_premissa": lambda c, v, campo, ano: fluxo.replicar_premissa(c, v, campo, ano, A),
        "dre.importar_padrao": lambda c: dre.importar_arquivo_padrao(c, A),
        "dre.importar_estrutura": lambda c, b64, nome: dre.importar_estrutura(c, base64.b64decode(b64), nome, A),
        "ler.premissas_dem": lambda c, v: pd.ler(c, v), "comparar.premissas_dem": lambda c, a, b: pd.comparar(c, a, b),
        "ler.investimentos": lambda c, v: inv.ler(c, v), "comparar.investimentos": lambda c, a, b: inv.comparar(c, a, b),
        "ler.capital_giro": lambda c, v: cg.ler(c, v), "comparar.capital_giro": lambda c, a, b: cg.comparar(c, a, b),
        "ler.captacoes": lambda c, v: cap.ler(c, v), "comparar.captacoes": lambda c, a, b: cap.comparar(c, a, b),
        "ler.dividas": lambda c, v, emp="agro": div.resumo(c, v, emp), "ler.dividas_balanco": lambda c, v, emp="agro": div.balanco(c, v, emp),
        "ler.dividas_mensal_por_ano": lambda c, v, emp="agro": div.mensal_por_ano(c, v, emp), "ler.dividas_mensal": lambda c, v, ano, emp="agro": div.mensal(c, v, ano, emp),
        "ler.dividas_contratos": lambda c, v, emp="agro", ano=None, grupo=None: div.contratos(c, v, emp, ano, grupo), "ler.dividas_importacoes": lambda c: div.listar_importacoes(c),
        "ler.dre_padrao": lambda c, v: dp.ler(c, v), "ler.dre": lambda c, v: dre.ler(c, v), "comparar.dre": lambda c, a, b: dre.comparar(c, a, b),
        "ler.balanco": lambda c, v: bal.ler(c, v), "comparar.balanco": lambda c, a, b: bal.comparar(c, a, b),
        "ler.patrimonio": lambda c, v: pat.ler(c, v), "comparar.patrimonio": lambda c, a, b: pat.comparar(c, a, b),
        "ler.fluxo_motor": lambda c, v: fluxo.ler(c, v), "ler.projetar": projetar,
        "transp.salvar": lambda c, v, campo, ano, val: transp.salvar(c, v, campo, ano, val, A), "transp.replicar": lambda c, v, campo, ano: transp.replicar(c, v, campo, ano, A),
        "transp.replicar_todos": lambda c, v, ano: transp.replicar_todos(c, v, ano, A), "ler.transportadora": lambda c, v: transp.ler(c, v),
    }


def _fase5():
    from app.servicos import demonstrativos as demo, orcado_realizado as orc, comparacao as cmp, anotacoes as notas, inicio
    return {
        "demo.salvar_meta": lambda c, v, ind, ano, val: demo.salvar_meta(c, v, ind, ano, val, A), "demo.replicar_meta": lambda c, v, ind, ano: demo.replicar_meta(c, v, ind, ano, A),
        "ler.fluxo_dem": lambda c, v: demo.ler_fluxo(c, v), "ler.usos_fontes": lambda c, v: demo.usos_fontes(c, v), "ler.indicadores": lambda c, v: demo.indicadores(c, v),
        "ler.orcreal": lambda c, v, ano: orc.comparar(c, v, ano), "ler.inicio": lambda c, v: inicio.ler(c, v), "ler.notas_todas": lambda c, v: notas.listar_todas(c, v),
        "cmp.comparar": lambda c, base, outros, ano, itens, imp=True: cmp.comparar(c, base, outros, ano, itens, imp, A), "cmp.imprimir": lambda c, v, itens: cmp.imprimir(c, v, itens),
        "cmp.metricas": lambda c, v, ano: cmp.metricas(c, v, ano), "cmp.itens": lambda c: cmp.ITENS,
    }
