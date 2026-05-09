import type { CsvMapping } from "../types";

/**
 * Apple Card monthly statement CSV. Columns Apple ships:
 *   "Transaction Date", "Clearing Date", "Description", "Merchant",
 *   "Category", "Type", "Amount (USD)", "Purchased By"
 *
 * Sign convention matches Plaid already (positive = charge, negative =
 * payment/credit), so amount_inverted is false.
 */
export const APPLE_CARD_PRESET = {
  id: "apple_card" as const,
  name: "Apple Card statement",
  source: "apple_card" as const,
  signature: [
    "Transaction Date",
    "Description",
    "Merchant",
    "Amount (USD)",
  ],
  mapping: {
    date: "Transaction Date",
    amount: "Amount (USD)",
    amount_inverted: false,
    merchant: "Merchant",
    description: "Description",
    date_format: "auto",
  } satisfies CsvMapping,
};

/**
 * Returns true if the CSV's headers look like an Apple Card export.
 * Used to suggest the preset on the upload screen — never hard-coupled
 * to any single import path.
 */
export function looksLikeAppleCard(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return APPLE_CARD_PRESET.signature.every((s) => set.has(s));
}
