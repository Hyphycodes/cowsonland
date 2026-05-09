import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedTx } from "./types";
import { fingerprint } from "./fingerprint";

export type DedupePartition = {
  fresh: (NormalizedTx & { _fingerprint: string })[];
  duplicates: (NormalizedTx & { _fingerprint: string; _reason: "external_id" | "fingerprint" })[];
};

/**
 * Split a batch of normalized transactions into rows that will be
 * inserted versus rows that match something already in the user's
 * transactions table.
 *
 * Rule order (per spec):
 *   1. external_transaction_id exact match wins
 *   2. dedupe_fingerprint match
 *
 * Internal dupes within the same batch (two CSV rows that fingerprint
 * to the same value) are also collapsed — the first one wins.
 *
 * One round-trip per dedupe key set so this scales to thousands of rows.
 */
export async function partitionDuplicates(
  client: SupabaseClient,
  userId: string,
  rows: NormalizedTx[],
): Promise<DedupePartition> {
  const stamped = rows.map((tx) => ({
    ...tx,
    _fingerprint: fingerprint({
      user_id: userId,
      source: tx.source,
      source_account_id: tx.source_account_id,
      date: tx.date,
      amount: tx.amount,
      merchant: tx.merchant_name ?? tx.raw_name,
    }),
  }));

  const externalIds = stamped
    .map((r) => r.external_transaction_id)
    .filter((v): v is string => !!v);
  const fingerprints = stamped.map((r) => r._fingerprint);

  const existingExternal = new Set<string>();
  if (externalIds.length) {
    const { data } = await client
      .from("transactions")
      .select("external_transaction_id")
      .eq("user_id", userId)
      .in("external_transaction_id", externalIds);
    for (const r of data ?? [])
      if (r.external_transaction_id)
        existingExternal.add(r.external_transaction_id);
  }

  const existingFingerprint = new Set<string>();
  if (fingerprints.length) {
    const { data } = await client
      .from("transactions")
      .select("dedupe_fingerprint")
      .eq("user_id", userId)
      .in("dedupe_fingerprint", fingerprints);
    for (const r of data ?? [])
      if (r.dedupe_fingerprint) existingFingerprint.add(r.dedupe_fingerprint);
  }

  const fresh: DedupePartition["fresh"] = [];
  const duplicates: DedupePartition["duplicates"] = [];
  const seenInBatchExternal = new Set<string>();
  const seenInBatchFingerprint = new Set<string>();

  for (const r of stamped) {
    if (
      r.external_transaction_id &&
      (existingExternal.has(r.external_transaction_id) ||
        seenInBatchExternal.has(r.external_transaction_id))
    ) {
      duplicates.push({ ...r, _reason: "external_id" });
      continue;
    }
    if (
      existingFingerprint.has(r._fingerprint) ||
      seenInBatchFingerprint.has(r._fingerprint)
    ) {
      duplicates.push({ ...r, _reason: "fingerprint" });
      continue;
    }
    fresh.push(r);
    if (r.external_transaction_id)
      seenInBatchExternal.add(r.external_transaction_id);
    seenInBatchFingerprint.add(r._fingerprint);
  }

  return { fresh, duplicates };
}
