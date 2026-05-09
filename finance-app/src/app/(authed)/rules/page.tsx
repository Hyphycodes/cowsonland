import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Category, TransactionRule } from "@/types/db";
import RulesClient from "./client";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const supabase = await createClient();
  const [{ data: rules }, { data: categories }] = await Promise.all([
    supabase
      .from("transaction_rules")
      .select("*")
      .order("priority", { ascending: true })
      .returns<TransactionRule[]>(),
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
        <h1 className="text-2xl font-medium tracking-tight">Rules</h1>
        <Link
          href="/rules/new"
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          + New rule
        </Link>
      </div>
      <RulesClient
        initialRules={rules ?? []}
        categories={categories ?? []}
      />
    </div>
  );
}
