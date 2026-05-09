/**
 * Tiny RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes
 * (""), commas inside quotes, and \n / \r\n row separators. No deps.
 *
 * Intentionally minimal: rejects nothing. Callers decide what to do
 * with malformed rows downstream (during normalization).
 */
export function parseCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const cells = parseRows(text.replace(/^﻿/, ""));
  if (cells.length === 0) return { headers: [], rows: [] };
  const headers = cells[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < cells.length; i++) {
    const row = cells[i];
    if (row.length === 1 && row[0] === "") continue; // blank line
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? "";
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function parseRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      // Treat \r\n as a single break.
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  // trailing cell/row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out;
}
