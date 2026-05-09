import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv/parse";
import { normalizeCsvRow } from "../normalize";
import {
  APPLE_CARD_PRESET,
  looksLikeAppleCard,
} from "../presets/apple-card";

const SAMPLE = `Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By
03/04/2026,03/05/2026,APPLE STORE,Apple,Shopping,Purchase,1099.00,Owner
03/06/2026,03/06/2026,WHOLE FOODS MARKET,Whole Foods,Grocery,Purchase,42.17,Owner
03/10/2026,03/10/2026,APPLE CARD PAYMENT,Apple,Payment,Payment,-500.00,Owner
`;

describe("apple-card preset", () => {
  it("detects an Apple Card export by header signature", () => {
    const { headers } = parseCsv(SAMPLE);
    expect(looksLikeAppleCard(headers)).toBe(true);
  });

  it("rejects an unrelated CSV", () => {
    expect(looksLikeAppleCard(["Date", "Amount", "Memo"])).toBe(false);
  });

  it("normalizes a row with the preset mapping", () => {
    const { rows } = parseCsv(SAMPLE);
    const result = normalizeCsvRow(rows[0], APPLE_CARD_PRESET.mapping, {
      source: "apple_card",
      source_account_id: "apple-card-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tx.date).toBe("2026-03-04");
      expect(result.tx.amount).toBe(1099);
      expect(result.tx.merchant_name).toBe("Apple");
      expect(result.tx.raw_name).toBe("APPLE STORE");
      expect(result.tx.source).toBe("apple_card");
    }
  });

  it("preserves negative amount on payment rows", () => {
    const { rows } = parseCsv(SAMPLE);
    const result = normalizeCsvRow(rows[2], APPLE_CARD_PRESET.mapping, {
      source: "apple_card",
      source_account_id: "apple-card-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tx.amount).toBe(-500);
  });
});
