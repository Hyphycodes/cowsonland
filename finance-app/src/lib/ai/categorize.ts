import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaudeJson, claudeAvailable } from "@/lib/ai/claude";
import type { Category, Transaction } from "@/types/db";

type AiSuggestion = {
  transaction_id: string;
  category_id?: string | null;
  category_name?: string | null;
  confidence?: number;
  reason?: string | null;
  suggested_rule?: {
    merchant_contains?: string | null;
    raw_name_contains?: string | null;
    amount_exact?: number | null;
    transaction_type?: "debit" | "credit" | "any";
    set_category_id?: string | null;
    set_category_name?: string | null;
  } | null;
};

type AiResponse = { suggestions?: AiSuggestion[] };

type CategorizeTx = Pick<
  Transaction,
  | "id"
  | "date"
  | "amount"
  | "merchant_name"
  | "raw_name"
  | "plaid_category"
  | "category_id"
  | "category_source"
>;

export async function categorizeUnresolvedWithClaude(
  admin: SupabaseClient,
  args: { user_id: string; transaction_ids: string[] },
): Promise<{ categorized: number; review_needed: number; skipped: boolean }> {
  if (!claudeAvailable() || args.transaction_ids.length === 0) {
    return { categorized: 0, review_needed: args.transaction_ids.length, skipped: true };
  }

  const [{ data: categories }, { data: txs }] = await Promise.all([
    admin
      .from("categories")
      .select("id, name, type")
      .eq("user_id", args.user_id)
      .returns<Pick<Category, "id" | "name" | "type">[]>(),
    admin
      .from("transactions")
      .select("id, date, amount, merchant_name, raw_name, plaid_category, category_id, category_source")
      .eq("user_id", args.user_id)
      .in("id", args.transaction_ids)
      .is("category_id", null)
      .eq("category_source", "none")
      .returns<CategorizeTx[]>(),
  ]);

  if (!txs?.length || !categories?.length) {
    return { categorized: 0, review_needed: txs?.length ?? 0, skipped: false };
  }

  let categorized = 0;
  for (let i = 0; i < txs.length; i += 20) {
    const batch = txs.slice(i, i + 20);
    const suggestions = await askBatch(batch, categories);
    if (!suggestions.length) continue;
    for (const suggestion of suggestions) {
      const tx = batch.find((t) => t.id === suggestion.transaction_id);
      if (!tx) continue;
      const category = matchCategory(suggestion, categories);
      if (!category) continue;

      const confidence = clampConfidence(suggestion.confidence);
      const { error } = await admin
        .from("transactions")
        .update({
          category_id: category.id,
          category_source: "ai",
          ai_category: category.name,
          ai_category_reason: suggestion.reason ?? null,
          ai_confidence: confidence,
          ai_suggested_rule: normalizeSuggestedRule(suggestion, category.id),
          applied_rule_id: null,
        })
        .eq("id", tx.id)
        .eq("category_source", "none")
        .is("category_id", null);
      if (!error) categorized += 1;
    }
  }

  return { categorized, review_needed: txs.length - categorized, skipped: false };
}

async function askBatch(
  txs: CategorizeTx[],
  categories: Pick<Category, "id" | "name" | "type">[],
) {
  const response = await askClaudeJson<AiResponse>({
    system:
      "You categorize personal finance transactions using only the provided existing categories. You never invent categories.",
    prompt: JSON.stringify({
      task: "Suggest categories and obvious reusable rules for uncategorized transactions.",
      categories,
      transactions: txs.map((t) => ({
        id: t.id,
        date: t.date,
        amount: t.amount,
        merchant_name: t.merchant_name,
        raw_name: t.raw_name,
        source_category: t.plaid_category,
      })),
      rules: [
        "Use category_id when possible.",
        "If unsure, omit the transaction.",
        "Do not create new categories.",
        "confidence is 0..1.",
        "suggested_rule should be included only for recurring obvious merchant patterns.",
      ],
      response_shape: {
        suggestions: [
          {
            transaction_id: "id",
            category_id: "existing category id or null",
            category_name: "existing category name or null",
            confidence: "0..1",
            reason: "short reason",
            suggested_rule: "optional rule object",
          },
        ],
      },
    }),
    maxTokens: 1800,
  });
  return response?.suggestions ?? [];
}

function matchCategory(
  suggestion: AiSuggestion,
  categories: Pick<Category, "id" | "name" | "type">[],
) {
  if (suggestion.category_id) {
    const byId = categories.find((c) => c.id === suggestion.category_id);
    if (byId) return byId;
  }
  if (suggestion.category_name) {
    const wanted = suggestion.category_name.toLowerCase();
    return categories.find((c) => c.name.toLowerCase() === wanted) ?? null;
  }
  return null;
}

function normalizeSuggestedRule(suggestion: AiSuggestion, categoryId: string) {
  if (!suggestion.suggested_rule) return null;
  return {
    merchant_contains: suggestion.suggested_rule.merchant_contains ?? null,
    raw_name_contains: suggestion.suggested_rule.raw_name_contains ?? null,
    amount_exact:
      typeof suggestion.suggested_rule.amount_exact === "number"
        ? suggestion.suggested_rule.amount_exact
        : null,
    transaction_type: suggestion.suggested_rule.transaction_type ?? "any",
    set_category_id: categoryId,
  };
}

function clampConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.5;
}
