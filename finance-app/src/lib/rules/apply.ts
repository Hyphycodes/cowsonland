import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Category,
  CategorySource,
  Transaction,
  TransactionRule,
} from "@/types/db";
import { ensureTransferCategory } from "@/lib/categories/seed";

export type ApplyResult =
  | { matched: false; source: "manual" | "none" | "plaid_default"; reason?: string }
  | {
      matched: true;
      rule_id: string;
      category_id: string | null;
      source: "rule" | "plaid_default";
    };

type Evaluable = Pick<
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
>;

/**
 * Apply the user's enabled rules to one transaction. First match
 * (lowest priority) wins.
 *
 * Rules:
 *   - Manual categorization is sacred — never overwritten.
 *   - Null fields on a rule are wildcards.
 *   - amount_min/max/exact compare against the absolute amount; sign is
 *     governed by transaction_type ('debit' = amount > 0, 'credit' =
 *     amount < 0, 'any').
 *   - mark_as_transfer wins over set_category_id and routes to the
 *     canonical "Account Transfer" category.
 *   - set_notes only writes if the transaction had no notes.
 *   - Fallback: if no rule matched and the row has a plaid_category,
 *     try to map it case-insensitively to one of the user's category
 *     names and stamp category_source='plaid_default'.
 *
 * Caller must use a service-role (or elevated) client so the per-tx
 * UPDATE and the rule's times_applied bump don't bounce off RLS.
 */
export async function applyRulesToTransaction(
  admin: SupabaseClient,
  txn: Evaluable,
  opts: { rule_id?: string } = {},
): Promise<ApplyResult> {
  if (txn.category_source === "manual") {
    return { matched: false, source: "manual", reason: "manual_lock" };
  }

  const { data: rules, error: ruleErr } = await admin
    .from("transaction_rules")
    .select("*")
    .eq("user_id", txn.user_id)
    .eq("enabled", true)
    .order("priority", { ascending: true })
    .returns<TransactionRule[]>();
  if (ruleErr) throw ruleErr;

  for (const rule of rules ?? []) {
    if (opts.rule_id && rule.id !== opts.rule_id) continue;
    if (!ruleMatches(rule, txn)) continue;

    let categoryId: string | null = rule.set_category_id;
    if (rule.mark_as_transfer) {
      categoryId = await ensureTransferCategory(admin, txn.user_id);
    }

    const update: Record<string, unknown> = {
      category_id: categoryId,
      category_source: "rule" satisfies CategorySource,
      applied_rule_id: rule.id,
    };
    if (rule.set_notes && !txn.notes) update.notes = rule.set_notes;

    const { error: txErr } = await admin
      .from("transactions")
      .update(update)
      .eq("id", txn.id);
    if (txErr) throw txErr;

    await admin
      .from("transaction_rules")
      .update({
        times_applied: rule.times_applied + 1,
        last_applied_at: new Date().toISOString(),
      })
      .eq("id", rule.id);

    return {
      matched: true,
      rule_id: rule.id,
      category_id: categoryId,
      source: "rule",
    };
  }

  // No rule matched — try Plaid category fallback.
  if (txn.plaid_category) {
    const { data: cat } = await admin
      .from("categories")
      .select("id, name")
      .eq("user_id", txn.user_id)
      .ilike("name", txn.plaid_category)
      .maybeSingle<Pick<Category, "id" | "name">>();
    if (cat) {
      const { error: txErr } = await admin
        .from("transactions")
        .update({
          category_id: cat.id,
          category_source: "plaid_default" satisfies CategorySource,
          applied_rule_id: null,
        })
        .eq("id", txn.id);
      if (txErr) throw txErr;
      return {
        matched: true,
        rule_id: "",
        category_id: cat.id,
        source: "plaid_default",
      };
    }
  }

  return { matched: false, source: "none" };
}

export function ruleMatches(rule: TransactionRule, txn: Evaluable): boolean {
  const merchant = (txn.merchant_name ?? "").toLowerCase();
  const rawName = (txn.raw_name ?? "").toLowerCase();
  const absAmount = Math.abs(txn.amount);

  if (rule.merchant_contains) {
    if (!merchant.includes(rule.merchant_contains.toLowerCase())) return false;
  }
  if (rule.raw_name_contains) {
    if (!rawName.includes(rule.raw_name_contains.toLowerCase())) return false;
  }
  if (rule.amount_exact != null) {
    if (Math.abs(absAmount - Math.abs(rule.amount_exact)) > 0.005) return false;
  }
  if (rule.amount_min != null) {
    if (absAmount < rule.amount_min - 0.005) return false;
  }
  if (rule.amount_max != null) {
    if (absAmount > rule.amount_max + 0.005) return false;
  }
  if (rule.account_id) {
    if (txn.account_id !== rule.account_id) return false;
  }
  if (rule.source) {
    if (txn.source !== rule.source) return false;
  }
  if (rule.plaid_category) {
    if ((txn.plaid_category ?? "").toLowerCase() !==
      rule.plaid_category.toLowerCase())
      return false;
  }
  if (rule.transaction_type !== "any") {
    if (rule.transaction_type === "debit" && txn.amount <= 0) return false;
    if (rule.transaction_type === "credit" && txn.amount >= 0) return false;
  }
  return true;
}
