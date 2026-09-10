-- Delivery proof via Cloudinary + failed attempts + dynamic ETA prep
-- Serial 2: Delivery proof + rider proof upload

begin;

-- Extend ps_rider_deliver to accept Cloudinary proof URL
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
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

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · COD collected',
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

-- Failed delivery attempt tracking
create or replace function ps_rider_failed_attempt(p_assignment_id uuid, p_reason text)
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
  if v_assignment.state not in ('accepted','picked_up') then
    raise exception 'failed attempt not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  update orders
  set delivery_attempts = delivery_attempts + 1,
      delivery_failed_reason = trim(p_reason),
      updated_at = now()
  where id = v_order.id;

  insert into order_status_history (order_id, status, note, changed_by)
  values (
    v_order.id,
    v_order.status,
    'Delivery attempt failed: ' || trim(p_reason),
    auth.uid()
  );

  return v_assignment;
end $$;

-- Dynamic ETA helper: based on zone + rider queue + time of day
create or replace function ps_dynamic_eta(p_zone_id text, p_shop_prep int default 15)
returns text
language plpgsql as $$
declare
  v_base int;
  v_queue int;
  v_hour int;
  v_extra int := 0;
begin
  select case
    when p_zone_id = 'z1' then 35
    when p_zone_id = 'z2' then 45
    when p_zone_id = 'z3' then 55
    else 70
  end into v_base;

  -- Count active deliveries in this zone
  select count(*) into v_queue from orders
  where zone_id = p_zone_id and status in ('courier-assigned','out-for-delivery');

  v_hour := extract(hour from now() at time zone 'Asia/Dhaka');
  if v_hour >= 20 or v_hour < 6 then
    v_extra := 10; -- night
  elsif v_hour between 12 and 14 or v_hour between 18 and 20 then
    v_extra := 10; -- lunch/dinner rush
  end if;

  v_base := v_base + p_shop_prep + (v_queue * 5) + v_extra;
  return (v_base - 5)::text || '–' || (v_base + 5)::text || ' min';
end $$;

commit;
