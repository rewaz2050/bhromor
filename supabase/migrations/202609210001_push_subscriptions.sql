-- ============================================================================
-- 202609210001_push_subscriptions.sql
-- Web Push for staff devices — an order lands, the owner's phone buzzes even
-- with the admin panel closed. One row per browser subscription (endpoint is
-- the push service's identity). Service-role access only: the table is
-- written by /api/admin/push and read by the notifyStaff fan-out, both of
-- which run with the service client behind staff verification.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- No policies: RLS denies anon/authenticated access; the service role
-- bypasses RLS (the only writer/reader, always behind staff auth).
