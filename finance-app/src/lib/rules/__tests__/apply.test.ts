import { describe, expect, it } from "vitest";
import type { TransactionRule } from "@/types/db";
import { ruleMatches, applyRulesToTransaction } from "../apply";

const baseRule: TransactionRule = {
  id: "r1",
  user_id: "u1",
  name: "Test",
  enabled: true,
  priority: 100,
  merchant_contains: null,
  raw_name_contains: null,
  amount_min: null,
  amount_max: null,
  amount_exact: null,
  account_id: null,
  source: null,
  plaid_category: null,
  transaction_type: "any",
  set_category_id: "cat-shopping",
  set_notes: null,
  mark_as_transfer: false,
  times_applied: 0,
  last_applied_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseTx = {
  id: "t1",
  user_id: "u1",
  amount: 12.34,
  merchant_name: "Whole Foods Market",
  raw_name: "WHOLE FOODS MARKET #123",
  account_id: "acc1",
  source: "csv" as const,
  plaid_category: null,
  category_id: null,
  category_source: "none" as const,
  notes: null,
};

describe("ruleMatches", () => {
  it("matches when merchant contains substring (case-insensitive)", () => {
    const r = { ...baseRule, merchant_contains: "whole foods" };
    expect(ruleMatches(r, baseTx)).toBe(true);
  });

  it("rejects when merchant doesn't contain substring", () => {
    const r = { ...baseRule, merchant_contains: "trader joe" };
    expect(ruleMatches(r, baseTx)).toBe(false);
  });

  it("uses absolute amount for amount_exact", () => {
    const r = { ...baseRule, amount_exact: 12.34 };
    expect(ruleMatches(r, baseTx)).toBe(true);
    expect(ruleMatches(r, { ...baseTx, amount: -12.34 })).toBe(true);
  });

  it("respects amount_min and amount_max as a range", () => {
    const r = { ...baseRule, amount_min: 10, amount_max: 15 };
    expect(ruleMatches(r, baseTx)).toBe(true);
    expect(ruleMatches(r, { ...baseTx, amount: 5 })).toBe(false);
    expect(ruleMatches(r, { ...baseTx, amount: 20 })).toBe(false);
  });

  it("respects transaction_type debit/credit", () => {
    const debit = { ...baseRule, transaction_type: "debit" as const };
    const credit = { ...baseRule, transaction_type: "credit" as const };
    expect(ruleMatches(debit, baseTx)).toBe(true);
    expect(ruleMatches(debit, { ...baseTx, amount: -50 })).toBe(false);
    expect(ruleMatches(credit, { ...baseTx, amount: -50 })).toBe(true);
    expect(ruleMatches(credit, baseTx)).toBe(false);
  });

  it("requires source match when set", () => {
    const r = { ...baseRule, source: "plaid" as const };
    expect(ruleMatches(r, baseTx)).toBe(false);
    expect(ruleMatches(r, { ...baseTx, source: "plaid" })).toBe(true);
  });
});

/**
 * Lightweight fake client for applyRulesToTransaction. Records writes
 * so assertions can verify them.
 */
type FakeOptions = {
  rules: TransactionRule[];
  transferCategoryId?: string;
  plaidCategoryName?: { id: string; name: string };
};

function makeAdmin(opts: FakeOptions) {
  const writes: Record<string, unknown[]> = {};
  const record = (k: string, v: unknown) => {
    writes[k] = writes[k] ?? [];
    writes[k].push(v);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = (table: string) => {
    let kind: "select" | "update" | "insert" = "select";
    let updatePayload: unknown = null;
    let _eq: Record<string, string> = {};
    return {
      select() {
        kind = "select";
        return this;
      },
      update(payload: unknown) {
        kind = "update";
        updatePayload = payload;
        return this;
      },
      insert(payload: unknown) {
        kind = "insert";
        record(`${table}.insert`, payload);
        return this;
      },
      eq(k: string, v: string) {
        _eq = { ..._eq, [k]: v };
        return this;
      },
      ilike(_k: string, v: string) {
        _eq = { ..._eq, name_ilike: v };
        return this;
      },
      order() {
        return this;
      },
      maybeSingle() {
        if (table === "categories") {
          if (
            opts.transferCategoryId &&
            _eq.type === "transfer" &&
            _eq.name === "Account Transfer"
          ) {
            return Promise.resolve({
              data: { id: opts.transferCategoryId },
              error: null,
            });
          }
          if (
            opts.plaidCategoryName &&
            (_eq.name_ilike ?? "").toLowerCase() ===
              opts.plaidCategoryName.name.toLowerCase()
          ) {
            return Promise.resolve({
              data: opts.plaidCategoryName,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (kind === "insert" && table === "categories") {
          return Promise.resolve({ data: { id: "new-cat" }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(onFulfilled: (r: { data: unknown[]; error: null }) => void) {
        if (kind === "update") {
          record(`${table}.update`, { eq: _eq, payload: updatePayload });
          onFulfilled({ data: [], error: null });
          return;
        }
        if (table === "transaction_rules" && kind === "select") {
          onFulfilled({ data: opts.rules, error: null });
          return;
        }
        onFulfilled({ data: [], error: null });
      },
      returns() {
        return this;
      },
    };
  };

  return {
    client: { from: builder } as unknown as Parameters<
      typeof applyRulesToTransaction
    >[0],
    writes,
  };
}

describe("applyRulesToTransaction", () => {
  it("returns no_match when there are no rules and no plaid category", async () => {
    const { client } = makeAdmin({ rules: [] });
    const r = await applyRulesToTransaction(client, baseTx);
    expect(r.matched).toBe(false);
    expect(r.source).toBe("none");
  });

  it("applies a single matching rule and writes manual-locked category_source='rule'", async () => {
    const rule = { ...baseRule, merchant_contains: "whole foods" };
    const { client, writes } = makeAdmin({ rules: [rule] });
    const r = await applyRulesToTransaction(client, baseTx);
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.source).toBe("rule");
      expect(r.category_id).toBe("cat-shopping");
    }
    const txUpdate = writes["transactions.update"]?.[0] as {
      payload: Record<string, unknown>;
    };
    expect(txUpdate.payload.category_source).toBe("rule");
    expect(txUpdate.payload.applied_rule_id).toBe("r1");
  });

  it("respects priority — first match (lowest priority int) wins", async () => {
    const ruleA: TransactionRule = {
      ...baseRule,
      id: "rA",
      priority: 50,
      merchant_contains: "whole",
      set_category_id: "catA",
    };
    const ruleB: TransactionRule = {
      ...baseRule,
      id: "rB",
      priority: 100,
      merchant_contains: "foods",
      set_category_id: "catB",
    };
    // Pre-sorted ascending — apply.ts re-sorts via DB but the fake just
    // returns them in order.
    const { client } = makeAdmin({ rules: [ruleA, ruleB] });
    const r = await applyRulesToTransaction(client, baseTx);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.category_id).toBe("catA");
  });

  it("never overwrites manual categorization", async () => {
    const rule = { ...baseRule, merchant_contains: "whole foods" };
    const { client, writes } = makeAdmin({ rules: [rule] });
    const r = await applyRulesToTransaction(client, {
      ...baseTx,
      category_source: "manual",
    });
    expect(r.matched).toBe(false);
    expect(r.source).toBe("manual");
    expect(writes["transactions.update"]).toBeUndefined();
  });

  it("routes mark_as_transfer rules to the canonical Account Transfer category", async () => {
    const rule: TransactionRule = {
      ...baseRule,
      merchant_contains: "whole foods",
      mark_as_transfer: true,
      set_category_id: null,
    };
    const { client } = makeAdmin({
      rules: [rule],
      transferCategoryId: "transfer-cat",
    });
    const r = await applyRulesToTransaction(client, baseTx);
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.category_id).toBe("transfer-cat");
  });

  it("falls back to plaid_default when no rule matches but plaid_category maps to a category", async () => {
    const { client } = makeAdmin({
      rules: [],
      plaidCategoryName: { id: "groc-cat", name: "Groceries" },
    });
    const r = await applyRulesToTransaction(client, {
      ...baseTx,
      plaid_category: "Groceries",
    });
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.source).toBe("plaid_default");
      expect(r.category_id).toBe("groc-cat");
    }
  });
});
