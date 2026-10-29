-- Counter-pickup handover without the receipt.
--
-- The PIN remains the only normal way to close a pickup: it is never re-issued
-- and never shown to staff (202610260001). But that left a real dead end —
-- `ps_advance_order` refuses to move a pickup to delivered and
-- `ps_collect_pickup_order` needs the 4 digits, so a customer who lost the
-- confirmation on another device could never collect their parcel, by anyone,
-- ever. This file adds the narrow exception the approved model allows:
-- Admin/Super Admin only, a mandatory 10–300 character reason, and both the
-- reason and the actor written into the order timeline.
--
-- Deliberately NOT here: PIN re-issue, PIN display to staff, OTP (no funded
-- gateway exists), and any shop/rider/manager path. A counter override is an
-- operational exception with a name attached, not a second handover flow.
-- Requires 202610250001–250007 and 202610260001–260003.
begin;

create or replace function public.ps_admin_override_pickup(p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_assignment record;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  -- Admin/Super Admin only. ps_is_admin() also admits Manager, who runs
  -- operations but must not open a parcel's PIN gate.
  if auth.uid() is null or not exists (
    select 1 from admin_users
    where id = auth.uid() and role in ('admin', 'super_admin')
  ) then
    raise exception 'forbidden';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 300 then
    raise exception 'override reason required (10-300 characters)';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not coalesce(v_order.is_pickup, false) or coalesce(v_order.is_return, false) then
    raise exception 'not a counter pickup';
  end if;
  -- Serialize retries exactly like the PIN path: no duplicate delivery,
  -- history or ledger accounting.
  if v_order.status = 'delivered' then return jsonb_build_object('ok', true); end if;
  if v_order.status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
    raise exception 'pickup not ready';
  end if;
  if v_order.payment in ('bkash', 'nagad') and v_order.payment_status is distinct from 'verified' then
    raise exception 'payment not verified';
  end if;
  -- A rider holding the parcel is physical custody, not a counter problem.
  if exists (
    select 1 from delivery_assignments
    where order_id = p_order_id and state in ('accepted', 'picked_up')
  ) then
    raise exception 'rider delivery in progress';
  end if;

  -- Withdraw only pending invitations, never a rider's custody.
  for v_assignment in select id from delivery_assignments where order_id = p_order_id and state = 'offered' loop
    perform public.ps_cancel_assignment(v_assignment.id);
  end loop;

  -- Same machine as the verified handover, so stock, COD, wallet and
  -- accounting stay identical; only the PIN check is replaced by the reason.
  if v_order.status = 'ready-for-pickup' then
    perform public.ps_advance_order_internal(p_order_id, 'courier-assigned', null);
  end if;
  if v_order.status in ('ready-for-pickup', 'courier-assigned') then
    perform public.ps_advance_order_internal(p_order_id, 'out-for-delivery', null);
  end if;
  perform public.ps_advance_order_internal(
    p_order_id,
    'delivered',
    '[Pickup override — PIN not verified] ' || v_reason
  );
  update orders set delivery_code_attempts = 0, delivery_code_locked_until = null
  where id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ps_admin_override_pickup(uuid, text) from public, anon;
grant execute on function public.ps_admin_override_pickup(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
