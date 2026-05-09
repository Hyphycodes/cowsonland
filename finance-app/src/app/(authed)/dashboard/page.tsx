import { createClient } from "@/lib/supabase/server";
import type { Account, Transaction } from "@/types/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<Account[]>(),
    supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .limit(20)
      .returns<Transaction[]>(),
  ]);

  const netWorth = (accounts ?? []).reduce(
    (sum, a) => sum + (a.current_balance ?? 0) * (a.type === "credit" ? -1 : 1),
    0,
  );

  return (
    <div className="space-y-10">
      {/* Net worth tile */}
      <section>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Net worth
        </p>
        <p className="mt-1 text-4xl font-mono tabular-nums">{fmt(netWorth)}</p>
      </section>

      {/* Accounts */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Accounts
          </h2>
          <Link
            href="/connect"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            + Connect bank
          </Link>
        </div>

        {accounts && accounts.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-zinc-500">
                    {a.type ?? "—"}
                    {a.mask ? ` ···· ${a.mask}` : ""}
                  </p>
                </div>
                <p className="font-mono tabular-nums">
                  {fmt(a.current_balance)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No accounts yet.{" "}
            <Link href="/connect" className="underline">
              Connect a bank
            </Link>{" "}
            to get started.
          </p>
        )}
      </section>

      {/* Recent transactions */}
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-3">
          Recent transactions
        </h2>

        {transactions && transactions.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="px-4 py-3 flex items-center justify-between text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {t.merchant_name ?? t.raw_name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {t.date}
                    {t.plaid_category ? ` · ${t.plaid_category}` : ""}
                  </p>
                </div>
                <p
                  className={`font-mono tabular-nums ${
                    t.amount < 0 ? "text-emerald-600" : ""
                  }`}
                >
                  {fmt(t.amount)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No transactions yet. Connect a bank to pull data.
          </p>
        )}
      </section>
    </div>
  );
}
