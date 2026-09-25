-- PART 6/12 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ============================================================================
-- MIGRATION 21/23 — P0 GROWTH: flash, bundle, gift, referral, price watches (recreates ps_place_order — FINAL)  (source: supabase/migrations/202609130008_growth_promos_gift_referral.sql)
-- ============================================================================

-- ============================================================================
-- P0 GROWTH (2026-09-13): flash drop + bundle sets, gift mode, referral,
-- price-drop watches.
-- ============================================================================
-- Additive and idempotent. It teaches ps_place_order four new money rules and
-- creates the four tables they need:
--
--   price_watches    who wants a call when a price drops (no email/SMS sender
--                    exists, so the promise is a human call — see P0 #5)
--   referral_codes   the shareable code a CUSTOMER ACCOUNT owns
--   referral_rewards the ledger: one credit per (code, referee phone)
--   orders.*         gift mode + the automatic-offer breakdown
--
-- Money posture: the client NEVER sends a price. It sends intents (which code,
-- gift yes/no + wrap id, which bundle discount) and the RPC re-derives the
-- money from site_settings['ops'] plus live rows, clamped to what the cart can
-- actually carry. A tampered payload loses the discount; it cannot grow one.
-- ============================================================================

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
-- staff; codes/ledger are staff-only (the storefront asks the API, which uses
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

-- ----------------------------------------------------------------------------
-- 3. ps_place_order — the flat-delivery rule unchanged, plus the P0 offers.
-- ----------------------------------------------------------------------------
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_lat double precision := nullif(p_order->>'lat', '')::double precision;
  v_lng double precision := nullif(p_order->>'lng', '')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km', '')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at', '')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_pickup_slot text := nullif(trim(coalesce(p_order->>'pickup_slot', '')), '');
  v_tip bigint := greatest(0, least(50000, coalesce((p_order->>'tip_amount')::bigint, 0)));
  v_weight double precision := nullif(p_order->>'weight_kg', '')::double precision;
  v_sur_night bigint := greatest(0, coalesce((p_order->>'surcharge_night')::bigint, 0));
  v_sur_rain bigint := greatest(0, coalesce((p_order->>'surcharge_rain')::bigint, 0));
  v_sur_dist bigint := greatest(0, coalesce((p_order->>'surcharge_distance')::bigint, 0));
  v_sur_express bigint := greatest(0, coalesce((p_order->>'surcharge_express')::bigint, 0));
  v_sur_weight bigint := greatest(0, coalesce((p_order->>'surcharge_weight')::bigint, 0));
  v_para text := coalesce(trim(p_order->>'para'), trim(p_order->>'area'), '');
  v_district text := coalesce(trim(p_order->>'district'), 'Sunamganj');
  v_upazila text := coalesce(trim(p_order->>'upazila'), 'Sunamganj Sadar');
  -- P0 growth (2026-09-13): everything below is re-derived from ops settings
  -- and live rows. The client sends INTENTS only, never money.
  v_ops jsonb := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb);
  v_flash jsonb := coalesce(v_ops->'flash', '{}'::jsonb);
  v_bundle jsonb := coalesce(v_ops->'bundle', '{}'::jsonb);
  v_gift jsonb := coalesce(v_ops->'gift', '{}'::jsonb);
  v_ref jsonb := coalesce(v_ops->'referral', '{}'::jsonb);
  v_scope text := coalesce(v_flash->>'scope', 'featured');
  v_ids jsonb := coalesce(v_flash->'productIds', '[]'::jsonb);
  v_now_min int := (floor(extract(epoch from (now() at time zone 'Asia/Dhaka')) / 60)::bigint % 1440)::int;
  v_slot record;
  v_s int;
  v_e int;
  v_flash_on boolean := false;
  v_flash_pct int := 0;
  v_flash_cap bigint := 0;
  v_flash_line bigint := 0;
  v_flash_total bigint := 0;
  v_flash_discount bigint := 0;
  v_bundle_pct int := 0;
  v_bundle_discount bigint := 0;
  v_promo bigint := 0;
  v_promo_kind text := '';
  v_seen uuid[] := '{}';
  v_pieces int := 0;
  v_is_gift boolean := coalesce((p_order->>'is_gift')::boolean, false);
  v_gift_wrap text := lower(trim(coalesce(p_order->>'gift_wrap', 'none')));
  v_gift_fee bigint := 0;
  v_ref_code text := upper(trim(coalesce(p_order->>'referral_code', '')));
  v_ref_credit bigint := 0;
  v_phone text := trim(p_order->>'customer_phone');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  -- Is a flash window open right now (Asia/Dhaka)? Slots wrap midnight.
  if coalesce((v_flash->>'enabled')::boolean, false) then
    v_flash_pct := least(greatest(coalesce((v_flash->>'discountPct')::int, 0), 0), 100);
    v_flash_cap := greatest(0, coalesce((v_flash->>'maxDiscountPaisa')::bigint, 0));
    if v_flash_pct > 0 then
      for v_slot in select value from jsonb_array_elements(coalesce(v_flash->'slots', '[]'::jsonb)) loop
        if coalesce(v_slot.value->>'start', '') ~ '^[0-9]{2}:[0-9]{2}$'
           and coalesce(v_slot.value->>'end', '') ~ '^[0-9]{2}:[0-9]{2}$' then
          v_s := (left(v_slot.value->>'start', 2)::int * 60 + right(v_slot.value->>'start', 2)::int);
          v_e := (left(v_slot.value->>'end', 2)::int * 60 + right(v_slot.value->>'end', 2)::int);
          if v_s <> v_e and (
               (v_s < v_e and v_now_min >= v_s and v_now_min < v_e)
               or (v_s > v_e and (v_now_min >= v_s or v_now_min < v_e))
             ) then
            v_flash_on := true;
          end if;
        end if;
      end loop;
    end if;
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found and not v_is_pickup then
    raise exception 'zone unavailable';
  end if;
  if not found and v_is_pickup then
    -- Pickup happens at the hub; record the first active zone, charge nothing.
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then
      raise exception 'zone unavailable';
    end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line, resolve the shop, reserve variant stock under locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not v_is_pickup and not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if not (v_product.id = any (v_seen)) then
      v_seen := array_append(v_seen, v_product.id);
      v_pieces := v_pieces + 1;
    end if;
    -- Flash drop: recomputed from ops settings against the live product row.
    if v_flash_on and (
         v_scope = 'all'
         or (v_scope = 'featured' and v_product.featured)
         or (v_scope = 'selected' and exists (
              select 1 from jsonb_array_elements_text(v_ids) u
              where lower(u) = lower(v_product.id::text) or lower(u) = lower(v_product.slug)))
       ) then
      -- Cap is PER PIECE (maxDiscountPaisa), exactly what the badge quotes.
      v_flash_line := (v_product.price * v_flash_pct) / 100;
      if v_flash_cap > 0 then
        v_flash_line := least(v_flash_line, v_flash_cap);
      end if;
      v_flash_total := v_flash_total + v_flash_line * v_qty;
    end if;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Outside Sunamganj Sadar (other upazila / other district) minimum ৳500.
  if not v_is_pickup and v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := 0; -- free_delivery coupon waives the charge below
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- ------------------------------------------------------------------
  -- FLAT RULE: pickup and free-delivery coupons ride free. Otherwise
  -- ৳60 flat + server-computed surcharges (night/rain/distance/express/weight).
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    v_charge := 6000 + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- P0 automatic offers — ONE per order, best wins, ties favour the flash
  -- drop (it is time-boxed and must not lose to a code the shopper forgot
  -- to remove). Flash is recomputed here; a bundle claim is only a number
  -- from the client, so it is bounded by the configured percentage of THIS
  -- order's subtotal and by the number of distinct pieces actually in it.
  -- ------------------------------------------------------------------
  -- The cap already bit per piece in the loop; nothing else to take off.
  v_flash_discount := v_flash_total;
  v_bundle_pct := least(greatest(coalesce((v_bundle->>'discountPct')::int, 0), 0), 100);
  if coalesce((v_bundle->>'enabled')::boolean, false)
     and v_bundle_pct > 0
     and v_pieces >= 1 + greatest(1, coalesce((v_bundle->>'minComplements')::int, 1))
  then
    v_bundle_discount := least(
      greatest(0, coalesce((p_order->>'bundle_discount')::bigint, 0)),
      (v_subtotal * v_bundle_pct) / 100
    );
  end if;
  if v_flash_discount > 0 and v_flash_discount >= v_bundle_discount then
    v_promo := v_flash_discount; v_promo_kind := 'flash';
  elsif v_bundle_discount > 0 then
    v_promo := v_bundle_discount; v_promo_kind := 'bundle';
  end if;

  -- Gift wrap: the fee comes from settings by wrap id, never from the client.
  if v_is_gift and coalesce((v_gift->>'enabled')::boolean, false) then
    if v_gift_wrap = 'standard' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'standardWrapFeePaisa')::bigint, 0));
    elsif v_gift_wrap = 'premium' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'premiumWrapFeePaisa')::bigint, 0));
    else
      v_gift_wrap := 'none';
    end if;
    if v_gift_fee <= 0 then v_gift_wrap := 'none'; end if;
  else
    v_is_gift := false; v_gift_wrap := 'none'; v_gift_fee := 0;
  end if;

  -- ৳50 for a friend who brings their FIRST order: the code must be issued,
  -- the buyer must be new to the shop, this code must not have credited this
  -- phone before, and the order must clear the configured minimum.
  if v_ref_code <> '' and coalesce((v_ref->>'enabled')::boolean, false) then
    if exists (select 1 from referral_codes rc where rc.code = v_ref_code)
       and not exists (select 1 from orders o where o.customer_phone = v_phone)
       and not exists (select 1 from referral_rewards rr
                        where rr.code = v_ref_code and rr.referee_phone = v_phone)
       and v_subtotal >= greatest(0, coalesce((v_ref->>'minOrderPaisa')::bigint, 0))
    then
      v_ref_credit := greatest(0, least(
        coalesce((v_ref->>'friendRewardPaisa')::bigint, 0),
        greatest(0, v_subtotal - v_discount - v_promo)
      ));
    end if;
  end if;

  -- Discounts are capped by the goods in the cart — the total can only ever be
  -- reduced to the delivery charge + tip + wrap fee.
  if v_discount + v_promo + v_ref_credit > v_subtotal then
    v_promo := least(v_promo, greatest(0, v_subtotal - v_discount));
    v_ref_credit := least(v_ref_credit, greatest(0, v_subtotal - v_discount - v_promo));
  end if;

  v_total := greatest(0, v_subtotal - v_discount - v_promo - v_ref_credit
                        + v_charge + v_tip + v_gift_fee);

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    is_gift, gift_wrap, gift_fee, gift_recipient_name, gift_recipient_phone, gift_message,
    promo_kind, promo_discount, referral_code, referral_credit,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_is_gift, nullif(v_gift_wrap, 'none'), v_gift_fee,
    nullif(left(coalesce(trim(p_order->>'gift_recipient_name'), ''), 60), ''),
    nullif(regexp_replace(coalesce(p_order->>'gift_recipient_phone', ''), '[^0-9]', '', 'g'), ''),
    nullif(left(coalesce(trim(p_order->>'gift_message'), ''), 240), ''),
    nullif(v_promo_kind, ''), v_promo,
    case when v_ref_credit > 0 then v_ref_code else null end, v_ref_credit,
    v_subtotal, v_charge, v_discount + v_promo + v_ref_credit,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  if v_ref_credit > 0 then
    insert into referral_rewards (code, referee_phone, order_id, friend_credit)
    values (v_ref_code, v_phone, v_order_id, v_ref_credit)
    on conflict (code, referee_phone) do nothing;
  end if;

  insert into order_status_history (order_id, status, note)
  values (
    v_order_id, 'pending',
    'Placed via checkout — ' || v_district || ' / ' || v_upazila || ' / '
      || nullif(v_para, '') || ' | zone=' || v_zone.id
      || ' | flat60=' || (v_charge = 6000)::text
      || ' | pickup=' || v_is_pickup::text
      || ' | coupon_free=' || (v_has_coupon and v_coupon.type = 'free_delivery')::text
      || ' | tip=' || v_tip::text
      || ' | gift=' || coalesce(v_gift_wrap, 'none') || ':' || v_gift_fee::text
      || ' | promo=' || coalesce(nullif(v_promo_kind, ''), 'none') || ':' || v_promo::text
      || ' | ref=' || case when v_ref_credit > 0 then v_ref_code || ':' || v_ref_credit::text else 'none' end
  );

  return v_order_id;
