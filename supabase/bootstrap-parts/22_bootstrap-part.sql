-- PART 22/24 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: weekly streak bonus (202610020017) ====
-- ============================================================================
-- Weekly STREAK bonus (2026-10-03) — OFF until staff set weeks and an amount.
--
--   rider_streak_weeks         0 = off, otherwise 2–8: how many complete Mon–Sun weeks in a row
--   rider_streak_bonus_paisa   0 = off, ≤ ৳5,000: paid once when the streak is reached
--
-- A "good week" is one in which the rider reached the weekly tier-1 target
-- (incentive_weekly_target, set on Riders → Incentives); without that target there is no
-- definition of a good week and the streak bonus pays nothing. Checked at the start of each
-- week for the last K COMPLETE weeks (Dhaka). Once paid, the streak starts again: nothing more
-- is paid while the earlier award falls inside the same K-week window. Idempotent through
-- rider_incentive_awards ('streak_bonus', ref_key = the Monday of the streak's last week).
--
-- ps_award_order_bonuses (202610020015) is re-created whole — it is this project's own
-- function, so there is nothing to patch in place — and now also returns `streak`.
-- Safe to re-run. Run after 202610020016.
-- ============================================================================
begin;

do $$
declare c record;
begin
  if to_regclass('public.rider_incentive_awards') is not null then
    for c in
      select conname from pg_constraint
       where conrelid = 'public.rider_incentive_awards'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) ilike '%daily_target%'
    loop
      execute format('alter table public.rider_incentive_awards drop constraint %I', c.conname);
    end loop;
    alter table rider_incentive_awards drop constraint if exists rider_incentive_awards_kind_check;
    alter table rider_incentive_awards add constraint rider_incentive_awards_kind_check
      check (kind in ('daily_target', 'weekly_target', 'referral', 'peak_bonus', 'rain_bonus', 'streak_bonus'));
  end if;
end $$;

