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
  source: "plaid" | "apple_card" | "manual_liability" | "csv" | "manual";
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

export type TransactionSource =
  | "plaid"
  | "csv"
  | "apple_card"
  | "manual"
  | "manual_liability";

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
  ai_category_reason: string | null;
  ai_confidence: number | null;
  ai_suggested_rule: Record<string, unknown> | null;
  pending: boolean;
  notes: string | null;
  source: TransactionSource | null;
  source_account_id: string | null;
  external_transaction_id: string | null;
  import_batch_id: string | null;
  dedupe_fingerprint: string | null;
  imported_at: string | null;
  raw_payload: Record<string, unknown> | null;
  category_source: CategorySource;
  applied_rule_id: string | null;
  is_split: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryType = "income" | "expense" | "transfer";
export type CategorySource = "manual" | "rule" | "plaid_default" | "ai" | "none";

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
};

export type RuleTransactionType = "debit" | "credit" | "any";

export type TransactionRule = {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  priority: number;
  merchant_contains: string | null;
  raw_name_contains: string | null;
  amount_min: number | null;
  amount_max: number | null;
  amount_exact: number | null;
  account_id: string | null;
  source: TransactionSource | null;
  plaid_category: string | null;
  transaction_type: RuleTransactionType;
  set_category_id: string | null;
  set_notes: string | null;
  mark_as_transfer: boolean;
  times_applied: number;
  last_applied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionSplit = {
  id: string;
  user_id: string;
  transaction_id: string;
  category_id: string | null;
  amount: number;
  notes: string | null;
  created_at: string;
};

export type ImportBatchSource = "csv" | "apple_card" | "plaid" | "manual";
export type ImportBatchStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export type ImportBatch = {
  id: string;
  user_id: string;
  source: ImportBatchSource;
  filename: string | null;
  status: ImportBatchStatus;
  rows_parsed: number;
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
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
