-- Dispatch resume repair (2026-09-25 P0 fixes: H1, M1, H6-sweep).
--
-- H1: a rider DECLINE and an admin/manual WITHDRAW both wrote state='cancelled',
-- and ps_broadcast_order permanently excluded every cancelled rider. So after a
-- manual request expired, NONE of the previously invited riders could ever be
-- re-invited — the broadcast pool was dead and only brand-new riders qualified.
-- Now cancellations carry cancelled_by:
--   rider_decline = the rider said no → never auto re-offered (unchanged rule);
--   withdrawn     = admin withdrew one invitation → 5-minute cooldown, then eligible;
--   superseded    = replaced by an accept/manual offer → immediately eligible again.
-- After a manual request lapses, broadcasting resumes to the area at once.
--
-- M1: ps_assign_batch_to_rider skipped every check except readiness, and
-- ps_offer_order answered a confusing 'no eligible rider' for wallet orders
-- whose payment was never verified. Manual dispatch now refuses unverified
-- wallet orders with a clear 'payment not verified' error.
--
-- H6: ps_expire_stale_offers ran a full-table sweep on EVERY rider poll
-- (15s per rider), admin board poll and cron tick — including long-delivered
-- orders that merely own old expired rows. Now it only looks at open orders
-- and throttles itself: at most one real sweep per 10 seconds (p_force
-- bypasses the throttle for tests and manual runs).
begin;

alter table delivery_assignments add column if not exists cancelled_by text;

create table if not exists dispatch_sweep_state(
  id int primary key,
  last_run timestamptz not null default now()
);
alter table dispatch_sweep_state enable row level security;

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
  select p_order_id, r.id, 'offered', now(), now() + interval '90 seconds', true
  from riders r
  where r.status = 'active' and r.is_online and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_order.zone_id]
    and r.cash_in_hand < 500000 and r.current_load < 2
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
revoke all on function ps_broadcast_order(uuid) from public, anon, authenticated;
grant execute on function ps_broadcast_order(uuid) to service_role;

create or replace function ps_rider_reject(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then raise exception 'offer no longer available'; end if;
  update delivery_assignments set state = 'cancelled', cancelled_by = 'rider_decline'
    where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- The accept path marks losing invitations superseded (the order is assigned
-- now, so they are moot — but the label keeps the history honest).
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
     or v_rider.cash_in_hand >= 500000 or v_rider.current_load >= 2
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

create or replace function ps_offer_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_order orders%rowtype;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  select * into v_order from orders where id = p_order_id;
  if found and v_order.payment in ('bkash','nagad')
     and v_order.payment_status <> 'verified' then
    raise exception 'payment not verified';
  end if;
  v_id := ps_broadcast_order(p_order_id);
  if v_id is null then raise exception 'no eligible rider'; end if;
  return v_id;
end $$;

-- Manual fallback before acceptance, never steal an accepted/picked-up job.
-- Unverified wallet orders are skipped (verify first, then dispatch).
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
      and cash_in_hand < 500000 and current_load < 2) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function ps_cancel_assignment(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found'; end if;
  -- Same lock order as acceptance, so an accept racing withdrawal is safe.
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then
    raise exception 'only pending invitations can be withdrawn';
  end if;
  update delivery_assignments set state = 'cancelled', cancelled_by = 'withdrawn'
    where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- The sweep is service-only and throttled: rider feeds poll every 15 seconds
-- each, so without the throttle N riders mean N full sweeps per 15 seconds.
-- p_force=true is for tests and deliberate manual runs only.
drop function if exists ps_expire_stale_offers();
create or replace function ps_expire_stale_offers(p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v_order record; v_count int := 0; v_changed int;
begin
  if not coalesce(p_force, false) then
    insert into dispatch_sweep_state(id, last_run) values (1, now())
    on conflict (id) do update set last_run = now()
    where dispatch_sweep_state.last_run < now() - interval '10 seconds';
    get diagnostics v_changed = row_count;
    if v_changed = 0 then return 0; end if; -- another caller swept moments ago
  end if;
  for v_order in
    select o.id from orders o
    where o.status = 'ready-for-pickup'
       or (o.status in ('courier-assigned','out-for-delivery')
        and exists(select 1 from delivery_assignments a where a.order_id = o.id
          and a.state = 'offered' and a.expires_at <= now()))
    order by o.id for update of o skip locked
  loop
    update delivery_assignments set state = 'expired'
      where order_id = v_order.id and state = 'offered' and expires_at <= now();
    get diagnostics v_changed = row_count;
    v_count := v_count + v_changed;
    perform ps_broadcast_order(v_order.id);
  end loop;
  return v_count;
end $$;

-- Rider RPCs never needed the public browser key (they 403 without a rider
-- session anyway); lock them to signed-in callers like accept/reject.
-- Conditional: pickup/deliver/failed-attempt ship in earlier migrations that
-- a partial database (or the isolated SQL test) may not have applied yet.
-- ps_rider_deliver is locked in 202609250005 right after its rewrite.
do $$ begin
  if to_regprocedure('public.ps_rider_pickup(uuid)') is not null then
    revoke all on function ps_rider_pickup(uuid) from public, anon;
    grant execute on function ps_rider_pickup(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('public.ps_rider_failed_attempt(uuid, text)') is not null then
    revoke all on function ps_rider_failed_attempt(uuid, text) from public, anon;
    grant execute on function ps_rider_failed_attempt(uuid, text) to authenticated, service_role;
  end if;
end $$;
revoke all on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  from public, anon;
grant execute on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  to authenticated, service_role;
revoke all on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  to service_role;
revoke all on function ps_cancel_assignment(uuid) from public, anon;
grant execute on function ps_cancel_assignment(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
