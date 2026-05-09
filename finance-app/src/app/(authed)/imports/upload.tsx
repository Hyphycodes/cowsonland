"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UploadCard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onUpload = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/imports/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "upload_failed");
      router.push(`/imports/${json.batch.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload_failed");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-6">
      <p className="text-sm font-medium">Upload a CSV</p>
      <p className="text-xs text-zinc-500 mt-1">
        Up to 5MB. Apple Card statements are detected automatically.
      </p>
      <label
        className={`mt-4 block rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-sm text-center cursor-pointer ${
          busy ? "opacity-60" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
        }`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />
        {busy ? "Uploading…" : "Choose CSV file"}
      </label>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}
