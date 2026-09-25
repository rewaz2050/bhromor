-- PART 10/12 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Admin repair: order status updates, payment verify, rider guard (202609160003) ====
-- ============================================================================
-- Checkout repair 3 (2026-09-16): NO order status could be changed, no
-- bKash/Nagad payment could be verified, and riders could not deliver.
-- ============================================================================
-- Symptom in Admin → Orders: "Mark confirmed" (and Cancel, Preparing, …,
-- Delivered — every button) answers "Could not update the order." Orders
-- arrive, nothing can move.
--
-- Reproduced on a fresh bootstrap by calling ps_advance_order as a staff
-- user. Every UPDATE on orders fails with
--
--   22P02  invalid input value for enum ps_order_status: ""
--
-- The trigger ps_write_shop_ledger (202609090017_delivery_remaining.sql,
-- also inside bootstrap-fresh.sql) tests
--
--   coalesce(old.status, '') <> 'delivered'
--
-- but orders.status is the ENUM ps_order_status and '' is not one of its
-- labels, so the comparison itself raises — on EVERY update of the row,
-- delivered or not, because trg_orders_ledger_on_delivered fires on every
-- UPDATE OF status. The original 202609090004 version used
-- `old.status is distinct from 'delivered'`, which is what the enum needs.
--
-- This re-creates the ledger writer with the null-safe enum comparison and
-- keeps everything the 0017 version added (delivery/tip/surcharge split,
-- negative payable for return orders, upsert).
--
-- Found by the same audit — ps_verify_payment (202609140004 / 202609140007)
-- ends with
--
--   return (select * from orders where id = p_order_id);
--
-- which plpgsql parses as a SCALAR subquery: 42601 "subquery must return
-- only one column". The function body runs, then the RETURN raises and the
-- whole call rolls back — so Verify / Reject on a bKash or Nagad payment
-- NEVER succeeded ("Could not record the payment decision."). Re-created
-- with the identical rules and a proper `select * into v_order`.
--
-- Third finding — trg_riders_guard_self_update (202609090005) raises
-- 'forbidden' for ANY write to riders by a non-staff session that does not
-- flip is_online. It predates everything that later started writing that
-- table from inside our own RPCs and triggers: ps_track_rider_load
-- (current_load / total_deliveries, 202609090014), the cash_in_hand update
-- in ps_rider_deliver, ps_rider_update_location, the rider shift columns
-- (202609140014). Proven fallout on a fresh bootstrap:
--
--   rider "Delivered"            → forbidden   (cash + load update)
--   rider "Reject offer"         → forbidden   (load update)
--   rider GPS / shift            → forbidden
--   ps_expire_stale_offers       → forbidden   — called before EVERY rider
--                                  job list and the admin Deliveries board,
--                                  so both break once any offer is > 90 s old
--   vendor "Ready for pickup"    → forbidden   whenever an eligible rider
--                                  exists (auto-dispatch bumps the load)
--
-- Inside a SECURITY DEFINER function or trigger current_user is the owner
-- (postgres), while a direct end-user write through RLS runs as
-- 'authenticated'. The guard now restricts ONLY that direct path — and
-- restricts it harder (a rider may change nothing but is_online; before,
-- current_load / total_deliveries / lat / lng were not in its list).
--
-- Also extends ps_checkout_health() so /api/health reports all repairs.
-- Idempotent — run it again if unsure. Expect 4 × OK at the end.
-- ============================================================================

begin;

create or replace function ps_write_shop_ledger()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pct numeric;
  v_commission bigint;
  v_payable bigint;
  v_delivery bigint;
  v_tip bigint;
  v_sur bigint;
  v_row jsonb := to_jsonb(new);
