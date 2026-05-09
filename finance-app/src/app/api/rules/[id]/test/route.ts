import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ruleMatches } from "@/lib/rules/apply";
import type { Transaction, TransactionRule } from "@/types/db";

/**
 * Counts how many of the user's recent transactions would match this
 * rule. Read-only — does not mutate anything. Used by the rule builder
 * to give a quick sanity check before saving.
 */
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rule } = await supabase
    .from("transaction_rules")
    .select("*")
    .eq("id", id)
    .single<TransactionRule>();
  if (!rule)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: txs } = await supabase
    .from("transactions")
    .select(
      "id, user_id, amount, merchant_name, raw_name, account_id, source, plaid_category, category_id, category_source, notes, date",
    )
    .order("date", { ascending: false })
    .limit(500)
    .returns<Transaction[]>();

  const matched = (txs ?? []).filter((tx) => ruleMatches(rule, tx));

  return NextResponse.json({
    scanned: txs?.length ?? 0,
    match_count: matched.length,
    sample: matched.slice(0, 10).map((m) => ({
      id: m.id,
      date: m.date,
      amount: m.amount,
      merchant_name: m.merchant_name,
    })),
  });
}
