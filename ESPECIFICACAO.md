# Sistema de Orçamento Sekita — Especificação (rascunho 1)

Status: **para revisão**. Nenhum código escrito. Baseado em: `Projeção financeira - 2018_2030 V.031223.xlsm` (modelo anual), `Fluxo de Caixa Painel.xlsx` (caixa mensal), `Endividamento_Sekita` e `fluxo-caixa` (sistemas existentes).

## 1. Objetivo
Substituir o retrabalho "orçamento anual em uma planilha + refazer tudo mensalmente em outra" por um sistema onde **o usuário preenche premissas anuais simples** e o sistema gera:
- demonstrações **anuais**: DRE, balanço, DFC indireto, usos e fontes, indicadores;
- **fluxo de caixa direto mensal**, convertendo competência em caixa.

## 2. Decisões já tomadas
| Tema | Decisão |
|---|---|
| Empresa | Só **Agropecuária** (MESO + AFAL) na v1; Transportadora depois (estrutura multiempresa desde o início) |
| Ano | **Janeiro a dezembro** |
| Orçamento | Elaborado em **novembro** para o ano seguinte |
| Preenchimento | Anual, simples. Despesas **agrupadas**; abertas por conta apenas no fluxo mensal |
| Mensal | Somente o **fluxo de caixa direto**. DRE/balanço/DFC indireto/usos e fontes/indicadores são anuais |
| Competência → caixa | Perfis de distribuição mensal + **prazos médios do ano cadastrados como premissa** |
| Estoque de passagem | Mantém a lógica do modelo atual (parte da safra vendida no ano seguinte) |
| Versões | **Orçado** (aprovado e travado), **Realizado**, **Reprojetado** (ajustável) |
| Aprovação | Uma pessoa. Revisões **sob demanda** (trimestral, semestral ou quando quiser) |
| Dívida | Importa `Endividamento alterado.xlsx` (aba *Dados*) do sistema Endividamento_Sekita |
| Realizado | Vem do sistema `fluxo-caixa`. **Integração só depois** da estrutura pronta; v1 deixa o espaço preparado |
| Histórico | Carrega somente realizado, sem orçados antigos |
| Usuários | Só o autor agora; pode abrir para outros no futuro |

## 3. Plataforma (decidido)
FastAPI + **SQLite** (gratuito, arquivo único) + tela web local, mesmo padrão do `fluxo-caixa` (backup, auditoria, testes pytest). Excel **não** é usado como banco; serve para importar (dívida, premissas em lote) e exportar (orçamento, fluxo mensal, comparativos, cópia a cada aprovação/revisão).

Preparado para evoluir para PostgreSQL (gratuito) e vários usuários sem refazer: acesso ao banco isolado em uma camada única, esquema sem recursos exclusivos do SQLite, regras (trava do orçado, verificações) no backend, e coluna `autor` nas ações desde o início. Ao abrir para outras pessoas será preciso: login e perfis, hospedagem em servidor, controle de edição simultânea, rotina de backup.

## 4. Plano de contas do fluxo (alinhado ao `fluxo-caixa`)
Reutilizar a tabela `classificacoes` (25 linhas), para o Orçado encontrar o Realizado linha a linha:

- **Operacional:** Venda de Produção, Receitas de Fretes, Receitas Financeiras, Outras Receitas Operacionais; Custos e Despesas, Despesas Financeiras, Juros s/ Capital de Giro, Juros s/ Investimentos, Outras Despesas Operacionais, Despesas Administrativas, Outras Despesas Não Operacionais
- **Financiamentos:** Cap. Recursos (Capital de Giro, Custeio, Investimentos), Estocagem Alho; Amortizações Fin. (Capital Giro, Investimentos)
- **Investimentos:** Investimentos, Desinvestimentos, Outros Investimentos, Empréstimos entre Grupo, Resgate/Aplicação de Previdência e Títulos
- **Ajuste de fluxos:** Dividendos e Pro Labore, Contas de Transição

Para as despesas ("Custos e Despesas" é uma linha só no realizado), o orçamento usa **grupos** (ex.: Insumos agrícolas, Insumos pecuária, Insumos beneficiamento, Mão de obra e encargos, Combustíveis, Energia, Manutenção, Arrendamentos, Outras despesas) e a abertura por conta vem do histórico do realizado. **A definir:** lista final dos grupos.

