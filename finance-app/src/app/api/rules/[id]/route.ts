import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TransactionRule } from "@/types/db";

const PATCHABLE = [
  "name",
  "enabled",
  "priority",
  "merchant_contains",
  "raw_name_contains",
  "amount_min",
  "amount_max",
  "amount_exact",
  "account_id",
  "source",
  "plaid_category",
  "transaction_type",
  "set_category_id",
  "set_notes",
  "mark_as_transfer",
] as const;

export async function GET(
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

  const { data, error } = await supabase
    .from("transaction_rules")
    .select("*")
    .eq("id", id)
    .single<TransactionRule>();
  if (error || !data)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ rule: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const k of PATCHABLE) {
    if (k in body) update[k] = body[k];
  }

  const { error } = await supabase
    .from("transaction_rules")
    .update(update)
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { error: "update_failed", message: error.message },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  const { error } = await supabase
    .from("transaction_rules")
    .delete()
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
