-- PART 20/20 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: rider incentives (202610020010) ====
-- ============================================================================
-- V (2026-10-02) — RIDER INCENTIVES: a daily-target bonus and a refer-a-rider
-- bonus, both OFF until staff set an amount, both paid through the wallet
-- journal as `incentive` rows (so the wallet always equals the journal sum and
-- the money audit trigger logs each one).
--
-- Settings (flat site_settings keys, 0 / missing = switched off):
--   incentive_daily_target         deliveries in one Dhaka day (1–100)
--   incentive_daily_bonus_paisa    bonus for reaching it       (≤ ৳5,000)
--   incentive_referral_bonus_paisa bonus for the referrer      (≤ ৳5,000)
--   incentive_referral_after       deliveries the referee must complete (default 10)
--
-- Tables (RLS on, NO policies — service role only; riders read via the API):
--   rider_referral_codes     one short code per rider
--   rider_referrals          referee → referrer, once per referee, new riders only
--   rider_incentive_awards   one row per (rider, kind, key): the idempotency
--                            guard that makes the sweep safe to run every tick
--
-- Functions are SERVICE ROLE ONLY: the cron and the apply route call them;
-- nobody can award themselves money.
-- ============================================================================

begin;

create table if not exists rider_referral_codes (
  rider_id   uuid primary key references riders (id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists rider_referrals (
  referee_id  uuid primary key references riders (id) on delete cascade,
  referrer_id uuid not null references riders (id) on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referee_id <> referrer_id)
);
create index if not exists idx_rider_referrals_referrer on rider_referrals (referrer_id);

create table if not exists rider_incentive_awards (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id) on delete cascade,
  kind       text not null check (kind in ('daily_target', 'referral')),
  ref_key    text not null,
  amount     bigint not null check (amount > 0),
  earning_id uuid references rider_earnings (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (rider_id, kind, ref_key)
);

alter table rider_referral_codes   enable row level security;
alter table rider_referrals        enable row level security;
alter table rider_incentive_awards enable row level security;

-- ---------------------------------------------------------------------------
-- A rider's code, created on first ask (no look-alike characters).
-- ---------------------------------------------------------------------------
create or replace function ps_rider_referral_code(p_rider uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_tries int := 0;
  k int;
begin
  select code into v_code from rider_referral_codes where rider_id = p_rider;
  if found then
    return v_code;
  end if;
  if not exists (select 1 from riders where id = p_rider) then
    raise exception 'rider not found';
  end if;
  loop
    v_code := '';
    for k in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into rider_referral_codes (rider_id, code) values (p_rider, v_code);
      return v_code;
    exception when unique_violation then
      select code into v_code from rider_referral_codes where rider_id = p_rider;
      if found then
        return v_code;
      end if;
      v_tries := v_tries + 1;
      if v_tries > 20 then
        raise exception 'could not generate a code';
      end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Link a NEW rider (still pending) to the rider whose code they typed.
-- Answers: registered | unknown | self | already | not_new   (never raises on
-- bad input — an application must not fail because of a mistyped code).
-- ---------------------------------------------------------------------------
create or replace function ps_register_rider_referral(p_referee uuid, p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_referrer uuid;
  v_status text;
begin
  if char_length(v_code) < 4 or char_length(v_code) > 12 then
    return 'unknown';
  end if;
  select r.rider_id into v_referrer
    from rider_referral_codes r
    join riders x on x.id = r.rider_id and x.status = 'active'
   where r.code = v_code;
  if v_referrer is null then
    return 'unknown';
  end if;
  if v_referrer = p_referee then
    return 'self';
  end if;
  select status into v_status from riders where id = p_referee;
  if not found or v_status <> 'pending' then
    return 'not_new';
  end if;
  if exists (select 1 from rider_referrals where referee_id = p_referee) then
    return 'already';
  end if;
  insert into rider_referrals (referee_id, referrer_id, code) values (p_referee, v_referrer, v_code);
  return 'registered';
end $$;

-- ---------------------------------------------------------------------------
-- Internal: credit the wallet through the journal as an `incentive` row.
-- ---------------------------------------------------------------------------
create or replace function ps__credit_incentive(p_rider uuid, p_amount bigint, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update riders set earnings_balance = earnings_balance + p_amount where id = p_rider;
  if not found then
    raise exception 'rider not found';
  end if;
  insert into rider_earnings (rider_id, order_id, kind, amount, note)
  values (p_rider, null, 'incentive', p_amount, left(p_note, 400))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- The sweep (cron, every tick). Idempotent: an award row per (rider, kind, key)
-- is inserted FIRST; only the call that inserted it credits the wallet.
--   daily_target  today's and yesterday's Dhaka day (yesterday catches a run
--                 that straddled midnight); delivery legs only, not returns.
--   referral      the referrer is paid once, when the referee has completed
--                 `incentive_referral_after` deliveries and the referrer is
--                 still an active rider.
-- Returns {daily, referral, total, awards:[{riderId, kind, amount, note}]}.
-- ---------------------------------------------------------------------------
create or replace function ps_award_incentives(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today   date := (p_now at time zone 'Asia/Dhaka')::date;
  v_day     date;
  v_target  int    := least(greatest(ps_setting_int('incentive_daily_target', 0), 0), 100);
  v_bonus   bigint := least(greatest(ps_setting_int('incentive_daily_bonus_paisa', 0), 0), 500000);
  v_rbonus  bigint := least(greatest(ps_setting_int('incentive_referral_bonus_paisa', 0), 0), 500000);
  v_after   int    := least(greatest(ps_setting_int('incentive_referral_after', 10), 1), 200);
  v_daily   int := 0;
  v_ref     int := 0;
  v_total   bigint := 0;
  v_awards  jsonb := '[]'::jsonb;
  v_note    text;
  v_earning uuid;
  r record;
begin
  if v_target > 0 and v_bonus > 0 then
    foreach v_day in array array[v_today - 1, v_today] loop
      for r in
        select a.rider_id, count(*) as n
          from delivery_assignments a
          join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
          join riders x on x.id = a.rider_id and x.status = 'active'
         where a.state = 'delivered'
           and (a.delivered_at at time zone 'Asia/Dhaka')::date = v_day
         group by a.rider_id
        having count(*) >= v_target
      loop
        insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
        values (r.rider_id, 'daily_target', v_day::text, v_bonus)
        on conflict (rider_id, kind, ref_key) do nothing;
        if found then
          v_note := format('Daily target: %s deliveries on %s', v_target, v_day);
          v_earning := ps__credit_incentive(r.rider_id, v_bonus, v_note);
          update rider_incentive_awards set earning_id = v_earning
           where rider_id = r.rider_id and kind = 'daily_target' and ref_key = v_day::text;
          v_daily := v_daily + 1;
          v_total := v_total + v_bonus;
          v_awards := v_awards || jsonb_build_object('riderId', r.rider_id, 'kind', 'daily_target', 'amount', v_bonus, 'note', v_note);
        end if;
      end loop;
    end loop;
  end if;

  if v_rbonus > 0 then
    for r in
      select f.referee_id, f.referrer_id,
             (select count(*) from delivery_assignments a
               join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
              where a.rider_id = f.referee_id and a.state = 'delivered') as n
        from rider_referrals f
        join riders rr on rr.id = f.referrer_id and rr.status = 'active'
       where f.rewarded_at is null
    loop
      continue when r.n < v_after;
      insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
      values (r.referrer_id, 'referral', r.referee_id::text, v_rbonus)
      on conflict (rider_id, kind, ref_key) do nothing;
      if found then
        v_note := format('Referral bonus: the rider you referred completed %s deliveries', v_after);
        v_earning := ps__credit_incentive(r.referrer_id, v_rbonus, v_note);
        update rider_incentive_awards set earning_id = v_earning
         where rider_id = r.referrer_id and kind = 'referral' and ref_key = r.referee_id::text;
        v_ref := v_ref + 1;
        v_total := v_total + v_rbonus;
        v_awards := v_awards || jsonb_build_object('riderId', r.referrer_id, 'kind', 'referral', 'amount', v_rbonus, 'note', v_note);
      end if;
      update rider_referrals set rewarded_at = p_now where referee_id = r.referee_id and rewarded_at is null;
    end loop;
  end if;

  return jsonb_build_object('daily', v_daily, 'referral', v_ref, 'total', v_total, 'awards', v_awards);
end $$;

revoke all on function ps_rider_referral_code(uuid)          from public, anon, authenticated;
revoke all on function ps_register_rider_referral(uuid, text) from public, anon, authenticated;
revoke all on function ps__credit_incentive(uuid, bigint, text) from public, anon, authenticated;
revoke all on function ps_award_incentives(timestamptz)       from public, anon, authenticated;
grant execute on function ps_rider_referral_code(uuid)          to service_role;
grant execute on function ps_register_rider_referral(uuid, text) to service_role;
grant execute on function ps_award_incentives(timestamptz)       to service_role;

-- ---------------------------------------------------------------------------
-- Changing an incentive amount is a money decision: log it as `rate_change`
-- (old → new) exactly like the pay-rate keys. A SEPARATE small trigger, so the
-- existing audit function and its trigger are left untouched.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.site_settings') is not null
     and to_regprocedure('public.ps_money_audit_write(text,text,text,bigint,jsonb,uuid)') is not null then
    create or replace function ps_incentive_settings_audit()
    returns trigger language plpgsql security definer set search_path = public as $f$
    declare
      v_old jsonb;
    begin
      v_old := case when tg_op = 'UPDATE' then old.value end;
      if v_old is distinct from new.value then
        perform ps_money_audit_write('rate_change', 'setting', new.key, null,
          jsonb_build_object('from', v_old, 'to', new.value));
      end if;
      return null;
    end $f$;
    revoke all on function ps_incentive_settings_audit() from public, anon, authenticated;
    drop trigger if exists trg_incentive_settings_audit on site_settings;
    create trigger trg_incentive_settings_audit after insert or update on site_settings
      for each row when (new.key in ('incentive_daily_target', 'incentive_daily_bonus_paisa',
                                     'incentive_referral_bonus_paisa', 'incentive_referral_after'))
      execute function ps_incentive_settings_audit();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

