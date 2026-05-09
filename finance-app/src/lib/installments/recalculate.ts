import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InstallmentPayment,
  InstallmentPlan,
} from "@/types/db";
import { addMonths } from "./schedule";

/**
 * Recompute the future ('scheduled') portion of a plan's schedule given
 * the actual payments to date.
 *
 * Rule (per spec, option a): keep monthly_minimum constant, drop
 * trailing payment rows when overpaid. If underpaid (a 'partial' row),
 * keep the same monthly_minimum and tack on additional rows until the
 * remaining balance is covered.
 *
 * Marks the plan paid_off when remaining balance hits zero.
 *
 * Caller MUST be the service-role client OR an authenticated user
 * client whose RLS allows write to these tables.
 */
export async function recalculateSchedule(
  client: SupabaseClient,
  planId: string,
): Promise<{ remaining_balance: number; rows_after: number }> {
  const { data: plan, error: planErr } = await client
    .from("installment_plans")
    .select("*")
    .eq("id", planId)
    .single<InstallmentPlan>();
  if (planErr || !plan) throw planErr ?? new Error("plan not found");

  const { data: payments, error: payErr } = await client
    .from("installment_payments")
    .select("*")
    .eq("plan_id", planId)
    .returns<InstallmentPayment[]>();
  if (payErr) throw payErr;

  const settled = (payments ?? []).filter((p) =>
    ["paid", "partial", "overpaid"].includes(p.status),
  );
  const paidToDate = settled.reduce(
    (s, p) => s + (p.actual_amount ?? 0),
    0,
  );
  const remaining = Math.max(0, plan.total_amount - paidToDate);

  // Wipe any existing 'scheduled' rows; we'll regenerate.
  const { error: delErr } = await client
    .from("installment_payments")
    .delete()
    .eq("plan_id", planId)
    .eq("status", "scheduled");
  if (delErr) throw delErr;

  if (remaining <= 0) {
    // Done. Mark the plan paid_off.
    await client
      .from("installment_plans")
      .update({
        status: "paid_off",
        paid_off_at: new Date().toISOString(),
      })
      .eq("id", planId);
    return { remaining_balance: 0, rows_after: 0 };
  }

  const minimum = plan.monthly_minimum;
  if (minimum <= 0) {
    // Avoid infinite loop on bad data.
    return { remaining_balance: remaining, rows_after: 0 };
  }

  // Anchor the new schedule at last paid date + 1mo, or today if no
  // payments yet.
  const lastPaid = settled
    .map((p) => p.actual_date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const anchor = lastPaid ?? new Date().toISOString().slice(0, 10);

  const rowsNeeded = Math.ceil(remaining / minimum);
  const newRows: Pick<
    InstallmentPayment,
    "user_id" | "plan_id" | "expected_date" | "expected_amount" | "status"
  >[] = [];
  for (let i = 1; i <= rowsNeeded; i++) {
    newRows.push({
      user_id: plan.user_id,
      plan_id: plan.id,
      expected_date: addMonths(anchor, i),
      // Last row absorbs the rounding remainder.
      expected_amount:
        i === rowsNeeded ? remaining - minimum * (rowsNeeded - 1) : minimum,
      status: "scheduled",
    });
  }
  if (newRows.length) {
    const { error: insErr } = await client
      .from("installment_payments")
      .insert(newRows);
    if (insErr) throw insErr;
  }

  return { remaining_balance: remaining, rows_after: newRows.length };
}
