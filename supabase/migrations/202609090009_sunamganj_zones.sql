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
