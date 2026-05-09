import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/ingestion/csv/parse";
import { detectCsvFormat } from "@/lib/ingestion/presets";
import { suggestCsvMappingWithClaude } from "@/lib/ingestion/ai-mapping";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Step 1 of an import: accept a CSV, parse it, and stash the raw rows
 * inside a 'pending' import_batches row. Returns batch id, headers,
 * sample rows, and any preset suggestion so the UI can render the
 * mapping screen.
 *
 * No transactions are written here.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "expected_multipart" },
      { status: 400 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "empty_csv" }, { status: 400 });
  }

  let detection = detectCsvFormat(headers, rows.slice(0, 10));
  const aiMapping =
    detection.needs_user_mapping || detection.confidence < 0.8
      ? await suggestCsvMappingWithClaude({
          headers,
          sampleRows: rows.slice(0, 5),
        })
      : null;
  if (aiMapping && aiMapping.confidence > detection.confidence) {
    detection = {
      ...detection,
      institution: aiMapping.institution ?? detection.institution,
      confidence: aiMapping.confidence,
      mapping: aiMapping.mapping,
      needs_user_mapping: aiMapping.confidence < 0.75,
      method: "ai",
      notes: aiMapping.notes,
    };
  }
  const suggestedPreset =
    detection.method === "preset" && !detection.needs_user_mapping
      ? detection.preset_id
      : null;

  // Write through service-role: we want metadata.staging_rows server-side
  // so the user can leave the page and come back later.
  const admin = createServiceClient();
  const { data: batch, error } = await admin
    .from("import_batches")
    .insert({
      user_id: user.id,
      source: detection.source,
      filename: file.name,
      status: "pending",
      rows_parsed: rows.length,
      metadata: {
        headers,
        staging_rows: rows,
        detection,
        suggested_preset: suggestedPreset,
        suggested_mapping: detection.mapping,
      },
    })
    .select("id, source, status, rows_parsed, filename")
    .single();

  if (error || !batch) {
    console.error("upload insert", error);
    return NextResponse.json(
      { error: "upload_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    batch,
    headers,
    sample_rows: rows.slice(0, 5),
    detection,
    suggested_preset: suggestedPreset,
    suggested_mapping: detection.mapping,
  });
}
