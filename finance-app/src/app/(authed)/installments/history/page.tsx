import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMonth, fmtUsd } from "@/lib/installments/format";
import type { InstallmentPlan } from "@/types/db";

export const dynamic = "force-dynamic";

type Event = {
  date: string;
  kind: "opened" | "paid_off" | "deleted";
  plan: InstallmentPlan;
};

export default async function InstallmentsHistoryPage() {
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from("installment_plans")
    .select("*")
    .returns<InstallmentPlan[]>();

  const events: Event[] = [];
  for (const p of plans ?? []) {
    events.push({ date: p.purchase_date, kind: "opened", plan: p });
    if (p.paid_off_at)
      events.push({
        date: p.paid_off_at.slice(0, 10),
        kind: "paid_off",
        plan: p,
      });
    if (p.deleted_at)
      events.push({
        date: p.deleted_at.slice(0, 10),
        kind: "deleted",
        plan: p,
      });
  }
  events.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/installments"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Installments
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">History</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Every plan ever opened, paid off, or deleted.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">No history yet.</p>
      ) : (
        <ol className="border-l border-zinc-200 dark:border-zinc-800 ml-3 space-y-5">
          {events.map((e, i) => (
            <li key={i} className="pl-5 relative">
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-600" />
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {fmtMonth(e.date)}
              </p>
              <p className="text-sm mt-0.5">
                {e.kind === "opened" && (
                  <>
                    Opened {fmtUsd(e.plan.total_amount)}{" "}
                    <strong>{e.plan.merchant}</strong> plan for {e.plan.name} (
                    {e.plan.term_months}mo)
                  </>
                )}
                {e.kind === "paid_off" && (
                  <>
                    Paid off <strong>{e.plan.merchant}</strong> {e.plan.name} (
                    {fmtUsd(e.plan.total_amount)} over{" "}
                    {e.plan.term_months} months)
                  </>
                )}
                {e.kind === "deleted" && (
                  <>
                    Deleted <strong>{e.plan.merchant}</strong> {e.plan.name}{" "}
                    plan
                  </>
                )}
              </p>
              <Link
                href={`/installments/${e.plan.id}`}
                className="text-xs text-zinc-500 underline"
              >
                View →
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
