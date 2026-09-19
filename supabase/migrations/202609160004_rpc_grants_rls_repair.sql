-- ============================================================================
-- Security repair 4 (2026-09-16): lock down what the PUBLIC anon key can do.
-- ============================================================================
-- Found by the full-site audit (docs/AUDIT-2026-09-16.md, H1 / H2 / M1).
-- Nothing here changes a feature: every write below is already made by the
-- server with the service-role key. What changes is that the browser key —
-- which ships in every page — can no longer reach the same objects directly
-- through PostgREST.
--
-- H1  `memberships` was created (202609140015) with an admin policy but
--     WITHOUT `enable row level security`, so the policy never applied and
--     the anon key could read every PROSANTI+ request (phone, trxid) and
--     flip status to 'active'.
--
-- H2  Eight SECURITY DEFINER write functions carry no internal auth check
--     (they trust their caller, which is always our API) and were never
--     revoked from anon/authenticated. Supabase grants EXECUTE to both by
--     default, so any visitor could call them through /rest/v1/rpc/…:
--       ps_place_order            — orders around the API's validation/limits
--       ps_use_coupon             — burn a coupon's usage_limit
--       ps_book_delivery_slot     — fill any day's slots (20 calls = full)
--       ps_return_action          — approve/reject/complete any return
--       ps_assign_batch_to_rider  — push orders onto a rider
--       ps_credit_referrer        — mint referral coupons
--       ps_expire_stale_offers    — churn the dispatch board
--       ps_shop_rating_recompute  — (harmless, still not public API)
--     ps_create_return_request has the same shape (no guard, calls
--     ps_place_order) and is locked with them. The functions the storefront
--     legitimately calls with a USER session (ps_rider_*, ps_advance_order,
--     ps_verify_payment, ps_offer_order, …) all check ps_is_admin() /
--     ps_rider_id() / ps_vendor_shop() themselves and keep their grants.
--
-- M1  `delivery_slots` "admin all" policy (202609090017) was written as
--     `using (true) with check (true)` — i.e. everyone — so the anon key could
--     block or delete every slot. Now admin-only; public read stays.
--
-- Also: `ps_checkout_health()` gains `rpc_grants_locked` / `memberships_rls`
-- so /api/health can report this repair (checks.securityRepair).
--
-- Safe to re-run. Nothing is dropped. Takes well under a second.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- H1. memberships: turn the existing policy on.
-- ----------------------------------------------------------------------------
alter table if exists memberships enable row level security;

-- ----------------------------------------------------------------------------
-- M1. delivery_slots: admin-only writes (the public read policy is untouched).
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.delivery_slots') is not null then
    drop policy if exists "delivery_slots admin all" on delivery_slots;
    create policy "delivery_slots admin all" on delivery_slots
      for all using (ps_is_admin()) with check (ps_is_admin());
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- H2. service-role-only RPCs. `revoke … from public` also removes the
--     default EXECUTE every new function inherits; service_role (and the
--     owner, which is what SECURITY DEFINER callers run as) keep it.
-- ----------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'ps_place_order(jsonb, jsonb)',
    'ps_use_coupon(uuid)',
    'ps_book_delivery_slot(date, text)',
    'ps_return_action(uuid, text, text)',
    'ps_create_return_request(uuid, text, text)',
    'ps_assign_batch_to_rider(uuid, uuid[])',
    'ps_credit_referrer(uuid)',
    'ps_expire_stale_offers()',
    'ps_shop_rating_recompute(uuid)'
  ] loop
    if to_regprocedure('public.' || fn) is not null then
      execute format('revoke all on function public.%s from public, anon, authenticated', fn);
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Health probe: same function as 0002/0003, two more keys.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160004',
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
    -- 202609160004: the anon key may no longer call the service-only RPCs …
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    -- … and memberships is actually protected by its policy.
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true)
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- VERIFY — expect 3 × OK.
-- ----------------------------------------------------------------------------
select 'memberships has row level security' as check_,
       case when (select relrowsecurity from pg_class where relname = 'memberships' and relnamespace = 'public'::regnamespace)
            then 'OK' else 'STILL OPEN — re-run this file' end as state
union all
select 'service-only RPCs are not callable with the anon key',
       case when not exists (
              select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                                  'ps_return_action', 'ps_create_return_request',
                                  'ps_assign_batch_to_rider', 'ps_credit_referrer',
                                  'ps_expire_stale_offers', 'ps_shop_rating_recompute')
                and has_function_privilege('anon', p.oid, 'execute'))
            then 'OK' else 'STILL PUBLIC — re-run this file' end
union all
select 'delivery_slots writes are admin-only',
       case when exists (select 1 from pg_policies where tablename = 'delivery_slots'
                           and policyname = 'delivery_slots admin all' and qual like '%ps_is_admin%')
            then 'OK' else 'OLD POLICY STILL INSTALLED — re-run this file' end
order by 1;
