-- PART 11/11 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: two-tap order flow (202609170001) ====
-- ============================================================================
-- 202609170001 — two-tap order flow (audit #2, 2026-09-17, §2)
-- ============================================================================
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to re-run.
-- Ends with a VERIFY select — expect 2 × OK.
--
-- WHY
--   ps_advance_order enforced "exactly +1 position" on ps_order_flow, so a
--   shop had to tap three times per order — Confirm → Preparing → Ready —
--   before the auto-dispatch trigger could offer it to a rider. For a
--   45-minute hyperlocal shop the middle tap is bookkeeping, not a decision.
--
-- WHAT
--   1. ps_advance_order additionally accepts confirmed → ready-for-pickup
--      (skipping 'preparing'). Every other rule is untouched: strictly
--      forward, no other skips, cancel only from pending/confirmed/preparing,
--      wallet orders still need a verified payment before fulfilment starts,
--      vendors still limited to confirm/preparing/ready/cancel of THEIR shop.
--      The enum, ps_order_flow, dispatch trigger, ledger, returns, reports:
--      all unchanged — 'preparing' stays a legal state (Advanced tap in the
--      admin UI, and existing rows keep their history).
--   2. ps_checkout_health() gains `two_tap_flow_ok` (version 202609170001)
--      so /api/health → checks.twoTapFlow and the admin banner can name this
--      file until it has run.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. ps_advance_order — same body as 202609140007 (+ 0003's return shape),
--    plus the one extra legal move.
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

-- ----------------------------------------------------------------------------
-- 2. ps_checkout_health — 202609160005 body + two_tap_flow_ok
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609170001',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true),
    'dispatch_reoffer_ok', (
      not exists (
        select 1 from pg_constraint k
        where k.conrelid = 'public.delivery_assignments'::regclass
          and k.conname = 'delivery_assignments_order_id_key'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_live_offer'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
          and p.prosrc not like '%rider_assignments%'
      )
    ),
    -- 202609170001: confirmed → ready-for-pickup is a legal admin/vendor move.
    'two_tap_flow_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_advance_order'
        and p.prosrc like '%v_order.status = ''confirmed'' and p_to = ''ready-for-pickup''%'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- VERIFY — expect 2 × OK.
-- ----------------------------------------------------------------------------
select 'confirmed → ready-for-pickup allowed (two-tap flow)' as check_,
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_advance_order'
           and p.prosrc like '%v_order.status = ''confirmed'' and p_to = ''ready-for-pickup''%')
       then 'OK' else 'MISSING' end as state
union all
select '/api/health probe knows it',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_checkout_health'
           and p.prosrc like '%two_tap_flow_ok%')
       then 'OK' else 'MISSING' end;


-- ==== Feature: area broadcast dispatch (202609250001) ====
-- Area broadcast: many invitations, exactly one winning rider.
-- Apply after 202609240003. No customer pickup orders are dispatched.
begin;

-- Keep the legacy index name for the existing health probe, but invitations
-- no longer reserve an order. Only a rider who accepts owns it.
drop index if exists delivery_assignments_one_live_offer;
create unique index delivery_assignments_one_live_offer
  on delivery_assignments(order_id) where state in ('accepted', 'picked_up');
create unique index if not exists delivery_assignments_one_rider_offer
  on delivery_assignments(order_id, rider_id)
  where state in ('offered', 'accepted', 'picked_up');
alter table delivery_assignments add column if not exists is_broadcast boolean not null default false;

-- Invitations must not count as work (or broadcasting fills every rider).
create or replace function ps_track_rider_load()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'UPDATE' then
    if OLD.state in ('accepted','picked_up') and NEW.state not in ('accepted','picked_up') then
      update riders set current_load = greatest(0, current_load - 1),
        total_deliveries = total_deliveries + case when NEW.state = 'delivered' then 1 else 0 end
      where id = OLD.rider_id;
    elsif OLD.state not in ('accepted','picked_up') and NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'DELETE' and OLD.state in ('accepted','picked_up') then
    update riders set current_load = greatest(0, current_load - 1) where id = OLD.rider_id;
  end if;
  return coalesce(NEW, OLD);
end $$;
update riders r set current_load = (
  select count(*) from delivery_assignments a
  where a.rider_id = r.id and a.state in ('accepted','picked_up')
);

-- Internal helper. Every dispatch writer locks the order before its offers.
-- "Area" means the checkout delivery zone, already maintained in zone_ids.
create or replace function ps_broadcast_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready-for-pickup'
     or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    return null;
  end if;
  if exists (select 1 from delivery_assignments where order_id = p_order_id
    and (state in ('accepted','picked_up') or (state = 'offered' and not is_broadcast))) then
    return null; -- a manual offer is exclusive until it expires/is declined
  end if;

  insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at, is_broadcast)
  select p_order_id, r.id, 'offered', now(), now() + interval '90 seconds', true
  from riders r
  where r.status = 'active' and r.is_online and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_order.zone_id]
    and r.cash_in_hand < 500000 and r.current_load < 2
    and not exists (select 1 from delivery_assignments a
      where a.order_id = p_order_id and a.rider_id = r.id
        and (a.state in ('offered','accepted','picked_up','cancelled')
          or a.offered_at > now() - interval '5 minutes'))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;
