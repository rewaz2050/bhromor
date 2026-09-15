-- PART 3/9 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ============================================================================
-- MIGRATION 8/23 — dispatch auto-offer  (source: supabase/migrations/202609090008_dispatch_auto.sql)
-- ============================================================================

-- Phase 3 slice 7: dispatch engine + admin deliveries board.
-- Run after 007. Adds the automatic offer when an order reaches
-- ready-for-pickup, plus admin-facing assign/cancel RPCs. The rider side
-- (accept/pickup/deliver/settle) stays in 007; this migration only creates
-- the offer and lets staff intervene when no rider was available.

begin;

-- Pick the next eligible rider for an order. Fairness starts simple:
-- longest-idle (oldest created_at) among active + online riders whose home
-- zones include the order zone and who are not already carrying an order.
-- GPS-based nearest-first stays a documented hardening step.
create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select r.id
  from riders r
  cross join lateral (
    select o.zone_id
    from orders o
    where o.id = p_order_id
  ) o
  where r.status = 'active'
    and r.is_online
    and r.zone_ids @> array[o.zone_id]
    and r.cash_in_hand < 500000
    and not exists (
      select 1
      from delivery_assignments a
      where a.rider_id = r.id
        and a.state in ('offered', 'accepted', 'picked_up')
    )
    -- rotate: never re-offer to a rider who already saw this order
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.created_at asc
  limit 1;
$$;