end $$;

-- ----------------------------------------------------------------------------
-- 4. The referrer's ৳50: minted as a REAL single-use coupon when the friend's
--    order is delivered (that is the moment the referral has earned it).
--    Idempotent — one credit per (code, referee) — so a re-fired advance call
--    cannot print money.
-- ----------------------------------------------------------------------------
create or replace function ps_credit_referrer(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v orders%rowtype;
  v_cfg jsonb;
  v_rc referral_codes%rowtype;
  v_grants int;
  v_reward bigint;
  v_coupon_id uuid;
  v_coupon_code text;
begin
  select * into v from orders where id = p_order_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no order');
  end if;
  if coalesce(v.referral_code, '') = '' or v.status <> 'delivered' then
    return jsonb_build_object('granted', false, 'reason', 'not eligible');
  end if;
  if exists (select 1 from referral_rewards rr
             where rr.code = v.referral_code
               and rr.referee_phone = v.customer_phone
               and rr.referrer_coupon_id is not null) then
    return jsonb_build_object('granted', false, 'reason', 'already credited');
  end if;

  v_cfg := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb)->'referral';
  if not coalesce((v_cfg->>'enabled')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason', 'disabled');
  end if;
  select * into v_rc from referral_codes where code = v.referral_code;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown code');
  end if;
  v_reward := greatest(0, coalesce((v_cfg->>'referrerRewardPaisa')::bigint, 0));
  if v_reward <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'zero reward');
  end if;

  select count(*) into v_grants from referral_rewards rr
  where rr.code = v.referral_code and rr.referrer_coupon_id is not null;
  if v_grants >= greatest(1, coalesce((v_cfg->>'maxRewardsPerReferrer')::int, 10)) then
    return jsonb_build_object('granted', false, 'reason', 'cap reached');
  end if;

  v_coupon_code := 'PSREF' || v.referral_code || '-' || (v_grants + 1)::text;
  insert into coupons (code, type, value, min_order, valid_until, usage_limit, used, active)
  values (v_coupon_code, 'fixed', v_reward, 0, now() + interval '180 days', 1, 0, true)
  returning id into v_coupon_id;

  update referral_rewards rr
  set referrer_coupon_id = v_coupon_id, referrer_reward = v_reward
  where rr.code = v.referral_code and rr.referee_phone = v.customer_phone
    and rr.referrer_coupon_id is null;

  return jsonb_build_object('granted', true, 'code', v_coupon_code,
                            'reward', v_reward, 'name', v_rc.customer_name);
