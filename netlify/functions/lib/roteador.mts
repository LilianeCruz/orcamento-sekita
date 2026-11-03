import type { Usuario } from "./auth.mts";
import type { Bd } from "./bd.mts";

export interface Contexto { bd: Bd; usuario: Usuario; params: Record<string, string>; consulta: URLSearchParams; corpo: any; bruto: Uint8Array | null; }
// resposta que não é JSON (download de planilha, por exemplo)
export class RespostaArquivo { constructor(public dados: Uint8Array, public tipo: string, public nome: string) {} }
type Tratador = (c: Contexto) => Promise<unknown> | unknown;
interface Rota { metodo: string; partes: string[]; tratador: Tratador; }

// Roteador mínimo com os mesmos caminhos do FastAPI: /api/versoes/{vid}/horizonte -> "/versoes/:vid/horizonte"
export class Roteador {
  private rotas: Rota[] = [];
  adicionar(metodo: string, caminho: string, tratador: Tratador) {
    this.rotas.push({ metodo, partes: caminho.split("/").filter(Boolean), tratador });
  }
  get(c: string, t: Tratador) { this.adicionar("GET", c, t); }
  post(c: string, t: Tratador) { this.adicionar("POST", c, t); }
  put(c: string, t: Tratador) { this.adicionar("PUT", c, t); }
  delete(c: string, t: Tratador) { this.adicionar("DELETE", c, t); }

  achar(metodo: string, caminho: string): { tratador: Tratador; params: Record<string, string> } | null {
    const partes = caminho.split("/").filter(Boolean);
    for (const r of this.rotas) {
      if (r.metodo !== metodo || r.partes.length !== partes.length) continue;
      const params: Record<string, string> = {};
      if (r.partes.every((p, i) => (p.startsWith(":") ? ((params[p.slice(1)] = decodeURIComponent(partes[i])), true) : p === partes[i]))) return { tratador: r.tratador, params };
    }
    return null;
  }
}
