"use client";

import Link from "next/link";

export default function SpendingMode({ current }: { current: string }) {
  return (
    <div className="text-xs">
      <Link
        href="/dashboard?mode=decision"
        className={
          current === "decision"
            ? "font-medium underline"
            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        }
      >
        Decision
      </Link>
      <span className="mx-2 text-zinc-400">·</span>
      <Link
        href="/dashboard?mode=cash_flow"
        className={
          current === "cash_flow"
            ? "font-medium underline"
            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        }
      >
        Cash flow
      </Link>
    </div>
  );
}
