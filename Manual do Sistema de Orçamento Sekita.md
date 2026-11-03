# Manual do Sistema de Orçamento Sekita

Este manual explica o sistema do começo ao fim: da tela inicial até os demonstrativos. Para cada tela você encontra **para que ela serve**, **o que cada campo significa**, **de onde vem cada número** e **um exemplo**.

> **Regra de ouro do sistema:** você só **digita premissas** (áreas, produtividades, preços, custos, prazos, investimentos, dívidas novas, dividendos). Os **demonstrativos** (DRE, Balanço, Fluxo de caixa, Usos e fontes, Indicadores) **nunca são digitados**: o sistema calcula tudo a partir das premissas. Por isso, se um número do demonstrativo está estranho, a causa quase sempre está numa premissa.

Todos os valores em dinheiro aparecem em **reais, com o símbolo R$**, ano a ano, de janeiro a dezembro. O orçamento é **anual**: você escolhe o ano inicial e o ano final (no máximo 30 anos).

---

## 1. Visão geral: como o sistema funciona

### 1.1 O caminho dos números

```
Cadastros (Produtos, Rubricas de custo...)
        ↓
Premissas de produção (áreas, produtividade, preços, custos, premissas de produtos)
        ↓
Resultado por produto  →  linhas de receita e custo da DRE
        +
Premissas de transportadora · Premissas da DRE · Arrendamentos · Investimentos (depreciação)
Dívidas (juros) · Novas captações
        ↓
                    DRE  (resultado do ano)
                     ↓
Premissas de balanço (prazos) · Investimentos · Dividendos · Dívidas
                     ↓
                  BALANÇO  (posição em 31/12)  ←→  FLUXO DE CAIXA (calcula o caixa e a dívida de giro)
                     ↓
        Usos e fontes · Indicadores
```

### 1.2 Menu lateral

| Item do menu | Para que serve |
|---|---|
| **Novo orçamento** | Cria um orçamento novo (em branco ou copiado de outro). |
| **Início** | Visão geral: andamento do preenchimento, próximos passos, anotações pendentes. |
| **Orçamentos** | Lista de todos os orçamentos: abrir, criar Reprojetado, aprovar e travar, excluir, comparar, imprimir. |
| **Premissas** | Grupo com as telas onde você digita: Produção, Investimento, DRE, Transportadora, Balanço, Dividendos e Dívidas. |
| **Cadastros** | Produtos, Rubricas de custo, Tipos de premissas da DRE, Tipos de investimento. |
| **Demonstrativos** (grupo) | DRE, Balanço, Fluxo de caixa, Usos e fontes e Indicadores: tudo calculado, somente leitura. |
| **Realizado** | Uma tela com cinco abas: **Importações**, **Quantidades**, **DRE**, **Balanço** e **Orçado × realizado**. |
| **Anotações** | Todas as anotações feitas nos números, para conferir e resolver. |

### 1.3 Como saber que um orçamento está pronto

A tela **Início** mostra o andamento (%) e os seis grupos de premissas: **Produção, Investimentos, DRE, Balanço, Dividendos e Dívidas**. Cada grupo aparece como *Concluído*, *N pendências* ou *Não iniciado*. Veja o capítulo 2.

---

## 2. Tela Início

É a primeira tela do sistema. Ela fala sempre do **orçamento que está aberto**.

| Bloco | O que mostra | De onde vem |
|---|---|---|
| **Faixa verde "Orçamento vigente" (é o cabeçalho da tela)** | Nome do orçamento com a situação ao lado ("Em elaboração" ou "Aprovado · travado"), período (ex.: 2027 a 2031) e quando foi atualizado pela última vez. Botões **Trocar orçamento** (vai para a lista) e **Continuar preenchimento** (vai para o primeiro passo pendente). | Cadastro do orçamento e o registro de alterações. |
| **Andamento do orçamento** | Porcentagem, barra e seis cartões de grupos de premissas. | O sistema confere se já existem valores lançados em cada grupo (regras abaixo). |
| **O que precisa da sua atenção** | Até três pendências, a mais urgente primeiro. Clicar leva para a tela. | Pendências do andamento + anotações pendentes. |
| **Acesso rápido** | Atalhos para DRE, Balanço, Fluxo de caixa e Indicadores. | — |
| **Anotações** | Total de anotações, quantas estão pendentes, resolvidas, com valor alterado e em vermelho. | Tela Anotações (ver capítulo 15). |
| **Última alteração** | A última coisa mexida, há quanto tempo, e botão **Abrir**. | Registro de alterações do orçamento. |

### Como o andamento é calculado

| Grupo | Conta como feito quando… |
|---|---|
| **Produção** (4 itens) | Há área lançada; há produtividade; há preço de venda; há custos variáveis. |
| **Investimentos** | Há algum valor lançado em Premissas de investimento. |
| **DRE** | Há algum valor em Premissas da DRE (média do realizado ou premissa cadastrada). |
| **Balanço** (3 itens) | Há prazo de recebimento de clientes; prazo de pagamento a fornecedores; e caixa mínimo. |
| **Dividendos** | Há alguma regra de distribuição de lucros. |
| **Dívidas** (2 itens) | A base de dívidas está vinculada ao orçamento; e há novas captações ou premissas de financiamento. |

A porcentagem é o número de itens feitos ÷ total de itens (são 12 itens). **Exemplo:** se 8 dos 12 estão feitos, o andamento é 67%.

### Anotações pendentes
Uma anotação é **pendente** quando ainda não recebeu o "check" de conferência. Ela aparece como "com valor alterado" quando o número anotado mudou depois que você fez a anotação (sinal de que vale revisar).

---

## 3. Tela Orçamentos (lista de versões)

Aqui ficam todos os orçamentos. Cada linha mostra:

| Coluna | Significado |
|---|---|
| **Orçamento** | Nome, mais a etiqueta **Em elaboração** (pode editar) ou **Aprovado · travado** (não pode mais editar). Se foi copiado de outro, aparece "a partir de …". |
| **Período** | Ano inicial a ano final. |
| **Criado em** | Data de criação (e de aprovação, se aprovado). |
| **Ações** | Botões de ícone (ver abaixo). |

### Botões de ação de cada linha

| Ícone (desenho do botão) | Ação | O que faz |
|---|---|---|
| Olho | **Abrir** | Passa a trabalhar nesse orçamento (todas as telas passam a mostrar os números dele). |
| Lápis | **Editar nome e período** | Muda o nome e os anos inicial e final do orçamento. Só aparece em orçamentos em elaboração. Os dados de anos que saem do período ficam guardados e voltam se o ano for incluído de novo. |
| Duas folhas | **Criar Reprojetado** | Cria uma cópia para revisar durante o ano. O original **não é alterado**. |
| Impressora | **Imprimir orçamento** | Gera um PDF com as premissas e/ou os demonstrativos, ano a ano (ver abaixo). |
| Check (visto) | **Aprovar e travar** | Depois de aprovado, o orçamento não pode mais ser editado. Só aparece em orçamentos em elaboração. |
| Lixeira | **Excluir orçamento** | Apaga o orçamento e todos os dados dele (pede confirmação; não dá para desfazer). Só aparece em orçamentos em elaboração: os aprovados e travados não podem ser excluídos. |

### Tipos de orçamento
- **Orçado:** o orçamento criado do zero (normalmente o aprovado do ano).
- **Reprojetado:** cópia de um orçamento para revisar durante o ano.
- **Cenário:** cópia de outro orçamento para testar uma hipótese ("e se o preço do alho cair?").

