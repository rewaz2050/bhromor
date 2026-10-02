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

-- ==== Feature: dispatch follow-ups (202610020011) ====
-- ============================================================================
-- Follow-ups to the dispatch rules (2026-10-02, after the A–Z rollout).
--
--  1. LOAD LIMIT AS A SETTING. "A rider carries at most 2 active jobs" was a
--     literal in four SQL functions and in the UI. It is now the site_settings
--     key `rider_load_limit` (default 2, clamp 1..5) read through
--     ps_rider_load_limit(). With no row, behaviour is EXACTLY what it was.
--     ps_broadcast_order / ps_rider_accept / ps_assign_batch_to_rider /
--     ps_next_eligible_rider below are the latest definitions (202610020003)
--     with only that literal swapped.
--
--  2. NO RE-OFFER TO THE SAME RIDER. After a failed delivery or a rider
--     handing a job back, a redispatch could offer the order to the very rider
--     who just failed it. ps_broadcast_order now skips riders who have a
--     `failed` assignment on the order, or one they released themselves
--     (cancelled_by = 'rider_release'), in addition to the existing decline
--     rule. Manual assignment by staff is not restricted.
--
--  3. RIDER CAN HAND BACK AN ACCEPTED JOB. Until now only staff could release
--     a rider who had accepted but not yet picked up. ps_rider_release_accepted
--     lets the rider do it themselves (reason ≥ 5 characters, own assignment,
--     state 'accepted' only — once the parcel is in hand it is the failed-
--     delivery flow). The order returns to the area queue at once.
--
--  4. SETTINGS AUDIT. Changes to rider_load_limit and the opt-in
--     rider_auto_suspend switch are logged as `rate_change` in money_audit_log
--     through a small separate trigger (the existing audit function is left
--     untouched, same approach as 202610020010).
--
-- Safe to re-run. Run after 202610020003, 202610010006 and 202610020006.
-- ============================================================================
begin;

create or replace function ps_rider_load_limit()
returns integer language sql stable security definer set search_path = public as $$
  select least(greatest(ps_setting_int('rider_load_limit', 2), 1), 5)::integer
$$;
grant execute on function ps_rider_load_limit() to authenticated, service_role;

create or replace function ps_broadcast_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready-for-pickup'
     or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    return null;
  end if;
  if exists (select 1 from delivery_assignments where order_id = p_order_id
    and (state in ('accepted','picked_up') or (state = 'offered' and not is_broadcast))) then
    return null; -- a manual offer is exclusive until it expires/is declined
  end if;

  insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at, is_broadcast)
  select p_order_id, r.id, 'offered', now(), now() + make_interval(secs => ps_offer_ttl_seconds()), true
  from riders r
  where r.status = 'active' and r.is_online and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_order.zone_id]
    and r.cash_in_hand < ps_rider_cash_cap() and r.current_load < ps_rider_load_limit()
    and not exists (select 1 from delivery_assignments a
      where a.order_id = p_order_id and a.rider_id = r.id
        and (a.state in ('offered','accepted','picked_up')
          -- A rider who declined it, handed it back after accepting, or whose
          -- delivery of it FAILED is never auto re-offered it (a redispatch
          -- goes to someone else; staff can still assign that rider by hand).
          or a.state = 'failed'
          or (a.state = 'cancelled' and a.cancelled_by in ('rider_decline', 'rider_release'))
          -- Withdrawn/expired invitations cool down for five minutes; rows
          -- superseded by an accept or a manual offer re-qualify at once, so
          -- broadcasting resumes to the area the moment a manual request ends.
          or (a.state in ('cancelled','expired')
            and coalesce(a.cancelled_by, 'withdrawn') <> 'superseded'
            and a.offered_at > now() - interval '5 minutes')))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;

