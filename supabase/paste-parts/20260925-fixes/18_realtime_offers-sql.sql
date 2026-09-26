-- PASTE 18/24 · 18_realtime_offers-sql.sql
-- Source: supabase/migrations/202609250007_realtime_offers.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;


do $$ begin
  -- The publication exists on Supabase; a bare local PostgreSQL used for
  -- the workflow test creates it in the test setup.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'delivery_assignments'
     ) then
    alter publication supabase_realtime add table delivery_assignments;
  end if;
end $$;

commit;
