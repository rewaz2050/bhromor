-- PART 8/11 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ============================================================================
-- MIGRATION 27/27 — wallet-aware delivery cash (P1 #8 follow-up)  (source: supabase/migrations/202609140006_wallet_delivery_cash.sql)
-- ===========================================================================
begin;

create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
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

  -- P1 #8: the rider only ever carries cash for COD orders — a wallet order
  -- was paid into the shop's own bKash/Nagad wallet at checkout.
  v_cash := case when v_order.payment = 'cod' then v_order.total else 0 end;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · '
        || case
             when v_order.payment = 'bkash' then 'paid via bKash at checkout'
             when v_order.payment = 'nagad' then 'paid via Nagad at checkout'
             else 'COD collected'
           end,
      auth.uid()
    );
  end if;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

commit;

begin;

create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
  v_is_admin boolean;
  v_shop uuid;
  v_payment_rejected boolean;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if p_to not in ('confirmed', 'preparing', 'ready-for-pickup', 'cancelled') then
      raise exception 'forbidden';
    end if;
  end if;

  -- P1 #8: a bKash/Nagad order may not START FULFILMENT before the shop has
  -- verified the payment in its own wallet (ps_verify_payment flips
  -- payment_status to 'verified'). 'confirmed' and 'cancelled' stay legal —
  -- canceling releases the reservation via trg_orders_release_on_cancel.
  if v_order.payment in ('bkash', 'nagad')
     and v_order.payment_status = 'pending_verification'
     and p_to in ('preparing', 'ready-for-pickup', 'courier-assigned', 'out-for-delivery', 'delivered') then
    raise exception 'payment not verified';
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null or v_to_pos <> v_from_pos + 1 then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  -- P1 #8 (2): a cancelled wallet order's payment is settled as REJECTED —
  -- the customer's track page says "not accepted", never "under
  -- verification" on a cancelled order.
  v_payment_rejected := p_to = 'cancelled'
    and v_order.payment in ('bkash', 'nagad')
    and v_order.payment_status = 'pending_verification';

  update orders
  set status = p_to,
      payment_status = case when v_payment_rejected then 'rejected' else payment_status end,
      payment_verified_at = case when v_payment_rejected then now() else payment_verified_at end,
      updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  if v_payment_rejected then
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, p_to,
      'Payment rejected — order cancelled (refund from the shop wallet, offline)',
      auth.uid());
  end if;
  return v_order;
end $$;

create or replace function ps_verify_payment(p_order_id uuid, p_action text, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_is_admin boolean;
  v_shop uuid;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Same auth model as ps_advance_order: staff or the owning shop.
  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
  end if;

  if v_order.payment = 'cod' then
    raise exception 'not a wallet payment';
  end if;
  if v_order.payment_status <> 'pending_verification' then
    raise exception 'payment already decided';
  end if;

  -- P1 #8 (2): a cancelled order can never be VERIFIED — the order is over,
  -- the money is not in. Rows cancelled BEFORE the auto-reject rule still
  -- need a decision, so REJECT stays legal and settles them (re-setting
  -- status='cancelled' is a no-op: the release trigger only fires on the
  -- transition into cancelled, so stock cannot be released twice).
  if v_order.status = 'cancelled' and p_action = 'verified' then
    raise exception 'order already cancelled';
  end if;

  if p_action = 'verified' then
    -- The shop checked its own bKash/Nagad wallet: the money is in, this is
    -- the moment the order may start fulfilment.
    update orders
    set payment_status = 'verified', payment_verified_at = now(), updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, v_order.status,
      upper(left(v_order.payment, 1)) || right(v_order.payment, length(v_order.payment) - 1) || ' payment verified',
      auth.uid());
  elsif p_action = 'rejected' then
    -- No matching money in the wallet: the order is cancelled and the
    -- reservation goes back to the shelf (trg_orders_release_on_cancel).
    -- The refund to the customer's wallet is the shop's offline handling.
    update orders
    set payment_status = 'rejected', payment_verified_at = now(),
        status = 'cancelled', updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, 'cancelled',
      'Payment rejected' || coalesce(' — ' || trim(coalesce(p_note, '')), '') ||
      ' (refund from the shop wallet, offline)',
      auth.uid());
  else
    raise exception 'unknown payment action';
  end if;

  return (select * from orders where id = p_order_id);
end $$;

commit;

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

begin;

create or replace view v_product_sales as
select oi.product_id,
       greatest(
         0,
         coalesce(sum(oi.qty) filter (where o.is_return is distinct from true), 0)
           - coalesce(sum(oi.qty) filter (where o.is_return = true
                                          and o.return_status = 'refunded'), 0)
       ) as units_sold
from order_items oi
join orders o on o.id = oi.order_id
where o.status <> 'cancelled'
group by oi.product_id;

