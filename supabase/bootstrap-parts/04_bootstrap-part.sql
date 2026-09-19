-- PART 4/10 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ============================================================================
-- MIGRATION 13/23 — delivery proof via Cloudinary  (source: supabase/migrations/202609090013_delivery_proof_cloudinary.sql)
-- ============================================================================

-- Delivery proof via Cloudinary + failed attempts + dynamic ETA prep
-- Serial 2: Delivery proof + rider proof upload

begin;

-- Extend ps_rider_deliver to accept Cloudinary proof URL
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · COD collected',
      auth.uid()
    );
  end if;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_order.total
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

-- Failed delivery attempt tracking
create or replace function ps_rider_failed_attempt(p_assignment_id uuid, p_reason text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state not in ('accepted','picked_up') then
    raise exception 'failed attempt not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  update orders
  set delivery_attempts = delivery_attempts + 1,
      delivery_failed_reason = trim(p_reason),
      updated_at = now()
  where id = v_order.id;

  insert into order_status_history (order_id, status, note, changed_by)
  values (
    v_order.id,
    v_order.status,
    'Delivery attempt failed: ' || trim(p_reason),
    auth.uid()
  );

  return v_assignment;
end $$;

-- Dynamic ETA helper: based on zone + rider queue + time of day
create or replace function ps_dynamic_eta(p_zone_id text, p_shop_prep int default 15)
returns text
language plpgsql as $$
declare
  v_base int;
  v_queue int;
  v_hour int;
  v_extra int := 0;
begin
  select case
    when p_zone_id = 'z1' then 35
    when p_zone_id = 'z2' then 45
    when p_zone_id = 'z3' then 55
    else 70
  end into v_base;

  -- Count active deliveries in this zone
  select count(*) into v_queue from orders
  where zone_id = p_zone_id and status in ('courier-assigned','out-for-delivery');

  v_hour := extract(hour from now() at time zone 'Asia/Dhaka');
  if v_hour >= 20 or v_hour < 6 then
    v_extra := 10; -- night
  elsif v_hour between 12 and 14 or v_hour between 18 and 20 then
    v_extra := 10; -- lunch/dinner rush
  end if;

  v_base := v_base + p_shop_prep + (v_queue * 5) + v_extra;
  return (v_base - 5)::text || '–' || (v_base + 5)::text || ' min';
end $$;

commit;

-- ============================================================================
-- MIGRATION 14/23 — nearest rider geo  (source: supabase/migrations/202609090014_rider_geo_nearest.sql)
-- ============================================================================

-- Rider geo tracking + nearest auto-assign + load balancing
-- Serial 3: Auto-assign nearest rider

begin;

-- Add geo + load to riders
alter table riders add column if not exists lat double precision check (lat is null or (lat between -90 and 90));
alter table riders add column if not exists lng double precision check (lng is null or (lng between -180 and 180));
alter table riders add column if not exists last_location_at timestamptz;
alter table riders add column if not exists current_load int not null default 0 check (current_load >= 0);
alter table riders add column if not exists total_deliveries int not null default 0 check (total_deliveries >= 0);
alter table riders add column if not exists avg_delivery_minutes int;

-- Function to compute haversine distance in km
create or replace function ps_haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language plpgsql immutable as $$
declare
  R double precision := 6371;
  dLat double precision;
  dLng double precision;
  a double precision;
  c double precision;
begin
  if lat1 is null or lng1 is null or lat2 is null or lng2 is null then
    return null;
  end if;
  dLat := radians(lat2 - lat1);
  dLng := radians(lng2 - lng1);
  a := sin(dLat/2) * sin(dLat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLng/2) * sin(dLng/2);
  c := 2 * asin(sqrt(a));
  return R * c;
end $$;

-- Improved nearest rider: distance + rating + load + longest idle
create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_order_lat double precision;
  v_order_lng double precision;
  v_zone_id text;
  v_rider_id uuid;
begin
  select lat, lng, zone_id into v_order_lat, v_order_lng, v_zone_id from orders where id = p_order_id;

  -- Try nearest by geo if order has pin
  if v_order_lat is not null and v_order_lng is not null then
    select r.id into v_rider_id
    from riders r
    where r.status = 'active'
      and r.is_online
      and r.zone_ids @> array[v_zone_id]
      and r.cash_in_hand < 500000
      and r.current_load < 2 -- max 2 concurrent
      and not exists (
        select 1 from delivery_assignments a
        where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
      )
      and not exists (
        select 1 from delivery_assignments seen
        where seen.order_id = p_order_id and seen.rider_id = r.id
      )
    order by
      -- distance first (if rider has location)
      case when r.lat is not null and r.lng is not null
        then ps_haversine_km(v_order_lat, v_order_lng, r.lat, r.lng)
        else 9999 end asc,
      -- then rating high to low
      r.rating_avg desc,
      -- then least load
      r.current_load asc,
      -- then longest idle
      r.created_at asc
    limit 1;
    if v_rider_id is not null then
      return v_rider_id;
    end if;
  end if;

  -- Fallback: original logic without geo
  select r.id into v_rider_id
  from riders r
  where r.status = 'active'
    and r.is_online
    and r.zone_ids @> array[v_zone_id]
    and r.cash_in_hand < 500000
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
    )
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.rating_avg desc, r.current_load asc, r.created_at asc
  limit 1;

  return v_rider_id;
