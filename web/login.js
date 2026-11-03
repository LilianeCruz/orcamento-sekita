"use strict";
const msg = (txt, tipo) => { const m = document.getElementById("lg-msg"); m.textContent = txt || ""; m.className = tipo || ""; m.hidden = !txt; };
(async () => {
  try {
    const c = await Sekita.iniciar();
    const { data } = await c.auth.getSession();
    if (data.session) { location.href = "/"; return; }
    // link de recuperação de senha: o Supabase volta para esta página com a sessão de recuperação
    c.auth.onAuthStateChange(async (evento) => {
      if (evento !== "PASSWORD_RECOVERY") return;
      const nova = prompt("Digite a nova senha (mínimo 8 caracteres):");
      if (!nova) return;
      const { error } = await c.auth.updateUser({ password: nova });
      if (error) msg(error.message, "erro"); else { msg("Senha alterada. Você já está logada.", "ok"); setTimeout(() => (location.href = "/"), 1200); }
    });
    document.getElementById("lg-form").addEventListener("submit", async (e) => {
      e.preventDefault(); msg("");
      const b = document.getElementById("lg-ok"); b.disabled = true; b.textContent = "Entrando…";
      const { error } = await c.auth.signInWithPassword({ email: document.getElementById("lg-email").value.trim(), password: document.getElementById("lg-senha").value });
      if (error) { msg(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message, "erro"); b.disabled = false; b.textContent = "Entrar"; return; }
      location.href = "/";
    });
    document.getElementById("lg-esqueci").addEventListener("click", async () => {
      const email = document.getElementById("lg-email").value.trim();
      if (!email) return msg("Digite seu e-mail e clique em \"Esqueci a senha\" de novo.", "erro");
      const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/login.html" });
      msg(error ? error.message : "Enviamos um link para o seu e-mail.", error ? "erro" : "ok");
    });
  } catch (e) { msg(e.message, "erro"); }
})();
