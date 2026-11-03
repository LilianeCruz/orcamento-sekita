"""Acesso ao banco (SQLite). Toda a aplicação passa por aqui, para podermos trocar de banco depois."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

DB_PATH = Path(os.environ.get("ORCAMENTO_DB", Path(__file__).resolve().parent.parent / "data" / "orcamento.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS versoes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ano_base INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('orcado','reprojetado','revisao')),
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','aprovado')),
  horizonte INTEGER NOT NULL DEFAULT 5,   -- quantos anos projetar a partir do ano base
  data_inicio TEXT,                       -- início do período do orçamento (AAAA-MM-DD)
  data_fim TEXT,                          -- fim do período do orçamento (AAAA-MM-DD)
  divida_importacao_id INTEGER REFERENCES divida_importacoes(id),   -- base de dívidas usada pela versão
  origem_id INTEGER REFERENCES versoes(id),
  criado_em TEXT NOT NULL,
  aprovado_em TEXT,
  autor TEXT NOT NULL DEFAULT 'local'
);
CREATE TABLE IF NOT EXISTS fazendas(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('propria','arrendada')),
  arrendador TEXT NOT NULL DEFAULT '',
  forma TEXT NOT NULL DEFAULT 'reais' CHECK(forma IN ('reais','produto')),
  cultura_id INTEGER REFERENCES culturas(id),   -- cultura usada no pagamento (quando forma='produto')
  observacao TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_fazendas_versao ON fazendas(versao_id);
CREATE TABLE IF NOT EXISTS fazenda_anos(
  fazenda_id INTEGER NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  area_ha REAL NOT NULL DEFAULT 0,
  valor REAL NOT NULL DEFAULT 0,          -- R$/ha (forma=reais) ou sacas/ha (forma=produto)
  PRIMARY KEY(fazenda_id, ano)
);
CREATE TABLE IF NOT EXISTS parcelas(
  fazenda_id INTEGER NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),
  percentual REAL NOT NULL,
  PRIMARY KEY(fazenda_id, mes)
);
CREATE TABLE IF NOT EXISTS precos(
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  ano INTEGER NOT NULL,
  preco REAL NOT NULL DEFAULT 0,          -- valor padrão, em R$ por embalagem padrão (ou por kg/litro, se não houver)
  PRIMARY KEY(versao_id, cultura_id, ano)
);
CREATE TABLE IF NOT EXISTS culturas(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  grupo TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'kg',        -- medida da produção: 'kg' (padrão), 'litro' (ex.: leite) ou 'uni' (unidade)
  embalagem TEXT NOT NULL DEFAULT '',        -- embalagem padrão (caixa, saco...); vazio = só na medida
  qtd_por_embalagem REAL NOT NULL DEFAULT 0, -- quantos kg (ou litros) cabem em uma embalagem (ex.: caixa de 20 kg)
  ativa INTEGER NOT NULL DEFAULT 1,
  estoque_destino TEXT NOT NULL DEFAULT 'produto' CHECK(estoque_destino IN ('produto','gado')),   -- linha do balanço que recebe o estoque do produto: Estoque de produtos acabados ou Estoque de gado de corte
  receita_tipo TEXT NOT NULL DEFAULT 'operacional' CHECK(receita_tipo IN ('operacional','nao_operacional')),   -- operacional: linha própria na DRE (receita e CPV); não operacional: vai para 'outras atividades'
  criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS culturas_da_versao(      -- culturas que a empresa vai cultivar em cada versão
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  PRIMARY KEY(versao_id, cultura_id)
);
CREATE TABLE IF NOT EXISTS areas_cultura(
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  ano INTEGER NOT NULL,
  area_ha REAL NOT NULL DEFAULT 0,           -- hectare físico, contado uma vez
  PRIMARY KEY(versao_id, cultura_id, ano)
);
CREATE TABLE IF NOT EXISTS produtividade(
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,     -- por hectare, na embalagem padrão da cultura (ou em kg/litro, se não houver)
  PRIMARY KEY(versao_id, cultura_id, ano)
);
CREATE TABLE IF NOT EXISTS precos_venda(           -- preço de venda: R$ por kg (ou por litro); separado do valor padrão de Arrendamentos
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  ano INTEGER NOT NULL,
  preco REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, cultura_id, ano)
);
CREATE TABLE IF NOT EXISTS divida_importacoes(      -- cada importação do 'Endividamento alterado.xlsx' é uma foto
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arquivo TEXT NOT NULL,
  importado_em TEXT NOT NULL,
  autor TEXT NOT NULL DEFAULT 'local',
  qtd_titulos INTEGER NOT NULL DEFAULT 0,
  qtd_abertos INTEGER NOT NULL DEFAULT 0,
  avisos TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS divida_titulos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  importacao_id INTEGER NOT NULL REFERENCES divida_importacoes(id) ON DELETE CASCADE,
  situacao TEXT NOT NULL,                 -- AB = aberto, PG = pago
  empresa TEXT NOT NULL DEFAULT '',       -- sigla: MESO, AFAL, ST, TAL...
  tipo TEXT NOT NULL DEFAULT '',          -- Custeio, Capital de Giro, Investimento, EGF
  grupo TEXT NOT NULL,                    -- capital_giro | investimento | indefinido
  banco TEXT NOT NULL DEFAULT '',
  tipo_recurso TEXT NOT NULL DEFAULT '',
  linha_credito TEXT NOT NULL DEFAULT '',
  documento TEXT NOT NULL DEFAULT '',
  contrato TEXT NOT NULL DEFAULT '',      -- documento sem o sufixo "/n"
  taxa REAL,                              -- ao ano (0,12 = 12%)
  data_operacao TEXT,
  data_vencimento TEXT,
  principal REAL NOT NULL DEFAULT 0,
  juros REAL NOT NULL DEFAULT 0,
  outras_despesas REAL NOT NULL DEFAULT 0,
  bruto REAL NOT NULL DEFAULT 0,
  produto TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_titulos_imp ON divida_titulos(importacao_id, situacao);
CREATE TABLE IF NOT EXISTS dre_linhas(                -- estrutura da DRE trazida do Fechamento Contábil (cadastro único)
  codigo TEXT PRIMARY KEY,
  nivel TEXT NOT NULL CHECK(nivel IN ('sintetica','analitica')),
  nome TEXT NOT NULL,
  pai TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'account',     -- group | account
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa INTEGER NOT NULL DEFAULT 1,
  destino TEXT NOT NULL DEFAULT ''          -- nas analíticas: código da linha sintética
);
CREATE TABLE IF NOT EXISTS anotacoes(                 -- marca-texto e comentário em um número de um relatório
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  tela TEXT NOT NULL,                       -- ex.: resultado
  chave TEXT NOT NULL,                      -- identifica o número na tela (cultura|linha|ano)
  cor TEXT NOT NULL DEFAULT '',             -- '' | amarelo | verde | vermelho
  comentario TEXT NOT NULL DEFAULT '',
  valor REAL,                               -- o número que a tela mostrava quando foi anotado (para avisar se mudar)
  validado INTEGER NOT NULL DEFAULT 0,      -- check: a anotação já foi conferida
  validado_em TEXT,
  validado_por TEXT,
  autor TEXT NOT NULL DEFAULT 'local',
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY(versao_id, tela, chave)
);
CREATE TABLE IF NOT EXISTS dre_importacao(            -- de onde veio a estrutura (uma linha só, a última)
  id INTEGER PRIMARY KEY CHECK(id=1),
  arquivo TEXT NOT NULL,
  importado_em TEXT NOT NULL,
  qtd_sinteticas INTEGER NOT NULL,
  qtd_analiticas INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS culturas_extras(             -- culturas adicionadas à mão em Produtividade ou Preços, sem área em 'Áreas por cultura'
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  tela TEXT NOT NULL,                       -- produtividade | precos
  PRIMARY KEY(versao_id, cultura_id, tela)
);
CREATE TABLE IF NOT EXISTS transportadora_valores(      -- premissas da transportadora (caminhões, km, preço por km, custos por km), por versão, campo e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  campo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS capital_giro(                -- premissas de capital de giro digitadas, por versão, campo e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  campo TEXT NOT NULL,                      -- dias_receber, dias_insumos, pct_caixa...
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS realizado_anos(               -- anos fechados importados (Balanço e DRE realizados, uma vez só, vale para todas as versões)
  ano INTEGER NOT NULL,
  demonstrativo TEXT NOT NULL,              -- BP | DRE
  arquivo TEXT NOT NULL,
  importado_em TEXT NOT NULL,
  importado_por TEXT NOT NULL,
  PRIMARY KEY(ano, demonstrativo)
);
CREATE TABLE IF NOT EXISTS realizado_parcial_anos(       -- ano ainda em andamento (ex.: jan a jun de 2026): só consulta e indicadores, não alimenta o orçamento
  ano INTEGER PRIMARY KEY,
  meses INTEGER NOT NULL,                   -- meses fechados (a DRE é do início do ano até aqui; o balanço é do último dia do período)
  arquivo TEXT NOT NULL,
  importado_em TEXT NOT NULL,
  importado_por TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS realizado_quantidades(        -- quantidade vendida de cada produto no período do realizado em andamento (para preço médio e comparação com o orçado)
  ano INTEGER NOT NULL,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  quantidade REAL NOT NULL DEFAULT 0,       -- na medida do produto (kg, litro ou unidade)
  PRIMARY KEY(ano, cultura_id)
);
CREATE TABLE IF NOT EXISTS realizado_parcial(
  ano INTEGER NOT NULL,
  demonstrativo TEXT NOT NULL,              -- BP | DRE
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  valor REAL NOT NULL,                      -- R$
  PRIMARY KEY(ano, demonstrativo, codigo)
);
CREATE TABLE IF NOT EXISTS realizado(                    -- linhas dos demonstrativos realizados, em R$
  ano INTEGER NOT NULL,
  demonstrativo TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(ano, demonstrativo, codigo)
);
CREATE TABLE IF NOT EXISTS investimento_classificacoes(  -- classificação do investimento (Expansão, Manutenção...): cadastro único
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  ativa INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS investimento_tipos(           -- tipos de investimento ou desinvestimento, cadastro único (vale para todas as versões)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  natureza TEXT NOT NULL,                   -- investimento | desinvestimento
  conta_codigo TEXT NOT NULL,               -- conta padrão do balanço (ativo)
  classificacao_id INTEGER NOT NULL REFERENCES investimento_classificacoes(id),
  carrega_saldo INTEGER NOT NULL DEFAULT 0, -- só investimento: traz o saldo a realizar do ano anterior
  vida_util REAL NOT NULL DEFAULT 0,        -- anos de depreciação linear do que for investido (0 = não deprecia)
  residual_pct REAL NOT NULL DEFAULT 0,     -- valor residual, % do investido
  carencia INTEGER NOT NULL DEFAULT 0,      -- anos depois do investimento até começar a depreciar
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS investimento_valores(         -- valores digitados por versão, tipo, campo e ano (R$ mil)
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  tipo_id INTEGER NOT NULL REFERENCES investimento_tipos(id),
  campo TEXT NOT NULL,                      -- saldo_ini (só no 1º ano) | novo | a_carregar | financiado (parte do investido do ano que é financiada)
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, tipo_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS investimento_excluidos(       -- tipos que NÃO fazem parte do orçamento de uma versão (por padrão todo tipo ativo entra)
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  tipo_id INTEGER NOT NULL REFERENCES investimento_tipos(id),
  PRIMARY KEY(versao_id, tipo_id)
);
CREATE TABLE IF NOT EXISTS rebanho_valores(              -- movimentação do rebanho dos produtos com estoque em gado de corte, por versão, produto, campo e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  campo TEXT NOT NULL,                      -- saldo_ini e valor_ini (só no 1º ano: cabeças e R$) | compras | nascimentos | mortes | vendas (cabeças)
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, cultura_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS dre_padrao(                   -- premissas padronizadas das contas da DRE sem origem: % sobre uma base ou valor (R$ mil), por versão, conta e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  codigo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, codigo, ano)
);
CREATE TABLE IF NOT EXISTS depreciacao_valores(          -- valores de depreciação alterados à mão (substituem o calculado) e a taxa média dos bens existentes
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  chave TEXT NOT NULL,                      -- taxa (ano 0) | existentes | tipo-<id>
  ano INTEGER NOT NULL,
  valor REAL NOT NULL,
  PRIMARY KEY(versao_id, chave, ano)
);
CREATE TABLE IF NOT EXISTS novas_captacoes(              -- captações novas de custeio e capital de giro, por versão (investimento nasce na tela Investimentos)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,                       -- custeio | capital_giro
  ano INTEGER NOT NULL,                     -- ano em que o dinheiro entra (meio do ano)
  valor REAL NOT NULL,                      -- R$ mil
  taxa REAL NOT NULL DEFAULT 0,             -- % ao ano
  prazo INTEGER NOT NULL DEFAULT 1,         -- parcelas anuais de principal
  carencia INTEGER NOT NULL DEFAULT 0       -- anos sem amortizar depois do ano da captação
);
CREATE TABLE IF NOT EXISTS captacao_valores(             -- amortização e juros alterados à mão (substituem o calculado)
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  chave TEXT NOT NULL,                      -- cap-<id> | inv-<tipo_id>-<ano>
  campo TEXT NOT NULL,                      -- amort | juros
  ano INTEGER NOT NULL,
  valor REAL NOT NULL,
  PRIMARY KEY(versao_id, chave, campo, ano)
);
CREATE TABLE IF NOT EXISTS financiamento_premissas(      -- taxa, prazo e carência do financiamento dos investimentos, por versão e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  campo TEXT NOT NULL,                      -- taxa | prazo | carencia
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS patrimonio_valores(           -- premissas do patrimônio líquido por versão, campo e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  campo TEXT NOT NULL,                      -- dist_pct | dist_valor | aporte | ajuste
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS giro_auto_premissas(          -- taxa da dívida de giro automática, por versão e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  campo TEXT NOT NULL,                      -- origem (0 digitar, 1 média das captações de custeio, 2 média das de capital de giro) | taxa (% a.a.)
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS indicadores_metas(            -- limite (mínimo ou máximo) de cada indicador financeiro, por versão e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  indicador TEXT NOT NULL,
  ano INTEGER NOT NULL,
  valor REAL NOT NULL,
  PRIMARY KEY(versao_id, indicador, ano)
);
CREATE TABLE IF NOT EXISTS capital_giro_origem(         -- prazos calculados do balanço realizado (botão "atualizar prazos"); digitar de novo apaga a marca
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  campo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  ano_realizado INTEGER NOT NULL,           -- último ano do período usado
  anos TEXT NOT NULL DEFAULT '',            -- todos os anos da média, ex.: 2023,2024,2025
  PRIMARY KEY(versao_id, campo, ano)
);
CREATE TABLE IF NOT EXISTS pecuaria_leite(              -- produtividade pecuária (leite) por versão e ano
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  ano INTEGER NOT NULL,
  animais REAL NOT NULL DEFAULT 0,          -- total de animais em lactação (uni)
  kg_animal_dia REAL NOT NULL DEFAULT 0,    -- produtividade diária por animal (kg/dia)
  PRIMARY KEY(versao_id, ano)
);
CREATE TABLE IF NOT EXISTS bp_linhas(                 -- estrutura do balanço (BP Sintético do Fechamento Contábil)
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  pai TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'account',     -- group | account
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS premissas_dem(              -- premissas dos demonstrativos: cada uma cai em uma conta da DRE ou do balanço
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demonstrativo TEXT NOT NULL,              -- dre | balanco
  nome TEXT NOT NULL COLLATE NOCASE,
  conta_codigo TEXT NOT NULL,
  sinal INTEGER NOT NULL DEFAULT 1,         -- 1 soma na conta; -1 subtrai (despesa na DRE)
  tipo TEXT NOT NULL DEFAULT 'valor',       -- valor | percentual (percentual de um campo base do demonstrativo)
  base_codigo TEXT NOT NULL DEFAULT '',     -- no tipo percentual: a linha do demonstrativo sobre a qual o % incide
  base_negativa TEXT NOT NULL DEFAULT 'calcular',  -- percentual com base negativa: calcular (gera valor com o sinal invertido) | zerar
  criada_em TEXT NOT NULL,
  UNIQUE(demonstrativo, nome)
);
CREATE TABLE IF NOT EXISTS premissas_dem_itens(        -- premissas cadastradas que estão em uso (adicionadas à aba) em cada versão
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  premissa_id INTEGER NOT NULL REFERENCES premissas_dem(id),
  PRIMARY KEY(versao_id, premissa_id)
);
CREATE TABLE IF NOT EXISTS premissas_dem_valores(      -- valor digitado por versão e ano, em R$ mil
  versao_id INTEGER NOT NULL REFERENCES versoes(id),
  premissa_id INTEGER NOT NULL REFERENCES premissas_dem(id),
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, premissa_id, ano)
);
CREATE TABLE IF NOT EXISTS dre_valores(               -- valores lançados nas linhas de entrada da DRE sintética, em R$ mil
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, codigo, ano)
);
CREATE TABLE IF NOT EXISTS prem_culturas(            -- culturas escolhidas na tela Premissas de culturas (só as de Áreas)
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  PRIMARY KEY(versao_id, cultura_id)
);
CREATE TABLE IF NOT EXISTS prem_itens(               -- tipos de premissa vinculados a cada cultura (cada um vira uma linha)
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  tipo TEXT NOT NULL,
  PRIMARY KEY(versao_id, cultura_id, tipo)
);
CREATE TABLE IF NOT EXISTS prem_valores(
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  tipo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, cultura_id, tipo, ano)
);
CREATE TABLE IF NOT EXISTS custos_culturas(          -- culturas escolhidas na tela de Custos variáveis (só as que estão em Áreas)
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  PRIMARY KEY(versao_id, cultura_id)
);
CREATE TABLE IF NOT EXISTS custos_grupos_cultura(    -- grupos de custo que a versão usa em cada cultura (cada um vira uma linha)
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  grupo_id INTEGER NOT NULL REFERENCES grupos_custo(id),
  PRIMARY KEY(versao_id, cultura_id, grupo_id)
);
CREATE TABLE IF NOT EXISTS custos_cultura(           -- custo variável em R$ por hectare
  versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
  cultura_id INTEGER NOT NULL REFERENCES culturas(id),
  grupo_id INTEGER NOT NULL REFERENCES grupos_custo(id),
  ano INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(versao_id, cultura_id, grupo_id, ano)
);
CREATE TABLE IF NOT EXISTS grupos_custo(            -- cadastro único dos grupos de custos variáveis
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  classificacao TEXT NOT NULL CHECK(classificacao IN ('direto','indireto')),
  ativa INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auditoria(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL,
  autor TEXT NOT NULL,
  versao_id INTEGER,
  acao TEXT NOT NULL,
  detalhe TEXT
);
"""


