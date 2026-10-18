-- Phase 1B.2 (2026-10-18): checkout idempotency — double-tap guard (F-14)
-- Client generates a UUID per checkout open and sends it as `x-idempotency-key`.
-- Server stores it on the order and returns the existing order on duplicate
-- within the same idempotency window instead of placing a second order.
--
-- The column is nullable (old orders predate it) and the unique index is
-- partial — only rows with a key are constrained, so the migration is
-- additive and re-runnable with no data loss.

alter table orders add column if not exists idempotency_key text;

create unique index if not exists idx_orders_idempotency
  on orders (idempotency_key) where idempotency_key is not null;

comment on column orders.idempotency_key is 'F-14 (2026-10-18): client UUID for duplicate-submit guard — one key → one order';
