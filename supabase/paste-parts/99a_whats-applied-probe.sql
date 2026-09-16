-- PROBE A — which go-live migrations are applied? READ-ONLY, changes nothing.
-- One row per signature object, with the verdict for its step:
--
--   APPLIED      every signature object of that step exists
--   PARTIAL      some exist — the rows after the verdict show which are missing
--   NOT APPLIED  none exist — that migration still has to be run
--   nothing to check   the step only redefines functions or seeds data, and
--                      PROBE B covers those
--
-- Objects are credited to the FIRST step that creates them, so step 22
-- redefining ps_advance_order does not make step 19 look applied. Up to
-- 6 signature objects per step are sampled, behaviour-bearing kinds first
-- (table, function, view, trigger, column, policy, index).
-- Nothing here writes. Run it any time, as often as you like.

with objects (step, name, kind, obj) as (
  values
    (1, '01 schema', 'table', 'admin_users'),
    (1, '01 schema', 'table', 'categories'),
    (1, '01 schema', 'table', 'coupons'),
    (1, '01 schema', 'table', 'delivery_zones'),
    (1, '01 schema', 'table', 'homepage_sections'),
    (1, '01 schema', 'table', 'notifications'),
    (2, '02 202609080001_storefront_saved_it', 'table', 'storefront_saved_items'),
    (2, '02 202609080001_storefront_saved_it', 'policy', 'storefront_saved_items.saved items owner delete'),
    (2, '02 202609080001_storefront_saved_it', 'policy', 'storefront_saved_items.saved items owner insert'),
    (2, '02 202609080001_storefront_saved_it', 'policy', 'storefront_saved_items.saved items owner read'),
    (3, '03 202609080002_order_guards', 'function', 'ps_check_order_insert'),
    (3, '03 202609080002_order_guards', 'function', 'ps_check_order_totals'),
    (3, '03 202609080002_order_guards', 'function', 'ps_use_coupon'),
    (3, '03 202609080002_order_guards', 'trigger', 'trg_orders_check_insert'),
    (3, '03 202609080002_order_guards', 'trigger', 'trg_orders_check_totals'),
    (4, '04 202609080003_place_order_rpc', 'function', 'ps_place_order'),
    (4, '04 202609080003_place_order_rpc', 'function', 'ps_release_on_cancel'),
    (4, '04 202609080003_place_order_rpc', 'function', 'ps_setting_int'),
    (4, '04 202609080003_place_order_rpc', 'trigger', 'trg_orders_release_on_cancel'),
    (5, '05 202609090004_marketplace_shops', 'table', 'shop_ledger'),
    (5, '05 202609090004_marketplace_shops', 'table', 'shop_payouts'),
    (5, '05 202609090004_marketplace_shops', 'table', 'shops'),
    (5, '05 202609090004_marketplace_shops', 'table', 'vendor_users'),
    (5, '05 202609090004_marketplace_shops', 'function', 'ps_guard_payout_balance'),
    (5, '05 202609090004_marketplace_shops', 'function', 'ps_guard_shop_vendor_update'),
    (6, '06 202609090005_riders', 'table', 'delivery_assignments'),
    (6, '06 202609090005_riders', 'table', 'rider_settlements'),
    (6, '06 202609090005_riders', 'table', 'riders'),
    (6, '06 202609090005_riders', 'function', 'ps_guard_rider_self_update'),
    (6, '06 202609090005_riders', 'function', 'ps_rider_id'),
    (6, '06 202609090005_riders', 'trigger', 'trg_riders_guard_self_update'),
    (7, '07 202609090006_engagement', 'table', 'contact_messages'),
    (7, '07 202609090006_engagement', 'table', 'media_library'),
    (7, '07 202609090006_engagement', 'table', 'newsletter_subscribers'),
    (7, '07 202609090006_engagement', 'policy', 'contact_messages.admin all contact'),
    (7, '07 202609090006_engagement', 'policy', 'media_library.admin all media library'),
    (7, '07 202609090006_engagement', 'policy', 'newsletter_subscribers.admin all newsletter'),
    (8, '08 202609090007_rider_dispatch', 'function', 'ps_rider_accept'),
    (8, '08 202609090007_rider_dispatch', 'function', 'ps_rider_deliver'),
    (8, '08 202609090007_rider_dispatch', 'function', 'ps_rider_pickup'),
    (8, '08 202609090007_rider_dispatch', 'function', 'ps_rider_settle'),
    (8, '08 202609090007_rider_dispatch', 'function', 'ps_set_order_delivery_code'),
    (8, '08 202609090007_rider_dispatch', 'trigger', 'trg_orders_set_delivery_code'),
    (9, '09 202609090008_dispatch_auto', 'function', 'ps_admin_settle_rider'),
    (9, '09 202609090008_dispatch_auto', 'function', 'ps_auto_dispatch_ready_order'),
    (9, '09 202609090008_dispatch_auto', 'function', 'ps_cancel_assignment'),
    (9, '09 202609090008_dispatch_auto', 'function', 'ps_expire_stale_offers'),
    (9, '09 202609090008_dispatch_auto', 'function', 'ps_next_eligible_rider'),
    (9, '09 202609090008_dispatch_auto', 'function', 'ps_offer_order'),
    (10, '10 202609100003_per_user_first10_fr', 'column', 'orders.delivery_window'),
    (10, '10 202609100003_per_user_first10_fr', 'column', 'orders.distance_km'),
    (10, '10 202609100003_per_user_first10_fr', 'column', 'orders.is_express'),
    (10, '10 202609100003_per_user_first10_fr', 'column', 'orders.is_pickup'),
    (10, '10 202609100003_per_user_first10_fr', 'column', 'orders.lat'),
    (10, '10 202609100003_per_user_first10_fr', 'column', 'orders.lng'),
    (11, '11 202609110004_customer_accounts', 'table', 'customer_sessions'),
    (11, '11 202609110004_customer_accounts', 'table', 'customers'),
    (11, '11 202609110004_customer_accounts', 'function', 'ps_purge_customer_sessions'),
    (11, '11 202609110004_customer_accounts', 'index', 'idx_customer_sessions_customer'),
    (11, '11 202609110004_customer_accounts', 'index', 'idx_customer_sessions_expires'),
    (12, '12 202609110005_launch_offer_free (redefines ps_place_orde', null, null),
    (13, '13 202609110006_media_video', 'column', 'media_library.media_type'),
    (14, '14 202609120007_flat_delivery (redefines ps_place_order, p', null, null),
    (15, '15 202609130008_growth_promos_gift_', 'table', 'price_watches'),
    (15, '15 202609130008_growth_promos_gift_', 'table', 'referral_codes'),
    (15, '15 202609130008_growth_promos_gift_', 'table', 'referral_rewards'),
    (15, '15 202609130008_growth_promos_gift_', 'function', 'ps_credit_referrer'),
    (15, '15 202609130008_growth_promos_gift_', 'column', 'orders.gift_fee'),
    (15, '15 202609130008_growth_promos_gift_', 'column', 'orders.gift_message'),
    (16, '16 202609140001_review_photos', 'table', 'review_photos'),
    (16, '16 202609140001_review_photos', 'policy', 'review_photos.admin all review photos'),
    (16, '16 202609140001_review_photos', 'policy', 'review_photos.review photos public read'),
    (16, '16 202609140001_review_photos', 'index', 'idx_review_photos_review'),
    (17, '17 202609140002_return_pickups', 'function', 'ps_create_return_request'),
    (17, '17 202609140002_return_pickups', 'function', 'ps_return_action'),
    (17, '17 202609140002_return_pickups', 'function', 'ps_return_eligible'),
    (17, '17 202609140002_return_pickups', 'function', 'ps_return_leg_sync'),
    (17, '17 202609140002_return_pickups', 'trigger', 'trg_return_leg_sync'),
    (18, '18 202609140003_warranty_claims', 'table', 'warranty_claims'),
    (18, '18 202609140003_warranty_claims', 'function', 'ps_warranty_eligible'),
    (18, '18 202609140003_warranty_claims', 'column', 'products.warranty_days'),
    (18, '18 202609140003_warranty_claims', 'policy', 'warranty_claims.admin all warranty claims'),
    (18, '18 202609140003_warranty_claims', 'index', 'idx_warranty_claims_order'),
    (18, '18 202609140003_warranty_claims', 'index', 'idx_warranty_claims_product'),
    (19, '19 202609140004_wallet_payments', 'function', 'ps_verify_payment'),
    (19, '19 202609140004_wallet_payments', 'column', 'orders.payment_ref'),
    (19, '19 202609140004_wallet_payments', 'column', 'orders.payment_status'),
    (19, '19 202609140004_wallet_payments', 'column', 'orders.payment_verified_at'),
    (19, '19 202609140004_wallet_payments', 'index', 'idx_orders_payment_status'),
    (20, '20 202609140005_live_shopping', 'table', 'live_session_products'),
    (20, '20 202609140005_live_shopping', 'table', 'live_sessions'),
    (20, '20 202609140005_live_shopping', 'trigger', 'trg_live_sessions_touch'),
    (21, '21 202609140006_wallet_delivery_cas (redefines ps_rider_de', null, null),
    (22, '22 202609140007_wallet_cancel_payme (redefines ps_advance_', null, null),
    (23, '23 202609140008_return_order_restor (redefines ps_place_or', null, null),
    (24, '24 202609140009_product_sales_view', 'view', 'v_product_sales'),
    (25, '25 202609140010_stock_watches', 'table', 'stock_watches'),
    (25, '25 202609140010_stock_watches', 'policy', 'stock_watches.admin all stock watches'),
    (25, '25 202609140010_stock_watches', 'policy', 'stock_watches.stock watch public insert'),
    (25, '25 202609140010_stock_watches', 'index', 'idx_stock_watches_product'),
    (26, '26 202609140011_shop_rating_trigger', 'function', 'ps_reviews_shop_rating'),
    (26, '26 202609140011_shop_rating_trigger', 'function', 'ps_shop_rating_recompute'),
    (26, '26 202609140011_shop_rating_trigger', 'trigger', 'trg_reviews_shop_rating'),
    (27, '27 202609140012_fabric_transparency', 'column', 'products.fabric_gsm'),
    (27, '27 202609140012_fabric_transparency', 'column', 'products.manufacturer'),
    (27, '27 202609140012_fabric_transparency', 'column', 'products.quality_checked'),
    (27, '27 202609140012_fabric_transparency', 'column', 'products.test_report_url'),
    (28, '28 202609140013_campaign_early_acce', 'column', 'newsletter_subscribers.campaign'),
    (29, '29 202609140014_rider_availability', 'function', 'ps_rider_on_shift'),
    (29, '29 202609140014_rider_availability', 'column', 'riders.avail_days'),
    (29, '29 202609140014_rider_availability', 'column', 'riders.avail_from_hour'),
    (29, '29 202609140014_rider_availability', 'column', 'riders.avail_to_hour'),
    (30, '30 202609140015_plus_membership', 'table', 'memberships'),
    (30, '30 202609140015_plus_membership', 'column', 'orders.is_plus'),
    (30, '30 202609140015_plus_membership', 'policy', 'memberships.admin all memberships'),
    (30, '30 202609140015_plus_membership', 'index', 'idx_memberships_phone'),
    (30, '30 202609140015_plus_membership', 'index', 'idx_memberships_status'),
    (30, '30 202609140015_plus_membership', 'index', 'memberships_pending_uq'),
    (31, '31 202609160001_checkout_delivery_p', null, null),
    (32, '32 202609160002_order_insert_repair', 'function', 'ps_checkout_health')
),
checked as (
  select o.step, o.name, o.kind, o.obj,
         case
           when o.kind is null then null
           when o.kind = 'table' then exists (
             select 1 from information_schema.tables t
             where t.table_schema = 'public' and t.table_name = o.obj)
           when o.kind = 'view' then exists (
             select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = o.obj and c.relkind in ('v', 'm'))
           when o.kind = 'function' then exists (
             select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace
             where n.nspname = 'public' and f.proname = o.obj)
           when o.kind = 'column' then exists (
             select 1 from information_schema.columns c
             where c.table_schema = 'public'
               and c.table_name = split_part(o.obj, '.', 1)
               and c.column_name = split_part(o.obj, '.', 2))
           when o.kind = 'index' then exists (
             select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = o.obj)
           when o.kind = 'policy' then exists (
             select 1 from pg_policies g where g.schemaname = 'public'
               and g.tablename = split_part(o.obj, '.', 1)
               and g.policyname = split_part(o.obj, '.', 2))
           when o.kind = 'trigger' then exists (
             select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
               join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and t.tgname = o.obj and not t.tgisinternal)
           else null
         end as present
  from objects o
)
select step, name,
       case
         when count(obj) = 0 then 'nothing to check'
         when count(obj) = count(obj) filter (where present) then 'APPLIED'
         when count(obj) filter (where present) = 0 then 'NOT APPLIED'
         else 'PARTIAL'
       end                                    as step_verdict,
       count(obj)                             as objects_checked,
       count(obj) filter (where present)      as present_count,
       kind, obj, present                     as this_object
from checked
group by grouping sets ((step, name), (step, name, kind, obj, present))
order by step, (kind is null) desc, present nulls first, kind, obj;
