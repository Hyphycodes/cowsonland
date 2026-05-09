import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestSummary, NormalizedTx } from "./types";
import { partitionDuplicates } from "./dedupe";

/**
 * The single chokepoint for putting transactions into the DB. Every
 * source — CSV imports, Apple Card preset, manual entry, future Plaid
 * routing — should call this.
 *
 * Responsibilities:
 *   - dedupe (external_id then fingerprint)
 *   - insert with source/import_batch_id stamped
 *   - return a summary the caller can store on the import_batches row
 *
 * Caller passes a SupabaseClient. For server-side imports use the
 * service-role client so RLS doesn't block when we set user_id
 * explicitly.
 */
export async function ingestTransactions(
  client: SupabaseClient,
  args: {
    user_id: string;
    account_id: string; // our internal accounts.id
    rows: NormalizedTx[];
    import_batch_id?: string | null;
  },
): Promise<IngestSummary> {
  const { fresh, duplicates } = await partitionDuplicates(
    client,
    args.user_id,
    args.rows,
  );

  const summary: IngestSummary = {
    parsed: args.rows.length,
    imported: 0,
    duplicates: duplicates.length,
    errors: 0,
    inserted_ids: [],
  };

  if (fresh.length === 0) return summary;

  const insertRows = fresh.map((r) => ({
    user_id: args.user_id,
    account_id: args.account_id,
    date: r.date,
    amount: r.amount,
    currency_code: r.currency_code,
    merchant_name: r.merchant_name,
    raw_name: r.raw_name,
    plaid_category: r.plaid_category ?? null,
    plaid_category_detailed: r.plaid_category_detailed ?? null,
    plaid_transaction_id:
      r.source === "plaid" ? r.external_transaction_id : null,
    source: r.source,
    source_account_id: r.source_account_id,
    external_transaction_id: r.external_transaction_id,
    import_batch_id: args.import_batch_id ?? null,
    dedupe_fingerprint: r._fingerprint,
    raw_payload: r.raw_payload,
    pending: false,
  }));

  const { data, error } = await client
    .from("transactions")
    .insert(insertRows)
    .select("id");

  if (error) {
    // The unique partial index on external_transaction_id can race with
    // a concurrent import. Fall back to per-row insert so one collision
    // doesn't kill the batch.
    let imported = 0;
    const ids: string[] = [];
    let errors = 0;
    for (const row of insertRows) {
      const single = await client
        .from("transactions")
        .insert(row)
        .select("id")
        .single();
      if (single.error) {
        if ((single.error.code ?? "") === "23505") {
          summary.duplicates += 1;
        } else {
          errors += 1;
        }
      } else if (single.data) {
        imported += 1;
        ids.push(single.data.id);
      }
    }
    summary.imported = imported;
    summary.inserted_ids = ids;
    summary.errors = errors;
    return summary;
  }

  summary.imported = data?.length ?? 0;
  summary.inserted_ids = (data ?? []).map((r) => r.id);

  // TODO(phase: rules engine): pipe summary.inserted_ids into the rules
  // engine here so newly-imported rows can be auto-categorized and
  // routed to the review queue. Keep this function side-effect-free
  // beyond inserting transactions until then.

  return summary;
}
