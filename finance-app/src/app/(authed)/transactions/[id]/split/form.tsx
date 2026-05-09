"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Category, TransactionSplit } from "@/types/db";

type Row = { id?: string; category_id: string; amount: string; notes: string };

export default function SplitForm({
  txId,
  amount,
  existing,
  categories,
}: {
  txId: string;
  amount: number;
  existing: TransactionSplit[];
  categories: Category[];
}) {
  const router = useRouter();
  const initial: Row[] = existing.length
    ? existing.map((s) => ({
        id: s.id,
        category_id: s.category_id ?? "",
        amount: s.amount.toString(),
        notes: s.notes ?? "",
      }))
    : [
        { category_id: "", amount: amount.toFixed(2), notes: "" },
      ];

  const [rows, setRows] = useState<Row[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sum = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows],
  );
  const remaining = amount - sum;
  const balanced = Math.abs(remaining) < 0.005;

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (i === j ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      { category_id: "", amount: remaining.toFixed(2), notes: "" },
    ]);

  const removeRow = (i: number) =>
    setRows((rs) => rs.filter((_, j) => j !== i));

  const save = async () => {
    setErr(null);
    if (!balanced) {
      setErr("Splits must equal the transaction amount.");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/transactions/${txId}/split`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        splits: rows.map((r) => ({
          category_id: r.category_id || null,
          amount: Number(r.amount),
          notes: r.notes || null,
        })),
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setErr(json.message ?? json.error ?? "save_failed");
      return;
    }
    router.push("/review");
    router.refresh();
  };

  const clearSplit = async () => {
    if (!confirm("Clear the split on this transaction?")) return;
    setSubmitting(true);
    await fetch(`/api/transactions/${txId}/split`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ splits: [] }),
    });
    router.push("/review");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li
            key={i}
            className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div className="grid sm:grid-cols-3 gap-2">
              <select
                className={inputCls}
                value={r.category_id}
                onChange={(e) => update(i, { category_id: e.target.value })}
              >
                <option value="">— category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.type} · {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                placeholder="Amount"
                value={r.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
              />
              <input
                type="text"
                className={inputCls}
                placeholder="Notes (optional)"
                value={r.notes}
                onChange={(e) => update(i, { notes: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs text-zinc-500 hover:text-red-600"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addRow}
        className="text-sm text-zinc-500 underline"
      >
        + Add row
      </button>

      <div className="text-sm font-mono tabular-nums">
        Allocated {sum.toFixed(2)} of {amount.toFixed(2)} — remaining{" "}
        <span className={balanced ? "text-emerald-600" : "text-amber-600"}>
          {remaining.toFixed(2)}
        </span>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex justify-between">
        {existing.length > 0 ? (
          <button
            type="button"
            onClick={clearSplit}
            className="text-xs text-zinc-500 underline"
          >
            Clear split
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={save}
          disabled={!balanced || submitting}
          className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save split"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm";