create or replace function ps_rider_accept(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_rider riders%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  -- Different invitation IDs share this one lock: only the first can win.
  select * into v_order from orders where id = v_assignment.order_id for update;
  select * into v_rider from riders where id = v_assignment.rider_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' or v_assignment.expires_at <= now()
     or v_order.status <> 'ready-for-pickup' or v_order.rider_id is not null then
    raise exception 'offer no longer available';
  end if;
  if v_rider.status <> 'active' or not v_rider.is_online
     or v_rider.cash_in_hand >= ps_rider_cash_cap() or v_rider.current_load >= ps_rider_load_limit()
     or (v_assignment.is_broadcast and (
       not ps_rider_on_shift(v_rider) or not (v_rider.zone_ids @> array[v_order.zone_id]))) then
    raise exception 'rider not available';
  end if;
  if coalesce(v_order.is_pickup, false)
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    raise exception 'order not ready for dispatch';
  end if;
  update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
    where order_id = v_order.id and id <> p_assignment_id and state = 'offered';
  update delivery_assignments set state = 'accepted' where id = p_assignment_id
    returning * into v_assignment;
  update orders set status = 'courier-assigned', rider_id = v_rider.id, updated_at = now()
    where id = v_order.id;
  insert into order_status_history(order_id, status, note, changed_by)
    values(v_order.id, 'courier-assigned', 'First rider accepted the delivery request', auth.uid());
  return v_assignment;
end $$;

create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_oid uuid; v_count int := 0; v_order orders%rowtype;
begin
  for v_oid in select distinct unnest(coalesce(p_order_ids, '{}'::uuid[])) order by 1 loop
    select * into v_order from orders where id = v_oid for update;
    if not found or v_order.status <> 'ready-for-pickup'
       or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null then continue; end if;
    if v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified' then continue; end if;
    if not exists(select 1 from riders where id = p_rider_id and status = 'active' and is_online
      and cash_in_hand < ps_rider_cash_cap() and current_load < ps_rider_load_limit()) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + make_interval(secs => ps_offer_ttl_seconds()));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_order_lat double precision;
  v_order_lng double precision;
  v_zone_id text;
  v_rider_id uuid;
begin
  select lat, lng, zone_id into v_order_lat, v_order_lng, v_zone_id from orders where id = p_order_id;

  -- Try nearest by geo if order has pin
  if v_order_lat is not null and v_order_lng is not null then
    select r.id into v_rider_id
    from riders r
    where r.status = 'active'
      and r.is_online
      and ps_rider_on_shift(r)
      and r.zone_ids @> array[v_zone_id]
      and r.cash_in_hand < ps_rider_cash_cap()
      and r.current_load < ps_rider_load_limit()
      and not exists (
        select 1 from delivery_assignments a
        where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
      )
      and not exists (
        select 1 from delivery_assignments seen
        where seen.order_id = p_order_id and seen.rider_id = r.id
      )
    order by
      -- distance first (if rider has location)
      case when r.lat is not null and r.lng is not null
        then ps_haversine_km(v_order_lat, v_order_lng, r.lat, r.lng)
        else 9999 end asc,
      -- then rating high to low
      r.rating_avg desc,
      -- then least load
      r.current_load asc,
      -- then longest idle
      r.created_at asc
    limit 1;
    if v_rider_id is not null then
      return v_rider_id;
    end if;
  end if;

  -- Fallback: original logic without geo
  select r.id into v_rider_id
  from riders r
  where r.status = 'active'
    and r.is_online
    and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_zone_id]
    and r.cash_in_hand < ps_rider_cash_cap()
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
    )
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.rating_avg desc, r.current_load asc, r.created_at asc
  limit 1;

  return v_rider_id;
end $$;

create or replace function ps_rider_release_accepted(p_assignment_id uuid, p_reason text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if length(v_reason) < 5 then
    raise exception 'a reason is required';
  end if;
  -- Same lock order as accept / reject, so racing calls are safe.
  select * into v_order from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'accepted' then
    raise exception 'only an accepted job that is not picked up yet can be handed back';
  end if;
  update delivery_assignments
    set state = 'cancelled', cancelled_by = 'rider_release'
    where id = p_assignment_id
    returning * into v_assignment;
  update orders
    set rider_id = null, status = 'ready-for-pickup', updated_at = now()
    where id = v_order.id;
  insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'ready-for-pickup', 'Rider handed the job back: ' || v_reason, auth.uid());
  perform ps_broadcast_order(v_order.id);
  return v_assignment;
end $$;

revoke all on function ps_rider_release_accepted(uuid, text) from public, anon;
grant execute on function ps_rider_release_accepted(uuid, text) to authenticated, service_role;

do $$
begin
  if to_regclass('public.site_settings') is not null
     and to_regprocedure('public.ps_money_audit_write(text,text,text,bigint,jsonb,uuid)') is not null then
    create or replace function ps_dispatch_extras_audit()
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
    revoke all on function ps_dispatch_extras_audit() from public, anon, authenticated;
    drop trigger if exists trg_dispatch_extras_audit on site_settings;
    create trigger trg_dispatch_extras_audit after insert or update on site_settings
      for each row when (new.key in ('rider_load_limit', 'rider_auto_suspend'))
      execute function ps_dispatch_extras_audit();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: failed-delivery fee + weekly tiered bonus (202610020012) ====
