-- PASTE 5/11 · file 03_step19_wallet-payment-columns.sql
-- go-live step 19 — 202609140004_wallet_payments.sql
-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.
--
-- Lines 20–32: orders.payment widened to cod|bkash|nagad
-- + payment_ref / payment_status / payment_verified_at.
-- That fileʼs three functions are SKIPPED ON PURPOSE: its ps_place_order is
-- superseded by step 30 (part 05–09), and its ps_advance_order / ps_verify_payment
-- are superseded by 202609140007_wallet_cancel_payment_settle.sql (171 lines —
-- paste that whole file normally, it is go-live step 22).

begin;

-- 1. orders: payment method + wallet verification state.
--    (constraint name from the base schema: check on the payment column)
alter table orders drop constraint if exists orders_payment_check;
alter table orders alter column payment drop not null;
alter table orders add column if not exists payment_ref text;
alter table orders add column if not exists payment_status text not null default 'verified'
  check (payment_status in ('pending_verification', 'verified', 'rejected'));
alter table orders add column if not exists payment_verified_at timestamptz;
alter table orders alter column payment set not null;
alter table orders add constraint orders_payment_check
  check (payment in ('cod', 'bkash', 'nagad'));
create index if not exists idx_orders_payment_status on orders (payment_status)
  where payment_status = 'pending_verification';

commit;

