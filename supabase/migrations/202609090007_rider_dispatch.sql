-- Phase 3 slice 7–10 completion: live rider dispatch actions.
-- Run after 005 (riders, delivery_assignments, settlements). The app layer
-- keeps the route gate (rider-auth); these security-definer functions own
-- the state changes and never trust the client.
begin;

-- Every order gets a delivery code so live rider verification matches the
-- 4-digit code shown to the customer at checkout. Existing rows backfill
-- deterministically on the first read below; new rows are set before insert.
create or replace function ps_set_order_delivery_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_code is null or new.delivery_code !~ '^[0-9]{4}$' then
    new.delivery_code := lpad(
      ((abs(hashtext(coalesce(new.order_no, new.id::text))) % 9000 + 1000)::text),
      4,
      '0'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_set_delivery_code on orders;
create trigger trg_orders_set_delivery_code
  before insert on orders
  for each row execute function ps_set_order_delivery_code();

update orders
set delivery_code = lpad(
  ((abs(hashtext(coalesce(order_no, id::text))) % 9000 + 1000)::text),
  4,
  '0'
)
where delivery_code is null
   or delivery_code !~ '^[0-9]{4}$';

-- A rider accepts only a live offer belonging to them.
create or replace function ps_rider_accept(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'offered' then
    raise exception 'assignment already handled';
  end if;
  update delivery_assignments set state = 'accepted' where id = v_assignment.id
  returning * into v_assignment;
  -- Accepting the offer is what marks the order as rider-assigned; the
  -- pickup RPC later moves it out for delivery.
  update orders
  set status = 'courier-assigned',
      rider_id = v_assignment.rider_id,
      updated_at = now()
  where id = v_assignment.order_id and status = 'ready-for-pickup';
  insert into order_status_history (order_id, status, note, changed_by)
  select v_assignment.order_id, 'courier-assigned',
         'Rider accepted the delivery offer', auth.uid()
  where exists (
    select 1 from orders o
    where o.id = v_assignment.order_id and o.status = 'courier-assigned'
  );
  return v_assignment;
end $$;

-- Pickup: assignment becomes picked_up, order moves out for delivery.
create or replace function ps_rider_pickup(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state not in ('accepted', 'picked_up') then
    raise exception 'pickup not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if v_order.status is distinct from 'out-for-delivery' then
    if v_order.status not in ('ready-for-pickup', 'courier-assigned') then
      raise exception 'order not ready for pickup';
    end if;
    update orders
    set status = 'out-for-delivery', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'out-for-delivery', 'Rider picked up the parcel', auth.uid());
  end if;

  if v_assignment.state is distinct from 'picked_up' then
    update delivery_assignments set state = 'picked_up' where id = v_assignment.id
    returning * into v_assignment;
  end if;
  return v_assignment;
end $$;

-- Delivery proof: verify the customer's 4-digit code, close the order, and
-- add COD cash to the rider's hand balance in the same transaction.
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with the customer code · COD collected',
      auth.uid()
    );
  end if;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_order.total
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

-- Rider cash settlement: create the settlement row and zero the hand balance.
create or replace function ps_rider_settle(p_method text, p_reference text default '')
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
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

commit;
