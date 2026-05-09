import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid/client";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { tryAutoLinkInstallment } from "@/lib/installments/auto-link";
import { fingerprint } from "@/lib/ingestion/fingerprint";
import type { PlaidItem, Transaction } from "@/types/db";

/**
 * Sync endpoint. Three callers:
 *  1. Vercel Cron (nightly) — Authorization: Bearer ${CRON_SECRET}
 *  2. Plaid webhooks (POST with body) — for now we just trigger a full sync
 *  3. The Connect page after linking — authenticated session
 *
 * Uses Plaid's /transactions/sync with a per-item cursor stored in plaid_items.
 */
async function syncAllItems() {
  const admin = createServiceClient();

  const { data: items, error } = await admin
    .from("plaid_items")
    .select("*")
    .eq("status", "active")
    .returns<PlaidItem[]>();

  if (error) throw error;
  if (!items?.length) return { synced: 0 };

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  for (const item of items) {
    let cursor = item.cursor ?? undefined;
    let hasMore = true;

    while (hasMore) {
      const { data } = await plaidClient.transactionsSync({
        access_token: item.access_token,
        cursor,
      });

      // Added + modified upsert
      const upserts = [...data.added, ...data.modified].map((t) => ({
        user_id: item.user_id,
        // account_id is resolved below via plaid_account_id
        plaid_account_id: t.account_id,
        plaid_transaction_id: t.transaction_id,
        date: t.date,
        authorized_date: t.authorized_date ?? null,
        amount: t.amount,
        currency_code: t.iso_currency_code ?? "USD",
        merchant_name: t.merchant_name ?? null,
        raw_name: t.name ?? null,
        plaid_category: t.personal_finance_category?.primary ?? null,
        plaid_category_detailed:
          t.personal_finance_category?.detailed ?? null,
        pending: t.pending,
      }));

      if (upserts.length) {
        // Resolve plaid_account_id -> internal account_id in one round-trip
        const plaidAccountIds = [...new Set(upserts.map((u) => u.plaid_account_id))];
        const { data: accs } = await admin
          .from("accounts")
          .select("id, plaid_account_id")
          .in("plaid_account_id", plaidAccountIds);

        const idMap = new Map(
          (accs ?? []).map((a) => [a.plaid_account_id, a.id]),
        );

        const rows = upserts
          .filter((u) => idMap.has(u.plaid_account_id))
          .map(({ plaid_account_id, ...rest }) => ({
            ...rest,
            account_id: idMap.get(plaid_account_id)!,
            source: "plaid",
            source_account_id: idMap.get(plaid_account_id)!,
            external_transaction_id: rest.plaid_transaction_id,
            dedupe_fingerprint: fingerprint({
              user_id: rest.user_id,
              source: "plaid",
              source_account_id: idMap.get(plaid_account_id)!,
              date: rest.date,
              amount: rest.amount,
              merchant: rest.merchant_name ?? rest.raw_name,
            }),
          }));

        if (rows.length) {
          const { data: upserted, error: txErr } = await admin
            .from("transactions")
            .upsert(rows, { onConflict: "plaid_transaction_id" })
            .select("id, user_id, date, amount, merchant_name, raw_name")
            .returns<
              Pick<
                Transaction,
                "id" | "user_id" | "date" | "amount" | "merchant_name" | "raw_name"
              >[]
            >();
          if (txErr) throw txErr;
          totalAdded += data.added.length;
          totalModified += data.modified.length;

          // Try BNPL auto-link for each freshly upserted transaction.
          // Failures here must not break the sync.
          for (const tx of upserted ?? []) {
            try {
              await tryAutoLinkInstallment(admin, tx);
            } catch (err) {
              console.error("auto-link failed", err);
            }
          }
        }
      }

      // Removed transactions
      if (data.removed.length) {
        const ids = data.removed.map((r) => r.transaction_id);
        await admin
          .from("transactions")
          .delete()
          .in("plaid_transaction_id", ids);
        totalRemoved += data.removed.length;
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    await admin
      .from("plaid_items")
      .update({ cursor, last_synced_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  return {
    synced: items.length,
    added: totalAdded,
    modified: totalModified,
    removed: totalRemoved,
  };
}

export async function GET(request: Request) {
  // Vercel Cron uses GET with Authorization header.
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncAllItems();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("cron sync failed", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Accept either a logged-in user OR a Bearer ${CRON_SECRET} (used by
  // Vercel Cron / verified webhook proxy). Plaid webhook signature
  // verification is TODO — until then, anonymous POSTs are rejected.
  await request.json().catch(() => null);

  const auth = request.headers.get("authorization");
  const hasCronSecret =
    !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;

  if (!hasCronSecret) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncAllItems();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sync failed", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
