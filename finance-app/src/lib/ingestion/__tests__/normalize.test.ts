import { describe, expect, it } from "vitest";
import { normalizeCsvRow, parseAmount, parseDate } from "../normalize";

describe("parseDate", () => {
  it("passes through ISO", () => {
    expect(parseDate("2026-03-04")).toBe("2026-03-04");
  });
  it("parses MM/DD/YYYY by default", () => {
    expect(parseDate("3/4/2026")).toBe("2026-03-04");
  });
  it("parses DD/MM/YYYY when told", () => {
    expect(parseDate("4/3/2026", "DD/MM/YYYY")).toBe("2026-03-04");
  });
  it("expands 2-digit year", () => {
    expect(parseDate("3/4/26")).toBe("2026-03-04");
  });
  it("returns null on garbage", () => {
    expect(parseDate("not a date")).toBe(null);
  });
});

describe("parseAmount", () => {
  it("strips $ and commas", () => {
    expect(parseAmount("$1,234.56")).toBe(1234.56);
  });
  it("treats parens as negative", () => {
    expect(parseAmount("(45.00)")).toBe(-45);
  });
  it("handles unicode minus", () => {
    expect(parseAmount("−12.50")).toBe(-12.5);
  });
  it("returns null on empty", () => {
    expect(parseAmount("")).toBe(null);
  });
});

describe("normalizeCsvRow", () => {
  it("normalizes a single-amount row", () => {
    const result = normalizeCsvRow(
      { Date: "2026-01-10", Amount: "12.34", Merchant: "Whole Foods" },
      { date: "Date", amount: "Amount", merchant: "Merchant" },
      { source: "csv", source_account_id: "acct1" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tx.date).toBe("2026-01-10");
      expect(result.tx.amount).toBe(12.34);
      expect(result.tx.merchant_name).toBe("Whole Foods");
      expect(result.tx.source).toBe("csv");
    }
  });

  it("flips sign when amount_inverted", () => {
    const result = normalizeCsvRow(
      { Date: "2026-01-10", Amount: "-50" },
      { date: "Date", amount: "Amount", amount_inverted: true },
      { source: "csv", source_account_id: null },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tx.amount).toBe(50);
  });

  it("combines split debit/credit columns", () => {
    const result = normalizeCsvRow(
      { Date: "2026-01-10", Debit: "100", Credit: "" },
      { date: "Date", debit: "Debit", credit: "Credit" },
      { source: "csv", source_account_id: null },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tx.amount).toBe(100);
  });

  it("rejects rows with unparseable date", () => {
    const result = normalizeCsvRow(
      { Date: "garbage", Amount: "10" },
      { date: "Date", amount: "Amount" },
      { source: "csv", source_account_id: null },
    );
    expect(result.ok).toBe(false);
  });
});