comment on view v_product_sales is
  'Eligible units sold per product: non-cancelled order units minus refunded return units. P2 #1 best-sellers source.';

-- The storefront reads it through the service-role API only; there is no
-- public read policy (same convention as every other table in this schema).
grant select on v_product_sales to service_role;

commit;

begin;

create table if not exists stock_watches (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products (id) on delete cascade,
  phone             text not null check (phone ~ '^[0-9]{11}$'),
  -- When staff were last handed this watcher's number for a restock.
  -- Informational on the admin screen; the dedupe is the out-of-stock →
  -- in-stock transition itself (each cycle is a real event the shopper
  -- signed up for), so no value here can silently swallow a real restock.
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (product_id, phone)
);
create index if not exists idx_stock_watches_product on stock_watches (product_id);

alter table stock_watches enable row level security;

-- The storefront never writes this table directly: /api/stock-watch uses the
-- service role. The policy exists only so a hand-pasted insert from a
-- customer session is still format-checked, and nothing else can see rows.
drop policy if exists "stock watch public insert" on stock_watches;
create policy "stock watch public insert" on stock_watches
  for insert with check (phone ~ '^[0-9]{11}$');

drop policy if exists "admin all stock watches" on stock_watches;
create policy "admin all stock watches" on stock_watches
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;

begin;

-- Full recompute for one shop. Cheap: reviews per shop are small, and this
-- only runs when a review is written, changes status, or is deleted.
create or replace function ps_shop_rating_recompute(p_shop_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update shops
  set rating_avg = coalesce(
        (select round(avg(r.rating)::numeric, 2)
           from reviews r
          where r.shop_id = p_shop_id and r.status = 'approved'), 0),
      rating_count = coalesce(
        (select count(*)
           from reviews r
          where r.shop_id = p_shop_id and r.status = 'approved'), 0)
  where id = p_shop_id;
end;
$$;

create or replace function ps_reviews_shop_rating()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.shop_id, old.shop_id) is not null then
    perform ps_shop_rating_recompute(coalesce(new.shop_id, old.shop_id));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_reviews_shop_rating on reviews;
create trigger trg_reviews_shop_rating
after insert or update of status, rating, shop_id or delete
on reviews
for each row
execute function ps_reviews_shop_rating();

-- Backfill: any approved review written before the trigger existed.
do $$
declare
  s record;
begin
  for s in select id from shops loop
    perform ps_shop_rating_recompute(s.id);
  end loop;
end;
$$;

commit;

-- ==== P2 #21: fabric transparency (202609140012) ====
begin;

alter table products add column if not exists fabric_gsm int
  check (fabric_gsm is null or (fabric_gsm >= 30 and fabric_gsm <= 1000));
alter table products add column if not exists manufacturer text;
alter table products add column if not exists test_report_url text;
alter table products add column if not exists quality_checked boolean not null default false;

commit;

-- ==== P2 #20: campaign early-access tag (202609140013) ====
begin;

alter table newsletter_subscribers add column if not exists campaign text;

commit;

-- ==== P2 #22: rider availability (202609140014) ====
begin;
alter table riders add column if not exists avail_from_hour int
  check (avail_from_hour is null or (avail_from_hour >= 0 and avail_from_hour <= 23));
alter table riders add column if not exists avail_to_hour int
  check (avail_to_hour is null or (avail_to_hour >= 0 and avail_to_hour <= 24));
alter table riders add column if not exists avail_days smallint[];
create or replace function ps_rider_on_shift(r riders)
returns boolean
language sql stable set search_path = public as $$
  select (
      r.avail_days is null
      or coalesce(array_length(r.avail_days, 1), 0) = 0
      or extract(dow from (now() at time zone 'Asia/Dhaka'))::int = any (r.avail_days)
    )
    and (
      (r.avail_from_hour is null and r.avail_to_hour is null)
      or (
        -- an empty shift (18–18) never matches, by design, same as the TS rule
        coalesce(r.avail_from_hour, -1) <> coalesce(r.avail_to_hour, -1)
        and (
          case
            when r.avail_from_hour is not null and r.avail_to_hour is not null
                 and r.avail_from_hour > r.avail_to_hour then
              extract(hour from (now() at time zone 'Asia/Dhaka'))::int >= r.avail_from_hour
              or extract(hour from (now() at time zone 'Asia/Dhaka'))::int < r.avail_to_hour
            else
              extract(hour from (now() at time zone 'Asia/Dhaka'))::int >= coalesce(r.avail_from_hour, 0)
              and extract(hour from (now() at time zone 'Asia/Dhaka'))::int < coalesce(r.avail_to_hour, 24)
          end
        )
      )
    );
$$;
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
      and ps_rider_on_shift(r)
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
    and ps_rider_on_shift(r)
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
commit;
