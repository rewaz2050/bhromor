-- ============================================================================
-- PER-USER first-10-free promo (owner decision, 2026-09-11)
-- ============================================================================
-- SUPERSEDES 202609100001 + 202609100002 — self-contained: run ONLY this one
-- in Supabase SQL Editor (safe to re-run).
--
-- CHANGE vs 002: the first-10-free counter is now PER CUSTOMER (by normalized
-- phone number), not global. Every user's first 10 orders (cancelled ones
-- excluded) get free delivery — still inside Zone A only.
--
-- Rules:
--   1. Simple form: district → upazila → para (zone derived server-side).
--   2. FIRST 10 ORDERS OVERALL: delivery FREE — Zone A (Sunamganj City) only.
--      Everywhere else the flat zone charge applies.
--   3. Features kept: scheduled/evening slots, express, night/rain surcharge,
--      distance/weight surcharge, rider tip, store pickup — all server-priced.
-- ============================================================================

begin;

-- Refresh the four zone names/charges (areas unchanged).
insert into delivery_zones (id, name, areas, charge, eta_label, sort_order, active) values
  ('z1', 'Zone A — Sunamganj City (A Zone)', array['Boropara','Shologhar','Ukilpara','Courtpara','Jail Road','Modhyabazar','Kalibari','Arambagh','Mollapara'], 3000, '30–40 min', 0, true),
  ('z2', 'Zone B — Sadar Core (1.5-2.5km)', array['Notunpara','Hasannagar','Tegharia','Nabinagar','Sahib Bari Ghat','Hospital Road','Kazir Point','Purba Bazar','Paschim Bazar'], 5000, '40–50 min', 1, true),
  ('z3', 'Zone C — Sadar Extended (2.5-4km)', array['Wayesspur','Balaka Para','Jaliapara','Palpur','Dargahpara','Uttarpara','Dakkhinpara','Shologhar Bypass'], 7000, '50–60 min', 2, true),
  ('z4', 'Zone D — Sadar Bahire / Other district (Courier)', array['Sunamganj Sadar Other','Dolura','Gouripur','Surma River Side','Mollapara Bahire','Shantiganj Border'], 10000, '60–80 min', 3, true)
on conflict (id) do update set
  name = excluded.name,
  areas = excluded.areas,
  charge = excluded.charge,
  eta_label = excluded.eta_label,
  sort_order = excluded.sort_order,
  active = excluded.active;

-- Columns referenced below must exist even on partially-migrated databases.
alter table orders add column if not exists lat double precision;
alter table orders add column if not exists lng double precision;
alter table orders add column if not exists distance_km double precision;
alter table orders add column if not exists scheduled_at timestamptz;
alter table orders add column if not exists delivery_window text;
alter table orders add column if not exists is_express boolean not null default false;
alter table orders add column if not exists is_pickup boolean not null default false;
alter table orders add column if not exists pickup_slot text;
alter table orders add column if not exists tip_amount bigint not null default 0;
alter table orders add column if not exists weight_kg double precision;
alter table orders add column if not exists surcharge_night bigint not null default 0;
alter table orders add column if not exists surcharge_rain bigint not null default 0;
alter table orders add column if not exists surcharge_distance bigint not null default 0;
alter table orders add column if not exists surcharge_express bigint not null default 0;
alter table orders add column if not exists surcharge_weight bigint not null default 0;

-- ----------------------------------------------------------------------------
-- ps_place_order — full version:
--   pickup            → charge 0 (all surcharges dropped)
--   first-10 (Zone A) → charge 0 (all surcharges waived)
--   free-delivery coupon → charge 0
--   otherwise         → zone.charge + night + rain + express + distance + weight
--   total             → subtotal - discount + charge + tip
--   (all surcharge amounts arrive SERVER-COMPUTED from the API validator)
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
  v_user_orders bigint;
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  if not v_is_pickup then
    select * into v_zone from delivery_zones
    where id = p_order->>'zone_id' and active;
    if not found then
      raise exception 'zone unavailable';
    end if;
  else
    -- Pickup happens at the hub; keep the requested zone for the record
    -- (or the first active one when absent) but charge nothing.
    select * into v_zone from delivery_zones
    where id = p_order->>'zone_id' and active;
    if not found then
      select * into v_zone from delivery_zones where active order by sort_order limit 1;
    end if;
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
  -- THE SIMPLE RULE: first 10 orders free — Zone A (Sunamganj City) only.
  -- Pickup and free-delivery coupons also ride free. Otherwise the flat
  -- zone charge + server-computed surcharges apply.
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    -- PER-USER count: same normalized phone, cancelled orders excluded.
    select count(*) into v_user_orders from orders
    where status <> 'cancelled'
      and regexp_replace(regexp_replace(customer_phone, '[^0-9]', '', 'g'), '^88', '')
        = regexp_replace(regexp_replace(trim(coalesce(p_order->>'customer_phone', '')), '[^0-9]', '', 'g'), '^88', '');
    if v_zone.id = 'z1' and v_user_orders < 10 then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    else
      v_charge := v_zone.charge + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    end if;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_charge + v_tip;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_subtotal, v_charge, v_discount,
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

  insert into order_status_history (order_id, status, note)
  values (
    v_order_id, 'pending',
    'Placed via checkout — ' || v_district || ' / ' || v_upazila || ' / '
      || nullif(v_para, '') || ' | zone=' || v_zone.id
      || ' | first10-free=' || (v_charge = 0)::text
      || ' | user_orders=' || v_user_orders::text
      || ' | pickup=' || v_is_pickup::text
      || ' | tip=' || v_tip::text
  );

  return v_order_id;
end $$;

-- Cancel release trigger: reinstall defensively (no-op if already present).
create or replace function ps_release_on_cancel()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update product_variants v
    set reserved = greatest(0, v.reserved - oi.qty)
    from order_items oi
    where oi.order_id = new.id
      and oi.variant_id is not null
      and oi.variant_id = v.id;
  end if;
  return new;
end $$;

-- Per-user counting looks up by phone on every placement.
create index if not exists idx_orders_customer_phone on orders (customer_phone);

drop trigger if exists trg_orders_release_on_cancel on orders;
create trigger trg_orders_release_on_cancel
  after update on orders
  for each row execute function ps_release_on_cancel();

commit;
