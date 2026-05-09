import { describe, expect, it } from "vitest";

/**
 * Pure function check on the same tolerance the split route uses. Lets
 * the rule cover floating-point edge cases without a Supabase round-trip.
 */
function splitsBalance(
  txAmount: number,
  splits: { amount: number }[],
  tol = 0.005,
): boolean {
  const sum = splits.reduce((s, r) => s + r.amount, 0);
  return Math.abs(sum - txAmount) <= tol;
}

describe("split validation", () => {
  it("accepts exact matches", () => {
    expect(splitsBalance(100, [{ amount: 60 }, { amount: 40 }])).toBe(true);
  });

  it("rejects under-allocations", () => {
    expect(splitsBalance(100, [{ amount: 60 }, { amount: 30 }])).toBe(false);
  });

  it("rejects over-allocations", () => {
    expect(splitsBalance(100, [{ amount: 60 }, { amount: 50 }])).toBe(false);
  });

  it("tolerates sub-cent floating-point drift", () => {
    expect(splitsBalance(100, [{ amount: 33.33 }, { amount: 33.33 }, { amount: 33.34 }])).toBe(true);
  });
});