### Criando um orçamento novo (botão "Novo orçamento")
| Campo | Significado |
|---|---|
| **Nome do orçamento** | Ex.: "Orçamento 2027". |
| **Copiar os dados de (opcional)** | Escolhendo um orçamento existente, o novo nasce como **cenário**, com todos os dados e o mesmo período. Deixando em branco, nasce vazio. |
| **Ano inicial / Ano final** | Período do orçamento (máximo 30 anos). Os atalhos "+1, +3, +5, +10 anos" estendem o fim. Com muitos anos (ex.: 20), as tabelas não espremem os campos: cada ano mantém a largura normal, a tabela rola para o lado e a coluna com o nome fica fixa à esquerda. |

### Comparar orçamentos
1. Clique em **Comparar orçamentos**: aparecem caixas de seleção ao lado de cada orçamento.
2. Marque os orçamentos que quer comparar. O botão vira **Imprimir** (precisa de pelo menos dois).
3. Na janela que abre, escolha:
   - **Orçamento base da comparação:** a referência. Todas as diferenças são medidas em relação a ele.
   - **Ano da comparação:** só aparecem anos que existem em todos os orçamentos marcados.
   - **O que comparar:** as premissas e os demonstrativos desejados.
   - **Calcular o impacto de cada grupo de premissas:** o sistema troca, **um de cada vez**, cada grupo de premissas do orçamento base pelo do outro orçamento, recalcula tudo e mostra quanto cada grupo mudou o lucro, o caixa etc. (Mais lento.)
4. O PDF mostra, lado a lado, **só o que varia** entre os orçamentos. A exceção é o **Fluxo de caixa indireto**, que sai inteiro, com todas as linhas e totais.

### Imprimir um orçamento
O botão da impressora (em cada linha) abre uma janela só com **O que imprimir**: premissas (Áreas, Produtividade, Preços, Custos variáveis, Premissas de produtos, Rebanho, Investimento, DRE, Transportadora, Balanço, Dividendos, Dívidas) e demonstrativos (DRE, Balanço, **Fluxo de caixa indireto**, Indicadores). O PDF traz **todos os anos** do orçamento, em colunas.

---

## 4. Cadastros

São listas usadas por todos os orçamentos. Cadastre uma vez e use sempre.

### 4.1 Produtos
Cada produto que a empresa vende (cenoura, soja, leite, gado de corte...).

| Campo | Significado |
|---|---|
| **Produto** | Nome. |
| **Grupo** | Hortifruti, Grãos, Fruticultura, Pecuária etc. Serve para organizar e, na Pecuária, para a DRE. |
| **Receita** | **Operacional:** ganha linhas próprias de receita e de custo do produto vendido na DRE. **Não operacional:** só o resultado do produto entra, na linha "Resultados de outras atividades operacionais". |
| **Controle** (estoque) | **Produção:** a quantidade estocada vai para "Estoque de produtos acabados". **Rebanho (gado de corte):** o produto ganha a movimentação de cabeças (saldo inicial, compras, nascimentos, mortes, vendas). |
| **Medida em** | **kg**, **litro** ou **unidade**. É a unidade em que a produção é medida. |
| **Embalagem padrão** e **Quantidade por embalagem** | Ex.: "Caixa de 29 kg". Deixe em branco se não houver embalagem. |
| **Ativa** | Desmarque para esconder o produto sem perder o histórico. |

### 4.2 Rubricas de custo (grupos de custo)
Cada rubrica vira uma linha na tela de Custos variáveis (ex.: Mão de obra direta, Insumos, Mecanização, Irrigação, Serviços de terceiros, Custo de compra).

| Campo | Significado |
|---|---|
| **Nome** | Nome da rubrica. |
| **Classificação** | **Direto** ou **Indireto**. **Só os custos diretos entram no custo do produto vendido** (CPV). Os indiretos ficam de fora do Resultado por produto. |

### 4.3 Tipos de premissas da DRE
Cadastro das premissas que você quer usar nos demonstrativos (ver capítulo 8). Cada tipo tem:

| Campo | Significado |
|---|---|
| **Nome** | Ex.: "Despesas administrativas", "IRRF". |
| **Demonstrativo e conta** | Em qual linha da DRE (ou do Balanço) o valor vai cair. É obrigatório escolher uma conta. |
| **Sinal** | **Soma** (+1) ou **subtrai** (−1) na conta. |
| **Tipo** | **Valor** (você digita em R$) ou **Percentual** (você digita um %, e o sistema aplica sobre um campo base da DRE). |
| **Campo base** (só no percentual) | A linha da DRE sobre a qual o % incide (pode ser total ou subtotal). Ex.: IR = % sobre o EBT. O sistema recusa bases que dependam da própria conta. |
| **Se a base for negativa** | **Calcular** (o % incide e inverte o sinal, como um crédito) ou **Zerar** (não gera efeito). |

### 4.4 Tipos de investimento
Veja o capítulo 7.

---

## 5. Premissas de produção

É a tela mais importante: aqui nasce a **receita** e o **custo** do produto. Ela tem abas.

### 5.1 Áreas por produto
Você escolhe quais produtos serão cultivados no orçamento e lança os **hectares por ano**.

| Campo | Significado |
|---|---|
| **Adicionar produto** | Escolhe um produto do cadastro para este orçamento. |
| **Área por ano (ha)** | Hectares físicos plantados daquele produto em cada ano. |
| **Replicar →** | Copia o valor do ano escolhido para os anos seguintes. |
| **Participação da área** (gráfico) | % de cada produto sobre a área total do primeiro ano. |

> O sistema **não** confere se a área total cabe na área disponível da fazenda.

### 5.2 Produtividade
Quanto cada hectare produz.

| Campo | Significado |
|---|---|
| **Produtividade por produto** | Quantidade produzida por hectare e por ano, na unidade do produto (kg/ha ou litro/ha). |
| **Pecuária: leite** | **Animais em lactação** (uni) e **kg (litros) por animal por dia**. O sistema calcula: *produção diária = animais × litros por animal por dia*; *produção anual = produção diária × 365*. |
| **Produtos sem área** (gado de corte, genética) | A "produtividade" lançada é a **própria quantidade produzida** do ano. |

### 5.3 Preços
Preço de venda por produto e ano, **em R$ por kg** (ou por litro, no leite). É diferente do "valor padrão" por embalagem usado nos arrendamentos.

### 5.4 Custos variáveis
Para cada produto, você adiciona as **rubricas de custo** (do cadastro) e lança o valor por ano.

| Situação | Como lançar |
|---|---|
| Produto com área | **R$ por hectare** em cada rubrica. |
| Produto sem área (leite, genética) | **R$ por kg (litro ou unidade) produzido**. |
| Gado de corte | **Valor total do ano** (inclusive a compra dos animais). |

O gráfico "Composição do custo" mostra o peso de cada rubrica no primeiro ano. **Só rubricas classificadas como diretas entram no CPV.**

### 5.5 Premissas de produtos
Quatro tipos de premissa que afinam a quantidade e a receita do produto:

| Premissa | Unidade | O que faz |
|---|---|---|
| **% descarte** | % | Parte da produção que se perde e não é vendida. **É sempre o descarte do ano da venda**, inclusive para o estoque vendido no ano seguinte. |
| **% dedução de receita** | % | Impostos e abatimentos sobre a receita bruta (ex.: Funrural). Vai para as "Deduções da atividade agropecuária" da DRE. |
| **Quantidade estocada** | kg / litro | Quanto da produção **não é vendido neste ano** e fica em estoque para o ano seguinte. |
| **Sementes salvas** | kg / litro | Parte da produção guardada como semente para o próximo plantio (sai da quantidade vendável). |
| **Estoque de passagem do ano anterior** | kg / litro | Quantidade que **já estava estocada em 31/12 do ano anterior ao orçamento** (ex.: em 31/12/2026, para um orçamento que começa em 2027). Aparece numa coluna extra "ano anterior" e **não se replica**. Ela é vendida no primeiro ano do orçamento, ao preço desse ano. |
| **Custo médio do estoque do ano anterior** | R$ por kg (ou litro) | Quanto custou produzir cada kg desse estoque. Vira o **custo do produto vendido** no primeiro ano. Sem esse valor, o custo desse estoque fica zero. |