end $$;

-- Rider location update function
create or replace function ps_rider_update_location(p_lat double precision, p_lng double precision)
returns riders
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  update riders
  set lat = p_lat, lng = p_lng, last_location_at = now()
  where id = v_rider.id
  returning * into v_rider;
  return v_rider;
end $$;

-- Track load on accept/pickup/deliver
create or replace function ps_track_rider_load()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' and NEW.state in ('offered','accepted','picked_up') then
    update riders set current_load = current_load + 1 where id = NEW.rider_id;
  elsif TG_OP = 'UPDATE' then
    if OLD.state in ('offered','accepted','picked_up') and NEW.state not in ('offered','accepted','picked_up') then
      update riders set current_load = greatest(0, current_load - 1), total_deliveries = case when NEW.state = 'delivered' then total_deliveries + 1 else total_deliveries end where id = NEW.rider_id;
    elsif OLD.state not in ('offered','accepted','picked_up') and NEW.state in ('offered','accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'DELETE' and OLD.state in ('offered','accepted','picked_up') then
    update riders set current_load = greatest(0, current_load - 1) where id = OLD.rider_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_assignments_track_load on delivery_assignments;
create trigger trg_assignments_track_load
  after insert or update or delete on delivery_assignments
  for each row execute function ps_track_rider_load();

-- Index for geo queries
create index if not exists idx_riders_lat_lng on riders (lat, lng) where lat is not null;
create index if not exists idx_riders_load on riders (current_load) where status = 'active' and is_online;

commit;

-- ============================================================================
-- MIGRATION 15/23 — scheduled delivery (scheduled_at/delivery_window on orders)  (source: supabase/migrations/202609090015_scheduled_delivery.sql)
-- ============================================================================

-- Scheduled delivery calendar + express + per-zone threshold
-- Serial 4: Scheduled delivery

begin;

alter table orders add column if not exists scheduled_at timestamptz;
alter table orders add column if not exists delivery_window text check (delivery_window is null or delivery_window in ('9-11','11-1','2-4','4-6','6-8','8-10','express','now','evening','tomorrow_morning','scheduled'));
alter table orders add column if not exists is_express boolean not null default false;
alter table orders add column if not exists surcharge_night bigint not null default 0;
alter table orders add column if not exists surcharge_rain bigint not null default 0;
alter table orders add column if not exists surcharge_distance bigint not null default 0;
alter table orders add column if not exists surcharge_express bigint not null default 0;

-- Update ps_place_order to accept scheduled fields
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
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
  v_lat double precision := nullif(p_order->>'lat','')::double precision;
  v_lng double precision := nullif(p_order->>'lng','')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km','')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at','')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_sur_night bigint := coalesce((p_order->>'surcharge_night')::bigint, 0);
  v_sur_rain bigint := coalesce((p_order->>'surcharge_rain')::bigint, 0);
  v_sur_dist bigint := coalesce((p_order->>'surcharge_distance')::bigint, 0);
  v_sur_express bigint := coalesce((p_order->>'surcharge_express')::bigint, 0);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones where id = p_order->>'zone_id' and active;
  if not found then raise exception 'zone unavailable'; end if;

  if v_code <> '' then
    select * into v_coupon from coupons where code = v_code and active;
    if not found then raise exception 'unknown coupon'; end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then raise exception 'coupon not started'; end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then raise exception 'coupon expired'; end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then raise exception 'coupon limit reached'; end if;
    if v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then raise exception 'coupon not valid for this zone'; end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then raise exception 'bad quantity'; end if;
    select * into v_product from products where id = (v_item->>'product_id')::uuid and status = 'published' and active and in_stock;
    if not found then raise exception 'product unavailable'; end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then raise exception 'shop unavailable'; end if;
      if not v_shop.is_open then raise exception 'shop closed'; end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then raise exception 'shop does not deliver to zone'; end if;
    elsif v_product.shop_id <> v_shop.id then raise exception 'order mixes multiple shops'; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id) then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants where id = v_variant_id and product_id = v_product.id and active for update;
      if not found then raise exception 'variant unavailable'; end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then raise exception 'only % left of "%"', greatest(0, v_available), v_product.name; end if;
      update product_variants set reserved = reserved + v_qty where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then raise exception 'empty order'; end if;
  if v_zone.id = 'z4' and v_subtotal < 50000 then raise exception 'Zone D requires minimum ৳500 order'; end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then raise exception 'coupon minimum not met'; end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then raise exception 'coupon does not apply'; end if;
    if v_coupon.type = 'fixed' then v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then v_discount := least(v_discount, v_coupon.max_discount); end if;
    else v_discount := 0; end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    -- per-zone threshold override if setting enabled (handled in app, but keep fallback)
    if v_zone.id = 'z1' and v_subtotal >= 60000 then v_charge := 0;
    elsif v_zone.id = 'z2' and v_subtotal >= 80000 then v_charge := 0;
    elsif v_zone.id = 'z4' and v_subtotal >= 150000 then v_charge := 0;
    elsif v_subtotal >= v_free_threshold then v_charge := 0;
    else v_charge := v_zone.charge + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express;
    end if;
  end if;
  if v_has_coupon and v_coupon.type = 'free_delivery' then v_charge := 0; end if;
  -- If free delivery threshold met, zero surcharges too
  if v_charge = 0 then
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window,''),
    v_is_express, v_sur_night, v_sur_rain, v_sur_dist, v_sur_express,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    insert into order_items (order_id, product_id, variant_id, name, sku, variant, unit_price, qty) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = '' then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku, coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed Sunamganj Sadar geo=' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ' scheduled=' || coalesce(v_scheduled_at::text, v_window, 'now') || ' coupon=' || coalesce(v_code,'none'));

  return v_order_id;
