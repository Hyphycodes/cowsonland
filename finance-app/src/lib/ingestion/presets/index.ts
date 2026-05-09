import type { CsvDetection, CsvMapping, CsvPreset } from "../types";
import { APPLE_CARD_PRESET } from "./apple-card";

const preset = (p: CsvPreset) => p;

export const CSV_PRESETS = [
  APPLE_CARD_PRESET,
  preset({
    id: "chase",
    name: "Chase card or bank CSV",
    institution: "Chase",
    source: "csv",
    signature: ["Transaction Date", "Post Date", "Description", "Type", "Amount"],
    mapping: {
      date: "Transaction Date",
      amount: "Amount",
      amount_inverted: true,
      description: "Description",
      category: "Category",
      memo: "Memo",
      date_format: "auto",
    },
  }),
  preset({
    id: "capital_one",
    name: "Capital One statement CSV",
    institution: "Capital One",
    source: "csv",
    signature: ["Transaction Date", "Posted Date", "Card No.", "Debit", "Credit"],
    mapping: {
      date: "Transaction Date",
      debit: "Debit",
      credit: "Credit",
      description: "Description",
      category: "Category",
      date_format: "auto",
    },
  }),
  preset({
    id: "american_express",
    name: "American Express statement CSV",
    institution: "American Express",
    source: "csv",
    signature: [
      "Date",
      "Description",
      "Amount",
      "Appears On Your Statement As",
      "Reference",
    ],
    mapping: {
      date: "Date",
      amount: "Amount",
      amount_inverted: true,
      description: "Description",
      category: "Category",
      date_format: "auto",
    },
  }),
  preset({
    id: "discover",
    name: "Discover statement CSV",
    institution: "Discover",
    source: "csv",
    signature: ["Trans. Date", "Post Date", "Description", "Amount"],
    mapping: {
      date: "Trans. Date",
      amount: "Amount",
      amount_inverted: false,
      description: "Description",
      category: "Category",
      date_format: "auto",
    },
  }),
];

type Field = keyof CsvMapping;

const HEADER_ALIASES: Record<Field, string[]> = {
  date: ["date", "transaction date", "trans date", "trans. date", "posted date", "post date", "posting date"],
  amount: ["amount", "transaction amount", "amount usd", "amount (usd)", "charge", "payment"],
  debit: ["debit", "withdrawal", "withdrawals", "paid out", "outflow"],
  credit: ["credit", "deposit", "deposits", "paid in", "inflow"],
  merchant: ["merchant", "merchant name", "payee", "name"],
  description: ["description", "details", "transaction description", "raw description"],
  category: ["category", "type"],
  memo: ["memo", "note", "notes"],
  reference: ["reference", "ref", "check number"],
  external_id: ["transaction id", "id", "reference number", "confirmation number"],
  amount_inverted: [],
  date_format: [],
};

export function detectCsvFormat(
  headers: string[],
  sampleRows: Record<string, string>[] = [],
): CsvDetection {
  const matchedPreset = bestPreset(headers);
  if (matchedPreset && matchedPreset.confidence >= 0.75) {
    return {
      preset_id: matchedPreset.preset.id,
      preset_name: matchedPreset.preset.name,
      institution: matchedPreset.preset.institution,
      confidence: matchedPreset.confidence,
      mapping: matchedPreset.preset.mapping,
      needs_user_mapping: false,
      source: matchedPreset.preset.source,
      method: "preset",
    };
  }

  const inferred = inferCsvMapping(headers, sampleRows);
  return {
    preset_id: matchedPreset?.preset.id ?? null,
    preset_name: matchedPreset?.preset.name ?? null,
    institution: matchedPreset?.preset.institution ?? null,
    confidence: Math.max(inferred.confidence, matchedPreset?.confidence ?? 0),
    mapping: inferred.mapping,
    needs_user_mapping: inferred.confidence < 0.65,
    source: matchedPreset?.preset.source ?? "csv",
    method: inferred.confidence > 0 ? "heuristic" : "none",
    notes: inferred.notes,
  };
}

