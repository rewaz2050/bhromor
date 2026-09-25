-- PASTE 7/24 · 07_dispatch_withdraw_resume-sql.sql
-- Source: supabase/migrations/202609250003_dispatch_withdraw_resume.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;

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

commit;
