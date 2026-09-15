-- PASTE 2/11 · file 00b_only-if-return-columns-missing.sql
-- OPTIONAL — ONLY if the pre-flight listed orders.is_return / return_status
-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.
--
-- Source: 202609090017_delivery_remaining.sql lines 5–9
-- (that file is 350 lines, this is the only piece the FINAL function needs from
-- it — its own ps_place_order is superseded). If the pre-flight said NOTHING
-- MISSING, SKIP this part.

begin;

alter table orders add column if not exists is_return boolean not null default false;
alter table orders add column if not exists return_reason text;
alter table orders add column if not exists return_parent_id uuid references orders(id);
alter table orders add column if not exists return_status text check (return_status in ('requested','approved','picked_up','refunded','rejected')) default null;
alter table orders add column if not exists return_pickup_at timestamptz;

commit;