export function inferCsvMapping(
  headers: string[],
  sampleRows: Record<string, string>[] = [],
): { mapping: CsvMapping | null; confidence: number; notes?: string } {
  const mapping: CsvMapping = { date: "", date_format: "auto" };
  let score = 0;
  const max = 5;

  const date = pick(headers, HEADER_ALIASES.date);
  if (date) {
    mapping.date = date;
    score += 1.25;
  }

  const debit = pick(headers, HEADER_ALIASES.debit);
  const credit = pick(headers, HEADER_ALIASES.credit);
  const amount = pick(headers, HEADER_ALIASES.amount);
  if (debit || credit) {
    if (debit) mapping.debit = debit;
    if (credit) mapping.credit = credit;
    score += debit && credit ? 1.5 : 0.8;
  } else if (amount) {
    mapping.amount = amount;
    mapping.amount_inverted = shouldInvertAmount(amount, sampleRows);
    score += 1.5;
  }

  const merchant = pick(headers, HEADER_ALIASES.merchant);
  const description = pick(headers, HEADER_ALIASES.description);
  if (merchant) mapping.merchant = merchant;
  if (description) mapping.description = description;
  if (merchant || description) score += 1.25;

  const category = pick(headers, HEADER_ALIASES.category);
  const memo = pick(headers, HEADER_ALIASES.memo);
  const reference = pick(headers, HEADER_ALIASES.reference);
  const externalId = pick(headers, HEADER_ALIASES.external_id);
  if (category) mapping.category = category;
  if (memo) mapping.memo = memo;
  if (reference) mapping.reference = reference;
  if (externalId) mapping.external_id = externalId;
  if (category || memo || reference || externalId) score += 1;

  if (!mapping.date || (!mapping.amount && !mapping.debit && !mapping.credit)) {
    return {
      mapping: Object.keys(mapping).length > 1 ? emptyToUndefined(mapping) : null,
      confidence: Math.min(score / max, 0.55),
      notes: "Could not confidently identify both date and amount columns.",
    };
  }

  return { mapping: emptyToUndefined(mapping), confidence: Math.min(score / max, 0.9) };
}

export function validateCsvMapping(
  value: unknown,
  headers: string[],
): { ok: true; mapping: CsvMapping } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "mapping_not_object" };
  const input = value as Record<string, unknown>;
  const hasHeader = (v: unknown) => typeof v === "string" && headers.includes(v);
  const mapping: CsvMapping = { date: "" };

  if (!hasHeader(input.date)) return { ok: false, error: "missing_valid_date" };
  mapping.date = input.date as string;

  for (const field of [
    "amount",
    "debit",
    "credit",
    "merchant",
    "description",
    "category",
    "memo",
    "reference",
    "external_id",
  ] satisfies Field[]) {
    const v = input[field];
    if (v == null || v === "") continue;
    if (!hasHeader(v)) return { ok: false, error: `invalid_${field}` };
    (mapping as Record<string, unknown>)[field] = v;
  }

  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    return { ok: false, error: "missing_amount_or_debit_credit" };
  }

  mapping.amount_inverted = input.amount_inverted === true;
  mapping.date_format =
    input.date_format === "MM/DD/YYYY" ||
    input.date_format === "DD/MM/YYYY" ||
    input.date_format === "YYYY-MM-DD"
      ? input.date_format
      : "auto";

  return { ok: true, mapping };
}

function bestPreset(headers: string[]) {
  let best: { preset: CsvPreset; confidence: number } | null = null;
  const normalized = new Set(headers.map(normalizeHeader));
  for (const preset of CSV_PRESETS) {
    const hits = preset.signature.filter((h) => normalized.has(normalizeHeader(h))).length;
    const confidence = hits / preset.signature.length;
    if (!best || confidence > best.confidence) best = { preset, confidence };
  }
  return best;
}

function pick(headers: string[], aliases: string[]): string | undefined {
  const exact = new Map(headers.map((h) => [normalizeHeader(h), h]));
  for (const alias of aliases) {
    const found = exact.get(normalizeHeader(alias));
    if (found) return found;
  }
  for (const header of headers) {
    const n = normalizeHeader(header);
    if (aliases.some((a) => n.includes(normalizeHeader(a)))) return header;
  }
  return undefined;
}

function shouldInvertAmount(amountHeader: string, rows: Record<string, string>[]) {
  const values = rows
    .map((r) => Number((r[amountHeader] ?? "").replace(/[$,()]/g, "")))
    .filter((n) => Number.isFinite(n) && n !== 0);
  if (values.length === 0) return false;
  return values.filter((n) => n < 0).length > values.length / 2;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function emptyToUndefined(mapping: CsvMapping): CsvMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, v]) => v !== ""),
  ) as CsvMapping;
}
