import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account, ImportBatch } from "@/types/db";
import FinalizeFlow from "./finalize";

export const dynamic = "force-dynamic";

type Md = {
  headers?: string[];
  staging_rows?: Record<string, string>[];
  suggested_preset?: string | null;
};

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", id)
    .single<ImportBatch>();
  if (!batch) notFound();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("name", { ascending: true })
    .returns<Account[]>();

  const md = (batch.metadata ?? {}) as Md;
  const sampleRows = (md.staging_rows ?? []).slice(0, 10);

  if (batch.status !== "pending") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-medium">Import — {batch.status}</h1>
        <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
          <li>
            <strong>{batch.rows_parsed}</strong> rows parsed
          </li>
          <li>
            <strong>{batch.imported_count}</strong> imported
          </li>
          <li>
            <strong>{batch.duplicate_count}</strong> duplicates skipped
          </li>
          <li>
            <strong>{batch.error_count}</strong> errors
          </li>
        </ul>
      </div>
    );
  }

  return (
    <FinalizeFlow
      batchId={batch.id}
      source={batch.source}
      filename={batch.filename}
      headers={md.headers ?? []}
      sampleRows={sampleRows}
      suggestedPreset={md.suggested_preset ?? null}
      rowCount={md.staging_rows?.length ?? 0}
      accounts={accounts ?? []}
    />
  );
}
