-- ============================================================================
-- RPC grant audit (security report 2026-10-14, L6) — run in the SQL editor.
-- ============================================================================
-- Supabase grants EXECUTE on new functions to anon + authenticated by
-- default. SECURITY DEFINER functions without an internal auth check should
-- NOT be reachable through PostgREST with the public anon key.
--
-- Expected output: ONLY harmless read helpers (ps_offer_ttl_seconds,
-- ps_rider_cash_cap, ps_rider_load_limit, ps_failed_delivery_fee,
-- ps_orders_renet_collected, ps_return_eligible, ps_warranty_eligible,
-- ps_next_eligible_rider, ps_track_rider_load, ps_reviews_shop_rating) and
-- trigger functions (ps_guard*, ps_*_on_*, ps_handle_new_user,
-- ps_set_order_delivery_code, ps_write_shop_ledger, ps_auto_dispatch_ready_order
-- — trigger functions refuse direct calls anyway).
--
-- Anything else appearing here should get:
--   revoke all on function public.FN(signature) from public, anon, authenticated;
--   grant execute on function public.FN(signature) to service_role;
-- then `notify pgrst, 'reload schema';`
-- ============================================================================

select
  p.proname as name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prorettype::regtype as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef                                   -- security definer
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname not like 'ps\_is\_%'
order by p.proname, args;
