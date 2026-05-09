"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Category, TransactionRule } from "@/types/db";

export default function RulesClient({
  initialRules,
  categories,
}: {
  initialRules: TransactionRule[];
  categories: Category[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [busy, setBusy] = useState<string | null>(null);
  const [reapplyMsg, setReapplyMsg] = useState<string | null>(null);

  const catById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[idx], next[target]] = [next[target], next[idx]];
    setRules(next);
    await fetch("/api/rules/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ordered_ids: next.map((r) => r.id) }),
    });
  };

  const toggle = async (rule: TransactionRule) => {
    setBusy(rule.id);
    await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    setRules((rs) =>
      rs.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
    );
    setBusy(null);
  };

  const remove = async (rule: TransactionRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
    setRules((rs) => rs.filter((r) => r.id !== rule.id));
    router.refresh();
  };

  const reapplyAll = async (only_uncategorized: boolean) => {
    setReapplyMsg(null);
    setBusy("reapply");
    const res = await fetch("/api/rules/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ only_uncategorized }),
    });
    const json = await res.json();
    setReapplyMsg(
      res.ok
        ? `Scanned ${json.scanned}, matched ${json.matched}, skipped ${json.skipped_manual} manual.`
        : `Reapply failed: ${json.error ?? "unknown"}`,
    );
    setBusy(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={() => reapplyAll(false)}
          disabled={busy !== null}
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
        >
          Reapply to all
        </button>
        <button
          type="button"
          onClick={() => reapplyAll(true)}
          disabled={busy !== null}
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
        >
          Apply to uncategorized only
        </button>
        {reapplyMsg && (
          <p className="text-xs text-zinc-500">{reapplyMsg}</p>
        )}
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No rules yet. New imports will land in the review queue until
          you add one.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
          {rules.map((r, i) => (
            <li key={r.id} className="px-4 py-3 flex items-start gap-4">
              <div className="flex flex-col gap-0.5 text-zinc-500">
                <button
                  type="button"
                  className="text-xs hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="text-xs hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30"
                  disabled={i === rules.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/rules/${r.id}`}
                    className={`font-medium ${r.enabled ? "" : "text-zinc-400 line-through"}`}
                  >
                    {r.name}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    priority {r.priority}
                  </span>
                  <span className="text-xs text-zinc-500">
                    · applied {r.times_applied}×
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  IF {summarizeConditions(r) || "(any transaction)"} → THEN{" "}
                  {summarizeAction(r, catById)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={() => toggle(r)}
                    disabled={busy === r.id}
                  />
                  enabled
                </label>
                <button
                  type="button"
                  onClick={() => remove(r)}
                  className="text-xs text-zinc-500 hover:text-red-600"
                >
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function summarizeConditions(r: TransactionRule): string {
  const parts: string[] = [];
  if (r.merchant_contains)
    parts.push(`merchant contains "${r.merchant_contains}"`);
  if (r.raw_name_contains)
    parts.push(`raw name contains "${r.raw_name_contains}"`);
  if (r.amount_exact != null) parts.push(`amount = ${r.amount_exact}`);
  if (r.amount_min != null) parts.push(`amount ≥ ${r.amount_min}`);
  if (r.amount_max != null) parts.push(`amount ≤ ${r.amount_max}`);
  if (r.transaction_type !== "any") parts.push(r.transaction_type);
  if (r.source) parts.push(`source = ${r.source}`);
  if (r.plaid_category) parts.push(`plaid_category = "${r.plaid_category}"`);
  return parts.join(" AND ");
}

export function summarizeAction(
  r: TransactionRule,
  catById: Map<string, Category>,
): string {
  if (r.mark_as_transfer) return "mark as transfer";
  if (r.set_category_id) {
    const cat = catById.get(r.set_category_id);
    return `set category to ${cat?.name ?? "(unknown)"}`;
  }
  return "no action";
}
