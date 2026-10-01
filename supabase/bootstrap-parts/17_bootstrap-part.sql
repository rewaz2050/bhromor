-- PART 17/17 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: rider fixes Phase A (202610010001) ====
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
--   E (N8). ADMIN COULD HAND-DELIVER AN ORDER A RIDER WAS CARRYING.
--      Marking an order delivered from the admin panel skipped the customer PIN,
--      the proof, the rider's COD custody and the rider's earnings, left the
--      assignment open forever, yet still wrote the shop ledger. ps_advance_order
--      now refuses 'delivered' while a rider assignment is accepted/picked_up
--      (counter pickups are unaffected). ps_admin_release_assignment is the
--      sanctioned override: it takes the job from an unresponsive rider — back
--      to the area queue if the parcel was never collected, or into the
--      failed-delivery list if the rider has it.
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

-- ----------------------------------------------------------------------------
-- E. Admin cannot hand-deliver an order a rider is carrying.
--    ps_advance_order = the 202609170001 body + the guard below (same
--    signature → grants stand). ps_admin_release_assignment is the sanctioned
--    way to take a job away from an unresponsive rider.
-- ----------------------------------------------------------------------------
create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
  v_is_admin boolean;
  v_shop uuid;
  v_payment_rejected boolean;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if p_to not in ('confirmed', 'preparing', 'ready-for-pickup', 'cancelled') then
      raise exception 'forbidden';
    end if;
  end if;

  -- P1 #8: a bKash/Nagad order may not START FULFILMENT before the shop has
  -- verified the payment in its own wallet (ps_verify_payment flips
  -- payment_status to 'verified'). 'confirmed' and 'cancelled' stay legal —
  -- canceling releases the reservation via trg_orders_release_on_cancel.
  if v_order.payment in ('bkash', 'nagad')
     and v_order.payment_status = 'pending_verification'
     and p_to in ('preparing', 'ready-for-pickup', 'courier-assigned', 'out-for-delivery', 'delivered') then
    raise exception 'payment not verified';
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;

  -- 202610010001 (N8): a home-delivery order with a rider on it is closed ONLY
  -- by that rider (ps_rider_deliver: customer PIN + proof + COD custody + the
  -- rider's earnings). A manual "delivered" here skipped all four, left the
  -- assignment open forever and wrote the shop ledger while no cash was on any
  -- rider's books. Staff who need to override first release the rider
  -- (ps_admin_release_assignment). Counter pickups never have a rider.
  if p_to = 'delivered'
     and not coalesce(v_order.is_pickup, false)
     and exists (
       select 1 from delivery_assignments
       where order_id = p_order_id and state in ('accepted', 'picked_up')
     ) then
    raise exception 'rider delivery in progress';
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
    -- 202609170001: the one allowed skip — Confirmed straight to Ready for
    -- pickup ("two-tap flow"). 'preparing' is optional bookkeeping now.
    if v_to_pos <> v_from_pos + 1
       and not (v_order.status = 'confirmed' and p_to = 'ready-for-pickup') then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  -- P1 #8 (2): a cancelled wallet order's payment is settled as REJECTED —
  -- the customer's track page says "not accepted", never "under
  -- verification" on a cancelled order.
  v_payment_rejected := p_to = 'cancelled'
    and v_order.payment in ('bkash', 'nagad')
    and v_order.payment_status = 'pending_verification';

  update orders
  set status = p_to,
      payment_status = case when v_payment_rejected then 'rejected' else payment_status end,
      payment_verified_at = case when v_payment_rejected then now() else payment_verified_at end,
      updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  if v_payment_rejected then
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, p_to,
      'Payment rejected — order cancelled (refund from the shop wallet, offline)',
      auth.uid());
  end if;
  return v_order;
end $$;

create or replace function ps_admin_release_assignment(p_assignment_id uuid, p_reason text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  if length(v_reason) < 5 then
    raise exception 'a reason is required';
  end if;
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  if v_assignment.state not in ('accepted', 'picked_up') then
    raise exception 'assignment not active';
  end if;
  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if v_assignment.state = 'accepted' then
    -- The parcel never left the shop: free the rider (5-minute cooldown, like
    -- any withdrawal) and put the order back in the area queue.
    update delivery_assignments
    set state = 'cancelled', cancelled_by = 'withdrawn'
    where id = v_assignment.id
    returning * into v_assignment;
    update orders
    set rider_id = null, status = 'ready-for-pickup', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'ready-for-pickup', 'Rider released by staff: ' || v_reason, auth.uid());
  else
    -- The parcel is with the rider: it is a failed delivery for staff to
    -- resolve (redispatch once the shop has it back, or cancel).
    update delivery_assignments
    set state = 'failed', failed_reason = 'Released by staff: ' || v_reason
    where id = v_assignment.id
    returning * into v_assignment;
    update orders
    set rider_id = null, delivery_failed_at = now(), updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, v_order.status,
            'Rider released by staff with the parcel in hand: ' || v_reason
              || ' — redispatch or cancel from Deliveries.', auth.uid());
  end if;
  return v_assignment;
