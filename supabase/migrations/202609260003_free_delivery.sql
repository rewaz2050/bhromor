-- ============================================================================
-- Free delivery threshold (2026-09-26)
--
-- Two rules, both optional, both server-priced:
--
--   * PLATFORM rule — Admin → Settings → "Free delivery": on/off + minimum
--     subtotal. Lives in site_settings['ops'].freeDelivery (no schema
--     change). PROSANTI funds it: the shop's payout is untouched.
--   * SHOP rule — Vendor → Settings → "ফ্রি ডেলিভারি": each shop may opt in
--     with its own minimum (shops.free_delivery_min, paisa; NULL = off).
--     The shop funds it: ps_write_shop_ledger deducts the waived delivery
--     amount from that order's payable.
--
-- Precedence at placement: platform first (if it covers the order the shop
-- pays nothing), then the shop's own rule. Rider zones only — the courier
-- leg (z4) is never free; pickup / return orders were already free; a
-- free-delivery coupon or an active PROSANTI+ term still wins (no
-- attribution, no deduction).
--
-- orders.free_delivery_by ('platform' | 'shop' | NULL) and
-- orders.free_delivery_waived (paisa) record what happened, for the ledger,
-- the admin order page and the vendor's earnings.
--
-- Idempotent — safe to re-run. Patches the installed ps_place_order in place
-- (same technique as 202609160001) instead of re-pasting the whole RPC, so it
-- works on every generation from 202609130008 (growth promos) onward.
-- Expect "FREE DELIVERY OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists free_delivery_min bigint;
alter table public.shops drop constraint if exists shops_free_delivery_min_check;
alter table public.shops
  add constraint shops_free_delivery_min_check
  check (free_delivery_min is null or free_delivery_min > 0);

alter table public.orders
  add column if not exists free_delivery_by text;
alter table public.orders drop constraint if exists orders_free_delivery_by_check;
alter table public.orders
  add constraint orders_free_delivery_by_check
  check (free_delivery_by is null or free_delivery_by in ('platform', 'shop'));
alter table public.orders
  add column if not exists free_delivery_waived bigint not null default 0;

