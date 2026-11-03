// Leitura e criação de planilhas .xlsx (no Python: openpyxl). A planilha lida vira listas de linhas com os valores (fórmulas já calculadas),
// como o openpyxl com data_only=True: célula vazia = null, data = texto "AAAA-MM-DD HH:MM:SS".
import ExcelJS from "exceljs";

export interface Planilha { abas: string[]; linhas(aba: string): any[][]; }

function valorDe(v: any): any {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  if (typeof v === "object") {
    if ("result" in v) return valorDe(v.result);
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return String(v.error);
    return null;
  }
  return v;
}

export async function abrirPlanilha(conteudo: Uint8Array): Promise<Planilha> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(conteudo as any);
  const abas = wb.worksheets.map((w) => w.name);
  return {
    abas,
    linhas(aba: string) {
      const ws = wb.getWorksheet(aba);
      if (!ws) throw new Error(`Aba '${aba}' não existe`);
      const cols = ws.columnCount, saida: any[][] = [];
      for (let r = 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        saida.push(Array.from({ length: cols }, (_, c) => valorDe(row.getCell(c + 1).value)));
      }
      return saida;
    },
  };
}

export const ehPlanilhaXlsx = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;      // "PK": um .xlsx é um zip

export { ExcelJS };
