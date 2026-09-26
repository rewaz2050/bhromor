-- PASTE 24/24 · 24_202609250008_delivery_ratings-sql.sql
-- Source: supabase/migrations/202609250008_delivery_ratings.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;


create table if not exists delivery_ratings (
  order_id   uuid primary key references orders (id) on delete cascade,
  rider_id   uuid not null references riders (id),
  stars      int  not null check (stars between 1 and 5),
  created_at timestamptz not null default now()
);


alter table delivery_ratings enable row level security;

commit;
