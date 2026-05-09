/**
 * Single source of truth for which email addresses are allowed in.
 * Set ALLOWED_EMAILS in env (comma-separated, lowercase). The middleware
 * uses this to block any session whose email isn't on the list, even if
 * Supabase Auth gave them one.
 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ALLOWED_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
