# Finance

Personal finance app. Single-user, locked to one email. Pulls transactions
from Chase, Discover, and Capital One via Plaid. Apple Card via monthly CSV
(Phase 4).

## Stack

- Next.js 15 App Router + TypeScript
- Supabase (Postgres + Auth + RLS)
- Plaid Trial Plan (free, 10 production Items)
- Tailwind for styling
- Vercel for hosting + nightly cron

## Phase 1 setup

### 1. Install

```bash
npm install
cp .env.local.example .env.local
```

### 2. Create the Supabase project

1. Go to https://supabase.com → New Project.
2. Settings → API: copy the URL and the **anon** + **service_role** keys.
3. SQL Editor → paste the contents of `supabase/schema.sql` and run.
4. Authentication → Providers → enable **Email**. Disable signups
   (Authentication → Providers → Email → "Confirm email" on, "Enable signups"
   off — the allowlist also blocks unauth'd emails, but defense in depth).
5. Authentication → URL Configuration → Site URL: `http://localhost:3000`.
   Redirect URLs: add `http://localhost:3000/auth/callback`.

Fill in the four `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY`
values in `.env.local`. Set `ALLOWED_EMAILS` to your email address.

### 3. Create the Plaid sandbox account

1. https://dashboard.plaid.com → Sign up.
2. Team Settings → Keys: copy `client_id` and the **Sandbox** secret.
3. Set `PLAID_ENV=sandbox`. Leave `PLAID_PRODUCTS=transactions`.

When you're ready for real banks (Phase 3), apply for the Trial Plan
at https://dashboard.plaid.com/trial-plan and switch `PLAID_ENV` to
`production` with the production secret.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Enter your email, get the magic link from
Supabase email logs (or your inbox — set up SMTP in Supabase
Authentication → Email Templates if you want real delivery), click through.
You'll land on `/dashboard`. Hit `/connect` to link a sandbox bank.

In sandbox: any of Plaid's sample institutions work. Use credentials
`user_good` / `pass_good`.

### 5. Deploy to Vercel

```bash
vercel
```

Add every env var from `.env.local` to your Vercel project. Update
`NEXT_PUBLIC_SITE_URL` to your Vercel URL and add it to the Supabase
redirect URL allowlist. Update `PLAID_WEBHOOK_URL` to
`https://your-app.vercel.app/api/plaid/sync`.

## Project structure

```
src/
├── app/
│   ├── (authed)/                 # Auth-gated routes
│   │   ├── dashboard/page.tsx    # Net worth, accounts, recent transactions
│   │   ├── connect/page.tsx      # Plaid Link UI
│   │   └── layout.tsx
│   ├── api/
│   │   ├── plaid/
│   │   │   ├── create-link-token/route.ts
│   │   │   ├── exchange-token/route.ts
│   │   │   └── sync/route.ts     # Webhook + cron + ad-hoc sync
│   │   └── auth/signout/route.ts
│   ├── auth/callback/route.ts    # Magic-link landing
│   ├── login/                    # Public login page
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── auth/allowlist.ts         # Email allowlist check
│   ├── plaid/client.ts           # Plaid SDK init
│   └── supabase/                 # Browser, server, service-role clients
└── types/db.ts                   # Hand-rolled DB types
middleware.ts                     # Session refresh + allowlist gate
supabase/schema.sql               # All tables + RLS policies
vercel.json                       # Cron schedule
```

## What's intentionally not here yet

These belong to later phases — the scaffold stays small.

- **PWA** (Phase 4) — install `next-pwa`, add manifest/service worker.
- **Apple Card CSV import** (Phase 4) — file upload + parser.
- **Categorization rules + budgets + goals UI** (Phase 5).
- **Claude chat over transactions** (Phase 5).
- **Plaid webhook signature verification** (Phase 3) — required before
  pointing the webhook at production.
- **Generated DB types** — replace `src/types/db.ts` with the output of
  `supabase gen types typescript --project-id <ref>` once the schema settles.

## Cron

`vercel.json` schedules `/api/plaid/sync` daily at 9:00 UTC. The endpoint
authorizes via `Authorization: Bearer ${CRON_SECRET}`. Locally, you can
trigger it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/plaid/sync
```
