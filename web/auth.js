"use strict";
// Login pelo Supabase Auth. A tela pega a URL e a chave PÚBLICA do Supabase em /api/config (nada fica no código),
// guarda a sessão no navegador e envia o token em toda chamada à API.
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

const Sekita = {
  cliente: null,
  async iniciar() {
    if (this.cliente) return this.cliente;
    if (!window.supabase) await new Promise((ok, falha) => { const s = document.createElement("script"); s.src = SUPABASE_JS; s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar o login. Verifique a internet.")); document.head.appendChild(s); });
    const cfg = await (await fetch("/api/config")).json();
    if (!cfg.url || !cfg.anonKey) throw new Error("Login não configurado (faltam as variáveis do Supabase no Netlify).");
    this.cliente = window.supabase.createClient(cfg.url, cfg.anonKey);
    return this.cliente;
  },
  // garante que há sessão; sem ela, vai para a tela de login
  async exigirLogin() {
    const c = await this.iniciar();
    const { data } = await c.auth.getSession();
    if (!data.session) { location.href = "/login.html"; return null; }
    return data.session;
  },
  async token() {
    const { data } = await (await this.iniciar()).auth.getSession();
    return data.session ? data.session.access_token : null;
  },
  async sair() { await (await this.iniciar()).auth.signOut(); location.href = "/login.html"; },
};

// fetch para a API com o token do usuário; 401 volta para o login
async function fetchApi(url, opcoes = {}) {
  const t = await Sekita.token();
  const r = await fetch(url, { ...opcoes, headers: { ...(opcoes.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) } });
  if (r.status === 401) { location.href = "/login.html"; }
  return r;
}
