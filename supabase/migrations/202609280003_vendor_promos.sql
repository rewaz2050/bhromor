-- ============================================================================
-- B3 (2026-09-28): the shop's own promo codes.
-- ============================================================================
-- Until now only staff could create coupons (`/admin/coupons`), so a shop that
-- wanted to run "EID10 for my sarees" had to ask PROSANTI and wait.
--
-- This migration gives a shop its own codes, with the two rules that keep the
-- marketplace honest:
--
--   1. PLATFORM CAPS. A shop may not promise more than the platform allows:
--      at most `max_percent` off, a fixed discount no bigger than
--      `max_discount`, a code no longer than `max_days`, at most `max_usage`
--      redemptions, and no more than `max_active` live codes at once. Staff
--      can change every cap in `vendor_promo_limits` without a deploy.
--      A vendor calling Supabase directly (anon key + JWT) hits the same wall
--      as the API: the guard trigger below, not the route, is the authority.
--
--   2. THE DISCOUNT LEAVES THE SHOP'S OWN SHARE. A platform coupon is
--      PROSANTI's marketing spend; a shop's coupon is the shop's. So for a
--      coupon whose `shop_id` matches the order's shop, the ledger subtracts
--      the discount from that shop's payable and records it in
--      `shop_ledger.promo_discount`. Commission is untouched — the platform
--      never quietly pays for a shop's own discount. The vendor screen shows
--      this arithmetic BEFORE the code is saved ("you will get ≈ …").
--
-- Codes stay usable only on their own shop's products: a `coupons.shop_id`
-- that is set must equal the order's shop, enforced by a trigger on `orders`
-- (so it holds for every generation of ps_place_order).
--
-- Additive + idempotent. Expect "VENDOR PROMOS OK".
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns: who owns a code, and who typed it.
-- ---------------------------------------------------------------------------
alter table public.coupons
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
alter table public.coupons
  add column if not exists created_by text;

create index if not exists idx_coupons_shop on public.coupons (shop_id);

-- ---------------------------------------------------------------------------
-- 2. The caps (one row, staff-editable — no migration to change a number).
--    `max_discount` is paisa (§69): 50000 = ৳500.
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_promo_limits (
  id             text primary key default 'default',
  max_percent    int  not null default 25  check (max_percent between 1 and 100),
  max_discount   bigint not null default 50000 check (max_discount > 0),
  max_days       int  not null default 30  check (max_days between 1 and 180),
  max_usage      int  not null default 300 check (max_usage between 1 and 100000),
  max_active     int  not null default 3   check (max_active between 1 and 50),
  updated_at     timestamptz not null default now()
);

insert into public.vendor_promo_limits (id) values ('default')
  on conflict (id) do nothing;

alter table public.vendor_promo_limits enable row level security;

-- Everyone may READ the caps (the vendor form prints them, the storefront
-- needs nothing from them but reading them is harmless).
drop policy if exists "promo limits public read" on public.vendor_promo_limits;
create policy "promo limits public read" on public.vendor_promo_limits
  for select using (true);

drop policy if exists "promo limits admin write" on public.vendor_promo_limits;
create policy "promo limits admin write" on public.vendor_promo_limits
  for all using (ps_is_admin()) with check (ps_is_admin());

-- ---------------------------------------------------------------------------
-- 3. Vendors get their own codes — and only their own.
-- ---------------------------------------------------------------------------
drop policy if exists "coupons vendor read own" on public.coupons;
create policy "coupons vendor read own" on public.coupons
  for select using (shop_id = ps_vendor_shop());

drop policy if exists "coupons vendor insert own" on public.coupons;
create policy "coupons vendor insert own" on public.coupons
  for insert with check (shop_id = ps_vendor_shop() and ps_vendor_shop() is not null);

drop policy if exists "coupons vendor update own" on public.coupons;
create policy "coupons vendor update own" on public.coupons
  for update using (shop_id = ps_vendor_shop())
  with check (shop_id = ps_vendor_shop());

