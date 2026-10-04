-- ============================================================================
-- PROSANTI — kun migration chalano hoyeche? (202609280001_shop_follows.sql theke shesh porjonto)
--
-- Supabase → SQL Editor → New query → eta paste kore Run.
-- Ekta file-er jonno ekta row. Shudhu REAdS — kichu bodlay na.
--
--   status = "OK  chalano ache"           → oi migration agei chalano hoyeche
--   status = "XX  CHALAO (missing)"       → ei file-ta chalate hobe
--
-- "chalao" lekha file-gulo UPOR theke NICHE (file-er nam-er order-e) chalan.
-- Ekta file-er ekadhik object check hoy; ekta-o na thakle "missing", kichu thakle
-- "ADHEK (kichu missing)" — oi file abar chalan (shob file abar chalano nirapod).
-- ============================================================================
with checks(file, label, kind, obj) as (values
  ('202609280001_shop_follows.sql', 'Shop follows', 'table', 'shop_follows'),
  ('202609280002_review_replies.sql', 'Vendor review replies', 'column', 'reviews.vendor_reply'),
  ('202609280003_vendor_promos.sql', 'Vendor promos (shop coupons)', 'column', 'coupons.shop_id'),
  ('202609280004_shop_funnel.sql', 'Shop funnel report', 'function', 'ps_shop_funnel_report'),
  ('202609280005_shop_verification.sql', 'Shop verification badge', 'column', 'shops.verified_at'),
  ('202609280006_shop_vacation.sql', 'Shop vacation', 'column', 'shops.vacation_start'),
  ('202609280007_vendor_staff.sql', 'Vendor staff logins', 'column', 'vendor_users.display_name'),
  ('202609280008_multi_shop_checkout.sql', 'Multi-shop checkout', 'function', 'ps_place_multi_order'),
  ('202609290001_commission_audit.sql', 'Commission audit trail', 'table', 'shop_commission_history'),
  ('202609290002_shop_scoped_slugs.sql', 'Shop-scoped product slugs', 'column', 'storefront_saved_items.product_id'),
  ('202609290003_vendor_product_categories.sql', 'Vendor product categories', 'table', 'shop_product_categories'),
  ('202609300001_rider_delivery_accounting.sql', 'Rider tip wallet + delivered_at stamp', 'column', 'riders.earnings_balance'),
  ('202609300002_rider_money.sql', 'Rider payout requests (one pending, wallet hold)', 'table', 'rider_payout_requests'),
  ('202609300002_rider_money.sql', 'Rider journal is signed + linked to payouts', 'column', 'rider_earnings.payout_id'),
  ('202609300002_rider_money.sql', 'Payout request RPC (rider files, money held)', 'function', 'ps_rider_request_payout'),
  ('202609300002_rider_money.sql', 'Payout decision RPC (staff paid/rejected)', 'function', 'ps_admin_decide_rider_payout'),
  ('202609300002_rider_money.sql', 'Admin money summary RPC', 'function', 'ps_admin_money_summary'),
  ('202609300002_rider_money.sql', 'Rider money statement RPC (own wallet)', 'function', 'ps_rider_money_summary'),
  ('202610010001_rider_fixes_phase_a.sql', 'Failed-delivery flag on orders', 'column', 'orders.delivery_failed_at'),
  ('202610010001_rider_fixes_phase_a.sql', 'Failed-attempt RPC (attempt cap, frees the rider)', 'function', 'ps_rider_failed_attempt'),
  ('202610010001_rider_fixes_phase_a.sql', 'Staff resolves a failed delivery (redispatch/cancel)', 'function', 'ps_admin_resolve_failed_delivery'),
  ('202610010001_rider_fixes_phase_a.sql', 'Staff releases an unresponsive rider', 'function', 'ps_admin_release_assignment'),
  ('202610010002_payment_verifier.sql', 'Per-shop payment verifier (platform/shop/both)', 'column', 'shops.payment_verifier'),
  ('202610010003_money_pnl.sql', 'Admin net P&L RPC (income - rider pay - discounts)', 'function', 'ps_admin_money_pnl'),
  ('202610010004_cod_netting.sql', 'Settle can net COD cash against the rider wallet', 'column', 'rider_settlements.netted_amount'),
  ('202610010005_vendor_rider_view.sql', 'Vendor can see the rider on its order', 'function', 'ps_vendor_order_rider'),
  ('202610010006_money_audit.sql', 'Money audit trail (who approved which payout/settle)', 'table', 'money_audit_log'),
  ('202610010007_money_daily.sql', 'Daily money reconciliation report', 'function', 'ps_admin_money_daily'),
  ('202610020001_rider_inbox.sql', 'Rider inbox (office announcements to riders)', 'table', 'rider_announcements'),
  ('202610020002_admin_rider_overview.sql', 'Admin rider profile (ledger, COD risk, performance)', 'function', 'ps_admin_rider_overview'),
  ('202610020003_dispatch_settings.sql', 'Dispatch rules settings (cash cap, offer window)', 'function', 'ps_rider_cash_cap'),
  ('202610020004_rider_push.sql', 'Rider web push (device table, offer claim)', 'table', 'rider_push_subscriptions'),
  ('202610020005_licence_expiry.sql', 'Rider licence expiry (date + online guard)', 'column', 'riders.licence_expires_on'),
  ('202610020006_rider_scorecards.sql', 'Rider scorecards (board + auto-suspend facts)', 'function', 'ps_admin_rider_scorecards'),
  ('202610020007_rider_disputes.sql', 'Rider disputes + wallet adjustments', 'table', 'rider_disputes'),
  ('202610020008_rate_limit.sql', 'Durable rate limit (shared counter)', 'function', 'ps_rate_limit_hit'),
  ('202610020009_delivery_feedback.sql', 'Delivery feedback (tags, comment, hide)', 'column', 'delivery_ratings.feedback_at'),
  ('202610020010_rider_incentives.sql', 'Rider incentives (daily target, referral)', 'function', 'ps_award_incentives'),
  ('202610020011_dispatch_followups.sql', 'Dispatch follow-ups (load limit, rider hand-back)', 'function', 'ps_rider_release_accepted'),
  ('202610020012_failed_fee_weekly_bonus.sql', 'Failed-delivery fee + weekly bonus', 'function', 'ps_failed_delivery_fee'),
  ('202610020013_shop_own_wallet.sql', 'Shop-own-wallet settlement', 'function', 'ps_shop_wallet_collected'),
  ('202610020014_shop_balance_totals.sql', 'Shop balance totals (SQL aggregate)', 'function', 'ps_shop_balance_totals'),
  ('202610020015_peak_rain_bonus.sql', 'Peak + rain order bonus', 'function', 'ps_award_order_bonuses'),
  ('202610020016_daily_shop_wallet_split.sql', 'Daily report: shop-wallet split', 'function_src', 'ps_admin_money_daily|shopWalletOrders'),
  ('202610020017_streak_bonus.sql', 'Weekly streak bonus', 'function_src', 'ps_award_order_bonuses|streak'),
  ('202610020018_vendor_push.sql', 'Vendor web push', 'table', 'vendor_push_subscriptions'),
  ('202610020019_gps_jump_flags.sql', 'GPS jump flags', 'table', 'rider_gps_flags'),
  ('202610020020_failed_delivery_proof.sql', 'Failed-delivery proof', 'table', 'delivery_failed_proofs')
),
res as (
  select file, label, obj,
    case kind
      when 'table' then exists (select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=obj)
      when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=obj)
      when 'function_src' then exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                       where n.nspname='public' and p.proname=split_part(obj,'|',1) and p.prosrc ilike '%'||split_part(obj,'|',2)||'%')
      when 'column' then exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=split_part(obj,'.',1) and c.column_name=split_part(obj,'.',2))
      else false
    end as present
  from checks
)
select file as migration,
       case when bool_and(present) then 'OK  chalano ache'
            when bool_or(present)  then 'ADHEK (kichu missing) - abar chalao'
            else 'XX  CHALAO (missing)' end as status,
       count(*) filter (where present)     as ache,
       count(*) filter (where not present) as nai,
       coalesce(string_agg(label, ' | ') filter (where not present), '') as ki_nai
from res
group by file
order by file;
