import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { reapplyRules } from "@/lib/rules/apply-bulk";

/**
 * Reapply rules in bulk.
 *
 * Body: { only_uncategorized?: boolean, rule_id?: string }
 *
 * Manual-categorized rows are always skipped — see apply-bulk.ts.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { only_uncategorized?: boolean; rule_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body OK */
  }

  const admin = createServiceClient();
  try {
    const result = await reapplyRules(admin, {
      user_id: user.id,
      only_uncategorized: body.only_uncategorized ?? false,
      rule_id: body.rule_id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("reapply", err);
    return NextResponse.json({ error: "reapply_failed" }, { status: 500 });
  }
}
