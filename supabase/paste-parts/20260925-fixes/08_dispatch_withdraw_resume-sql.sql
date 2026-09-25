-- PASTE 8/23 · 08_dispatch_withdraw_resume-sql.sql
-- Source: supabase/migrations/202609250003_dispatch_withdraw_resume.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;

-- Rider RPCs never needed the public browser key (they 403 without a rider
-- session anyway); lock them to signed-in callers like accept/reject.
-- Conditional: pickup/deliver/failed-attempt ship in earlier migrations that
-- a partial database (or the isolated SQL test) may not have applied yet.
-- ps_rider_deliver is locked in 202609250005 right after its rewrite.

do $$ begin
  if to_regprocedure('public.ps_rider_pickup(uuid)') is not null then
    revoke all on function ps_rider_pickup(uuid) from public, anon;
    grant execute on function ps_rider_pickup(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('public.ps_rider_failed_attempt(uuid, text)') is not null then
    revoke all on function ps_rider_failed_attempt(uuid, text) from public, anon;
    grant execute on function ps_rider_failed_attempt(uuid, text) to authenticated, service_role;
  end if;
end $$;

revoke all on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  from public, anon;

grant execute on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  to authenticated, service_role;

revoke all on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  to service_role;

revoke all on function ps_cancel_assignment(uuid) from public, anon;

grant execute on function ps_cancel_assignment(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
