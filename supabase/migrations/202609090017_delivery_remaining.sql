-- Remaining delivery features: return/exchange, SLA, batch route, vendor earnings with tip/surcharge, pickup time, slot capacity
begin;

-- 1. Return / exchange pickup flow
alter table orders add column if not exists is_return boolean not null default false;
alter table orders add column if not exists return_reason text;
alter table orders add column if not exists return_parent_id uuid references orders(id);
alter table orders add column if not exists return_status text check (return_status in ('requested','approved','picked_up','refunded','rejected')) default null;
alter table orders add column if not exists return_pickup_at timestamptz;

-- 2. Pickup time for store pickup orders
alter table orders add column if not exists pickup_slot text; -- e.g. "now", "9-11", etc

-- 3. Slot capacity tracking for scheduled deliveries
create table if not exists delivery_slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  slot_window text not null check (slot_window in ('9-11','11-1','2-4','4-6','6-8','8-10','express','now','evening','scheduled','pickup')),
  max_orders int not null default 20,
  booked_orders int not null default 0,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique(slot_date, slot_window)
);
alter table delivery_slots enable row level security;
drop policy if exists "delivery_slots public read" on delivery_slots;
create policy "delivery_slots public read" on delivery_slots for select using (true);
drop policy if exists "delivery_slots admin all" on delivery_slots;
create policy "delivery_slots admin all" on delivery_slots for all using (true) with check (true);

