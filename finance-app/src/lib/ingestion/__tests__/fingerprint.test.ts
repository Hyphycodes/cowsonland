import { describe, expect, it } from "vitest";
import { fingerprint } from "../fingerprint";

describe("fingerprint", () => {
  const base = {
    user_id: "u1",
    source: "csv",
    source_account_id: "acct1",
    date: "2026-01-10",
    amount: 12.34,
    merchant: "Whole Foods",
  };

  it("is stable for identical input", () => {
    expect(fingerprint(base)).toBe(fingerprint(base));
  });

  it("ignores merchant punctuation and case", () => {
    expect(
      fingerprint({ ...base, merchant: "WHOLE-FOODS!!" }),
    ).toBe(fingerprint(base));
  });

  it("rounds to integer cents", () => {
    expect(fingerprint({ ...base, amount: 12.339999 })).toBe(
      fingerprint({ ...base, amount: 12.34 }),
    );
  });

  it("differs when account changes", () => {
    expect(
      fingerprint({ ...base, source_account_id: "acct2" }),
    ).not.toBe(fingerprint(base));
  });

  it("differs when source changes", () => {
    expect(fingerprint({ ...base, source: "plaid" })).not.toBe(
      fingerprint(base),
    );
  });

  it("differs when amount sign flips", () => {
    expect(fingerprint({ ...base, amount: -12.34 })).not.toBe(
      fingerprint(base),
    );
  });
});