-- The guard: caps, ownership and immutability — for vendor sessions only.
create or replace function ps_guard_vendor_promo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limits vendor_promo_limits%rowtype;
  v_shop uuid;
  v_active int;
begin
  -- Staff keeps the whole table (this is where platform coupons are born).
  if (select ps_is_admin()) then
    return new;
  end if;

  select * into v_limits from vendor_promo_limits where id = 'default';
  if v_limits.id is null then
    v_limits.max_percent := 25; v_limits.max_discount := 50000;
    v_limits.max_days := 30;    v_limits.max_usage := 300;
    v_limits.max_active := 3;
  end if;

  v_shop := ps_vendor_shop();
  if v_shop is null then
    raise exception 'only a shop may create a promo here';
  end if;
  if new.shop_id is distinct from v_shop then
    raise exception 'a shop may only create promos for itself';
  end if;

  -- Delivery money is the platform's: a shop discounts its product, never
  -- the courier leg. (A shop that wants free delivery uses its own setting.)
  if new.type not in ('percent', 'fixed') then
    raise exception 'a shop promo must be percent or fixed';
  end if;
  if new.type = 'percent' and (new.value < 1 or new.value > v_limits.max_percent) then
    raise exception 'percent must be between 1 and % (the platform cap)', v_limits.max_percent;
  end if;
  if new.type = 'fixed' and (new.value < 1 or new.value > v_limits.max_discount) then
    raise exception 'fixed discount must be between 1 and % paisa (the platform cap)', v_limits.max_discount;
  end if;
  if new.max_discount is not null and new.type <> 'percent' then
    raise exception 'a discount cap only applies to percent promos';
  end if;
  if new.max_discount is not null and new.max_discount > v_limits.max_discount then
    raise exception 'the discount cap may not exceed % paisa', v_limits.max_discount;
  end if;
  if new.valid_until is null then
    raise exception 'a shop promo must have an end date';
  end if;
  if new.valid_until > now() + make_interval(days => v_limits.max_days) then
    raise exception 'a shop promo may run at most % days', v_limits.max_days;
  end if;
  if new.valid_from is not null and new.valid_from < now() - interval '5 minutes' then
    raise exception 'a shop promo cannot start in the past';
  end if;
  if new.usage_limit is null then
    raise exception 'a shop promo must have a usage limit';
  end if;
  if new.usage_limit < 1 or new.usage_limit > v_limits.max_usage then
    raise exception 'usage limit must be between 1 and %', v_limits.max_usage;
  end if;

  if tg_op = 'UPDATE' then
    -- The redemption counter and the owner are facts, not fields.
    if new.used is distinct from old.used then
      raise exception 'the usage counter is written by the checkout, not by the shop';
    end if;
    if new.shop_id is distinct from old.shop_id then
      raise exception 'a promo cannot change hands';
    end if;
    if new.code is distinct from old.code and old.used > 0 then
      raise exception 'a promo that has been used cannot be renamed';
    end if;
  end if;

  if coalesce(new.active, true) and (tg_op = 'INSERT' or not coalesce(old.active, false)) then
    select count(*) into v_active
      from coupons
     where shop_id = v_shop
       and active
       and (tg_op = 'INSERT' or id <> old.id);
    if v_active >= v_limits.max_active then
      raise exception 'at most % live promos per shop', v_limits.max_active;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_vendor_promo on public.coupons;
create trigger trg_guard_vendor_promo
  before insert or update on public.coupons
  for each row execute function ps_guard_vendor_promo();

-- ---------------------------------------------------------------------------
-- 4. A shop's code only works on that shop's order.
--    A trigger (not a patch of ps_place_order) so it holds on every installed
--    generation of the RPC.
-- ---------------------------------------------------------------------------
create or replace function ps_guard_order_coupon_shop()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if new.coupon_id is null then
    return new;
  end if;
  select shop_id into v_owner from coupons where id = new.coupon_id;
  -- Platform coupons (shop_id null) apply anywhere, as they always did.
  if v_owner is not null and v_owner is distinct from new.shop_id then
    raise exception 'coupon belongs to another shop';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_guard_coupon_shop on public.orders;
