/**
 * Minimal DB types for the scaffold. Once you have the schema running,
 * replace this with the generated output from:
 *   supabase gen types typescript --project-id YOUR_REF > src/types/db.ts
 */

export type Account = {
  id: string;
  user_id: string;
  plaid_item_id: string | null;
  plaid_account_id: string | null;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  currency_code: string | null;
  source: "plaid" | "apple_card";
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  plaid_transaction_id: string | null;
  date: string;
  authorized_date: string | null;
  amount: number;
  currency_code: string | null;
  merchant_name: string | null;
  raw_name: string | null;
  plaid_category: string | null;
  plaid_category_detailed: string | null;
  category_id: string | null;
  ai_category: string | null;
  pending: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaidItem = {
  id: string;
  user_id: string;
  item_id: string;
  access_token: string;
  institution_id: string | null;
  institution_name: string | null;
  cursor: string | null;
  status: string;
  last_synced_at: string | null;
  created_at: string;
};
