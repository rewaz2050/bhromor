-- Phase 3 slice 7: dispatch engine + admin deliveries board.
-- Run after 007. Adds the automatic offer when an order reaches
-- ready-for-pickup, plus admin-facing assign/cancel RPCs. The rider side
-- (accept/pickup/deliver/settle) stays in 007; this migration only creates
-- the offer and lets staff intervene when no rider was available.

begin;

-- Pick the next eligible rider for an order. Fairness starts simple:
-- longest-idle (oldest created_at) among active + online riders whose home
-- zones include the order zone and who are not already carrying an order.
-- GPS-based nearest-first stays a documented hardening step.
create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select r.id
  from riders r
  cross join lateral (
    select o.zone_id
    from orders o
    where o.id = p_order_id
  ) o
  where r.status = 'active'
    and r.is_online
    and r.zone_ids @> array[o.zone_id]
    and r.cash_in_hand < 500000
    and not exists (
      select 1
      from delivery_assignments a
      where a.rider_id = r.id
        and a.state in ('offered', 'accepted', 'picked_up')
    )
    -- rotate: never re-offer to a rider who already saw this order
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.created_at asc
  limit 1;
$$;

-- Automatic dispatch trigger: when an order becomes ready-for-pickup offer
-- it to exactly one eligible rider. Runs inside the same update as the
-- vendor/staff status move and is idempotent through the unique order_id.
create or replace function ps_auto_dispatch_ready_order()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rider_id uuid;
begin
  if new.status <> 'ready-for-pickup'
     or old.status = 'ready-for-pickup'
     or exists (
       select 1 from delivery_assignments where order_id = new.id
     ) then
    return new;
  end if;

  v_rider_id := ps_next_eligible_rider(new.id);
  if v_rider_id is not null then
    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (new.id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_auto_dispatch on orders;
create trigger trg_orders_auto_dispatch
  after update on orders
  for each row execute function ps_auto_dispatch_ready_order();

-- Staff intervention: create an offer for an order that has no live
-- assignment. Used by Admin → Deliveries "Assign" when auto-dispatch found
-- nobody, or to re-offer after a cancelled/expired assignment.
create or replace function ps_offer_order(p_order_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_assignment_id uuid;
  v_rider_id      uuid;
  v_order_status  text;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;

  select status into v_order_status from orders where id = p_order_id;
  if v_order_status is null then
    raise exception 'order not found';
  end if;
  if v_order_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
    raise exception 'order not ready for dispatch';
  end if;
  if exists (
    select 1 from delivery_assignments
    where order_id = p_order_id and state in ('offered', 'accepted', 'picked_up')
  ) then
    raise exception 'assignment already active';
  end if;

  v_rider_id := ps_next_eligible_rider(p_order_id);
  if v_rider_id is null then
    raise exception 'no eligible rider';
  end if;
  insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
  values (p_order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds')
  returning id into v_assignment_id;
  return v_assignment_id;
end $$;

-- Staff closes a live assignment (wrong rider, order cancelled, etc.).
create or replace function ps_expire_stale_offers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_row record;
  v_rider_id uuid;
begin
  for v_row in
    select da.id, da.order_id
    from delivery_assignments da
    join orders o on o.id = da.order_id
    where da.state = 'offered' and da.expires_at < now()
    for update of da
  loop
    update delivery_assignments
    set state = 'expired'
    where id = v_row.id;

    -- Re-offer the same order to the next eligible rider if it still needs
    -- delivery. This is the simplest round-robin retry; no-eligible-rider
    -- leaves the order on the Admin → Deliveries awaiting board.
    if (
      select o.status from orders o where o.id = v_row.order_id
    ) in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery')
       and not exists (
         select 1 from delivery_assignments
         where order_id = v_row.order_id
           and state in ('offered', 'accepted', 'picked_up')
       ) then
      v_rider_id := ps_next_eligible_rider(v_row.order_id);
      if v_rider_id is not null then
        insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
        values (v_row.order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
      end if;
    end if;
    v_count := coalesce(v_count, 0) + 1;
  end loop;
  return coalesce(v_count, 0);
end $$;

-- Staff settles a rider's cash in hand and records the pay-in. Unlike the
-- rider self-settle, staff choose the rider and the method/reference.
create or replace function ps_admin_settle_rider(
  p_rider_id uuid,
  p_method text default 'cash',
  p_reference text default ''
)
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_rider from riders where id = p_rider_id for update;
  if not found then
    raise exception 'rider not found';
  end if;
  if v_rider.cash_in_hand <= 0 then
    raise exception 'nothing to settle';
  end if;
  insert into rider_settlements (rider_id, amount, method, reference, settled_by)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(trim(p_method), 'cash'),
    coalesce(trim(p_reference), ''),
    auth.uid()
  )
  returning * into v_settlement;
  update riders set cash_in_hand = 0 where id = v_rider.id;
  return v_settlement;
end $$;

-- Staff closes a live assignment (wrong rider, order cancelled, etc.).
create or replace function ps_cancel_assignment(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_assignment
  from delivery_assignments where id = p_assignment_id
  for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  if v_assignment.state in ('delivered') then
    raise exception 'delivered assignment cannot be cancelled';
  end if;
  update delivery_assignments
  set state = 'cancelled'
  where id = v_assignment.id
  returning * into v_assignment;
  return v_assignment;
end $$;

commit;
