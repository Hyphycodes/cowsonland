import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InstallmentPayment,
  InstallmentPlan,
  Transaction,
} from "@/types/db";
import { recalculateSchedule } from "./recalculate";

const DAY_MS = 86400000;
const AMOUNT_TOL = 5; // dollars
const DAY_TOL = 7;

type CandidateTx = Pick<
  Transaction,
  "id" | "user_id" | "date" | "amount" | "merchant_name" | "raw_name"
>;

/**
 * Try to link a single Plaid transaction to a scheduled BNPL installment
 * payment. Card-promo plans are excluded — those are paid as part of the
 * card statement and can't be matched to a single transaction.
 *
 * Heuristic: scheduled row's expected_date within ±7 days, expected_amount
 * within ±$5, and the plan's merchant string appears in merchant_name or
 * raw_name (case-insensitive). If exactly one row matches, link it.
 */
export async function tryAutoLinkInstallment(
  admin: SupabaseClient,
  tx: CandidateTx,
): Promise<boolean> {
  if (!tx.amount || tx.amount <= 0) return false;

  const txDate = new Date(tx.date);
  const lo = new Date(txDate.getTime() - DAY_TOL * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const hi = new Date(txDate.getTime() + DAY_TOL * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const { data: candidates } = await admin
    .from("installment_payments")
    .select("*, plan:installment_plans!inner(*)")
    .eq("user_id", tx.user_id)
    .eq("status", "scheduled")
    .gte("expected_date", lo)
    .lte("expected_date", hi)
    .returns<(InstallmentPayment & { plan: InstallmentPlan })[]>();

  if (!candidates || candidates.length === 0) return false;

  const haystack = `${tx.merchant_name ?? ""} ${tx.raw_name ?? ""}`
    .toLowerCase();

  const matches = candidates.filter((c) => {
    if (c.plan.kind !== "bnpl") return false;
    if (c.plan.deleted_at) return false;
    if (Math.abs(c.expected_amount - tx.amount) > AMOUNT_TOL) return false;
    return haystack.includes(c.plan.merchant.toLowerCase());
  });

  if (matches.length !== 1) return false;
  const match = matches[0];

  const status =
    tx.amount > match.expected_amount + 0.005
      ? "overpaid"
      : tx.amount < match.expected_amount - 0.005
        ? "partial"
        : "paid";

  const { error: linkErr } = await admin
    .from("installment_payments")
    .update({
      transaction_id: tx.id,
      actual_date: tx.date,
      actual_amount: tx.amount,
      status,
    })
    .eq("id", match.id);
  if (linkErr) {
    console.error("auto-link update", linkErr);
    return false;
  }

  // Decrement BNPL liability balance.
  if (match.plan.liability_account_id) {
    const { data: liab } = await admin
      .from("accounts")
      .select("current_balance")
      .eq("id", match.plan.liability_account_id)
      .single();
    const newBal = Math.max(
      0,
      Number(liab?.current_balance ?? 0) - tx.amount,
    );
    await admin
      .from("accounts")
      .update({ current_balance: newBal })
      .eq("id", match.plan.liability_account_id);
  }

  // Recompute schedule (drop trailing rows on overpay; extend on partial).
  try {
    await recalculateSchedule(admin, match.plan.id);
  } catch (err) {
    console.error("auto-link recalculate", err);
  }

  return true;
}
