-- Delivery PIN brute-force guard (2026-09-25 P0 fix: H4).
--
-- ps_rider_deliver never counted wrong codes: the only throttle was the
-- API rate limit, so a rider holding the parcel could guess the 4-digit
-- code indefinitely. Now 5 wrong codes lock code entry for 15 minutes
-- (visible in history for staff), and a success resets the counter.
--
-- Two calls by design: a RAISE rolls the whole transaction back, so a
-- counter incremented on the failing statement could never persist.
-- ps_rider_deliver_check counts the attempt and COMMITS it (it only raises
-- for forbidden/state errors, never for a wrong code); ps_rider_deliver
-- then re-verifies read-only and completes the delivery.
begin;

alter table orders add column if not exists delivery_code_attempts int not null default 0;
alter table orders add column if not exists delivery_code_locked_until timestamptz;

-- 'ok' | 'mismatch' | 'locked'. Wrong codes are counted here and persist
-- because this function succeeds (returns) instead of raising for them.
create or replace function ps_rider_deliver_check(p_assignment_id uuid, p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_attempts int;
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
  if v_order.delivery_code_locked_until is not null
     and v_order.delivery_code_locked_until > now() then
    return 'locked';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    update orders set delivery_code_attempts = delivery_code_attempts + 1, updated_at = now()
    where id = v_order.id
    returning delivery_code_attempts into v_attempts;
    if v_attempts >= 5 then
      update orders set delivery_code_locked_until = now() + interval '15 minutes'
      where id = v_order.id;
      insert into order_status_history (order_id, status, note, changed_by)
      values (v_order.id, v_order.status,
        'Delivery code locked after 5 wrong attempts', auth.uid());
      return 'locked';
    end if;
    return 'mismatch';
  end if;
  return 'ok';
end $$;

create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
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
  -- Read-only re-verification: attempts are counted by
  -- ps_rider_deliver_check (a raise here would roll any count back).
  if v_order.delivery_code_locked_until is not null
     and v_order.delivery_code_locked_until > now() then
    raise exception 'delivery code locked — too many wrong attempts, try again in 15 minutes';
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

  -- P1 #8: the rider only ever carries cash for COD orders — a wallet order
  -- was paid into the shop's own bKash/Nagad wallet at checkout.
  v_cash := case when v_order.payment = 'cod' then v_order.total else 0 end;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · '
        || case
             when v_order.payment = 'bkash' then 'paid via bKash at checkout'
             when v_order.payment = 'nagad' then 'paid via Nagad at checkout'
             else 'COD collected'
           end,
      auth.uid()
    );
  end if;

  update orders
  set delivery_code_attempts = 0, delivery_code_locked_until = null, updated_at = now()
  where id = v_order.id;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

revoke all on function ps_rider_deliver_check(uuid, text) from public, anon;
grant execute on function ps_rider_deliver_check(uuid, text) to authenticated, service_role;
revoke all on function ps_rider_deliver(uuid, text, text) from public, anon;
grant execute on function ps_rider_deliver(uuid, text, text) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
