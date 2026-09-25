-- PASTE 10/23 · 10_settle_claims-sql.sql
-- Source: supabase/migrations/202609250004_settle_claims.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;

grant execute on function ps_admin_settle_rider(uuid, text, text) to authenticated, service_role;

revoke all on function ps_admin_reject_settle(uuid, text) from public, anon;

grant execute on function ps_admin_reject_settle(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
