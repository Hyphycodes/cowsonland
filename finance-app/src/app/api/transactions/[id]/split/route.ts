import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Transaction } from "@/types/db";

type SplitRow = {
  category_id: string | null;
  amount: number;
  notes?: string | null;
};

const TOL = 0.005;

/**
 * Replace the splits on a transaction. Body: { splits: SplitRow[] } —
 * sum must equal the transaction amount exactly. Pass an empty array
 * to clear the split.
 */
export async function POST(
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

  let body: { splits: SplitRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!Array.isArray(body.splits))
    return NextResponse.json({ error: "missing_splits" }, { status: 400 });

  const { data: tx } = await supabase
    .from("transactions")
    .select("id, amount, user_id")
    .eq("id", id)
    .single<Pick<Transaction, "id" | "amount" | "user_id">>();
  if (!tx)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.splits.length > 0) {
    const sum = body.splits.reduce((s, r) => s + Number(r.amount), 0);
    if (Math.abs(sum - tx.amount) > TOL) {
      return NextResponse.json(
        {
          error: "split_mismatch",
          message: `Splits total ${sum.toFixed(2)} but transaction is ${tx.amount.toFixed(2)}.`,
        },
        { status: 400 },
      );
    }
  }

  // Wipe and reinsert. Cleaner than diffing.
  const { error: delErr } = await supabase
    .from("transaction_splits")
    .delete()
    .eq("transaction_id", id);
  if (delErr)
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  if (body.splits.length > 0) {
    const rows = body.splits.map((r) => ({
      user_id: user.id,
      transaction_id: id,
      category_id: r.category_id,
      amount: r.amount,
      notes: r.notes ?? null,
    }));
    const { error: insErr } = await supabase
      .from("transaction_splits")
      .insert(rows);
    if (insErr)
      return NextResponse.json(
        { error: "insert_failed", message: insErr.message },
        { status: 500 },
      );
  }

  await supabase
    .from("transactions")
    .update({ is_split: body.splits.length > 0 })
    .eq("id", id);

  return NextResponse.json({ ok: true, count: body.splits.length });
}
