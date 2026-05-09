import { describe, expect, it } from "vitest";
import { categorizeUnresolvedWithClaude } from "../categorize";

describe("AI fallback categorization", () => {
  it("is skipped when ANTHROPIC_API_KEY is missing", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await categorizeUnresolvedWithClaude(
      {} as Parameters<typeof categorizeUnresolvedWithClaude>[0],
      { user_id: "u1", transaction_ids: ["manual", "rule"] },
    );

    expect(result).toEqual({
      categorized: 0,
      review_needed: 2,
      skipped: true,
    });
    if (original) process.env.ANTHROPIC_API_KEY = original;
  });

  it("only asks the database for category_source='none' transactions", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    const eqCalls: Array<[string, string]> = [];

    const client = {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            eqCalls.push([column, value]);
            return this;
          },
          in() {
            return this;
          },
          is() {
            return this;
          },
          returns() {
            return Promise.resolve({
              data: table === "categories" ? [{ id: "c1", name: "Food", type: "expense" }] : [],
              error: null,
            });
          },
        };
      },
    } as unknown as Parameters<typeof categorizeUnresolvedWithClaude>[0];

    const result = await categorizeUnresolvedWithClaude(client, {
      user_id: "u1",
      transaction_ids: ["t1"],
    });

    expect(result.categorized).toBe(0);
    expect(eqCalls).toContainEqual(["category_source", "none"]);
    if (original) process.env.ANTHROPIC_API_KEY = original;
    else delete process.env.ANTHROPIC_API_KEY;
  });
});