end $$;

revoke all on function ps_admin_release_assignment(uuid, text) from public, anon;
grant execute on function ps_admin_release_assignment(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: payment verifier (202610010002) ====
-- ============================================================================
-- D (N6, 2026-10-01) — WHO VERIFIES A bKash/Nagad PAYMENT IS PROSANTI'S CHOICE.
--
-- Until now ps_verify_payment let BOTH staff and the owning shop decide, while
-- the wallet numbers customers pay are PROSANTI's own (site_settings ops
-- .wallets). So a shop could "verify" money it cannot see, or staff and shop
-- could race each other. Now each shop carries a verifier setting that admin
-- controls (Admin → Shops → edit):
--
--   platform → only PROSANTI staff decide this shop's wallet payments
--   shop     → only the owning shop decides them (staff must switch the
--              setting back to step in)
--   both     → either may decide (DEFAULT = the old behaviour; nothing changes
--              for any shop until admin picks something else)
--
-- Money accounting is unchanged: customers still pay PROSANTI's wallet and
-- shop_ledger still credits the shop's payable at delivery. The history note
-- now says WHO decided. Idempotent; same signature → grants stand.
-- ============================================================================

begin;

alter table shops add column if not exists payment_verifier text not null default 'both';
alter table shops drop constraint if exists shops_payment_verifier_check;
alter table shops add constraint shops_payment_verifier_check
  check (payment_verifier in ('platform', 'shop', 'both'));

create or replace function ps_verify_payment(p_order_id uuid, p_action text, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_is_admin boolean;
  v_shop uuid;
  v_pv text := 'both';
  v_by text;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Who may decide is PROSANTI's choice per shop (shops.payment_verifier):
  --   'platform' → staff only, 'shop' → the owning shop only, 'both' → either
  -- (the behaviour before 202610010002, so it stays the default). An order
  -- with no shop is staff-only business.
  if v_order.shop_id is not null then
    select coalesce(payment_verifier, 'both') into v_pv
    from shops where id = v_order.shop_id;
    v_pv := coalesce(v_pv, 'both');
  end if;
  if v_is_admin then
    if v_pv = 'shop' then
      raise exception 'payment verification delegated to the shop';
    end if;
    v_by := 'PROSANTI staff';
  else
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if v_pv = 'platform' then
      raise exception 'payment verification reserved for the platform';
    end if;
    v_by := 'the shop';
  end if;

  if v_order.payment = 'cod' then
    raise exception 'not a wallet payment';
  end if;
  if v_order.payment_status <> 'pending_verification' then
    raise exception 'payment already decided';
  end if;

  -- P1 #8 (2): a cancelled order can never be VERIFIED — the order is over,
  -- the money is not in. Rows cancelled BEFORE the auto-reject rule still
  -- need a decision, so REJECT stays legal and settles them (re-setting
  -- status='cancelled' is a no-op: the release trigger only fires on the
  -- transition into cancelled, so stock cannot be released twice).
  if v_order.status = 'cancelled' and p_action = 'verified' then
    raise exception 'order already cancelled';
  end if;

  if p_action = 'verified' then
    -- The shop checked its own bKash/Nagad wallet: the money is in, this is
    -- the moment the order may start fulfilment.
    update orders
    set payment_status = 'verified', payment_verified_at = now(), updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, v_order.status,
      upper(left(v_order.payment, 1)) || right(v_order.payment, length(v_order.payment) - 1) || ' payment verified by ' || v_by,
      auth.uid());
  elsif p_action = 'rejected' then
    -- No matching money in the wallet: the order is cancelled and the
    -- reservation goes back to the shelf (trg_orders_release_on_cancel).
    -- The refund to the customer's wallet is the shop's offline handling.
    update orders
    set payment_status = 'rejected', payment_verified_at = now(),
        status = 'cancelled', updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, 'cancelled',
      'Payment rejected by ' || v_by || coalesce(' — ' || trim(coalesce(p_note, '')), '') ||
      ' (refund from the shop wallet, offline)',
      auth.uid());
  else
    raise exception 'unknown payment action';
  end if;

  select * into v_order from orders where id = p_order_id;
  return v_order;
