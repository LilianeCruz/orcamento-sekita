// Data e hora no formato do sistema ("2026-11-03T13:57:19"), no horário de Brasília (o servidor do Netlify roda em UTC)
export function agora(): string {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
  return p.replace(" ", "T");
}
