import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category } from "@/types/db";
import RuleForm from "../RuleForm";

export const dynamic = "force-dynamic";

export default async function NewRulePage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string; category_id?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: categories }, { data: accounts }] = await Promise.all([
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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/rules"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Rules
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">New rule</h1>
      </div>
      <RuleForm
        categories={categories ?? []}
        accounts={accounts ?? []}
        defaults={{
          name: sp.merchant ? `${sp.merchant} → ?` : "",
          merchant_contains: sp.merchant ?? "",
          set_category_id: sp.category_id ?? "",
        }}
      />
    </div>
  );
}
