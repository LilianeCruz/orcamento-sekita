-- Dados que o sistema em Python criava sozinho ao abrir o banco pela primeira vez
INSERT INTO investimento_classificacoes(nome)
SELECT x.nome FROM (VALUES ('Expansão'), ('Manutenção'), ('Melhoria da Capacidade Produtiva'), ('Substituição'), ('Redução de Risco de Produção'), ('A Classificar')) AS x(nome)
WHERE NOT EXISTS (SELECT 1 FROM investimento_classificacoes);
