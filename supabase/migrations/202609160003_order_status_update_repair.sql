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

-- ----------------------------------------------------------------------------
-- VERIFY — expect 4 × OK.
-- ----------------------------------------------------------------------------
select 'ps_write_shop_ledger compares the enum safely' as check_,
       case when exists (select 1 from pg_proc where proname = 'ps_write_shop_ledger'
                           and prosrc like '%old.status is distinct from new.status%')
            then 'OK' else 'BROKEN TRIGGER STILL INSTALLED — re-run this file' end as state
union all
select 'ps_verify_payment returns the row (no scalar subquery)',
       case when exists (select 1 from pg_proc where proname = 'ps_verify_payment'
                           and prosrc like '%select * into v_order from orders where id = p_order_id;%')
            then 'OK' else 'BROKEN FUNCTION STILL INSTALLED — re-run this file' end
union all
select 'riders guard lets RPCs, triggers and the service role write',
       case when exists (select 1 from pg_proc where proname = 'ps_guard_rider_self_update'
                           and prosrc like '%current_user not in%')
            then 'OK' else 'OLD GUARD STILL INSTALLED — re-run this file' end
union all
select 'ps_checkout_health reports the three repairs',
       case when exists (select 1 from pg_proc where proname = 'ps_checkout_health'
                           and prosrc like '%rider_guard_ok%')
            then 'OK' else 'OLD PROBE — re-run this file' end
order by 1;
