import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recalculateSchedule } from "@/lib/installments/recalculate";

export async function POST(
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

  try {
    const result = await recalculateSchedule(supabase, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("recalculate", err);
    return NextResponse.json(
      { error: "recalculate_failed" },
      { status: 500 },
    );
  }
}