-- Automatic dispatch trigger: when an order becomes ready-for-pickup offer
-- it to exactly one eligible rider. Runs inside the same update as the
-- vendor/staff status move and is idempotent through the unique order_id.
create or replace function ps_auto_dispatch_ready_order()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rider_id uuid;
begin
  if new.status <> 'ready-for-pickup'
     or old.status = 'ready-for-pickup'
     or exists (
       select 1 from delivery_assignments where order_id = new.id
     ) then
    return new;
  end if;

  v_rider_id := ps_next_eligible_rider(new.id);
  if v_rider_id is not null then
    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (new.id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_auto_dispatch on orders;
create trigger trg_orders_auto_dispatch
  after update on orders
  for each row execute function ps_auto_dispatch_ready_order();

-- Staff intervention: create an offer for an order that has no live
-- assignment. Used by Admin → Deliveries "Assign" when auto-dispatch found
-- nobody, or to re-offer after a cancelled/expired assignment.
create or replace function ps_offer_order(p_order_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_assignment_id uuid;
  v_rider_id      uuid;
  v_order_status  text;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;

  select status into v_order_status from orders where id = p_order_id;
  if v_order_status is null then
    raise exception 'order not found';
  end if;
  if v_order_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
    raise exception 'order not ready for dispatch';
  end if;
  if exists (
    select 1 from delivery_assignments
    where order_id = p_order_id and state in ('offered', 'accepted', 'picked_up')
  ) then
    raise exception 'assignment already active';
  end if;

  v_rider_id := ps_next_eligible_rider(p_order_id);
  if v_rider_id is null then
    raise exception 'no eligible rider';
  end if;
  insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
  values (p_order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds')
  returning id into v_assignment_id;
  return v_assignment_id;
end $$;

-- Rider rejects an offer: cancel their assignment and immediately offer the
-- same order to the next eligible rider (the rejecting rider never sees it
-- again through ps_next_eligible_rider's seen check).
create or replace function ps_rider_reject(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_rider_id   uuid;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'offered' then
    raise exception 'assignment already handled';
  end if;
  update delivery_assignments set state = 'cancelled' where id = v_assignment.id
  returning * into v_assignment;

  if (
    select o.status from orders o where o.id = v_assignment.order_id
  ) in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery')
     and not exists (
       select 1 from delivery_assignments
       where order_id = v_assignment.order_id
         and state in ('offered', 'accepted', 'picked_up')
     ) then
    v_rider_id := ps_next_eligible_rider(v_assignment.order_id);
    if v_rider_id is not null then
      insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
      values (v_assignment.order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
    end if;
  end if;
  return v_assignment;
end $$;

-- Staff closes a live assignment (wrong rider, order cancelled, etc.).
create or replace function ps_expire_stale_offers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_row record;
  v_rider_id uuid;
begin
  for v_row in
    select da.id, da.order_id
    from delivery_assignments da
    join orders o on o.id = da.order_id
    where da.state = 'offered' and da.expires_at < now()
    for update of da
  loop
    update delivery_assignments
    set state = 'expired'
    where id = v_row.id;

    -- Re-offer the same order to the next eligible rider if it still needs
    -- delivery. This is the simplest round-robin retry; no-eligible-rider
    -- leaves the order on the Admin → Deliveries awaiting board.
    if (
      select o.status from orders o where o.id = v_row.order_id
    ) in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery')
       and not exists (
         select 1 from delivery_assignments
         where order_id = v_row.order_id
           and state in ('offered', 'accepted', 'picked_up')
       ) then
      v_rider_id := ps_next_eligible_rider(v_row.order_id);
      if v_rider_id is not null then
        insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
        values (v_row.order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
      end if;
    end if;
    v_count := coalesce(v_count, 0) + 1;
  end loop;
  return coalesce(v_count, 0);
end $$;

-- Staff settles a rider's cash in hand and records the pay-in. Unlike the
-- rider self-settle, staff choose the rider and the method/reference.
create or replace function ps_admin_settle_rider(
  p_rider_id uuid,
  p_method text default 'cash',
  p_reference text default ''
)
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_rider from riders where id = p_rider_id for update;
  if not found then
    raise exception 'rider not found';
  end if;
  if v_rider.cash_in_hand <= 0 then
    raise exception 'nothing to settle';
  end if;
  insert into rider_settlements (rider_id, amount, method, reference, settled_by)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(trim(p_method), 'cash'),
    coalesce(trim(p_reference), ''),
    auth.uid()
  )
  returning * into v_settlement;
  update riders set cash_in_hand = 0 where id = v_rider.id;
  return v_settlement;
end $$;

-- Staff closes a live assignment (wrong rider, order cancelled, etc.).
create or replace function ps_cancel_assignment(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_assignment
  from delivery_assignments where id = p_assignment_id
  for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  if v_assignment.state in ('delivered') then
    raise exception 'delivered assignment cannot be cancelled';
  end if;
  update delivery_assignments
  set state = 'cancelled'
  where id = v_assignment.id
  returning * into v_assignment;
  return v_assignment;
end $$;

commit;

-- ============================================================================
-- MIGRATION 9/23 — sunamganj zones  (source: supabase/migrations/202609090009_sunamganj_zones.sql)
-- ============================================================================

-- Sunamganj Sadar delivery zones — Traffic Point centric.
-- District: Sunamganj, Upazila: Sunamganj Sadar.
-- Replaces the old Comilla-centric demo zones with real Sunamganj paras.
-- Also adds first-1000-orders FREE promo into ps_place_order.
-- Safe: upsert only, no delete (FK safe if orders already reference zones).
begin;

-- Upsert Sunamganj paras (idempotent, FK-safe)
insert into delivery_zones (id, name, areas, charge, eta_label, sort_order, active) values
  ('z1', 'Zone A — Traffic Point (0-1.5km)', array['Boropara','Shologhar','Ukilpara','Courtpara','Jail Road','Modhyabazar','Kalibari','Arambagh','Mollapara'], 3000, '30–40 min', 0, true),
  ('z2', 'Zone B — Sadar Core (1.5-2.5km)', array['Notunpara','Hasannagar','Tegharia','Nabinagar','Sahib Bari Ghat','Hospital Road','Kazir Point','Purba Bazar','Paschim Bazar'], 5000, '40–50 min', 1, true),
  ('z3', 'Zone C — Sadar Extended (2.5-4km)', array['Wayesspur','Balaka Para','Jaliapara','Palpur','Dargahpara','Uttarpara','Dakkhinpara','Shologhar Bypass'], 7000, '50–60 min', 2, true),
  ('z4', 'Zone D — Sunamganj Sadar Bahire', array['Sunamganj Sadar Other','Dolura','Gouripur','Surma River Side','Mollapara Bahire','Shantiganj Border'], 10000, '60–80 min', 3, true)
on conflict (id) do update set
  name = excluded.name,
  areas = excluded.areas,
  charge = excluded.charge,
  eta_label = excluded.eta_label,
  sort_order = excluded.sort_order,
  active = excluded.active;

-- Clean any leftover old Comilla demo zones that are not referenced by orders
-- (only delete if no orders reference them, to stay FK-safe)
delete from delivery_zones
where id not in ('z1','z2','z3','z4')
  and id in ('z-old-1','z-old-2','z-old-3','kandirpar','rampur','court-road')
  and not exists (select 1 from orders where orders.zone_id = delivery_zones.id);

-- Update ps_place_order: first 1000 orders FREE promo + 1000 taka threshold
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
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

  -- Validate every line and reserve variant stock under row locks.
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
      if not (v_zone.id = any (v_shop.zone_ids)) then
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

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    else
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- Delivery charge: first 1000 orders FREE promo, else threshold 1000 taka
  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
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
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar');

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 10/23 — min order outside (harmless upsert; flat model ignores it)  (source: supabase/migrations/202609090010_min_order_outside.sql)
-- ============================================================================

-- Enforce minimum order for Zone D (outside Sadar) — ৳500.
-- Also ensure free_delivery_threshold is 1000 taka (100000 paisa) by default.
begin;

-- Ensure site_settings has correct threshold (upsert)
-- `value` is jsonb, so the integer must be converted explicitly.
insert into site_settings (key, value) values ('free_delivery_threshold_paisa', to_jsonb(100000))
on conflict (key) do update set value = excluded.value;

-- Update ps_place_order to include Zone D minimum check
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
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
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
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

  -- Zone D minimum ৳500
  if v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    else
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
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
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar (real)');

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 11/23 — coupon enhancements (zone/category scope, max discount)  (source: supabase/migrations/202609090011_coupon_enhancements.sql)
-- ============================================================================

-- Coupon enhancements — Sunamganj promo codes with percent, fixed, free_delivery,
-- zone restriction, max discount cap, description.
-- Admin can create: percent discount (e.g. 15% off), fixed (৳100 off), free delivery,
-- with min order, category, zone, expiry, usage limit.

begin;

-- Allow new type 'free_delivery'
alter table coupons drop constraint if exists coupons_type_check;
alter table coupons add constraint coupons_type_check check (type in ('percent', 'fixed', 'free_delivery'));

-- Add new columns if not exists
alter table coupons add column if not exists max_discount bigint check (max_discount is null or max_discount >= 0);
alter table coupons add column if not exists zone_id text references delivery_zones (id);
alter table coupons add column if not exists description text;

-- Update ps_place_order to handle free_delivery coupons
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
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
    -- Zone restriction
    if v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then
      raise exception 'coupon not valid for this zone';
    end if;
    v_has_coupon := true;
  end if;

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
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
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

  if v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    -- Free delivery coupons don't need eligible check
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
      -- free_delivery: no product discount, but delivery will be free
      v_discount := 0;
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  -- Free delivery coupon always overrides charge
  if v_has_coupon and v_coupon.type = 'free_delivery' then
    v_charge := 0;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
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
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar (coupon: ' || coalesce(v_code, 'none') || ')');

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 12/23 — geo + delivery proof (lat/lng/distance on orders)  (source: supabase/migrations/202609090012_geo_and_proof.sql)
-- ============================================================================

-- Geo pin + delivery proof via Cloudinary
-- Serial 1: Map Pin + Auto Zone

begin;

-- Add lat/lng to orders for exact delivery pin (Sunamganj)
alter table orders add column if not exists lat double precision check (lat is null or (lat between -90 and 90));
alter table orders add column if not exists lng double precision check (lng is null or (lng between -180 and 180));
alter table orders add column if not exists distance_km double precision check (distance_km is null or distance_km >= 0);
alter table orders add column if not exists delivery_proof_url text;
alter table orders add column if not exists delivery_proof_uploaded_at timestamptz;
alter table orders add column if not exists delivery_failed_reason text;
alter table orders add column if not exists delivery_attempts int not null default 0 check (delivery_attempts >= 0);

-- Update ps_place_order to accept lat/lng/distance and store them
-- Keep existing logic but add geo fields

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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
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
    if v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then
      raise exception 'coupon not valid for this zone';
    end if;
    v_has_coupon := true;
  end if;

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
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
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

  if v_zone.id = 'z4' and v_subtotal < 50000 then
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
      v_discount := 0;
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  if v_has_coupon and v_coupon.type = 'free_delivery' then
    v_charge := 0;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist,
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
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar (coupon: ' || coalesce(v_code, 'none') || ', pin: ' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ')');

  return v_order_id;
end $$;

-- Index for geo queries
create index if not exists idx_orders_lat_lng on orders (lat, lng) where lat is not null;
create index if not exists idx_orders_proof on orders (delivery_proof_url) where delivery_proof_url is not null;

commit;

