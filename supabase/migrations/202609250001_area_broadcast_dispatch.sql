-- Area broadcast: many invitations, exactly one winning rider.
-- Apply after 202609240003. No customer pickup orders are dispatched.
begin;

-- Keep the legacy index name for the existing health probe, but invitations
-- no longer reserve an order. Only a rider who accepts owns it.
drop index if exists delivery_assignments_one_live_offer;
create unique index delivery_assignments_one_live_offer
  on delivery_assignments(order_id) where state in ('accepted', 'picked_up');
create unique index if not exists delivery_assignments_one_rider_offer
  on delivery_assignments(order_id, rider_id)
  where state in ('offered', 'accepted', 'picked_up');
alter table delivery_assignments add column if not exists is_broadcast boolean not null default false;

-- Invitations must not count as work (or broadcasting fills every rider).
create or replace function ps_track_rider_load()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'UPDATE' then
    if OLD.state in ('accepted','picked_up') and NEW.state not in ('accepted','picked_up') then
      update riders set current_load = greatest(0, current_load - 1),
        total_deliveries = total_deliveries + case when NEW.state = 'delivered' then 1 else 0 end
      where id = OLD.rider_id;
    elsif OLD.state not in ('accepted','picked_up') and NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'DELETE' and OLD.state in ('accepted','picked_up') then
    update riders set current_load = greatest(0, current_load - 1) where id = OLD.rider_id;
  end if;
  return coalesce(NEW, OLD);
end $$;
update riders r set current_load = (
  select count(*) from delivery_assignments a
  where a.rider_id = r.id and a.state in ('accepted','picked_up')
);

-- Internal helper. Every dispatch writer locks the order before its offers.
-- "Area" means the checkout delivery zone, already maintained in zone_ids.
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
        and (a.state in ('offered','accepted','picked_up','cancelled')
          or a.offered_at > now() - interval '5 minutes'))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;
revoke all on function ps_broadcast_order(uuid) from public, anon, authenticated;
grant execute on function ps_broadcast_order(uuid) to service_role;

create or replace function ps_auto_dispatch_ready_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready-for-pickup' and old.status is distinct from new.status then
    perform ps_broadcast_order(new.id);
  end if;
  return new;
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
     or v_rider.cash_in_hand >= 500000 or v_rider.current_load >= 2
     or (v_assignment.is_broadcast and (
       not ps_rider_on_shift(v_rider) or not (v_rider.zone_ids @> array[v_order.zone_id]))) then
    raise exception 'rider not available';
  end if;
  if coalesce(v_order.is_pickup, false)
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    raise exception 'order not ready for dispatch';
  end if;
  update delivery_assignments set state = 'cancelled'
    where order_id = v_order.id and id <> p_assignment_id and state = 'offered';
  update delivery_assignments set state = 'accepted' where id = p_assignment_id
    returning * into v_assignment;
  update orders set status = 'courier-assigned', rider_id = v_rider.id, updated_at = now()
    where id = v_order.id;
  insert into order_status_history(order_id, status, note, changed_by)
    values(v_order.id, 'courier-assigned', 'First rider accepted the delivery request', auth.uid());
  return v_assignment;
end $$;

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
  update delivery_assignments set state = 'cancelled' where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- Existing cron and rider polling invoke this service-only RPC. It also
-- retries waiting orders: riders coming online later need no admin action.
create or replace function ps_expire_stale_offers()
returns int language plpgsql security definer set search_path = public as $$
declare v_order record; v_count int := 0; v_changed int;
begin
  for v_order in
    select o.id from orders o
    where o.status = 'ready-for-pickup'
      or exists(select 1 from delivery_assignments a where a.order_id = o.id
        and a.state = 'offered' and a.expires_at <= now())
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

create or replace function ps_offer_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  v_id := ps_broadcast_order(p_order_id);
  if v_id is null then raise exception 'no eligible rider'; end if;
  return v_id;
end $$;

-- Manual fallback before acceptance, never steal an accepted/picked-up job.
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_oid uuid; v_count int := 0; v_order orders%rowtype;
begin
  for v_oid in select distinct unnest(coalesce(p_order_ids, '{}'::uuid[])) order by 1 loop
    select * into v_order from orders where id = v_oid for update;
    if not found or v_order.status <> 'ready-for-pickup'
       or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null then continue; end if;
    if not exists(select 1 from riders where id = p_rider_id and status = 'active' and is_online
      and cash_in_hand < 500000 and current_load < 2) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  from public, anon;
grant execute on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  to authenticated;
revoke all on function ps_expire_stale_offers(), ps_assign_batch_to_rider(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function ps_expire_stale_offers(), ps_assign_batch_to_rider(uuid, uuid[])
  to service_role;
notify pgrst, 'reload schema';
commit;
