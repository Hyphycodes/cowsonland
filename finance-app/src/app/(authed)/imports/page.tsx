import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ImportBatch } from "@/types/db";
import UploadCard from "./upload";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const supabase = await createClient();
  const { data: batches } = await supabase
    .from("import_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<ImportBatch[]>();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Imports</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload CSVs from any bank or card. Apple Card statements are
          auto-detected; everything else uses a manual column mapping.
        </p>
      </div>

      <UploadCard />

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
          History
        </h2>
        {!batches?.length ? (
          <p className="text-sm text-zinc-500">No imports yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {batches.map((b) => (
              <li
                key={b.id}
                className="px-4 py-3 flex items-center justify-between text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {b.filename ?? "(no filename)"}
                    <span className="ml-2 text-xs text-zinc-500">
                      {b.source}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {new Date(b.created_at).toLocaleString()} ·{" "}
                    {b.rows_parsed} parsed · {b.imported_count} imported ·{" "}
                    {b.duplicate_count} dup ·{" "}
                    {b.error_count} err
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs ${
                      b.status === "completed"
                        ? "text-emerald-600"
                        : b.status === "pending"
                          ? "text-amber-600"
                          : b.status === "failed"
                            ? "text-red-600"
                            : "text-zinc-500"
                    }`}
                  >
                    {b.status}
                  </span>
                  {b.status === "pending" && (
                    <Link
                      href={`/imports/${b.id}`}
                      className="text-xs underline"
                    >
                      Resume
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
