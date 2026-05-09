import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-medium tracking-tight">Finance</h1>
        <p className="text-sm text-zinc-500 mt-1">Sign in to continue.</p>

        <form action={signIn} className="mt-8 space-y-3">
          <input
            type="email"
            name="email"
            required
            placeholder="you@yourdomain.com"
            autoComplete="email"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            Send magic link
          </button>
        </form>

        {sent && (
          <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
            Check your inbox for the sign-in link.
          </p>
        )}
        {error === "not_allowed" && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            That email isn&apos;t allowed.
          </p>
        )}
        {error && error !== "not_allowed" && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {decodeURIComponent(error)}
          </p>
        )}
      </div>
    </main>
  );
}
