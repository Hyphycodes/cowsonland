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
  source: "plaid" | "apple_card" | "manual_liability";
  created_at: string;
  updated_at: string;
};

export type InstallmentKind = "bnpl" | "card_promo";
export type InstallmentStatus = "active" | "paid_off" | "defaulted";
export type InstallmentPaymentStatus =
  | "scheduled"
  | "paid"
  | "missed"
  | "partial"
  | "overpaid";

export type InstallmentPlan = {
  id: string;
  user_id: string;
  name: string;
  merchant: string;
  purchase_date: string;
  total_amount: number;
  term_months: number;
  monthly_minimum: number;
  apr: number;
  promo_end_date: string | null;
  kind: InstallmentKind;
  status: InstallmentStatus;
  payment_source_account_id: string | null;
  liability_account_id: string | null;
  purchase_category_id: string | null;
  notes: string | null;
  paid_off_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InstallmentPayment = {
  id: string;
  user_id: string;
  plan_id: string;
  transaction_id: string | null;
  expected_date: string;
  expected_amount: number;
  actual_date: string | null;
  actual_amount: number | null;
  status: InstallmentPaymentStatus;
  created_at: string;
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
