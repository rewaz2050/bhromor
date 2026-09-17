-- ============================================================================
-- 202609170002_perf_indexes.sql
-- Audit 2026-09-17 P1.5 — composite indexes for the hot order/dispatch reads.
--
-- Every list the staff, rider and vendor screens poll today is served by a
-- single-column index followed by a sort or a second filter in memory:
--
--   orders                (status)             → admin list filters by status
--                                                 AND orders by created_at desc
--   delivery_assignments  (rider_id)           → rider board filters by rider
--                                                 AND state
--   orders                (shop_id)            → vendor list filters by shop
--                                                 AND orders by created_at desc
--   orders.rider_id       (no index at all)    → rider "my deliveries" scan
--
-- With a few hundred orders the difference is milliseconds; at a few tens of
-- thousands it is the difference between an index range scan and a sort of
-- the whole status bucket on every poll. Cheap to add now, painful later.
--
-- SAFE TO RE-RUN: every statement is `create index if not exists`. No table
-- rewrite, no lock beyond a normal `create index` (small tables — seconds).
-- ============================================================================

-- Admin → Orders: `where status = $1 order by created_at desc, id desc`
-- (keyset pagination, see listOrders).
create index if not exists idx_orders_status_created
  on orders (status, created_at desc, id desc);

-- Vendor → Orders: `where shop_id = $1 order by created_at desc limit 100`.
create index if not exists idx_orders_shop_created
  on orders (shop_id, created_at desc);

-- Rider → my deliveries / tracking: `where rider_id = $1`. Most orders never
-- have a rider, so a partial index stays tiny.
create index if not exists idx_orders_rider
  on orders (rider_id)
  where rider_id is not null;

-- Rider board: `where rider_id = $1 and state in (…) order by offered_at desc`.
create index if not exists idx_assignments_rider_state
  on delivery_assignments (rider_id, state, offered_at desc);

-- Dispatch board "awaiting" filter: `where state in ('offered','accepted',
-- 'picked_up')` → the live rows only (a partial index over the unique-offer
-- predicate, so it stays as small as the active board).
create index if not exists idx_assignments_live_state
  on delivery_assignments (state, order_id)
  where state in ('offered', 'accepted', 'picked_up');

-- Return/exchange pickups link to their parent; toDomainMany reads
-- `where return_parent_id in (…) order by created_at desc`.
create index if not exists idx_orders_return_parent
  on orders (return_parent_id, created_at desc)
  where return_parent_id is not null;

-- Referral first-order proof + rewards (P1.4 scoped reads).
create index if not exists idx_referral_rewards_referee
  on referral_rewards (referee_phone);

analyze orders;
analyze delivery_assignments;
analyze referral_rewards;

-- ----------------------------------------------------------------------------
-- VERIFY — expect 7 rows, every one "OK"
-- ----------------------------------------------------------------------------
select name,
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and indexname = name)
            then 'OK' else 'MISSING' end as result
from unnest(array[
  'idx_orders_status_created',
  'idx_orders_shop_created',
  'idx_orders_rider',
  'idx_assignments_rider_state',
  'idx_assignments_live_state',
  'idx_orders_return_parent',
  'idx_referral_rewards_referee'
]) as t(name)
order by name;
