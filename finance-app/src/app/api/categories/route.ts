import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Category, CategoryType } from "@/types/db";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("type", { ascending: true })
    .order("sort_order", { ascending: true })
    .returns<Category[]>();
  if (error)
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}

type CreateBody = {
  name: string;
  type: CategoryType;
  color?: string | null;
  icon?: string | null;
  parent_id?: string | null;
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
  if (!body.name || !body.type)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name: body.name,
      type: body.type,
      color: body.color ?? null,
      icon: body.icon ?? null,
      parent_id: body.parent_id ?? null,
    })
    .select("*")
    .single<Category>();
  if (error)
    return NextResponse.json(
      { error: "create_failed", message: error.message },
      { status: 500 },
    );
  return NextResponse.json({ category: data });
}
