import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ImportBatch } from "@/types/db";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, source, filename, status, rows_parsed, imported_count, duplicate_count, error_count, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<
      Pick<
        ImportBatch,
        | "id"
        | "source"
        | "filename"
        | "status"
        | "rows_parsed"
        | "imported_count"
        | "duplicate_count"
        | "error_count"
        | "created_at"
      >[]
    >();

  if (error) {
    console.error("imports list", error);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }
  return NextResponse.json({ batches: data ?? [] });
}
