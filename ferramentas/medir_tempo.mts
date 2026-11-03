// Mede o tempo e o número de consultas das telas mais pesadas contra o banco da nuvem (só leitura). Rodar com as variáveis do Netlify:
//   netlify dev:exec -- npx tsx ferramentas/medir_tempo.mts [id da versão]
import { bdPostgres } from "../netlify/functions/lib/bd-postgres.mts";
import { rotas } from "../netlify/functions/rotas.mts";

const bd0 = bdPostgres();
const vid = Number(process.argv[2] || (await bd0.q("SELECT min(id) AS id FROM versoes"))[0].id);
const caminhos = [`/versoes/${vid}/resultado`, `/versoes/${vid}/dre`, `/versoes/${vid}/balanco-patrimonial`, `/versoes/${vid}/fluxo-caixa`, `/versoes/${vid}/indicadores`, `/versoes/${vid}/usos-fontes`,
  `/versoes/${vid}/capital-giro`, `/versoes/${vid}/investimentos`, `/versoes/${vid}/captacoes`, `/versoes/${vid}/dividas`, `/versoes/${vid}/inicio`, `/versoes/${vid}/anotacoes/todas`, `/versoes/${vid}/patrimonio`, "/realizado"];
for (const c of caminhos) {
  const achada = rotas.achar("GET", c)!;
  let consultas = 0;
  const t0 = Date.now();
  try {
    await bd0.tx(async (bd) => {
      const q = bd.q.bind(bd);
      const contado: typeof bd = { ...bd, q: ((...a: any[]) => { consultas++; return (q as any)(...a); }) as any };
      return achada.tratador({ bd: contado, usuario: { email: "medicao" } as any, params: achada.params, consulta: new URLSearchParams(), corpo: null, bruto: null });
    });
    console.log(`${c.padEnd(48)} ${String(Date.now() - t0).padStart(6)} ms  ${String(consultas).padStart(5)} consultas`);
  } catch (e: any) { console.log(`${c.padEnd(48)} ERRO ${e.message}`); }
}
process.exit(0);
