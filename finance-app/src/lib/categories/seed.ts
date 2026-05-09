import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryType } from "@/types/db";

type Seed = {
  name: string;
  type: CategoryType;
  color?: string;
  icon?: string;
};

/**
 * Default starter categories. Insertion is idempotent on
 * (user_id, name) — running this twice is safe and won't overwrite
 * any user edits to existing rows (we only insert; no update).
 *
 * sort_order is implicit by array position so categories list cleanly
 * in the UI before the user reorders.
 */
const SEEDS: Seed[] = [
  // Expense
  { name: "Groceries", type: "expense", color: "#16a34a", icon: "🛒" },
  { name: "Restaurants", type: "expense", color: "#f97316", icon: "🍽" },
  { name: "Coffee", type: "expense", color: "#a16207", icon: "☕" },
  { name: "Transportation", type: "expense", color: "#0ea5e9", icon: "🚇" },
  { name: "Gas", type: "expense", color: "#dc2626", icon: "⛽" },
  { name: "Travel", type: "expense", color: "#7c3aed", icon: "✈️" },
  { name: "Shopping", type: "expense", color: "#ec4899", icon: "🛍" },
  { name: "Electronics", type: "expense", color: "#0f766e", icon: "💻" },
  { name: "Subscriptions", type: "expense", color: "#475569", icon: "🔁" },
  { name: "Bills & Utilities", type: "expense", color: "#0369a1", icon: "💡" },
  { name: "Rent / Mortgage", type: "expense", color: "#1e40af", icon: "🏠" },
  { name: "Health", type: "expense", color: "#be123c", icon: "⚕️" },
  { name: "Personal Care", type: "expense", color: "#9333ea", icon: "🧴" },
  { name: "Entertainment", type: "expense", color: "#ea580c", icon: "🎬" },
  { name: "Fees", type: "expense", color: "#525252", icon: "💸" },
  { name: "Other", type: "expense", color: "#71717a", icon: "•" },
  // Income
  { name: "Paycheck", type: "income", color: "#15803d", icon: "💼" },
  { name: "Refund", type: "income", color: "#0d9488", icon: "↩️" },
  { name: "Other Income", type: "income", color: "#65a30d", icon: "💰" },
  // Transfer
  { name: "Credit Card Payment", type: "transfer", color: "#6366f1", icon: "💳" },
  { name: "Account Transfer", type: "transfer", color: "#3b82f6", icon: "↔️" },
];

export async function seedDefaultCategories(
  client: SupabaseClient,
  userId: string,
): Promise<{ inserted: number }> {
  const rows = SEEDS.map((s, i) => ({
    user_id: userId,
    name: s.name,
    type: s.type,
    color: s.color ?? null,
    icon: s.icon ?? null,
    sort_order: i,
  }));

  // unique(user_id, name) makes this an upsert-with-ignore.
  const { data, error } = await client
    .from("categories")
    .upsert(rows, {
      onConflict: "user_id,name",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw error;
  return { inserted: data?.length ?? 0 };
}

/**
 * Find or create the canonical "Account Transfer" category for the
 * user. Used by the rules engine when a rule has mark_as_transfer=true.
 */
export async function ensureTransferCategory(
  client: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing } = await client
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "transfer")
    .eq("name", "Account Transfer")
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await client
    .from("categories")
    .insert({
      user_id: userId,
      name: "Account Transfer",
      type: "transfer",
      color: "#3b82f6",
      icon: "↔️",
      sort_order: 9999,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
