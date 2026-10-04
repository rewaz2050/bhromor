-- ============================================================================
-- Peak-hour and rainy-day delivery bonus (2026-10-03) — both OFF until staff set an amount.
--
--   rider_peak_bonus_paisa   flat bonus per delivered order, for orders delivered inside the
--                            peak window (Dhaka clock). 0 = off, ≤ ৳200.
--   rider_peak_start_hour    window start, 0–23 (inclusive)         default 18
--   rider_peak_end_hour      window end,   0–23 (exclusive)         default 22
--                            start > end wraps midnight (e.g. 22 → 2); start = end = no window.
--   rider_rain_bonus_paisa   flat bonus per delivered order the CUSTOMER paid the rain
--                            surcharge on (orders.surcharge_rain > 0). 0 = off, ≤ ৳200.
--
-- Both can apply to one order (they stack). Delivery legs only (returns excluded), active
-- riders only, orders delivered in the last 48 h (so a late sweep still pays).
--
-- It is a SEPARATE function (ps_award_order_bonuses) so the daily/weekly/referral function is
-- untouched. Idempotency = rider_incentive_awards (rider, kind, order id): paid once per order
-- per kind, however often the sweep runs. The credit is an order-less `incentive` journal row
-- (ps__credit_incentive), so it can never collide with another per-order journal row.
-- Setting changes are audited. Safe to re-run. Run after 202610020014.
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
      check (kind in ('daily_target', 'weekly_target', 'referral', 'peak_bonus', 'rain_bonus'));
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

  return jsonb_build_object('peak', v_peaks, 'rain', v_rains, 'total', v_total, 'awards', v_awards);
end $$;

revoke all on function ps_award_order_bonuses(timestamptz) from public, anon, authenticated;
grant execute on function ps_award_order_bonuses(timestamptz) to service_role;

-- Audit the new keys (the trigger's WHEN filter cannot be altered, so it is recreated).
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
                                     'rider_peak_end_hour', 'rider_rain_bonus_paisa'))
      execute function ps_incentive_settings_audit();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