### 5.6 Movimentação do rebanho (gado de corte)
Só para produtos com "Controle = Rebanho". Em **cabeças**, por ano: **saldo inicial** (digitado só no primeiro ano, com o valor em R$), **compras**, **nascimentos**, **mortes**, **vendas**. O saldo final de um ano vira o saldo inicial do seguinte. O preço de venda vem da aba Preços e os custos vêm dos Custos variáveis.

### 5.7 Resultados de produtos (somente leitura)
É aqui que você enxerga o que o sistema calculou, produto a produto. Há três blocos:

**Resultado da safra** (a safra do ano, sem olhar estoque)
| Linha | Como é calculada |
|---|---|
| Área plantada | Das Áreas por produto. |
| Produtividade | Da tela Produtividade. |
| Volume produzido | Área × produtividade. |
| (–) Perda por descarte | Volume × % descarte. |
| (–) Sementes salvas | Da premissa de produtos. |
| Quantidade disponível para venda | Volume produzido − descarte − sementes. |
| Preço | Da tela Preços. |
| Receita bruta de produção | Quantidade disponível × preço. |
| (–) Deduções | Receita bruta × % dedução. |
| Receita líquida | Receita bruta − deduções. |
| Custos variáveis diretos | Área × custo por hectare, somando as rubricas diretas. |
| **Margem de contribuição** | Receita líquida − custos diretos. |

**Resultado anual** (o que entra na DRE)
O resultado anual acrescenta a **lógica do estoque de passagem**: parte da produção do ano pode ficar guardada e ser vendida no ano seguinte.
- O estoque guardado é calculado **sem descarte** (o descarte é o do ano em que se vende).
- O estoque do ano anterior é vendido **ao preço do ano da venda** e custa o **custo médio do ano em que foi produzido**.
- **Receita bruta anual** = receita da produção vendida no ano + receita do estoque do ano anterior.
- **Custo do produto vendido (CPV)** = custo da produção vendida no ano + custo do estoque do ano anterior.
- **Margem bruta** = receita líquida anual − CPV.

**Estoque**: valor do estoque a custo no fim do ano (quantidade estocada × custo médio). Vai para a conta "Estoque de produtos acabados" do Balanço.

No bloco Estoque, a linha **"Estoque inicial (saldo de 31/12 do ano anterior, vendido no ano)"** mostra a quantidade que entra do ano anterior. No primeiro ano do orçamento, ela vem da premissa "Estoque de passagem do ano anterior" (Premissas de produtos); nos anos seguintes, é o estoque guardado no ano anterior. A receita e o custo desse estoque aparecem no resultado anual como "Receita/Custo de produção do ano anterior (estoque)" e entram na DRE.

#### Exemplo completo: Cenoura em 2027 (valores ilustrativos)
| Passo | Conta | Resultado |
|---|---|---|
| Área | 100 ha | — |
| Produtividade | 70.000 kg/ha | Volume produzido = 100 × 70.000 = **7.000.000 kg** |
| Descarte | 5% | Perda = 350.000 kg → disponível para venda = **6.650.000 kg** |
| Preço | R$ 2,00/kg | Receita bruta = 6.650.000 × 2,00 = **R$ 13.300 mil** |
| Dedução | 2% | −**R$ 266 mil** → receita líquida = **R$ 13.034 mil** |
| Custo variável direto | R$ 50.000/ha | 100 ha × 50.000 = **R$ 5.000 mil** |
| Margem de contribuição | — | 13.034 − 5.000 = **R$ 8.034 mil (61,6%)** |

**Com estoque do ano anterior:** se em 31/12/2026 havia 1.000.000 kg de cenoura estocados, a R$ 1,50/kg de custo, em 2027 o sistema soma à receita 1.000.000 × (1 − 5% de descarte) × R$ 2,00 = **R$ 1.900 mil**, e ao custo do produto vendido **R$ 1.500 mil**.

Sem estoque de passagem, esses valores vão direto para a DRE: receita bruta de cenoura R$ 13.300 mil, deduções −266, custo do produto vendido −5.000.

---

## 6. Premissas de transportadora (Sekita Transportes)

A transportadora **não tem demonstrativo separado**: o realizado da empresa já é unificado. Por isso esta tela só gera a **receita, as deduções e o custo direto** da atividade de transportes, que entram nas linhas de transportes da DRE.

| Campo | Significado |
|---|---|
| **Quantidade de caminhões** | Caminhões em operação. |
| **Km rodado por caminhão** | Quilômetros por caminhão no ano. |
| **Preço por km rodado** (R$/km) | Quanto se cobra por km. |
| **Deduções da receita** (%) | Impostos sobre o frete, em % da receita. |
| **Custos variáveis** (R$/km) | Combustível, mão de obra (MDO), manutenção/conservação/reparos, outros custos. |
| **Custos fixos** (R$/km) | Salário fixo + encargos, IPVA, rastreamento de veículos, seguro de veículos. |
| **Despesas** (R$/km) | Despesa / custo indireto e M.O.I. Entram no mesmo custo direto (CPV). |

**Cálculo:**
- Km rodado total = caminhões × km por caminhão
- Receita bruta = km total × preço por km
- Deduções = receita × % de deduções
- Custo direto = km total × (soma das rubricas variáveis, fixas e despesas em R$/km)

**Vai para a DRE em:** *Receitas da Atividade de Transportes*, *(−) Deduções da Atividade de Transportes* e *Custo do Produto Vendido · Transportes*.

**Exemplo:** 13 caminhões × 120.000 km = 1.560.000 km. A R$ 2,70/km: receita **R$ 4.212 mil**; deduções 10% = **−421 mil**; custo de R$ 1,02/km (combustível 0,74 + MDO 0,18 + seguro 0,10) = **−1.591 mil**; resultado bruto da transportadora = **R$ 2.200 mil (58% da receita líquida)**.

**O que não está nesta tela, de propósito:** a **depreciação** (já vem pela média do realizado), a **compra e venda de caminhões** (lance em Premissas de investimento) e as **dívidas** (vêm da base de dívidas e das captações).

---

## 7. Premissas de investimento

Orçamento anual de investimentos e desinvestimentos, em **R$**, e a **depreciação**.

### 7.1 Tipos de investimento (cadastro)
| Campo | Significado |
|---|---|
| **Nome** | Ex.: Máquinas e implementos, Obras em andamento, Venda de veículos. |
| **Natureza** | **Investimento** (gasta) ou **Desinvestimento** (venda de bens). |
| **Conta padrão do balanço** | Em qual conta do ativo o valor entra (ex.: Máquinas, equipamentos e veículos). |
| **Classificação** | Agrupador próprio (dá para criar novas). |
| **Carrega o saldo do ano anterior** (só investimento) | Ex.: obra que atravessa anos. |

