import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category, TransactionRule } from "@/types/db";
import RuleForm from "../RuleForm";

export const dynamic = "force-dynamic";

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: rule }, { data: categories }, { data: accounts }] =
    await Promise.all([
      supabase
        .from("transaction_rules")
        .select("*")
        .eq("id", id)
        .single<TransactionRule>(),
      supabase
        .from("categories")
        .select("*")
        .order("type", { ascending: true })
        .order("sort_order", { ascending: true })
        .returns<Category[]>(),
      supabase
        .from("accounts")
        .select("*")
        .order("name", { ascending: true })
        .returns<Account[]>(),
    ]);
  if (!rule) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/rules"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Rules
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">
          Edit rule
        </h1>
      </div>
      <RuleForm
        rule={rule}
        categories={categories ?? []}
        accounts={accounts ?? []}
      />
    </div>
  );
}