end $$;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: net P&L (202610010003) ====
-- ============================================================================
-- G (N7, 2026-10-01) — A NET PROFIT & LOSS FOR THE PLATFORM.
--
-- Admin → Money showed "Platform income" as four gross cards: commission,
-- delivery charge, TIPS (which belong to the riders, not the platform) and
-- "rider pay" (tips + fees mixed). Nothing told the owner whether the platform
-- actually makes money per delivery once riders are paid and discounts are
-- absorbed.
--
-- ps_admin_money_pnl(p_from, p_to) answers that from the ledgers, for any
-- window (null = open end). Recognition date of an order = its delivery moment.
--
--   + commission                     shop_ledger.commission (delivered orders)
--   + delivery & surcharge income    orders.delivery_charge
--   + shop-funded free delivery      the waived charge the shop pays back out of
--                                    its payable (202609260003)
--   − rider pay                      rider_earnings delivery_fee + cod_handling
--                                    + incentive (+ signed adjustments)
--   − platform-funded discounts      orders.discount − the part the SHOP funds
--                                    (shop_ledger.promo_discount): the shop's
--                                    payable ignores platform coupons, so the
--                                    platform eats them
--   = net operating result
--
-- Tips are pass-through and reported OUTSIDE the result (collected vs credited
-- to riders). Staff-only on the caller's own JWT (ps_is_admin()). Read-only,
-- idempotent.
-- ============================================================================

begin;

create or replace function ps_admin_money_pnl(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;

  with base as (
    select o.id,
           -- orders has no delivered_at: the rider's stamp, else the moment the
           -- 'delivered' history line was written, else the last touch.
           coalesce(
             (select max(a.delivered_at) from delivery_assignments a
               where a.order_id = o.id and a.state = 'delivered'),
             (select min(h.created_at) from order_status_history h
               where h.order_id = o.id and h.status = 'delivered'),
             o.updated_at
           ) as at,
           coalesce(o.delivery_charge, 0) as delivery_charge,
           coalesce(o.discount, 0) as discount,
           coalesce(o.tip_amount, 0) as tip_amount,
           coalesce(o.is_return, false) as is_return,
           case when coalesce(to_jsonb(o)->>'free_delivery_by', '') = 'shop'
                then coalesce((to_jsonb(o)->>'free_delivery_waived')::bigint, 0)
                else 0 end as shop_free_delivery
    from orders o
    where o.status = 'delivered'
  ),
  win as (
    select * from base
    where (p_from is null or at >= p_from)
      and (p_to is null or at < p_to)
  ),
  led as (
    select l.order_id,
           coalesce(l.commission, 0) as commission,
           -- promo_discount exists only after 202609280003 → read via jsonb.
           coalesce((to_jsonb(l)->>'promo_discount')::bigint, 0) as promo_discount
    from shop_ledger l
    join win on win.id = l.order_id
  ),
  earn as (
    select kind, amount
    from rider_earnings
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at < p_to)
  )
  select jsonb_build_object(
    'deliveredOrders', (select count(*) from win where not is_return),
    'returnLegs', (select count(*) from win where is_return),
    'commission', coalesce((select sum(commission) from led), 0),
    'deliveryIncome', coalesce((select sum(delivery_charge) from win), 0),
    'shopFundedFreeDelivery', coalesce((select sum(shop_free_delivery) from win), 0),
    'riderFees', coalesce((select sum(amount) from earn
                           where kind in ('delivery_fee', 'cod_handling', 'incentive')), 0),
    'riderAdjustments', coalesce((select sum(amount) from earn where kind = 'adjustment'), 0),
    'discountsGiven', coalesce((select sum(discount) from win), 0),
    'shopFundedDiscounts', coalesce((select sum(promo_discount) from led), 0),
    'tipsCollected', coalesce((select sum(tip_amount) from win), 0),
    'tipsToRiders', coalesce((select sum(amount) from earn where kind = 'tip'), 0)
  ) into v;
  return v;
end $$;

