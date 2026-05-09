# Finance App

Single-user personal finance app with CSV-first transaction import, rules,
review queue, optional Plaid sync, and optional Claude-assisted CSV mapping
and categorization.

## Stack

- Next.js 15 App Router + TypeScript
- Supabase Postgres, Auth, and RLS
- CSV import for cards and banks
- Optional Plaid Transactions
- Optional Anthropic Claude API
- Vercel hosting and cron

## Local Setup

```bash
npm install
cp .env.example .env.local
```

Create a Supabase project, run `supabase/schema.sql` in the SQL editor, then
fill in `.env.local`.

```bash
npm run dev
```

Open `http://localhost:3000`, sign in with the allowlisted email, then use
`/imports` to upload CSV statements. Plaid is optional; `/connect` only works
after Plaid env vars are configured.

## Supabase Setup

1. Create a Supabase project.
2. Go to Settings > API and copy:
   - Project URL
   - anon public key
   - service_role key
3. SQL Editor: paste and run `supabase/schema.sql`.
4. Authentication > Providers > Email:
   - enable Email
   - keep email confirmation on if you want magic-link confirmation
   - disable public signups if this is only for you
5. Authentication > URL Configuration:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/callback`
   - after Vercel deploy, also add `https://your-app.vercel.app/auth/callback`

The schema file is idempotent and includes tables, RLS policies, indexes,
category/rule/import columns, and AI categorization columns. For production,
apply schema changes through Supabase migrations or the SQL editor before
deploying code that depends on them.

## Required Env Vars

Required for local and production:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_EMAILS=you@example.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=
```

Optional Plaid:

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
PLAID_DAYS_REQUESTED=730
PLAID_WEBHOOK_URL=
```

Optional Claude:

```bash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

`SUPABASE_SERVICE_ROLE_KEY`, `PLAID_SECRET`, `CRON_SECRET`, and
`ANTHROPIC_API_KEY` are server-only secrets. Do not prefix them with
`NEXT_PUBLIC_`.

## Vercel Deploy

1. Import the repo into Vercel or run `vercel`.
2. Set the project root to `finance-app` if deploying from the parent folder.
3. Add every required env var from `.env.local` in Vercel Project Settings.
4. Set `NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app`.
5. In Supabase Auth URL Configuration, add:
   - `https://your-app.vercel.app`
   - `https://your-app.vercel.app/auth/callback`
6. If using Plaid, set `PLAID_WEBHOOK_URL=https://your-app.vercel.app/api/plaid/sync`.
7. Deploy. Vercel will run `npm run build`.

`vercel.json` schedules `/api/plaid/sync` daily at 09:00 UTC. The endpoint
requires `Authorization: Bearer $CRON_SECRET`; Vercel Cron sends that header
when `CRON_SECRET` is configured.

## What Works Without Plaid

- CSV upload/import for Apple Card, Chase, Capital One, American Express,
  Discover, and generic bank/card CSVs
- column mapping review and overrides
- normalization, dedupe, transaction rules, review queue
- manual categorization, splits, categories, installments

## What Works Without Claude

- known CSV presets
- heuristic header inference
- manual column mapping
- deterministic rules
- review queue and manual/rule categorization

Claude only improves low-confidence CSV mapping and suggests categories/rules
for transactions that remain uncategorized after rules run.

## Verification

Before deploy:

```bash
npm test
npm run typecheck
npm run build
```

## Notes

- Service-role Supabase access is isolated to server files.
- Manual categorization is never overwritten by rules or AI.
- Rules can override AI suggestions because AI is only a reviewable fallback.
- Plaid webhook signature verification is still not implemented; anonymous
  Plaid POSTs are rejected unless routed through an authenticated or cron-secret
  caller.
