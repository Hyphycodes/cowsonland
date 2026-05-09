import { describe, expect, it } from "vitest";
import { partitionDuplicates } from "../dedupe";
import type { NormalizedTx } from "../types";

/**
 * Fake SupabaseClient just for the .from(...).select(...).eq(...).in(...)
 * chain that dedupe.ts uses. Returns rows we control.
 */
function fakeClient(existing: {
  external?: string[];
  fingerprint?: string[];
}) {
  type Q = {
    select: (cols: string) => Q;
    eq: (k: string, v: string) => Q;
    in: (k: string, v: string[]) => Promise<{ data: Record<string, string>[] }>;
    _kind?: "external" | "fingerprint";
  };
  return {
    from(table: string) {
      const self: Q = {
        select(cols: string) {
          self._kind = cols.includes("external_transaction_id")
            ? "external"
            : "fingerprint";
          return self;
        },
        eq() {
          return self;
        },
        async in() {
          if (table !== "transactions") return { data: [] };
          if (self._kind === "external") {
            return {
              data: (existing.external ?? []).map((v) => ({
                external_transaction_id: v,
              })),
            };
          }
          return {
            data: (existing.fingerprint ?? []).map((v) => ({
              dedupe_fingerprint: v,
            })),
          };
        },
      };
      return self;
    },
  } as unknown as Parameters<typeof partitionDuplicates>[0];
}

const tx = (overrides: Partial<NormalizedTx> = {}): NormalizedTx => ({
  date: "2026-01-10",
  amount: 12.34,
  currency_code: "USD",
  merchant_name: "Whole Foods",
  raw_name: "WHOLE FOODS #123",
  source: "csv",
  source_account_id: "acct1",
  external_transaction_id: null,
  raw_payload: null,
  ...overrides,
});

describe("partitionDuplicates", () => {
  it("flags by external_transaction_id when present", async () => {
    const client = fakeClient({ external: ["ext-1"] });
    const result = await partitionDuplicates(client, "u1", [
      tx({ external_transaction_id: "ext-1" }),
      tx({ external_transaction_id: "ext-2", merchant_name: "Costco" }),
    ]);
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]._reason).toBe("external_id");
  });

  it("flags by fingerprint when no external id", async () => {
    const fresh = tx();
    const probe = await partitionDuplicates(fakeClient({}), "u1", [fresh]);
    const fp = probe.fresh[0]._fingerprint;

    const result = await partitionDuplicates(
      fakeClient({ fingerprint: [fp] }),
      "u1",
      [fresh],
    );
    expect(result.fresh).toHaveLength(0);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]._reason).toBe("fingerprint");
  });

  it("collapses duplicates within the same batch", async () => {
    const client = fakeClient({});
    const result = await partitionDuplicates(client, "u1", [
      tx(),
      tx(), // identical → fingerprint match against the first
    ]);
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });
});
