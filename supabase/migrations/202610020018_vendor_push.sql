-- ============================================================================
-- Vendor (shop) WEB PUSH (2026-10-03): a new order buzzes the shop's phone even with
-- the vendor panel closed, and a shop that owes PROSANTI gets a daily reminder.
--
-- Until now a shop only heard about an order while its panel was OPEN (a 20-second poll
-- plus a beep) — a shop owner with the phone in a pocket found out from the customer's
-- phone call. Same VAPID pair and `web-push` as the staff, shopper and rider channels; a
-- separate table because the audience (a shop, any of its staff devices) differs.
--
--   vendor_push_subscriptions   one row per shop browser/phone. Service-role only: RLS on,
--                               NO policies — /api/vendor/push writes after requireVendor(),
--                               the fan-out in src/lib/vendor-push.ts reads. A shop can never
--                               read another shop's endpoints. Deleting a shop deletes them.
--
-- Safe to re-run. Nothing else changes.
-- ============================================================================
begin;

create table if not exists public.vendor_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  user_id      uuid,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_vendor_push_shop
  on public.vendor_push_subscriptions (shop_id);

alter table public.vendor_push_subscriptions enable row level security;
revoke all on table public.vendor_push_subscriptions from anon, authenticated;
grant all on table public.vendor_push_subscriptions to service_role;

notify pgrst, 'reload schema';

commit;
