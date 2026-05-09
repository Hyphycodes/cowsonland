import type { CsvMapping, NormalizedTx } from "./types";

/**
 * Parse a string into ISO YYYY-MM-DD. Handles the formats CSVs commonly
 * arrive in. Returns null on failure — caller decides whether to drop
 * the row or surface an error.
 */
export function parseDate(
  raw: string,
  format: CsvMapping["date_format"] = "auto",
): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO already.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const slashed = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashed) {
    let [, a, b, y] = slashed;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    if (format === "DD/MM/YYYY") {
      return `${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
    return `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }

  // Last-ditch: let Date parse it. Avoid timezone shift by extracting
  // YYYY-MM-DD via UTC.
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Extract a numeric amount from a string. Handles `$`, commas, parens
 * for negatives ("(12.34)" → -12.34), and unicode minus.
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\$,]/g, "").replace(/−/g, "-");
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

/**
 * Apply a column mapping to a CSV row and return a NormalizedTx, or
 * null + error message if the row is unusable.
 *
 * Sign convention enforced: positive = outflow (matches Plaid).
 */
export function normalizeCsvRow(
  row: Record<string, string>,
  mapping: CsvMapping,
  ctx: {
    source: NormalizedTx["source"];
    source_account_id: string | null;
  },
): { ok: true; tx: NormalizedTx } | { ok: false; error: string } {
  const dateStr = row[mapping.date];
  if (dateStr == null) return { ok: false, error: `missing date column "${mapping.date}"` };
  const date = parseDate(dateStr, mapping.date_format);
  if (!date) return { ok: false, error: `unparseable date "${dateStr}"` };

  let amount: number | null = null;
  if (mapping.debit || mapping.credit) {
    const debit = mapping.debit ? parseAmount(row[mapping.debit] ?? "") ?? 0 : 0;
    const credit = mapping.credit ? parseAmount(row[mapping.credit] ?? "") ?? 0 : 0;
    amount = debit - credit;
  } else if (mapping.amount) {
    amount = parseAmount(row[mapping.amount] ?? "");
    if (amount != null && mapping.amount_inverted) amount = -amount;
  }
  if (amount == null) return { ok: false, error: "missing or unparseable amount" };

  const merchant = mapping.merchant
    ? (row[mapping.merchant] ?? "").trim() || null
    : null;
  const description = mapping.description
    ? (row[mapping.description] ?? "").trim() || null
    : null;
  const memo = mapping.memo ? (row[mapping.memo] ?? "").trim() || null : null;
  const reference = mapping.reference
    ? (row[mapping.reference] ?? "").trim() || null
    : null;
  const external_transaction_id = mapping.external_id
    ? (row[mapping.external_id] ?? "").trim() || null
    : reference;
  const sourceCategory = mapping.category
    ? (row[mapping.category] ?? "").trim() || null
    : null;

  return {
    ok: true,
    tx: {
      date,
      amount,
      currency_code: "USD",
      merchant_name: merchant ?? description,
      raw_name: description ?? merchant ?? memo,
      source: ctx.source,
      source_account_id: ctx.source_account_id,
      external_transaction_id,
      raw_payload: { ...row, ...(memo ? { _memo: memo } : {}) },
      plaid_category: sourceCategory,
    },
  };
}
