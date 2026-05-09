"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Account, ImportBatchSource } from "@/types/db";
import type { CsvDetection, CsvMapping } from "@/lib/ingestion/types";

type Props = {
  batchId: string;
  source: ImportBatchSource;
  filename: string | null;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedPreset: string | null;
  suggestedMapping: CsvMapping | null;
  detection: CsvDetection | null;
  rowCount: number;
  accounts: Account[];
};

const NONE = "";

export default function FinalizeFlow(props: Props) {
  const router = useRouter();
  const usingPreset = Boolean(props.suggestedPreset);
  const [usePreset, setUsePreset] = useState(usingPreset);

  const [mapping, setMapping] = useState<CsvMapping>({
    ...(props.suggestedMapping ?? {}),
    date:
      props.suggestedMapping?.date ??
      pickHeader(props.headers, ["date", "transaction date"]) ??
      NONE,
    amount:
      props.suggestedMapping?.amount ??
      pickHeader(props.headers, ["amount", "amount (usd)"]) ??
      NONE,
    merchant:
      props.suggestedMapping?.merchant ??
      pickHeader(props.headers, ["merchant"]) ??
      NONE,
    description:
      props.suggestedMapping?.description ??
      pickHeader(props.headers, ["description", "memo", "name"]) ??
      NONE,
    external_id:
      props.suggestedMapping?.external_id ??
      pickHeader(props.headers, ["transaction id", "id", "reference"]) ??
      NONE,
    amount_inverted: props.suggestedMapping?.amount_inverted ?? false,
    date_format: props.suggestedMapping?.date_format ?? "auto",
  });

  const [accountId, setAccountId] = useState<string>(
    props.accounts[0]?.id ?? "",
  );
  const [newAccountName, setNewAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = (patch: Partial<CsvMapping>) =>
    setMapping((m) => ({ ...m, ...patch }));

  const finalize = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { mapping };
      if (usePreset) body.use_preset = props.suggestedPreset;
      if (accountId) body.account_id = accountId;
      else if (newAccountName)
        body.new_account = { name: newAccountName };
      else throw new Error("pick_account");

      const res = await fetch(`/api/imports/${props.batchId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "finalize_failed");
      router.push("/imports");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "finalize_failed");
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!confirm("Discard this pending import?")) return;
    setSubmitting(true);
    await fetch(`/api/imports/${props.batchId}`, { method: "DELETE" });
    router.push("/imports");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">
          Confirm import
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {props.filename ?? "(no filename)"} · {props.rowCount} rows ·{" "}
          {props.source}
        </p>
      </div>

      {props.detection && (
        <section className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4 text-sm">
          <p className="font-medium">
            Detected{" "}
            {props.detection.institution ??
              props.detection.preset_name ??
              "unknown CSV format"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {props.detection.method} ·{" "}
            {Math.round(props.detection.confidence * 100)}% confidence
            {props.detection.needs_user_mapping
              ? " · review the mapping before importing"
              : ""}
          </p>
        </section>
      )}

      {props.suggestedPreset && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={usePreset}
            onChange={(e) => setUsePreset(e.target.checked)}
          />
          Use detected preset mapping.
        </label>
      )}

      {!usePreset && (
        <section className="space-y-3">
          <p className="text-sm font-medium">Column mapping</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              label="Date column *"
              value={mapping.date}
              headers={props.headers}
              onChange={(v) => update({ date: v })}
              required
            />
            <Select
              label="Amount column"
              value={mapping.amount ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ amount: v || undefined })}
            />
            <Select
              label="Debit (split)"
              value={mapping.debit ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ debit: v || undefined })}
            />
            <Select
              label="Credit (split)"
              value={mapping.credit ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ credit: v || undefined })}
            />
            <Select
              label="Merchant"
              value={mapping.merchant ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ merchant: v || undefined })}
            />
            <Select
              label="Description"
              value={mapping.description ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ description: v || undefined })}
            />
            <Select
              label="External ID"
              value={mapping.external_id ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ external_id: v || undefined })}
            />
            <Select
              label="Source category"
              value={mapping.category ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ category: v || undefined })}
            />
            <Select
              label="Memo"
              value={mapping.memo ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ memo: v || undefined })}
            />
            <Select
              label="Reference"
              value={mapping.reference ?? NONE}
              headers={props.headers}
              onChange={(v) => update({ reference: v || undefined })}
            />
            <label className="text-xs text-zinc-500">
              Date format
              <select
                className={selectCls}
                value={mapping.date_format ?? "auto"}
                onChange={(e) =>
                  update({
                    date_format: e.target.value as CsvMapping["date_format"],
                  })
                }
              >
                <option value="auto">auto</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={!!mapping.amount_inverted}
              onChange={(e) => update({ amount_inverted: e.target.checked })}
            />
            Invert sign (CSV uses negative for outflow)
          </label>
        </section>
      )}

      <section className="space-y-3">
        <p className="text-sm font-medium">Target account</p>
        <select
          className={selectCls}
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            if (e.target.value) setNewAccountName("");
          }}
        >
          <option value="">— create new —</option>
          {props.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.mask ? ` ···· ${a.mask}` : ""} ({a.source})
            </option>
          ))}
        </select>
        {!accountId && (
          <input
            type="text"
            className={selectCls}
            placeholder="New account name (e.g. Apple Card)"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
          />
        )}
      </section>

      <section>
        <p className="text-sm font-medium mb-2">Preview (first 10 rows)</p>
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="text-xs w-full">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                {props.headers.map((h) => (
                  <th key={h} className="px-2 py-1 text-left whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.sampleRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  {props.headers.map((h) => (
                    <td key={h} className="px-2 py-1 whitespace-nowrap">
                      {row[h]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={cancel}
          disabled={submitting}
          className="text-xs text-zinc-500 underline disabled:opacity-50"
        >
          Cancel import
        </button>
        <button
          type="button"
          onClick={finalize}
          disabled={submitting}
          className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {submitting ? "Importing…" : `Import ${props.rowCount} rows`}
        </button>
      </div>
    </div>
  );
}

function pickHeader(headers: string[], names: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const want of names) {
    const i = lower.indexOf(want.toLowerCase());
    if (i >= 0) return headers[i];
  }
  return null;
}

const selectCls =
  "block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm";

function Select({
  label,
  value,
  headers,
  onChange,
  required,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <select
        className={selectCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">—</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}
