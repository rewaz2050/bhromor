-- PART 12/12 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: dispatch withdraw/resume + settle claims + PIN lockout + health (202609250003…006) ====
-- P0 audit fixes (2026-09-25): superseded riders resume instantly after manual
-- expiry, rider self-settle becomes a staff-approved claim, the delivery PIN
-- locks for 15 minutes after 5 wrong codes, and the health probe covers all four.

-- Dispatch resume repair (2026-09-25 P0 fixes: H1, M1, H6-sweep).
--
-- H1: a rider DECLINE and an admin/manual WITHDRAW both wrote state='cancelled',
-- and ps_broadcast_order permanently excluded every cancelled rider. So after a
-- manual request expired, NONE of the previously invited riders could ever be
-- re-invited — the broadcast pool was dead and only brand-new riders qualified.
-- Now cancellations carry cancelled_by:
--   rider_decline = the rider said no → never auto re-offered (unchanged rule);
--   withdrawn     = admin withdrew one invitation → 5-minute cooldown, then eligible;
--   superseded    = replaced by an accept/manual offer → immediately eligible again.
-- After a manual request lapses, broadcasting resumes to the area at once.
--
-- M1: ps_assign_batch_to_rider skipped every check except readiness, and
-- ps_offer_order answered a confusing 'no eligible rider' for wallet orders
-- whose payment was never verified. Manual dispatch now refuses unverified
-- wallet orders with a clear 'payment not verified' error.
--
-- H6: ps_expire_stale_offers ran a full-table sweep on EVERY rider poll
-- (15s per rider), admin board poll and cron tick — including long-delivered
-- orders that merely own old expired rows. Now it only looks at open orders
-- and throttles itself: at most one real sweep per 10 seconds (p_force
-- bypasses the throttle for tests and manual runs).
begin;

alter table delivery_assignments add column if not exists cancelled_by text;

create table if not exists dispatch_sweep_state(
  id int primary key,
  last_run timestamptz not null default now()
);
alter table dispatch_sweep_state enable row level security;

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
        and (a.state in ('offered','accepted','picked_up')
          -- A rider who declined this order is never auto re-offered it.
          or (a.state = 'cancelled' and a.cancelled_by = 'rider_decline')
          -- Withdrawn/expired invitations cool down for five minutes; rows
          -- superseded by an accept or a manual offer re-qualify at once, so
          -- broadcasting resumes to the area the moment a manual request ends.
          or (a.state in ('cancelled','expired')
            and coalesce(a.cancelled_by, 'withdrawn') <> 'superseded'
            and a.offered_at > now() - interval '5 minutes')))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;
revoke all on function ps_broadcast_order(uuid) from public, anon, authenticated;
grant execute on function ps_broadcast_order(uuid) to service_role;

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
  update delivery_assignments set state = 'cancelled', cancelled_by = 'rider_decline'
    where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- The accept path marks losing invitations superseded (the order is assigned
-- now, so they are moot — but the label keeps the history honest).
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
  update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
    where order_id = v_order.id and id <> p_assignment_id and state = 'offered';
  update delivery_assignments set state = 'accepted' where id = p_assignment_id
    returning * into v_assignment;
  update orders set status = 'courier-assigned', rider_id = v_rider.id, updated_at = now()
    where id = v_order.id;
  insert into order_status_history(order_id, status, note, changed_by)
    values(v_order.id, 'courier-assigned', 'First rider accepted the delivery request', auth.uid());
  return v_assignment;
end $$;

create or replace function ps_offer_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_order orders%rowtype;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  select * into v_order from orders where id = p_order_id;
  if found and v_order.payment in ('bkash','nagad')
     and v_order.payment_status <> 'verified' then
    raise exception 'payment not verified';
  end if;
  v_id := ps_broadcast_order(p_order_id);
  if v_id is null then raise exception 'no eligible rider'; end if;
  return v_id;
end $$;

-- Manual fallback before acceptance, never steal an accepted/picked-up job.
-- Unverified wallet orders are skipped (verify first, then dispatch).
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_oid uuid; v_count int := 0; v_order orders%rowtype;
begin
  for v_oid in select distinct unnest(coalesce(p_order_ids, '{}'::uuid[])) order by 1 loop
    select * into v_order from orders where id = v_oid for update;
    if not found or v_order.status <> 'ready-for-pickup'
       or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null then continue; end if;
    if v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified' then continue; end if;
    if not exists(select 1 from riders where id = p_rider_id and status = 'active' and is_online
      and cash_in_hand < 500000 and current_load < 2) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

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
  update delivery_assignments set state = 'cancelled', cancelled_by = 'withdrawn'
    where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- The sweep is service-only and throttled: rider feeds poll every 15 seconds