def conectar() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # cada requisição abre a sua própria conexão e a usa em sequência; o upload (endpoint async) cria
    # a conexão numa thread e a usa em outra, então a checagem de thread do SQLite precisa ficar desligada
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def iniciar() -> None:
    con = conectar()
    try:
        con.executescript(SCHEMA)
        colunas = {r["name"] for r in con.execute("PRAGMA table_info(versoes)")}
        if "horizonte" not in colunas:           # bancos criados antes do horizonte configurável
            con.execute("ALTER TABLE versoes ADD COLUMN horizonte INTEGER NOT NULL DEFAULT 5")
        for col in ("data_inicio", "data_fim"):      # bancos criados antes do período por datas
            if col not in colunas:
                con.execute(f"ALTER TABLE versoes ADD COLUMN {col} TEXT")
        if "divida_importacao_id" not in colunas:    # bancos criados antes da base de dívidas
            con.execute("ALTER TABLE versoes ADD COLUMN divida_importacao_id INTEGER REFERENCES divida_importacoes(id)")
        if "anos" not in {r["name"] for r in con.execute("PRAGMA table_info(capital_giro_origem)")}:   # bancos com o botão de prazos de um ano só
            con.execute("ALTER TABLE capital_giro_origem ADD COLUMN anos TEXT NOT NULL DEFAULT ''")
        cols_tipo = {r["name"] for r in con.execute("PRAGMA table_info(investimento_tipos)")}
        for coluna, ddl in (("vida_util", "REAL NOT NULL DEFAULT 0"), ("residual_pct", "REAL NOT NULL DEFAULT 0"), ("carencia", "INTEGER NOT NULL DEFAULT 0")):
            if cols_tipo and coluna not in cols_tipo:         # bancos com os tipos de investimento ainda sem depreciação
                con.execute(f"ALTER TABLE investimento_tipos ADD COLUMN {coluna} {ddl}")
        if not con.execute("SELECT 1 FROM investimento_classificacoes LIMIT 1").fetchone():      # classificações que a empresa já usa
            con.executemany("INSERT INTO investimento_classificacoes(nome) VALUES(?)",
                            [("Expansão",), ("Manutenção",), ("Melhoria da Capacidade Produtiva",), ("Substituição",), ("Redução de Risco de Produção",), ("A Classificar",)])
        con.execute("DELETE FROM capital_giro WHERE campo='dias_despesas'")             # virou dois prazos (rotação e preparo), agora sobre o CPV
        con.execute("DELETE FROM capital_giro_origem WHERE campo='dias_despesas'")
        if "valor" not in {r["name"] for r in con.execute("PRAGMA table_info(anotacoes)")}:
            con.execute("ALTER TABLE anotacoes ADD COLUMN valor REAL")
        colunas_notas = {r["name"] for r in con.execute("PRAGMA table_info(anotacoes)")}
        for col, ddl in (("validado", "INTEGER NOT NULL DEFAULT 0"), ("validado_em", "TEXT"), ("validado_por", "TEXT")):
            if col not in colunas_notas:
                con.execute(f"ALTER TABLE anotacoes ADD COLUMN {col} {ddl}")
        colunas_prem = {r["name"] for r in con.execute("PRAGMA table_info(premissas_dem)")}
        for col, ddl in (("tipo", "TEXT NOT NULL DEFAULT 'valor'"), ("base_codigo", "TEXT NOT NULL DEFAULT ''"), ("base_negativa", "TEXT NOT NULL DEFAULT 'calcular'")):
            if colunas_prem and col not in colunas_prem:
                con.execute(f"ALTER TABLE premissas_dem ADD COLUMN {col} {ddl}")
        cols_parc = {r["name"] for r in con.execute("PRAGMA table_info(realizado_parcial_anos)")}
        for col, ddl in (("mes_inicio", "INTEGER NOT NULL DEFAULT 1"), ("versao_id", "INTEGER")):      # período (mês inicial) e orçamento comparado
            if cols_parc and col not in cols_parc:
                con.execute(f"ALTER TABLE realizado_parcial_anos ADD COLUMN {col} {ddl}")
        _migrar_culturas(con)
        _migrar_produtos(con)
        # versões que já tinham áreas lançadas passam a ter essas culturas na lista de cultivadas
        con.execute("INSERT OR IGNORE INTO custos_culturas(versao_id, cultura_id) "
                    "SELECT DISTINCT versao_id, cultura_id FROM custos_grupos_cultura")
        con.execute("INSERT OR IGNORE INTO culturas_da_versao(versao_id, cultura_id) "
                    "SELECT DISTINCT versao_id, cultura_id FROM areas_cultura")
        con.commit()
    finally:
        con.close()


