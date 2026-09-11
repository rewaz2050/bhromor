-- 202609110004 — Customer accounts (no-verification) + sessions
-- Smart Card (loyalty stamps) need a real account per customer:
-- signup is instant (no email/OTP verification), login by phone + password.
-- Self-contained for its own tables; service role bypasses RLS, so the API
-- routes are the only door in — anon/authenticated clients get nothing.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null unique check (phone ~ '^[0-9]{11}$'), -- normalized: 01XXXXXXXXX
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_sessions (
  token text primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create index if not exists idx_customer_sessions_customer
  on public.customer_sessions (customer_id);
create index if not exists idx_customer_sessions_expires
  on public.customer_sessions (expires_at);

-- Lock down: no anon/authenticated policies on purpose (service role only).
alter table public.customers enable row level security;
alter table public.customer_sessions enable row level security;

-- Housekeeping: drop expired sessions (call from pg_cron if available).
create or replace function public.ps_purge_customer_sessions()
returns void language sql as $$
  delete from public.customer_sessions where expires_at <= now();
$$;
