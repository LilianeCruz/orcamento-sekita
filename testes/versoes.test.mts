import { describe, it, expect } from "vitest";
import { bdTeste } from "../netlify/functions/lib/bd-teste.mts";
import * as versoes from "../netlify/functions/servicos/versoes.mts";
import * as culturas from "../netlify/functions/servicos/culturas.mts";

describe("esquema e dados iniciais", () => {
  it("cria as 51 tabelas e as classificações de investimento", async () => {
    const { bd } = await bdTeste();
    const [{ n }] = await bd.q<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
    expect(n).toBe(51);
    expect((await bd.q("SELECT nome FROM investimento_classificacoes ORDER BY id")).map((x) => x.nome)).toContain("A Classificar");
  });
});

describe("versões", () => {
  it("cria, copia, muda período, horizonte e aprova", async () => {
    const { bd } = await bdTeste();
    const id = await versoes.criarOrcado(bd, { ano_base: 2027 }, "t@x.com");
    expect((await versoes.listarVersoes(bd))[0].nome).toBe("Orçamento 2027");
    await bd.q("INSERT INTO culturas(nome, grupo, criado_em) VALUES('Soja','Grãos','x')");
    await bd.q("INSERT INTO culturas_da_versao(versao_id, cultura_id) VALUES(?,1)", [id]);
    await bd.q("INSERT INTO areas_cultura(versao_id, cultura_id, ano, area_ha) VALUES(?,1,2027,10)", [id]);
    const copia = await versoes.copiarVersao(bd, id, "revisao", null, "t@x.com");
    expect((await bd.q("SELECT area_ha FROM areas_cultura WHERE versao_id=?", [copia]))[0].area_ha).toBe(10);
    await versoes.alterarPeriodo(bd, copia, "Cenário", 2026, 2030, "t@x.com");
    const [v] = await bd.q("SELECT * FROM versoes WHERE id=?", [copia]);
    expect([v.nome, v.ano_base, v.horizonte]).toEqual(["Cenário", 2026, 5]);
    await expect(versoes.alterarHorizonte(bd, copia, 40, "t")).rejects.toThrow("entre 1 e 30");
    await versoes.aprovar(bd, copia, "t");
    await expect(versoes.alterarHorizonte(bd, copia, 3, "t")).rejects.toThrow("aprovada e travada");
  });
});

describe("produtos", () => {
  it("valida, cria, lista, atualiza e exclui", async () => {
    const { bd } = await bdTeste();
    await expect(culturas.criarCultura(bd, { nome: "", grupo: "Grãos" }, "t")).rejects.toThrow("Informe o nome");
    const id = await culturas.criarCultura(bd, { nome: "Soja", grupo: "Grãos", embalagem: "Saca", qtd_por_embalagem: 60 }, "t");
    await expect(culturas.criarCultura(bd, { nome: "soja", grupo: "Grãos" }, "t")).rejects.toThrow("Já existe um produto");
    const l = await culturas.listarCulturas(bd);
    expect(l.culturas[0]).toMatchObject({ nome: "Soja", ativa: true, em_uso: false, qtd_por_embalagem: 60 });
    await culturas.atualizarCultura(bd, id, { nome: "Soja", grupo: "Grãos", ativa: false }, "t");
    expect((await culturas.listarCulturas(bd)).culturas[0].ativa).toBe(false);
    await culturas.excluirCultura(bd, id, "t");
    expect((await culturas.listarCulturas(bd)).culturas).toHaveLength(0);
  });
});