def _migrar_culturas(con: sqlite3.Connection) -> None:
    """Leva bancos de versões anteriores do cadastro de produtos para o formato atual
    (unidade = kg|litro|uni, embalagem padrão e quantidade por embalagem)."""
    colunas = {r["name"] for r in con.execute("PRAGMA table_info(culturas)")}
    if not colunas:
        return
    if "estoque_destino" not in colunas:       # bancos criados antes da linha própria de estoque de gado
        con.execute("ALTER TABLE culturas ADD COLUMN estoque_destino TEXT NOT NULL DEFAULT 'produto'")
    if "receita_tipo" not in colunas:          # bancos criados antes do tipo de receita
        con.execute("ALTER TABLE culturas ADD COLUMN receita_tipo TEXT NOT NULL DEFAULT 'operacional'")
    if "kg_por_unidade" in colunas:        # 1ª versão: 'unidade' era texto livre (caixa, saco...)
        con.execute("ALTER TABLE culturas ADD COLUMN embalagem TEXT NOT NULL DEFAULT ''")
        con.execute("ALTER TABLE culturas ADD COLUMN qtd_por_embalagem REAL NOT NULL DEFAULT 0")
        con.execute(
            "UPDATE culturas SET "
            "embalagem = CASE WHEN LOWER(TRIM(unidade)) IN ('kg','litro','') THEN '' ELSE TRIM(unidade) END, "
            "qtd_por_embalagem = CASE WHEN LOWER(TRIM(unidade)) IN ('kg','litro','') THEN 0 ELSE kg_por_unidade END"
        )
        con.execute("UPDATE culturas SET unidade = CASE WHEN LOWER(TRIM(unidade))='litro' THEN 'litro' ELSE 'kg' END")
        con.execute("ALTER TABLE culturas DROP COLUMN kg_por_unidade")
    elif "kg_por_embalagem" in colunas:    # 2ª versão: só kg
        if "unidade" not in colunas:
            con.execute("ALTER TABLE culturas ADD COLUMN unidade TEXT NOT NULL DEFAULT 'kg'")
        con.execute("ALTER TABLE culturas RENAME COLUMN kg_por_embalagem TO qtd_por_embalagem")


