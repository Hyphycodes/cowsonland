import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Body: { ordered_ids: string[] } — the new order of rule ids. Server
 * rewrites priority to (10, 20, 30, ...) so future inserts can slot
 * between existing rules.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { ordered_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.ordered_ids?.length)
    return NextResponse.json({ error: "missing_ordered_ids" }, { status: 400 });

  let p = 10;
  for (const id of body.ordered_ids) {
    const { error } = await supabase
      .from("transaction_rules")
      .update({ priority: p })
      .eq("id", id);
    if (error)
      return NextResponse.json(
        { error: "update_failed", message: error.message },
        { status: 500 },
      );
    p += 10;
  }

  return NextResponse.json({ ok: true });
}
