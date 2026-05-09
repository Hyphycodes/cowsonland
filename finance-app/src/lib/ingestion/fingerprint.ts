import { createHash } from "node:crypto";

/**
 * Deterministic fingerprint of a normalized transaction. Used as the
 * fallback dedupe key when a source doesn't supply a stable
 * external_transaction_id (CSV, manual entries).
 *
 * Inputs are normalized so cosmetic differences across imports don't
 * spoof a unique row:
 *   - merchant lowercased + stripped to alphanumerics
 *   - amount converted to integer cents (avoids float drift)
 *   - account_id is the source's account token, NOT our accounts.id —
 *     a CSV row from "chase 1234" should not collide with a Plaid row
 *     from a different account that happens to match amount/date.
 *
 * Kept deterministic and tolerance-free for v1. Future improvements
 * (Levenshtein on merchant, ±1 day window) plug in here.
 */
export function fingerprint(parts: {
  user_id: string;
  source: string;
  source_account_id: string | null;
  date: string;
  amount: number;
  merchant: string | null;
}): string {
  const cleanedMerchant = (parts.merchant ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const cents = Math.round(parts.amount * 100);
  const account = parts.source_account_id ?? "";
  const payload = [
    parts.user_id,
    parts.source,
    account,
    parts.date,
    String(cents),
    cleanedMerchant,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
