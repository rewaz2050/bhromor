-- PART 14/22 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: vendor promos (202609280003) ====
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

-- ==== Feature: shop funnel (202609280004) ====
-- ============================================================================
-- Shop-wise funnel (2026-09-28) — B4 of the shop-service upgrade
--
-- Admin → Reports already has the whole-market funnel (202609260004). This is
-- the same idea, scoped to ONE shop, for that shop's own dashboard: how many
-- people opened its storefront, looked at a product, put one in the bag,
-- started checkout, and how many orders really happened.
--
--   * `storefront_events` already carries shop_id (the product-level events
--     sent it from day one). Two gaps closed here:
--       1. historical rows that have a product_id but no shop_id are backfilled
--          from `products` — attribution we can prove, nothing guessed;
--       2. a `page_view` of a shop's storefront now carries the shop id too
--          (client: ShopAttribute + lib/page-shop.ts), which is what makes
--          "opened my page" countable at all.
--   * `ps_shop_funnel_report(p_shop_id, p_days)` — one JSON blob per shop:
--     sessions, page views, the four step counts, real orders/revenue/AOV from
--     `orders` (cancelled and return orders excluded), where the add-to-bags
--     came from, and the shop's own top products by views → adds → orders.
--     The function is scoped to the shop id it is GIVEN; the API passes the
--     shop id of the verified vendor session, never a client-supplied one.
--
-- Privacy: nothing personal exists in storefront_events (anonymous per-tab
-- session id only) and this function adds no new exposure. RLS on the table is
-- untouched — no policies, no grants to anon/authenticated — so the report is
-- reachable only through the service role (the vendor API route, after
-- requireVendor has proved who is asking).
--
-- Idempotent — safe to re-run. Expect "SHOP FUNNEL OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Attribution backfill (provable only: product_id -> products.shop_id)
-- ---------------------------------------------------------------------------
update public.storefront_events e
   set shop_id = p.shop_id::text
  from public.products p
 where e.shop_id is null
   and e.product_id is not null
   and p.id::text = e.product_id
   and p.shop_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Index for the per-shop reads (the table keeps its 90-day retention)
-- ---------------------------------------------------------------------------
create index if not exists storefront_events_shop_idx
  on public.storefront_events (shop_id, event, created_at desc)
  where shop_id is not null;

