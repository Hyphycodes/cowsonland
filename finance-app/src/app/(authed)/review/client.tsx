"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Category, Transaction } from "@/types/db";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function ReviewClient({
  initial,
  categories,
}: {
  initial: Transaction[];
  categories: Category[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const categorize = async (
    tx: Transaction,
    categoryId: string,
  ) => {
    setBusy(tx.id);
    const res = await fetch(`/api/transactions/${tx.id}/categorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category_id: categoryId }),
    });
    setBusy(null);
    if (res.ok) {
      // Once manually categorized it leaves the review queue.
      setItems((xs) => xs.filter((x) => x.id !== tx.id));
      router.refresh();
    }
  };

  const markTransfer = async (tx: Transaction) => {
    setBusy(tx.id);
    const res = await fetch(`/api/transactions/${tx.id}/categorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mark_as_transfer: true }),
    });
    setBusy(null);
    if (res.ok) {
      setItems((xs) => xs.filter((x) => x.id !== tx.id));
      router.refresh();
    }
  };

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
      {items.map((tx) => (
        <li key={tx.id} className="px-4 py-3 text-sm space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium truncate">
                {tx.merchant_name ?? tx.raw_name ?? "Unknown"}
                {tx.category_source === "plaid_default" && (
                  <span className="ml-2 text-xs text-zinc-500">
                    plaid suggestion
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {tx.date} · {tx.source ?? "—"}
                {tx.plaid_category ? ` · ${tx.plaid_category}` : ""}
              </p>
            </div>
            <p
              className={`font-mono tabular-nums ${
                tx.amount < 0 ? "text-emerald-600" : ""
              }`}
            >
              {fmtUsd(tx.amount)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-xs"
              defaultValue=""
              disabled={busy === tx.id}
              onChange={(e) => {
                if (e.target.value) categorize(tx, e.target.value);
              }}
            >
              <option value="">— pick category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === "expense"
                    ? ""
                    : c.type === "income"
                      ? "↑ "
                      : "↔ "}
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => markTransfer(tx)}
              disabled={busy === tx.id}
              className="text-xs underline text-zinc-500"
            >
              Mark transfer
            </button>
            <Link
              href={`/transactions/${tx.id}/split`}
              className="text-xs underline text-zinc-500"
            >
              Split
            </Link>
            <Link
              href={`/rules/new?merchant=${encodeURIComponent(tx.merchant_name ?? tx.raw_name ?? "")}`}
              className="text-xs underline text-zinc-500"
            >
              Create rule
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
