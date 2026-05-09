import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/installments/schedule";
import { fmtDate, fmtMonth, fmtUsd } from "@/lib/installments/format";
import type {
  InstallmentPayment,
  InstallmentPlan,
} from "@/types/db";
import DetailActions from "./actions";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("installment_plans")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single<InstallmentPlan>();
  if (!plan) notFound();

  const { data: paysRaw } = await supabase
    .from("installment_payments")
    .select("*")
    .eq("plan_id", id)
    .order("expected_date", { ascending: true })
    .returns<InstallmentPayment[]>();
  const payments = paysRaw ?? [];
  const progress = computeProgress(plan, payments);

  // "Originally X → now Y" projection.
  const originalEnd = (() => {
    const last = payments[payments.length - 1];
    return last?.expected_date ?? null;
  })();

  const promoBreach =
    plan.promo_end_date &&
    progress.payoff_projected_date &&
    progress.payoff_projected_date > plan.promo_end_date;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/installments"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Installments
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">
          {plan.name}{" "}
          <span className="text-zinc-500 font-normal">· {plan.merchant}</span>
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          {plan.kind === "bnpl" ? "BNPL" : "Card promo"} ·{" "}
          {plan.term_months}mo · {fmtUsd(plan.monthly_minimum)}/mo · APR{" "}
          {plan.apr}%
        </p>
      </div>

      {promoBreach && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 text-sm">
          Heads up — at your current pace, projected payoff is{" "}
          {fmtMonth(progress.payoff_projected_date)} but the promo ends{" "}
          {fmtMonth(plan.promo_end_date)}. Deferred interest may apply.
        </div>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <Stat label="Total" value={fmtUsd(plan.total_amount)} />
        <Stat label="Paid" value={fmtUsd(progress.paid_to_date)} />
        <Stat label="Remaining" value={fmtUsd(progress.remaining_balance)} />
        <Stat label="Next due" value={fmtDate(progress.next_due_date)} />
      </section>

      {originalEnd && progress.payoff_projected_date && (
        <p className="text-sm text-zinc-500">
          Originally <strong>{fmtMonth(originalEnd)}</strong> → now{" "}
          <strong>{fmtMonth(progress.payoff_projected_date)}</strong>
        </p>
      )}

      <DetailActions
        planId={plan.id}
        kind={plan.kind}
        monthlyMinimum={plan.monthly_minimum}
        remaining={progress.remaining_balance}
        nextDue={progress.next_due_date}
      />

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
          Payment history
        </h2>
        {payments.filter((p) => p.status !== "scheduled").length === 0 ? (
          <p className="text-sm text-zinc-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {payments
              .filter((p) => p.status !== "scheduled")
              .map((p) => (
                <li
                  key={p.id}
                  className="px-4 py-3 flex items-center justify-between text-sm"
                >
                  <div>
                    <p>
                      {fmtDate(p.actual_date ?? p.expected_date)}{" "}
                      <span className="text-zinc-500">· {p.status}</span>
                    </p>
                    {p.transaction_id && (
                      <p className="text-xs text-zinc-500">
                        linked to transaction
                      </p>
                    )}
                  </div>
                  <p className="font-mono tabular-nums">
                    {fmtUsd(p.actual_amount ?? p.expected_amount)}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
          Upcoming
        </h2>
        {payments.filter((p) => p.status === "scheduled").length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing scheduled.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {payments
              .filter((p) => p.status === "scheduled")
              .map((p) => (
                <li
                  key={p.id}
                  className="px-4 py-3 flex items-center justify-between text-sm"
                >
                  <span>{fmtDate(p.expected_date)}</span>
                  <span className="font-mono tabular-nums">
                    {fmtUsd(p.expected_amount)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="font-mono tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