## 5. Premissas anuais (telas de entrada)
Herdadas do modelo atual, por ano:
1. **Terras:** área plantada por cultura, área arrendada.
2. **Produtividade** por cultura (e leite: animais em lactação, litros/dia).
3. **Preços** por cultura e do leite.
4. **Custos variáveis por ha** por cultura (MOD, insumos, mecanização, irrigação, rotação/indireto, beneficiamento + colheita).
5. **Custos fixos e administrativos**, por grupo.
6. **CAPEX, depreciação, desinvestimentos.**
7. **Dívida nova prevista** (captações: valor, taxa, prazo, carência).
8. **Deduções** (Funrural e demais, % da receita).
9. **Prazos médios do ano** (cadastro): recebimento por produto, pagamento por grupo de gasto.
10. **Calendário por cultura** (cadastro, reutilizável): meses de venda e de custo (% por mês).

## 6. Motor de cálculo
### 6.1 Anual (como o modelo atual)
área × produtividade × preço = receita bruta; − deduções; custo/ha × área = custos; estoque de passagem entre safras; fixos, arrendamento, depreciação, juros (vindos da dívida), IR, dividendos. Balanço com verificação de fechamento.

### 6.2 Anual → mensal (somente caixa direto)
1. **Competência mensal:** cada item anual é distribuído por um perfil: *Linear*, *Safra/Ciclo da cultura* (calendário), *Pontual* (meses escolhidos), *Contrato* (cronograma real da dívida).
2. **Caixa mensal:** competência deslocada pelo prazo médio (vendas recebem em N dias; compras pagam em M dias). Contas a receber/pagar de 31/12 saem desse cálculo e alimentam o balanço anual.
3. **Dívida:** cada contrato do `Endividamento alterado.xlsx` gera juros e amortização mensais; captações novas geram cronograma próprio.
4. **Ajuste manual** de um mês é permitido e o total anual é recalculado e sinalizado.

### 6.3 Verificações automáticas
- Soma dos 12 meses do caixa direto = variação de caixa do DFC indireto anual.
- Caixa de dezembro = caixa do balanço.
- Balanço fecha (ativo = passivo + PL).

## 7. Versões, trava e revisões
- **Orçado:** ao clicar *Aprovar*, congela premissas e fluxos (somente leitura; registra data e autor). Mudança extraordinária cria nova versão aprovada (v2), mantendo a v1.
- **Reprojetado:** criado como cópia do orçado. Meses fechados = realizado; meses abertos editáveis (premissas). Cada revisão pode ser salva com nome e data ("Rev. 2 – jun/27").
- **Comparações:** Orçado × Realizado × Reprojetado, Δ% contra o orçado ou contra a última revisão.

## 8. Modelo de dados (resumo)
`empresas`, `culturas`, `calendarios_cultura`, `premissas` (ano, versão, empresa, chave, valor), `prazos`, `grupos_despesa` (↔ contas), `classificacoes` (do fluxo), `contratos_divida` (importados), `captacoes_novas`, `versoes` (orcado/reprojetado/revisão, status, aprovado_em, autor), `resultados_anuais`, `fluxo_mensal` (versão, mês, linha, valor), `realizado_mensal` (integração futura), `auditoria`.

## 9. Fases sugeridas
1. **Protótipo cenoura:** premissas anuais → receita/custo → caixa mensal com prazos, validado contra a coluna "Orçado" da planilha mensal.
2. Todas as culturas + pecuária + despesas por grupo + fluxo mensal completo.
3. Importação da dívida e cronogramas.
4. DRE, balanço, DFC indireto, usos e fontes, indicadores (anuais) e verificações.
5. Versões: aprovar/travar, reprojetado, revisões.
6. Integração com o realizado do `fluxo-caixa`; comparativos.
7. (Futuro) Transportadora, múltiplos usuários.

## 10. Pontos em aberto
1. Lista final de **grupos de despesa** para o preenchimento anual.
2. Fonte dos **calendários** (curvas mensais) e dos **prazos**: usar histórico das planilhas mensais como ponto de partida?
3. Estrutura exata das colunas de `Endividamento alterado.xlsx` usadas (valores, vencimentos, parcelas) — ler em detalhe antes da fase 3.
4. Regras escondidas no **VBA** do modelo anual (módulos 2, 3, 4, 6, 7) — ainda não lidas.
5. Comportamento de cultura com **safra que atravessa o ano** no caixa mensal (alho).
6. Dados da planilha mensal com erros (`#REF!`, números como texto) — não serão migrados; só servem de referência.
