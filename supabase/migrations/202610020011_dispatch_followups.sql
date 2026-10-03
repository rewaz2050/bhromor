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
