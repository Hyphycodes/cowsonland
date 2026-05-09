import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid/client";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { public_token } = (await request.json()) as { public_token?: string };
  if (!public_token) {
    return NextResponse.json({ error: "missing_public_token" }, { status: 400 });
  }

  try {
    // Exchange public_token -> access_token + item_id
    const exchange = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    // Fetch institution metadata + accounts
    const [{ data: itemData }, { data: accountsData }] = await Promise.all([
      plaidClient.itemGet({ access_token }),
      plaidClient.accountsGet({ access_token }),
    ]);

    let institutionName: string | null = null;
    if (itemData.item.institution_id) {
      const { data: inst } = await plaidClient.institutionsGetById({
        institution_id: itemData.item.institution_id,
        country_codes: ["US"] as never,
      });
      institutionName = inst.institution.name;
    }

    // Service-role insert: access_token never touches RLS.
    const admin = createServiceClient();

    const { data: itemRow, error: itemErr } = await admin
      .from("plaid_items")
      .insert({
        user_id: user.id,
        item_id,
        access_token,
        institution_id: itemData.item.institution_id,
        institution_name: institutionName,
      })
      .select("id")
      .single();
    if (itemErr) throw itemErr;

    const accountRows = accountsData.accounts.map((a) => ({
      user_id: user.id,
      plaid_item_id: itemRow.id,
      plaid_account_id: a.account_id,
      name: a.name,
      official_name: a.official_name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      current_balance: a.balances.current,
      available_balance: a.balances.available,
      currency_code: a.balances.iso_currency_code ?? "USD",
      source: "plaid" as const,
    }));

    const { error: accErr } = await admin
      .from("accounts")
      .upsert(accountRows, { onConflict: "plaid_account_id" });
    if (accErr) throw accErr;

    return NextResponse.json({ ok: true, item_id: itemRow.id });
  } catch (err) {
    console.error("plaid exchange failed", err);
    return NextResponse.json({ error: "exchange_failed" }, { status: 500 });
  }
}
