/** Excel (fr-FR) opens ';'-separated UTF-8 files correctly when they start with a BOM. */
const SEP = ';';

// Cells starting with these characters are evaluated as formulas by spreadsheet apps
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?[\d\s.,]+$/;

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(SEP)];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(SEP));
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv<T>(name: string, rows: T[], columns: CsvColumn<T>[]): void {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`jitplus-${name}-${stamp}.csv`, toCsv(rows, columns));
}

/** Walks a paginated endpoint (100 rows per call) and returns every row, up to `max`. */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{ rows: T[]; totalPages: number }>,
  onProgress?: (loaded: number) => void,
  max = 5000,
): Promise<T[]> {
  const limit = 100;
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const { rows, totalPages } = await fetchPage(page, limit);
    all.push(...rows);
    onProgress?.(all.length);
    if (page >= totalPages || rows.length === 0 || all.length >= max) break;
  }
  return all.slice(0, max);
}
