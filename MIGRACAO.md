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

- **Fase 1 (em andamento), portado e validado contra o Python (testes de paridade com o banco real):** versões (criar, copiar, período, horizonte, aprovar, excluir), produtos, grupos de custo e Arrendamentos (cadastro, parcelas, preços, leitura, cálculo e comparação). Faltam, desta fase: áreas, produtividade, preços de venda, custos variáveis, pecuária e premissas por produto.
- **Alterações feitas no sistema local depois da cópia** devem ser replicadas aqui. Última sincronização: excluir orçamento, tabelas largas (horizontes longos), textos retirados das telas e manual.

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

- Porte de ~9.300 linhas de Python (178 endpoints, 51 tabelas): trabalho grande, feito em etapas.
- Leitura de planilhas `.xlsx` no servidor: exige biblioteca equivalente em TypeScript.
- Limite de tempo das funções do Netlify: os cálculos mais pesados (comparação com impacto por grupo) podem precisar de ajuste.
