import { describe, expect, it } from "vitest";
import { detectCsvFormat, inferCsvMapping, validateCsvMapping } from "../presets";

describe("universal CSV detection", () => {
  it("detects known issuer presets", () => {
    const apple = detectCsvFormat([
      "Transaction Date",
      "Clearing Date",
      "Description",
      "Merchant",
      "Category",
      "Type",
      "Amount (USD)",
      "Purchased By",
    ]);
    expect(apple.preset_id).toBe("apple_card");
    expect(apple.source).toBe("apple_card");
    expect(apple.needs_user_mapping).toBe(false);

    const discover = detectCsvFormat([
      "Trans. Date",
      "Post Date",
      "Description",
      "Amount",
      "Category",
    ]);
    expect(discover.preset_id).toBe("discover");
  });

  it("infers generic bank headers", () => {
    const result = inferCsvMapping([
      "Posted Date",
      "Payee",
      "Withdrawal",
      "Deposit",
      "Reference Number",
    ]);
    expect(result.mapping?.date).toBe("Posted Date");
    expect(result.mapping?.merchant).toBe("Payee");
    expect(result.mapping?.debit).toBe("Withdrawal");
    expect(result.mapping?.credit).toBe("Deposit");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("validates AI mapping output against actual headers", () => {
    const ok = validateCsvMapping(
      {
        date: "Date",
        amount: "Amount",
        description: "Description",
        amount_inverted: false,
      },
      ["Date", "Amount", "Description"],
    );
    expect(ok.ok).toBe(true);

    const bad = validateCsvMapping(
      { date: "Made Up", amount: "Amount" },
      ["Date", "Amount"],
    );
    expect(bad.ok).toBe(false);
  });
});
