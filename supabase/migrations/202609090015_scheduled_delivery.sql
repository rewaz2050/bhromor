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
