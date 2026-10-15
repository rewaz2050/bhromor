-- Bootstrap part 23 — RPC grant hardening 2 (2026-10-14, round 3).
-- Mirrors supabase/migrations/202610140002_rpc_grant_hardening.sql.
-- ============================================================================
-- RPC grant hardening 2 (2026-10-14, round 3): the anon key keeps EXECUTE on
-- nothing it does not need.
-- ============================================================================
-- Found while re-sweeping after the 2026-10-14 audit fixes. Supabase grants
-- EXECUTE on every new function to PUBLIC by default, so functions created
-- after security repair 4 (202609160004) drifted back open. Through
-- /rest/v1/rpc/... the PUBLIC anon key — which ships in every page — could
-- still call, among others:
--
--   ps_place_multi_order        place multi-shop orders with attacker totals
--   ps_purge_customer_sessions  wipe customer sessions
--   ps_rate_limit_hit           poison other people's rate-limit buckets
--   ps_auto_dispatch_ready_order / ps_broadcast_order / ps_next_eligible_rider
--                               churn the dispatch board
--   ps_award_incentives / ps_award_order_bonuses / ps_register_rider_referral
--                               mint rider money & referrals
--   ps_expire_shop_vacation / ps_block_expired_licence_online
--                               flip shop/rider state
--   ps_offer_order / ps_rider_accept / ps_rider_reject
--                               manipulate delivery offers
--
-- Rule applied here (idempotent, safe to re-run):
--   1. ANON + PUBLIC lose EXECUTE on EVERYTHING except a small allowlist of
--      read-only helpers and RLS policy functions (those run as the querying
--      role and must stay callable by anon).
--   2. A service-only group additionally loses EXECUTE from `authenticated`
--      (every call site in the codebase reaches them through the service-role
--      client; staff/rider session RPCs are the ones granted to
--      `authenticated` in their own migrations and keep those grants).
--   3. Trigger functions keep `authenticated` (customer review inserts fire
--      review triggers as the inserting customer) but lose anon like all.
--
-- Nothing here changes a feature: anon never legitimately called any RPC
-- (verified by grep over src/ — the browser makes zero `.rpc(` calls).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1+2. Grant sweep by NAME (no signature guessing). Re-runnable.
-- ----------------------------------------------------------------------------
do $$
declare
  fn record;
  service_only text[] := array[
    'ps_place_order', 'ps_place_multi_order', 'ps_use_coupon',
    'ps_book_delivery_slot', 'ps_return_action', 'ps_create_return_request',
    'ps_assign_batch_to_rider', 'ps_credit_referrer', 'ps_expire_stale_offers',
    'ps_shop_rating_recompute',                                  -- from repair 4
    'ps_rate_limit_hit', 'ps_purge_customer_sessions',
    'ps_auto_dispatch_ready_order', 'ps_broadcast_order',
    'ps_next_eligible_rider', 'ps_dispatch_extras_audit',
    'ps_expire_shop_vacation', 'ps_block_expired_licence_online',
    'ps_award_incentives', 'ps_award_order_bonuses',
    'ps_register_rider_referral', 'ps_rider_referral_code',
    'ps_offer_order', 'ps_set_order_delivery_code'
    -- NOT here (user sessions call them; blanket step keeps only anon out):
    --   ps_rider_accept/ps_rider_reject (rider session), ps_advance_order,
    --   ps_verify_payment, ps_cancel_assignment, ps_admin_*, ps_rider_*,
    --   ps_funnel_report (staff session), ps_write_shop_ledger (triggers on
    --   admin status changes run as the authenticated updater).
  ];
  anon_keep text[] := array[
    -- RLS policy helpers (policies run as the querying role):
    'ps_is_admin', 'ps_rider_id', 'ps_vendor_shop', 'ps_vendor_role',
    'ps_actor_email', 'ps_public_customer',
    -- pure read helpers used in defaults/policies/UI probes:
    'ps_setting_int', 'ps_haversine_km', 'ps_multi_order_max_shops',
    'ps_vacation_max_days', 'ps_shop_on_vacation', 'ps_offer_ttl_seconds',
    'ps_rider_cash_cap', 'ps_rider_load_limit', 'ps_shop_wallet_defaults',
    'ps_shop_takes_wallet', 'ps_dynamic_eta', 'ps_return_eligible',
    'ps_warranty_eligible', 'ps_failed_delivery_fee', 'ps_checkout_health',
    'ps_track_rider_load', 'ps_rider_on_shift', 'ps_ledger_net_collected',
    'ps_orders_renet_collected', 'ps_shop_wallet_collected',
    'ps_shop_balance_totals', 'ps_rider_scorecards_raw',
    'ps_incentive_settings_audit', 'ps_audit_shop_commission'
  ];
begin
  -- (2) service-only: no role but service_role/owner may execute.
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (service_only)
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function public.%s to service_role', fn.sig);
  end loop;

  -- (1) everything else: anon loses EXECUTE unless on the keep list.
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'ps\_%'
      and p.proname <> all (anon_keep)
      and p.proname <> all (service_only)   -- already handled above
  loop
    execute format('revoke execute on function public.%s from public, anon', fn.sig);
  end loop;
end $$;

commit;
