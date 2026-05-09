-- =============================================================
-- Personal Finance App — Supabase schema
-- Paste into Supabase SQL Editor and run.
-- Single-user app: every row is scoped to auth.uid() via RLS.
-- =============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- profiles ----------
-- Lightweight mirror of auth.users. Created via trigger on signup.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- plaid_items ----------
-- One row per linked institution (Chase, Discover, Capital One).
-- access_token is sensitive — only the service role reads it.
create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null unique,
  access_token text not null,
  institution_id text,
  institution_name text,
  cursor text,
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists plaid_items_user_id_idx on public.plaid_items(user_id);

-- ---------- accounts ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id uuid references public.plaid_items(id) on delete cascade,
  plaid_account_id text unique,
  name text not null,
  official_name text,
  mask text,
  type text,
  subtype text,
  current_balance numeric(14, 2),
  available_balance numeric(14, 2),
  currency_code text default 'USD',
  -- 'plaid' = synced via Plaid; 'apple_card' = manual CSV import
  source text not null default 'plaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts(user_id);

-- ---------- categories ----------
-- User-defined categories + budget setup (Phase 5)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  color text,
  icon text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- transactions ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- Plaid's transaction id, null for Apple Card CSV imports
  plaid_transaction_id text unique,
  date date not null,
  authorized_date date,
  amount numeric(14, 2) not null,
  currency_code text default 'USD',
  merchant_name text,
  raw_name text,
  -- Plaid's primary/detailed personal-finance category
  plaid_category text,
  plaid_category_detailed text,
  -- User override / AI-suggested category
  category_id uuid references public.categories(id) on delete set null,
  ai_category text,
  pending boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions(user_id, date desc);
create index if not exists transactions_account_idx on public.transactions(account_id);
create index if not exists transactions_category_idx on public.transactions(category_id);

-- ---------- budgets (Phase 5) ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  -- YYYY-MM-01 — the month this budget applies to
  period_start date not null,
  amount_limit numeric(14, 2) not null,
  rolls_over boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, category_id, period_start)
);

-- ---------- goals (Phase 5) ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) not null,
  current_amount numeric(14, 2) not null default 0,
  account_id uuid references public.accounts(id) on delete set null,
  deadline date,
  created_at timestamptz not null default now()
);

-- ---------- ai_chats (Phase 5) ----------
create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- IDs of transactions sent as context for this turn
  context_transaction_ids uuid[],
  created_at timestamptz not null default now()
);

create index if not exists ai_chats_thread_idx on public.ai_chats(user_id, thread_id, created_at);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
alter table public.profiles      enable row level security;
alter table public.plaid_items   enable row level security;
alter table public.accounts      enable row level security;
alter table public.categories    enable row level security;
alter table public.transactions  enable row level security;
alter table public.budgets       enable row level security;
alter table public.goals         enable row level security;
alter table public.ai_chats      enable row level security;

-- Helper: a single policy template — owners can do everything to their own rows.
-- plaid_items has a separate policy that hides access_token from anon/authenticated.

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- plaid_items: authenticated users can see their own rows, but the access_token
-- column is filtered at the API layer (we never select it client-side).
create policy "own plaid items" on public.plaid_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own budgets" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own ai_chats" on public.ai_chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================
-- updated_at triggers
-- =============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_accounts on public.accounts;
create trigger touch_accounts before update on public.accounts
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_transactions on public.transactions;
create trigger touch_transactions before update on public.transactions
  for each row execute function public.touch_updated_at();

-- =============================================================
-- Installment plans (BNPL + card promos)
-- See README "Installment tracking" for product context.
-- =============================================================

-- Allow new account sources. Drop any prior constraint first so this is
-- safe to re-run.
alter table public.accounts
  drop constraint if exists accounts_source_check;
alter table public.accounts
  add constraint accounts_source_check
  check (source in ('plaid', 'apple_card', 'manual_liability'));

create table if not exists public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  merchant text not null,
  purchase_date date not null,
  total_amount numeric(14, 2) not null,
  term_months int not null check (term_months > 0),
  monthly_minimum numeric(14, 2) not null,
  apr numeric(5, 2) not null default 0,
  promo_end_date date,
  kind text not null check (kind in ('bnpl', 'card_promo')),
  status text not null default 'active'
    check (status in ('active', 'paid_off', 'defaulted')),
  payment_source_account_id uuid references public.accounts(id) on delete set null,
  liability_account_id uuid references public.accounts(id) on delete set null,
  -- Category that the PURCHASE belongs to (Electronics, Furniture, etc).
  -- Distinct from how monthly payment transactions are categorized.
  purchase_category_id uuid references public.categories(id) on delete set null,
  notes text,
  paid_off_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists installment_plans_user_idx
  on public.installment_plans(user_id);