-- ============================================================================
-- Two money follow-ups (2026-10-02), both OFF until staff set an amount.
--
--  1. FAILED-DELIVERY FEE. A rider who rode to the customer, could not deliver and
--     brought the parcel back earned nothing. Setting `rider_failed_delivery_fee_paisa`
--     (0 = off, ≤ ৳500). It is paid only when STAFF resolve the failed delivery and
--     choose "pay the rider" (ps_admin_resolve_failed_delivery gains p_pay_fee,
--     default false → old callers pay nothing) — a rider cannot give themselves the
--     fee by reporting a failure. Booked as an `incentive` journal row bound to the
--     order: unique (order_id, kind) = once per order, the money audit trigger logs it,
--     wallet / daily / P&L reports already count incentives as rider pay.
--
--  2. WEEKLY + TIERED BONUS. ps_award_incentives (202610020010) gains weekly tiers:
--       incentive_weekly_target / incentive_weekly_bonus_paisa     tier 1
--       incentive_weekly_target2 / incentive_weekly_bonus2_paisa   tier 2 (extra, above tier 1)
--     Mon–Sun in Dhaka, delivery legs only, each tier once per rider per week; this week
--     and last week are checked. Same idempotency guard as the daily bonus.
--
--  Setting changes are logged as `rate_change` (small separate triggers, the existing
--  audit functions are untouched). Safe to re-run. Run after 202610020011.
-- ============================================================================
begin;

create or replace function ps_failed_delivery_fee()
returns bigint language sql stable security definer set search_path = public as $$
  select least(greatest(ps_setting_int('rider_failed_delivery_fee_paisa', 0), 0), 50000)::bigint
$$;
grant execute on function ps_failed_delivery_fee() to authenticated, service_role;

-- The signature gains a parameter: drop the old one so two overloads cannot make
-- PostgREST named-argument calls ambiguous (old 3-arg callers work through the default).
drop function if exists ps_admin_resolve_failed_delivery(uuid, text, text);

create or replace function ps_admin_resolve_failed_delivery(
  p_order_id uuid,
  p_action text,
  p_note text default null,
  p_pay_fee boolean default false
)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_action text := lower(coalesce(trim(p_action), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_fee bigint := 0;
  v_failed_rider uuid;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  if v_action not in ('redispatch', 'cancel') then
    raise exception 'action must be redispatch or cancel';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.delivery_failed_at is null or v_order.status in ('delivered', 'cancelled') then
    raise exception 'no failed delivery to resolve';
  end if;

  -- Optional: pay the rider who made the failed attempt (a decision staff take per
  -- case — a rider who went and could not deliver did the work; one who never went did not).
  -- Journal row = kind 'incentive' bound to the order: the unique (order_id, kind) index is
  -- the once-only gate, the money audit trigger logs it, every wallet/P&L report already
  -- counts 'incentive' as rider pay. 0 in the setting = nothing is paid.
  if coalesce(p_pay_fee, false) then
    v_fee := ps_failed_delivery_fee();
    if v_fee > 0 then
      select a.rider_id into v_failed_rider
        from delivery_assignments a
       where a.order_id = v_order.id and a.state = 'failed'
       order by a.offered_at desc
       limit 1;
      if v_failed_rider is not null then
        insert into rider_earnings (rider_id, order_id, kind, amount, note)
        values (v_failed_rider, v_order.id, 'incentive', v_fee,
                left('Failed delivery fee — ' || coalesce(v_order.order_no, v_order.id::text), 400))
        on conflict (order_id, kind) do nothing;
        if found then
          update riders set earnings_balance = earnings_balance + v_fee where id = v_failed_rider;
          insert into order_status_history (order_id, status, note, changed_by)
          values (v_order.id, v_order.status,
                  'Rider paid ' || (v_fee / 100.0)::numeric(12,2) || ' Tk for the failed attempt', auth.uid());
        end if;
      end if;
    end if;
  end if;

  if v_action = 'redispatch' then
    -- Back to the area queue: the status change fires the broadcast trigger.
    update orders
    set status = 'ready-for-pickup', rider_id = null, delivery_attempts = 0,
        delivery_failed_at = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'ready-for-pickup',
            'Failed delivery — redispatched to the area' || coalesce(': ' || v_note, ''), auth.uid());
  else
    update orders
    set status = 'cancelled', rider_id = null, delivery_failed_at = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'cancelled',
            'Failed delivery — order cancelled' || coalesce(': ' || v_note, '')
              || case when v_order.payment in ('bkash', 'nagad')
                       and coalesce(to_jsonb(v_order)->>'payment_status', '') = 'verified'
                      then ' · PREPAID: refund the customer offline' else '' end,
            auth.uid());
  end if;
  return v_order;
end $$;

