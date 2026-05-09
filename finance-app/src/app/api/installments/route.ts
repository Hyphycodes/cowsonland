import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeProgress, generateSchedule } from "@/lib/installments/schedule";
import type {
  InstallmentKind,
  InstallmentPayment,
  InstallmentPlan,
} from "@/types/db";

type CreateBody = {
  name: string;
  merchant: string;
  purchase_date: string;
  total_amount: number;
  term_months: number;
  monthly_minimum: number;
  apr?: number;
  promo_end_date?: string | null;
  kind: InstallmentKind;
  payment_source_account_id?: string | null;
  purchase_category_id?: string | null;
  notes?: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: plans, error } = await supabase
    .from("installment_plans")
    .select("*")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .returns<InstallmentPlan[]>();
  if (error) {
    console.error("installments list", error);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }

  const ids = (plans ?? []).map((p) => p.id);
  let payments: InstallmentPayment[] = [];
  if (ids.length) {
    const { data: pays } = await supabase
      .from("installment_payments")
      .select("*")
      .in("plan_id", ids)
      .returns<InstallmentPayment[]>();
    payments = pays ?? [];
  }

  const enriched = (plans ?? []).map((p) => ({
    ...p,
    progress: computeProgress(
      p,
      payments.filter((x) => x.plan_id === p.id),
    ),
  }));

  return NextResponse.json({ plans: enriched });
}

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

  // Minimal validation — the DB has CHECK constraints for the rest.
  if (
    !body.name ||
    !body.merchant ||
    !body.purchase_date ||
    !body.total_amount ||
    !body.term_months ||
    !body.monthly_minimum ||
    !body.kind
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const admin = createServiceClient();

  // For BNPL, create a virtual liability account first so we can store
  // the plan's liability_account_id alongside the plan row.
  let liability_account_id: string | null = null;
  if (body.kind === "bnpl") {
    const { data: liability, error: liabErr } = await admin
      .from("accounts")
      .insert({
        user_id: user.id,
        name: `${body.merchant} – ${body.name}`,
        type: "loan",
        subtype: "installment",
        current_balance: body.total_amount,
        currency_code: "USD",
        source: "manual_liability",
      })
      .select("id")
      .single();
    if (liabErr || !liability) {
      console.error("bnpl liability create", liabErr);
      return NextResponse.json(
        { error: "liability_create_failed" },
        { status: 500 },
      );
    }
    liability_account_id = liability.id;
  }

  // TODO: if institution_name = 'Apple Card' and any sub-accounts of
  // type 'loan' exist for this user, prompt the user to link this plan
  // to that sub-account instead of creating a virtual liability /
  // proceeding manually. For now, every card_promo path is manual.

  const { data: plan, error: planErr } = await admin
    .from("installment_plans")
    .insert({
      user_id: user.id,
      name: body.name,
      merchant: body.merchant,
      purchase_date: body.purchase_date,
      total_amount: body.total_amount,
      term_months: body.term_months,
      monthly_minimum: body.monthly_minimum,
      apr: body.apr ?? 0,
      promo_end_date: body.promo_end_date ?? null,
      kind: body.kind,
      payment_source_account_id: body.payment_source_account_id ?? null,
      liability_account_id,
      purchase_category_id: body.purchase_category_id ?? null,
      notes: body.notes ?? null,
    })
    .select("*")
    .single<InstallmentPlan>();

  if (planErr || !plan) {
    console.error("plan insert", planErr);
    // If we created a liability account but the plan failed, roll it back.
    if (liability_account_id) {
      await admin.from("accounts").delete().eq("id", liability_account_id);
    }
    return NextResponse.json(
      { error: "plan_create_failed" },
      { status: 500 },
    );
  }

  const schedule = generateSchedule(plan).map((row) => ({
    user_id: user.id,
    plan_id: plan.id,
    expected_date: row.expected_date,
    expected_amount: row.expected_amount,
    status: "scheduled" as const,
  }));
  if (schedule.length) {
    const { error: schedErr } = await admin
      .from("installment_payments")
      .insert(schedule);
    if (schedErr) {
      console.error("schedule insert", schedErr);
    }
  }

  return NextResponse.json({ plan });
}
