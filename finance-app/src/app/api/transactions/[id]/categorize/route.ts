import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureTransferCategory } from "@/lib/categories/seed";

/**
 * Manual categorization. ALWAYS sets category_source='manual' so future
 * rule passes can't overwrite it. Pass mark_as_transfer=true to route
 * to the canonical Account Transfer category.
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

  let body: {
    category_id?: string | null;
    mark_as_transfer?: boolean;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  let categoryId = body.category_id ?? null;
  if (body.mark_as_transfer) {
    categoryId = await ensureTransferCategory(supabase, user.id);
  }

  const update: Record<string, unknown> = {
    category_id: categoryId,
    category_source: "manual",
    applied_rule_id: null,
  };
  if ("notes" in body) update.notes = body.notes;

  const { error } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { error: "update_failed", message: error.message },
      { status: 500 },
    );
  return NextResponse.json({ ok: true, category_id: categoryId });
}