### 7.2 Valores por ano
| Campo | Significado |
|---|---|
| **Saldo do ano anterior** | Digitado só no primeiro ano; depois vem do "saldo a carregar" do ano anterior. |
| **Novo orçamento do ano** | O que você pretende investir. |
| **Total a investir** | Saldo do ano anterior + novo orçamento. |
| **Saldo a carregar** | Quanto do total **não será gasto** neste ano e passa para o próximo. |
| **Investido no ano** | Total a investir − saldo a carregar. |
| **Valor financiado** | Parte do investido que será financiada. Vira uma **captação** do tipo Investimento (com a taxa, prazo e carência do financiamento). Não pode passar do investido. |
| **Desinvestimento** | Valor vendido no ano (não traz saldo anterior). |

**No Balanço**, a conta padrão do tipo passa a ser: **saldo realizado (último ano fechado) + investido − desinvestido**, ano a ano.

### 7.3 Depreciação (calculada, mas editável)
| Linha | Como é calculada |
|---|---|
| **Bens existentes** | Taxa média × base depreciável. A base é o imobilizado bruto do último balanço realizado, menos os desinvestimentos acumulados. A taxa média é a depreciação do último ano da DRE realizada ÷ imobilizado bruto (pode ser alterada). |
| **Novos investimentos** | Cada ano investido forma uma "safra" que deprecia em linha reta: investido × (1 − valor residual) ÷ vida útil, ano cheio no primeiro ano. Tipo com vida útil 0 não deprecia. |
| **Total** | Vai para a **DRE** (linha Depreciação) e para a **depreciação acumulada do Balanço**. |

Qualquer valor calculado pode ser trocado à mão; o botão **voltar ao calculado** desfaz.

**Exemplo:** imobilizado bruto do último realizado R$ 100.000 mil, taxa média 8% → depreciação dos existentes **8.000**. Investimento novo de 2027 = 10.000, vida útil 10 anos, sem residual → **1.000 por ano**. Depreciação total de 2027 = 9.000 (vai para a DRE).

---

## 8. Premissas da DRE

Esta tela trata das contas da DRE que **não têm origem em outro módulo** (as de baixo da DRE, depois do resultado bruto). Ela tem três partes.

### 8.1 Premissas padronizadas (média do realizado)
Cada conta é calculada de um jeito, e o valor padrão de cada ano é **a média do realizado** dos anos que você escolher:

| Conta da DRE | Base | Como calcula |
|---|---|---|
| Despesas de arrendamentos | Custo do produto vendido | % × CPV do ano |
| Rotação de culturas | Custo do produto vendido | % × CPV |
| Despesas administrativas, Doações e patrocínios, Impostos taxas e outros | Receita líquida | % × receita líquida |
| Despesas de comercialização | Receita bruta | % × receita bruta |
| Manutenção de fazendas, Perda de estoques | Custo do produto vendido | % × CPV |
| CSLL e IRPJ | Receita líquida | % × receita líquida |
| Receitas de parceria (repolho, alho da serra), outras receitas de arrendamento, receitas financeiras | — | Valor em R$ |
| Resultado de revenda de produtos, Resultado de venda de produtos não operacionais, Resultados de outras atividades operacionais | — | Valor em R$, com sinal (pode ser negativo). Em *Resultados de outras atividades operacionais*, o valor digitado soma ao resultado dos produtos de receita não operacional, quando houver. |

- O **% do realizado** é: valor da conta ÷ base do mesmo ano. A média é a média simples dos anos escolhidos.
- O botão **Gravar a média** grava o resultado nos anos do orçamento.
- Enquanto não houver valor gravado, a conta fica **zerada**.
- Despesas saem **negativas** na DRE, mas você digita o % ou o valor **positivo**.

**Exemplo:** nos anos fechados, as despesas administrativas foram 2,0%, 2,4% e 2,2% da receita líquida. Média = **2,2%**. Em 2027, com receita líquida de R$ 913.000 mil, a despesa administrativa projetada é 2,2% × 913.000 = **−R$ 20.086 mil**.

### 8.2 Premissas cadastradas
Você pode **adicionar à versão** uma premissa cadastrada em "Tipos de premissas da DRE" e digitar o valor por ano (valor em R$ ou percentual sobre o campo base). Ela cai na conta vinculada, multiplicada pelo sinal (soma ou subtrai). **Só premissas adicionadas ao orçamento têm efeito.**

### 8.3 Resultado da DRE
Aba somente leitura que mostra a DRE calculada com o realizado ao lado para comparação.

---

## 9. Premissas de balanço (capital de giro)

Aqui você digita **prazos médios** e **saldos** que o sistema usa para montar o balanço. Cada campo é por ano, com o botão **Replicar →**.

### 9.1 Prazo médio realizado (apoio)
Mostra os prazos que o balanço e a DRE **já fechados** (tela Realizado) indicam. Você escolhe os anos de referência e clica em **Gravar a média** para gravar nos prazos do orçamento.

### 9.2 Premissas do balanço
| Campo | Unidade | Como o sistema usa |
|---|---|---|
| **Dias no ano** | dias | Se vazio, usa os dias reais (365 ou 366). |
| **Contas a receber – Clientes** | dias de receita | Receita líquida × dias ÷ dias no ano. |
| **Rotação de cultura a apropriar** | dias de CPV | CPV × dias ÷ dias no ano. |
| **Preparo de solo e despesas a apropriar** | dias de CPV | CPV × dias ÷ dias no ano. |
| **Estoque de insumos** | dias de CPV | CPV × dias ÷ dias no ano. |
| **Lavoura em formação** | dias de CPV | CPV × dias ÷ dias no ano. |
| **Contas a pagar – Fornecedores** | dias de CPV | CPV × dias ÷ dias no ano. |
| **Outras obrigações, Obrigações trabalhistas** | dias de CPV | CPV × dias ÷ dias no ano. |
| **Impostos a pagar** | dias de deduções | Deduções da receita × dias ÷ dias no ano. |
| **Outros créditos, Realizável LP, Participações, Intangível, Consórcios (curto e longo), Outras obrigações LP** | R$ | Saldo que você digita (ou a média dos saldos dos anos fechados). |
| **Caixa mínimo** | % do custo de produção | % × CPV. É o caixa que o sistema tenta manter (ver Fluxo de caixa). |

O **estoque de produtos acabados** não tem prazo: vem do Resultado por produto (quantidade estocada × custo médio).

> **CPV** = custo do produto vendido, da DRE. **Receita líquida** também vem da DRE.

### 9.3 Resultado do balanço
Aba somente leitura que mostra o balanço calculado.

**Exemplo:** receita líquida R$ 100.000 mil, 30 dias de recebimento, ano de 365 dias → contas a receber = 100.000 × 30 ÷ 365 = **R$ 8.219 mil**. CPV de R$ 40.000 mil, 60 dias de insumos → estoque de insumos = 40.000 × 60 ÷ 365 = **R$ 6.575 mil**. Fornecedores com 30 dias → 40.000 × 30 ÷ 365 = **R$ 3.288 mil**.

**Necessidade de capital de giro (NCG)** = ativo circulante operacional − passivo circulante operacional. **Investimento em capital de giro** = NCG do ano − NCG do ano anterior (é o que consome caixa).

---

## 10. Premissas de dividendos (patrimônio líquido)

| Campo | Significado |
|---|---|
| **% do lucro líquido do ano** | Parte do lucro que a empresa distribui aos sócios. |
| **Valor base (mínimo), R$** | Quanto a empresa paga **mesmo sem lucro**. |
| **Capital integralizado** e **Ajustes de avaliação patrimonial** | Saldos que trazem o valor do ano anterior; qualquer ano pode ser alterado à mão (vale a partir daquele ano). Botão **voltar ao calculado**. |

