import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/installments/schedule";
import { fmtDate, fmtUsd } from "@/lib/installments/format";
import type {
  Account,
  Category,
  InstallmentPayment,
  InstallmentPlan,
  Transaction,
} from "@/types/db";
import SpendingMode from "./spending-mode";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type SpendingRow = {
  id: string;
  date: string;
  amount: number;
  merchant_name: string | null;
  source_kind: "transaction" | "installment_purchase";
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const sp = await searchParams;
  const mode = sp.mode === "cash_flow" ? "cash_flow" : "decision";

  const supabase = await createClient();

  const [
    { data: accounts },
    { data: transactions },
    { data: plans },
    { data: payments },
    { data: spendingRows },
    { data: categories },
    { count: reviewCount },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<Account[]>(),
    supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .limit(20)
      .returns<Transaction[]>(),
    supabase
      .from("installment_plans")
      .select("*")
      .is("deleted_at", null)
      .eq("status", "active")
      .returns<InstallmentPlan[]>(),
    supabase
      .from("installment_payments")
      .select("*")
      .returns<InstallmentPayment[]>(),
    supabase
      .from("spending_with_installments")
      .select("id, date, amount, merchant_name, source_kind")
      .order("date", { ascending: false })
      .limit(20)
      .returns<SpendingRow[]>(),
    supabase
      .from("categories")
      .select("*")
      .returns<Category[]>(),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .in("category_source", ["none", "plaid_default"]),
  ]);

  const catById = new Map<string, Category>();
  for (const c of categories ?? []) catById.set(c.id, c);

  // Net worth.
  // - Credit-card balances (type='credit') count as negative.
  // - manual_liability accounts also count as negative — they ARE debts.
  // - Everything else (depository, investment) counts as positive.
  // We do NOT subtract installment plan totals separately: BNPL plans are
  // already represented by their manual_liability account, and card-promo
  // plans are already part of the credit card balance.
  const netWorth = (accounts ?? []).reduce((sum, a) => {
    const bal = a.current_balance ?? 0;
    const isLiability =
      a.type === "credit" || a.source === "manual_liability";
    return sum + bal * (isLiability ? -1 : 1);
  }, 0);

  // Card-promo reminders: any active card_promo plan with a scheduled
  // payment within the next 3 days.
  const today = new Date();
  const threeDaysIso = new Date(today.getTime() + 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const upcomingCardPromos: { plan: InstallmentPlan; due: string }[] = [];
  for (const p of plans ?? []) {
    if (p.kind !== "card_promo") continue;
    const next = (payments ?? [])
      .filter((x) => x.plan_id === p.id && x.status === "scheduled")
      .sort((a, b) => a.expected_date.localeCompare(b.expected_date))[0];
    if (next && next.expected_date >= todayIso && next.expected_date <= threeDaysIso) {
      upcomingCardPromos.push({ plan: p, due: next.expected_date });
    }
  }

  // Future net worth: 12-month projection.
  // For now: each month subtract scheduled installment payments (cash out)
  // and add back the corresponding liability decrease (debt down). For
  // 0% APR plans these cancel exactly, so the line sits flat. The
  // interesting variation kicks in once we model income / non-installment
  // recurring spending — TODO.
  const projection: { month: string; value: number }[] = [];
  const startOfThisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    1,
  );
  for (let i = 0; i <= 12; i++) {
    const monthStart = new Date(
      startOfThisMonth.getFullYear(),
      startOfThisMonth.getMonth() + i,
      1,
    );
    const monthEnd = new Date(
      startOfThisMonth.getFullYear(),
      startOfThisMonth.getMonth() + i + 1,
      1,
    );
    const monthEndIso = monthEnd.toISOString().slice(0, 10);
    // Sum scheduled payments up to monthEnd. With current model, net
    // effect on net worth = 0 per dollar paid (cash − liability), so the
    // projected value equals current netWorth. Keep the calc explicit so
    // it's easy to swap in interest later.
    const scheduledPaid = (payments ?? [])
      .filter(
        (p) => p.status === "scheduled" && p.expected_date <= monthEndIso,
      )
      .reduce((s, p) => s + p.expected_amount, 0);
    const cashOut = scheduledPaid;
    const liabilityDown = scheduledPaid;
    projection.push({
      month: monthStart.toISOString().slice(0, 7),
      value: netWorth - cashOut + liabilityDown,
    });
  }

  // Each plan's quick line under the chart.
  const planLines = (plans ?? []).map((p) => {
    const prog = computeProgress(
      p,
      (payments ?? []).filter((x) => x.plan_id === p.id),
    );
    return { plan: p, progress: prog };
  });

  // Cash-flow mode shows raw transactions (transfers included so they
  // remain visible in history) but the spending view excludes transfers
  // for decision-mode aggregates.
  const recent =
    mode === "cash_flow"
      ? (transactions ?? []).map((t) => ({
          id: t.id,
          date: t.date,
          amount: t.amount,
          merchant_name: t.merchant_name ?? t.raw_name,
          source_kind: "transaction" as const,
          plaid_category: t.plaid_category,
          category_id: t.category_id,
          category_source: t.category_source,
        }))
      : (spendingRows ?? []).map((r) => ({
          id: r.id,
          date: r.date,
          amount: r.amount,
          merchant_name: r.merchant_name,
          source_kind: r.source_kind,
          plaid_category: null as string | null,
          category_id: null as string | null,
          category_source: "none" as const,
        }));

  return (
    <div className="space-y-10">
      {/* Review queue prompt */}
      {(reviewCount ?? 0) > 0 && (
        <section className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 text-sm flex items-center justify-between">
          <p>
            <strong>{reviewCount}</strong>{" "}
            {reviewCount === 1 ? "transaction" : "transactions"} waiting in
            the review queue.
          </p>
          <Link href="/review" className="text-xs underline">
            Review →
          </Link>
        </section>
      )}

      {/* Card-promo reminders */}
      {upcomingCardPromos.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 text-sm space-y-1">
          <p className="font-medium">Mark these card-promo payments paid:</p>
          {upcomingCardPromos.map(({ plan, due }) => (
            <p key={plan.id}>
              {plan.name} ({plan.merchant}) — due {fmtDate(due)}.{" "}
              <Link
                href={`/installments/${plan.id}`}
                className="underline"
              >
                Open plan
              </Link>
            </p>
          ))}
        </section>
      )}

      {/* Net worth tile */}
      <section>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Net worth
        </p>
        <p className="mt-1 text-4xl font-mono tabular-nums">{fmt(netWorth)}</p>
      </section>

      {/* Future net worth */}
      {projection.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
            Future net worth (12mo)
          </h2>
          <FutureChart points={projection} />
          {planLines.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {planLines.map(({ plan, progress }) => (
                <li key={plan.id} className="font-mono tabular-nums">
                  {plan.name} @ {plan.merchant} —{" "}
                  {fmtUsd(progress.remaining_balance)} remaining, projected
                  payoff{" "}
                  {progress.payoff_projected_date
                    ? fmtDate(progress.payoff_projected_date)
                    : "—"}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Accounts */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Accounts
          </h2>
          <Link
            href="/connect"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            + Connect bank
          </Link>
        </div>

        {accounts && accounts.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-zinc-500">
                    {a.source === "manual_liability"
                      ? "installment liability"
                      : a.type ?? "—"}
                    {a.mask ? ` ···· ${a.mask}` : ""}
                  </p>
                </div>
                <p className="font-mono tabular-nums">
                  {fmt(a.current_balance)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No accounts yet.{" "}
            <Link href="/connect" className="underline">
              Connect a bank
            </Link>{" "}
            to get started.
          </p>
        )}
      </section>

      {/* Spending */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Spending by purchase decision
          </h2>
          <SpendingMode current={mode} />
        </div>
        {recent.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {recent.map((t) => {
              const cat = t.category_id ? catById.get(t.category_id) : null;
              const isTransfer = cat?.type === "transfer";
              return (
                <li
                  key={t.id}
                  className="px-4 py-3 flex items-center justify-between text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {t.merchant_name ?? "Unknown"}
                      {t.source_kind === "installment_purchase" && (
                        <span className="ml-2 text-xs text-zinc-500">
                          installment
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                      <span>{t.date}</span>
                      {cat ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: cat.color
                              ? `${cat.color}22`
                              : undefined,
                            color: cat.color ?? undefined,
                          }}
                        >
                          {cat.icon}
                          {cat.name}
                          {isTransfer && " · transfer"}
                        </span>
                      ) : (
                        <Link
                          href="/review"
                          className="rounded-full px-2 py-0.5 text-[10px] border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                        >
                          uncategorized
                        </Link>
                      )}
                    </p>
                  </div>
                  <p
                    className={`font-mono tabular-nums ${
                      isTransfer
                        ? "text-zinc-400"
                        : t.amount < 0
                          ? "text-emerald-600"
                          : ""
                    }`}
                  >
                    {fmt(t.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No transactions yet. Connect a bank to pull data.
          </p>
        )}
      </section>
    </div>
  );
}

function FutureChart({
  points,
}: {
  points: { month: string; value: number }[];
}) {
  const w = 600;
  const h = 80;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const range = max - min || 1;
  const stepX = w / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = h - ((p.value - min) / range) * (h - 6) - 3;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-24"
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        className="stroke-zinc-700 dark:stroke-zinc-300"
      />
    </svg>
  );
}