end $$;

commit;


-- ============================================================================
-- MIGRATION 22/23 — customer photos on reviews  (source: supabase/migrations/202609140001_review_photos.sql)
-- ============================================================================

-- ============================================================================
-- P1 UGC (2026-09-14): customer photos on reviews.
--
-- Clothes fit is a trust problem, and a photo of the garment on a real body
-- answers it better than any description. Photos ride their review's
-- moderation state — a pending review's photos are invisible to the public
-- read policy, exactly like the review itself.
--
-- url holds either a Cloudinary URL (when the image service is configured —
-- the review API uploads there server-side) or a compressed JPEG data URL
-- (launch scale: the shop's own Postgres carries them until Cloudinary keys
-- are set; see docs/go-live.md step 6). One review, at most 3 photos.
-- ============================================================================

begin;

create table if not exists review_photos (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references reviews (id) on delete cascade,
  url        text not null check (char_length(url) between 8 and 1_500_000),
  created_at timestamptz not null default now()
);
create index if not exists idx_review_photos_review on review_photos (review_id);

-- RLS: the storefront anon client may read photos of APPROVED reviews only
-- (same posture as the reviews table); staff see everything (moderation);
-- there is no public insert — the review API writes with the service role.
alter table review_photos enable row level security;

drop policy if exists "review photos public read" on review_photos;
create policy "review photos public read" on review_photos
  for select using (
    exists (
      select 1 from reviews r
      where r.id = review_photos.review_id and r.status = 'approved'
    )
  );