end $$;

create index if not exists idx_orders_scheduled on orders (scheduled_at) where scheduled_at is not null;

commit;

-- ============================================================================
-- MIGRATION 16/23 — tips + store pickup + weight surcharge on orders  (source: supabase/migrations/202609090016_tips_pickup_weight.sql)
-- ============================================================================

-- Tips for rider + store pickup + weight/bulk surcharge
-- Serial 5: Customer experience improvements

begin;

alter table orders add column if not exists tip_amount bigint not null default 0 check (tip_amount >= 0);
alter table orders add column if not exists is_pickup boolean not null default false;
alter table orders add column if not exists pickup_time timestamptz;
alter table orders add column if not exists weight_kg double precision check (weight_kg is null or weight_kg >= 0);
alter table orders add column if not exists surcharge_weight bigint not null default 0;
alter table orders add column if not exists surcharge_tip bigint not null default 0;

-- Update ps_place_order to handle tips, pickup, weight
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
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
  v_lat double precision := nullif(p_order->>'lat','')::double precision;
  v_lng double precision := nullif(p_order->>'lng','')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km','')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at','')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_tip bigint := coalesce((p_order->>'tip_amount')::bigint, 0);
  v_weight double precision := nullif(p_order->>'weight_kg','')::double precision;
  v_sur_night bigint := coalesce((p_order->>'surcharge_night')::bigint, 0);
  v_sur_rain bigint := coalesce((p_order->>'surcharge_rain')::bigint, 0);
  v_sur_dist bigint := coalesce((p_order->>'surcharge_distance')::bigint, 0);
  v_sur_express bigint := coalesce((p_order->>'surcharge_express')::bigint, 0);
  v_sur_weight bigint := coalesce((p_order->>'surcharge_weight')::bigint, 0);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty order'; end if;

  if not v_is_pickup then
    select * into v_zone from delivery_zones where id = p_order->>'zone_id' and active;
    if not found then raise exception 'zone unavailable'; end if;
  else
    -- For pickup, use first active zone as dummy but charge 0
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then raise exception 'zone unavailable'; end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons where code = v_code and active;
    if not found then raise exception 'unknown coupon'; end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then raise exception 'coupon not started'; end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then raise exception 'coupon expired'; end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then raise exception 'coupon limit reached'; end if;
    if not v_is_pickup and v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then raise exception 'coupon not valid for this zone'; end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then raise exception 'bad quantity'; end if;
    select * into v_product from products where id = (v_item->>'product_id')::uuid and status = 'published' and active and in_stock;
    if not found then raise exception 'product unavailable'; end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then raise exception 'shop unavailable'; end if;
      if not v_shop.is_open then raise exception 'shop closed'; end if;
      if not v_is_pickup and not (v_zone.id = any (v_shop.zone_ids)) then raise exception 'shop does not deliver to zone'; end if;
    elsif v_product.shop_id <> v_shop.id then raise exception 'order mixes multiple shops'; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id) then v_eligible := v_eligible + v_product.price * v_qty; end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants where id = v_variant_id and product_id = v_product.id and active for update;
      if not found then raise exception 'variant unavailable'; end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then raise exception 'only % left of "%"', greatest(0, v_available), v_product.name; end if;
      update product_variants set reserved = reserved + v_qty where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then raise exception 'empty order'; end if;
  if not v_is_pickup and v_zone.id = 'z4' and v_subtotal < 50000 then raise exception 'Zone D requires minimum ৳500 order'; end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then raise exception 'coupon minimum not met'; end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then raise exception 'coupon does not apply'; end if;
    if v_coupon.type = 'fixed' then v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then v_discount := least(v_discount, v_coupon.max_discount); end if;
    else v_discount := 0; end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    select count(*) into v_total_orders from orders;
    if v_total_orders < 1000 then v_charge := 0;
    else
      v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
      if v_zone.id = 'z1' and v_subtotal >= 60000 then v_charge := 0;
      elsif v_zone.id = 'z2' and v_subtotal >= 80000 then v_charge := 0;
      elsif v_zone.id = 'z4' and v_subtotal >= 150000 then v_charge := 0;
      elsif v_subtotal >= v_free_threshold then v_charge := 0;
      else v_charge := v_zone.charge + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
      end if;
    end if;
    if v_has_coupon and v_coupon.type = 'free_delivery' then v_charge := 0; end if;
    if v_charge = 0 then v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0; end if;
  end if;

  v_total := v_subtotal - v_discount + v_charge + v_tip;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express, is_pickup,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    tip_amount, weight_kg,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window,''),
    v_is_express, v_is_pickup,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_tip, v_weight,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    insert into order_items (order_id, product_id, variant_id, name, sku, variant, unit_price, qty) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = '' then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku, coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed Sunamganj Sadar pickup=' || v_is_pickup::text || ' tip=' || v_tip::text || ' weight=' || coalesce(v_weight::text,'0') || ' geo=' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ' scheduled=' || coalesce(v_scheduled_at::text, v_window, 'now'));

  return v_order_id;
end $$;

commit;