revoke all on function ps_broadcast_order(uuid) from public, anon, authenticated;
grant execute on function ps_broadcast_order(uuid) to service_role;

create or replace function ps_auto_dispatch_ready_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready-for-pickup' and old.status is distinct from new.status then
    perform ps_broadcast_order(new.id);
  end if;
  return new;
end $$;

create or replace function ps_rider_accept(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_rider riders%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  -- Different invitation IDs share this one lock: only the first can win.
  select * into v_order from orders where id = v_assignment.order_id for update;
  select * into v_rider from riders where id = v_assignment.rider_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' or v_assignment.expires_at <= now()
     or v_order.status <> 'ready-for-pickup' or v_order.rider_id is not null then
    raise exception 'offer no longer available';
  end if;
  if v_rider.status <> 'active' or not v_rider.is_online
     or v_rider.cash_in_hand >= 500000 or v_rider.current_load >= 2
     or (v_assignment.is_broadcast and (
       not ps_rider_on_shift(v_rider) or not (v_rider.zone_ids @> array[v_order.zone_id]))) then
    raise exception 'rider not available';
  end if;
  if coalesce(v_order.is_pickup, false)
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    raise exception 'order not ready for dispatch';
  end if;
  update delivery_assignments set state = 'cancelled'
    where order_id = v_order.id and id <> p_assignment_id and state = 'offered';
  update delivery_assignments set state = 'accepted' where id = p_assignment_id
    returning * into v_assignment;
  update orders set status = 'courier-assigned', rider_id = v_rider.id, updated_at = now()
    where id = v_order.id;
  insert into order_status_history(order_id, status, note, changed_by)
    values(v_order.id, 'courier-assigned', 'First rider accepted the delivery request', auth.uid());
  return v_assignment;
end $$;

create or replace function ps_rider_reject(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then raise exception 'offer no longer available'; end if;
  update delivery_assignments set state = 'cancelled' where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- Existing cron and rider polling invoke this service-only RPC. It also
-- retries waiting orders: riders coming online later need no admin action.
create or replace function ps_expire_stale_offers()
returns int language plpgsql security definer set search_path = public as $$
declare v_order record; v_count int := 0; v_changed int;
begin
  for v_order in
    select o.id from orders o
    where o.status = 'ready-for-pickup'
      or exists(select 1 from delivery_assignments a where a.order_id = o.id
        and a.state = 'offered' and a.expires_at <= now())
    order by o.id for update of o skip locked
  loop
    update delivery_assignments set state = 'expired'
      where order_id = v_order.id and state = 'offered' and expires_at <= now();
    get diagnostics v_changed = row_count;
    v_count := v_count + v_changed;
    perform ps_broadcast_order(v_order.id);
  end loop;
  return v_count;
end $$;

create or replace function ps_offer_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  v_id := ps_broadcast_order(p_order_id);
  if v_id is null then raise exception 'no eligible rider'; end if;
  return v_id;
end $$;

-- Manual fallback before acceptance, never steal an accepted/picked-up job.
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_oid uuid; v_count int := 0; v_order orders%rowtype;
begin
  for v_oid in select distinct unnest(coalesce(p_order_ids, '{}'::uuid[])) order by 1 loop
    select * into v_order from orders where id = v_oid for update;
    if not found or v_order.status <> 'ready-for-pickup'
       or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null then continue; end if;
    if not exists(select 1 from riders where id = p_rider_id and status = 'active' and is_online
      and cash_in_hand < 500000 and current_load < 2) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  from public, anon;
grant execute on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  to authenticated;
revoke all on function ps_expire_stale_offers(), ps_assign_batch_to_rider(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function ps_expire_stale_offers(), ps_assign_batch_to_rider(uuid, uuid[])
  to service_role;
notify pgrst, 'reload schema';
commit;


-- ==== Feature: dispatch cancellation guard (202609250002) ====
-- Verification repair: cancelling an accepted/picked-up assignment used to
-- leave its order assigned to nobody, and could strand a collected parcel.
-- The dispatch board withdraws pending invitations only. Changing an active
-- trip requires a separate controlled recovery flow, not this button.
begin;
create or replace function ps_cancel_assignment(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found'; end if;
  -- Same lock order as acceptance, so an accept racing withdrawal is safe.
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then
    raise exception 'only pending invitations can be withdrawn';
  end if;
  update delivery_assignments set state = 'cancelled' where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;
revoke all on function ps_cancel_assignment(uuid) from public, anon;
grant execute on function ps_cancel_assignment(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
