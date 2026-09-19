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

-- ----------------------------------------------------------------------------
-- VERIFY — expect 3 × OK (the SQL Editor shows this last result).
-- ----------------------------------------------------------------------------
select 'orders.gift_wrap accepts NULL (non-gift orders)' as check_,
       case when coalesce((select c.is_nullable = 'YES' from information_schema.columns c
                           where c.table_schema = 'public' and c.table_name = 'orders'
                             and c.column_name = 'gift_wrap'), true)
            then 'OK' else 'STILL NOT NULL — re-run this file' end as state
union all
select 'ps_check_order_totals counts tip + gift wrap',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
                           and p.prosrc like '%gift_fee%')
            then 'OK' else 'OLD GUARD — re-run this file' end
union all
select 'ps_check_order_insert allows bkash / nagad',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
                           and p.prosrc like '%bkash%')
            then 'OK' else 'OLD GUARD — re-run this file' end
order by 1;
