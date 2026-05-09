import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  Transaction,
  TransactionSplit,
} from "@/types/db";
import SplitForm from "./form";

export const dynamic = "force-dynamic";

export default async function SplitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: tx }, { data: categories }, { data: splits }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("id", id)
        .single<Transaction>(),
      supabase
        .from("categories")
        .select("*")
        .order("type", { ascending: true })
        .order("sort_order", { ascending: true })
        .returns<Category[]>(),
      supabase
        .from("transaction_splits")
        .select("*")
        .eq("transaction_id", id)
        .returns<TransactionSplit[]>(),
    ]);
  if (!tx) notFound();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <Link
          href="/review"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">
          Split transaction
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {tx.merchant_name ?? tx.raw_name ?? "Unknown"} · {tx.date} ·{" "}
          {tx.amount.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })}
        </p>
      </div>
      <SplitForm
        txId={tx.id}
        amount={Number(tx.amount)}
        existing={splits ?? []}
        categories={categories ?? []}
      />
    </div>
  );
}
