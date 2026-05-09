import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction } from "@/types/db";
import { applyRulesToTransaction } from "./apply";

const BATCH_SIZE = 200;

export type BulkResult = {
  scanned: number;
  matched: number;
  skipped_manual: number;
  errors: number;
};

/**
 * Re-evaluate rules across the user's transactions. Manual-categorized
 * rows are always preserved (the apply function bails on them).
 *
 * Filters:
 *   - only_uncategorized: skip rows that already have a category
 *   - rule_id: only apply this single rule (lets the rules page test a
 *     newly-saved rule without disturbing other categorizations)
 */
export async function reapplyRules(
  admin: SupabaseClient,
  args: {
    user_id: string;
    only_uncategorized?: boolean;
    rule_id?: string;
  },
): Promise<BulkResult> {
  const result: BulkResult = {
    scanned: 0,
    matched: 0,
    skipped_manual: 0,
    errors: 0,
  };

  let from = 0;
  while (true) {
    let q = admin
      .from("transactions")
      .select(
        "id, user_id, amount, merchant_name, raw_name, account_id, source, plaid_category, category_id, category_source, notes",
      )
      .eq("user_id", args.user_id)
      .order("date", { ascending: false })
      .range(from, from + BATCH_SIZE - 1);
    if (args.only_uncategorized) {
      q = q.in("category_source", ["none", "plaid_default"]);
    }
    const { data, error } = await q.returns<
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
    if (error) throw error;
    if (!data?.length) break;

    for (const tx of data) {
      result.scanned += 1;
      if (tx.category_source === "manual") {
        result.skipped_manual += 1;
        continue;
      }
      try {
        const r = await applyRulesToTransaction(admin, tx);
        if (r.matched && r.source === "rule") {
          if (!args.rule_id || ("rule_id" in r && r.rule_id === args.rule_id)) {
            result.matched += 1;
          }
        }
      } catch (err) {
        console.error("reapply rule error", err);
        result.errors += 1;
      }
    }

    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return result;
}
