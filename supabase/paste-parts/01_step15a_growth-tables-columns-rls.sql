-- PASTE 3/11 · file 01_step15a_growth-tables-columns-rls.sql
-- go-live step 15a — 202609130008_growth_promos_gift_referral.sql
-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.
--
-- Lines 22–96: price_watches, referral_codes,
-- referral_rewards, the gift/promo/referral columns on orders, and their RLS.
-- The fileʼs own ps_place_order (lines 98–473) is SKIPPED ON PURPOSE — steps 19,
-- 23 and 30 each re-create it and the step-30 version (part 05–09) is a strict
-- superset of all of them.

begin;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists price_watches (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products (id) on delete cascade,
  phone               text not null check (phone ~ '^[0-9]{11}$'),
  target_paisa        bigint check (target_paisa is null or target_paisa > 0),
  last_notified_paisa bigint,
  created_at          timestamptz not null default now(),
  unique (product_id, phone)
);
create index if not exists idx_price_watches_product on price_watches (product_id);

create table if not exists referral_codes (
  code           text primary key check (code ~ '^[A-Z0-9]{6}$'),
  customer_id    uuid references customers (id) on delete set null,
  customer_phone text,
  customer_name  text not null default '',
  created_at     timestamptz not null default now()
);

create table if not exists referral_rewards (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null references referral_codes (code) on delete cascade,
  referee_phone      text not null,
  order_id           uuid references orders (id) on delete set null,
  friend_credit      bigint not null default 0 check (friend_credit >= 0),
  referrer_coupon_id uuid references coupons (id) on delete set null,
  referrer_reward    bigint not null default 0 check (referrer_reward >= 0),
  created_at         timestamptz not null default now(),
  unique (code, referee_phone)
);
create index if not exists idx_referral_rewards_code on referral_rewards (code);
create index if not exists idx_referral_rewards_order on referral_rewards (order_id);

-- Orders: gift mode + the automatic-offer breakdown.
alter table orders add column if not exists is_gift boolean not null default false;
alter table orders add column if not exists gift_wrap text
  not null default 'none' check (gift_wrap in ('none', 'standard', 'premium'));
alter table orders add column if not exists gift_fee bigint not null default 0 check (gift_fee >= 0);
alter table orders add column if not exists gift_recipient_name text;
alter table orders add column if not exists gift_recipient_phone text;
alter table orders add column if not exists gift_message text;
alter table orders add column if not exists promo_kind text
  check (promo_kind is null or promo_kind in ('flash', 'bundle'));
alter table orders add column if not exists promo_discount bigint not null default 0 check (promo_discount >= 0);
alter table orders add column if not exists referral_code text;
alter table orders add column if not exists referral_credit bigint not null default 0 check (referral_credit >= 0);
create index if not exists idx_orders_referral_code on orders (referral_code) where referral_code is not null;

-- ----------------------------------------------------------------------------
-- 2. RLS. Watches are inserted by anonymous checkout visitors and read only by
-- staff, codes/ledger are staff-only (the storefront asks the API, which uses
-- the service role — it never exposes who shared what).
-- ----------------------------------------------------------------------------
alter table price_watches   enable row level security;
alter table referral_codes  enable row level security;
alter table referral_rewards enable row level security;

drop policy if exists "price watch public insert" on price_watches;
create policy "price watch public insert" on price_watches
  for insert with check (phone ~ '^[0-9]{11}$');

drop policy if exists "admin all price watches" on price_watches;
create policy "admin all price watches" on price_watches
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all referral codes" on referral_codes;
create policy "admin all referral codes" on referral_codes
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all referral rewards" on referral_rewards;
create policy "admin all referral rewards" on referral_rewards
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;

