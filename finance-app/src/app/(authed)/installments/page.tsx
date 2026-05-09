import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/installments/schedule";
import { fmtDate, fmtUsd } from "@/lib/installments/format";
import type {
  InstallmentPayment,
  InstallmentPlan,
} from "@/types/db";

export const dynamic = "force-dynamic";

type Tab = "active" | "paid_off" | "all";

function parseTab(v: string | undefined): Tab {
  if (v === "paid_off" || v === "all") return v;
  return "active";
}

export default async function InstallmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; show_deleted?: string }>;
}) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const showDeleted = sp.show_deleted === "1";

  const supabase = await createClient();

  // All-time stats are computed across every plan ever (excluding soft-deleted
  // unless the toggle is on).
  let allQuery = supabase.from("installment_plans").select("*");
  if (!showDeleted) allQuery = allQuery.is("deleted_at", null);
  const { data: allPlans } = await allQuery
    .order("created_at", { ascending: false })
    .returns<InstallmentPlan[]>();

  const ids = (allPlans ?? []).map((p) => p.id);
  const { data: payments } = ids.length
    ? await supabase
        .from("installment_payments")
        .select("*")
        .in("plan_id", ids)
        .returns<InstallmentPayment[]>()
    : { data: [] as InstallmentPayment[] };

  const paymentsByPlan = new Map<string, InstallmentPayment[]>();
  for (const pay of payments ?? []) {
    const list = paymentsByPlan.get(pay.plan_id) ?? [];
    list.push(pay);
    paymentsByPlan.set(pay.plan_id, list);
  }

  const enriched = (allPlans ?? []).map((p) => ({
    plan: p,
    progress: computeProgress(p, paymentsByPlan.get(p.id) ?? []),
  }));

  // Tab filter
  const visible = enriched.filter(({ plan }) => {
    if (tab === "active") return plan.status === "active";
    if (tab === "paid_off") return plan.status === "paid_off";
    return true;
  });

  // Stats
  const totalPlans = enriched.length;
  const totalFinanced = enriched.reduce(
    (s, { plan }) => s + Number(plan.total_amount),
    0,
  );
  const totalPaid = enriched.reduce(
    (s, { progress }) => s + progress.paid_to_date,
    0,
  );
  const outstanding = enriched
    .filter(({ plan }) => plan.status === "active")
    .reduce((s, { progress }) => s + progress.remaining_balance, 0);
  const avgPlan = totalPlans ? totalFinanced / totalPlans : 0;
  const merchantCounts = new Map<string, number>();
  for (const { plan } of enriched) {
    merchantCounts.set(
      plan.merchant,
      (merchantCounts.get(plan.merchant) ?? 0) + 1,
    );
  }
  const topMerchant = Array.from(merchantCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Installments</h1>
        <Link
          href="/installments/new"
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          + New plan
        </Link>
      </div>

      {/* Stats header */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
        <Stat label="Plans ever" value={String(totalPlans)} />
        <Stat label="Financed" value={fmtUsd(totalFinanced)} />
        <Stat label="Paid off" value={fmtUsd(totalPaid)} />
        <Stat label="Outstanding" value={fmtUsd(outstanding)} />
        <Stat label="Avg plan" value={fmtUsd(avgPlan)} />
        <Stat
          label="Top merchant"
          value={
            topMerchant ? `${topMerchant[0]} (${topMerchant[1]})` : "—"
          }
        />
      </section>

      {/* Tabs */}
      <nav className="flex gap-6 text-sm border-b border-zinc-200 dark:border-zinc-800">
        <TabLink current={tab} value="active">
          Active
        </TabLink>
        <TabLink current={tab} value="paid_off">
          Paid off
        </TabLink>
        <TabLink current={tab} value="all">
          All time
        </TabLink>
        <Link
          href="/installments/history"
          className="ml-auto text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 pb-2"
        >
          History →
        </Link>
        <Link
          href="/installments/insights"
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 pb-2"
        >
          Insights →
        </Link>
      </nav>

      {tab === "all" && (
        <p className="text-xs text-zinc-500">
          <Link
            href={`/installments?tab=all&show_deleted=${showDeleted ? "0" : "1"}`}
            className="underline"
          >
            {showDeleted ? "Hide deleted" : "Show deleted"}
          </Link>
        </p>
      )}

      {/* Plan rows */}
      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No plans in this view.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
          {visible.map(({ plan, progress }) => {
            const pct = plan.total_amount
              ? Math.min(
                  100,
                  Math.round((progress.paid_to_date / plan.total_amount) * 100),
                )
              : 0;
            const badge = plan.deleted_at
              ? { label: "Deleted", cls: "text-zinc-400" }
              : plan.status === "paid_off"
                ? { label: "Paid off", cls: "text-emerald-600" }
                : !progress.on_track
                  ? { label: "Behind", cls: "text-amber-600" }
                  : { label: "On track", cls: "text-emerald-600" };
            return (
              <li key={plan.id}>
                <Link
                  href={`/installments/${plan.id}`}
                  className="block px-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {plan.name}
                        <span className="text-zinc-500 font-normal">
                          {" "}
                          · {plan.merchant}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {fmtUsd(plan.total_amount)} ·{" "}
                        {plan.term_months}mo ·{" "}
                        {plan.kind === "bnpl" ? "BNPL" : "Card promo"} ·{" "}
                        Next {fmtDate(progress.next_due_date)}
                      </p>
                    </div>
                    <p className={`text-xs ${badge.cls}`}>{badge.label}</p>
                  </div>
                  <div className="mt-2 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 font-mono tabular-nums">
                    {fmtUsd(progress.paid_to_date)} /{" "}
                    {fmtUsd(plan.total_amount)} ({pct}%)
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
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

function TabLink({
  current,
  value,
  children,
}: {
  current: Tab;
  value: Tab;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <Link
      href={`/installments?tab=${value}`}
      className={`pb-2 -mb-px border-b-2 ${
        active
          ? "border-zinc-900 dark:border-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}
