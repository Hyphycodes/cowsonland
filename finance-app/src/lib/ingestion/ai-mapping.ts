import { askClaudeJson, claudeAvailable } from "@/lib/ai/claude";
import type { CsvMapping } from "./types";
import { validateCsvMapping } from "./presets";

type MappingResponse = {
  institution?: string | null;
  confidence?: number;
  mapping?: unknown;
  notes?: string | null;
};

export async function suggestCsvMappingWithClaude(args: {
  headers: string[];
  sampleRows: Record<string, string>[];
}): Promise<{
  mapping: CsvMapping;
  confidence: number;
  institution: string | null;
  notes: string | null;
} | null> {
  if (!claudeAvailable()) return null;

  const response = await askClaudeJson<MappingResponse>({
    system:
      "You identify financial statement CSV columns. Map only to exact header names provided by the user.",
    prompt: JSON.stringify({
      task: "Suggest a CSV mapping for import into a finance app.",
      allowed_fields: [
        "date",
        "merchant",
        "description",
        "amount",
        "debit",
        "credit",
        "category",
        "memo",
        "reference",
        "external_id",
        "amount_inverted",
        "date_format",
      ],
      rules: [
        "Use exact header strings from headers.",
        "Use either amount or debit/credit.",
        "amount_inverted means the CSV uses negative numbers for spending/outflows.",
        "date_format must be auto, MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD.",
      ],
      headers: args.headers,
      sample_rows: args.sampleRows.slice(0, 5),
      response_shape: {
        institution: "string|null",
        confidence: "0..1",
        mapping: {
          date: "header",
          amount: "header optional",
          debit: "header optional",
          credit: "header optional",
          merchant: "header optional",
          description: "header optional",
          category: "header optional",
          memo: "header optional",
          reference: "header optional",
          external_id: "header optional",
          amount_inverted: "boolean",
          date_format: "auto|MM/DD/YYYY|DD/MM/YYYY|YYYY-MM-DD",
        },
        notes: "string|null",
      },
    }),
  });
  if (!response?.mapping) return null;

  const valid = validateCsvMapping(response.mapping, args.headers);
  if (!valid.ok) return null;
  return {
    mapping: valid.mapping,
    confidence: clampConfidence(response.confidence),
    institution: response.institution ?? null,
    notes: response.notes ?? null,
  };
}

function clampConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.5;
}