-- Function to book slot
create or replace function ps_book_delivery_slot(p_date date, p_window text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row delivery_slots%rowtype;
begin
  insert into delivery_slots (slot_date, slot_window, max_orders, booked_orders)
  values (p_date, p_window, 20, 0)
  on conflict (slot_date, slot_window) do nothing;

  select * into v_row from delivery_slots where slot_date = p_date and slot_window = p_window for update;
  if v_row.is_blocked then return false; end if;
  if v_row.booked_orders >= v_row.max_orders then return false; end if;
  update delivery_slots set booked_orders = booked_orders + 1 where slot_date = p_date and slot_window = p_window;
  return true;
end $$;

-- 4. Vendor earnings: update ledger writer to include tip + delivery charge split
-- shop_ledger currently has subtotal, commission, payable
-- Add columns for delivery charge, tip, surcharges
alter table shop_ledger add column if not exists delivery_charge bigint not null default 0;
alter table shop_ledger add column if not exists tip_amount bigint not null default 0;
alter table shop_ledger add column if not exists surcharge_total bigint not null default 0;

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
begin
  if new.status = 'delivered' and coalesce(old.status,'') <> 'delivered' then
    select commission_pct into v_pct from shops where id = new.shop_id;
    if v_pct is null then v_pct := 15; end if;
    v_commission := floor((new.subtotal * v_pct) / 100);
    v_payable := new.subtotal - v_commission;
    v_delivery := coalesce(new.delivery_charge,0);
    v_tip := coalesce(new.tip_amount,0);
    v_sur := coalesce(new.surcharge_night,0) + coalesce(new.surcharge_rain,0) + coalesce(new.surcharge_distance,0) + coalesce(new.surcharge_express,0) + coalesce(new.surcharge_weight,0);
    -- For pickup orders, delivery charge 0, but tip still goes to rider not vendor, so vendor gets only product share
    -- For returns, payable is negative (refund)
    if coalesce(new.is_return,false) then
      v_payable := -v_payable;
    end if;
    insert into shop_ledger (shop_id, order_id, subtotal, commission, payable, delivery_charge, tip_amount, surcharge_total)
    values (new.shop_id, new.id, new.subtotal, v_commission, v_payable, v_delivery, v_tip, v_sur)
    on conflict (order_id) do update set
      subtotal = excluded.subtotal,
      commission = excluded.commission,
      payable = excluded.payable,
      delivery_charge = excluded.delivery_charge,
      tip_amount = excluded.tip_amount,
      surcharge_total = excluded.surcharge_total;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_ledger_on_delivered on orders;
create trigger trg_orders_ledger_on_delivered
  after update of status on orders
  for each row execute function ps_write_shop_ledger();

-- Ensure unique on order_id for upsert
create unique index if not exists idx_shop_ledger_order_id on shop_ledger(order_id);

-- 5. SLA alerts view
create or replace view v_sla_breaches as
select
  o.id,
  o.order_no,
  o.shop_id,
  o.status,
  o.created_at,
  o.zone_id,
  o.scheduled_at,
  o.delivery_window,
  o.is_express,
  extract(epoch from (now() - o.created_at))/60 as age_minutes,
  case
    when o.is_express and extract(epoch from (now() - o.created_at))/60 > 60 then true
    when o.zone_id = 'z1' and extract(epoch from (now() - o.created_at))/60 > 90 then true
    when o.zone_id = 'z2' and extract(epoch from (now() - o.created_at))/60 > 120 then true
    when o.zone_id = 'z4' and extract(epoch from (now() - o.created_at))/60 > 180 then true
    else false
  end as is_breached,
  case
    when o.scheduled_at is not null and now() > o.scheduled_at + interval '1 hour' and o.status not in ('delivered','cancelled') then true
    else false
  end as is_scheduled_breached
from orders o
where o.status not in ('delivered','cancelled');

-- 6. Batch assignment: function to assign multiple orders to one rider
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_oid uuid;
  v_rider riders%rowtype;
begin
  select * into v_rider from riders where id = p_rider_id and status = 'active' and is_online;
  if not found then raise exception 'rider not available'; end if;

  foreach v_oid in array p_order_ids loop
    -- Use existing assign logic if possible, else direct
    begin
      perform ps_assign_order_to_rider(v_oid, p_rider_id);
      v_count := v_count + 1;
    exception when others then
      -- fallback: insert into rider_assignments if not exists
      insert into rider_assignments (order_id, rider_id, state)
      values (v_oid, p_rider_id, 'offered')
      on conflict (order_id, rider_id) do nothing;
      if found then v_count := v_count + 1; end if;
    end;
  end loop;
  return v_count;
end $$;

-- 7. Update ps_place_order to handle return, pickup_slot, slot booking
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
  v_is_return boolean := coalesce((p_order->>'is_return')::boolean, false);
  v_return_parent uuid := nullif(p_order->>'return_parent_id','')::uuid;
  v_return_reason text := coalesce(trim(p_order->>'return_reason'), '');
  v_pickup_slot text := coalesce(trim(p_order->>'pickup_slot'), '');
  v_tip bigint := coalesce((p_order->>'tip_amount')::bigint, 0);
  v_weight double precision := nullif(p_order->>'weight_kg','')::double precision;
  v_sur_night bigint := coalesce((p_order->>'surcharge_night')::bigint, 0);
  v_sur_rain bigint := coalesce((p_order->>'surcharge_rain')::bigint, 0);
  v_sur_dist bigint := coalesce((p_order->>'surcharge_distance')::bigint, 0);
  v_sur_express bigint := coalesce((p_order->>'surcharge_express')::bigint, 0);
  v_sur_weight bigint := coalesce((p_order->>'surcharge_weight')::bigint, 0);
  v_slot_date date;
  v_slot_booked boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty order'; end if;

  if v_is_return then
    if v_return_parent is null then raise exception 'return_parent_id required'; end if;
    -- Validate parent order exists and delivered
    if not exists (select 1 from orders where id = v_return_parent and status = 'delivered') then
      raise exception 'parent order not delivered';
    end if;
  end if;

  if not v_is_pickup then
    select * into v_zone from delivery_zones where id = p_order->>'zone_id' and active;
    if not found then raise exception 'zone unavailable'; end if;
  else
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
      if not v_shop.is_open and not v_is_return then raise exception 'shop closed'; end if;
      if not v_is_pickup and not v_is_return and not (v_zone.id = any (v_shop.zone_ids)) then raise exception 'shop does not deliver to zone'; end if;
    elsif v_product.shop_id <> v_shop.id then raise exception 'order mixes multiple shops'; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id) then v_eligible := v_eligible + v_product.price * v_qty; end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants where id = v_variant_id and product_id = v_product.id and active for update;
      if not found then raise exception 'variant unavailable'; end if;
      if not v_is_return then
        v_available := v_variant.stock - v_variant.reserved;
        if v_available < v_qty then raise exception 'only % left of "%"', greatest(0, v_available), v_product.name; end if;
        update product_variants set reserved = reserved + v_qty where id = v_variant.id;
      end if;
    end if;
  end loop;

  if v_subtotal <= 0 then raise exception 'empty order'; end if;
  if not v_is_pickup and not v_is_return and v_zone.id = 'z4' and v_subtotal < 50000 then raise exception 'Zone D requires minimum ৳500 order'; end if;

  -- Slot capacity check for scheduled
  if v_scheduled_at is not null and v_window <> '' and not v_is_pickup and not v_is_return then
    v_slot_date := (v_scheduled_at)::date;
    if v_slot_date is not null then
      select ps_book_delivery_slot(v_slot_date, v_window) into v_slot_booked;
      if not v_slot_booked then raise exception 'Delivery slot full for % % - choose another window', v_slot_date, v_window; end if;
    end if;
  end if;

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
  elsif v_is_return then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    v_discount := 0;
    v_tip := 0;
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

  if v_is_return then
    v_total := 0; -- no charge for return pickup, refund handled separately
  else
    v_total := v_subtotal - v_discount + v_charge + v_tip;
  end if;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express, is_pickup, is_return,
    return_reason, return_parent_id, return_status,
    pickup_slot,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    tip_amount, weight_kg,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window,''),
    v_is_express, v_is_pickup, v_is_return,
    nullif(v_return_reason,''), v_return_parent,
    case when v_is_return then 'requested' else null end,
    nullif(v_pickup_slot,''),
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_tip, v_weight,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', case when v_is_return then 'pending' else 'pending' end
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
  values (v_order_id, 'pending', 'Placed Sunamganj Sadar pickup=' || v_is_pickup::text || ' return=' || v_is_return::text || ' tip=' || v_tip::text || ' geo=' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ' scheduled=' || coalesce(v_scheduled_at::text, v_window, 'now'));

  return v_order_id;
end $$;

commit;