**Regras importantes**
- O lucro de um ano é distribuído **no ano seguinte**. A regra é definida pelo **ano do lucro** (a distribuição do lucro de 2027 é paga em 2028).
- Com lucro e % informado: distribui o **% do lucro** (mesmo que dê menos que o valor base). Sem lucro, ou sem % informado: paga o **valor base**.
- Os dividendos saem de **Lucros e prejuízos acumulados**.
- O ano anterior ao horizonte também tem regra, porque o lucro dele é distribuído no primeiro ano projetado.

**Exemplo:** lucro de 2027 = R$ 10.000 mil, % = 25 → distribuição de **R$ 2.500 mil**, paga em 2028, que reduz os lucros acumulados de 2028.

**Fórmula do saldo de lucros acumulados:** saldo do ano = saldo do ano anterior + resultado do exercício do ano anterior − distribuição paga no ano.

---

## 11. Premissas de dívidas

Tela com abas.

### 11.1 Dívidas vigentes
Mostra a base de dívidas importada do sistema de Endividamento (arquivo "Endividamento alterado.xlsx"). Cada importação é uma "foto". O orçamento aponta para uma delas, para o orçamento aprovado não mudar quando houver uma base mais nova.

| Campo / bloco | Significado |
|---|---|
| **Empresas** | Não há filtro por empresa: a tela mostra sempre a **soma de todas as empresas** (MESO, AFAL, ST, TAL), a mesma que o Balanço e a DRE usam. O quadro "Endividamento por empresa" continua mostrando o saldo de cada uma. |
| **Principal, juros, outras despesas** | Dos títulos **em aberto**. |
| **Detalhamento por prazo e tipo** | Tabela com o saldo em 31/12 de cada ano (em R$): **Curto prazo** (aberto por Custeio, Capital de giro e Investimento, com a seta), **Longo prazo** e **Total da dívida**. Logo abaixo, **Juros do ano** (custo da dívida), que também abre por tipo. |
| **Ordem da tela** | Composição da dívida (curto e longo prazo), projeção da dívida e juros por ano (cobre todos os anos do orçamento), detalhamento por prazo e tipo e, por último, o endividamento por empresa. |
| **Por ano** | Vencimentos por ano, separados em capital de giro/custeio e investimento. |
| **Por banco, por tipo** | Quebra do principal em aberto. |
| **Resumo mensal e contratos** | Vencimentos mês a mês e a lista de contratos. |

**De onde vai para os demonstrativos:**
- **Balanço:** o principal em aberto em 31/12 é dividido em **curto prazo** (vence até 31/12 do ano seguinte) e **longo prazo**, e em Custeio + Capital de giro × Investimento.
- **DRE:** os **juros dos contratos que vencem no ano** entram em "Despesas financeiras".

### 11.2 Novas captações para investimentos
Mostra o financiamento dos investimentos lançados em Premissas de investimento, **uma linha por tipo de investimento** (ex.: Máquinas e Implementos, Obras em Andamento) com o valor financiado em cada ano, e as premissas de **taxa de juros (% a.a.)**, **prazo (parcelas anuais)** e **carência (anos)** por ano.

### 11.3 Novas captações (custeio e capital de giro)
| Campo | Significado |
|---|---|
| **Nome** | Identificação da captação. |
| **Tipo** | **Custeio** ou **Capital de giro**. |
| **Ano** | Ano em que o dinheiro entra (no meio do ano). |
| **Valor (R$)** | Quanto será captado. |
| **Taxa (% a.a.)** | Juros por ano. |
| **Prazo** | Número de parcelas anuais de principal. |
| **Carência** | Anos sem amortizar. |

**Cronograma (o mesmo para toda captação):**
- **Amortização** = valor ÷ prazo, em parcelas anuais iguais (SAC), começando em *ano + 1 + carência*.
- **Saldo do fim do ano** = saldo anterior + captado − amortização.
- **Juros** = taxa × saldo médio do ano ((saldo do início + saldo do fim) ÷ 2). No ano da captação o saldo inicial é zero, o que dá **meio ano de juros**.
- **Curto prazo** = a amortização do ano seguinte; **longo prazo** = o resto do saldo.

Amortização e juros de cada ano podem ser trocados à mão (botão **voltar ao calculado**).

**Exemplo:** captação de custeio de R$ 10.000 mil em 2027, 12% a.a., 4 parcelas, sem carência.
- 2027: juros = 12% × (0 + 10.000) ÷ 2 = **600**; saldo final **10.000** (curto prazo 2.500; longo 7.500).
- 2028: amortização **2.500**; saldo final 7.500; juros = 12% × (10.000 + 7.500) ÷ 2 = **1.050**.

Os juros vão para a **despesa financeira da DRE**; o saldo vai para as contas de dívida do **Balanço**.

### 11.4 Necessidade de capital de giro (dívida de giro automática)
Aqui você define a **taxa de juros** da dívida de giro automática, por ano. Se ficar em branco, o sistema usa a média das captações de custeio ou capital de giro cadastradas naquele ano. A explicação de como a dívida nasce está no capítulo 14 (Fluxo de caixa).

Abaixo da taxa, o quadro **Necessidade de captação de capital de giro** mostra, no topo, uma frase com o resultado (se há ou não necessidade de captar, quanto e em que ano) e, em seguida, a conta passo a passo: caixa no início do ano, variação do caixa antes da dívida de giro, **caixa disponível antes da captação**, menos o **caixa mínimo exigido**, **folga ou falta de caixa** e, em destaque, a **necessidade de captação no ano**. Depois vêm a amortização da dívida de giro, o caixa no fim do ano, o saldo da dívida de giro e os juros. Valores em R$.

### 11.5 Resumo geral
Quadro com tudo junto: dívida existente, novas captações e financiamentos, por ano.

---

## 12. Outras entradas

### 12.1 Arrendamentos
O **custo dos arrendamentos** (fazendas arrendadas: hectares × valor por hectare, ou sacas × valor da saca) alimenta a linha *Despesas Arrendamentos* da DRE. Quando existe a premissa de média do realizado para essa conta, **a média sobre o CPV substitui** o valor da tela de arrendamentos. (A tela de Arrendamentos está oculta no menu por enquanto.)

---

## 13. Realizado

A tela **Realizado** tem cinco abas: **Importações** (subir arquivos e informar o período), **Quantidades** (quantidade vendida por produto e por ano), **DRE** e **Balanço** (os valores importados) e **Orçado × realizado** (escolher um orçamento e uma importação e gerar o PDF da comparação).

### 13.1 Importações
Aqui você **sobe os balanços e DREs de anos já fechados**. Eles valem para todos os orçamentos e servem de base para:
- os **prazos médios** do capital de giro (capítulo 9);
- o **saldo inicial do balanço** (último balanço realizado antes do orçamento);
- as **médias da DRE** (capítulo 8);
- a **taxa média de depreciação** (capítulo 7);
- os **indicadores realizados** (capítulo 14).

**Três formatos de arquivo aceitos:**
1. Planilha "Fechamento Financeiro" (abas Balanco9anos e Comparativo de AV).
2. Banco do Fechamento Contábil (abas "Fechamentos" e "Fechamento Linhas"): o Balanço é o do fechamento que termina em 31/12; a DRE é a soma dos fechamentos do ano (ex.: 4 trimestres).
3. Planilha modelo (aba "Realizado"): colunas Ano, Demonstrativo (BP ou DRE), Código, Conta, Valor em R$.

Subir um ano de novo **substitui** o que havia daquele ano e demonstrativo.

