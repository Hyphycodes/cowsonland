import { NextResponse } from "next/server";
import { Products, CountryCode } from "plaid";
import {
  plaidClient,
  PLAID_PRODUCTS,
  PLAID_COUNTRY_CODES,
  PLAID_DAYS_REQUESTED,
} from "@/lib/plaid/client";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Finance",
      language: "en",
      country_codes: PLAID_COUNTRY_CODES as CountryCode[],
      products: PLAID_PRODUCTS as Products[],
      transactions: { days_requested: PLAID_DAYS_REQUESTED },
      webhook: process.env.PLAID_WEBHOOK_URL,
    });
    return NextResponse.json({ link_token: data.link_token });
  } catch (err) {
    console.error("plaid linkTokenCreate failed", err);
    return NextResponse.json({ error: "plaid_error" }, { status: 500 });
  }
}
