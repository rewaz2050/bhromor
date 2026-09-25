-- PASTE 23/24 · 23_realtime_offers-sql.sql
-- Source: supabase/migrations/202609250007_realtime_offers.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;


revoke all on function ps_checkout_health() from public, anon, authenticated;

grant execute on function ps_checkout_health() to service_role;

commit;
