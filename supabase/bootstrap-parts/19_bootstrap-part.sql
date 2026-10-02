-- PART 19/19 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: dispatch rules as settings (202610020003) ====
-- ============================================================================
-- J (2026-10-02) — DISPATCH RULES AS SETTINGS: cash cap, offer window, attempts.
--
-- Three numbers that shape every delivery were hardcoded in SQL and TS:
--   • the cash a rider may hold before dispatch stops (৳5,000 = 500000 paisa)
--   • how long an offer stays open (90 seconds)
--   • how many delivery attempts before a job is closed (already a setting,
--     delivery_max_attempts — this file only gives it an editor and an audit)
-- They now live in site_settings (keys rider_cash_cap_paisa, offer_ttl_seconds,
-- delivery_max_attempts), read through two helpers with a clamp, so a typo can
-- neither lock every rider out (cap) nor make offers unusable (window):
--   ps_rider_cash_cap()      default 500000, clamp 50000 .. 5000000
--   ps_offer_ttl_seconds()   default 90,     clamp 30 .. 600
-- With no row the behaviour is EXACTLY what it was. The dispatch functions
-- below are the latest definitions (202609250003 / 202609140014) with only the
-- two literals swapped for the helpers; nothing else changed. The money audit
-- trigger also logs changes of these keys as `rate_change`.
-- Safe to re-run. Run after 202610010006 (audit trigger) and the dispatch files.
-- ============================================================================
begin;

create or replace function ps_rider_cash_cap()
returns bigint language sql stable security definer set search_path = public as $$
  select least(greatest(ps_setting_int('rider_cash_cap_paisa', 500000), 50000), 5000000)
$$;

create or replace function ps_offer_ttl_seconds()
returns integer language sql stable security definer set search_path = public as $$
  select least(greatest(ps_setting_int('offer_ttl_seconds', 90), 30), 600)::integer
$$;

grant execute on function ps_rider_cash_cap() to authenticated, service_role;
grant execute on function ps_offer_ttl_seconds() to authenticated, service_role;

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
    and r.cash_in_hand < ps_rider_cash_cap() and r.current_load < 2
    and not exists (select 1 from delivery_assignments a
      where a.order_id = p_order_id and a.rider_id = r.id
        and (a.state in ('offered','accepted','picked_up')
          -- A rider who declined this order is never auto re-offered it.
          or (a.state = 'cancelled' and a.cancelled_by = 'rider_decline')
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
     or v_rider.cash_in_hand >= ps_rider_cash_cap() or v_rider.current_load >= 2
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
      and cash_in_hand < ps_rider_cash_cap() and current_load < 2) then raise exception 'rider not available'; end if;
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
      and r.current_load < 2 -- max 2 concurrent
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

-- Audit trigger: also log the dispatch-rule keys.
create or replace function ps_money_audit_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_table_name = 'shop_payouts' then
    perform ps_money_audit_write('shop_payout', 'shop', new.shop_id::text, new.amount,
      jsonb_build_object('payoutId', new.id, 'method', new.method, 'reference', new.reference),
      new.paid_by);

  elsif tg_table_name = 'rider_payout_requests' then
    if old.status = 'pending' and new.status in ('paid', 'rejected') then
      perform ps_money_audit_write('rider_payout_' || new.status, 'rider', new.rider_id::text, new.amount,
        jsonb_build_object('payoutId', new.id, 'method', new.method,
                           'reference', new.reference, 'note', new.note),
        new.decided_by);
    end if;

  elsif tg_table_name = 'rider_settlements' then
    perform ps_money_audit_write('rider_settle', 'rider', new.rider_id::text, new.amount,
      jsonb_build_object('settlementId', new.id, 'method', new.method, 'reference', new.reference,
                         'netted', coalesce(to_jsonb(new) ->> 'netted_amount', '0')::bigint),
      new.settled_by);

  elsif tg_table_name = 'rider_settle_claims' then
    if old.status = 'pending' and new.status = 'rejected' then
      perform ps_money_audit_write('settle_claim_rejected', 'rider', new.rider_id::text, new.amount,
        jsonb_build_object('claimId', new.id, 'note', to_jsonb(new) ->> 'note'),
        nullif(to_jsonb(new) ->> 'decided_by', '')::uuid);
    end if;

  elsif tg_table_name = 'orders' then
    if old.payment_status = 'pending_verification' and new.payment_status in ('verified', 'rejected') then
      perform ps_money_audit_write('payment_' || new.payment_status, 'order', new.id::text, new.total,
        jsonb_build_object('payment', new.payment, 'shopId', new.shop_id));
    end if;

  elsif tg_table_name = 'rider_earnings' then
    if new.kind in ('adjustment', 'incentive') then
      perform ps_money_audit_write('rider_adjustment', 'rider', new.rider_id::text, new.amount,
        jsonb_build_object('kind', new.kind, 'note', new.note, 'orderId', new.order_id));
    end if;

  elsif tg_table_name = 'site_settings' then
    if new.key in ('rider_base_fee_paisa', 'rider_cod_handling_fee_paisa', 'rider_min_payout_paisa',
                   'rider_cash_cap_paisa', 'offer_ttl_seconds', 'delivery_max_attempts') then
      v_old := case when tg_op = 'UPDATE' then old.value end;  -- OLD does not exist on INSERT
      if v_old is distinct from new.value then
        perform ps_money_audit_write('rate_change', 'setting', new.key, null,
          jsonb_build_object('from', v_old, 'to', new.value));
      end if;
    elsif new.key = 'ops' then
      v_old := case when tg_op = 'UPDATE' then old.value -> 'wallets' end;
      v_new := new.value -> 'wallets';
      if v_new is distinct from v_old then
        -- The numbers customers pay into: log THAT they changed and which
        -- methods, never the numbers themselves.
        perform ps_money_audit_write('wallet_numbers_changed', 'setting', 'ops', null,
          jsonb_build_object('methods', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                                         from jsonb_object_keys(coalesce(v_new, '{}'::jsonb)) k)));
      end if;
    end if;
  end if;
  return null;
end $$;
revoke all on function ps_money_audit_trg() from public, anon, authenticated;

-- The trigger's WHEN clause filters by key as well; recreate it with the new keys.
do $$
begin
  if to_regclass('public.site_settings') is not null then
    drop trigger if exists trg_money_audit on site_settings;
    create trigger trg_money_audit after insert or update on site_settings
      for each row when (new.key in ('rider_base_fee_paisa', 'rider_cod_handling_fee_paisa',
                                     'rider_min_payout_paisa', 'rider_cash_cap_paisa',
                                     'offer_ttl_seconds', 'delivery_max_attempts', 'ops'))
      execute function ps_money_audit_trg();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