begin
  -- Enum-safe: old.status may be NULL only in theory (AFTER UPDATE always has
  -- OLD), but it must never be compared with '' — that is not a label.
  if new.status = 'delivered' and old.status is distinct from new.status then
    select commission_pct into v_pct from shops where id = new.shop_id;
    if v_pct is null then v_pct := 15; end if;
    v_commission := floor((new.subtotal * v_pct) / 100);
    v_payable := new.subtotal - v_commission;
    v_delivery := coalesce(new.delivery_charge, 0);
    -- Read the optional columns through jsonb so this body also works on a
    -- database that never got the tip / surcharge / return migrations.
    v_tip := coalesce((v_row->>'tip_amount')::bigint, 0);
    v_sur := coalesce((v_row->>'surcharge_night')::bigint, 0)
           + coalesce((v_row->>'surcharge_rain')::bigint, 0)
           + coalesce((v_row->>'surcharge_distance')::bigint, 0)
           + coalesce((v_row->>'surcharge_express')::bigint, 0)
           + coalesce((v_row->>'surcharge_weight')::bigint, 0);
    -- A return order is the reverse leg: the shop pays the product share back.
    if coalesce((v_row->>'is_return')::boolean, false) then
      v_payable := -v_payable;
    end if;
    if new.shop_id is null then
      -- Legacy row without a shop: nothing to settle, never block the delivery.
      return new;
    end if;
    insert into shop_ledger (shop_id, order_id, subtotal, commission, payable, delivery_charge, tip_amount, surcharge_total)
    values (new.shop_id, new.id, new.subtotal, v_commission, v_payable, v_delivery, v_tip, v_sur)
    on conflict (order_id) do update set
      subtotal = excluded.subtotal,
      commission = excluded.commission,
      payable = excluded.payable,
      delivery_charge = excluded.delivery_charge,
      tip_amount = excluded.tip_amount,
      surcharge_total = excluded.surcharge_total;
  end if;
  return new;
end $$;

-- The ledger columns the 0017 version writes (no-op where they exist).
alter table shop_ledger add column if not exists delivery_charge bigint not null default 0;
alter table shop_ledger add column if not exists tip_amount bigint not null default 0;
alter table shop_ledger add column if not exists surcharge_total bigint not null default 0;
create unique index if not exists idx_shop_ledger_order_id on shop_ledger(order_id);

drop trigger if exists trg_orders_ledger_on_delivered on orders;
create trigger trg_orders_ledger_on_delivered
  after update of status on orders
  for each row execute function ps_write_shop_ledger();

-- ----------------------------------------------------------------------------
-- ps_verify_payment — same body as 202609140007 (wallet orders only, one
-- decision per payment, verified never on a cancelled order, reject cancels
-- + releases stock through trg_orders_release_on_cancel), minus the scalar-
-- subquery RETURN that made every call fail.
-- ----------------------------------------------------------------------------
create or replace function ps_verify_payment(p_order_id uuid, p_action text, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_is_admin boolean;
  v_shop uuid;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Same auth model as ps_advance_order: staff or the owning shop.
  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
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
      upper(left(v_order.payment, 1)) || right(v_order.payment, length(v_order.payment) - 1) || ' payment verified',
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
      'Payment rejected' || coalesce(' — ' || trim(coalesce(p_note, '')), '') ||
      ' (refund from the shop wallet, offline)',
      auth.uid());
  else
    raise exception 'unknown payment action';
  end if;

  select * into v_order from orders where id = p_order_id;
  return v_order;
end $$;

-- ----------------------------------------------------------------------------
-- riders guard — only a rider's DIRECT write (RLS policy "riders self update
-- own") is restricted, and then to the online switch alone. Staff, the
-- server's service role and our own SECURITY DEFINER RPCs/triggers pass.
-- ----------------------------------------------------------------------------
create or replace function ps_guard_rider_self_update()
returns trigger language plpgsql as $$
begin
  -- Trusted writers: service role, and every SECURITY DEFINER function or
  -- trigger (they execute as their owner, never as the API roles).
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if (select ps_is_admin()) then
    return new;
  end if;
  -- A rider touching their own row directly: nothing but is_online may move.
  if (to_jsonb(new) - 'is_online') is distinct from (to_jsonb(old) - 'is_online') then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

drop trigger if exists trg_riders_guard_self_update on riders;
create trigger trg_riders_guard_self_update
  before update on riders
  for each row execute function ps_guard_rider_self_update();

