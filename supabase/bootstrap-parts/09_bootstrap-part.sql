-- PART 9/9 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== P2 #17: PROSANTI+ membership (202609140015) ====
-- ============================================================================
-- P2 #17 (2026-09-14): PROSANTI+ membership — ৳99/month, no PSP needed.
-- ============================================================================
-- Same trust model as the shop's whole bKash/Nagad flow (P1 #8): the member
-- sends the money to the shop's OWN wallet, shares the TRXID, and staff
-- activate. "Recurring" therefore means EXPIRING — the app says when it ends
-- and the shopper renews; no card vault and no silent charge exist here, so
-- none is pretended.
--
-- The one perk that touches money (free delivery) is enforced INSIDE
-- ps_place_order below — recomputed from this table against the order's phone,
-- never from a client claim. Orders carrying it are flagged is_plus so the
-- shop's queues can pick them first (priority is a human courtesy, correctly
-- displayed as one).
--
-- Re-creates ps_place_order on top of 202609140008; run after it.
-- ============================================================================

begin;

create table if not exists memberships (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null check (phone ~ '^01[0-9]{9}$'),
  name         text not null default '',
  status       text not null default 'pending'
               check (status in ('pending', 'active', 'rejected')),
  months       int  not null default 1 check (months between 1 and 12),
  amount_paisa bigint not null check (amount_paisa >= 0),
  pay_method   text check (pay_method in ('bkash', 'nagad')),
  trxid        text check (trxid is null or trxid ~ '^[A-Za-z0-9]{6,32}$'),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  started_at   timestamptz,
  expires_at   timestamptz
);
create index if not exists idx_memberships_phone on memberships (phone);
create index if not exists idx_memberships_status on memberships (status, created_at desc);
-- One open application per phone — a double-tap cannot queue two reviews.
create unique index if not exists memberships_pending_uq on memberships (phone)
  where status = 'pending';

alter table orders add column if not exists is_plus boolean not null default false;

-- Staff read/act through the admin role; the anon key gets nothing, matching
-- every other table that holds people's numbers.
drop policy if exists "admin all memberships" on memberships;
create policy "admin all memberships" on memberships
  for all using (ps_is_admin()) with check (ps_is_admin());


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
  -- P2 #17 — PROSANTI+ membership: recomputed from the memberships table
  -- below, NEVER taken from the client payload. It waives delivery + surcharges.
  v_plus boolean := false;
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
      -- Checkout delivery coverage is determined by the customer's address and
      -- the zone charge, not by the shop's legacy zone_ids metadata. That
      -- metadata is still useful for discovery/dispatch, but blocking here
      -- makes a shop look open in the storefront and then rejects checkout.
      -- Active shops may serve every active checkout zone.
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
  -- TIERED RULE: pickup and free-delivery coupons ride free. Otherwise
  -- use the address-derived zone charge + server-computed surcharges
  -- (night/rain/distance/express/weight).
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  elsif v_is_return then
    -- Return pickup is free: the rider's leg is the shop's reverse logistics.
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    v_charge := coalesce(v_zone.charge, 6000) + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    else
      -- P2 #17 — PROSANTI+ membership, keyed on THIS order's phone and only
      -- while a paid term is unexpired. Same waiver the validation layer
      -- prices with, so badge and bill cannot disagree.
      select exists (
        select 1 from memberships m
         where m.phone = regexp_replace(v_phone, '[^0-9]', '', 'g')
           and m.status = 'active'
           and m.expires_at > now()
      ) into v_plus;
      if v_plus then
        v_charge := 0;
        v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
      end if;
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
    is_plus,
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
    v_plus,
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
      || ' | zone_charge=' || coalesce(v_zone.charge, 6000)::text
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