def _migrar_produtos(con: sqlite3.Connection) -> None:
    """Antes, Arrendamentos tinha a própria lista de produtos (texto). Agora usa o cadastro de Culturas:
    cada nome vira (ou reaproveita) uma cultura, e os preços e fazendas passam a apontar para ela."""
    cols_f = {r["name"] for r in con.execute("PRAGMA table_info(fazendas)")}
    cols_p = {r["name"] for r in con.execute("PRAGMA table_info(precos)")}
    f_antigo, p_antigo = "produto" in cols_f, "produto" in cols_p
    if not (f_antigo or p_antigo):
        return
    nomes = []
    if f_antigo:
        nomes += [r[0] for r in con.execute("SELECT DISTINCT TRIM(produto) FROM fazendas WHERE TRIM(produto)<>''")]
    if p_antigo:
        nomes += [r[0] for r in con.execute("SELECT DISTINCT TRIM(produto) FROM precos WHERE TRIM(produto)<>''")]
    mapa = {}
    for nome in nomes:
        if nome in mapa:
            continue
        r = con.execute("SELECT id FROM culturas WHERE nome=? COLLATE NOCASE", (nome,)).fetchone()
        if r:
            mapa[nome] = r["id"]
        else:                                  # a embalagem antiga era a saca; o usuário informa os kg depois
            cur = con.execute(
                "INSERT INTO culturas(nome, grupo, unidade, embalagem, qtd_por_embalagem, ativa, criado_em) "
                "VALUES(?,?,?,?,?,1,datetime('now'))", (nome, "Grãos", "kg", "Saco", 0))
            mapa[nome] = cur.lastrowid
    if f_antigo:
        if "cultura_id" not in cols_f:
            con.execute("ALTER TABLE fazendas ADD COLUMN cultura_id INTEGER REFERENCES culturas(id)")
        for nome, cid in mapa.items():
            con.execute("UPDATE fazendas SET cultura_id=? WHERE forma='produto' AND TRIM(produto)=?", (cid, nome))
        con.execute("ALTER TABLE fazendas DROP COLUMN produto")
    if p_antigo:
        con.execute("""CREATE TABLE precos_novo(
            versao_id INTEGER NOT NULL REFERENCES versoes(id) ON DELETE CASCADE,
            cultura_id INTEGER NOT NULL REFERENCES culturas(id),
            ano INTEGER NOT NULL, preco REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(versao_id, cultura_id, ano))""")
        for r in con.execute("SELECT versao_id, TRIM(produto) AS produto, ano, preco FROM precos").fetchall():
            if r["produto"] in mapa:
                con.execute("INSERT OR REPLACE INTO precos_novo(versao_id, cultura_id, ano, preco) VALUES(?,?,?,?)",
                            (r["versao_id"], mapa[r["produto"]], r["ano"], r["preco"]))
        con.execute("DROP TABLE precos")
        con.execute("ALTER TABLE precos_novo RENAME TO precos")
