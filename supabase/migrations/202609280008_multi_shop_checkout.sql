-- =====================================================================
-- C2 (2026-09-28) — one checkout, one order per shop.
--
-- One order = one shop is not a limitation to work around, it is how the
-- marketplace works: the shop packs its own parcel, the ledger pays the
-- shop its own share, and the vendor dashboard shows the shop its own
-- orders. So a bag with two shops' items becomes TWO orders — not one
-- order with an "also from" column.
--
-- The rule that makes it trustworthy is ATOMICITY: the buyer taps once and
-- either every shop's order exists or none does. A function body is one
-- transaction in Postgres, so looping over ps_place_order inside a single
-- call gives that for free — and it reuses every cent of the pricing,
-- stock, coupon and shop guards ps_place_order already enforces, instead
-- of a second copy of them that could drift.
--
-- Bounded on purpose: a checkout may cover at most ps_multi_order_max_shops()
-- shops. Two or three parcels is a family order; six is a courier contract.
-- =====================================================================

/** How many shops one checkout may cover. */
create or replace function ps_multi_order_max_shops()
returns int language sql immutable as $$ select 3 $$;

/**
 * Place one order per shop, atomically.
 *
 *   p_orders: jsonb array of { "order": <p_order jsonb>, "items": <p_items jsonb> }
 *
 * Returns the new order ids in the same order as the input. If ANY shop's
 * order is refused — out of stock, shop closed, coupon minimum not met,
 * zone floor — the whole exception rolls back every order in the batch, so
 * the buyer never ends up holding half a checkout.
 */
create or replace function ps_place_multi_order(p_orders jsonb)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_ids        uuid[] := array[]::uuid[];
  v_entry      jsonb;
  v_id         uuid;
  v_shops      text[] := array[]::text[];
  v_shop       text;
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' then
    raise exception 'order batch must be an array';
  end if;
  if jsonb_array_length(p_orders) = 0 then
    raise exception 'empty order batch';
  end if;
  if jsonb_array_length(p_orders) > ps_multi_order_max_shops() then
    raise exception 'A single checkout can cover at most % shops — check out the rest separately.',
      ps_multi_order_max_shops();
  end if;

  for v_entry in select value from jsonb_array_elements(p_orders) loop
    if jsonb_typeof(v_entry -> 'items') <> 'array' then
      raise exception 'each order in the batch needs its items';
    end if;
    -- One shop, twice, is one shop's checkout with a typing mistake behind
    -- it: two orders for the same shop would double a rider trip for no
    -- reason the buyer asked for.
    select array_agg(distinct p.shop_id::text)
      into v_shops
      from jsonb_array_elements(v_entry -> 'items') as it
      join products p on p.id = (it ->> 'product_id')::uuid;
    if coalesce(array_length(v_shops, 1), 0) > 1 then
      raise exception 'each order in the batch must belong to one shop';
    end if;
    v_shop := v_shops[1];
    if exists (select 1 from unnest(v_ids) as placed
                 join orders o on o.id = placed
                where o.shop_id::text = v_shop) then
      raise exception 'the same shop appears twice in one checkout';
    end if;

    v_id := ps_place_order(coalesce(v_entry -> 'order', '{}'::jsonb), v_entry -> 'items');
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end $$;

-- ps_place_order itself is service-role-only (202609160004). The batch
-- wrapper must be no looser: it can create orders too.
do $$
begin
  execute 'revoke all on function public.ps_place_multi_order(jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.ps_place_multi_order(jsonb) to service_role';
end $$;

do $$ begin raise notice 'MULTI SHOP CHECKOUT OK'; end $$;
