"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { InstallmentKind } from "@/types/db";
import { addMonths } from "@/lib/installments/schedule";
import { fmtMonth, fmtUsd } from "@/lib/installments/format";

export default function DetailActions({
  planId,
  kind,
  monthlyMinimum,
  remaining,
  nextDue,
}: {
  planId: string;
  kind: InstallmentKind;
  monthlyMinimum: number;
  remaining: number;
  nextDue: string | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(monthlyMinimum.toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [whatIf, setWhatIf] = useState(monthlyMinimum);
  const [err, setErr] = useState<string | null>(null);

  const projected = useMemo(() => {
    if (!whatIf || whatIf <= 0 || remaining <= 0) return null;
    const months = Math.ceil(remaining / whatIf);
    const anchor = nextDue ?? new Date().toISOString().slice(0, 10);
    return addMonths(anchor, months - 1);
  }, [whatIf, remaining, nextDue]);

  const recordPayment = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/installments/${planId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!confirm("Soft-delete this plan? It can be restored from the All-time tab."))
      return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/installments/${planId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error);
      router.push("/installments");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "delete failed");
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <p className="text-sm font-medium">
          {kind === "card_promo" ? "Mark this month paid" : "Record a payment"}
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-zinc-500">
            Amount
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="block mt-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="block mt-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={recordPayment}
            disabled={submitting}
            className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <p className="text-sm font-medium">What if I paid…</p>
        <input
          type="range"
          min={Math.max(1, Math.floor(monthlyMinimum / 2))}
          max={Math.max(monthlyMinimum * 4, monthlyMinimum + 100)}
          step="1"
          value={whatIf}
          onChange={(e) => setWhatIf(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-zinc-500 font-mono tabular-nums">
          <span>{fmtUsd(whatIf)}/mo</span>
          <span>
            payoff{" "}
            {projected ? (
              <strong className="text-zinc-900 dark:text-zinc-100">
                {fmtMonth(projected)}
              </strong>
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={remove}
        disabled={submitting}
        className="text-xs text-zinc-500 hover:text-red-600 underline"
      >
        Delete plan
      </button>
    </section>
  );
}
