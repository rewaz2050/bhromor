-- PASTE 17/24 · 17_dispatch_health-sql.sql
-- Source: supabase/migrations/202609250006_dispatch_health.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;


revoke all on function ps_checkout_health() from public, anon, authenticated;

grant execute on function ps_checkout_health() to service_role;

commit;
