import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ingestTransactions } from "@/lib/ingestion/ingest";
import { normalizeCsvRow } from "@/lib/ingestion/normalize";
import { CSV_PRESETS } from "@/lib/ingestion/presets";
import { categorizeUnresolvedWithClaude } from "@/lib/ai/categorize";
import type { CsvDetection, CsvMapping, NormalizedTx } from "@/lib/ingestion/types";
import type { CategorySource, ImportBatch, ImportBatchSource } from "@/types/db";

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

  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", id)
    .single<ImportBatch>();
  if (error || !data)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const md = (data.metadata ?? {}) as {
    headers?: string[];
    staging_rows?: Record<string, string>[];
    suggested_preset?: string | null;
    suggested_mapping?: CsvMapping | null;
    detection?: CsvDetection | null;
  };

  return NextResponse.json({
    batch: { ...data, metadata: undefined },
    headers: md.headers ?? [],
    suggested_preset: md.suggested_preset ?? null,
    suggested_mapping: md.suggested_mapping ?? md.detection?.mapping ?? null,
    detection: md.detection ?? null,
    sample_rows: (md.staging_rows ?? []).slice(0, 5),
    pending_row_count: md.staging_rows?.length ?? 0,
  });
}

type FinalizeBody = {
  account_id?: string;
  new_account?: { name: string; type?: string | null };
  mapping: CsvMapping;
  use_preset?: string | null;
};

/**
 * Step 2 of an import: apply the mapping, normalize, dedupe, insert.
 * Updates the batch row's counters and clears staging_rows on success.
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

  let body: FinalizeBody;
  try {
    body = (await request.json()) as FinalizeBody;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const admin = createServiceClient();

  const { data: batch } = await admin
    .from("import_batches")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<ImportBatch>();
  if (!batch)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (batch.status !== "pending") {
    return NextResponse.json(
      { error: "not_pending", status: batch.status },
      { status: 409 },
    );
  }

  const md = (batch.metadata ?? {}) as {
    staging_rows?: Record<string, string>[];
    detection?: CsvDetection | null;
  };
  const stagingRows = md.staging_rows ?? [];
  if (stagingRows.length === 0) {
    return NextResponse.json({ error: "no_staging_rows" }, { status: 400 });
  }

  // Resolve target account: existing OR create one inline.
  let accountId = body.account_id ?? null;
  if (!accountId && body.new_account) {
    const { data: newAcct, error: acctErr } = await admin
      .from("accounts")
      .insert({
        user_id: user.id,
        name: body.new_account.name,
        type: body.new_account.type ?? null,
        currency_code: "USD",
        source: batch.source === "apple_card" ? "apple_card" : "csv",
      })
      .select("id")
      .single();
    if (acctErr || !newAcct) {
      console.error("account create", acctErr);
      return NextResponse.json(
        { error: "account_create_failed" },
        { status: 500 },
      );
    }
    accountId = newAcct.id;
  }
  if (!accountId)
    return NextResponse.json(
      { error: "missing_account" },
      { status: 400 },
    );

  // Pick the mapping: explicit body.mapping overrides preset.
  const preset = body.use_preset
    ? CSV_PRESETS.find((p) => p.id === body.use_preset)
    : null;
  const mapping: CsvMapping = preset?.mapping ?? body.mapping;
  if (!mapping?.date) {
    return NextResponse.json({ error: "missing_mapping" }, { status: 400 });
  }

  const txSource: ImportBatchSource = batch.source;
  const normalized: NormalizedTx[] = [];
  let errors = 0;
  for (const row of stagingRows) {
    const result = normalizeCsvRow(row, mapping, {
      source: txSource === "apple_card" ? "apple_card" : "csv",
      source_account_id: accountId,
    });
    if (result.ok) normalized.push(result.tx);
    else errors += 1;
  }

  let summary;
  try {
    summary = await ingestTransactions(admin, {
      user_id: user.id,
      account_id: accountId,
      rows: normalized,
      import_batch_id: batch.id,
    });
  } catch (err) {
    console.error("ingest", err);
    await admin
      .from("import_batches")
      .update({ status: "failed", error_count: errors })
      .eq("id", batch.id);
    return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
  }

  if (summary.inserted_ids.length > 0) {
    try {
      const ai = await categorizeUnresolvedWithClaude(admin, {
        user_id: user.id,
        transaction_ids: summary.inserted_ids,
      });
      summary.ai_categorized = ai.categorized;
      summary.review_needed = ai.review_needed;
    } catch (err) {
      console.error("ai categorization", err);
      summary.ai_categorized = 0;
    }
  }

  const reviewNeeded = await countReviewNeeded(admin, summary.inserted_ids);

  await admin
    .from("import_batches")
    .update({
      status: "completed",
      imported_count: summary.imported,
      duplicate_count: summary.duplicates,
      error_count: errors + summary.errors,
      // Clear staging rows; batch row stays as a permanent receipt.
      metadata: {
        detection: md.detection ?? null,
        finalized_mapping: mapping,
        rules_matched: summary.rules_matched ?? 0,
        ai_categorized: summary.ai_categorized ?? 0,
        review_needed: reviewNeeded,
      },
    })
    .eq("id", batch.id);

  return NextResponse.json({
    ok: true,
    summary: { ...summary, errors: errors + summary.errors },
  });
}

async function countReviewNeeded(
  admin: ReturnType<typeof createServiceClient>,
  ids: string[],
) {
  if (ids.length === 0) return 0;
  const { data } = await admin
    .from("transactions")
    .select("id, category_source")
    .in("id", ids)
    .in("category_source", [
      "none",
      "plaid_default",
      "ai",
    ] satisfies CategorySource[]);
  return data?.length ?? 0;
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

  // Cancel a pending batch. Completed batches are never deleted —
  // they're a permanent record.
  const { data: batch } = await supabase
    .from("import_batches")
    .select("status")
    .eq("id", id)
    .single();
  if (!batch)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (batch.status !== "pending")
    return NextResponse.json(
      { error: "cannot_cancel", status: batch.status },
      { status: 409 },
    );

  const { error } = await supabase
    .from("import_batches")
    .update({ status: "cancelled", metadata: {} })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: "cancel_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