drop policy if exists "admin all review photos" on review_photos;
create policy "admin all review photos" on review_photos
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;


-- ============================================================================
-- MIGRATION 23/23 — exchange at-home pickup (rider reverse-logistics leg)  (source: supabase/migrations/202609140002_return_pickups.sql)
-- ============================================================================

-- ============================================================================
-- P1 #13 (2026-09-14): exchange at-home pickup — the rider reverse-logistics
-- leg on the 7-day exchange.
--
-- The return ORDER mechanics already exist (migration 017): ps_place_order
-- accepts is_return + return_parent_id and prices the leg at zero. What was
-- missing:
--   1. customer-side eligibility + request creation (7-day window from the
--      proven 'delivered' history entry, one return per parent);
--   2. the shop's approve/reject decision on a requested return;
--   3. the reverse leg itself: an approved return moves to
--      'ready-for-pickup' so the normal dispatch (ps_offer_order → rider
--      accept → pickup from the customer's home → drop at the shop) carries
--      it; rider pickup/drop events mirror onto return_status.
--
-- Nothing here pays anyone. A return is a zero-total, zero-charge order; the
-- exchange item or the cash goes through the shop's normal offline handling,
-- which is exactly what the statuses say out loud.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Eligibility. NULL when the customer may request; otherwise a reason code
--    the app maps to an honest message. The window is measured from the
--    latest 'delivered' entry in order_status_history — the proven moment,
--    not a guess — and a parent with a live return (requested/approved/
--    picked_up) can only ever have one.
-- ---------------------------------------------------------------------------
create or replace function ps_return_eligible(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from orders o where o.id = p_order_id and o.status = 'delivered'
    ) then 'not-delivered'
    when exists (
      select 1 from orders r
      where r.return_parent_id = p_order_id
        and r.return_status in ('requested', 'approved', 'picked_up')
    ) then 'already-requested'
    when (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) is null then 'no-delivery-record'
    when now() > (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) + interval '7 days' then 'window-expired'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Customer request → the zero-charge return order via ps_place_order.
--    Items, address, zone and geo come from the parent order itself, so the
--    rider's pickup leg is exactly the doorstep the order was delivered to.
--    (ps_place_order re-validates every product — a delisted item fails
--    honestly here and the shop handles it manually.)
-- ---------------------------------------------------------------------------
create or replace function ps_create_return_request(
  p_order_id uuid,
  p_reason text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent orders%rowtype;
  v_reason text;
  v_items jsonb;
begin
  select * into v_parent from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if ps_return_eligible(p_order_id) is not null then
    raise exception 'not eligible: %', ps_return_eligible(p_order_id);
  end if;

  v_reason := left(
    trim(coalesce(p_reason, '')) || ' — ' || trim(coalesce(p_details, '')),
    500
  );
  if length(v_reason) < 5 then raise exception 'reason too short'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'qty', qty,
      'variant_id', variant_id
    )
  ), '[]'::jsonb) into v_items
  from order_items where order_id = p_order_id;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'no items on parent order';
  end if;

  return ps_place_order(jsonb_build_object(
    'customer_name', v_parent.customer_name,
    'customer_phone', v_parent.customer_phone,
    'area', v_parent.area,
    'address', v_parent.address,
    'note', 'Return pickup (' || left(coalesce(p_reason, ''), 80) || ')',
    'zone_id', v_parent.zone_id,
    'lat', v_parent.lat,
    'lng', v_parent.lng,
    'is_return', true,
    'return_parent_id', p_order_id,
    'return_reason', v_reason
  ), v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Shop decision on a REQUESTED return, and manual completion. Approving
--    moves the return order to 'ready-for-pickup' — the state ps_offer_order
--    dispatches — so the existing rider leg (offer → accept → pickup from
--    the customer's home → deliver at the shop) is the reverse logistics.
-- ---------------------------------------------------------------------------
create or replace function ps_return_action(
  p_order_id uuid,
  p_action text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
begin
  select * into v from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not coalesce(v.is_return, false) then
    raise exception 'not a return order';
  end if;

  if p_action = 'approve' then
    if v.return_status <> 'requested' then
      raise exception 'only a requested return can be approved';
    end if;
    if v.status <> 'pending' then
      raise exception 'return order already moved on';
    end if;
    update orders
    set return_status = 'approved', status = 'ready-for-pickup'
    where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, 'ready-for-pickup', 'Return approved — rider pickup ready');
  elsif p_action = 'reject' then
    if v.return_status <> 'requested' then
      raise exception 'only a requested return can be rejected';
    end if;
    update orders
    set return_status = 'rejected', status = 'cancelled'
    where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, 'cancelled',
            'Return rejected: ' || left(trim(coalesce(p_note, '')), 200));
  elsif p_action = 'complete' then
    if v.return_status not in ('approved', 'picked_up') then
      raise exception 'return leg not finished';
    end if;
    update orders set return_status = 'refunded' where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, v.status,
            'Return completed by shop: ' || left(trim(coalesce(p_note, '')), 200));
  else
    raise exception 'unknown action: %', p_action;
  end if;

  return v.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Mirror the rider's leg onto return_status, so the customer's tracking
