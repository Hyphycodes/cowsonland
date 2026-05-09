"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useRouter } from "next/navigation";

export default function ConnectPage() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Fetch a link token on mount.
  useEffect(() => {
    fetch("/api/plaid/create-link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.link_token))
      .catch(() => setStatus("Failed to initialize Plaid Link."));
  }, []);

  const onSuccess = useCallback(
    async (public_token: string) => {
      setStatus("Linking account…");
      const res = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
      if (!res.ok) {
        setStatus("Failed to exchange token.");
        return;
      }
      setStatus("Linked. Pulling transactions…");
      // Fire an immediate sync; the cron will catch any future updates.
      await fetch("/api/plaid/sync", { method: "POST" });
      router.push("/dashboard");
      router.refresh();
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Connect a bank</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Chase, Discover, and Capital One via Plaid. Apple Card import coming
          in Phase 4.
        </p>
      </div>

      <button
        type="button"
        disabled={!ready || !linkToken}
        onClick={() => open()}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90"
      >
        {linkToken ? "Open Plaid Link" : "Loading…"}
      </button>

      {status && <p className="text-sm text-zinc-500">{status}</p>}
    </div>
  );
}
