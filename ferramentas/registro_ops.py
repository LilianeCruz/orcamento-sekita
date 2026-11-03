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
