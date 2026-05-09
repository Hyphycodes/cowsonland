"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Category, CategoryType } from "@/types/db";

const TYPES: CategoryType[] = ["expense", "income", "transfer"];
const TYPE_LABEL: Record<CategoryType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export default function CategoriesClient({
  initial,
}: {
  initial: Category[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const grouped: Record<CategoryType, Category[]> = {
    expense: [],
    income: [],
    transfer: [],
  };
  for (const c of initial) grouped[c.type].push(c);

  const seed = async () => {
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/categories/seed", { method: "POST" });
    if (!res.ok) {
      setErr("seed_failed");
    } else {
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Categories</h1>
        <button
          type="button"
          onClick={seed}
          disabled={busy}
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
        >
          {busy ? "Seeding…" : "Seed defaults"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {initial.length === 0 && (
        <p className="text-sm text-zinc-500">
          No categories yet. Click <strong>Seed defaults</strong> to start
          with a curated set.
        </p>
      )}

      {TYPES.map((type) => (
        <section key={type}>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              {TYPE_LABEL[type]}
            </h2>
            <CreateInline
              type={type}
              onCreated={() => router.refresh()}
            />
          </div>
          {grouped[type].length === 0 ? (
            <p className="text-sm text-zinc-500">None yet.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-2">
              {grouped[type].map((c) => (
                <CategoryRow
                  key={c.id}
                  cat={c}
                  onChange={() => router.refresh()}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function CreateInline({
  type,
  onCreated,
}: {
  type: CategoryType;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 underline"
      >
        + add
      </button>
    );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), type }),
        });
        if (res.ok) {
          setName("");
          setOpen(false);
          onCreated();
        }
        setBusy(false);
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
      />
      <button
        type="submit"
        disabled={busy}
        className="text-xs underline"
      >
        save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-zinc-500"
      >
        cancel
      </button>
    </form>
  );
}

function CategoryRow({
  cat,
  onChange,
}: {
  cat: Category;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);

  return (
    <li className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm">
      {editing ? (
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            if (name.trim() && name !== cat.name) {
              await fetch(`/api/categories/${cat.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
              });
              onChange();
            }
            setEditing(false);
          }}
          className="bg-transparent border-b border-zinc-400 outline-none text-sm w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 text-left"
        >
          {cat.icon && (
            <span aria-hidden className="w-5 text-center">
              {cat.icon}
            </span>
          )}
          <span>{cat.name}</span>
        </button>
      )}
      <button
        type="button"
        onClick={async () => {
          if (!confirm(`Delete category "${cat.name}"?`)) return;
          await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
          onChange();
        }}
        className="text-xs text-zinc-500 hover:text-red-600"
        aria-label="Delete"
      >
        ×
      </button>
    </li>
  );
}
