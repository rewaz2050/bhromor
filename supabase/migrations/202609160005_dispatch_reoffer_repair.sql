-- ============================================================================
-- Dispatch repair 5 (2026-09-16): a delivery offer can be re-offered, and
-- staff batch-assign works.
-- ============================================================================
-- Found while replaying the dispatch flow on a fresh schema (PGlite) during
-- the audit follow-up. Neither is visible until a rider lets an offer lapse
-- or rejects it — which is exactly the moment dispatch matters.
--
-- 1. `delivery_assignments.order_id` was created UNIQUE (202609090005), yet
--    every function written since assumes MANY rows per order:
--      ps_next_eligible_rider  — "never re-offer to a rider who already SAW
--                                 this order" (needs the old row to stay)
--      ps_expire_stale_offers  — marks the lapsed row 'expired' then INSERTS
--                                 a fresh offer for the next rider
--      ps_rider_reject         — marks 'cancelled' then INSERTS the next offer
--      toDomain (API)          — reads "latest by offered_at"
--    So the second INSERT fails with 23505 duplicate key:
--      * ps_expire_stale_offers raises → the rider job feed
--        (/api/rider/jobs runs the sweep first) answers 503 for EVERY rider
--        as soon as ONE offer anywhere has expired with a second eligible
--        rider online — the rider app goes blank, and the admin dispatch
--        board (before today's change) did the same.
--      * ps_rider_reject raises → a rider cannot decline an offer when
--        someone else could take it.
--    Fix: replace the UNIQUE(order_id) with a partial unique index on the
--    LIVE states only — one active offer per order (what the uniqueness was
--    protecting), unlimited history rows.
--
-- 2. `ps_assign_batch_to_rider` (202609090017) calls a function that does
--    not exist (ps_assign_order_to_rider) and, in its exception handler,
--    inserts into a table that does not exist (rider_assignments). Every
--    call fails with 42P01; Admin → Deliveries → "Batch assign" has never
--    worked. Rewritten on delivery_assignments: cancels the current live
--    offer for each order, then offers it directly to the chosen rider.
--    Requires the rider to be active + online and the order to be in a
--    dispatchable status. Stays service-only (202609160004).
--
-- Health: ps_checkout_health() gains `dispatch_reoffer_ok` so /api/health
-- and the admin banner can name this file.
--
-- Safe to re-run. Nothing is dropped except the wrong constraint. The
-- active-offer index creation fails only if the table ALREADY holds two
-- live offers for one order — impossible while the UNIQUE constraint was in
-- place.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. One LIVE offer per order; history rows may accumulate.
-- ----------------------------------------------------------------------------
alter table delivery_assignments
  drop constraint if exists delivery_assignments_order_id_key;

create unique index if not exists delivery_assignments_one_live_offer
  on delivery_assignments (order_id)
  where state in ('offered', 'accepted', 'picked_up');

-- The "latest offer" reads (toDomain, dispatch board) walk by offered_at.
create index if not exists idx_assignments_order_offered
  on delivery_assignments (order_id, offered_at desc);

-- ----------------------------------------------------------------------------
-- 2. Staff batch assign — direct offers to ONE chosen rider.
-- ----------------------------------------------------------------------------
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count  int := 0;
  v_oid    uuid;
  v_rider  riders%rowtype;
  v_status text;
begin
  select * into v_rider
  from riders
  where id = p_rider_id and status = 'active' and is_online
  for update;
  if not found then
    raise exception 'rider not available';
  end if;

  foreach v_oid in array coalesce(p_order_ids, '{}'::uuid[]) loop
    select status into v_status from orders where id = v_oid for update;
    if v_status is null
       or v_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
      continue;  -- not dispatchable (yet): skip, do not abort the batch
    end if;

    -- Already riding with this rider? Count it and move on.
    if exists (
      select 1 from delivery_assignments
      where order_id = v_oid and rider_id = p_rider_id
        and state in ('offered', 'accepted', 'picked_up')
    ) then
      v_count := v_count + 1;
      continue;
    end if;

    -- A live offer/acceptance with another rider is withdrawn (staff
    -- decision beats round-robin). A picked-up leg is never moved.
    if exists (
      select 1 from delivery_assignments
      where order_id = v_oid and state = 'picked_up'
    ) then
      continue;
    end if;
    update delivery_assignments
    set state = 'cancelled'
    where order_id = v_oid and state in ('offered', 'accepted');

    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke all on function ps_assign_batch_to_rider(uuid, uuid[]) from public, anon, authenticated;
grant execute on function ps_assign_batch_to_rider(uuid, uuid[]) to service_role;

-- ----------------------------------------------------------------------------
-- Health probe: same function as 0002–0004, one more key.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160005',
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
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true),
    -- 202609160005: offers can be re-issued (no UNIQUE(order_id)), one live
    -- offer per order is enforced by the partial index, batch assign exists
    -- without its phantom dependencies.
    'dispatch_reoffer_ok', (
      not exists (
        select 1 from pg_constraint k
        where k.conrelid = 'public.delivery_assignments'::regclass
          and k.conname = 'delivery_assignments_order_id_key'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_live_offer'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
          and p.prosrc not like '%rider_assignments%'
      )
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- VERIFY — expect 3 × OK.
-- ----------------------------------------------------------------------------
select 'offers can be re-issued (no UNIQUE order_id)' as check_,
       case when not exists (
         select 1 from pg_constraint
         where conrelid = 'public.delivery_assignments'::regclass
           and conname = 'delivery_assignments_order_id_key')
       then 'OK' else 'MISSING' end as state
union all
select 'one live offer per order (partial unique index)',
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public' and tablename = 'delivery_assignments'
           and indexname = 'delivery_assignments_one_live_offer')
       then 'OK' else 'MISSING' end
union all
select 'batch assign has no phantom dependencies',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
           and p.prosrc not like '%rider_assignments%'
           and p.prosrc not like '%ps_assign_order_to_rider%')
       then 'OK' else 'MISSING' end;
