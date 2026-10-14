-- ============================================================================
-- RPC grant audit (security report 2026-10-14, L6 + round 3) — SQL editor.
-- ============================================================================
-- Supabase grants EXECUTE on new functions to anon + authenticated by default.
-- After hardening 2 (migration 202610140002) the PUBLIC anon key must be able
-- to execute ONLY the allowlist below (RLS policy helpers + pure read helpers)
-- and trigger functions (which refuse direct calls anyway).
--
-- Expected output: rows only from the keep list or `returns = trigger`.
-- Anything else appearing here should get:
--   revoke execute on function public.FN(signature) from public, anon;
-- (and, when no user-session call site exists: also from authenticated, with
-- `grant execute … to service_role`), then `notify pgrst, 'reload schema';`
-- ============================================================================

select
  p.proname as name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prorettype::regtype as returns,
  case
    when p.proname = any (array[
      'ps_is_admin', 'ps_rider_id', 'ps_vendor_shop', 'ps_vendor_role',
      'ps_actor_email', 'ps_public_customer',
      'ps_setting_int', 'ps_haversine_km', 'ps_multi_order_max_shops',
      'ps_vacation_max_days', 'ps_shop_on_vacation', 'ps_offer_ttl_seconds',
      'ps_rider_cash_cap', 'ps_rider_load_limit', 'ps_shop_wallet_defaults',
      'ps_shop_takes_wallet', 'ps_dynamic_eta', 'ps_return_eligible',
      'ps_warranty_eligible', 'ps_failed_delivery_fee', 'ps_checkout_health',
      'ps_track_rider_load', 'ps_rider_on_shift', 'ps_ledger_net_collected',
      'ps_orders_renet_collected', 'ps_shop_wallet_collected',
      'ps_shop_balance_totals', 'ps_rider_scorecards_raw',
      'ps_incentive_settings_audit', 'ps_audit_shop_commission'
    ]) then 'keep (read/policy helper)'
    when p.prorettype = 'trigger'::regtype then 'keep (trigger — not RPC-callable)'
    else '*** REMOVE FROM ANON ***'
  end as verdict
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'ps\_%'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by verdict desc, p.proname, args;
