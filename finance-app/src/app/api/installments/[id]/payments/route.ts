import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recalculateSchedule } from "@/lib/installments/recalculate";
import type { InstallmentPlan } from "@/types/db";

type Body = {
  amount: number;
  date: string;
  transaction_id?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.amount || !body.date)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const { data: plan } = await supabase
    .from("installment_plans")
    .select("*")
    .eq("id", planId)
    .is("deleted_at", null)
    .single<InstallmentPlan>();
  if (!plan)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Find the next scheduled row to consume. If none, create a stand-alone
  // 'paid' row (e.g. user is making an extra payment).
  const { data: nextSched } = await supabase
    .from("installment_payments")
    .select("*")
    .eq("plan_id", planId)
    .eq("status", "scheduled")
    .order("expected_date", { ascending: true })
    .limit(1);

  const sched = nextSched?.[0];
  let status: "paid" | "partial" | "overpaid";
  if (sched) {
    if (body.amount > sched.expected_amount + 0.005)
      status = "overpaid";
    else if (body.amount < sched.expected_amount - 0.005)
      status = "partial";
    else status = "paid";

    const { error: updErr } = await supabase
      .from("installment_payments")
      .update({
        actual_date: body.date,
        actual_amount: body.amount,
        transaction_id: body.transaction_id ?? null,
        status,
      })
      .eq("id", sched.id);
    if (updErr) {
      console.error("payment update", updErr);
      return NextResponse.json(
        { error: "payment_update_failed" },
        { status: 500 },
      );
    }
  } else {
    // No more scheduled rows — record as standalone paid payment.
    status = "paid";
    const { error: insErr } = await supabase
      .from("installment_payments")
      .insert({
        user_id: user.id,
        plan_id: planId,
        expected_date: body.date,
        expected_amount: body.amount,
        actual_date: body.date,
        actual_amount: body.amount,
        transaction_id: body.transaction_id ?? null,
        status: "paid",
      });
    if (insErr) {
      console.error("payment insert", insErr);
      return NextResponse.json(
        { error: "payment_insert_failed" },
        { status: 500 },
      );
    }
  }

  // For BNPL, the virtual liability account balance must drop.
  if (plan.kind === "bnpl" && plan.liability_account_id) {
    const admin = createServiceClient();
    const { data: liab } = await admin
      .from("accounts")
      .select("current_balance")
      .eq("id", plan.liability_account_id)
      .single();
    const newBal = Math.max(
      0,
      Number(liab?.current_balance ?? 0) - body.amount,
    );
    await admin
      .from("accounts")
      .update({ current_balance: newBal })
      .eq("id", plan.liability_account_id);
  }

  const result = await recalculateSchedule(supabase, planId);

  return NextResponse.json({ ok: true, status, ...result });
}
