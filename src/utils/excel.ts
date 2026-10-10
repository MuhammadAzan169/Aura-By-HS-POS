import type { CsvColumn } from './export';

/**
 * Real Excel files (.xlsx), in both directions, entirely in the browser.
 * The libraries are loaded on first use so they never slow down the till.
 */

/** Same column definitions as CSV, so any table can export to Excel. */
export async function downloadExcel<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  filename: string,
  sheet = 'Sheet1',
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      if (v == null || v === '') return null;
      return typeof v === 'number' ? { type: Number, value: v } : { type: String, value: String(v) };
    }),
  );
  const widths = columns.map((c, i) => ({
    width: Math.min(
      48,
      Math.max(10, c.header.length + 2, ...body.slice(0, 200).map((r) => String(r[i]?.value ?? '').length + 2)),
    ),
  }));
  await writeXlsxFile([header, ...body] as never, {
    sheet: sheet.slice(0, 31),
    columns: widths,
    stickyRowsCount: 1,
  }).toFile(filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export type ImportedRow = Record<string, string>;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reads the first sheet of an .xlsx (or a .csv) into objects keyed by the
 * header row. Header matching ignores case, spaces and punctuation, so
 * "Phone No." and "phone" both land on `phone`.
 */
export async function readSpreadsheet(file: File, knownKeys: string[]): Promise<ImportedRow[]> {
  let grid: unknown[][];
  if (/\.csv$/i.test(file.name)) {
    grid = parseCsv(await file.text());
  } else {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    grid = (sheets[0]?.data ?? []) as unknown[][];
  }
  const [head, ...rest] = grid;
  if (!head) return [];
  const keys = head.map((h) => {
    const n = norm(String(h ?? ''));
    return knownKeys.find((k) => norm(k) === n) ?? null;
  });
  return rest
    .map((r) => {
      const out: ImportedRow = {};
      keys.forEach((k, i) => {
        if (!k) return;
        const v = r[i];
        out[k] = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      });
      return out;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A blank workbook with just the header row, for "Download template". */
export async function downloadTemplate(headers: string[], example: string[], filename: string): Promise<void> {
  const rows = [example];
  await downloadExcel(
    rows,
    headers.map((h, i) => ({ header: h, value: (r: string[]) => r[i] ?? '' })),
    filename,
    'Import',
  );
}
