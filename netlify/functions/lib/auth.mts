import { createClient } from "@supabase/supabase-js";
import { ErroHttp } from "./erros.mts";

export interface Usuario { id: string; email: string; }

// Confere o token do login (Supabase Auth) enviado pela tela em "Authorization: Bearer ...".
// Opcional: EMAILS_PERMITIDOS = lista separada por vírgula; se existir, só esses e-mails entram.
export async function usuarioDaRequisicao(req: Request): Promise<Usuario> {
  const cab = req.headers.get("authorization") || "";
  const token = cab.startsWith("Bearer ") ? cab.slice(7) : "";
  if (!token) throw new ErroHttp(401, "Faça login para continuar");
  const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !chave) throw new Error("SUPABASE_URL / chaves não configuradas");
  const { data, error } = await createClient(url, chave, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user || !data.user.email) throw new ErroHttp(401, "Sessão expirada. Entre de novo.");
  const permitidos = (process.env.EMAILS_PERMITIDOS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (permitidos.length && !permitidos.includes(data.user.email.toLowerCase())) throw new ErroHttp(403, "Este e-mail não tem acesso ao sistema");
  return { id: data.user.id, email: data.user.email };
}
