# Migração do Orçamento Sekita para Supabase + Netlify

Cópia do sistema para trabalhar na nuvem. O sistema original (`Orcamento_Sekita`) continua intacto e funcionando.

## Arquitetura de destino

| Parte | Onde fica | Observação |
|---|---|---|
| Código | GitHub (repositório privado) | Netlify publica sozinho a cada atualização |
| Tela (`web/`) | Netlify | Mesma tela de hoje; a função `api()` continua com a mesma assinatura |
| Cálculo e regras | Funções do Netlify (TypeScript) | Porte dos serviços Python, um módulo por vez |
| Banco | Supabase (Postgres) | Substitui o SQLite |
| Login | Supabase Auth | Cada chamada à API leva o token do usuário |

## Estratégia

1. **Python como gabarito.** O código Python atual (`app/`) e os testes (`tests/`) ficam nesta pasta só como referência. Cada módulo portado para TypeScript é validado **comparando o resultado com o do Python**, no mesmo banco, até a diferença ser zero.
2. **Mesma API.** As funções do Netlify respondem aos mesmos caminhos `/api/...` com o mesmo formato, então a tela quase não muda.
3. **Um módulo por vez.** O sistema passa a funcionar em partes; módulos ainda não portados não ficam disponíveis na cópia.

## Fases

| # | Fase | Conteúdo | Pronto quando |
|---|---|---|---|
| 0 | Base | Repositório, estrutura de pastas, esquema do banco em Postgres (51 tabelas), login Supabase, função `api` com roteador | Login funciona e a tela abre vazia |
| 1 | Cadastros e premissas de produção | Versões/orçamentos, produtos, áreas, produtividade, preços, custos variáveis, grupos de custo, pecuária | Telas de premissas gravam e leem no Supabase |
| 2 | Resultado por produto, arrendamentos, transportadora | Cálculo do resultado por produto, estoque de passagem | Números iguais aos do Python |
| 3 | Investimentos, depreciação, capital de giro, patrimônio | Premissas de balanço | Números iguais aos do Python |
| 4 | Dívidas e captações | Importação da base de dívidas, balanço das dívidas, novas captações | Números iguais aos do Python |
| 5 | DRE, Balanço, Fluxo de caixa, Usos e fontes, Indicadores | Motor financeiro (inclui a dívida de giro automática, com convergência de juros) | DRE, Balanço e Fluxo fecham (diferença zero) |
| 6 | Realizado e Orçado × realizado | Importação de planilhas (xlsx), quantidades, comparação | Importa os arquivos reais e a comparação bate |
| 7 | Comparação, impressão e anotações | Relatórios em PDF, anotações | Tudo equivalente ao sistema atual |
| 8 | Migração dos dados | Levar orçamentos, realizado e anotações do SQLite para o Supabase | Conferência de totais |

## Andamento

- **Fase 0, quase pronta:**
  - Esquema do Postgres criado no Supabase (51 tabelas, RLS ligada e sem política; só o servidor acessa): `supabase/migrations/0001_esquema.sql`, gerado por `ferramentas/gerar_esquema_postgres.py`.
  - Esqueleto das funções do Netlify: `netlify/functions/api.mts` (porta de entrada), `lib/auth.mts` (confere o login), `lib/db.mts` (Postgres), `lib/roteador.mts`. Rotas de teste: `/api/config` (pública), `/api/saude`, `/api/versoes`.
  - Login: `web/login.html`, `web/login.js` e `web/auth.js` (Supabase Auth). A tela principal só abre com sessão e tem o botão **Sair**; toda chamada à API leva o token.
  - Falta: testar com as chaves reais (depois da configuração abaixo) e recriar os dados iniciais do SQLite (classificações de investimento, produtos padrão).

- **Tudo portado para TypeScript e validado contra o Python** (testes de paridade com o banco real: mesmas operações nos dois sistemas, comparando retornos, erros e todas as tabelas):
  - Fase 1–2: versões, produtos, grupos de custo, Arrendamentos, áreas, produtividade, preços, pecuária, custos variáveis, premissas por produto, rebanho, resultado por produto, transportadora, anotações e Início.
  - Fase 3 (`paridade_fase3`): **realizado** (importação das três planilhas: modelo, Fechamento Financeiro e banco do Fechamento Contábil; ano em andamento; quantidades vendidas; saldo inicial; prazos).
  - Fase 4 (`paridade_fase4`): premissas dos demonstrativos, investimentos e depreciação, capital de giro, captações, dívidas (importa o `Endividamento alterado.xlsx` real), premissas padronizadas da DRE, **DRE, balanço, patrimônio líquido e caixa com dívida de giro automática (convergência dos juros)**, importação da estrutura do Fechamento Contábil (arquivo real de 18 MB).
  - Fase 5 (`paridade_fase5`): fluxo de caixa indireto/simplificado, usos e fontes, indicadores (metas), **orçado × realizado**, **comparação com impacto por grupo de premissas**, impressão e **anotações "todas" com "valor alterado"** (que alimentam o Início).