-- ---------------------------------------------------------------------------
-- 2. ps_place_order — patch the installed definition in place.
-- ---------------------------------------------------------------------------
do $free_delivery$
declare
  v_definition text;
  v_function oid;
  v_block text;
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
    raise exception 'ps_place_order(jsonb,jsonb) is missing — apply the checkout migrations first';
  end if;

  if v_definition like '%v_fd_by%' then
    raise notice 'ps_place_order already prices the free-delivery threshold — nothing to patch';
    return;
  end if;

  if v_definition not like '%is_plus,%' then
    raise exception 'ps_place_order predates 202609140015_plus_membership.sql — apply that first';
  end if;

  -- (a) two working variables, declared next to v_zone.
  v_definition := replace(
    v_definition,
    E'declare\n  v_zone delivery_zones%rowtype;',
    E'declare\n  v_fd_by text := null;\n  v_fd_waived bigint := 0;\n  v_zone delivery_zones%rowtype;'
  );

  -- (b) the rule itself, evaluated after coupon / PROSANTI+ zeroed the
  --     charge (v_charge > 0 guard) and before the total is computed.
  v_block := E'  -- ------------------------------------------------------------------\n'
    || E'  -- Free delivery threshold (202609260003): the platform rule first\n'
    || E'  -- (PROSANTI-funded), then the shop''s own opt-in (shop-funded — the\n'
    || E'  -- ledger deducts free_delivery_waived from the payout). Rider zones\n'
    || E'  -- only; pickup, return, coupon-free and PROSANTI+ orders skip this.\n'
    || E'  -- ------------------------------------------------------------------\n'
    || E'  if v_charge > 0 and not v_is_pickup and not v_is_return and v_zone.id <> ''z4'' then\n'
    || E'    declare\n'
    || E'      v_fd_platform bigint;\n'
    || E'      v_fd_shop bigint;\n'
    || E'    begin\n'
    || E'      select nullif(s.value->''freeDelivery''->>''minSubtotalPaisa'', '''')::bigint\n'
    || E'        into v_fd_platform\n'
    || E'        from site_settings s\n'
    || E'       where s.key = ''ops''\n'
    || E'         and coalesce((s.value->''freeDelivery''->>''enabled'')::boolean, false);\n'
    || E'      v_fd_shop := v_shop.free_delivery_min;\n'
    || E'      if v_fd_platform is not null and v_fd_platform > 0 and v_subtotal >= v_fd_platform then\n'
    || E'        v_fd_by := ''platform'';\n'
    || E'      elsif v_fd_shop is not null and v_fd_shop > 0 and v_subtotal >= v_fd_shop then\n'
    || E'        v_fd_by := ''shop'';\n'
    || E'      end if;\n'
    || E'      if v_fd_by is not null then\n'
    || E'        v_fd_waived := v_charge;\n'
    || E'        v_charge := 0;\n'
    || E'        v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;\n'
    || E'      end if;\n'
    || E'    end;\n'
    || E'  end if;\n\n'
    || E'  -- P0 automatic offers';
  v_definition := replace(v_definition, E'  -- P0 automatic offers', v_block);

  -- (c) persist the attribution on the order row.
  v_definition := replace(v_definition, E'    is_plus,\n', E'    is_plus, free_delivery_by, free_delivery_waived,\n');
  v_definition := replace(v_definition, E'    v_plus,\n', E'    v_plus, v_fd_by, v_fd_waived,\n');

  if (length(v_definition) - length(replace(v_definition, 'v_fd_by', ''))) / length('v_fd_by') < 5 then
    raise exception 'free-delivery patch could not find its anchors in ps_place_order (declare / P0 offers / insert) — paste the function from 202609140015 and re-run';
  end if;
  if v_definition not like '%free_delivery_by, free_delivery_waived,%' or v_definition not like '%v_fd_by, v_fd_waived,%' then
    raise exception 'free-delivery patch could not extend the orders insert in ps_place_order';
  end if;

  execute v_definition;
end
$free_delivery$;

-- ---------------------------------------------------------------------------
-- 3. Ledger: a shop-funded waiver comes out of that order's payable.
--    Same body as 202609160003 plus the deduction; jsonb reads keep it
--    working on databases that never got the optional order columns.
-- ---------------------------------------------------------------------------
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
  v_row jsonb := to_jsonb(new);
  v_fd_waived bigint;
begin
  if new.status = 'delivered' and old.status is distinct from new.status then
    select commission_pct into v_pct from shops where id = new.shop_id;
    if v_pct is null then v_pct := 15; end if;
    v_commission := floor((new.subtotal * v_pct) / 100);
    v_payable := new.subtotal - v_commission;
    v_delivery := coalesce(new.delivery_charge, 0);
    v_tip := coalesce((v_row->>'tip_amount')::bigint, 0);
    v_sur := coalesce((v_row->>'surcharge_night')::bigint, 0)
           + coalesce((v_row->>'surcharge_rain')::bigint, 0)
           + coalesce((v_row->>'surcharge_distance')::bigint, 0)
           + coalesce((v_row->>'surcharge_express')::bigint, 0)
           + coalesce((v_row->>'surcharge_weight')::bigint, 0);
    -- Free delivery the SHOP offered: the rider is still paid, so the waived
    -- amount leaves the shop's share (never below zero on this line).
    v_fd_waived := coalesce((v_row->>'free_delivery_waived')::bigint, 0);
    if coalesce(v_row->>'free_delivery_by', '') = 'shop' and v_fd_waived > 0 then
      v_payable := greatest(0, v_payable - v_fd_waived);
    end if;
    -- A return order is the reverse leg: the shop pays the product share back.
    if coalesce((v_row->>'is_return')::boolean, false) then
      v_payable := -(new.subtotal - v_commission);
    end if;
    if new.shop_id is null then
      return new;
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

-- ---------------------------------------------------------------------------
-- 4. Proof
-- ---------------------------------------------------------------------------
do $$
declare v_ok boolean;
begin
  select pg_get_functiondef(p.oid) like '%v_fd_by%'
    into v_ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ps_place_order'
    and oidvectortypes(p.proargtypes) = 'jsonb, jsonb'
  order by p.oid desc limit 1;
  if not coalesce(v_ok, false) then
    raise exception 'ps_place_order was not patched';
  end if;
  raise notice 'FREE DELIVERY OK';
end $$;

commit;
