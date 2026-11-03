import type { Context } from "@netlify/functions";
import { usuarioDaRequisicao } from "./lib/auth.mts";
import { ErroHttp } from "./lib/erros.mts";
import { bdPostgres } from "./lib/bd-postgres.mts";
import { RespostaArquivo } from "./lib/roteador.mts";
import { rotas } from "./rotas.mts";

// ---- porta de entrada: confere o login, acha a rota e roda tudo numa transação (como o sistema em Python: confirma no fim, desfaz se der erro)
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
    if (req.method === "GET" && caminho === "/saude") {
      const [{ n }] = await bdPostgres().q<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
      return json({ ok: true, tabelas: n, usuario: usuario.email });
    }
    const achada = rotas.achar(req.method, caminho);
    if (!achada) return json({ erro: "Rota não encontrada (ainda não portada): " + req.method + " " + caminho }, 404);
    const escrita = ["POST", "PUT", "PATCH"].includes(req.method);
    const binario = escrita && (req.headers.get("content-type") || "").startsWith("application/octet-stream");       // envio de planilha: o corpo é o arquivo
    const bruto = binario ? new Uint8Array(await req.arrayBuffer()) : null;
    const corpo = escrita && !binario ? await req.json().catch(() => null) : null;
    const resultado = await bdPostgres().tx((bd) => Promise.resolve(achada.tratador({ bd, usuario, params: achada.params, consulta: url.searchParams, corpo, bruto })));
    if (resultado instanceof RespostaArquivo) return new Response(resultado.dados as any, { headers: { "Content-Type": resultado.tipo, "Content-Disposition": `attachment; filename="${resultado.nome}"` } });
    return json(resultado);
  } catch (e) {
    if (e instanceof ErroHttp) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: "Erro interno" }, 500);
  }
};
