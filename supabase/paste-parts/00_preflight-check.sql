-- PASTE 1/11 · file 00_preflight-check.sql
-- PRE-FLIGHT (read-only — changes nothing)
-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.
--
-- The last paste swaps in the FINAL ps_place_order (from 202609140015_plus_membership.sql). It writes
-- orders columns that earlier migrations added, and plpgsql binds LATE: a missing
-- column would not fail the CREATE — it would fail every checkout afterwards.
-- So run this first: every row must say present = true (false rows sort to the
-- top). orders.is_return / return_status missing? → paste 00b too. Anything else
-- missing → apply that migration first (docs/go-live.md step list) or ask me to
-- split it the same way.

select 'table' as kind, x.name as object,
       exists (select 1 from information_schema.tables t
               where t.table_schema = 'public' and t.table_name = x.name) as present
from unnest(array['coupons', 'delivery_zones', 'memberships', 'order_items', 'order_status_history', 'orders', 'product_variants', 'products', 'referral_codes', 'referral_rewards', 'shops', 'site_settings']) as x(name)
union all
select 'orders column' as kind, x.name as object,
       exists (select 1 from information_schema.columns c
               where c.table_schema = 'public'
                 and c.table_name = 'orders' and c.column_name = x.name) as present
from unnest(array['shop_id', 'customer_name', 'customer_phone', 'area', 'address', 'note', 'zone_id', 'lat', 'lng', 'distance_km', 'scheduled_at', 'delivery_window', 'is_express', 'is_pickup', 'is_return', 'return_reason', 'return_parent_id', 'return_status', 'pickup_slot', 'tip_amount', 'weight_kg', 'surcharge_night', 'surcharge_rain', 'surcharge_distance', 'surcharge_express', 'surcharge_weight', 'is_gift', 'gift_wrap', 'gift_fee', 'gift_recipient_name', 'gift_recipient_phone', 'gift_message', 'promo_kind', 'promo_discount', 'referral_code', 'referral_credit', 'subtotal', 'delivery_charge', 'discount', 'coupon_id', 'total', 'is_plus', 'payment', 'payment_ref', 'payment_status', 'status']) as x(name)
order by present, kind, object;

