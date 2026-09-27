-- ============================================================================
-- VERIFY the 2026-09-26/27 migration round (read-only — changes nothing)
--
-- Paste the whole file into the Supabase SQL Editor and Run. One row per
-- artefact the eight files create, OK / MISSING, and a SUMMARY row at the
-- bottom. Everything MISSING names the file to run (docs/go-live.md step 1):
--
--   202609260001_password_reset_requests.sql
--   202609260002_application_review.sql
--   202609260003_free_delivery.sql          (patches ps_place_order in place)
--   202609260004_storefront_events.sql
--   202609270001_push_broadcasts.sql
--   202609270002_shop_cover.sql
--   202609270003_bag_snapshots.sql          (after 202609270001)
--   202609270004_review_stamps.sql
--
-- The same answer is on the site: /api/health (signed in as staff) reports
-- passwordResetReady … reviewStampsReady and lists the missing files under
-- nextSteps.
-- ============================================================================

with col as (
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
),
fn as (
  select p.proname, p.prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
checks(step, item, ok) as (
  values
  -- 202609260001 — forgot-password requests (admin-approved, no e-mail)
  ('202609260001_password_reset_requests', 'table password_reset_requests',
     to_regclass('public.password_reset_requests') is not null),

  -- 202609260002 — application review (approve / reject with reason) + rider KYC
  ('202609260002_application_review', 'shops.review_note',
     exists (select 1 from col where table_name = 'shops' and column_name = 'review_note')),
  ('202609260002_application_review', 'riders.kyc',
     exists (select 1 from col where table_name = 'riders' and column_name = 'kyc')),
  ('202609260002_application_review', 'shops.status allows ''rejected''',
     exists (select 1 from pg_constraint k
             where k.conrelid = 'public.shops'::regclass
               and k.conname = 'shops_status_check'
               and pg_get_constraintdef(k.oid) like '%rejected%')),

  -- 202609260003 — free delivery threshold (platform rule + per-shop opt-in)
  ('202609260003_free_delivery', 'shops.free_delivery_min',
     exists (select 1 from col where table_name = 'shops' and column_name = 'free_delivery_min')),
  ('202609260003_free_delivery', 'orders.free_delivery_by',
     exists (select 1 from col where table_name = 'orders' and column_name = 'free_delivery_by')),
  ('202609260003_free_delivery', 'orders.free_delivery_waived',
     exists (select 1 from col where table_name = 'orders' and column_name = 'free_delivery_waived')),
  ('202609260003_free_delivery', 'ps_place_order prices the threshold (v_fd_by)',
     exists (select 1 from fn where proname = 'ps_place_order' and prosrc like '%v_fd_by%')),
  ('202609260003_free_delivery', 'ps_place_order writes free_delivery_by on the order',
     exists (select 1 from fn where proname = 'ps_place_order'
             and prosrc like '%is_plus, free_delivery_by, free_delivery_waived,%'
             and prosrc like '%v_plus, v_fd_by, v_fd_waived,%')),
  ('202609260003_free_delivery', 'ps_write_shop_ledger deducts a shop-funded waiver',
     exists (select 1 from fn where proname = 'ps_write_shop_ledger' and prosrc like '%free_delivery_waived%')),
  ('202609260003_free_delivery', 'trigger trg_orders_ledger_on_delivered',
     exists (select 1 from pg_trigger t
             where t.tgrelid = 'public.orders'::regclass
               and t.tgname = 'trg_orders_ledger_on_delivered'
               and not t.tgisinternal)),

  -- 202609260004 — first-party funnel events (Admin → Reports)
  ('202609260004_storefront_events', 'table storefront_events',
     to_regclass('public.storefront_events') is not null),

  -- 202609270001 — weekly drops & offers push broadcast
  ('202609270001_push_broadcasts', 'table push_broadcasts',
     to_regclass('public.push_broadcasts') is not null),
  ('202609270001_push_broadcasts', 'customer_push_subscriptions.marketing',
     exists (select 1 from col where table_name = 'customer_push_subscriptions' and column_name = 'marketing')),

  -- 202609270002 — shop cover image
  ('202609270002_shop_cover', 'shops.cover_url',
     exists (select 1 from col where table_name = 'shops' and column_name = 'cover_url')),

  -- 202609270003 — abandoned-bag snapshots + reminder
  ('202609270003_bag_snapshots', 'table bag_snapshots',
     to_regclass('public.bag_snapshots') is not null),

  -- 202609270004 — verified reviews → smart-card stamps
  ('202609270004_review_stamps', 'table stamp_ledger',
     to_regclass('public.stamp_ledger') is not null),
  ('202609270004_review_stamps', 'reviews.order_ref',
     exists (select 1 from col where table_name = 'reviews' and column_name = 'order_ref')),
  ('202609270004_review_stamps', 'reviews.customer_phone',
     exists (select 1 from col where table_name = 'reviews' and column_name = 'customer_phone'))
),
rows_ as (
  select step, item, case when ok then 'OK' else 'MISSING' end as state, 0 as sort_last
  from checks
  union all
  select 'SUMMARY',
         case
           when bool_and(ok) then 'ALL 8 MIGRATIONS APPLIED — nothing left to run'
           else (count(*) filter (where not ok))::text || ' item(s) MISSING — run the file(s) named above, in order'
         end,
         case when bool_and(ok) then 'OK' else 'MISSING' end,
         1
  from checks
)
select step, item, state
from rows_
order by sort_last, step, item;
