import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtMonth, fmtUsd } from "@/lib/installments/format";
import type { InstallmentPlan } from "@/types/db";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86400000;

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("installment_plans")
    .select("*")
    .is("deleted_at", null)
    .returns<InstallmentPlan[]>();

  const all = plans ?? [];
  const today = new Date();
  const yearAgo = new Date(today.getTime() - 365 * MS_PER_DAY);
  const twoYearsAgo = new Date(today.getTime() - 730 * MS_PER_DAY);
  const yearAgoIso = yearAgo.toISOString().slice(0, 10);
  const twoYearsAgoIso = twoYearsAgo.toISOString().slice(0, 10);

  const last12 = all.filter((p) => p.purchase_date >= yearAgoIso);
  const prior12 = all.filter(
    (p) =>
      p.purchase_date >= twoYearsAgoIso && p.purchase_date < yearAgoIso,
  );

  const last12Sum = last12.reduce((s, p) => s + Number(p.total_amount), 0);
  const prior12Sum = prior12.reduce((s, p) => s + Number(p.total_amount), 0);

  const avgSize = all.length
    ? all.reduce((s, p) => s + Number(p.total_amount), 0) / all.length
    : 0;
  const avgTerm = all.length
    ? all.reduce((s, p) => s + p.term_months, 0) / all.length
    : 0;

  const merchantCounts = new Map<string, number>();
  for (const p of all)
    merchantCounts.set(p.merchant, (merchantCounts.get(p.merchant) ?? 0) + 1);
  const topMerchant = Array.from(merchantCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];

  const trend =
    prior12Sum === 0
      ? last12Sum > 0
        ? "up"
        : "flat"
      : last12Sum > prior12Sum * 1.1
        ? "up"
        : last12Sum < prior12Sum * 0.9
          ? "down"
          : "flat";

  // Bar chart: dollars opened per month, 24-month window.
  const buckets = new Map<string, number>();
  for (let i = 0; i < 24; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    buckets.set(key, 0);
  }
  for (const p of all) {
    const key = p.purchase_date.slice(0, 7);
    if (buckets.has(key))
      buckets.set(key, (buckets.get(key) ?? 0) + Number(p.total_amount));
  }
  const series = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(1, ...series.map(([, v]) => v));

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/installments"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Installments
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">Insights</h1>
      </div>

      <ul className="space-y-3 text-sm">
        <li>
          You&apos;ve put <strong>{fmtUsd(last12Sum)}</strong> on installment
          plans in the last 12 months.
        </li>
        <li>
          Your average plan is <strong>{fmtUsd(avgSize)}</strong> over{" "}
          <strong>{Math.round(avgTerm)} months</strong>.
        </li>
        <li>
          Most installments are from{" "}
          <strong>{topMerchant?.[0] ?? "—"}</strong>
          {topMerchant ? ` (${topMerchant[1]} plans)` : ""}.
        </li>
        <li>
          Trend: installment usage is <strong>{trend}</strong> vs the prior
          12 months ({fmtUsd(last12Sum)} vs {fmtUsd(prior12Sum)}).
        </li>
      </ul>

      {/* TODO: surface a gentle "share of monthly cash flow" note once
          income tracking is hooked in. Skip until then. */}

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
          Opened per month (24mo)
        </h2>
        <svg
          viewBox={`0 0 ${series.length * 12} 80`}
          className="w-full h-32"
          preserveAspectRatio="none"
        >
          {series.map(([month, value], i) => {
            const h = (value / max) * 70;
            return (
              <g key={month}>
                <rect
                  x={i * 12 + 1}
                  y={80 - h}
                  width={10}
                  height={h}
                  className="fill-zinc-300 dark:fill-zinc-700"
                />
                <title>{`${month}: ${fmtUsd(value)}`}</title>
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-xs text-zinc-500 mt-1">
          <span>{fmtMonth(series[0]?.[0] + "-01")}</span>
          <span>{fmtMonth(series[series.length - 1]?.[0] + "-01")}</span>
        </div>
      </section>
    </div>
  );
}
