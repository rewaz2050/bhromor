-- Rider Web Push subscriptions (2026-10-01)
-- Separate from staff subscriptions so a rider never receives admin notices.
begin;
create table if not exists rider_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rider_push_subscriptions_rider on rider_push_subscriptions(rider_id);
alter table rider_push_subscriptions enable row level security;
revoke all on rider_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on rider_push_subscriptions to service_role;
notify pgrst, 'reload schema';
commit;
