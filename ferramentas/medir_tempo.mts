// Mede o tempo e o número de consultas das telas mais pesadas contra o banco da nuvem (só leitura). Rodar com as variáveis do Netlify:
//   netlify dev:exec -- npx tsx ferramentas/medir_tempo.mts [id da versão]
import { bdPostgres } from "../netlify/functions/lib/bd-postgres.mts";
import { perfil } from "../netlify/functions/lib/bd.mts";
import { rotas } from "../netlify/functions/rotas.mts";

const bd0 = bdPostgres();
const vid = Number(process.argv.find((a) => /^\d+$/.test(a)) || (await bd0.q("SELECT min(id) AS id FROM versoes"))[0].id);
const caminhos = [`/versoes/${vid}/resultado`, `/versoes/${vid}/dre`, `/versoes/${vid}/balanco-patrimonial`, `/versoes/${vid}/fluxo-caixa`, `/versoes/${vid}/indicadores`, `/versoes/${vid}/usos-fontes`,
  `/versoes/${vid}/capital-giro`, `/versoes/${vid}/investimentos`, `/versoes/${vid}/captacoes`, `/versoes/${vid}/dividas`, `/versoes/${vid}/inicio`, `/versoes/${vid}/anotacoes/todas`, `/versoes/${vid}/patrimonio`, "/realizado"];
const detalhar = process.argv.includes("--detalhe");
perfil.ativo = true;
for (const c of caminhos) {
  perfil.textos.clear();
  const achada = rotas.achar("GET", c)!;
  let consultas = 0;
  const t0 = Date.now();
  try {
    await bd0.tx(async (bd) => {
      const q = bd.q.bind(bd);
      const contado: typeof bd = { ...bd, q: ((...a: any[]) => { consultas++; return (q as any)(...a); }) as any };
      return achada.tratador({ bd: contado, usuario: { email: "medicao" } as any, params: achada.params, consulta: new URLSearchParams(), corpo: null, bruto: null });
    });
    const reais = [...perfil.textos.values()].reduce((t, x) => t + x, 0);
    console.log(`${c.padEnd(48)} ${String(Date.now() - t0).padStart(6)} ms  ${String(reais).padStart(5)} idas ao banco`);
    if (detalhar) for (const [t, n] of [...perfil.textos].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`      ${String(n).padStart(4)}× ${t}`);
  } catch (e: any) { console.log(`${c.padEnd(48)} ERRO ${e.message}`); }
}
process.exit(0);
