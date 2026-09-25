-- PASTE 11/23 · 11_delivery_pin_lockout-sql.sql
-- Source: supabase/migrations/202609250005_delivery_pin_lockout.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
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

commit;