revoke all on function ps_admin_money_pnl(timestamptz, timestamptz) from public, anon;
grant execute on function ps_admin_money_pnl(timestamptz, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: COD netting (202610010004) ====
-- COD netting (2026-10-01, audit item K).
--
-- A rider can simultaneously OWE the platform cash (riders.cash_in_hand, the
-- COD they collected) and BE OWED by it (riders.earnings_balance, the wallet).
-- Settling the two separately means the rider hands over ৳5,000 and the
-- platform then wires the same rider ৳1,200 back. This lets staff NET them:
--
--   netted = least(cash_in_hand, earnings_balance)
--   cash the rider physically hands over = cash_in_hand − netted
--
-- • The cash debt is fully cleared (rider_settlements.amount = the whole debt;
--   rider_settlements.netted_amount = the part paid from the wallet).
-- • The wallet is debited by a NEGATIVE journal row kind 'cod_netting' that
--   points at the settlement, so riders.earnings_balance stays = Σ journal.
-- • 'cod_netting' is not income: the rider's today/week/lifetime and the admin
--   P&L both count only named earning kinds, so neither is distorted.
-- • Staff-only, opt-in per settlement (default false = exactly the old flow).
-- Safe to re-run.
begin;

alter table rider_settlements
  add column if not exists netted_amount int not null default 0
  check (netted_amount >= 0);

alter table rider_earnings
  add column if not exists settlement_id uuid references rider_settlements (id);

alter table rider_earnings drop constraint if exists rider_earnings_kind_check;
alter table rider_earnings
  add constraint rider_earnings_kind_check
  check (kind in (
    'tip', 'delivery_fee', 'cod_handling', 'incentive',
    'payout', 'payout_refund', 'adjustment', 'cod_netting'
  ));

alter table rider_earnings drop constraint if exists rider_earnings_order_kind_check;
alter table rider_earnings
  add constraint rider_earnings_order_kind_check
  check (order_id is not null
         or kind in ('payout', 'payout_refund', 'adjustment', 'incentive', 'cod_netting'));

-- A netting row is a debit and always names its settlement.
alter table rider_earnings drop constraint if exists rider_earnings_netting_check;
alter table rider_earnings
  add constraint rider_earnings_netting_check
  check ((kind = 'cod_netting') = (settlement_id is not null)
         and (kind <> 'cod_netting' or amount < 0));

-- The signature gains a parameter, so the old one must go (two overloads would
-- make PostgREST named-argument calls ambiguous). Old 3-arg callers still work
-- through the default.
drop function if exists ps_admin_settle_rider(uuid, text, text);

create or replace function ps_admin_settle_rider(
  p_rider_id uuid,
  p_method text default 'cash',
  p_reference text default '',
  p_net_wallet boolean default false
)
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
  v_netted bigint := 0;
  v_ref text := coalesce(trim(p_reference), '');  -- the netted part is in netted_amount
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

  -- earnings_balance is already net of any pending payout request (the hold is
  -- debited when the rider asks), so only free wallet money can be netted.
  if coalesce(p_net_wallet, false) and v_rider.earnings_balance > 0 then
    v_netted := least(v_rider.cash_in_hand::bigint, v_rider.earnings_balance::bigint);
  end if;

  insert into rider_settlements (rider_id, amount, netted_amount, method, reference, settled_by)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    v_netted,
    coalesce(nullif(trim(p_method), ''), 'cash'),
    v_ref,
    auth.uid()
  )
  returning * into v_settlement;

  if v_netted > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount, settlement_id, note)
    values (v_rider.id, null, 'cod_netting', -v_netted, v_settlement.id,
            'COD cash netted against wallet');
    update riders
    set earnings_balance = earnings_balance - v_netted
    where id = v_rider.id;
  end if;

  update riders set cash_in_hand = 0 where id = v_rider.id;
  update rider_settle_claims
  set status = 'approved', decided_at = now(), decided_by = auth.uid()
  where rider_id = v_rider.id and status = 'pending';
  return v_settlement;
end $$;

revoke all on function ps_admin_settle_rider(uuid, text, text, boolean) from public, anon;
grant execute on function ps_admin_settle_rider(uuid, text, text, boolean) to authenticated, service_role;

commit;

-- ==== Feature: vendor sees the rider (202610010005) ====
-- Vendor sees who is coming for the parcel (2026-10-01, audit item H / B5).
--
-- A shop used to press "Ready — request riders" and then see NOTHING: not who
-- accepted, not a number to call when the parcel is waiting. Shops cannot read
-- riders / delivery_assignments (RLS is admin / own-rider only), so this is a
-- narrow SECURITY DEFINER read:
--   • only the OWNING shop (orders.shop_id = ps_vendor_shop()) gets an answer;
--   • only while a rider is actually on the job (accepted / picked_up) — the
--     rider's phone is not exposed for offers, finished or failed jobs;
--   • only name, phone, vehicle and the job state; nothing financial.
-- Returns NULL when there is nobody to show. Safe to re-run.
begin;

create or replace function ps_vendor_order_rider(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_shop uuid := ps_vendor_shop();
  v jsonb;
begin
  if v_shop is null then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
           'name', r.name,
           'phone', r.phone,
           'vehicle', r.vehicle,
           'state', a.state
         )
    into v
  from delivery_assignments a
  join riders r on r.id = a.rider_id
  join orders o on o.id = a.order_id
  where a.order_id = p_order_id
    and o.shop_id = v_shop
    and a.state in ('accepted', 'picked_up')
  order by a.offered_at desc
  limit 1;
  return v; -- null when the order is not this shop's or nobody is on it
end $$;

revoke all on function ps_vendor_order_rider(uuid) from public, anon;
grant execute on function ps_vendor_order_rider(uuid) to authenticated, service_role;

commit;

