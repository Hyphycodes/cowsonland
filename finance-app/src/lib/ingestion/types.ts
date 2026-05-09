import type { TransactionSource } from "@/types/db";

/**
 * One transaction in the canonical shape every source must produce.
 *
 * Sign convention: amount > 0 = outflow (charge / debit), amount < 0 =
 * inflow (refund / credit / deposit). This matches Plaid.
 */
export type NormalizedTx = {
  date: string; // YYYY-MM-DD
  amount: number;
  currency_code: string;
  merchant_name: string | null;
  raw_name: string | null;
  source: TransactionSource;
  /** Source-system account id (string token, NOT our accounts.id). */
  source_account_id: string | null;
  /** Source-system transaction id (Plaid id, Apple Card row id, etc). */
  external_transaction_id: string | null;
  /** Original row keyed by source's own column names — for debugging. */
  raw_payload: Record<string, unknown> | null;
  /** Optional category strings from the source. */
  plaid_category?: string | null;
  plaid_category_detailed?: string | null;
};

export type IngestSummary = {
  parsed: number;
  imported: number;
  duplicates: number;
  errors: number;
  inserted_ids: string[];
  /** Set by post-ingest rule pass; absent if no inserts happened. */
  rules_matched?: number;
};

/**
 * Column mapping a user (or preset) supplies for a generic CSV import.
 *
 * Either `amount` is set (single signed column) OR both `debit` and
 * `credit` are set (split columns; debit > 0 = outflow, credit > 0 =
 * inflow). `amount_inverted` flips the sign of a single-column amount.
 */
export type CsvMapping = {
  date: string;
  amount?: string;
  amount_inverted?: boolean;
  debit?: string;
  credit?: string;
  merchant?: string;
  description?: string;
  external_id?: string;
  date_format?: "auto" | "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
};
