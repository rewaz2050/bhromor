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