**Nova importação.** O botão **Nova importação**, no topo da aba, abre uma janela única. Nela você escolhe o arquivo e, logo abaixo, preenche:
| Campo | Significado |
|---|---|
| **De / Até** (mês) | O **período** a que o realizado do ano em andamento se refere (ex.: janeiro a junho, ou abril a junho). O "até" já vem preenchido pelo nome do arquivo (ex.: "2t2026" = 2º trimestre = junho). **A DRE do arquivo deve ser exatamente desse período.** |
| **Quantidade vendida no período** | Quanto cada produto vendeu (kg, litro ou unidade), numa lista logo abaixo. É **obrigatória no ano em andamento**: todos os produtos precisam ser preenchidos, com **0** para o que não vendeu; sem isso a importação não é feita. Em importações só de anos fechados, pode ficar em branco e ser preenchida depois na aba Quantidades. |

Anos já fechados entram inteiros e ignoram o período.

**Ano em andamento.** Quando o arquivo traz o ano corrente com só parte dos meses, o sistema o guarda **à parte**, como "em andamento". Esse ano:
- **aparece** nas abas DRE e Balanço (coluna destacada com o período), nos **indicadores** (tabela e gráficos) e na comparação com o orçado;
- **não entra** nas médias da DRE nem nos prazos médios do balanço;
- **é o saldo inicial do orçamento** quando é o balanço mais recente anterior ao primeiro ano do orçamento (ex.: o orçamento 2027 parte do balanço de 30/06/2026). A **depreciação** dos bens existentes usa a DRE do período **anualizada** (× 12 ÷ meses do período). Quando houver o balanço de 31/12 fechado, ele passa a ser o saldo inicial;
- pode ser excluído como qualquer outro ano.

**Quantidade vendida no período.** Informada na janela de importação e mantida na aba **Quantidades**, que mostra uma coluna por ano importado (o ano em andamento aparece com o período, ex.: "2026 · janeiro a junho") e uma linha por produto; dá para editar qualquer ano. Com isso o sistema calcula o **preço médio** e o **custo por unidade** realizados (receita e custo do produto vêm da DRE realizada). Produtos com quantidade 0 ficam de fora dessa análise.

### 13.2 Orçado × realizado
A aba tem **dois lados**: à esquerda, os **orçamentos** (cada um com seu período e se está aprovado ou em elaboração); à direita, as **importações** do realizado (cada ano fechado e o ano em andamento, com o período, ex.: "2026 · janeiro a junho"). Você escolhe **um de cada lado** e clica em **Comparar e gerar PDF**.

**Conferência dos períodos.** Antes de gerar, o sistema confere se o orçamento **cobre o ano** da importação. Se cobrir, mostra "Períodos compatíveis". Se não cobrir, avisa (ex.: "o orçamento cobre 2027 a 2031 e o realizado é de 2026") e o botão fica bloqueado: escolha outro orçamento ou outra importação.

O **PDF** sai no mesmo estilo da comparação de orçamentos e traz, nesta ordem:

**O que foi comparado.** O orçamento e a importação escolhidos, com o período.

**Resumo.** Texto automático ("O que aconteceu") e a **ponte do lucro**: parte do lucro orçado do período e chega ao lucro realizado, mostrando quanto cada coisa contribuiu (quantidade vendida, preço médio, custo por unidade, deduções, despesas, depreciação, resultado financeiro, outras receitas, impostos), com um gráfico de barras dos fatores que mais pesaram. A soma bate exatamente com o lucro realizado. O resumo diz, por exemplo: quanto da receita do ano já foi realizado, se o ritmo está acima ou abaixo (o período representa X% do ano) e quanto falta para o orçado.

**Produtos.** Para cada produto: quantidade orçada do ano, vendida, % do ano, falta vender, preço orçado × preço médio real e três efeitos sobre o resultado (receita − custo do produto vendido), em R$:
- **Volume** = (quantidade vendida − quantidade orçada proporcional ao período) × (preço orçado − custo unitário orçado);
- **Preço** = quantidade vendida × (preço médio real − preço orçado);
- **Custo** = − quantidade vendida × (custo unitário real − custo unitário orçado).
Os três somam exatamente a diferença do resultado do produto contra o orçado proporcional.
Na **pecuária** (leite, gado), o realizado só tem o total do grupo na DRE, então aparecem as quantidades, mas não o preço médio por produto.

**DRE.** Cada linha com: orçado do ano, **orçado do período** (orçado do ano × meses do período ÷ 12), realizado, diferença, % e **falta realizar** (orçado do ano − realizado). Margens aparecem em pontos percentuais.

**Balanço.** Realizado no fim do período × orçado em 31/12 (datas diferentes: a diferença mostra o caminho que falta até o fim do ano).

> **Limite importante:** o orçamento é anual e não tem sazonalidade mensal. Por isso o "orçado do período" é **proporcional aos meses** (ex.: seis meses = 50% do ano). Em atividades sazonais (safra), isso pode distorcer a leitura das linhas da DRE; a análise por **quantidade vendida** dos produtos não depende disso.

---

## 14. Demonstrativos (calculados, somente leitura)

### 14.1 DRE
A DRE usa a estrutura do Fechamento Contábil. Cada linha é de um destes tipos:
- **Entrada:** recebe o valor de um módulo (ou fica zerada se ainda não há origem).
- **Soma:** grupo, soma das linhas abaixo.
- **Calculada:** totais e subtotais com fórmula (Receita líquida, Resultado bruto, EBITDA, EBIT, EBT, Lucro líquido).
- **Percentual:** margens sobre a receita líquida.

Receitas aparecem **positivas**; custos e despesas, **negativos**. Ao clicar no ⓘ de uma linha, você vê **como ela é calculada**.

| Linha da DRE | De onde vem |
|---|---|
| **Receitas da atividade agropecuária** (uma linha por produto) | Resultado por produto · receita bruta anual |
| **Receitas da atividade de transportes** | Premissas de transportadora |
| **(−) Deduções da atividade agropecuária** | Resultado por produto · deduções (% dedução do ano da venda) |
| **(−) Deduções da atividade de transportes** | Premissas de transportadora |
| **(=) Receita líquida** | Receita bruta + deduções |
| **(−) Custo do produto vendido** (uma linha por produto) | Resultado por produto · CPV (só custos diretos) |
| **CPV · Transportes** | Premissas de transportadora |
| **(=) Resultado bruto** | Receita líquida + CPV |
| **% Margem de contribuição** | Resultado bruto ÷ receita líquida |
| **Despesas arrendamentos** | Arrendamentos, ou média do realizado |
| **Rotação de culturas, Manutenção de fazendas, Perda de estoques** | Premissas da DRE · média do realizado |
| **Despesas administrativas, Doações, Impostos e taxas, Comercialização** | Premissas da DRE |
| **(=) EBITDA** | Resultado bruto + outras despesas operacionais |
| **(−) Depreciação** | Investimentos · depreciação (existentes + novos) |
| **(=) EBIT** | EBITDA + depreciação |
| **Receitas financeiras** | Premissas da DRE |
| **Despesas financeiras** | Juros dos contratos que vencem no ano (base de dívidas, todas as empresas) + juros das novas captações e financiamentos + juros da dívida de giro automática |
| **Outras receitas não operacionais** | Premissas da DRE e produtos de receita não operacional |
| **(=) EBT** | EBIT + resultado financeiro + outras receitas não operacionais |
| **(−) CSLL e IRPJ** | Premissa da DRE (% sobre a receita líquida ou base escolhida) |
| **(=) Lucro líquido** | EBT + CSLL e IRPJ |
| **% Margem líquida** | Lucro líquido ÷ receita líquida |

A tela mostra ainda, ao lado, o **Realizado** (anos fechados) e permite **anotar** os números (capítulo 15).

