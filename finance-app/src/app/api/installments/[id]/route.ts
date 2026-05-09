import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/installments/schedule";
import type {
  InstallmentPayment,
  InstallmentPlan,
} from "@/types/db";

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

  const { data: plan, error } = await supabase
    .from("installment_plans")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single<InstallmentPlan>();
  if (error || !plan)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: payments } = await supabase
    .from("installment_payments")
    .select("*")
    .eq("plan_id", id)
    .order("expected_date", { ascending: true })
    .returns<InstallmentPayment[]>();

  return NextResponse.json({
    plan,
    payments: payments ?? [],
    progress: computeProgress(plan, payments ?? []),
  });
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

  // Soft delete only. Lifetime history view requires permanent record.
  // Block delete if there are non-scheduled payments — protect history.
  const { data: pays } = await supabase
    .from("installment_payments")
    .select("status")
    .eq("plan_id", id);
  const hasReal = (pays ?? []).some((p) => p.status !== "scheduled");
  if (hasReal) {
    return NextResponse.json(
      { error: "has_payments", message: "Cannot delete a plan with recorded payments." },
      { status: 409 },
    );
  }

  const admin = createServiceClient();

  // If BNPL, soft-deleting the plan should also remove the virtual
  // liability account so it stops appearing in net worth. We hard-delete
  // the account because it carries no useful history of its own.
  const { data: plan } = await supabase
    .from("installment_plans")
    .select("kind, liability_account_id, user_id")
    .eq("id", id)
    .single<Pick<InstallmentPlan, "kind" | "liability_account_id" | "user_id">>();

  if (plan?.kind === "bnpl" && plan.liability_account_id) {
    await admin.from("accounts").delete().eq("id", plan.liability_account_id);
  }

  const { error: updErr } = await supabase
    .from("installment_plans")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) {
    console.error("soft delete", updErr);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
