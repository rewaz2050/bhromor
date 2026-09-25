-- ============================================================================
-- 2026-09-25 rider fix — STATUS CHECK (chhoto, niriho: kichu likhe na)
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
--
-- Shob `true`  → migration shesh, ar kichu korar dorkar nei.
-- Jei row `false` → oi migration-er parts ta aro chalate hobe (README.md e
-- mapping ache: m01→parts 01–03, m03→05–08, m04→09–10, m05→11–12,
-- m06→13–16, m07→18–23).
-- Jei row false thakar pore-o parts chalale error asle meanse paste kata
-- geche — oi part ta abar puro copy kore chalaben.
-- ============================================================================

select
  (to_regprocedure('public.ps_broadcast_order(uuid)') is not null)
    as m01_area_broadcast,
  (to_regprocedure('public.ps_rider_reject(uuid)') is not null and
   pg_get_functiondef(to_regprocedure('public.ps_rider_reject(uuid)')) like '%cancelled_by%')
    as m03_withdraw_resume,
  (to_regprocedure('public.ps_admin_reject_settle(uuid, text)') is not null)
    as m04_settle_claims,
  (to_regprocedure('public.ps_rider_deliver_check(uuid, text)') is not null)
    as m05_pin_lockout,
  (case when to_regprocedure('public.ps_checkout_health()') is null then false
        else pg_get_functiondef(to_regprocedure('public.ps_checkout_health()')) like '%pin_lockout_ok%' end)
    as m06_health_probe,
  (case when to_regprocedure('public.ps_checkout_health()') is null then false
        else pg_get_functiondef(to_regprocedure('public.ps_checkout_health()')) like '%realtime_offers_ok%' end)
    as m07_realtime_health,
  (exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and tablename = 'delivery_assignments'))
    as m07_realtime_publication,
  (
    (to_regprocedure('public.ps_broadcast_order(uuid)') is not null) and
    (to_regprocedure('public.ps_rider_reject(uuid)') is not null and
     pg_get_functiondef(to_regprocedure('public.ps_rider_reject(uuid)')) like '%cancelled_by%') and
    (to_regprocedure('public.ps_admin_reject_settle(uuid, text)') is not null) and
    (to_regprocedure('public.ps_rider_deliver_check(uuid, text)') is not null) and
    (case when to_regprocedure('public.ps_checkout_health()') is null then false
          else pg_get_functiondef(to_regprocedure('public.ps_checkout_health()')) like '%pin_lockout_ok%' end) and
    (case when to_regprocedure('public.ps_checkout_health()') is null then false
          else pg_get_functiondef(to_regprocedure('public.ps_checkout_health()')) like '%realtime_offers_ok%' end) and
    (exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and tablename = 'delivery_assignments'))
  ) as shob_thik_ache;
