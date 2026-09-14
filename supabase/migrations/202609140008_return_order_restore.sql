-- ============================================================================
-- P1 #13 follow-up (2026-09-14): restore return-order handling in
-- ps_place_order — the flat/growth/wallet re-creations of the function
-- silently dropped the is_return support that ps_create_return_request
-- depends on.
--
-- Without it, every customer "return request" (P1 #13) landed as a normal
-- full-price COD order:
--   * total = price of the returned items (customer would pay COD for the
--     very items they are sending back),
--   * is_return / return_parent_id / return_status never set →
--     ps_return_action refused it ("not a return order") and
--     ps_return_eligible never saw it → unlimited re-requests,
--   * variant stock reserved a second time for items coming back to the
--     shelf,
--   * the ৳500 Zone-D minimum could reject legitimate returns.
--
-- This re-creates ps_place_order (the wallet version, 202609140004) with
-- the 202609090017 return mechanics restored:
--   * parent must exist and be delivered,
--   * closed-shop and zone-membership checks waived (reverse logistics),
--   * no stock reservation, no ৳500 minimum,
--   * zero charge / zero surcharges / zero discounts / zero total,
--   * is_return + return_parent_id + return_reason + return_status='requested'
--     written so ps_return_eligible and ps_return_action work again.
-- ============================================================================

begin;

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
  -- P1 #8 (2026-09-14): wallet payments WITHOUT a merchant account — the
  -- customer sends the total to the shop's own bKash/Nagad number and
  -- shares the TRXID. The shop verifies it (ps_verify_payment) before the
  -- order may start fulfilment; COD stays the no-friction default.
  v_payment text := lower(trim(coalesce(p_order->>'payment_method', 'cod')));
  v_payment_ref text := upper(trim(coalesce(p_order->>'payment_ref', '')));
  -- P1 #13 (restored in 202609140008): zero-charge return pickup orders.
  -- ps_create_return_request passes these keys; the flat/growth/wallet
  -- re-creations of this function dropped the handling, which silently turned
  -- every "return request" into a full-price COD order that could be
  -- requested without limit and never approved.
  v_is_return boolean := coalesce((p_order->>'is_return')::boolean, false);
  v_return_parent uuid := nullif(p_order->>'return_parent_id', '')::uuid;
  v_return_reason text := coalesce(trim(p_order->>'return_reason'), '');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  if v_is_return then
    if v_return_parent is null then
      raise exception 'return_parent_id required';
    end if;
    if not exists (select 1 from orders where id = v_return_parent and status = 'delivered') then
      raise exception 'parent order not delivered';
    end if;
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
      if not v_shop.is_open and not v_is_return then
        raise exception 'shop closed';
      end if;
      if not v_is_pickup and not v_is_return and not (v_zone.id = any (v_shop.zone_ids)) then
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
      if not v_is_return then
        -- A return is coming back to the shelf — it must not reserve stock
        -- a second time.
        v_available := v_variant.stock - v_variant.reserved;
        if v_available < v_qty then
          raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
        end if;
        update product_variants
        set reserved = reserved + v_qty
        where id = v_variant.id;
      end if;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Outside Sunamganj Sadar (other upazila / other district) minimum ৳500.
  if not v_is_pickup and not v_is_return and v_zone.id = 'z4' and v_subtotal < 50000 then
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
  elsif v_is_return then
    -- Return pickup is free: the rider's leg is the shop's reverse logistics.
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

  if v_is_return then
    -- A return order is zero-charge by design (the refund is the shop's
    -- offline handling of the parent order): no coupon money, no promo, no
    -- referral credit, no wrap fee, no tip — and COD by definition.
    v_discount := 0; v_promo := 0; v_promo_kind := '';
    v_ref_credit := 0; v_gift_fee := 0; v_tip := 0;
    v_payment := 'cod';
  end if;

  v_total := greatest(0, v_subtotal - v_discount - v_promo - v_ref_credit
                        + v_charge + v_tip + v_gift_fee);
  if v_is_return then
    v_total := 0;
  end if;

  -- Wallet payment proof (P1 #8): the wallet must be configured in the ops
  -- settings, and the TRXID is what the shop matches against its own wallet
  -- history. A fake method or a missing TRXID fails the whole order here.
  if v_payment not in ('cod', 'bkash', 'nagad') then
    raise exception 'unknown payment method';
  end if;
  if v_payment in ('bkash', 'nagad') then
    if coalesce(v_ops->'wallets'->>v_payment, '') = '' then
      raise exception '% is not available right now — please use cash on delivery',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
    if v_payment_ref !~ '^[A-Za-z0-9]{6,32}$' then
      raise exception 'enter the transaction ID (TRXID) from % after sending the money',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
  end if;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, is_return, return_reason, return_parent_id, return_status,
    pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    is_gift, gift_wrap, gift_fee, gift_recipient_name, gift_recipient_phone, gift_message,
    promo_kind, promo_discount, referral_code, referral_credit,
    subtotal, delivery_charge, discount, coupon_id, total,
    payment, payment_ref, payment_status, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_is_return,
    nullif(v_return_reason, ''), v_return_parent,
    case when v_is_return then 'requested' else null end,
    v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_is_gift, nullif(v_gift_wrap, 'none'), v_gift_fee,
    nullif(left(coalesce(trim(p_order->>'gift_recipient_name'), ''), 60), ''),
    nullif(regexp_replace(coalesce(p_order->>'gift_recipient_phone', ''), '[^0-9]', '', 'g'), ''),
    nullif(left(coalesce(trim(p_order->>'gift_message'), ''), 240), ''),
    nullif(v_promo_kind, ''), v_promo,
    case when v_ref_credit > 0 then v_ref_code else null end, v_ref_credit,
    v_subtotal, v_charge, v_discount + v_promo + v_ref_credit,
    case when v_has_coupon then v_coupon.id else null end,
    v_total,
    v_payment,
    case when v_payment in ('bkash', 'nagad') then v_payment_ref else null end,
    case when v_payment in ('bkash', 'nagad') then 'pending_verification' else 'verified' end,
    'pending'
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
      || ' | pay=' || v_payment || case when v_payment in ('bkash','nagad') then ':' || v_payment_ref else '' end
      || ' | return=' || v_is_return::text
  );

  return v_order_id;
end $$;
commit;
