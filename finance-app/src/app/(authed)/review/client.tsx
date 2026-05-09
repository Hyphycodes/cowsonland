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

  const acceptAi = async (tx: Transaction) => {
    if (!tx.category_id) return;
    await categorize(tx, tx.category_id);
  };

  const bulkAcceptHighConfidence = async () => {
    const accepted = items.filter(
      (tx) =>
        tx.category_source === "ai" &&
        tx.category_id &&
        (tx.ai_confidence ?? 0) >= 0.85,
    );
    for (const tx of accepted) {
      // eslint-disable-next-line no-await-in-loop
      await categorize(tx, tx.category_id as string);
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
    <div className="space-y-3">
      {items.some(
        (tx) =>
          tx.category_source === "ai" &&
          tx.category_id &&
          (tx.ai_confidence ?? 0) >= 0.85,
      ) && (
        <button
          type="button"
          onClick={bulkAcceptHighConfidence}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          Accept high-confidence AI suggestions
        </button>
      )}
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
                {tx.category_source === "ai" && (
                  <span className="ml-2 text-xs text-sky-600">
                    AI suggestion
                    {tx.ai_confidence != null
                      ? ` ${Math.round(tx.ai_confidence * 100)}%`
                      : ""}
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
          {tx.category_source === "ai" && (
            <div className="rounded-md bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs text-sky-900 dark:text-sky-100">
              <p>
                Suggested:{" "}
                <strong>
                  {categories.find((c) => c.id === tx.category_id)?.name ??
                    tx.ai_category ??
                    "Unknown"}
                </strong>
              </p>
              {tx.ai_category_reason && (
                <p className="mt-1 text-sky-800 dark:text-sky-200">
                  {tx.ai_category_reason}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {tx.category_source === "ai" && tx.category_id && (
              <button
                type="button"
                onClick={() => acceptAi(tx)}
                disabled={busy === tx.id}
                className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-3 py-1 text-xs disabled:opacity-50"
              >
                Accept
              </button>
            )}
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
            {tx.category_source === "ai" && tx.category_id && (
              <Link
                href={`/rules/new?merchant=${encodeURIComponent(ruleMerchant(tx))}&category_id=${encodeURIComponent(tx.category_id)}`}
                className="text-xs underline text-zinc-500"
              >
                Make rule from AI
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
    </div>
  );
}

function ruleMerchant(tx: Transaction) {
  const suggested = tx.ai_suggested_rule;
  const merchant =
    suggested && typeof suggested.merchant_contains === "string"
      ? suggested.merchant_contains
      : null;
  return merchant ?? tx.merchant_name ?? tx.raw_name ?? "";
}