-- ==== Checkout repair: order INSERT guards + gift_wrap NULL (202609160002) ====
-- ============================================================================
-- Checkout repair 2 (2026-09-16): every order INSERT was being rejected.
-- ============================================================================
-- Symptom on the live site: /checkout answers the generic
-- "Could not place the order — please try again" for EVERY order, plain COD
-- included. /api/health says live, the catalog loads, ps_place_order exists.
--
-- Reproduced by running supabase/bootstrap-fresh.sql end-to-end on a fresh
-- Postgres and calling ps_place_order with the exact checkout payload:
--
--   1. 23502 null value in column "gift_wrap" violates not-null constraint
--      202609130008 declared  orders.gift_wrap text NOT NULL default 'none'
--      while every ps_place_order from that file onward (growth, wallet,
--      return-restore, PROSANTI+ FINAL, the bootstrap, pending-p2-final)
--      inserts  nullif(v_gift_wrap, 'none')  — i.e. NULL for every order that
--      is not a gift. The API only maps P0001 raises to a field error, so this
--      SQLSTATE fell through to the generic 503. Nothing ever dropped the
--      NOT NULL, so no non-gift order could be stored.
--
--   2. Once that is lifted, two phase-1 triggers from 202609080002 still
--      reject legitimate orders, because they were never updated when the
--      order model grew:
--        ps_check_order_totals  demands  total = subtotal - discount + charge
--                               → any tip or gift-wrap fee fails with
--                                 "order total does not reconcile",
--                                 and zero-total return orders never passed
--        ps_check_order_insert  demands  payment = 'cod'
--                               → every bKash / Nagad order fails with
--                                 "only cash on delivery is enabled"
--
-- This file is safe on ANY generation of ps_place_order (flat, growth,
-- wallet, return, PROSANTI+) and on a database where the growth columns do
-- not exist yet. Everything is idempotent — run it again if unsure.
-- After it: run the SELECT at the bottom (it prints 3 × OK) or open
-- /api/health, which now reports checkoutRepair.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. orders.gift_wrap: NULL means "not a gift", exactly what the RPC writes.
--    The CHECK (gift_wrap in ('none','standard','premium')) stays — a CHECK
--    passes on NULL, and the default 'none' still covers plain INSERTs.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'gift_wrap'
      and is_nullable = 'NO'
  ) then
    alter table public.orders alter column gift_wrap drop not null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Totals guard, brought up to the current order model:
--      total = greatest(0, subtotal - discount + delivery_charge + tip + gift_fee)
--    (discount already holds coupon + promo + referral credit, which the RPC
--    caps at the subtotal). Return orders are the zero-charge reverse leg
--    and are not reconciled. Columns are read through to_jsonb(new) so the
--    guard also works on a database that never got tip / gift / return
--    columns (plpgsql would otherwise fail on a missing record field).
-- ----------------------------------------------------------------------------
create or replace function ps_check_order_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_row      jsonb  := to_jsonb(new);
  v_tip      bigint := coalesce((v_row->>'tip_amount')::bigint, 0);
  v_gift_fee bigint := coalesce((v_row->>'gift_fee')::bigint, 0);
  v_return   boolean := coalesce((v_row->>'is_return')::boolean, false);
  v_expected bigint;
begin
  if new.discount > new.subtotal then
    raise exception 'discount (%) exceeds subtotal (%)', new.discount, new.subtotal;
  end if;
  if v_return then
    return new;
  end if;
  v_expected := greatest(0, new.subtotal - new.discount + new.delivery_charge + v_tip + v_gift_fee);
  if new.total <> v_expected then
    raise exception 'order total does not reconcile (total % vs subtotal % - discount % + delivery % + tip % + gift wrap %)',
      new.total, new.subtotal, new.discount, new.delivery_charge, v_tip, v_gift_fee;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_totals on orders;
create trigger trg_orders_check_totals
  before insert or update on orders
  for each row execute function ps_check_order_totals();

-- ----------------------------------------------------------------------------
-- 3. Insert guard: still pending-only, still needs a name and an area, but
--    the payment rule now matches orders_payment_check (cod | bkash | nagad).
--    The RPC is what proves a wallet is configured and a TRXID was given.
-- ----------------------------------------------------------------------------
create or replace function ps_check_order_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'pending' then
    raise exception 'orders must be created pending';
  end if;
  if new.payment not in ('cod', 'bkash', 'nagad') then
    raise exception 'unknown payment method';
  end if;
  if length(trim(new.customer_name)) < 2 then
    raise exception 'customer name is required';
  end if;
  if length(trim(new.area)) < 2 then
    raise exception 'delivery area is required';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_insert on orders;
create trigger trg_orders_check_insert
  before insert on orders
  for each row execute function ps_check_order_insert();

-- ----------------------------------------------------------------------------
-- 4. A read-only probe the app can call: /api/health reports these booleans
--    as checkoutRepair, so the admin dashboard names this file when it is
--    missing instead of every checkout failing quietly. Service role only.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160002',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

-- PostgREST caches the schema — ask it to pick up the new function now so
-- /api/health flips to checkoutRepair: true immediately (no-op elsewhere).
notify pgrst, 'reload schema';

commit;

