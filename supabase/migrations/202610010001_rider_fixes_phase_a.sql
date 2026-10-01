-- ============================================================================
-- Rider fixes, phase A (2026-10-01) — docs/AUDIT-RIDER-MONEY-2026-10-01.md
--
--   B (N4). RETURN LEGS PAID A COD HANDLING FEE FOR COLLECTING NO CASH.
--      A return pickup is a zero-total order whose `payment` column simply
--      defaults to 'cod'. ps_rider_deliver credited `cod_handling` for every
--      order with payment = 'cod', so each return leg paid the rider a fee for
--      handling cash that never existed. The fee now requires v_cash > 0
--      (cash actually collected). The base fee still applies: the rider did
--      drive the leg.
--
--   C (N5). A FAILED DELIVERY ATTEMPT LEFT EVERYTHING HANGING.
--      ps_rider_failed_attempt only bumped a counter and wrote a history line.
--      The assignment stayed live (the rider kept the load slot forever), the
--      order stayed out-for-delivery with the rider's live GPS still visible to
--      the customer, there was no limit on attempts, and staff had no way out:
--      "Awaiting dispatch" listed the order, but ps_offer_order needs
--      ready-for-pickup, so "Send area requests" always answered
--      "no eligible rider". Now:
--        * a rider can only report a failure for a parcel in hand (picked_up);
--        * delivery_max_attempts (site_settings, default 2, clamp 1..5) caps it;
--        * on the final attempt the assignment ends as 'failed' (rider freed,
--          load released), orders.rider_id is cleared (tracking stops) and
--          orders.delivery_failed_at flags the order for staff;
--        * ps_admin_resolve_failed_delivery lets staff REDISPATCH (back to
--          ready-for-pickup → area broadcast) or CANCEL (stock released by the
--          existing cancel trigger; a prepaid order is flagged for refund).
--      No cash is ever collected on a failed attempt, so COD custody is untouched.
--
-- Idempotent — safe to re-run. Same signature as 202609300002 → grants stand.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- B. ps_rider_deliver — the 202609300002 body, COD handling gated on cash.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
  v_base_fee bigint;
  v_cod_fee bigint;
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

  update delivery_assignments
  set state = 'delivered',
      -- coalesce: keep the first stamp if this is ever re-run under a repair.
      delivered_at = coalesce(delivered_at, now())
  where id = v_assignment.id
  returning * into v_assignment;

  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;

  -- 202609300001 (A): the tip is the RIDER's — 100%, exactly as both UIs
  -- promise. The unique index makes the journal insert the once-only gate;
  -- FOUND is false when the row was already there, so the wallet never
  -- double-moves even under a repaired re-run.
  if coalesce(v_order.tip_amount, 0) > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'tip', v_order.tip_amount)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_order.tip_amount
      where id = v_assignment.rider_id;
    end if;
  end if;

  -- Phase 2 (C): the configured per-delivery pay. Defaults are 0 → a delivery
  -- credits nothing until the owner sets rates in Admin → Money; the journal
  -- then keeps the two halves separate so the rider's statement can show
  -- "delivery fee" and "COD handling" as their own lines.
  v_base_fee := greatest(ps_setting_int('rider_base_fee_paisa', 0), 0);
  if v_base_fee > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'delivery_fee', v_base_fee)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_base_fee
      where id = v_assignment.rider_id;
    end if;
  end if;

  v_cod_fee := greatest(ps_setting_int('rider_cod_handling_fee_paisa', 0), 0);
  -- Only when cash was actually collected: a return leg (a zero-total order
  -- whose payment column merely defaults to 'cod') or a fully discounted COD
  -- order moves no money, so there is nothing to "handle".
  if v_cod_fee > 0 and v_order.payment = 'cod' and v_cash > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'cod_handling', v_cod_fee)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_cod_fee
      where id = v_assignment.rider_id;
    end if;
  end if;

  return v_assignment;
