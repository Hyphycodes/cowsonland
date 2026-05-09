import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/types/db";

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

  let body: Partial<Pick<Category, "name" | "type" | "color" | "icon" | "sort_order" | "parent_id">>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { error } = await supabase
    .from("categories")
    .update(body)
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
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

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
