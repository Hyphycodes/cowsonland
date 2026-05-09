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