create or replace function ps_award_order_bonuses(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_peak   bigint := least(greatest(ps_setting_int('rider_peak_bonus_paisa', 0), 0), 20000);
  v_ps     int    := least(greatest(ps_setting_int('rider_peak_start_hour', 18), 0), 23);
  v_pe     int    := least(greatest(ps_setting_int('rider_peak_end_hour', 22), 0), 23);
  v_rain   bigint := least(greatest(ps_setting_int('rider_rain_bonus_paisa', 0), 0), 20000);
  v_sk     int    := least(greatest(ps_setting_int('rider_streak_weeks', 0), 0), 8);
  v_sb     bigint := least(greatest(ps_setting_int('rider_streak_bonus_paisa', 0), 0), 500000);
  v_wt1    int    := least(greatest(ps_setting_int('incentive_weekly_target', 0), 0), 700);
  v_last   date   := date_trunc('week', p_now at time zone 'Asia/Dhaka')::date - 7;  -- Monday of the last COMPLETE week (Dhaka)
  v_streaks int := 0;
  v_peaks  int := 0;
  v_rains  int := 0;
  v_total  bigint := 0;
  v_awards jsonb := '[]'::jsonb;
  v_earning uuid;
  v_note   text;
  r record;
begin
  if v_peak > 0 and v_ps <> v_pe then
    for r in
      select a.rider_id, a.order_id, o.order_no
        from delivery_assignments a
        join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
        join riders x on x.id = a.rider_id and x.status = 'active'
       where a.state = 'delivered'
         and a.delivered_at >= p_now - interval '48 hours'
         and a.delivered_at <= p_now
         and case
               when v_ps < v_pe then extract(hour from a.delivered_at at time zone 'Asia/Dhaka') >= v_ps
                                 and extract(hour from a.delivered_at at time zone 'Asia/Dhaka') <  v_pe
               else extract(hour from a.delivered_at at time zone 'Asia/Dhaka') >= v_ps
                 or extract(hour from a.delivered_at at time zone 'Asia/Dhaka') <  v_pe
             end
    loop
      insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
      values (r.rider_id, 'peak_bonus', r.order_id::text, v_peak)
      on conflict (rider_id, kind, ref_key) do nothing;
      if found then
        v_note := left('Peak-hour bonus — ' || coalesce(r.order_no, r.order_id::text), 400);
        v_earning := ps__credit_incentive(r.rider_id, v_peak, v_note);
        update rider_incentive_awards set earning_id = v_earning
         where rider_id = r.rider_id and kind = 'peak_bonus' and ref_key = r.order_id::text;
        v_peaks := v_peaks + 1;
        v_total := v_total + v_peak;
        v_awards := v_awards || jsonb_build_object('riderId', r.rider_id, 'kind', 'peak_bonus', 'amount', v_peak, 'note', v_note);
      end if;
    end loop;
  end if;

  if v_rain > 0 then
    for r in
      select a.rider_id, a.order_id, o.order_no
        from delivery_assignments a
        join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
        join riders x on x.id = a.rider_id and x.status = 'active'
       where a.state = 'delivered'
         and a.delivered_at >= p_now - interval '48 hours'
         and a.delivered_at <= p_now
         and coalesce(o.surcharge_rain, 0) > 0
    loop
      insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
      values (r.rider_id, 'rain_bonus', r.order_id::text, v_rain)
      on conflict (rider_id, kind, ref_key) do nothing;
      if found then
        v_note := left('Rainy-day bonus — ' || coalesce(r.order_no, r.order_id::text), 400);
        v_earning := ps__credit_incentive(r.rider_id, v_rain, v_note);
        update rider_incentive_awards set earning_id = v_earning
         where rider_id = r.rider_id and kind = 'rain_bonus' and ref_key = r.order_id::text;
        v_rains := v_rains + 1;
        v_total := v_total + v_rain;
        v_awards := v_awards || jsonb_build_object('riderId', r.rider_id, 'kind', 'rain_bonus', 'amount', v_rain, 'note', v_note);
      end if;
    end loop;
  end if;

  -- STREAK: the rider reached the weekly tier-1 target in each of the last K complete Mon–Sun
  -- weeks (K = rider_streak_weeks, 2–8) → one bonus; the streak then starts again (no award is
  -- paid while an earlier one still falls inside the same K-week window). Needs the weekly
  -- tier-1 target (incentive_weekly_target) as its definition of a "good week".
  if v_sk >= 2 and v_sb > 0 and v_wt1 > 0 then
    for r in
      select x.id as rider_id
        from riders x
       where x.status = 'active'
         and not exists (
           select 1 from rider_incentive_awards w
            where w.rider_id = x.id and w.kind = 'streak_bonus'
              and w.ref_key::date > v_last - 7 * v_sk)
         and (
           select count(*) from generate_series(0, v_sk - 1) k
            where (
              select count(*) from delivery_assignments a
                join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
               where a.rider_id = x.id and a.state = 'delivered'
                 and (a.delivered_at at time zone 'Asia/Dhaka')::date >= v_last - 7 * k
                 and (a.delivered_at at time zone 'Asia/Dhaka')::date <  v_last - 7 * k + 7
            ) >= v_wt1
         ) = v_sk
    loop
      insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
      values (r.rider_id, 'streak_bonus', v_last::text, v_sb)
      on conflict (rider_id, kind, ref_key) do nothing;
      if found then
        v_note := format('Streak bonus — %s weeks in a row at %s+ deliveries (ending week of %s)', v_sk, v_wt1, v_last);
        v_earning := ps__credit_incentive(r.rider_id, v_sb, v_note);
        update rider_incentive_awards set earning_id = v_earning
         where rider_id = r.rider_id and kind = 'streak_bonus' and ref_key = v_last::text;
        v_streaks := v_streaks + 1;
        v_total := v_total + v_sb;
        v_awards := v_awards || jsonb_build_object('riderId', r.rider_id, 'kind', 'streak_bonus', 'amount', v_sb, 'note', v_note);
      end if;
    end loop;
  end if;

  return jsonb_build_object('peak', v_peaks, 'rain', v_rains, 'streak', v_streaks, 'total', v_total, 'awards', v_awards);
end $$;

revoke all on function ps_award_order_bonuses(timestamptz) from public, anon, authenticated;
grant execute on function ps_award_order_bonuses(timestamptz) to service_role;

-- Audit the new keys (recreate the trigger: its WHEN filter cannot be altered).
do $$
begin
  if to_regclass('public.site_settings') is not null
     and to_regprocedure('public.ps_money_audit_write(text,text,text,bigint,jsonb,uuid)') is not null
     and to_regprocedure('public.ps_incentive_settings_audit()') is not null then
    drop trigger if exists trg_incentive_settings_audit on site_settings;
    create trigger trg_incentive_settings_audit after insert or update on site_settings
      for each row when (new.key in ('incentive_daily_target', 'incentive_daily_bonus_paisa',
                                     'incentive_referral_bonus_paisa', 'incentive_referral_after',
                                     'incentive_weekly_target', 'incentive_weekly_bonus_paisa',
                                     'incentive_weekly_target2', 'incentive_weekly_bonus2_paisa',
                                     'rider_peak_bonus_paisa', 'rider_peak_start_hour',
                                     'rider_peak_end_hour', 'rider_rain_bonus_paisa',
                                     'rider_streak_weeks', 'rider_streak_bonus_paisa'))
      execute function ps_incentive_settings_audit();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: vendor (shop) web push (202610020018) ====
-- ============================================================================
-- Vendor (shop) WEB PUSH (2026-10-03): a new order buzzes the shop's phone even with
-- the vendor panel closed, and a shop that owes PROSANTI gets a daily reminder.
--
-- Until now a shop only heard about an order while its panel was OPEN (a 20-second poll
-- plus a beep) — a shop owner with the phone in a pocket found out from the customer's
-- phone call. Same VAPID pair and `web-push` as the staff, shopper and rider channels; a
-- separate table because the audience (a shop, any of its staff devices) differs.
--
--   vendor_push_subscriptions   one row per shop browser/phone. Service-role only: RLS on,
--                               NO policies — /api/vendor/push writes after requireVendor(),
--                               the fan-out in src/lib/vendor-push.ts reads. A shop can never
--                               read another shop's endpoints. Deleting a shop deletes them.
--
-- Safe to re-run. Nothing else changes.
-- ============================================================================
begin;

create table if not exists public.vendor_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  user_id      uuid,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_vendor_push_shop
  on public.vendor_push_subscriptions (shop_id);

alter table public.vendor_push_subscriptions enable row level security;
revoke all on table public.vendor_push_subscriptions from anon, authenticated;
grant all on table public.vendor_push_subscriptions to service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: GPS jump flags (202610020019) ====
-- ============================================================================
-- GPS-JUMP FLAGS (2026-10-03): a rider whose reported position "teleports" is flagged for staff.
--
-- Fake-GPS apps let a rider appear near a shop (to win offers) or near a customer (to mark a
-- delivery done). A server cannot PROVE spoofing, but one signal is hard to hide: IMPOSSIBLE
-- SPEED — the new fix is ≥ 2 km from the previous one and reaching it would need more than
-- 120 km/h given the time between the two pings. Real riders on motorbikes never do that;
-- a spoofing app flipping between two places does it constantly.
--
--   rider_gps_flags            one row per suspicious jump (from/to, distance, seconds, km/h).
--                              Staff-readable (RLS ps_is_admin), written only by the SQL below.
--   ps_rider_update_location   same signature and return type as before (202609090014); now also
--                              records a flag. At most ONE flag per rider per 5 minutes, so a
--                              spoofer flipping every ping does not flood the table. A failure
--                              while flagging can NEVER block the location update itself.
--
-- It only RECORDS and SHOWS (Admin → Rider profile → "GPS jump alerts"); nothing is suspended or
-- withheld automatically — a bad fix after a tunnel or a phone swap is a human decision.
-- Thresholds are site_settings (0 turns it off):
--   gps_jump_max_kmh  (default 120)     gps_jump_min_m  (default 2000)
--
-- Safe to re-run.
-- ============================================================================
begin;

-- Already present in production (202609090014); repeated so this file stands alone.
alter table public.riders add column if not exists lat double precision;
alter table public.riders add column if not exists lng double precision;
alter table public.riders add column if not exists last_location_at timestamptz;

create table if not exists public.rider_gps_flags (
  id          uuid primary key default gen_random_uuid(),
  rider_id    uuid not null references public.riders(id) on delete cascade,
  from_lat    double precision not null,
  from_lng    double precision not null,
  to_lat      double precision not null,
  to_lng      double precision not null,
  distance_m  integer not null check (distance_m >= 0),
  seconds     integer not null check (seconds >= 0),
  speed_kmh   integer not null check (speed_kmh >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_rider_gps_flags_rider
  on public.rider_gps_flags (rider_id, created_at desc);

alter table public.rider_gps_flags enable row level security;
drop policy if exists "gps flags admin read" on public.rider_gps_flags;
create policy "gps flags admin read" on public.rider_gps_flags
  for select using (ps_is_admin());
revoke all on table public.rider_gps_flags from anon, authenticated;
grant select on table public.rider_gps_flags to authenticated;
grant all on table public.rider_gps_flags to service_role;

create or replace function public.ps_rider_update_location(p_lat double precision, p_lng double precision)
returns riders
language plpgsql security definer set search_path = public as $$
declare
  v_rider    riders%rowtype;
  v_prev_lat double precision;
  v_prev_lng double precision;
  v_prev_at  timestamptz;
  v_max_kmh  bigint;
  v_min_m    bigint;
  v_dist_m   double precision;
  v_secs     double precision;
  v_kmh      double precision;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  v_prev_lat := v_rider.lat;
  v_prev_lng := v_rider.lng;
  v_prev_at  := v_rider.last_location_at;

  update riders
  set lat = p_lat, lng = p_lng, last_location_at = now()
  where id = v_rider.id
  returning * into v_rider;

  -- The flag is best-effort: whatever happens here, the position above is already saved.
  begin
    v_max_kmh := least(greatest(ps_setting_int('gps_jump_max_kmh', 120), 0), 1000);
    v_min_m   := least(greatest(ps_setting_int('gps_jump_min_m', 2000), 100), 100000);
    if v_max_kmh > 0 and v_prev_lat is not null and v_prev_lng is not null and v_prev_at is not null then
      -- haversine, metres
      v_dist_m := 2 * 6371000 * asin(least(1, sqrt(
        power(sin(radians(p_lat - v_prev_lat) / 2), 2)
        + cos(radians(v_prev_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_prev_lng) / 2), 2)
      )));
      v_secs := greatest(extract(epoch from (now() - v_prev_at)), 1);
      v_kmh  := v_dist_m / v_secs * 3.6;
      if v_dist_m >= v_min_m and v_kmh > v_max_kmh
         and not exists (
           select 1 from rider_gps_flags
           where rider_id = v_rider.id and created_at > now() - interval '5 minutes'
         ) then
        insert into rider_gps_flags (rider_id, from_lat, from_lng, to_lat, to_lng, distance_m, seconds, speed_kmh)
        values (
          v_rider.id, v_prev_lat, v_prev_lng, p_lat, p_lng,
          round(v_dist_m)::integer, least(round(v_secs), 2000000000)::integer, least(round(v_kmh), 2000000000)::integer
        );
      end if;
    end if;
  exception when others then
    null;
  end;
  return v_rider;
end $$;

-- Same grants as before (the function was created without an explicit grant; keep callable by riders only).
revoke all on function public.ps_rider_update_location(double precision, double precision) from public, anon;
grant execute on function public.ps_rider_update_location(double precision, double precision) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: failed-delivery proof (202610020020) ====
-- ============================================================================
-- FAILED-DELIVERY PROOF (2026-10-03): an optional photo when a rider reports a failed attempt.
--
-- "Customer not answering" is the rider's word alone. Staff can now (optionally) ask for a photo
-- — the closed door, the locked gate — so a disputed failure, a returned parcel or a "failed
-- delivery fee" is backed by something. Whether it is asked for is a staff decision, stored as the
-- site_settings key `failed_delivery_proof`:  0 = not asked (the default — nothing changes),
-- 1 = optional (the rider app offers it), 2 = required (a photo, or a written reason why none
-- could be taken — same escape hatch as the delivery proof). No SQL reads the setting.
--
--   delivery_failed_proofs   one row per failed attempt that carried a photo and/or a "no photo"
--                            reason. Written by the server after the attempt is recorded
--                            (service role). Staff read it (RLS ps_is_admin()) — the customer-facing
--                            order view never includes it. Deleted with its order.
--
-- Safe to re-run.
-- ============================================================================
begin;

create table if not exists public.delivery_failed_proofs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  assignment_id uuid,
  rider_id      uuid references public.riders(id) on delete set null,
  photo_url     text,
  no_photo_note text,
  created_at    timestamptz not null default now(),
  check (photo_url is not null or no_photo_note is not null)
);

create index if not exists idx_delivery_failed_proofs_order
  on public.delivery_failed_proofs (order_id, created_at desc);

alter table public.delivery_failed_proofs enable row level security;
drop policy if exists "failed proofs admin read" on public.delivery_failed_proofs;
create policy "failed proofs admin read" on public.delivery_failed_proofs
  for select using (ps_is_admin());
revoke all on table public.delivery_failed_proofs from anon, authenticated;
grant select on table public.delivery_failed_proofs to authenticated;
grant all on table public.delivery_failed_proofs to service_role;

notify pgrst, 'reload schema';

commit;

-- ===== MIRROR: supabase/migrations/202610140002_rpc_grant_hardening.sql =====
-- ============================================================================
-- RPC grant hardening 2 (2026-10-14, round 3): the anon key keeps EXECUTE on
-- nothing it does not need.
-- ============================================================================
-- Found while re-sweeping after the 2026-10-14 audit fixes. Supabase grants
-- EXECUTE on every new function to PUBLIC by default, so functions created
-- after security repair 4 (202609160004) drifted back open. Through
-- /rest/v1/rpc/... the PUBLIC anon key — which ships in every page — could
-- still call, among others:
--
--   ps_place_multi_order        place multi-shop orders with attacker totals
--   ps_purge_customer_sessions  wipe customer sessions
--   ps_rate_limit_hit           poison other people's rate-limit buckets
--   ps_auto_dispatch_ready_order / ps_broadcast_order / ps_next_eligible_rider
--                               churn the dispatch board
--   ps_award_incentives / ps_award_order_bonuses / ps_register_rider_referral
--                               mint rider money & referrals
--   ps_expire_shop_vacation / ps_block_expired_licence_online
--                               flip shop/rider state
--   ps_offer_order / ps_rider_accept / ps_rider_reject
--                               manipulate delivery offers
--
-- Rule applied here (idempotent, safe to re-run):
--   1. ANON + PUBLIC lose EXECUTE on EVERYTHING except a small allowlist of
--      read-only helpers and RLS policy functions (those run as the querying
--      role and must stay callable by anon).
--   2. A service-only group additionally loses EXECUTE from `authenticated`
--      (every call site in the codebase reaches them through the service-role
--      client; staff/rider session RPCs are the ones granted to
--      `authenticated` in their own migrations and keep those grants).
--   3. Trigger functions keep `authenticated` (customer review inserts fire
--      review triggers as the inserting customer) but lose anon like all.
--
-- Nothing here changes a feature: anon never legitimately called any RPC
-- (verified by grep over src/ — the browser makes zero `.rpc(` calls).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1+2. Grant sweep by NAME (no signature guessing). Re-runnable.
-- ----------------------------------------------------------------------------
do $$
declare
  fn record;
  service_only text[] := array[
    'ps_place_order', 'ps_place_multi_order', 'ps_use_coupon',
    'ps_book_delivery_slot', 'ps_return_action', 'ps_create_return_request',
    'ps_assign_batch_to_rider', 'ps_credit_referrer', 'ps_expire_stale_offers',
    'ps_shop_rating_recompute',                                  -- from repair 4
    'ps_rate_limit_hit', 'ps_purge_customer_sessions',
    'ps_auto_dispatch_ready_order', 'ps_broadcast_order',
    'ps_next_eligible_rider', 'ps_dispatch_extras_audit',
    'ps_expire_shop_vacation', 'ps_block_expired_licence_online',
    'ps_award_incentives', 'ps_award_order_bonuses',
    'ps_register_rider_referral', 'ps_rider_referral_code',
    'ps_offer_order', 'ps_set_order_delivery_code'
    -- NOT here (user sessions call them; blanket step keeps only anon out):
    --   ps_rider_accept/ps_rider_reject (rider session), ps_advance_order,
    --   ps_verify_payment, ps_cancel_assignment, ps_admin_*, ps_rider_*,
    --   ps_funnel_report (staff session), ps_write_shop_ledger (triggers on
    --   admin status changes run as the authenticated updater).
  ];
  anon_keep text[] := array[
    -- RLS policy helpers (policies run as the querying role):
    'ps_is_admin', 'ps_rider_id', 'ps_vendor_shop', 'ps_vendor_role',
    'ps_actor_email', 'ps_public_customer',
    -- pure read helpers used in defaults/policies/UI probes:
    'ps_setting_int', 'ps_haversine_km', 'ps_multi_order_max_shops',
    'ps_vacation_max_days', 'ps_shop_on_vacation', 'ps_offer_ttl_seconds',
    'ps_rider_cash_cap', 'ps_rider_load_limit', 'ps_shop_wallet_defaults',
    'ps_shop_takes_wallet', 'ps_dynamic_eta', 'ps_return_eligible',
    'ps_warranty_eligible', 'ps_failed_delivery_fee', 'ps_checkout_health',
    'ps_track_rider_load', 'ps_rider_on_shift', 'ps_ledger_net_collected',
    'ps_orders_renet_collected', 'ps_shop_wallet_collected',
    'ps_shop_balance_totals', 'ps_rider_scorecards_raw',
    'ps_incentive_settings_audit', 'ps_audit_shop_commission'
  ];
begin
  -- (2) service-only: no role but service_role/owner may execute.
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (service_only)
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function public.%s to service_role', fn.sig);
  end loop;

  -- (1) everything else: anon loses EXECUTE unless on the keep list.
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'ps\_%'
      and p.proname <> all (anon_keep)
      and p.proname <> all (service_only)   -- already handled above
  loop
    execute format('revoke execute on function public.%s from public, anon', fn.sig);
  end loop;
end $$;

commit;

-- ===== MIRROR: supabase/migrations/202610250001_finance_permission_boundary.sql =====
-- Finance approval is NOT ordinary operational staff access.
-- Keep ps_is_admin() unchanged for dispatch/reads. Enforce the narrower
-- boundary in actual RPC bodies and direct table writes, not only Next APIs.
-- Apply after the existing migrations; repeat-safe and transactional.
begin;

create or replace function public.ps_can_manage_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;
revoke all on function public.ps_can_manage_finance() from public, anon;
grant execute on function public.ps_can_manage_finance() to authenticated, service_role;

-- Preserve the installed accounting implementation (including fixes), changing
-- ONLY its explicit entry guard. Fail closed on an unexpected/missing body;
-- do not silently report a partially protected migration as successful.
do $$
declare
  signature text;
  fn regprocedure;
  definition text;
  old_guard text := 'if not (select ps_is_admin()) then';
  new_guard text := 'if not (select public.ps_can_manage_finance()) then';
begin
  foreach signature in array array[
    'public.ps_admin_settle_rider(uuid,text,text,boolean)',
    'public.ps_admin_reject_settle(uuid,text)',
    'public.ps_admin_decide_rider_payout(uuid,text,text,text)',
    'public.ps_admin_adjust_rider(uuid,bigint,text)',
    'public.ps_admin_resolve_dispute(uuid,text,bigint,text)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then
      raise exception 'Finance permission prerequisite missing: %', signature;
    end if;
    definition := pg_get_functiondef(fn);
    if position(old_guard in definition) > 0 then
      definition := replace(definition, old_guard, new_guard);
      execute definition;
    elsif position(new_guard in definition) = 0 then
      raise exception 'Unexpected finance RPC guard: %', signature;
    end if;
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

-- Platform wallet verification is financial authority. The existing shop
-- verifier branch and per-shop receiver policy remain intact.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.ps_verify_payment(uuid,text,text)'::regprocedure);
  if position('v_is_admin := (select ps_is_admin());' in definition) > 0 then
    execute replace(definition, 'v_is_admin := (select ps_is_admin());',
      'v_is_admin := (select public.ps_can_manage_finance());');
  elsif position('v_is_admin := (select public.ps_can_manage_finance());' in definition) = 0 then
    raise exception 'Unexpected payment verifier guard';
  end if;
end $$;

-- Restrictive write policies intersect existing permissive policies; an old
-- "admin all" policy can no longer let managers write these tables directly.
-- Existing SELECT/own-rider/own-shop policies and definer accounting triggers
-- remain unchanged. Tables with no permissive write policy remain RPC-only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'shop_ledger', 'shop_payouts', 'rider_settlements',
    'rider_settle_claims', 'rider_payout_requests', 'rider_earnings', 'rider_disputes'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists finance_insert_boundary on public.%I', table_name);
    execute format('create policy finance_insert_boundary on public.%I as restrictive for insert to authenticated with check (public.ps_can_manage_finance())', table_name);
    execute format('drop policy if exists finance_update_boundary on public.%I', table_name);
    execute format('create policy finance_update_boundary on public.%I as restrictive for update to authenticated using (public.ps_can_manage_finance()) with check (public.ps_can_manage_finance())', table_name);
    execute format('drop policy if exists finance_delete_boundary on public.%I', table_name);
    execute format('create policy finance_delete_boundary on public.%I as restrictive for delete to authenticated using (public.ps_can_manage_finance())', table_name);
  end loop;
end $$;

-- Parent deletion must not cascade-delete financial history for an operator.
-- Existing permissive policies are retained, but manager deletes are narrowed.
do $$
declare table_name text;
begin
  foreach table_name in array array['riders', 'shops', 'orders'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists finance_parent_delete_boundary on public.%I', table_name);
    execute format('create policy finance_parent_delete_boundary on public.%I as restrictive for delete to authenticated using (public.ps_can_manage_finance())', table_name);
  end loop;
end $$;

-- Guard existing balance columns from direct authenticated table updates.
-- INVOKER is essential: genuine SECURITY DEFINER delivery/accounting routines
-- run as their trusted owner, and must still post automatic COD/earnings.
create or replace function public.ps_guard_direct_rider_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.ps_can_manage_finance()
     and ((tg_op = 'INSERT' and (coalesce(new.cash_in_hand, 0) <> 0 or coalesce(new.earnings_balance, 0) <> 0))
       or (tg_op = 'UPDATE' and (new.cash_in_hand is distinct from old.cash_in_hand
         or new.earnings_balance is distinct from old.earnings_balance))) then
    raise exception 'forbidden: finance permission required';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_rider_finance() from public, anon, authenticated;
drop trigger if exists trg_direct_rider_finance on public.riders;
create trigger trg_direct_rider_finance before insert or update on public.riders
for each row execute function public.ps_guard_direct_rider_finance();

-- Commission/payment routing is platform-owned, not a manager or shop edit.
-- JSON comparison tolerates optional columns on rolling-upgrade databases.
create or replace function public.ps_guard_direct_shop_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
declare field text;
begin
  if current_user = 'authenticated' and not public.ps_can_manage_finance() then
    if tg_op = 'INSERT' then
      raise exception 'forbidden: finance permission required to create shops';
    end if;
    foreach field in array array['commission_pct', 'settlement_model', 'payment_verifier', 'wallet_bkash', 'wallet_nagad'] loop
      if (to_jsonb(new) -> field) is distinct from (to_jsonb(old) -> field) then
        raise exception 'forbidden: finance permission required';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_shop_finance() from public, anon, authenticated;
drop trigger if exists trg_direct_shop_finance on public.shops;
create trigger trg_direct_shop_finance before insert or update on public.shops
for each row execute function public.ps_guard_direct_shop_finance();

-- Protect rider pay/risk settings and the ops wallet destination record.
-- Other settings retain their existing policies. USING + WITH CHECK prevents
-- renaming an ordinary key into a protected key (or a protected key out).
create or replace function public.ps_finance_setting_allowed(p_key text)
returns boolean language sql stable security invoker set search_path = public as $$
  select public.ps_can_manage_finance() or not (
    p_key = 'ops' or p_key like 'rider\_%' escape '\'
    or p_key in ('offer_ttl_seconds', 'delivery_max_attempts')
  );
$$;
revoke all on function public.ps_finance_setting_allowed(text) from public, anon;
grant execute on function public.ps_finance_setting_allowed(text) to authenticated, service_role;
alter table public.site_settings enable row level security;
drop policy if exists finance_settings_insert on public.site_settings;
create policy finance_settings_insert on public.site_settings as restrictive
for insert to authenticated with check (public.ps_finance_setting_allowed(key));
drop policy if exists finance_settings_update on public.site_settings;
create policy finance_settings_update on public.site_settings as restrictive
for update to authenticated using (public.ps_finance_setting_allowed(key)) with check (public.ps_finance_setting_allowed(key));
drop policy if exists finance_settings_delete on public.site_settings;
create policy finance_settings_delete on public.site_settings as restrictive
for delete to authenticated using (public.ps_finance_setting_allowed(key));

-- Direct orders table access must not bypass payment verification or rewrite
-- totals. Existing SECURITY DEFINER placement/cancellation/refund routines
-- retain their actor validation and authoritative accounting behavior.
create or replace function public.ps_guard_direct_order_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
declare field text;
begin
  if current_user = 'authenticated' and not public.ps_can_manage_finance() then
    if tg_op = 'INSERT' then
      raise exception 'forbidden: orders must use the placement workflow';
    end if;
    foreach field in array array['subtotal', 'total', 'delivery_charge', 'discount', 'tip_amount', 'surcharge_total', 'payment', 'payment_status', 'payment_verified_at', 'payment_verified_by'] loop
      if (to_jsonb(new) -> field) is distinct from (to_jsonb(old) -> field) then
        raise exception 'forbidden: finance permission required';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_order_finance() from public, anon, authenticated;
drop trigger if exists trg_direct_order_finance on public.orders;
create trigger trg_direct_order_finance before insert or update on public.orders
for each row execute function public.ps_guard_direct_order_finance();

notify pgrst, 'reload schema';
commit;

-- ===== MIRROR: supabase/migrations/202610250002_shop_first_fulfilment.sql =====
-- Shop-first normal fulfilment; platform staff are not routine shop operators.
-- Keep return decisions, dispatch, cancellation and Traffic Point handover intact.
begin;

do $$
declare
  definition text;
  marker text := '-- Shop-first fulfilment boundary (202610250002)';
  anchor text := '  if not v_is_admin then';
  guard text := $guard$  -- Shop-first fulfilment boundary (202610250002)
  if v_is_admin and v_order.shop_id is not null
     and not coalesce(v_order.is_return, false)
     and p_to in ('confirmed', 'preparing', 'ready-for-pickup') then
    if not public.ps_can_manage_finance() then
      raise exception 'forbidden: shop fulfilment belongs to the shop';
    end if;
    if char_length(btrim(coalesce(p_note, ''))) < 10
       or char_length(btrim(coalesce(p_note, ''))) > 300 then
      raise exception 'shop fulfilment override reason required (10-300 characters)';
    end if;
    p_note := '[Shop fulfilment override] ' || btrim(p_note);
  end if;

$guard$;
begin
  if to_regprocedure('public.ps_can_manage_finance()') is null then
    raise exception 'Install finance permission boundary before shop-first fulfilment';
  end if;
  definition := pg_get_functiondef('public.ps_advance_order(uuid,ps_order_status,text)'::regprocedure);
  if position(marker in definition) = 0 then
    if position(anchor in definition) = 0 then
      raise exception 'Unexpected ps_advance_order authorization guard';
    end if;
    -- Preserve the installed state/payment/rider/stock/accounting machine.
    execute replace(definition, anchor, guard || anchor);
  end if;
end $$;
revoke all on function public.ps_advance_order(uuid,ps_order_status,text) from public, anon;
grant execute on function public.ps_advance_order(uuid,ps_order_status,text) to authenticated, service_role;

-- A direct REST table UPDATE must not bypass actor checks, payment gating,
-- rider PIN/COD custody, or the reason-required override. INVOKER is vital:
-- trusted definer workflow functions retain their own authorization checks.
create or replace function public.ps_guard_direct_order_workflow()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.status is distinct from old.status
       or new.shop_id is distinct from old.shop_id
       or new.is_return is distinct from old.is_return
       or new.is_pickup is distinct from old.is_pickup
     ) then
    raise exception 'forbidden: order status and routing changes must use the workflow';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_order_workflow() from public, anon, authenticated;
drop trigger if exists trg_direct_order_workflow on public.orders;
create trigger trg_direct_order_workflow before update on public.orders
for each row execute function public.ps_guard_direct_order_workflow();

notify pgrst, 'reload schema';
commit;
