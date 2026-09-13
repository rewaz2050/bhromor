-- ============================================================================
-- PROSANTI — BACKEND DIAGNOSTIC
-- Run this in the Supabase SQL editor FIRST (before applying anything).
--
-- Every row shows whether that object exists in THIS database:
--   present = true  → that piece is already applied
--   present = false → that piece is MISSING (apply its file — see the
--                     "source file" column; order matters, docs/go-live.md)
--
-- If you see a mix of true/false, your database is PARTIALLY APPLIED:
-- apply only the missing files, in the order shown here (top to bottom).
-- If EVERYTHING is false, the project is fresh → paste
-- supabase/bootstrap-fresh.sql (one single paste, runs the whole chain).
-- ============================================================================

with checklist(step, label, source_file, kind, obj) as (values
  ('00',  'base: ps_order_flow / core tables',   'supabase/schema.sql',                          'table', 'ps_order_flow'),
  ('00b', 'base: products',                       'supabase/schema.sql',                          'table', 'products'),
  ('00c', 'base: orders',                         'supabase/schema.sql',                          'table', 'orders'),
  ('00d', 'base: site_settings',                  'supabase/schema.sql',                          'table', 'site_settings'),
  ('01',  'saved items',                          '202609080001_storefront_saved_items.sql',      'table', 'storefront_saved_items'),
  ('02',  'order guards',                         '202609080002_order_guards.sql',                'function', 'ps_check_order_totals'),
  ('03',  'place order v1 + ps_setting_int',      '202609080003_place_order_rpc.sql',             'function', 'ps_setting_int'),
  ('04',  'marketplace: shops',                   '202609090004_marketplace_shops.sql',           'table', 'shops'),
  ('04b', 'marketplace: orders.shop_id column',   '202609090004_marketplace_shops.sql',           'column', 'orders.shop_id'),
  ('05',  'riders',                               '202609090005_riders.sql',                      'table', 'riders'),
  ('06',  'engagement (contact/newsletter/media)','202609090006_engagement.sql',                  'table', 'contact_messages'),
  ('07',  'rider dispatch',                       '202609090007_rider_dispatch.sql',              'function', 'ps_rider_accept'),
  ('07b', 'delivery assignments',                 '202609090007_rider_dispatch.sql',              'table', 'delivery_assignments'),
  ('08',  'dispatch auto-offer',                  '202609090008_dispatch_auto.sql',               'function', 'ps_auto_dispatch_ready_order'),
  ('11',  'coupon zone/category scope',           '202609090011_coupon_enhancements.sql',         'column', 'coupons.zone_id'),
  ('12',  'geo + proof on orders',                '202609090012_geo_and_proof.sql',               'column', 'orders.lat'),
  ('13',  'delivery proof (cloudinary)',          '202609090013_delivery_proof_cloudinary.sql',   'function', 'ps_rider_failed_attempt'),
  ('14',  'rider geo (nearest rider)',            '202609090014_rider_geo_nearest.sql',           'column', 'riders.lat'),
  ('15',  'scheduled delivery',                   '202609090015_scheduled_delivery.sql',          'column', 'orders.scheduled_at'),
  ('16',  'store pickup + tips + weight',         '202609090016_tips_pickup_weight.sql',          'column', 'orders.is_pickup'),
  ('17',  'returns / delivery remaining',         '202609090017_delivery_remaining.sql',          'column', 'orders.is_return'),
  ('18',  'customer accounts (smart card)',       '202609110004_customer_accounts.sql',           'table', 'customers'),
  ('19',  'media video',                          '202609110006_media_video.sql',                 'column', 'media_library.media_type'),
  ('20',  'flat delivery ps_place_order',         '202609120007_flat_delivery.sql',               'function', 'ps_place_order'),
  ('21',  'P0 growth: price watches',             '202609130008_growth_promos_gift_referral.sql', 'table', 'price_watches'),
  ('21b', 'P0 growth: referral credit RPC',       '202609130008_growth_promos_gift_referral.sql', 'function', 'ps_credit_referrer'),
  ('21c', 'P0 growth: orders.promo_kind column',  '202609130008_growth_promos_gift_referral.sql', 'column', 'orders.promo_kind'),
  ('22',  'P1 UGC: review photos',                '202609140001_review_photos.sql',               'table', 'review_photos'),
  ('23',  'P1 returns: eligibility + request',    '202609140002_return_pickups.sql',              'function', 'ps_create_return_request'),
  ('23b', 'P1 returns: shop action RPC',          '202609140002_return_pickups.sql',              'function', 'ps_return_action'),
  ('24',  'P1 warranty: claims table',            '202609140003_warranty_claims.sql',             'table', 'warranty_claims'),
  ('24b', 'P1 warranty: products.warranty_days',  '202609140003_warranty_claims.sql',             'column', 'products.warranty_days'),
  ('24c', 'P1 warranty: eligibility RPC',         '202609140003_warranty_claims.sql',             'function', 'ps_warranty_eligible'),
  ('25',  'P1 payments: wallet columns',          '202609140004_wallet_payments.sql',             'column', 'orders.payment_status'),
  ('25b', 'P1 payments: verify RPC',              '202609140004_wallet_payments.sql',             'function', 'ps_verify_payment'),
  ('26',  'P1 live shopping: sessions table',     '202609140005_live_shopping.sql',               'table', 'live_sessions'),
  ('26b', 'P1 live shopping: session pieces',     '202609140005_live_shopping.sql',               'table', 'live_session_products'),
  ('27',  'P1 wallet cash: wallet-aware deliver', '202609140006_wallet_delivery_cash.sql',        'function_src', 'ps_rider_deliver|paid via bKash at checkout')
)
select step as ord,
       label,
       case when kind = 'column' then split_part(obj, '.', 1) || '.' || split_part(obj, '.', 2) else obj end as object,
       source_file,
       case kind
         when 'table' then exists (
           select 1 from information_schema.tables t
           where t.table_schema = 'public' and t.table_name = obj
         )
         when 'function' then exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = obj
         )
         -- function_src: obj = 'name|marker-in-body' — detects RE-created
         -- versions of a function (plain existence can't).
         when 'function_src' then exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = split_part(obj, '|', 1)
             and p.prosrc ilike '%' || split_part(obj, '|', 2) || '%'
         )
         when 'column' then exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public'
             and c.table_name = split_part(obj, '.', 1)
             and c.column_name = split_part(obj, '.', 2)
         )
       end as present
from checklist
order by ord, object;

-- ----------------------------------------------------------------------------
-- DATA CHECK — run this SECOND, only when the checklist above is all true.
-- (It reads rows, not objects; it will error on a fresh/empty database,
-- which is itself the answer: "no data yet → run npm run seed").
-- ----------------------------------------------------------------------------
select
  (select count(*) from categories)                                   as categories,
  (select count(*) from products where status = 'published')          as published_products,
  (select count(*) from delivery_zones where active)                  as active_zones,
  (select count(*) from coupons where active)                         as active_coupons,
  (select count(*) from shops where status = 'active')                as active_shops,
  (select count(*) from delivery_zones where id in ('z1','z2','z3','z4')) as sunamganj_zones,
  (select count(*) from site_settings where key in ('homepage','ops')) as site_settings_rows,
  (select count(*) from customers)                                    as customers;