--    (and the shop) see the same truth the riders act on. The order row
--    itself still moves through the normal ps_rider_* flow.
-- ---------------------------------------------------------------------------
create or replace function ps_return_leg_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
begin
  if new.state in ('picked_up', 'delivered')
     and old.state not in ('picked_up', 'delivered') then
    select * into v from orders where id = new.order_id;
    if found and coalesce(v.is_return, false) and v.return_status is not null then
      if new.state = 'picked_up' and v.return_status = 'approved' then
        update orders set return_status = 'picked_up' where id = v.id;
        insert into order_status_history (order_id, status, note)
        values (v.id, v.status, 'Return item picked up from the customer');
      elsif new.state = 'delivered'
            and v.return_status in ('approved', 'picked_up') then
        update orders set return_status = 'refunded' where id = v.id;
        insert into order_status_history (order_id, status, note)
        values (v.id, v.status,
                'Return item received by the shop — exchange/refund handled by the shop');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_return_leg_sync on delivery_assignments;
create trigger trg_return_leg_sync
  after update of state on delivery_assignments
  for each row execute function ps_return_leg_sync();

commit;


-- ============================================================================
-- MIGRATION 24/24 — warranty claims on accessories (P1 #14)  (source: supabase/migrations/202609140003_warranty_claims.sql)
-- ===========================================================================
begin;

-- Warranty period per product (days). Null = no warranty on this item.
alter table products
  add column if not exists warranty_days int
  check (warranty_days is null or warranty_days between 1 and 365);

create table if not exists warranty_claims (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders (id) on delete cascade,
  product_id     uuid not null references products (id) on delete cascade,
  customer_name  text not null,
  customer_phone text not null,
  problem        text not null check (char_length(problem) between 5 and 2000),
  status         text not null default 'submitted'
                 check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  resolution     text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
create index if not exists idx_warranty_claims_order on warranty_claims (order_id);
create index if not exists idx_warranty_claims_product on warranty_claims (product_id);

-- At most ONE live claim per order+item (a later claim is only possible
-- after a rejection). The app checks ps_warranty_eligible first; this index
-- makes the one-live-claim rule true at the database level too, even under
-- double-taps (the API maps the conflict back to "already claimed").
create unique index if not exists uq_warranty_claims_live
  on warranty_claims (order_id, product_id)
  where status in ('submitted', 'under_review', 'approved');

-- The claim flows through the service-role APIs; staff read/write in the
-- admin surface. No public read — customers see their claim from the track
-- page, which reads through the same service-role lookup (order + phone).
alter table warranty_claims enable row level security;
drop policy if exists "admin all warranty claims" on warranty_claims;
create policy "admin all warranty claims" on warranty_claims
  for all using (ps_is_admin()) with check (ps_is_admin());

-- ---------------------------------------------------------------------------
-- Eligibility. NULL when the customer may claim; otherwise a reason code the
-- app maps to an honest message. The window runs warranty_days from the
-- proven 'delivered' history entry — the same source of truth as the
-- 7-day exchange window (P1 #13).
-- ---------------------------------------------------------------------------
create or replace function ps_warranty_eligible(p_order_id uuid, p_product_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from orders o where o.id = p_order_id and o.status = 'delivered'
    ) then 'not-delivered'
    when not exists (
      select 1 from order_items oi
      where oi.order_id = p_order_id and oi.product_id = p_product_id
    ) then 'not-in-order'
    when not exists (
      select 1 from products p where p.id = p_product_id and p.warranty_days is not null
    ) then 'no-warranty'
    when (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) is null then 'no-delivery-record'
    when now() > (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) + make_interval(days => (
      select warranty_days from products where id = p_product_id
    )) then 'window-expired'
    when exists (
      select 1 from warranty_claims c
      where c.order_id = p_order_id and c.product_id = p_product_id
        and c.status in ('submitted', 'under_review', 'approved')
    ) then 'already-claimed'
    else null
  end;
$$;

commit;