#### Exemplo de leitura (valores ilustrativos)
| Linha | 2027 |
|---|---|
| Receita bruta (agro + transportes) | 17.512 |
| (−) Deduções | −687 |
| **Receita líquida** | **16.825** |
| (−) CPV | −6.591 |
| **Resultado bruto** | **10.234** |
| (−) Outras despesas operacionais | −2.000 |
| **EBITDA** | **8.234** |
| (−) Depreciação | −1.000 |
| **EBIT** | **7.234** |
| Resultado financeiro | −600 |
| **EBT** | **6.634** |
| (−) CSLL e IRPJ | −100 |
| **Lucro líquido** | **6.534** |

### 14.2 Balanço patrimonial (saldo em 31/12)
O balanço é o "balanço pequeno" (BP sintético) do Fechamento Contábil. **Nada é digitado.** Há uma linha **Diferença** (Ativo − Passivo e patrimônio líquido) que **deve ser zero**: o fluxo de caixa calcula o caixa e a dívida de giro automática exatamente para isso.

| Conta | De onde vem |
|---|---|
| **Caixa e aplicações financeiras** | Fluxo de caixa (caixa de fechamento calculado). |
| **Contas a receber, Outros créditos, Estoque de insumos, Lavoura em formação, Rotação de cultura, Preparo de solo** | Premissas de balanço (prazos × receita líquida ou CPV; saldos digitados). |
| **Estoque de produtos acabados** | Resultado por produto (quantidade estocada × custo médio). |
| **Estoque de gado de corte** | Resultado por produto (movimentação do rebanho). |
| **Realizável LP, Participações, Intangível** | Premissas de balanço (saldos). |
| **Imobilizado** (Terras, Benfeitorias, Máquinas, Móveis, Rebanho, Outros) | Saldo do último balanço realizado; contas ligadas a tipos de investimento recebem **investido − desinvestido**. |
| **(−) Depreciação acumulada** | Investimentos · depreciação do ano, acumulada. |
| **Fornecedores, Impostos, Outras obrigações, Obrigações trabalhistas, Consórcios** | Premissas de balanço. |
| **Dívida Custeio + Capital de giro (curto e longo)** | Dívidas vigentes + novas captações de custeio e giro. |
| **CPLTD e Dívida bancária de investimentos** | Dívidas vigentes + financiamentos dos investimentos. |
| **Dívida de giro automática** | Fluxo de caixa (gerada quando o caixa ficaria abaixo do mínimo). |
| **Capital integralizado, Ajustes de avaliação, Lucros acumulados** | Premissas de dividendos. |
| **Resultado do exercício** | Lucro líquido da DRE do ano. |

### 14.3 Fluxo de caixa (somente o indireto)

A tela Fluxo de caixa mostra **apenas o fluxo de caixa indireto**. O fluxo simplificado e a tela de caixa e dívida de giro saíram do menu do fluxo; o acompanhamento da dívida de giro automática continua em *Premissas de dívidas* (aba Necessidade de capital de giro).

**Fluxo de caixa indireto** (o "completo"): parte do **EBIT**.
| Bloco | Linhas |
|---|---|
| **Operacional** | EBIT; (+) Depreciação; (−) Pagamento de IR e CSLL; (−) Variação do capital de giro; (+) Outras receitas não operacionais; (+/−) Outros ativos e passivos → **Fluxo de caixa operacional** |
| **Investimentos** | (−) Investimentos (CAPEX); (+) Venda de imobilizado; (+/−) Outras variações do imobilizado → **Fluxo de caixa dos investimentos** |
| **Financiamentos** | (+) Captações; (−) Amortizações; (+/−) Dívida de giro automática; (−) Resultado financeiro; (−) Distribuição de lucros; (+/−) Capital e ajustes → **Fluxo de caixa dos financiamentos** |
| **Caixa** | Saldo de caixa anterior; Variação no caixa; **Saldo final de caixa**; Verificação (deve ser zero) |

O mecanismo que fecha o caixa (e que alimenta a linha "Dívida de giro automática" do fluxo) é explicado abaixo.

#### Como o sistema fecha o caixa (dívida de giro automática)
Ele **substitui os "plugs" manuais da planilha** por um cálculo automático:
1. Calcula o fluxo do ano: *lucro líquido + depreciação − variação do capital de giro ± outros ativos e passivos* (operacional), menos os investimentos líquidos, mais/menos captações e amortizações, menos a distribuição de lucros.
2. O **caixa mínimo** é o % do CPV informado em Premissas de balanço.
3. Se o caixa do ano ficaria **abaixo do mínimo**, o sistema **gera dívida de giro** (curto prazo) para chegar ao mínimo. Se **sobrar**, a sobra **amortiza** essa dívida; acabando a dívida, a sobra fica no caixa.
4. A dívida entra (ou sai) no **meio do ano** e os juros incidem sobre o saldo médio. Os juros reduzem o caixa do mesmo ano e entram na despesa financeira da DRE; o cálculo repete até convergir.

**Exemplo:** CPV de R$ 40.000 mil e caixa mínimo de 10% → caixa mínimo = **R$ 4.000 mil**. Se o caixa do ano ficaria em R$ 1.000 mil, o sistema gera cerca de **R$ 3.000 mil** de dívida de giro (um pouco mais, para cobrir os juros do próprio ano).

### 14.4 Usos e fontes
Mostra de onde veio o dinheiro (**fontes**) e para onde foi (**usos**) em cada ano. Cada item aparece na coluna certa conforme o sinal do ano.

| Item | Fonte quando… | Uso quando… |
|---|---|---|
| EBITDA | sempre (geração de caixa) | — |
| Capital de giro | reduz | aumenta |
| Caixa | reduz | aumenta |
| Outros ativos e passivos | reduz | aumenta |
| Outras receitas não operacionais | positivas | negativas |
| Novas captações e financiamentos | entram | são reduzidas |
| Dívidas existentes | aumentam | são pagas |
| Dívida de giro automática | é gerada | é amortizada |
| Investimentos (CAPEX) e venda de imobilizado | venda | investimento |
| Capital e ajustes | integralização | redução |
| Juros e resultado financeiro | receitas | despesas |
| IR e CSLL | crédito | pagamento |
| Distribuição de lucros | — | dividendos pagos |

A linha **Verificação** deve dar **zero** (total de fontes = total de usos).

### 14.5 Indicadores
11 indicadores, cada um com um **limite** editável por ano (os limites padrão seguem os do Fechamento Financeiro atual) (mínimo ou máximo). O sistema indica, ano a ano, se o indicador **atende ou não** ao limite.

| Indicador | Cálculo | Tipo de limite (valor padrão) |
|---|---|---|
| **Alavancagem total** | Dívida bancária ÷ EBITDA | Máximo (3,0) |
| **Índice de liquidez** | Ativo circulante ÷ passivo circulante | Mínimo (1,1) |
| **Capacidade de pagamento** | EBITDA ÷ (CPLTD + juros) | Mínimo (1,5) |
| **Ponto de equilíbrio financeiro** | Mostra o faturamento (receita bruta) do ano e o compara com o **faturamento mínimo**: (despesas fixas + despesas financeiras + distribuição de lucros + CPLTD do ano anterior) ÷ margem bruta | Calculado (sem limite digitado) |
| **Solvência** | Patrimônio líquido ÷ ativo total | Mínimo (50%) |
| **Dívida total ÷ ativo total** | Todo o exigível (ativo − patrimônio líquido: dívida bancária, fornecedores e demais obrigações) ÷ ativo total, como no Fechamento Financeiro | Máximo (50%) |
| **Alavancagem líquida** | (Dívida − caixa) ÷ EBITDA | Máximo (2,5) |
| **Margem EBITDA** | EBITDA ÷ receita líquida | Mínimo (30%) |
| **Alavancagem operacional** | (Fornecedores + dívida de custeio e capital de giro + dívida de giro automática) ÷ (CPV + **todos os estoques** (produtos acabados, gado, insumos, lavoura, rotação de cultura e preparo de solo) + caixa) | Máximo (60%) |
| **ROIC** | EBIT ÷ capital investido (capital de giro operacional líquido + imobilizado + caixa) | Mínimo (14%) |
| **ROE** | Lucro líquido ÷ patrimônio líquido | Mínimo (14%) |

