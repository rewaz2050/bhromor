-- ============================================================================
-- B1 (2026-09-28): shop follows — "tell me when this shop has something new".
-- ============================================================================
-- The storefront already had a per-product ask (stock_watches: "call me when
-- THIS is back") and a customer push pipeline. What was missing is the
-- shop-level version: a shopper who liked a shop had no way to hear about the
-- next drop, so every new product started from zero reach.
--
-- Honesty, same as the rest of the platform: there is no SMS/email sender, and
-- push only works for a phone that opted in. A follow row is therefore a
-- promise to TRY: the shop's new product pushes to every follower whose phone
-- has a device subscribed, and the rest stay on the shop's call list in
-- /vendor (a real number to dial), never a silently-dropped message.
--
-- `marketing_ok` is the shopper's own choice on the card: asked for the news
-- (true) or only order updates (false — the follow is then only useful for
-- keeping the shop's follower count honest, and the shop is told so).
--
-- Additive + idempotent.
-- ============================================================================

begin;

create table if not exists shop_follows (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references shops (id) on delete cascade,
  phone             text not null check (phone ~ '^[0-9]{11}$'),
  -- The shopper ticked "send me new-product news" on the follow card.
  marketing_ok      boolean not null default true,
  -- When this follower was last reached (push delivered or handed to staff).
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (shop_id, phone)
);

create index if not exists idx_shop_follows_shop on shop_follows (shop_id);
create index if not exists idx_shop_follows_phone on shop_follows (phone);

alter table shop_follows enable row level security;

-- The storefront never writes this table directly: /api/shop-follow uses the
-- service role. The insert policy exists so a hand-pasted insert from a
-- customer session is still format-checked.
drop policy if exists "shop follow public insert" on shop_follows;
create policy "shop follow public insert" on shop_follows
  for insert with check (phone ~ '^[0-9]{11}$');

-- A shop reads its own followers (the "N followers + who to call" list on
-- /vendor); the same `ps_vendor_shop()` helper the ledger uses. Staff read
-- everything for support. The announcement fan-out itself runs on the
-- service role, because customer_push_subscriptions has no policies.
drop policy if exists "shop follows vendor read" on shop_follows;
create policy "shop follows vendor read" on shop_follows
  for select using (shop_id = ps_vendor_shop());
drop policy if exists "shop follows admin all" on shop_follows;
create policy "shop follows admin all" on shop_follows
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;
