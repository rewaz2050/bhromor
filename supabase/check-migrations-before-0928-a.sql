-- ============================================================================
-- PROSANTI — kun migration chalano BAKI? (part 1/2: schema + 202609080001..202609140015, 0928-er age-r migration)
--
-- Supabase -> SQL Editor -> New query -> eta paste kore Run. Shudhu poRe, kichu bodlay na.
--
-- Shudhu je file-gulo chalate hobe (XX / ADHEK) shegulo-i dekhabe.
--   Kono row na ashle (0 rows) = shob migration chalano ache.
--   status "XX  CHALAO (missing)"          -> file-ta chalate hobe
--   status "ADHEK (kichu missing)"         -> file-ta abar chalan (nirapod)
--   ki_nai column -> kon object nai
-- Row-gulo file-er nam-er order-e (UPOR theke NICHE) chalan. "supabase/schema.sql"
-- shobar age (base schema).
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
  ('27',  'P1 wallet cash: wallet-aware deliver', '202609140006_wallet_delivery_cash.sql',        'function_src', 'ps_rider_deliver|paid via bKash at checkout'),
  ('28',  'P1 wallet cash: cancel settles payment', '202609140007_wallet_cancel_payment_settle.sql', 'function_src', 'ps_advance_order|v_payment_rejected'),
  ('28b', 'P1 wallet cash: verify refuses cancelled', '202609140007_wallet_cancel_payment_settle.sql', 'function_src', 'ps_verify_payment|order already cancelled'),
  ('29',  'P1 returns: zero-charge return orders restored', '202609140008_return_order_restore.sql', 'function_src', 'ps_place_order|return_parent_id required'),
  ('30',  'P2 best sellers: real sales view', '202609140009_product_sales_view.sql', 'view', 'v_product_sales'),
  ('31',  'P2 restock alerts: stock watches', '202609140010_stock_watches.sql', 'table', 'stock_watches'),
  ('32',  'P2 shop ratings: rating recompute', '202609140011_shop_rating_trigger.sql', 'function', 'ps_shop_rating_recompute')
),
res as (
  select source_file as file, label,
    case kind
         when 'table' then exists (
           select 1 from information_schema.tables t
           where t.table_schema = 'public' and t.table_name = obj
         )
         when 'view' then exists (
           select 1 from information_schema.views v
           where v.table_schema = 'public' and v.table_name = obj
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
         -- function_locked: true when the function is absent (nothing to
         -- lock) OR present and NOT executable by anon. false = the public
         -- browser key can still call a service-only RPC (2026-09-16 audit).
         when 'function_locked' then coalesce(
           not has_function_privilege('anon', to_regprocedure('public.' || obj), 'execute'),
           true)
         -- function_src_absent: obj = 'name|marker' — true when the function
         -- is absent OR its body no longer contains the marker (a rewrite
         -- removed a bad dependency, 2026-09-16 dispatch repair).
         when 'function_src_absent' then not exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = split_part(obj, '|', 1)
             and p.prosrc ilike '%' || split_part(obj, '|', 2) || '%'
         )
         -- constraint_absent: obj = 'table.constraint' — true when the table
         -- is absent OR the named constraint is gone.
         when 'constraint_absent' then not exists (
           select 1 from pg_constraint k
           where k.conrelid = to_regclass('public.' || split_part(obj, '.', 1))
             and k.conname = split_part(obj, '.', 2)
         )
         -- index: obj = 'table.index'
         when 'index' then exists (
           select 1 from pg_indexes i
           where i.schemaname = 'public'
             and i.tablename = split_part(obj, '.', 1)
             and i.indexname = split_part(obj, '.', 2)
         )
         -- table_rls: true when the table is absent OR has RLS enabled.
         when 'table_rls' then coalesce((
           select c.relrowsecurity from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relname = obj
         ), true)
         -- publication: obj = 'pubname.tablename' — true when the table is
         -- a member (Realtime only streams published tables).
         when 'publication' then exists (
           select 1 from pg_publication_tables
           where pubname = split_part(obj, '.', 1)
             and schemaname = 'public'
             and tablename = split_part(obj, '.', 2)
         )
         when 'column' then exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public'
             and c.table_name = split_part(obj, '.', 1)
             and c.column_name = split_part(obj, '.', 2)
         )
         -- column_nullable: true when the column is absent (older schema, the
         -- RPC never writes it) OR present and nullable. false = the 2026-09-16
         -- outage: NOT NULL gift_wrap refuses every non-gift order INSERT.
         when 'column_nullable' then coalesce((
           select c.is_nullable = 'YES'
           from information_schema.columns c
           where c.table_schema = 'public'
             and c.table_name = split_part(obj, '.', 1)
             and c.column_name = split_part(obj, '.', 2)
         ), true)
       end as present
  from checklist
)
select file as migration,
       case when bool_or(present) then 'ADHEK (kichu missing) - abar chalao'
            else 'XX  CHALAO (missing)' end as status,
       count(*) filter (where present)     as ache,
       count(*) filter (where not present) as nai,
       coalesce(string_agg(label, ' | ') filter (where not present), '') as ki_nai
from res
group by file
having not bool_and(present)
order by (file like 'supabase/%') desc, file;