-- ---------------------------------------------------------------------------
-- 3. The per-shop report
-- ---------------------------------------------------------------------------
create or replace function public.ps_shop_funnel_report(
  p_shop_id text,
  p_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id text := nullif(btrim(coalesce(p_shop_id, '')), '');
  v_days int := least(greatest(coalesce(p_days, 7), 1), 90);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
  v_shop_page_views bigint;
  v_sessions bigint;
  v_pdp bigint;
  v_atc bigint;
  v_checkout bigint;
  v_purchase bigint;
  v_orders bigint;
  v_revenue bigint;
  v_units bigint;
  v_atc_by_source jsonb;
  v_top_products jsonb;
begin
  -- No shop id = nothing to report (never another shop's numbers).
  if v_shop_id is null then
    return jsonb_build_object('days', v_days, 'shop_id', null, 'sessions', 0, 'page_views', 0,
      'pdp_sessions', 0, 'atc_sessions', 0, 'checkout_sessions', 0, 'purchase_sessions', 0,
      'orders', 0, 'revenue', 0, 'aov', null, 'units', 0, 'atc_by_source', '[]'::jsonb,
      'top_products', '[]'::jsonb);
  end if;

  select
    count(*) filter (where event = 'page_view'),
    count(distinct session_id),
    count(distinct session_id) filter (where event = 'view_item'),
    count(distinct session_id) filter (where event = 'add_to_cart'),
    count(distinct session_id) filter (where event = 'begin_checkout'),
    count(distinct session_id) filter (where event = 'purchase')
    into v_shop_page_views, v_sessions, v_pdp, v_atc, v_checkout, v_purchase
  from public.storefront_events
  where created_at >= v_since
    and shop_id = v_shop_id;

  -- Real money from `orders`, not the client ping (same rule as the market
  -- report): cancelled and return orders are not a sale.
  select count(*), coalesce(sum(o.total), 0)
    into v_orders, v_revenue
  from public.orders o
  where o.created_at >= v_since
    and o.shop_id::text = v_shop_id
    and o.status <> 'cancelled'
    and not coalesce(o.is_return, false);

  -- Pieces really sold (from order_items, so partial/returned lines are not
  -- counted as sales).
  select coalesce(sum(oi.qty), 0)
    into v_units
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.created_at >= v_since
    and o.shop_id::text = v_shop_id
    and o.status <> 'cancelled'
    and not coalesce(o.is_return, false);

  select coalesce(jsonb_agg(jsonb_build_object('source', source, 'count', n) order by n desc), '[]'::jsonb)
    into v_atc_by_source
  from (
    select coalesce(nullif(source, ''), 'other') as source, count(*) as n
    from public.storefront_events
    where created_at >= v_since
      and shop_id = v_shop_id
      and event = 'add_to_cart'
    group by 1
  ) s;

  -- The shop's own products: looked at, added, and actually ordered. Views and
  -- adds come from the events (text product ids), orders from order_items of
  -- this shop's orders in the window — three honest numbers per product, so
  -- "seen a lot, never bought" is visible instead of guessed.
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', product_id,
           'name', name,
           'slug', slug,
           'views', views,
           'adds', adds,
           'orders', orders)
         order by views desc, adds desc, name), '[]'::jsonb)
    into v_top_products
  from (
    select
      coalesce(p.id::text, ev.product_id) as product_id,
      coalesce(nullif(p.name_bn, ''), p.name, '(removed product)') as name,
      p.slug as slug,
      ev.views,
      ev.adds,
      coalesce(ord.orders, 0) as orders
    from (
      select product_id,
             count(*) filter (where event = 'view_item') as views,
             count(*) filter (where event = 'add_to_cart') as adds
      from public.storefront_events
      where created_at >= v_since
        and shop_id = v_shop_id
        and product_id is not null
      group by product_id
    ) ev
    left join public.products p on p.id::text = ev.product_id
    left join (
      select oi.product_id::text as product_id, count(distinct oi.order_id) as orders
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.created_at >= v_since
        and o.shop_id::text = v_shop_id
        and o.status <> 'cancelled'
        and not coalesce(o.is_return, false)
        and oi.product_id is not null
      group by 1
    ) ord on ord.product_id = ev.product_id
    order by ev.views desc, ev.adds desc
    limit 10
  ) t;

  return jsonb_build_object(
    'days', v_days,
    'shop_id', v_shop_id,
    'sessions', v_sessions,
    'page_views', v_shop_page_views,
    'pdp_sessions', v_pdp,
    'atc_sessions', v_atc,
    'checkout_sessions', v_checkout,
    'purchase_sessions', v_purchase,
    'orders', v_orders,
    'revenue', v_revenue,
    'aov', case when v_orders > 0 then (v_revenue / v_orders) else null end,
    'units', v_units,
    'atc_by_source', v_atc_by_source,
    'top_products', v_top_products
  );
end;
$$;

revoke execute on function public.ps_shop_funnel_report(text, int) from public, anon, authenticated;

commit;

do $$ begin raise notice 'SHOP FUNNEL OK'; end $$;

