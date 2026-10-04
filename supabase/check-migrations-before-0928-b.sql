-- ============================================================================
-- PROSANTI — kun migration chalano BAKI? (part 2/2: 202609160001..202609270004, 0928-er age-r migration)
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
  ('33',  'CHECKOUT REPAIR: orders.gift_wrap accepts NULL',      '202609160002_order_insert_repair.sql', 'column_nullable', 'orders.gift_wrap'),
  ('33b', 'CHECKOUT REPAIR: totals guard counts tip + gift fee', '202609160002_order_insert_repair.sql', 'function_src', 'ps_check_order_totals|gift_fee'),
  ('33c', 'CHECKOUT REPAIR: insert guard allows bkash/nagad',    '202609160002_order_insert_repair.sql', 'function_src', 'ps_check_order_insert|bkash'),
  ('33d', 'CHECKOUT REPAIR: /api/health probe',                  '202609160002_order_insert_repair.sql', 'function', 'ps_checkout_health'),
  ('34',  'ORDER FLOW REPAIR: ledger trigger compares the enum safely (Confirm/Cancel work)', '202609160003_order_status_update_repair.sql', 'function_src', 'ps_write_shop_ledger|old.status is distinct from new.status'),
  ('34b', 'ORDER FLOW REPAIR: ps_verify_payment returns the row (bKash verify works)',       '202609160003_order_status_update_repair.sql', 'function_src', 'ps_verify_payment|select * into v_order from orders where id = p_order_id;'),
  ('34c', 'ORDER FLOW REPAIR: riders guard lets RPCs/triggers write (rider Delivered works)', '202609160003_order_status_update_repair.sql', 'function_src', 'ps_guard_rider_self_update|current_user not in'),
  ('34d', 'ORDER FLOW REPAIR: /api/health probe knows all three',                            '202609160003_order_status_update_repair.sql', 'function_src', 'ps_checkout_health|rider_guard_ok'),
  ('35',  'SECURITY: anon key cannot call ps_place_order (service-only RPCs revoked)', '202609160004_rpc_grants_rls_repair.sql', 'function_locked', 'ps_place_order(jsonb,jsonb)'),
  ('35b', 'SECURITY: memberships has row level security',                              '202609160004_rpc_grants_rls_repair.sql', 'table_rls', 'memberships'),
  ('35c', 'SECURITY: /api/health probe knows the lock',                                '202609160004_rpc_grants_rls_repair.sql', 'function_src', 'ps_checkout_health|rpc_grants_locked'),
  ('36',  'DISPATCH REPAIR: offers can be re-issued (no UNIQUE order_id on delivery_assignments)', '202609160005_dispatch_reoffer_repair.sql', 'constraint_absent', 'delivery_assignments.delivery_assignments_order_id_key'),
  ('36b', 'DISPATCH REPAIR: one live offer per order (partial unique index)',                    '202609160005_dispatch_reoffer_repair.sql', 'index', 'delivery_assignments.delivery_assignments_one_live_offer'),
  ('36c', 'DISPATCH REPAIR: batch assign has no phantom dependencies',                            '202609160005_dispatch_reoffer_repair.sql', 'function_src_absent', 'ps_assign_batch_to_rider|rider_assignments'),
  ('36d', 'DISPATCH REPAIR: /api/health probe knows it',                                          '202609160005_dispatch_reoffer_repair.sql', 'function_src', 'ps_checkout_health|dispatch_reoffer_ok'),
  ('37',  'P0: withdraw cools down, manual expiry resumes the area at once', '202609250003_dispatch_withdraw_resume.sql', 'function_src', 'ps_cancel_assignment|withdrawn — cooling down'),
  ('37b', 'P0: expiry sweep is throttled (force flag, one run per 10s)',      '202609250003_dispatch_withdraw_resume.sql', 'function_src', 'ps_expire_stale_offers|dispatch_sweep_state'),
  ('37c', 'P0: settle claims table (rider self-settle needs approval)',       '202609250004_settle_claims.sql', 'table', 'rider_settle_claims'),
  ('37d', 'P0: ps_rider_settle files a claim instead of zeroing cash',        '202609250004_settle_claims.sql', 'function_src', 'ps_rider_settle|settle already pending'),
  ('37e', 'P0: PIN attempt counter RPC (wrong codes persist)',                '202609250005_delivery_pin_lockout.sql', 'function', 'ps_rider_deliver_check'),
  ('37f', 'P0: PIN lockout columns on orders',                                '202609250005_delivery_pin_lockout.sql', 'column', 'orders.delivery_code_locked_until'),
  ('37g', 'P0: /api/health probe knows all four dispatch migrations',         '202609250006_dispatch_health.sql', 'function_src', 'ps_checkout_health|pin_lockout_ok'),
  ('37h', 'SPEED: delivery_assignments published for instant offers',         '202609250007_realtime_offers.sql', 'publication', 'supabase_realtime.delivery_assignments'),
  ('37i', 'SPEED: /api/health probe knows the realtime flag',                '202609250007_realtime_offers.sql', 'function_src', 'ps_checkout_health|realtime_offers_ok'),
  ('37j', 'Delivery ratings (customer rates the rider on /track)',          '202609250008_delivery_ratings.sql', 'table', 'delivery_ratings'),
  ('38',  'Forgot-password request table',            '202609260001_password_reset_requests.sql', 'table', 'password_reset_requests'),
  ('39',  'Application review + rider KYC columns',   '202609260002_application_review.sql',      'column', 'riders.review_note'),
  ('40',  'Free delivery minimum + checkout waiver',  '202609260003_free_delivery.sql',           'column', 'orders.free_delivery_by'),
  ('41',  'Storefront funnel events',                 '202609260004_storefront_events.sql',       'table', 'storefront_events'),
  ('42',  'Push broadcasts (drops & offers)',         '202609270001_push_broadcasts.sql',         'table', 'push_broadcasts'),
  ('43',  'Shop cover image',                         '202609270002_shop_cover.sql',              'column', 'shops.cover_url'),
  ('44',  'Abandoned-bag snapshots',                  '202609270003_bag_snapshots.sql',           'table', 'bag_snapshots'),
  ('45',  'Review stamps (smart card)',               '202609270004_review_stamps.sql',           'table', 'stamp_ledger')
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
