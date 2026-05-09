import type {
  InstallmentPayment,
  InstallmentPlan,
} from "@/types/db";

export type PlanProgress = {
  paid_to_date: number;
  remaining_balance: number;
  next_due_date: string | null;
  on_track: boolean;
  payoff_projected_date: string | null;
};

/**
 * Add `months` to an ISO date (YYYY-MM-DD), normalizing month-end.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  // If the day rolled forward (e.g. Jan 31 + 1mo), pin to last day of the
  // intended month.
  if (date.getUTCMonth() !== ((m - 1 + months) % 12 + 12) % 12) {
    date.setUTCDate(0);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Generate the initial schedule for a brand-new plan: term_months rows,
 * each at monthly_minimum, stepping monthly from purchase_date.
 *
 * Linear paydown only — APR ignored for now (TODO real amortization).
 */
export function generateSchedule(
  plan: Pick<
    InstallmentPlan,
    "purchase_date" | "term_months" | "monthly_minimum"
  >,
): { expected_date: string; expected_amount: number }[] {
  const rows: { expected_date: string; expected_amount: number }[] = [];
  for (let i = 1; i <= plan.term_months; i++) {
    rows.push({
      expected_date: addMonths(plan.purchase_date, i),
      expected_amount: plan.monthly_minimum,
    });
  }
  return rows;
}

/**
 * Given existing payments and a plan, compute progress numbers used by
 * the list/detail UI.
 *
 * "on_track" = behind by less than one full cycle as of today. We're
 * behind if more scheduled rows have an expected_date <= today than
 * we've actually paid for.
 */
export function computeProgress(
  plan: InstallmentPlan,
  payments: InstallmentPayment[],
  today = new Date(),
): PlanProgress {
  const todayIso = today.toISOString().slice(0, 10);

  const settled = payments.filter((p) =>
    ["paid", "partial", "overpaid"].includes(p.status),
  );
  const paid_to_date = settled.reduce(
    (s, p) => s + (p.actual_amount ?? 0),
    0,
  );
  const remaining_balance = Math.max(0, plan.total_amount - paid_to_date);

  const upcoming = payments
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => a.expected_date.localeCompare(b.expected_date));
  const next_due_date = upcoming[0]?.expected_date ?? null;

  // Behind = scheduled rows whose expected_date is in the past.
  const overdue = payments.filter(
    (p) => p.status === "scheduled" && p.expected_date < todayIso,
  );
  const on_track = overdue.length === 0;

  // Projected payoff = today + (remaining / monthly_minimum) months.
  const monthsLeft =
    plan.monthly_minimum > 0
      ? Math.ceil(remaining_balance / plan.monthly_minimum)
      : null;
  const payoff_projected_date =
    remaining_balance <= 0
      ? plan.paid_off_at?.slice(0, 10) ?? todayIso
      : monthsLeft != null
        ? addMonths(todayIso, monthsLeft)
        : null;

  return {
    paid_to_date,
    remaining_balance,
    next_due_date,
    on_track,
    payoff_projected_date,
  };
}
