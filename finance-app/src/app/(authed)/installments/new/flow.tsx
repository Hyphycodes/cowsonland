"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Account, InstallmentKind } from "@/types/db";
import { fmtUsd } from "@/lib/installments/format";

type Category = { id: string; name: string };

type Form = {
  name: string;
  merchant: string;
  kind: InstallmentKind | "regular";
  total_amount: string;
  purchase_date: string;
  term_months: string;
  monthly_minimum: string;
  promo_end_date: string;
  apr: string;
  payment_source_account_id: string;
  purchase_category_id: string;
};

const empty: Form = {
  name: "",
  merchant: "",
  kind: "bnpl",
  total_amount: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  term_months: "",
  monthly_minimum: "",
  promo_end_date: "",
  apr: "0",
  payment_source_account_id: "",
  purchase_category_id: "",
};

const stepLabels = [
  "What did you buy?",
  "How are you paying?",
  "What's the total?",
  "What's the plan?",
  "Any catches?",
  "Which account pays?",
  "Review",
];

export default function NewPlanFlow({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<Form>) =>
    setForm((f) => ({ ...f, ...patch }));

  // Smart default: Apple Card → 24 mo 0% APR
  const applyKindDefaults = (kind: Form["kind"]) => {
    const patch: Partial<Form> = { kind };
    if (kind === "card_promo" && /apple/i.test(form.merchant)) {
      patch.term_months ||= "24";
      patch.apr = "0";
    }
    update(patch);
  };

  const next = () => setStep((s) => Math.min(s + 1, stepLabels.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/installments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          merchant: form.merchant,
          purchase_date: form.purchase_date,
          total_amount: Number(form.total_amount),
          term_months: Number(form.term_months),
          monthly_minimum: Number(form.monthly_minimum),
          apr: Number(form.apr || 0),
          promo_end_date: form.promo_end_date || null,
          kind: form.kind === "regular" ? "card_promo" : form.kind,
          payment_source_account_id:
            form.payment_source_account_id || null,
          purchase_category_id: form.purchase_category_id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "create_failed");
      router.push(`/installments/${json.plan.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
      setSubmitting(false);
    }
  };

  // Step 2 has a "regular credit card" escape hatch.
  if (form.kind === "regular" && step >= 2) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <p className="text-sm">
          A regular credit card purchase doesn&apos;t need a plan — it&apos;ll
          just show up as a normal transaction once Plaid syncs. Nothing to
          track here.
        </p>
        <button
          type="button"
          onClick={() => router.push("/installments")}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
        >
          Back to installments
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Step {step + 1} of {stepLabels.length}
        </p>
        <h1 className="text-xl font-medium">{stepLabels[step]}</h1>
      </div>

      <div className="space-y-4">
        {step === 0 && (
          <>
            <Field label="Name" hint="e.g. Sony A7IV camera">
              <input
                type="text"
                className={inputCls}
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Merchant" hint="e.g. Best Buy, Affirm, Apple">
              <input
                type="text"
                className={inputCls}
                value={form.merchant}
                onChange={(e) => update({ merchant: e.target.value })}
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <div className="space-y-2">
            <KindButton
              label="BNPL (Affirm, Klarna, Best Buy financing)"
              hint="Separate loan — creates a virtual liability account"
              selected={form.kind === "bnpl"}
              onClick={() => applyKindDefaults("bnpl")}
            />
            <KindButton
              label="Card promo (Apple Card monthly, Citi Flex Pay)"
              hint="Lives on the credit card — metadata only"
              selected={form.kind === "card_promo"}
              onClick={() => applyKindDefaults("card_promo")}
            />
            <KindButton
              label="Regular credit card (no plan)"
              hint="Just a normal purchase — no tracking needed"
              selected={form.kind === "regular"}
              onClick={() => applyKindDefaults("regular")}
            />
          </div>
        )}

        {step === 2 && (
          <>
            <Field label="Total amount">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  className={`${inputCls} pl-7`}
                  value={form.total_amount}
                  onChange={(e) => update({ total_amount: e.target.value })}
                  autoFocus
                />
              </div>
            </Field>
            <Field label="Purchase date">
              <input
                type="date"
                className={inputCls}
                value={form.purchase_date}
                onChange={(e) => update({ purchase_date: e.target.value })}
              />
            </Field>
            <Field label="Purchase category" hint="Optional">
              <select
                className={inputCls}
                value={form.purchase_category_id}
                onChange={(e) =>
                  update({ purchase_category_id: e.target.value })
                }
              >
                <option value="">— none —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Term (months)">
              <input
                type="number"
                step="1"
                className={inputCls}
                value={form.term_months}
                onChange={(e) => update({ term_months: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Monthly minimum">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  className={`${inputCls} pl-7`}
                  value={form.monthly_minimum}
                  onChange={(e) =>
                    update({ monthly_minimum: e.target.value })
                  }
                />
              </div>
            </Field>
            {form.total_amount && form.term_months && !form.monthly_minimum && (
              <button
                type="button"
                className="text-xs underline text-zinc-500"
                onClick={() =>
                  update({
                    monthly_minimum: (
                      Number(form.total_amount) / Number(form.term_months)
                    ).toFixed(2),
                  })
                }
              >
                Use{" "}
                {fmtUsd(
                  Number(form.total_amount) / Number(form.term_months),
                )}
                /mo (linear)
              </button>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Field
              label="Promo end date"
              hint="Deferred-interest plans charge full retro-interest after this. Leave blank if not applicable."
            >
              <input
                type="date"
                className={inputCls}
                value={form.promo_end_date}
                onChange={(e) => update({ promo_end_date: e.target.value })}
              />
            </Field>
            <Field label="APR" hint="0 for promo financing.">
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={form.apr}
                onChange={(e) => update({ apr: e.target.value })}
              />
            </Field>
          </>
        )}

        {step === 5 && (
          <>
            <Field label="Account that pays" hint="Optional but useful for auto-link.">
              <select
                className={inputCls}
                value={form.payment_source_account_id}
                onChange={(e) =>
                  update({ payment_source_account_id: e.target.value })
                }
              >
                <option value="">— none —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.mask ? ` ···· ${a.mask}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {form.kind === "bnpl" && (
              <p className="text-xs text-zinc-500 leading-relaxed">
                A virtual liability account ({form.merchant} – {form.name})
                will be created so this debt shows up in net worth and
                decreases as you pay it down.
              </p>
            )}
          </>
        )}

        {step === 6 && (
          <div className="text-sm space-y-2 border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
            <Row k="Item" v={form.name} />
            <Row k="Merchant" v={form.merchant} />
            <Row
              k="Kind"
              v={form.kind === "bnpl" ? "BNPL" : "Card promo"}
            />
            <Row k="Total" v={fmtUsd(Number(form.total_amount))} />
            <Row k="Purchase date" v={form.purchase_date} />
            <Row
              k="Plan"
              v={`${form.term_months}mo @ ${fmtUsd(Number(form.monthly_minimum))}/mo`}
            />
            {form.promo_end_date && (
              <Row k="Promo ends" v={form.promo_end_date} />
            )}
            {Number(form.apr) > 0 && <Row k="APR" v={`${form.apr}%`} />}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          className="text-sm text-zinc-500 disabled:opacity-40"
          onClick={back}
          disabled={step === 0 || submitting}
        >
          ← Back
        </button>
        {step < stepLabels.length - 1 ? (
          <button
            type="button"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={next}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-4 py-1.5 text-sm disabled:opacity-50"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Create plan"}
          </button>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </label>
  );
}

function KindButton({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md border px-4 py-3 text-sm ${
        selected
          ? "border-zinc-900 dark:border-zinc-100"
          : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      }`}
    >
      <p className="font-medium">{label}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{k}</span>
      <span className="font-mono tabular-nums text-right">{v}</span>
    </div>
  );
}