-- each, so without the throttle N riders mean N full sweeps per 15 seconds.
-- p_force=true is for tests and deliberate manual runs only.
drop function if exists ps_expire_stale_offers();
create or replace function ps_expire_stale_offers(p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v_order record; v_count int := 0; v_changed int;
begin
  if not coalesce(p_force, false) then
    insert into dispatch_sweep_state(id, last_run) values (1, now())
    on conflict (id) do update set last_run = now()
    where dispatch_sweep_state.last_run < now() - interval '10 seconds';
    get diagnostics v_changed = row_count;
    if v_changed = 0 then return 0; end if; -- another caller swept moments ago
  end if;
  for v_order in
    select o.id from orders o
    where o.status = 'ready-for-pickup'
       or (o.status in ('courier-assigned','out-for-delivery')
        and exists(select 1 from delivery_assignments a where a.order_id = o.id
          and a.state = 'offered' and a.expires_at <= now()))
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

-- Rider RPCs never needed the public browser key (they 403 without a rider
-- session anyway); lock them to signed-in callers like accept/reject.
-- Conditional: pickup/deliver/failed-attempt ship in earlier migrations that
-- a partial database (or the isolated SQL test) may not have applied yet.
-- ps_rider_deliver is locked in 202609250005 right after its rewrite.
do $$ begin
  if to_regprocedure('public.ps_rider_pickup(uuid)') is not null then
    revoke all on function ps_rider_pickup(uuid) from public, anon;
    grant execute on function ps_rider_pickup(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('public.ps_rider_failed_attempt(uuid, text)') is not null then
    revoke all on function ps_rider_failed_attempt(uuid, text) from public, anon;
    grant execute on function ps_rider_failed_attempt(uuid, text) to authenticated, service_role;
  end if;
end $$;
revoke all on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  from public, anon;
grant execute on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  to authenticated, service_role;
revoke all on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  to service_role;
revoke all on function ps_cancel_assignment(uuid) from public, anon;
grant execute on function ps_cancel_assignment(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
-- Settle-claim approval (2026-09-25 P0 fix: H3).
--
-- ps_rider_settle used to zero the rider's own cash balance with no proof and
-- no review: one tap wiped up to ৳5,000 of COD debt. Now a rider files a
-- settle CLAIM (one pending per rider); the balance only moves when staff
-- settle the rider through the existing admin flow, which approves the claim.
-- Staff can also reject a claim with a note instead of settling.
begin;

create table if not exists rider_settle_claims(
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(id) on delete cascade,
  amount bigint not null check (amount > 0),
  method text not null default 'cash',
  reference text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  note text
);
create unique index if not exists rider_settle_claims_one_pending
  on rider_settle_claims(rider_id) where status = 'pending';
alter table rider_settle_claims enable row level security;

-- Return type changes rider_settlements -> rider_settle_claims, so the old
-- function must be dropped (CREATE OR REPLACE cannot change the type).
drop function if exists ps_rider_settle(text, text);
create function ps_rider_settle(p_method text, p_reference text default '')
returns rider_settle_claims
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_claim rider_settle_claims%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  if v_rider.cash_in_hand <= 0 then
    raise exception 'nothing to settle';
  end if;
  if exists (select 1 from rider_settle_claims
             where rider_id = v_rider.id and status = 'pending') then
    raise exception 'settle already pending';
  end if;
  insert into rider_settle_claims (rider_id, amount, method, reference)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(nullif(trim(p_method), ''), 'cash'),
    coalesce(trim(p_reference), '')
  )
  returning * into v_claim;
  return v_claim;
end $$;

-- Staff settle keeps settling the FULL current hand balance (the rider may
-- have delivered more since claiming) and approves the pending claim, if any.
create or replace function ps_admin_settle_rider(
  p_rider_id uuid,
  p_method text default 'cash',
  p_reference text default ''
)
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
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
  insert into rider_settlements (rider_id, amount, method, reference, settled_by)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(nullif(trim(p_method), ''), 'cash'),
    coalesce(trim(p_reference), ''),
    auth.uid()
  )
  returning * into v_settlement;
  update riders set cash_in_hand = 0 where id = v_rider.id;
  update rider_settle_claims
  set status = 'approved', decided_at = now(), decided_by = auth.uid()
  where rider_id = v_rider.id and status = 'pending';
  return v_settlement;
end $$;

-- Staff reject a rider's pending claim (money never arrived). The rider's
-- balance is untouched; they can file a fresh claim after paying.
create or replace function ps_admin_reject_settle(
  p_rider_id uuid,
  p_note text default null
)
returns rider_settle_claims
language plpgsql security definer set search_path = public as $$
declare v_claim rider_settle_claims%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_claim from rider_settle_claims
  where rider_id = p_rider_id and status = 'pending' for update;
  if not found then
    raise exception 'no pending claim';
  end if;
  update rider_settle_claims
  set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
      note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_claim.id
  returning * into v_claim;
  return v_claim;
end $$;

revoke all on function ps_rider_settle(text, text) from public, anon;
grant execute on function ps_rider_settle(text, text) to authenticated, service_role;
revoke all on function ps_admin_settle_rider(uuid, text, text) from public, anon;
grant execute on function ps_admin_settle_rider(uuid, text, text) to authenticated, service_role;
revoke all on function ps_admin_reject_settle(uuid, text) from public, anon;
grant execute on function ps_admin_reject_settle(uuid, text) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
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
-- Health coverage for the area-dispatch repairs (2026-09-25 P0 fix: M6).
--
-- ps_checkout_health stopped at 202609170001, so a database missing the
-- broadcast/resume/settle/lockout migrations reported "healthy" while
-- dispatch silently ran the older behaviour. Three new flags let
-- /api/health and the admin banner name the exact missing file.
begin;

create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609250006',
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
    ),
    -- 202609250001+003: area broadcast with withdraw/decline resume.
    'broadcast_resume_ok', (
      to_regprocedure('public.ps_broadcast_order(uuid)') is not null
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'delivery_assignments'
          and c.column_name = 'cancelled_by'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_rider_offer'
      )
      and to_regprocedure('public.ps_expire_stale_offers(boolean)') is not null
    ),
    -- 202609250004: rider settle claims need staff approval.
    'settle_claims_ok', (
      exists (
        select 1 from information_schema.tables t
        where t.table_schema = 'public' and t.table_name = 'rider_settle_claims'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_admin_reject_settle'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_settle'
          and p.prosrc like '%settle already pending%'
      )
    ),
    -- 202609250005: delivery PIN locks after 5 wrong codes.
    'pin_lockout_ok', (
      exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'orders'
          and c.column_name = 'delivery_code_locked_until'
      )
      and to_regprocedure('public.ps_rider_deliver_check(uuid, text)') is not null
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_deliver'
          and p.prosrc like '%delivery_code_locked_until%'
      )
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

