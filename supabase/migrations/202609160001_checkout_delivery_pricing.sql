-- ============================================================================
-- Checkout repair (2026-09-16)
--
-- The address-first checkout allows every active shop to deliver to every
-- checkout zone. The frontend and validator were updated for that rule, but
-- older live databases still had the legacy shop.zone_ids guard inside
-- ps_place_order. That guard made checkout return the generic placement error
-- for a perfectly valid address outside the shop's old metadata list.
--
-- This migration is safe to run after any of the existing ps_place_order
-- generations. It also moves the live zone rows to the customer-facing
-- pricing tiers and patches the installed RPC so the server total cannot
-- disagree with the checkout quote.
-- ============================================================================

begin;

-- Address-derived tier pricing: city ৳60, nearby ৳120, remote ৳150.
update public.delivery_zones
set charge = case id
  when 'z1' then 6000
  when 'z2' then 12000
  when 'z3' then 15000
  when 'z4' then 15000
  else charge
end
where id in ('z1', 'z2', 'z3', 'z4');

-- Keep zone_ids useful for discovery and dispatch, but do not let stale
-- marketplace metadata block an address the checkout promises to serve.
update public.shops
set zone_ids = array['z1', 'z2', 'z3', 'z4']::text[]
where status = 'active'
  and zone_ids is distinct from array['z1', 'z2', 'z3', 'z4']::text[];

-- Existing projects already have ps_place_order. Re-create its stored
-- definition in-place rather than requiring the owner to paste a 500-line
-- function again. The replacements are idempotent and work with the final
-- wallet/return/PROSANTI+ generations shipped by this repository.
do $checkout_repair$
declare
  v_definition text;
  v_function oid;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_function, v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ps_place_order'
    and oidvectortypes(p.proargtypes) = 'jsonb, jsonb'
  order by p.oid desc
  limit 1;

  if v_function is null then
    raise exception 'ps_place_order(jsonb,jsonb) is missing — apply the earlier checkout migrations first';
  end if;

  -- Remove the legacy delivery-coverage gate. The regex tolerates the
  -- indentation/newline formatting returned by pg_get_functiondef().
  v_definition := regexp_replace(
    v_definition,
    $pattern$if[[:space:]]+(not[[:space:]]+v_is_pickup[[:space:]]+and[[:space:]]+(not[[:space:]]+v_is_return[[:space:]]+and[[:space:]]+)?)?not[[:space:]]*\(v_zone\.id[[:space:]]*=[[:space:]]*any[[:space:]]*\(v_shop\.zone_ids\)\)[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+'shop does not deliver to zone';[[:space:]]+end[[:space:]]+if;$pattern$,
    '-- checkout coverage is determined by the address-derived zone charge',
    1,
    1,
    'n'
  );

  -- The old function used a hard-coded flat ৳60. Use the authoritative zone
  -- row while retaining 6000 as a defensive fallback for an old zone row.
  v_definition := replace(
    v_definition,
    'v_charge := 6000 + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;',
    'v_charge := coalesce(v_zone.charge, 6000) + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;'
  );

  if v_definition like '%shop does not deliver to zone%' then
    raise exception 'checkout repair could not remove the legacy shop-zone guard';
  end if;
  if v_definition like '%v_charge := 6000 + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;%' then
    raise exception 'checkout repair could not replace the legacy flat delivery charge';
  end if;

  execute v_definition;
end
$checkout_repair$;

commit;