**Como aparecem:** solvência, dívida total ÷ ativo, alavancagem operacional, margem EBITDA, ROIC e ROE são mostrados em **porcentagem** (ex.: 39%), e o limite deles também é digitado em %. Liquidez, capacidade de pagamento e as alavancagens total e líquida são **números** (ex.: 1,10), como na planilha de fechamento.

**Gráficos:** cada gráfico tem um botão no canto (setas) para **expandir** em uma janela grande; feche com ✕, clicando fora ou com Esc.

**Ano em andamento:** se houver (ex.: 2026 de janeiro a junho), ele aparece como o último ano realizado, indicado como "realizado · jan a jun". Os indicadores desse ano usam a DRE do período (sem anualizar), então os que dependem do resultado do ano (alavancagem total, capacidade de pagamento, ROE, ROIC) ficam distorcidos; as margens e os índices só de balanço não.

**Realizado:** a tabela e os gráficos trazem também os indicadores dos **anos fechados** (balanço e DRE da tela Realizado, anos anteriores ao orçamento), calculados com **as mesmas fórmulas**. Na tabela, os anos realizados aparecem em colunas cinza, antes dos anos do orçamento. Nos gráficos, a **linha azul** é o realizado, a **verde** é o projetado e a **tracejada** é o limite. Duas diferenças: o limite não existe para os anos realizados, e o faturamento mínimo do ponto de equilíbrio não é calculado no realizado (o sistema não tem a distribuição de lucros realizada), então ali aparece só o faturamento.

Há também **Gráficos dos indicadores** e a **Composição do endividamento** (curto prazo, longo prazo, despesas financeiras e custo da dívida).

---

## 15. Anotações

Você pode **marcar números** na DRE, no Balanço e no Resultado por produto: clique no número, escolha uma cor de marca-texto (**amarelo, verde ou vermelho**) e escreva um comentário. As anotações ficam salvas por orçamento.

| Campo | Significado |
|---|---|
| **Cor** | Amarelo, verde ou vermelho (convenção sua). |
| **Comentário** | Até 2.000 caracteres. |
| **Valor anotado** | O número que estava na tela quando você anotou. |
| **Valor atual** | O número de hoje. Se for diferente, aparece **valor alterado**. |
| **Check de conferência** | Marca a anotação como **resolvida/validada** (com data e quem validou). |

A tela **Anotações** lista todas, com o caminho (tela, grupo, linha, ano). Anotações valem inclusive em orçamentos **aprovados e travados**. Na tela **Início**, as pendentes (sem check) viram o primeiro item de "O que precisa da sua atenção".

---

## 16. Receita para montar um orçamento novo (passo a passo)

1. **Novo orçamento**: defina o nome e o período (ou copie de um existente para criar um cenário).
2. **Cadastros** (só se faltar algo): produtos, rubricas de custo, tipos de investimento, tipos de premissas da DRE.
3. **Realizado**: suba os anos já fechados (balanço e DRE) para alimentar médias e saldos iniciais.
4. **Premissas de produção**: áreas → produtividade → preços → custos variáveis → premissas de produtos (e rebanho, se houver gado de corte). Confira em *Resultados de produtos*.
5. **Premissas de transportadora**, se for o caso.
6. **Premissas de investimento**: investimentos, desinvestimentos e financiamento. Confira a depreciação.
7. **Premissas da DRE**: grave a média do realizado das contas de baixo da DRE; adicione as premissas cadastradas que precisar.
8. **Premissas de dívidas**: vincule a base de dívidas; cadastre novas captações; confira a taxa da dívida de giro.
9. **Premissas de balanço**: grave os prazos médios e defina o caixa mínimo.
10. **Premissas de dividendos**: defina a regra de distribuição de lucros.
11. Confira **DRE, Balanço, Fluxo de caixa, Usos e fontes e Indicadores**. O balanço precisa fechar (Diferença = 0).
12. Use **Anotações** para registrar dúvidas e conferir.
13. **Aprovar e travar** na tela Orçamentos. Durante o ano, crie um **Reprojetado** para revisar, e use **Comparar orçamentos** para ver o que mudou.

---

## 17. Onde nasce cada linha dos demonstrativos (resumo rápido)

| Quero entender… | Olhe em… |
|---|---|
| Por que a receita de um produto está assim | Premissas de produção (área × produtividade × preço) e Resultados de produtos |
| Por que o custo do produto está assim | Custos variáveis (só rubricas diretas) e Premissas de produtos (descarte, estoque) |
| Por que a despesa administrativa está assim | Premissas da DRE (média do realizado × receita líquida) |
| Por que a depreciação está assim | Premissas de investimento · Depreciação |
| Por que a despesa financeira está assim | Premissas de dívidas (base vigente + novas captações) e dívida de giro automática |
| Por que o contas a receber está assim | Premissas de balanço (dias × receita líquida) |
| Por que o caixa está assim | Fluxo de caixa (caixa mínimo e dívida de giro automática) |
| Por que o lucro acumulado está assim | Premissas de dividendos |
| Por que o balanço não fecha | Veja a linha Diferença; revise Realizado (saldo inicial) e Premissas de balanço |
| De onde vem a receita da transportadora | Premissas de transportadora |

---

## 18. Glossário

| Termo | Significado |
|---|---|
| **CPV** | Custo do produto vendido. |
| **EBITDA** | Resultado antes de juros, impostos, depreciação e amortização (geração de caixa operacional). |
| **EBIT** | EBITDA menos depreciação. |
| **EBT** | Resultado antes dos impostos sobre o lucro. |
| **CPLTD** | Parcela da dívida de longo prazo que vence nos próximos 12 meses. |
| **NCG** | Necessidade de capital de giro: ativo circulante operacional menos passivo circulante operacional. |
| **CAPEX** | Investimento em bens duráveis (máquinas, obras, caminhões). |
| **SAC** | Sistema de amortização com parcelas iguais de principal. |
| **Saldo médio** | (saldo do início + saldo do fim) ÷ 2; base dos juros no ano. |
| **Reprojetado** | Cópia de um orçamento para revisar durante o ano. |
| **Cenário** | Cópia de um orçamento para testar uma hipótese. |
| **Plug** | Ajuste manual da planilha antiga para fechar o balanço; no sistema, o fluxo de caixa faz isso sozinho. |
| **Realizado** | Balanços e DREs de anos já fechados. |

---

## 19. O que ainda fica zerado ou fora do sistema

- Contas da DRE ou do Balanço **sem módulo e sem premissa** ficam zeradas até existir uma premissa vinculada a elas (use "Premissas da DRE" ou os tipos cadastrados).
- O sistema **não valida** se a soma das áreas cabe na área disponível.
- A **transportadora** não tem balanço, fluxo nem dívida próprios: tudo é consolidado.
- Os **demonstrativos são anuais**. O fluxo de caixa mensal ainda não existe no sistema.
- A tela de **Arrendamentos** está oculta no menu; o custo de arrendamento entra na DRE pela média do realizado quando essa premissa está preenchida.
