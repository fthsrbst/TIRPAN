/**
 * Lightweight client-side data export helpers.
 * Used by the list pages (Findings, Hosts, Credentials, Exploits, Agents) to
 * let analysts pull engagement data out as CSV / JSON without a backend round-trip.
 */

/** Trigger a browser download for an in-memory string. */
export function downloadFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Quote a single CSV cell, escaping embedded quotes / separators / newlines. */
function csvCell(value: unknown): string {
  if (value == null) return "";
  let s: string;
  if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface CsvColumn<T> {
  /** Header label shown in the first CSV row. */
  header: string;
  /** Pull the cell value out of a row. */
  accessor: (row: T) => unknown;
}

/** Serialize rows to a CSV string. Columns are inferred from keys when omitted. */
export function toCSV<T extends Record<string, any>>(rows: T[], columns?: CsvColumn<T>[]): string {
  if (!rows.length && !columns) return "";
  const cols: CsvColumn<T>[] =
    columns ??
    Object.keys(rows[0]).map((k) => ({ header: k, accessor: (r: T) => r[k] }));
  const head = cols.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(c.accessor(r))).join(",")).join("\r\n");
  return `${head}\r\n${body}`;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Export rows as a downloadable CSV file. `base` becomes `tirpan-<base>-<timestamp>.csv`. */
export function exportCSV<T extends Record<string, any>>(base: string, rows: T[], columns?: CsvColumn<T>[]) {
  downloadFile(`tirpan-${base}-${stamp()}.csv`, toCSV(rows, columns), "text/csv");
}

/** Export any serializable payload as a downloadable JSON file. */
export function exportJSON(base: string, data: unknown) {
  downloadFile(`tirpan-${base}-${stamp()}.json`, JSON.stringify(data, null, 2), "application/json");
}