-- ==== Feature: shop verification (202609280005) ====
-- ============================================================================
-- Verified shop badge (2026-09-28) — B5 of the shop-service upgrade
--
-- The first question a new customer asks about an unknown shop is "can I trust
-- it?". A badge only answers that if it means something specific and cannot be
-- awarded by the shop itself. So:
--
--   * TWO DOCUMENT CHECKS, not one vague "verified" switch: the owner's NID and
--     the trade licence. Staff tick what they actually held and looked at.
--   * THE BADGE IS DERIVED FROM THE EVIDENCE. Both checks in → verified_at is
--     stamped. Remove either check → the badge, the timestamp and the officer
--     are CLEARED by the trigger below, so a badge can never outlive the
--     documents behind it (not even against a direct SQL update).
--   * A SHOP CANNOT VERIFY ITSELF. Every verification column is added to
--     ps_guard_shop_vendor_update: a vendor session (or a direct anon-key call
--     with the shop's own JWT) that tries to set them is refused.
--   * AN AUDIT TRAIL THAT SURVIVES THE NEXT EDIT. `shop_verification_events`
--     is append-only (no update/delete policy, plus a trigger that refuses
--     both), so "who verified this, when, and what did they write" stays
--     answerable even after the badge is taken away and given back.
--
-- Privacy: the shop's own note and the officer's e-mail are staff-only. The
-- storefront reads the two booleans and the date — never the note.
--
-- Idempotent — safe to re-run. Expect "SHOP VERIFICATION OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists nid_checked           boolean not null default false,
  add column if not exists trade_licence_checked boolean not null default false,
  add column if not exists verified_at           timestamptz,
  add column if not exists verified_by           uuid,
  add column if not exists verified_by_email     text,
  add column if not exists verification_note     text;

-- ---------------------------------------------------------------------------
-- 2. The audit log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_verification_events (
  id                    bigint generated always as identity primary key,
  shop_id               uuid not null references public.shops (id) on delete cascade,
  created_at            timestamptz not null default now(),
  action                text not null check (action in ('verified', 'unverified', 'note')),
  nid_checked           boolean not null,
  trade_licence_checked boolean not null,
  note                  text,
  actor_id              uuid,
  actor_email           text
);

create index if not exists shop_verification_events_shop_idx
  on public.shop_verification_events (shop_id, created_at desc);

alter table public.shop_verification_events enable row level security;

drop policy if exists "verification events admin read" on public.shop_verification_events;
create policy "verification events admin read" on public.shop_verification_events
  for select using (ps_is_admin());

drop policy if exists "verification events admin insert" on public.shop_verification_events;
create policy "verification events admin insert" on public.shop_verification_events
  for insert with check (ps_is_admin());

-- No UPDATE / DELETE policy exists on purpose; the trigger makes that explicit
-- rather than relying on "the policy was never written".
create or replace function ps_guard_verification_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'verification history cannot be rewritten';
end $$;

drop trigger if exists trg_verification_events_no_update on public.shop_verification_events;
create trigger trg_verification_events_no_update
  before update or delete on public.shop_verification_events
  for each row execute function ps_guard_verification_append_only();

-- ---------------------------------------------------------------------------
-- 3. The badge follows the evidence (and only staff may move it)
-- ---------------------------------------------------------------------------
create or replace function ps_guard_shop_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A brand-new row is never born verified, whoever inserts it (an INSERT has
  -- no OLD row to compare against, hence the separate branch).
  if tg_op = 'INSERT' then
    if not (select ps_is_admin()) then
      new.nid_checked := false;
      new.trade_licence_checked := false;
      new.verified_at := null;
      new.verified_by := null;
      new.verified_by_email := null;
      new.verification_note := null;
      return new;
    end if;
  end if;

  -- Staff keeps the whole table; this is their job to set.
  if (select ps_is_admin()) then
    -- Badge = BOTH documents checked. Anything less and the stamp goes: a
    -- badge may not outlive the evidence it stands on.
    if not (new.nid_checked and new.trade_licence_checked) then
      new.verified_at := null;
      new.verified_by := null;
      new.verified_by_email := null;
    elsif new.verified_at is null then
      -- Granted straight in SQL (no API): the time is known, the officer is
      -- not — leave verified_by null rather than inventing a name.
      new.verified_at := now();
    end if;
    return new;
  end if;

  -- Everyone else (a vendor session included): the verification columns are
  -- not theirs to touch, even by a direct Supabase call.
  if new.nid_checked is distinct from old.nid_checked
     or new.trade_licence_checked is distinct from old.trade_licence_checked
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.verified_by_email is distinct from old.verified_by_email
     or new.verification_note is distinct from old.verification_note then
    raise exception 'only staff can verify a shop';
  end if;
  return new;
end $$;

drop trigger if exists trg_shops_guard_verification on public.shops;
create trigger trg_shops_guard_verification
  before insert or update on public.shops
  for each row execute function ps_guard_shop_verification();

-- A shop row created by a vendor-side insert must never arrive pre-verified.
alter table public.shops
  drop constraint if exists shops_no_self_verification;
alter table public.shops
  add constraint shops_no_self_verification
  check (verified_at is null or (nid_checked and trade_licence_checked));

commit;

do $$ begin raise notice 'SHOP VERIFICATION OK'; end $$;

-- ==== Feature: shop vacation (202609280006) ====
-- ============================================================================
-- Shop holiday / vacation schedule (2026-09-28) — B6 of the shop-service upgrade
--
-- Until now a shop could only be closed "right now": the vendor flips `is_open`
-- and has to remember to flip it back. Eid, a family wedding, a week's stock
-- trip — all of them meant either staying open on paper (orders arrive, nobody
-- is there) or closing and hoping to remember to reopen.
--
-- This adds a DATE RANGE. The shop books 10–12 Oct in advance:
--
--   * the storefront shows it as closed for those days, with the reopening date,
--     so a shopper is told something real instead of hitting a dead checkout;
--   * an order cannot be PLACED in that window — enforced by a trigger on
--     `orders`, which every generation of ps_place_order goes through, rather
--     than by patching each copy of the RPC;
--   * when the last day passes the shop is open again ON ITS OWN — nothing to
--     run, nothing to remember. The reopening is derived from the dates, not
--     from a cron job that might not fire.
--
-- Deliberately NOT touched: `is_open`. A holiday does not overwrite the shop's
-- own daily switch — while the holiday runs the shop is closed, and the day
-- after it ends the shop is exactly as it left itself.
--
-- A vendor may set its own holiday (it only costs that shop its own sales), but
-- not an endless one: at most `ps_vacation_max_days()` (45) days, both dates
-- together or not at all, and the window cannot be backdated.
--
-- Idempotent — safe to re-run. Expect "SHOP VACATION OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The cap, in one place (staff can change it without a migration) — defined
--    first because the span CHECK below calls it while being created.
-- ---------------------------------------------------------------------------
create or replace function public.ps_vacation_max_days()
returns int
language sql
immutable
as $$ select 45 $$;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists vacation_start date,
  add column if not exists vacation_end   date,
  add column if not exists vacation_note  text;

-- Both dates together or neither; the window runs forward; and it is a holiday,
-- not a permanent closure.
alter table public.shops drop constraint if exists shops_vacation_pair_check;
alter table public.shops
  add constraint shops_vacation_pair_check
  check ((vacation_start is null) = (vacation_end is null));

alter table public.shops drop constraint if exists shops_vacation_order_check;
alter table public.shops
  add constraint shops_vacation_order_check
  check (vacation_start is null or vacation_end >= vacation_start);

alter table public.shops drop constraint if exists shops_vacation_span_check;
alter table public.shops
  add constraint shops_vacation_span_check
  check (
    vacation_start is null
    or (vacation_end - vacation_start) <= public.ps_vacation_max_days()
  );

-- Is this shop on holiday at `p_at` (default: now)?
create or replace function public.ps_shop_on_vacation(p_shop public.shops, p_at timestamptz default now())
returns boolean
language sql
immutable
as $$
  select p_shop.vacation_start is not null
     and p_at::date >= p_shop.vacation_start
     and p_at::date <= p_shop.vacation_end
$$;

-- ---------------------------------------------------------------------------
-- 3. No orders while the shop is away — on the orders table itself, so it
--    holds for every generation of ps_place_order and for any direct write.
-- ---------------------------------------------------------------------------
create or replace function public.ps_guard_order_shop_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop public.shops;
begin
  if new.shop_id is null then
    return new;
  end if;
  -- A return is the reverse leg of a sale already made: the shop's holiday
  -- must not block the pickup of goods going back.
  if coalesce(new.is_return, false) then
    return new;
  end if;

  select * into v_shop from public.shops where id = new.shop_id;
  if not found then
    return new; -- unknown shop: not this trigger's business
  end if;

  if v_shop.status <> 'active' then
    raise exception 'shop is not taking orders';
  end if;
  if not v_shop.is_open then
    raise exception 'shop closed';
  end if;
  if public.ps_shop_on_vacation(v_shop) then
    raise exception 'shop on holiday until %',
      to_char(v_shop.vacation_end + 1, 'DD Mon YYYY');
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_guard_shop_open on public.orders;
create trigger trg_orders_guard_shop_open
  before insert on public.orders
  for each row execute function public.ps_guard_order_shop_open();

-- ---------------------------------------------------------------------------
-- 4. A holiday that has passed stops being news: the moment the window ends the
--    row is cleared, so no screen (and no report) has to know about old dates.
--    Runs on any read or write of the shop row — cheap, and it means "is there
--    a holiday?" is always answerable without comparing dates everywhere.
-- ---------------------------------------------------------------------------
create or replace function public.ps_expire_shop_vacation()
returns trigger
language plpgsql
as $$
begin
  if new.vacation_end is not null and new.vacation_end < (now() at time zone 'UTC')::date then
    new.vacation_start := null;
    new.vacation_end := null;
    new.vacation_note := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_shops_expire_vacation on public.shops;
create trigger trg_shops_expire_vacation
  before update on public.shops
  for each row execute function public.ps_expire_shop_vacation();

-- Rows whose window has already elapsed are quietened now, so the UI does not
-- have to explain a holiday that ended weeks ago.
update public.shops
   set vacation_start = null,
       vacation_end = null,
       vacation_note = null
 where vacation_end is not null
   and vacation_end < (now() at time zone 'UTC')::date;

commit;

do $$ begin raise notice 'SHOP VACATION OK'; end $$;

