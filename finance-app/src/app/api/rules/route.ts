import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TransactionRule } from "@/types/db";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("transaction_rules")
    .select("*")
    .order("priority", { ascending: true })
    .returns<TransactionRule[]>();
  if (error)
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}

type CreateBody = Partial<Omit<TransactionRule, "id" | "user_id" | "times_applied" | "last_applied_at" | "created_at" | "updated_at">> & {
  name: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.name)
    return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const { data, error } = await supabase
    .from("transaction_rules")
    .insert({
      user_id: user.id,
      name: body.name,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 100,
      merchant_contains: body.merchant_contains ?? null,
      raw_name_contains: body.raw_name_contains ?? null,
      amount_min: body.amount_min ?? null,
      amount_max: body.amount_max ?? null,
      amount_exact: body.amount_exact ?? null,
      account_id: body.account_id ?? null,
      source: body.source ?? null,
      plaid_category: body.plaid_category ?? null,
      transaction_type: body.transaction_type ?? "any",
      set_category_id: body.set_category_id ?? null,
      set_notes: body.set_notes ?? null,
      mark_as_transfer: body.mark_as_transfer ?? false,
    })
    .select("*")
    .single<TransactionRule>();
  if (error)
    return NextResponse.json(
      { error: "create_failed", message: error.message },
      { status: 500 },
    );
  return NextResponse.json({ rule: data });
}