end $$;
-- ----------------------------------------------------------------------------
-- C. Failed delivery flow.
-- ----------------------------------------------------------------------------
alter table orders add column if not exists delivery_failed_at timestamptz;
alter table delivery_assignments add column if not exists failed_reason text;

-- Widen the assignment state check to include 'failed'. The old inline check is
-- dropped by DEFINITION (it is auto-named), then re-added.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.delivery_assignments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%offered%'
  loop
    execute format('alter table public.delivery_assignments drop constraint %I', c.conname);
  end loop;
end $$;
alter table delivery_assignments
  add constraint delivery_assignments_state_check
  check (state in ('offered', 'accepted', 'picked_up', 'delivered', 'cancelled', 'expired', 'failed'));

create or replace function ps_rider_failed_attempt(p_assignment_id uuid, p_reason text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_max int := least(greatest(ps_setting_int('delivery_max_attempts', 2), 1), 5);
  v_attempts int;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  -- A customer-side failure only exists once the parcel is in the rider's hands.
  if v_assignment.state <> 'picked_up' then
    raise exception 'failed attempt not allowed from %', v_assignment.state;
  end if;
  if length(v_reason) < 5 then
    raise exception 'a reason is required';
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  v_attempts := coalesce(v_order.delivery_attempts, 0) + 1;
  update orders
  set delivery_attempts = v_attempts,
      delivery_failed_reason = v_reason,
      updated_at = now()
  where id = v_order.id;

  insert into order_status_history (order_id, status, note, changed_by)
  values (
    v_order.id,
    v_order.status,
    'Delivery attempt ' || v_attempts || '/' || v_max || ' failed: ' || v_reason,
    auth.uid()
  );

  if v_attempts >= v_max then
    -- Final attempt: the rider is released (the load trigger frees the slot),
    -- the customer stops seeing the rider's GPS, and staff get an action item.
    update delivery_assignments
    set state = 'failed', failed_reason = v_reason
    where id = v_assignment.id
    returning * into v_assignment;
    update orders
    set rider_id = null, delivery_failed_at = now(), updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      v_order.status,
      'Final failed attempt — rider must return the parcel to the shop. Staff: redispatch or cancel.',
      auth.uid()
    );
  end if;

  return v_assignment;
end $$;

create or replace function ps_admin_resolve_failed_delivery(
  p_order_id uuid,
  p_action text,
  p_note text default null
)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_action text := lower(coalesce(trim(p_action), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  if v_action not in ('redispatch', 'cancel') then
    raise exception 'action must be redispatch or cancel';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.delivery_failed_at is null or v_order.status in ('delivered', 'cancelled') then
    raise exception 'no failed delivery to resolve';
  end if;

  if v_action = 'redispatch' then
    -- Back to the area queue: the status change fires the broadcast trigger.
    update orders
    set status = 'ready-for-pickup', rider_id = null, delivery_attempts = 0,
        delivery_failed_at = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'ready-for-pickup',
            'Failed delivery — redispatched to the area' || coalesce(': ' || v_note, ''), auth.uid());
  else
    update orders
    set status = 'cancelled', rider_id = null, delivery_failed_at = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'cancelled',
            'Failed delivery — order cancelled' || coalesce(': ' || v_note, '')
              || case when v_order.payment in ('bkash', 'nagad')
                       and coalesce(to_jsonb(v_order)->>'payment_status', '') = 'verified'
                      then ' · PREPAID: refund the customer offline' else '' end,
            auth.uid());
  end if;
  return v_order;
end $$;

revoke all on function ps_rider_failed_attempt(uuid, text) from public, anon;
grant execute on function ps_rider_failed_attempt(uuid, text) to authenticated, service_role;
revoke all on function ps_admin_resolve_failed_delivery(uuid, text, text) from public, anon;
grant execute on function ps_admin_resolve_failed_delivery(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
