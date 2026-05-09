"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  Account,
  Category,
  RuleTransactionType,
  TransactionRule,
  TransactionSource,
} from "@/types/db";

type FormState = {
  name: string;
  enabled: boolean;
  priority: number;
  merchant_contains: string;
  raw_name_contains: string;
  amount_min: string;
  amount_max: string;
  amount_exact: string;
  account_id: string;
  source: string;
  plaid_category: string;
  transaction_type: RuleTransactionType;
  set_category_id: string;
  set_notes: string;
  mark_as_transfer: boolean;
};

export default function RuleForm({
  rule,
  categories,
  accounts,
  defaults,
}: {
  rule?: TransactionRule;
  categories: Category[];
  accounts: Account[];
  defaults?: Partial<FormState>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: rule?.name ?? defaults?.name ?? "",
    enabled: rule?.enabled ?? true,
    priority: rule?.priority ?? 100,
    merchant_contains:
      rule?.merchant_contains ?? defaults?.merchant_contains ?? "",
    raw_name_contains: rule?.raw_name_contains ?? "",
    amount_min: rule?.amount_min?.toString() ?? "",
    amount_max: rule?.amount_max?.toString() ?? "",
    amount_exact: rule?.amount_exact?.toString() ?? "",
    account_id: rule?.account_id ?? "",
    source: rule?.source ?? "",
    plaid_category: rule?.plaid_category ?? "",
    transaction_type: rule?.transaction_type ?? "any",
    set_category_id:
      rule?.set_category_id ?? defaults?.set_category_id ?? "",
    set_notes: rule?.set_notes ?? "",
    mark_as_transfer: rule?.mark_as_transfer ?? false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    match_count: number;
    sample: { id: string; merchant_name: string | null; amount: number }[];
  } | null>(null);

  const update = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const buildPayload = () => ({
    name: form.name.trim(),
    enabled: form.enabled,
    priority: form.priority,
    merchant_contains: form.merchant_contains.trim() || null,
    raw_name_contains: form.raw_name_contains.trim() || null,
    amount_min: form.amount_min ? Number(form.amount_min) : null,
    amount_max: form.amount_max ? Number(form.amount_max) : null,
    amount_exact: form.amount_exact ? Number(form.amount_exact) : null,
    account_id: form.account_id || null,
    source: (form.source as TransactionSource) || null,
    plaid_category: form.plaid_category.trim() || null,
    transaction_type: form.transaction_type,
    set_category_id:
      !form.mark_as_transfer && form.set_category_id
        ? form.set_category_id
        : null,
    set_notes: form.set_notes.trim() || null,
    mark_as_transfer: form.mark_as_transfer,
  });

  const save = async () => {
    setErr(null);
    if (!form.name.trim()) {
      setErr("Name is required.");
      return;
    }
    if (!form.mark_as_transfer && !form.set_category_id) {
      setErr("Pick a category or enable Mark as transfer.");
      return;
    }
    setSubmitting(true);
    const url = rule ? `/api/rules/${rule.id}` : "/api/rules";
    const method = rule ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setErr(json.error ?? "save_failed");
      return;
    }
    router.push("/rules");
    router.refresh();
  };

  const runPreview = async () => {
    if (!rule) {
      setErr("Save the rule first to preview matches.");
      return;
    }
    const res = await fetch(`/api/rules/${rule.id}/test`, {
      method: "POST",
    });
    const json = await res.json();
    if (res.ok) setPreview(json);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Field label="Name *">
        <input
          type="text"
          className={inputCls}
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-xs uppercase tracking-wide text-zinc-500">
          Conditions (null = wildcard)
        </legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Merchant contains">
            <input
              type="text"
              className={inputCls}
              value={form.merchant_contains}
              onChange={(e) => update({ merchant_contains: e.target.value })}
            />
          </Field>
          <Field label="Raw name contains">
            <input
              type="text"
              className={inputCls}
              value={form.raw_name_contains}
              onChange={(e) => update({ raw_name_contains: e.target.value })}
            />
          </Field>
          <Field label="Amount = (exact)">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={form.amount_exact}
              onChange={(e) => update({ amount_exact: e.target.value })}
            />
          </Field>
          <Field label="Direction">
            <select
              className={inputCls}
              value={form.transaction_type}
              onChange={(e) =>
                update({
                  transaction_type: e.target
                    .value as RuleTransactionType,
                })
              }
            >
              <option value="any">any</option>
              <option value="debit">debit (outflow)</option>
              <option value="credit">credit (inflow)</option>
            </select>
          </Field>
          <Field label="Amount min">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={form.amount_min}
              onChange={(e) => update({ amount_min: e.target.value })}
            />
          </Field>
          <Field label="Amount max">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={form.amount_max}
              onChange={(e) => update({ amount_max: e.target.value })}
            />
          </Field>
          <Field label="Account">
            <select
              className={inputCls}
              value={form.account_id}
              onChange={(e) => update({ account_id: e.target.value })}
            >
              <option value="">— any —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select
              className={inputCls}
              value={form.source}
              onChange={(e) => update({ source: e.target.value })}
            >
              <option value="">— any —</option>
              <option value="plaid">plaid</option>
              <option value="csv">csv</option>
              <option value="apple_card">apple_card</option>
              <option value="manual">manual</option>
              <option value="manual_liability">manual_liability</option>
            </select>
          </Field>
          <Field label="Plaid category exact">
            <input
              type="text"
              className={inputCls}
              value={form.plaid_category}
              onChange={(e) => update({ plaid_category: e.target.value })}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs uppercase tracking-wide text-zinc-500">
          Then
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.mark_as_transfer}
            onChange={(e) =>
              update({ mark_as_transfer: e.target.checked })
            }
          />
          Mark as transfer (overrides category — routes to Account Transfer)
        </label>
        {!form.mark_as_transfer && (
          <Field label="Set category">
            <select
              className={inputCls}
              value={form.set_category_id}
              onChange={(e) => update({ set_category_id: e.target.value })}
            >
              <option value="">— pick one —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type} · {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Set notes (only if blank)">
          <input
            type="text"
            className={inputCls}
            value={form.set_notes}
            onChange={(e) => update({ set_notes: e.target.value })}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs uppercase tracking-wide text-zinc-500">
          Meta
        </legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Priority (lower = earlier)">
            <input
              type="number"
              step="1"
              className={inputCls}
              value={form.priority}
              onChange={(e) => update({ priority: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
      </fieldset>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={submitting}
          className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {submitting ? "Saving…" : rule ? "Save" : "Create"}
        </button>
        {rule && (
          <button
            type="button"
            onClick={runPreview}
            className="text-sm underline"
          >
            Preview matches (last 500 tx)
          </button>
        )}
      </div>

      {preview && (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-xs">
          <p>
            <strong>{preview.match_count}</strong> matches.
          </p>
          {preview.sample.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {preview.sample.map((s) => (
                <li key={s.id}>
                  {s.merchant_name ?? "(unknown)"} ·{" "}
                  <span className="font-mono">{s.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
