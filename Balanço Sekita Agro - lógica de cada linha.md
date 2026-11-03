# Balanço patrimonial — aba "Sekita Agro - Cen Base"

Explicação linha a linha de como cada valor do balanço é calculado e de onde ele vem. Tudo em **R$ mil** (`[BRL '000]`).
Os números de exemplo são do **ano de 2023 (coluna N)**, o primeiro ano projetado, salvo quando indicado.

## Como ler a aba

- **Colunas:** D = 2013 … M = 2022 … N = 2023 … U = 2030.
- **Até 2022 (colunas D a M):** o balanço é **histórico**. Quase tudo é número digitado (o fechamento real) ou ligado à aba *Endividamento*.
- **De 2023 em diante (N a U):** o balanço é **projetado**. Cada linha é uma fórmula ligada a outras abas: *Capital de Giro*, *CAPEX e Dívida Bancária*, *Aquisição de Terras*, *Desinvestimentos* e *Endividamento*.
- **Deslocamento de colunas:** algumas abas têm uma coluna a menos ou a mais. Por isso a fórmula de 2023 (coluna N) às vezes lê a coluna M ou O de outra aba. Isso é só deslocamento de colunas, não é erro.
- **Fecha com plugs:** o balanço só fecha porque existem duas linhas de ajuste manual, **Plug - Caixa** e **Plug - Dívida**, explicadas no fim.

---

## ATIVO

### Ativo Total (linha 43)
`= Ativo Circulante + Ativo não Circulante`. 2023: 125.874,1 + 488.138,6 = **614.012,6**.

### Ativo Circulante (linha 45)
`= SOMA das linhas 46 a 54`. 2023: **125.874,1**.

| Linha | Como é calculada | De onde vem |
|---|---|---|
| **46 Caixa e Aplicações Financeiras** | `= − Custo de produção ÷ 12 × Caixa mínimo (meses)` | Custo de produção = linha 10 do DRE (226.760). Caixa mínimo = **2 meses** (célula C46, digitada). 2023: 226.760 ÷ 12 × 2 = **37.793,3**. Ou seja, o caixa é uma **premissa de reserva**: dois meses de custo. Não é fluxo de caixa. |
| **47 Contas a Receber - Clientes** | `= Receita líquida × dias de recebimento ÷ 360` | Aba *Capital de Giro* linha 12. Os dias (14,2 dias de receita) são **repetidos do ano anterior** (`=M24`) e a base é a Receita Líquida do DRE. 2023: 359.048,6 × 14,2 ÷ 360 = **14.132,4**. |
| **48 Despesas do exercício seguinte** | `= Receita líquida × dias ÷ 360` | *Capital de Giro* linha 13, com 0,7 dia, repetido do ano anterior. 2023: **695,5**. (O rótulo da aba diz "dias de CPV", mas a fórmula usa a receita líquida.) |
| **49 Recebíveis CP (Novas vendas)** | `= valor recebido no ano seguinte` | *Desinvestimentos* linha 127 (`= − Valor Recebido do período seguinte`). É a parcela de venda de ativos a prazo que será recebida em até 12 meses. 2023: 0. |
| **50 Estoque de produtos acabados** | Soma do valor, a custo, dos estoques de cada produto no fim do ano | *Capital de Giro* linha 14 = estoque de cenoura + beterraba + alho + semente de alho + batata + repolho (aba *Projeção Oper. e Adm.*, linhas "Estoque de …") + o estoque de repolho da parceria (*Operacional* linha 86). Cada estoque é a **quantidade estocada × custo médio do produto**. 2023: **5.736,6**. |
| **51 Estoque de insumos** | `= Custo do produto vendido × dias de estoque ÷ 360` | *Capital de Giro* linha 15, com 68,1 dias de CPV, repetido do ano anterior. 2023: **42.917,3**. |
| **52 Outros créditos** | Digitado | Em 2022 havia 6.404,0. De 2023 em diante é **0** digitado. |
| **53 Lavoura em formação** | `= Custo do produto vendido × dias ÷ 360` | *Capital de Giro* linha 16, com 39,1 dias de CPV, repetido do ano anterior. 2023: **24.599,0**. |
| **54 Plug - Caixa** | Digitado (manual) | Ajuste para fechar o balanço quando "sobra caixa" (ver Plugs). Hoje é 0 em todos os anos. |

### Ativo não Circulante (linha 56)
`= SOMA das linhas 57 a 61`. 2023: **488.138,6**.