revoke all on function ps_admin_resolve_failed_delivery(uuid, text, text, boolean) from public, anon;
grant execute on function ps_admin_resolve_failed_delivery(uuid, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Weekly awards: widen the allowed kinds.
-- ---------------------------------------------------------------------------
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
      check (kind in ('daily_target', 'weekly_target', 'referral'));
  end if;
end $$;

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
  v_week0   date   := date_trunc('week', p_now at time zone 'Asia/Dhaka')::date;  -- Monday (Dhaka)
  v_week    date;
  v_tier    int;
  v_wt      int;
  v_wb      bigint;
  v_wt1     int    := least(greatest(ps_setting_int('incentive_weekly_target', 0), 0), 700);
  v_wb1     bigint := least(greatest(ps_setting_int('incentive_weekly_bonus_paisa', 0), 0), 500000);
  v_wt2     int    := least(greatest(ps_setting_int('incentive_weekly_target2', 0), 0), 700);
  v_wb2     bigint := least(greatest(ps_setting_int('incentive_weekly_bonus2_paisa', 0), 0), 500000);
  v_weekly  int := 0;
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

  -- Weekly tiers (Mon–Sun, Dhaka). Tier 1 and tier 2 are paid SEPARATELY (tier 2 is an
  -- extra on top), each once per rider per week. This week and last week are checked, so a
  -- run that straddles Sunday midnight still pays. Tier 2 must sit above tier 1.
  foreach v_week in array array[v_week0 - 7, v_week0] loop
    for v_tier in 1..2 loop
      v_wt := case v_tier when 1 then v_wt1 else v_wt2 end;
      v_wb := case v_tier when 1 then v_wb1 else v_wb2 end;
      continue when v_wt <= 0 or v_wb <= 0;
      continue when v_tier = 2 and v_wt1 > 0 and v_wt <= v_wt1;
      for r in
        select a.rider_id, count(*) as n
          from delivery_assignments a
          join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
          join riders x on x.id = a.rider_id and x.status = 'active'
         where a.state = 'delivered'
           and (a.delivered_at at time zone 'Asia/Dhaka')::date >= v_week
           and (a.delivered_at at time zone 'Asia/Dhaka')::date <  v_week + 7
         group by a.rider_id
        having count(*) >= v_wt
      loop
        insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
        values (r.rider_id, 'weekly_target', v_week::text || ':' || v_tier, v_wb)
        on conflict (rider_id, kind, ref_key) do nothing;
        if found then
          v_note := format('Weekly target (tier %s): %s deliveries in the week of %s', v_tier, v_wt, v_week);
          v_earning := ps__credit_incentive(r.rider_id, v_wb, v_note);
          update rider_incentive_awards set earning_id = v_earning
           where rider_id = r.rider_id and kind = 'weekly_target' and ref_key = v_week::text || ':' || v_tier;
          v_weekly := v_weekly + 1;
          v_total := v_total + v_wb;
          v_awards := v_awards || jsonb_build_object('riderId', r.rider_id, 'kind', 'weekly_target', 'tier', v_tier, 'amount', v_wb, 'note', v_note);
        end if;
      end loop;
    end loop;
  end loop;

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

  return jsonb_build_object('daily', v_daily, 'weekly', v_weekly, 'referral', v_ref, 'total', v_total, 'awards', v_awards);
end $$;

revoke all on function ps_award_incentives(timestamptz) from public, anon, authenticated;
grant execute on function ps_award_incentives(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Audit the new keys. The two small triggers from 202610020010 / 202610020011 are
-- recreated with the wider key lists (a trigger's WHEN filter cannot be altered).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.site_settings') is not null
     and to_regprocedure('public.ps_money_audit_write(text,text,text,bigint,jsonb,uuid)') is not null then
    if to_regprocedure('public.ps_incentive_settings_audit()') is not null then
      drop trigger if exists trg_incentive_settings_audit on site_settings;
      create trigger trg_incentive_settings_audit after insert or update on site_settings
        for each row when (new.key in ('incentive_daily_target', 'incentive_daily_bonus_paisa',
                                       'incentive_referral_bonus_paisa', 'incentive_referral_after',
                                       'incentive_weekly_target', 'incentive_weekly_bonus_paisa',
                                       'incentive_weekly_target2', 'incentive_weekly_bonus2_paisa'))
        execute function ps_incentive_settings_audit();
    end if;
    if to_regprocedure('public.ps_dispatch_extras_audit()') is not null then
      drop trigger if exists trg_dispatch_extras_audit on site_settings;
      create trigger trg_dispatch_extras_audit after insert or update on site_settings
        for each row when (new.key in ('rider_load_limit', 'rider_auto_suspend', 'rider_failed_delivery_fee_paisa'))
        execute function ps_dispatch_extras_audit();
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