-- The stale 2-argument overload from 202609090007 is never called by the app
-- (it always sends p_proof_url); keeping both makes PostgREST answer 300
-- "could not choose the best candidate function" for a 2-key payload.
drop function if exists ps_rider_deliver(uuid, text);

-- ----------------------------------------------------------------------------
-- /api/health: the probe from 202609160002, now also answering "can a status
-- change be written / a payment be verified / a rider deliver?". Same
-- signature → in-place replace. Every probe is POSITIVE (looks for the
-- repaired text in the one function it names) so it can never match itself.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160003',
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
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Security repair: anon key locked out of service RPCs, memberships RLS, slot policy (202609160004) ====
-- ============================================================================
-- Security repair 4 (2026-09-16): lock down what the PUBLIC anon key can do.
-- ============================================================================
-- Found by the full-site audit (docs/AUDIT-2026-09-16.md, H1 / H2 / M1).
-- Nothing here changes a feature: every write below is already made by the
-- server with the service-role key. What changes is that the browser key —
-- which ships in every page — can no longer reach the same objects directly
-- through PostgREST.
--
-- H1  `memberships` was created (202609140015) with an admin policy but
--     WITHOUT `enable row level security`, so the policy never applied and
--     the anon key could read every PROSANTI+ request (phone, trxid) and
--     flip status to 'active'.
--
-- H2  Eight SECURITY DEFINER write functions carry no internal auth check
--     (they trust their caller, which is always our API) and were never
--     revoked from anon/authenticated. Supabase grants EXECUTE to both by
--     default, so any visitor could call them through /rest/v1/rpc/…:
--       ps_place_order            — orders around the API's validation/limits
--       ps_use_coupon             — burn a coupon's usage_limit
--       ps_book_delivery_slot     — fill any day's slots (20 calls = full)
--       ps_return_action          — approve/reject/complete any return
--       ps_assign_batch_to_rider  — push orders onto a rider
--       ps_credit_referrer        — mint referral coupons
--       ps_expire_stale_offers    — churn the dispatch board
--       ps_shop_rating_recompute  — (harmless, still not public API)
--     ps_create_return_request has the same shape (no guard, calls
--     ps_place_order) and is locked with them. The functions the storefront
--     legitimately calls with a USER session (ps_rider_*, ps_advance_order,
--     ps_verify_payment, ps_offer_order, …) all check ps_is_admin() /
--     ps_rider_id() / ps_vendor_shop() themselves and keep their grants.
--
-- M1  `delivery_slots` "admin all" policy (202609090017) was written as
--     `using (true) with check (true)` — i.e. everyone — so the anon key could
--     block or delete every slot. Now admin-only; public read stays.
--
-- Also: `ps_checkout_health()` gains `rpc_grants_locked` / `memberships_rls`
-- so /api/health can report this repair (checks.securityRepair).
--
-- Safe to re-run. Nothing is dropped. Takes well under a second.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- H1. memberships: turn the existing policy on.
-- ----------------------------------------------------------------------------
alter table if exists memberships enable row level security;