| Linha | Como é calculada | De onde vem |
|---|---|---|
| **57 Terra** | Saldo final de terras do ano | *Aquisição de Terras* linha 257: `Início do período (saldo do ano anterior) + Novas terras + Abertura de terras − Venda de terras`. 2023: **11.918,8**, sem compras nem vendas no cenário base. |
| **58 Máquinas, Equipamentos, Benfeitorias** | Imobilizado no fim do ano | *CAPEX e Dívida Bancária* linha 164: `Início do período − Depreciação do ano`. O início de 2023 é um valor digitado (389.653,6) e, nos anos seguintes, é o final do ano anterior. A depreciação do ano é a do ativo existente (10.075,4, digitada) somada à depreciação do novo CAPEX. 2023: **379.578,2**. |
| **59 Semoventes LP** | `= valor do ano anterior` (mantido constante) | Valor de mercado do rebanho (Nota 4). 2022: 51.003,9 digitado. De 2023 em diante repete: **51.003,9**. |
| **60 Recebíveis LP (Novas vendas)** | `= Saldo final a receber − parcela de curto prazo` (mínimo 0) | *Desinvestimentos* linha 128. 2023: 0. |
| **61 Outros (não relacionados à atividade rural)** | `= valor do ano anterior` | 2022: 45.637,7 digitado. Depois repete. |

---

## PASSIVO

### Passivo Total (linha 63)
`= Passivo Circulante + Passivo não Circulante + Patrimônio Líquido`. 2023: **614.012,6**.

### Passivo Circulante (linha 65)
`= SOMA das linhas 66 a 73`. 2023: **272.377,9**.

| Linha | Como é calculada | De onde vem |
|---|---|---|
| **66 Contas a Pagar - Fornecedores** | `= CPV × dias ÷ 360` | *Capital de Giro* linha 19, com 29,3 dias de CPV, repetido do ano anterior. 2023: **18.429,9**. |
| **67 Dívida Curto Prazo (Custeio)** | `= Dívida de curto prazo existente + Novos custeios + Plug de bancos CP` | *CAPEX e Dívida Bancária* linha 199: `Endividamento (linha 860) ÷ 1000 + novos custeios (linha 190, em branco) + "Bancos - Curto Prazo - PLUG" (linha 189)`. A linha 189 é o **Plug - Dívida** do balanço (linha 73). 2023: 144.969,2 + 0 + 18.900,8 = **163.870,0**. Em 2022 (histórico) é só o *Endividamento*. |
| **68 Outras obrigações** | `= CPV × dias ÷ 360` | *Capital de Giro* linha 20, com 35,2 dias de CPV. 2023: **22.193,0**. |
| **69 Obrigações trabalhistas** | `= CPV × dias ÷ 360` | *Capital de Giro* linha 21, com 8,8 dias de CPV. 2023: **5.511,7**. |
| **70 CPLTD - Amortização Dívida Bancária Existente** | Parcela da dívida existente que vence em 12 meses | *CAPEX e Dívida Bancária* linha 200 = *Endividamento* linha 861 ÷ 1000, soma das empresas: MESO 42.753,6 + ST/TAL 718,9. 2023: **43.472,5**. |
| **71 CPLTD - Amortização Novas Dívidas Bancárias** | `= − (amortização das novas dívidas do ano seguinte)` | *CAPEX e Dívida Bancária* linha 556: soma das amortizações da linha 447 (financiamentos de CAPEX em R$) e 535 (dívidas em US$) do período seguinte. 2023: 0, sem novas dívidas. |
| **72 CPLTD - Amortização Dívida de Terras** | Parcela de curto prazo da dívida de terras | *Aquisição de Terras* linha 260 = custo de abertura de terras (parcela CPLTD) + custo total CPLTD das novas dívidas de terras (linha 169). 2023: 0. |
| **73 Plug - Dívida** | Digitado (manual) | Ajuste para fechar o balanço quando é preciso "gerar dívida" (ver Plugs). 2023: **18.900,8**. 2024: **81.139,0**. |

### Passivo não Circulante (linha 75)
`= SOMA das linhas 76 a 80`. 2023: **89.922,1**.

| Linha | Como é calculada | De onde vem |
|---|---|---|
| **76 Dívida Bancária Existente - Longo Prazo** | `= Endividamento longo prazo + Novos investimentos (LP)` | *CAPEX e Dívida Bancária* linha 201 = *Endividamento* linha 862 ÷ 1000: MESO 74.531,5 + ST/TAL 423,7. 2023: **74.955,2**. |
| **77 Nova Dívida Bancária Longo Prazo (CAPEX)** | `= Saldo das novas dívidas − CPLTD` (mínimo 0) | *CAPEX e Dívida Bancária* linha 557. 2023: 0. |
| **78 Outras Obrigações** | `= valor do ano anterior` | 2022: 14.966,9 digitado. Depois repete. |
| **79 Dívida de terras Longo Prazo** | Dívidas existentes de terra após o CPLTD | *Aquisição de Terras* linha 29. 2023: 0. |
| **80 Nova Dívida de terras Longo Prazo** | Novas dívidas de terra após o CPLTD | *Aquisição de Terras* linha 261. 2023: 0. |

### Patrimônio Líquido (linha 82)
`= Capital integralizado + Novas integralizações + Lucro acumulado + Lucro retido no ano`. 2023: 79.812,9 + 0 + 110.685,6 + 61.214,1 = **251.712,6**.