create index if not exists installment_plans_active_idx
  on public.installment_plans(user_id, status)
  where deleted_at is null;

create table if not exists public.installment_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.installment_plans(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  expected_date date not null,
  expected_amount numeric(14, 2) not null,
  actual_date date,
  actual_amount numeric(14, 2),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'paid', 'missed', 'partial', 'overpaid')),
  created_at timestamptz not null default now()
);

create index if not exists installment_payments_due_idx
  on public.installment_payments(user_id, expected_date);
create index if not exists installment_payments_plan_idx
  on public.installment_payments(plan_id);

alter table public.installment_plans    enable row level security;
alter table public.installment_payments enable row level security;

drop policy if exists "own installment plans" on public.installment_plans;
create policy "own installment plans" on public.installment_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own installment payments" on public.installment_payments;
create policy "own installment payments" on public.installment_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists touch_installment_plans on public.installment_plans;
create trigger touch_installment_plans before update on public.installment_plans
  for each row execute function public.touch_updated_at();

-- =============================================================
-- spending_with_installments view
--
-- "Decision view" of spending. Counts each installment plan as a single
-- spend at purchase_date, and EXCLUDES individual monthly installment
-- payment transactions (they'd be double-counted otherwise).
--
-- security_invoker = on so RLS on the underlying tables applies — each
-- user only sees their own rows.
-- =============================================================
drop view if exists public.spending_with_installments;
create view public.spending_with_installments
  with (security_invoker = on)
  as
  select
    t.id              as id,
    t.user_id         as user_id,
    t.date            as date,
    t.amount          as amount,
    t.category_id     as category_id,
    t.merchant_name   as merchant_name,
    'transaction'::text as source_kind,
    null::uuid        as plan_id
  from public.transactions t
  where t.id not in (
    select transaction_id from public.installment_payments
     where transaction_id is not null
  )
  union all
  select
    p.id              as id,
    p.user_id         as user_id,
    p.purchase_date   as date,
    p.total_amount    as amount,
    p.purchase_category_id as category_id,
    p.merchant        as merchant_name,
    'installment_purchase'::text as source_kind,
    p.id              as plan_id
  from public.installment_plans p
  where p.deleted_at is null;

-- =============================================================
-- Source-agnostic transaction ingestion
-- Adds: import_batches table, ingestion columns on transactions,
-- account-source enum widening (csv + manual), backfill of existing
-- Plaid rows. Idempotent — safe to re-run.
-- =============================================================

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null
    check (source in ('csv', 'apple_card', 'plaid', 'manual')),
  filename text,
  -- 'pending' (rows parsed, awaiting user mapping/confirmation)
  -- 'completed' (rows imported)
  -- 'failed' (parsing or insert error)
  -- 'cancelled' (user discarded)
  status text not null default 'pending',
  rows_parsed int not null default 0,
  imported_count int not null default 0,
  duplicate_count int not null default 0,
  error_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists import_batches_user_idx
  on public.import_batches(user_id, created_at desc);

alter table public.import_batches enable row level security;
drop policy if exists "own import batches" on public.import_batches;
create policy "own import batches" on public.import_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Widen accounts.source to allow generic csv / manual accounts.
alter table public.accounts
  drop constraint if exists accounts_source_check;
alter table public.accounts
  add constraint accounts_source_check
  check (source in ('plaid', 'apple_card', 'manual_liability', 'csv', 'manual'));

-- Add ingestion columns on transactions.
alter table public.transactions
  add column if not exists source text;
alter table public.transactions
  add column if not exists source_account_id text;
alter table public.transactions
  add column if not exists external_transaction_id text;
alter table public.transactions
  add column if not exists import_batch_id uuid
    references public.import_batches(id) on delete set null;
alter table public.transactions
  add column if not exists dedupe_fingerprint text;
alter table public.transactions
  add column if not exists imported_at timestamptz default now();
alter table public.transactions
  add column if not exists raw_payload jsonb;

alter table public.transactions
  drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (
    source is null
    or source in ('plaid', 'csv', 'apple_card', 'manual', 'manual_liability')
  );

create index if not exists transactions_fingerprint_idx
  on public.transactions(user_id, dedupe_fingerprint);
create index if not exists transactions_external_id_idx
  on public.transactions(external_transaction_id);
create index if not exists transactions_import_batch_idx
  on public.transactions(import_batch_id);

-- Per-user uniqueness on external_transaction_id catches Plaid + future
-- source dupes at the DB level. Partial because most rows (manual) have null.
create unique index if not exists transactions_user_external_unique
  on public.transactions(user_id, external_transaction_id)
  where external_transaction_id is not null;

-- Backfill: existing Plaid rows predate these columns. Stamp source/external
-- so dedupe works against them too.
update public.transactions
  set source = 'plaid',
      external_transaction_id = plaid_transaction_id
  where source is null
    and plaid_transaction_id is not null;
