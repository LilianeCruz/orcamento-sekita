import type { Context } from "@netlify/functions";
import { usuarioDaRequisicao } from "./lib/auth.mts";
import { ErroHttp } from "./lib/erros.mts";
import { Roteador } from "./lib/roteador.mts";
import { sql } from "./lib/db.mts";

const r = new Roteador();

// ---- rotas ainda em construção: a cada fase, os módulos portados do Python entram aqui (mesmos caminhos e formatos) ----
r.get("/saude", async () => {
  const [{ n }] = await sql()`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`;
  return { ok: true, tabelas: n };
});

r.get("/versoes", async () => sql()`SELECT * FROM versoes ORDER BY ano_base DESC, id DESC`);

// ---- porta de entrada ----
export default async (req: Request, _ctx: Context): Promise<Response> => {
  const json = (dados: unknown, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  try {
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, "") || "/";

    // única rota pública: a tela precisa da URL e da chave pública do Supabase para montar o login
    if (req.method === "GET" && caminho === "/config") {
      return json({ url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY });
    }

    const usuario = await usuarioDaRequisicao(req);
    const achada = r.achar(req.method, caminho);
    if (!achada) return json({ erro: "Rota não encontrada (ainda não portada): " + req.method + " " + caminho }, 404);
    const corpo = ["POST", "PUT", "PATCH"].includes(req.method) ? await req.json().catch(() => null) : null;
    return json(await achada.tratador({ usuario, params: achada.params, consulta: url.searchParams, corpo }));
  } catch (e) {
    if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: "Erro interno" }, 500);
  }
};
