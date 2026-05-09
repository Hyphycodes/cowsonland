import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestSummary, NormalizedTx } from "./types";
import { partitionDuplicates } from "./dedupe";
import { applyRulesToTransaction } from "@/lib/rules/apply";
import type { Transaction } from "@/types/db";

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
    await runRulesOnInserted(client, summary.inserted_ids, summary);
    return summary;
  }

  summary.imported = data?.length ?? 0;
  summary.inserted_ids = (data ?? []).map((r) => r.id);

  await runRulesOnInserted(client, summary.inserted_ids, summary);

  return summary;
}

/**
 * Re-fetch the freshly inserted rows and run the rules engine on each.
 * Failures here must not roll back the insert — categorization can be
 * retried via /api/rules/apply later.
 */
async function runRulesOnInserted(
  admin: SupabaseClient,
  ids: string[],
  summary: IngestSummary,
): Promise<void> {
  if (ids.length === 0) return;
  const { data: rows, error } = await admin
    .from("transactions")
    .select(
      "id, user_id, amount, merchant_name, raw_name, account_id, source, plaid_category, category_id, category_source, notes",
    )
    .in("id", ids)
    .returns<
      Pick<
        Transaction,
        | "id"
        | "user_id"
        | "amount"
        | "merchant_name"
        | "raw_name"
        | "account_id"
        | "source"
        | "plaid_category"
        | "category_id"
        | "category_source"
        | "notes"
      >[]
    >();
  if (error || !rows) return;

  let matched = 0;
  for (const tx of rows) {
    try {
      const r = await applyRulesToTransaction(admin, tx);
      if (r.matched) matched += 1;
    } catch (err) {
      console.error("post-ingest rule apply", err);
      summary.errors += 1;
    }
  }
  // Stash on the summary for callers that want it; not part of the
  // type contract so opt-in only.
  (summary as unknown as Record<string, number>).rules_matched = matched;
}