commit;

-- ==== Feature: instant rider offers over Realtime (202609250007) ====
-- Speed pass (2026-09-25): delivery_assignments joins the realtime
-- publication so offers push in <1s; health probe v202609250007.

-- Instant rider offers over Supabase Realtime (speed pass, 2026-09-25).
--
-- The rider job feed polls /api/rider/jobs every 15 s, so a new offer can
-- sit unseen for 15 s of its 90 s window — and every poll costs an RPC plus
-- several reads per online rider. Publishing delivery_assignments lets the
-- app subscribe to its own rows and refresh the instant an offer lands
-- (or expires under it); the 15 s poll stays as the offline backup.
--
-- postgres_changes only delivers rows the subscriber can SELECT, and policy
-- "assignments rider read own" (rider_id = ps_rider_id()) already restricts
-- riders to their own rows — no new RLS needed, no customer PII flows
-- (customer data lives on orders, which stays unpublished).
begin;

do $$ begin
  -- The publication exists on Supabase; a bare local PostgreSQL used for
  -- the workflow test creates it in the test setup.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'delivery_assignments'
     ) then
    alter publication supabase_realtime add table delivery_assignments;
  end if;
end $$;

create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609250007',
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
    ),
    -- 202609250001+003: area broadcast with withdraw/decline resume.
    'broadcast_resume_ok', (
      to_regprocedure('public.ps_broadcast_order(uuid)') is not null
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'delivery_assignments'
          and c.column_name = 'cancelled_by'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_rider_offer'
      )
      and to_regprocedure('public.ps_expire_stale_offers(boolean)') is not null
    ),
    -- 202609250004: rider settle claims need staff approval.
    'settle_claims_ok', (
      exists (
        select 1 from information_schema.tables t
        where t.table_schema = 'public' and t.table_name = 'rider_settle_claims'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_admin_reject_settle'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_settle'
          and p.prosrc like '%settle already pending%'
      )
    ),
    -- 202609250005: delivery PIN locks after 5 wrong codes.
    'pin_lockout_ok', (
      exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'orders'
          and c.column_name = 'delivery_code_locked_until'
      )
      and to_regprocedure('public.ps_rider_deliver_check(uuid, text)') is not null
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_deliver'
          and p.prosrc like '%delivery_code_locked_until%'
      )
    ),
    -- 202609250007: delivery_assignments published for instant offers.
    'realtime_offers_ok', exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'delivery_assignments'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

commit;

