import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Category, Transaction } from "@/types/db";
import ReviewClient from "./client";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  const [{ data: txs }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .in("category_source", ["none", "plaid_default", "ai"])
      .order("date", { ascending: false })
      .limit(100)
      .returns<Transaction[]>(),
    supabase
      .from("categories")
      .select("*")
      .order("type", { ascending: true })
      .order("sort_order", { ascending: true })
      .returns<Category[]>(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Review queue</h1>
        <Link
          href="/rules/new"
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          + New rule
        </Link>
      </div>
      {(!txs || txs.length === 0) ? (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-500">
          Nothing to review. Every transaction has a confirmed category.
        </div>
      ) : (
        <ReviewClient
          initial={txs}
          categories={categories ?? []}
        />
      )}
    </div>
  );
}