- **Carga dos dados feita**: o SQLite do sistema local foi levado para o Supabase com `ferramentas/carregar_supabase.mts` (conferência: todas as tabelas com o mesmo número de linhas). Para repetir: `python3 ferramentas/exportar_sqlite.py <orcamento.db> dump.json` e `netlify dev:exec -- npx tsx ferramentas/carregar_supabase.mts dump.json` (só carrega se a nuvem estiver vazia; `--forcar` substitui). As variáveis do Netlify entram no processo sem aparecer.
- **Leituras com cache por requisição** (`lib/bd.mts`, `comCache`): os cálculos se chamam uns aos outros e repetem as mesmas consultas; cada consulta vai ao banco uma vez por requisição e qualquer escrita limpa o cache. Medição contra o Supabase (`ferramentas/medir_tempo.mts`): DRE, balanço e fluxo levam cerca de 2,5 s a partir de um computador local (≈ 50 idas ao banco).
- **Alterações feitas no sistema local depois da cópia** devem ser replicadas aqui (comparar as pastas com `diff -rq`). Última sincronização: nada novo em `app/` nem em `web/` além das diferenças da nuvem (login, token, botão Sair e o aviso do arquivo padrão de dívidas).

## Diferenças conhecidas da nuvem

- **Arquivos pesados**: a função do Netlify aceita corpo de até ~6 MB. O banco do Fechamento Contábil (18 MB) não sobe pela tela; a estrutura (DRE e balanço) já foi levada pela carga. O `Endividamento alterado.xlsx` (2,8 MB) e as planilhas do realizado sobem normalmente.
- **Botões "padrão"**: não existe o arquivo padrão no servidor; a tela de Endividamento mostra só "Escolher arquivo…" (a importação padrão da DRE responde com aviso).
- **Tempo das funções**: o limite padrão é 10 s (até 26 s nas configurações do site). As telas comuns ficam em ~2–3 s; a **comparação com impacto por grupo** cria uma cópia temporária por grupo e recalcula tudo, então pode passar de 10 s em orçamentos grandes (se acontecer, aumentar o tempo limite das funções no Netlify ou comparar sem impacto).
- Os campos antigos do SQLite (`financiado_pct`, `fin_taxa`, `fin_prazo`, `fin_carencia` em `investimento_tipos`) não existem no esquema novo; nada os usava.

## Configuração (uma vez)

**Supabase** (Authentication):
1. *Sign In / Providers → Email*: deixe e-mail e senha ligados.
2. Desligue **Allow new users to sign up** (ninguém se cadastra sozinho).
3. *Users → Add user → Create new user*: crie os usuários (e-mail e senha) e marque "Auto Confirm User".

**Netlify** (Site configuration → Environment variables):

| Variável | De onde vem |
|---|---|
| `SUPABASE_URL` | `https://gstbkqtwmomxvmhpcxva.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys (chave pública, "anon"/"publishable") |
| `SUPABASE_SERVICE_ROLE_KEY` | mesma tela (chave secreta, "service_role"): **só no Netlify** |
| `DATABASE_URL` | Supabase → Connect → *Transaction pooler* (troque `[YOUR-PASSWORD]` pela senha do banco) |
| `EMAILS_PERMITIDOS` | (opcional) e-mails com acesso, separados por vírgula |

## O que preciso de você

- Um projeto no **Supabase** (URL do projeto, chave `anon` e chave `service_role`). As chaves ficam só em arquivo `.env`/variáveis do Netlify, nunca no código.
- Um site no **Netlify** ligado ao repositório do **GitHub**.
- Decidir o login: **Supabase Auth** (recomendado) ou outro.

## Riscos conhecidos

- Porte de ~9.300 linhas de Python (178 endpoints, 51 tabelas): feito; agora é manter o Python e o TypeScript em sincronia quando o sistema local mudar.
- Leitura de planilhas `.xlsx` no servidor: feita com `exceljs` (o texto lido é igual ao do `openpyxl`, inclusive o código `_x000D_` do Excel).
- Limite de tempo das funções do Netlify: os cálculos mais pesados (comparação com impacto por grupo) podem precisar de ajuste.
