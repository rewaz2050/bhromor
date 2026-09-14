-- ============================================================================
-- P2 #2 (2026-09-14): back-in-stock alerts.
-- ============================================================================
-- The sibling of price_watches, for the other reason a shopper leaves a
-- piece: it was the exact one, and it sold out.
--
-- There is no SMS/email sender in this stack, so the promise is a human
-- call from the shop — the same honest mechanism as P0 #5. A row is "call
-- this number when the product is back in stock"; it is written by the
-- storefront through /api/stock-watch (service role) and read by staff in
-- Admin → Growth. When the admin flips a product from out of stock to in,
-- the restock flag (src/lib/db/growth.ts) hands staff the call list once.
--
-- Additive and idempotent.
-- ============================================================================

begin;

create table if not exists stock_watches (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products (id) on delete cascade,
  phone             text not null check (phone ~ '^[0-9]{11}$'),
  -- When staff were last handed this watcher's number for a restock.
  -- Informational on the admin screen; the dedupe is the out-of-stock →
  -- in-stock transition itself (each cycle is a real event the shopper
  -- signed up for), so no value here can silently swallow a real restock.
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (product_id, phone)
);
create index if not exists idx_stock_watches_product on stock_watches (product_id);

alter table stock_watches enable row level security;

-- The storefront never writes this table directly: /api/stock-watch uses the
-- service role. The policy exists only so a hand-pasted insert from a
-- customer session is still format-checked, and nothing else can see rows.
drop policy if exists "stock watch public insert" on stock_watches;
create policy "stock watch public insert" on stock_watches
  for insert with check (phone ~ '^[0-9]{11}$');

drop policy if exists "admin all stock watches" on stock_watches;
create policy "admin all stock watches" on stock_watches
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;