-- ----------------------------------------------------------------------------
-- M1. delivery_slots: admin-only writes (the public read policy is untouched).
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.delivery_slots') is not null then
    drop policy if exists "delivery_slots admin all" on delivery_slots;
    create policy "delivery_slots admin all" on delivery_slots
      for all using (ps_is_admin()) with check (ps_is_admin());
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- H2. service-role-only RPCs. `revoke … from public` also removes the
--     default EXECUTE every new function inherits; service_role (and the
--     owner, which is what SECURITY DEFINER callers run as) keep it.
-- ----------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'ps_place_order(jsonb, jsonb)',
    'ps_use_coupon(uuid)',
    'ps_book_delivery_slot(date, text)',
    'ps_return_action(uuid, text, text)',
    'ps_create_return_request(uuid, text, text)',
    'ps_assign_batch_to_rider(uuid, uuid[])',
    'ps_credit_referrer(uuid)',
    'ps_expire_stale_offers()',
    'ps_shop_rating_recompute(uuid)'
  ] loop
    if to_regprocedure('public.' || fn) is not null then
      execute format('revoke all on function public.%s from public, anon, authenticated', fn);
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Health probe: same function as 0002/0003, two more keys.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160004',
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
    -- 202609160004: the anon key may no longer call the service-only RPCs …
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    -- … and memberships is actually protected by its policy.
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true)
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Dispatch repair: offers can be re-issued, batch assign works (202609160005) ====
-- ============================================================================
-- Dispatch repair 5 (2026-09-16): a delivery offer can be re-offered, and
-- staff batch-assign works.
-- ============================================================================
-- Found while replaying the dispatch flow on a fresh schema (PGlite) during
-- the audit follow-up. Neither is visible until a rider lets an offer lapse
-- or rejects it — which is exactly the moment dispatch matters.
--
-- 1. `delivery_assignments.order_id` was created UNIQUE (202609090005), yet
--    every function written since assumes MANY rows per order:
--      ps_next_eligible_rider  — "never re-offer to a rider who already SAW
--                                 this order" (needs the old row to stay)
--      ps_expire_stale_offers  — marks the lapsed row 'expired' then INSERTS
--                                 a fresh offer for the next rider
--      ps_rider_reject         — marks 'cancelled' then INSERTS the next offer
--      toDomain (API)          — reads "latest by offered_at"
--    So the second INSERT fails with 23505 duplicate key:
--      * ps_expire_stale_offers raises → the rider job feed
--        (/api/rider/jobs runs the sweep first) answers 503 for EVERY rider
--        as soon as ONE offer anywhere has expired with a second eligible
--        rider online — the rider app goes blank, and the admin dispatch
--        board (before today's change) did the same.
--      * ps_rider_reject raises → a rider cannot decline an offer when
--        someone else could take it.
--    Fix: replace the UNIQUE(order_id) with a partial unique index on the
--    LIVE states only — one active offer per order (what the uniqueness was
--    protecting), unlimited history rows.
--
-- 2. `ps_assign_batch_to_rider` (202609090017) calls a function that does
--    not exist (ps_assign_order_to_rider) and, in its exception handler,
--    inserts into a table that does not exist (rider_assignments). Every
--    call fails with 42P01; Admin → Deliveries → "Batch assign" has never
--    worked. Rewritten on delivery_assignments: cancels the current live
--    offer for each order, then offers it directly to the chosen rider.
--    Requires the rider to be active + online and the order to be in a
--    dispatchable status. Stays service-only (202609160004).
--
-- Health: ps_checkout_health() gains `dispatch_reoffer_ok` so /api/health
-- and the admin banner can name this file.
--
-- Safe to re-run. Nothing is dropped except the wrong constraint. The
-- active-offer index creation fails only if the table ALREADY holds two
-- live offers for one order — impossible while the UNIQUE constraint was in
-- place.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. One LIVE offer per order; history rows may accumulate.
-- ----------------------------------------------------------------------------
alter table delivery_assignments
  drop constraint if exists delivery_assignments_order_id_key;

create unique index if not exists delivery_assignments_one_live_offer
  on delivery_assignments (order_id)
  where state in ('offered', 'accepted', 'picked_up');

-- The "latest offer" reads (toDomain, dispatch board) walk by offered_at.
create index if not exists idx_assignments_order_offered
  on delivery_assignments (order_id, offered_at desc);

-- ----------------------------------------------------------------------------
-- 2. Staff batch assign — direct offers to ONE chosen rider.
-- ----------------------------------------------------------------------------
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count  int := 0;
  v_oid    uuid;
  v_rider  riders%rowtype;
  v_status text;
begin
  select * into v_rider
  from riders
  where id = p_rider_id and status = 'active' and is_online
  for update;
  if not found then
    raise exception 'rider not available';
  end if;

  foreach v_oid in array coalesce(p_order_ids, '{}'::uuid[]) loop
    select status into v_status from orders where id = v_oid for update;
    if v_status is null
       or v_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
      continue;  -- not dispatchable (yet): skip, do not abort the batch
    end if;

    -- Already riding with this rider? Count it and move on.
    if exists (
      select 1 from delivery_assignments
      where order_id = v_oid and rider_id = p_rider_id
        and state in ('offered', 'accepted', 'picked_up')
    ) then
      v_count := v_count + 1;
      continue;
    end if;

    -- A live offer/acceptance with another rider is withdrawn (staff
    -- decision beats round-robin). A picked-up leg is never moved.
    if exists (
      select 1 from delivery_assignments
      where order_id = v_oid and state = 'picked_up'
    ) then
      continue;
    end if;
    update delivery_assignments
    set state = 'cancelled'
    where order_id = v_oid and state in ('offered', 'accepted');

    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke all on function ps_assign_batch_to_rider(uuid, uuid[]) from public, anon, authenticated;
grant execute on function ps_assign_batch_to_rider(uuid, uuid[]) to service_role;

-- ----------------------------------------------------------------------------
-- Health probe: same function as 0002–0004, one more key.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160005',
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
    -- 202609160005: offers can be re-issued (no UNIQUE(order_id)), one live
    -- offer per order is enforced by the partial index, batch assign exists
    -- without its phantom dependencies.
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
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;


-- ============================================================================
-- Staff Web Push devices (2026-09-21) — an order lands, the owner's phone
-- buzzes even with the admin panel closed. One row per browser
-- subscription. Service-role only (the notifyStaff fan-out and
-- /api/admin/push both run behind staff auth); RLS denies everyone else.
-- Runs in its own transaction because the bootstrap script ends above.
-- ============================================================================
begin;
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
commit;

-- ============================================================================
-- Customer (shopper) Web Push (2026-09-24) — the shopper's phone buzzes on the
-- four delivery milestones instead of the shop calling each one. Separate
-- table from the staff devices above: bound to the checkout phone number,
-- written by /api/track/push behind the track proof, read only by the
-- milestone fan-out. Service-role only; RLS denies everyone else.
-- ============================================================================
begin;
create table if not exists public.customer_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  phone        text not null,
  lang         text not null default 'bn',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_customer_push_phone
  on public.customer_push_subscriptions (phone);
alter table public.customer_push_subscriptions enable row level security;
commit;

-- ============================================================================
-- Scheduler marks (2026-09-24) — the shop's time-based work runs from outside
-- (a GitHub Action calls /api/cron/tick every 15 minutes; docs/automation.md).
-- One row per one-shot job that has already happened ("reminded order X",
-- "sent the digest for 2026-09-24"), claimed with an INSERT and released if
-- the work failed, so a tick can retry without ever nagging twice. Service
-- role only — RLS on, no policies.
-- ============================================================================
begin;
create table if not exists public.cron_marks (
  key    text primary key,
  ran_at timestamptz not null default now()
);
alter table public.cron_marks enable row level security;
commit;

-- ============================================================================
-- WhatsApp draft outbox (2026-09-24) — the FREE fallback when Web Push reached
-- nobody. The WhatsApp Business API is not needed for order messages (Meta
-- business account + pre-approved templates + ~$0.011 per utility message);
-- a `wa.me` deep link opens the shop's own WhatsApp Business app with the text
-- prefilled, and a human taps send. One draft per order per step, written when
-- the push fan-out reached no device; the admin order page shows it as "Ready
-- to send". `opened_at` records the tap that OPENED WhatsApp — never a claim
-- that a human sent it. Service role only — RLS on, no policies.
-- ============================================================================
begin;
create table if not exists public.wa_outbox (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null,
  phone         text not null,
  kind          text not null,
  lang          text not null default 'bn',
  message       text not null,
  created_at    timestamptz not null default now(),
  opened_at     timestamptz,
  superseded_at timestamptz,
  dismissed_at  timestamptz,
  unique (order_no, kind)
);
create index if not exists idx_wa_outbox_pending
  on public.wa_outbox (created_at desc)
  where opened_at is null and superseded_at is null and dismissed_at is null;
create index if not exists idx_wa_outbox_order
  on public.wa_outbox (order_no, created_at desc);
alter table public.wa_outbox enable row level security;
commit;


