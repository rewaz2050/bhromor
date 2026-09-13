-- ============================================================================
-- P1 #13 (2026-09-14): exchange at-home pickup — the rider reverse-logistics
-- leg on the 7-day exchange.
--
-- The return ORDER mechanics already exist (migration 017): ps_place_order
-- accepts is_return + return_parent_id and prices the leg at zero. What was
-- missing:
--   1. customer-side eligibility + request creation (7-day window from the
--      proven 'delivered' history entry, one return per parent);
--   2. the shop's approve/reject decision on a requested return;
--   3. the reverse leg itself: an approved return moves to
--      'ready-for-pickup' so the normal dispatch (ps_offer_order → rider
--      accept → pickup from the customer's home → drop at the shop) carries
--      it; rider pickup/drop events mirror onto return_status.
--
-- Nothing here pays anyone. A return is a zero-total, zero-charge order; the
-- exchange item or the cash goes through the shop's normal offline handling,
-- which is exactly what the statuses say out loud.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Eligibility. NULL when the customer may request; otherwise a reason code
--    the app maps to an honest message. The window is measured from the
--    latest 'delivered' entry in order_status_history — the proven moment,
--    not a guess — and a parent with a live return (requested/approved/
--    picked_up) can only ever have one.
-- ---------------------------------------------------------------------------
create or replace function ps_return_eligible(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from orders o where o.id = p_order_id and o.status = 'delivered'
    ) then 'not-delivered'
    when exists (
      select 1 from orders r
      where r.return_parent_id = p_order_id
        and r.return_status in ('requested', 'approved', 'picked_up')
    ) then 'already-requested'
    when (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) is null then 'no-delivery-record'
    when now() > (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) + interval '7 days' then 'window-expired'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Customer request → the zero-charge return order via ps_place_order.
--    Items, address, zone and geo come from the parent order itself, so the
--    rider's pickup leg is exactly the doorstep the order was delivered to.
--    (ps_place_order re-validates every product — a delisted item fails
--    honestly here and the shop handles it manually.)
-- ---------------------------------------------------------------------------
create or replace function ps_create_return_request(
  p_order_id uuid,
  p_reason text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent orders%rowtype;
  v_reason text;
  v_items jsonb;
begin
  select * into v_parent from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if ps_return_eligible(p_order_id) is not null then
    raise exception 'not eligible: %', ps_return_eligible(p_order_id);
  end if;

  v_reason := left(
    trim(coalesce(p_reason, '')) || ' — ' || trim(coalesce(p_details, '')),
    500
  );
  if length(v_reason) < 5 then raise exception 'reason too short'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'qty', qty,
      'variant_id', variant_id
    )
  ), '[]'::jsonb) into v_items
  from order_items where order_id = p_order_id;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'no items on parent order';
  end if;

  return ps_place_order(jsonb_build_object(
    'customer_name', v_parent.customer_name,
    'customer_phone', v_parent.customer_phone,
    'area', v_parent.area,
    'address', v_parent.address,
    'note', 'Return pickup (' || left(coalesce(p_reason, ''), 80) || ')',
    'zone_id', v_parent.zone_id,
    'lat', v_parent.lat,
    'lng', v_parent.lng,
    'is_return', true,
    'return_parent_id', p_order_id,
    'return_reason', v_reason
  ), v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Shop decision on a REQUESTED return, and manual completion. Approving
--    moves the return order to 'ready-for-pickup' — the state ps_offer_order
--    dispatches — so the existing rider leg (offer → accept → pickup from
--    the customer's home → deliver at the shop) is the reverse logistics.
-- ---------------------------------------------------------------------------
create or replace function ps_return_action(
  p_order_id uuid,
  p_action text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
begin
  select * into v from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not coalesce(v.is_return, false) then
    raise exception 'not a return order';
  end if;

  if p_action = 'approve' then
    if v.return_status <> 'requested' then
      raise exception 'only a requested return can be approved';
    end if;
    if v.status <> 'pending' then
      raise exception 'return order already moved on';
    end if;
    update orders
    set return_status = 'approved', status = 'ready-for-pickup'
    where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, 'ready-for-pickup', 'Return approved — rider pickup ready');
  elsif p_action = 'reject' then
    if v.return_status <> 'requested' then
      raise exception 'only a requested return can be rejected';
    end if;
    update orders
    set return_status = 'rejected', status = 'cancelled'
    where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, 'cancelled',
            'Return rejected: ' || left(trim(coalesce(p_note, '')), 200));
  elsif p_action = 'complete' then
    if v.return_status not in ('approved', 'picked_up') then
      raise exception 'return leg not finished';
    end if;
    update orders set return_status = 'refunded' where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, v.status,
            'Return completed by shop: ' || left(trim(coalesce(p_note, '')), 200));
  else
    raise exception 'unknown action: %', p_action;
  end if;

  return v.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Mirror the rider's leg onto return_status, so the customer's tracking
--    (and the shop) see the same truth the riders act on. The order row
--    itself still moves through the normal ps_rider_* flow.
-- ---------------------------------------------------------------------------
create or replace function ps_return_leg_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
begin
  if new.state in ('picked_up', 'delivered')
     and old.state not in ('picked_up', 'delivered') then
    select * into v from orders where id = new.order_id;
    if found and coalesce(v.is_return, false) and v.return_status is not null then
      if new.state = 'picked_up' and v.return_status = 'approved' then
        update orders set return_status = 'picked_up' where id = v.id;
        insert into order_status_history (order_id, status, note)
        values (v.id, v.status, 'Return item picked up from the customer');
      elsif new.state = 'delivered'
            and v.return_status in ('approved', 'picked_up') then
        update orders set return_status = 'refunded' where id = v.id;
        insert into order_status_history (order_id, status, note)
        values (v.id, v.status,
                'Return item received by the shop — exchange/refund handled by the shop');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_return_leg_sync on delivery_assignments;
create trigger trg_return_leg_sync
  after update of state on delivery_assignments
  for each row execute function ps_return_leg_sync();

commit;
