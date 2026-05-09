import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedDefaultCategories } from "@/lib/categories/seed";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await seedDefaultCategories(supabase, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("seed", err);
    return NextResponse.json({ error: "seed_failed" }, { status: 500 });
  }
}
