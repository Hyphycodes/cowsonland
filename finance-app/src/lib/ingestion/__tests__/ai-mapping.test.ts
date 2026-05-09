import { describe, expect, it } from "vitest";
import { suggestCsvMappingWithClaude } from "../ai-mapping";

describe("AI mapping fallback", () => {
  it("returns null when ANTHROPIC_API_KEY is missing", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      suggestCsvMappingWithClaude({
        headers: ["Date", "Amount", "Description"],
        sampleRows: [],
      }),
    ).resolves.toBeNull();
    if (original) process.env.ANTHROPIC_API_KEY = original;
  });
});