| Linha | Como é calculada | Observação |
|---|---|---|
| **83 Capital integralizado** | `= capital do ano anterior + novas integralizações` | 2023: **79.812,9**, valor de 2022 mantido (Nota 3: o capital de 2015 foi achado por diferença entre ativo e passivo). |
| **84 Novas integralizações de capital / ajustes** | Digitado | 0 em todos os anos projetados. É onde se lança um aporte. |
| **85 Lucro acumulado** | `= Lucro acumulado do ano anterior + Lucro retido do ano anterior` | 2023: 46.322,7 + 64.362,9 = **110.685,6**. |
| **86 Lucro retido no ano** | `= Lucro líquido − Retiradas/Dividendos` | Do DRE: 76.517,6 − 15.303,5 = **61.214,1**. As retiradas (linha 37) são 20% do lucro líquido, com mínimo de 2.449,44 (`=SE(Lucro×20% < 2.449,44; 2.449,44; Lucro×20%)`). |

---

## Conferência

- **Linha 88, Plug - Diferença entre Ativo Total e Passivo Total:** `= Passivo Total − Ativo Total`. Tem que ser **0**.
- **Linha 90, Situação do Balanço:**
  - Se houver diferença **e** algum plug já preenchido, mostra **"ZERAR PLUGS"**.
  - Se Passivo > Ativo (diferença > 0), mostra **"SOBRA DE CAIXA"**. A solução é lançar a diferença em *Plug - Caixa* (linha 54).
  - Se Passivo < Ativo (diferença < 0), mostra **"GERAR DÍVIDA"**. A solução é lançar o valor em *Plug - Dívida* (linha 73).
  - Se a diferença for 0, mostra **"OK"**.
- **Linha 41, Giro dos Ativos:** `= Receita Bruta ÷ Ativo Total`. Não entra no balanço. É um indicador.

### Plugs: como o balanço fecha
O balanço **não fecha sozinho**. Ativo e passivo vêm de fontes independentes (capital de giro por dias, dívida do *Endividamento*, imobilizado por depreciação, lucro do DRE). A diferença é absorvida **manualmente**:
- O **Plug - Dívida** (linha 73) tem valores digitados com muitas casas decimais (por exemplo 18.900,786705… em 2023 e 81.139,021164… em 2024). São resultado de **atingir meta** (goal seek) feito à mão até a linha 88 chegar a zero.
- O mesmo valor também alimenta a linha 189 de *CAPEX e Dívida Bancária*, que gera **despesa financeira** (7,5% ao ano, `D191`) e entra na linha 67.

---

## Notas da própria planilha

1. **Custo de produção:** vem da planilha de custos do grupo. A depreciação está dentro do custo das culturas e foi separada à parte.
2. **EBIT:** é calculado subtraindo a depreciação do EBITDA.
3. **Capital integralizado:** o de dezembro/2015 foi calculado por diferença entre ativo e passivo.
4. **Semoventes LP:** o rebanho foi avaliado a valor de mercado com as quantidades de 31/12/2015.

---

## Pontos de atenção que encontrei ao seguir as fórmulas

1. **Plug de dívida contado duas vezes no passivo.** A linha 67 (`CAPEX!N199`) já soma o plug (`CAPEX!N189 = linha 73`), e a linha 73 também entra na soma do Passivo Circulante. Em 2023, 18.900,8 aparecem duas vezes (163.870,0 inclui o plug, e o plug aparece de novo na linha 73). Em 2024, a dívida de curto prazo (81.139,0) é só o plug, e ele também está na linha 73. O balanço fecha porque o valor é ajustado à mão até zerar, mas o plug "vale dobrado" no passivo.
2. **Sinal da depreciação no EBIT.** A linha 21 (depreciação) é negativa (−10.075,4) e a linha 23 faz `EBITDA − linha 21`. O resultado é que o EBIT (102.604,6) fica **maior** que o EBITDA (92.529,2). Pela Nota 2, o EBIT deveria ficar abaixo do EBITDA. Vale conferir a intenção, porque o lucro e, por consequência, o balanço (lucro acumulado) usam esse EBIT.
3. **"(+) Capex" vazio no imobilizado.** A linha 161 de *CAPEX e Dívida Bancária*, que deveria somar o investimento novo ao imobilizado, está **em branco**. Hoje o imobilizado só diminui pela depreciação. Um CAPEX novo não aumentaria "Máquinas, Equipamentos, Benfeitorias", embora sua depreciação seja descontada.
4. **Saltos entre 2022 e 2023.** O imobilizado vai de 137.411,1 (2022, digitado) para 379.578,2 (2023, que parte de 389.653,6 digitado). A Terra vai de 37.412,1 para 11.918,8. Ambos devem ser reavaliações ou reclassificações, mas não estão explicados na aba.
5. **IR e CSLL.** A fórmula é `−2,98% × (12% × Receita Bruta)`: uma alíquota efetiva de 2,98% sobre uma base presumida de 12% da receita bruta, não sobre o EBT.
6. **Margem líquida (linha 35).** A fórmula divide pelo `N7 − N8`, e a linha 8 já é negativa. Por isso o denominador é Receita Bruta **mais** deduções (369.162,9 + 10.114,2), e não a Receita Líquida.
