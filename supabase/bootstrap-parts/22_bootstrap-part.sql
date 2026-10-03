-- PART 22/22 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
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

