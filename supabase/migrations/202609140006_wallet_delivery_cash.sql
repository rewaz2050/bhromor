-- ============================================================================
-- P1 #8 follow-up (2026-09-14): wallet-aware delivery cash.
--
-- ps_rider_deliver credited the rider's cash_in_hand with the FULL order
-- total and logged "COD collected" — true for cash orders, wrong for a
-- bKash/Nagad order, where the customer already paid the shop's wallet at
-- checkout and the rider collects nothing. Over-crediting the hand balance
-- also skewed the ৳5,000 cash-cap gating in dispatch.
--
-- This re-creates ps_rider_deliver (the 202609090013 delivery-proof version)
-- unchanged except:
--   * cash_in_hand gains the total only when the order is actually COD;
--   * the history note says what really happened on the doorstep.
-- ============================================================================

begin;

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

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

commit;