create trigger trg_orders_guard_coupon_shop
  before insert or update of coupon_id on public.orders
  for each row execute function ps_guard_order_coupon_shop();

-- ---------------------------------------------------------------------------
-- 5. The ledger: a shop's own discount leaves the shop's own share.
-- ---------------------------------------------------------------------------
alter table public.shop_ledger
  add column if not exists promo_discount bigint not null default 0;

create or replace function ps_write_shop_ledger()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pct numeric;
  v_commission bigint;
  v_payable bigint;
  v_delivery bigint;
  v_tip bigint;
  v_sur bigint;
  v_row jsonb := to_jsonb(new);
  v_fd_waived bigint;
  v_coupon_shop uuid;
  v_promo bigint := 0;
begin
  if new.status = 'delivered' and old.status is distinct from new.status then
    select commission_pct into v_pct from shops where id = new.shop_id;
    if v_pct is null then v_pct := 15; end if;
    v_commission := floor((new.subtotal * v_pct) / 100);
    v_payable := new.subtotal - v_commission;
    v_delivery := coalesce(new.delivery_charge, 0);
    v_tip := coalesce((v_row->>'tip_amount')::bigint, 0);
    v_sur := coalesce((v_row->>'surcharge_night')::bigint, 0)
           + coalesce((v_row->>'surcharge_rain')::bigint, 0)
           + coalesce((v_row->>'surcharge_distance')::bigint, 0)
           + coalesce((v_row->>'surcharge_express')::bigint, 0)
           + coalesce((v_row->>'surcharge_weight')::bigint, 0);
    -- Free delivery the SHOP offered: the rider is still paid, so the waived
    -- amount leaves the shop's share (never below zero on this line).
    v_fd_waived := coalesce((v_row->>'free_delivery_waived')::bigint, 0);
    if coalesce(v_row->>'free_delivery_by', '') = 'shop' and v_fd_waived > 0 then
      v_payable := greatest(0, v_payable - v_fd_waived);
    end if;
    -- B3: the SHOP's own promo code. The shopper's discount is real money the
    -- shop chose to give away, so it comes out of this shop's share — the
    -- platform's commission is never used to fund it. A platform coupon
    -- (shop_id null) is PROSANTI's own spend and leaves this line alone.
    if new.coupon_id is not null and new.shop_id is not null then
      select shop_id into v_coupon_shop from coupons where id = new.coupon_id;
      if v_coupon_shop = new.shop_id and coalesce(new.discount, 0) > 0 then
        v_promo := least(coalesce(new.discount, 0), greatest(0, v_payable));
        v_payable := greatest(0, v_payable - v_promo);
      end if;
    end if;
    -- A return order is the reverse leg: the shop pays the product share back.
    if coalesce((v_row->>'is_return')::boolean, false) then
      v_payable := -(new.subtotal - v_commission);
      v_promo := 0;
    end if;
    if new.shop_id is null then
      return new;
    end if;
    insert into shop_ledger (shop_id, order_id, subtotal, commission, payable, delivery_charge, tip_amount, surcharge_total, promo_discount)
    values (new.shop_id, new.id, new.subtotal, v_commission, v_payable, v_delivery, v_tip, v_sur, v_promo)
    on conflict (order_id) do update set
      subtotal = excluded.subtotal,
      commission = excluded.commission,
      payable = excluded.payable,
      delivery_charge = excluded.delivery_charge,
      tip_amount = excluded.tip_amount,
      surcharge_total = excluded.surcharge_total,
      promo_discount = excluded.promo_discount;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_ledger_on_delivered on public.orders;
create trigger trg_orders_ledger_on_delivered
  after update of status on orders
  for each row execute function ps_write_shop_ledger();

commit;

do $$
begin
  raise notice 'VENDOR PROMOS OK';
end $$;
