-- PART 16/22 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: rider money (202609300002) ====
-- ============================================================================
-- Rider money Phase 2 (2026-09-30) — docs/AUDIT-RIDER-MONEY-2026-09-30.md
--
-- Phase 1 (202609300001) made the TIP reach the rider. This file builds the
-- rest of the money system around that wallet.
--
--   C. PER-DELIVERY EARNINGS. ps_rider_deliver credits, besides the 100% tip,
--      the configured base delivery fee and — for COD orders — the COD
--      handling fee. Both are read from site_settings on every delivery, so a
--      rate change applies from the NEXT delivery on, never retroactively.
--      The default is 0 (৳0) ON PURPOSE: the owner sets real rates in
--      Admin → Money; until then nothing is credited and the money dashboard
--      says "not configured yet". Crediting invented amounts into riders'
--      wallets would be a money decision no schema should make.
--
--   D. RIDER PAYOUTS. rider_payout_requests: a rider asks to withdraw from
--      their earnings_balance (one pending request at a time). The amount is
--      debited IMMEDIATELY (held), so it can never be spent twice; staff
--      approve (paid) or reject (wallet refunded). Every movement lands in
--      the rider_earnings journal, which is signed from here on:
--         tip | delivery_fee | cod_handling | incentive   → + credit
--         payout                                         → − hold
--         payout_refund                                  → + release
--      riders.earnings_balance therefore ALWAYS equals
--      sum(rider_earnings.amount) for that rider — reconcilable any time.
--
--   M. ps_admin_money_summary(): the platform's money position in one call —
--      income (commission + delivery charge + tips collected), what is owed
--      to riders and shops, and how much COD cash riders are carrying.
--
-- Idempotent — safe to re-run. 202609300001 is the tip half; this file also
-- (re)creates the wallet column + table it needs, so it may be run alone.
-- All amounts are PAISA (bigint), like every other money column in the schema.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Payout requests (D). RLS on, no policies — like rider_settle_claims:
--    riders never read this table directly (the service client does), and the
--    only writer is the SECURITY DEFINER RPC below.
-- ----------------------------------------------------------------------------
create table if not exists rider_payout_requests (
  id               uuid primary key default gen_random_uuid(),
  rider_id         uuid not null references riders (id) on delete cascade,
  amount           bigint not null check (amount > 0),
  method           text not null default 'bkash'
                   check (method in ('bkash', 'nagad', 'bank', 'cash')),
  account          text not null default '',
  status           text not null default 'pending'
                   check (status in ('pending', 'paid', 'rejected')),
  requested_at     timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid,
  decided_by_email text,
  note             text,
  reference        text not null default ''
);

-- One open request per rider: the amount is held the moment it is filed, so a
-- second pending row could only double-hold the same money.
create unique index if not exists rider_payout_requests_one_pending
  on rider_payout_requests (rider_id) where status = 'pending';
create index if not exists idx_rider_payout_requests_queue
  on rider_payout_requests (status, requested_at desc);
alter table rider_payout_requests enable row level security;

-- ----------------------------------------------------------------------------
-- 2. The wallet journal grows up: signed amounts + payout linkage + notes.
--    (Phase 1 wrote the tip-only shape: order_id NOT NULL, amount > 0.)
-- ----------------------------------------------------------------------------
alter table riders
  add column if not exists earnings_balance bigint not null default 0;

alter table delivery_assignments
  add column if not exists delivered_at timestamptz;

create table if not exists rider_earnings (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id) on delete cascade,
  order_id   uuid references orders (id) on delete cascade,
  kind       text not null default 'tip',
  amount     bigint not null,
  payout_id  uuid references rider_payout_requests (id) on delete set null,
  note       text not null default '',
  created_at timestamptz not null default now()
);

alter table rider_earnings add column if not exists payout_id uuid
  references rider_payout_requests (id) on delete set null;
alter table rider_earnings add column if not exists note text not null default '';
-- Payout rows carry no order (order_id NULL); the uniqueness of order-bound
-- credits is kept by the partial index below, so NULLs never collide.
alter table rider_earnings alter column order_id drop not null;

-- One credit per (order, kind): tips / fees can never be double-credited,
-- whatever re-run or manual repair happens. NULL order_id rows (payouts,
-- adjustments) are exempt — NULLs are distinct in a unique index.
create unique index if not exists rider_earnings_one_per_order_kind
  on rider_earnings (order_id, kind);
create index if not exists idx_rider_earnings_rider
  on rider_earnings (rider_id, created_at desc);
create index if not exists idx_rider_earnings_payout
  on rider_earnings (payout_id) where payout_id is not null;
alter table rider_earnings enable row level security;

-- The old inline checks (amount > 0, kind in tip/fee/incentive) are dropped by
-- DEFINITION, not by guessed name, then re-added with the Phase-2 rules.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.rider_earnings'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%kind%' or pg_get_constraintdef(oid) like '%amount%')
  loop
    execute format('alter table public.rider_earnings drop constraint %I', c.conname);
  end loop;
end $$;

alter table rider_earnings
  add constraint rider_earnings_kind_check
  check (kind in (
    'tip', 'delivery_fee', 'cod_handling', 'incentive',
    'payout', 'payout_refund', 'adjustment'
  ));
-- A payout is the one negative movement; every other kind is a credit.
alter table rider_earnings
  add constraint rider_earnings_amount_check
  check ((kind = 'payout' and amount < 0) or (kind <> 'payout' and amount <> 0));
-- Credits for a delivery must name their order; payouts never do.
alter table rider_earnings
  add constraint rider_earnings_order_kind_check
  check (order_id is not null
         or kind in ('payout', 'payout_refund', 'adjustment', 'incentive'));
-- Both directions of the payout ↔ journal link.
alter table rider_earnings
  add constraint rider_earnings_payout_link_check
  check ((kind in ('payout', 'payout_refund')) = (payout_id is not null));

-- ----------------------------------------------------------------------------
-- 3. ps_rider_deliver — the 202609300001 body, plus per-delivery earnings (C).
--    Same signature → existing grants and the deliver_check pairing stand.
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
  if v_cod_fee > 0 and v_order.payment = 'cod' then
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
-- 4. ps_rider_request_payout (D). The rider's own RPC: files a withdrawal and
--    HOLDS the money (debit now, refund only if staff reject). Filing a
--    request while one is pending is refused — the sole guard needed, since
--    the rider can never hold more than one open request.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_request_payout(
  p_amount bigint,
  p_method text default 'bkash',
  p_account text default ''
)
returns rider_payout_requests
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_method text := lower(coalesce(nullif(trim(p_method), ''), 'bkash'));
  v_account text := coalesce(trim(p_account), '');
  v_min bigint := greatest(ps_setting_int('rider_min_payout_paisa', 0), 0);
  v_payout rider_payout_requests%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  if v_rider.status <> 'active' then
    raise exception 'rider not active';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payout amount must be positive';
  end if;
  if v_method not in ('bkash', 'nagad', 'bank', 'cash') then
    raise exception 'unsupported payout method';
  end if;
  if v_method <> 'cash' and length(v_account) < 5 then
    raise exception 'account number required';
  end if;
  if exists (select 1 from rider_payout_requests
             where rider_id = v_rider.id and status = 'pending') then
    raise exception 'payout already pending';
  end if;
  if p_amount < v_min then
    raise exception 'below minimum payout';
  end if;
  if p_amount > v_rider.earnings_balance then
    raise exception 'insufficient earnings balance';
  end if;

  insert into rider_payout_requests (rider_id, amount, method, account)
  values (v_rider.id, p_amount, v_method, v_account)
  returning * into v_payout;

  update riders
  set earnings_balance = earnings_balance - p_amount
  where id = v_rider.id;

  insert into rider_earnings (rider_id, order_id, kind, amount, payout_id, note)
  values (v_rider.id, null, 'payout', -p_amount, v_payout.id, 'payout request');

  return v_payout;
end $$;

-- ----------------------------------------------------------------------------
-- 5. ps_admin_decide_rider_payout (D) — staff approval queue.
--    paid     → nothing to move (the money was held at request time).
--    rejected → refund to the wallet, journaled as payout_refund.
-- ----------------------------------------------------------------------------
create or replace function ps_admin_decide_rider_payout(
  p_payout_id uuid,
  p_decision text,
  p_note text default null,
  p_reference text default ''
)
returns rider_payout_requests
language plpgsql security definer set search_path = public as $$
declare
  v_payout rider_payout_requests%rowtype;
  v_decision text := lower(coalesce(trim(p_decision), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_payout from rider_payout_requests
  where id = p_payout_id
  for update;
  if not found then
    raise exception 'payout not found';
  end if;
  if v_payout.status <> 'pending' then
    raise exception 'payout already %', v_payout.status;
  end if;
  if v_decision not in ('paid', 'rejected') then
    raise exception 'decision must be paid or rejected';
  end if;

  update rider_payout_requests
  set status = v_decision,
      decided_at = now(),
      decided_by = auth.uid(),
      note = v_note,
      reference = coalesce(trim(p_reference), '')
  where id = v_payout.id
  returning * into v_payout;

  if v_decision = 'rejected' then
    update riders
    set earnings_balance = earnings_balance + v_payout.amount
    where id = v_payout.rider_id;
    insert into rider_earnings (rider_id, order_id, kind, amount, payout_id, note)
    values (v_payout.rider_id, null, 'payout_refund', v_payout.amount, v_payout.id,
            coalesce(v_note, 'payout rejected'));
  end if;

  return v_payout;
end $$;

-- ----------------------------------------------------------------------------
-- 6. ps_rider_money_summary (N) — the rider's own statement header, one call:
--    wallet balance, today / 7-day / lifetime credits, the per-kind split,
--    what is already paid out or pending, and the live pay rates.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_money_summary()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rider uuid := ps_rider_id();
  v jsonb;
begin
  if v_rider is null then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'balance', coalesce((select earnings_balance from riders where id = v_rider), 0),
    'cashInHand', coalesce((select cash_in_hand from riders where id = v_rider), 0),
    -- EARNED money only. A payout hold is a transfer, and a payout_refund
    -- merely returns a hold — counting either as income would inflate the
    -- statement (the refund would be double-counted with the original credit).
    'today', coalesce((select sum(amount) from rider_earnings
                       where rider_id = v_rider
                         and kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')
                         and created_at >= date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka'), 0),
    'week', coalesce((select sum(amount) from rider_earnings
                      where rider_id = v_rider
                        and kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')
                        and created_at >= now() - interval '7 days'), 0),
    'lifetime', coalesce((select sum(amount) from rider_earnings
                          where rider_id = v_rider
                            and kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')), 0),
    'tips', coalesce((select sum(amount) from rider_earnings
                      where rider_id = v_rider and kind = 'tip'), 0),
    'deliveryFees', coalesce((select sum(amount) from rider_earnings
                              where rider_id = v_rider and kind = 'delivery_fee'), 0),
    'codHandling', coalesce((select sum(amount) from rider_earnings
                             where rider_id = v_rider and kind = 'cod_handling'), 0),
    'incentives', coalesce((select sum(amount) from rider_earnings
                            where rider_id = v_rider and kind = 'incentive'), 0),
    'paidOut', coalesce((select sum(amount) from rider_payout_requests
                         where rider_id = v_rider and status = 'paid'), 0),
    'pendingPayout', coalesce((select sum(amount) from rider_payout_requests
                               where rider_id = v_rider and status = 'pending'), 0),
    'deliveriesToday', coalesce((select count(*) from delivery_assignments
                                 where rider_id = v_rider and state = 'delivered'
                                   and delivered_at >= date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka'), 0),
    'baseFee', ps_setting_int('rider_base_fee_paisa', 0),
    'codHandlingFee', ps_setting_int('rider_cod_handling_fee_paisa', 0),
    'minPayout', ps_setting_int('rider_min_payout_paisa', 0)
  ) into v;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- 7. ps_admin_money_summary (M) — the platform money position, staff-only.
--    Everything is derived from the ledgers (not from counters), so it can be
--    reconciled at any time:
--      platform income  = commission + delivery charge + collected tips
--      rider payable    = Σ riders.earnings_balance (wallet debt)
--      shop payable     = Σ shop_ledger.payable − Σ shop_payouts.amount
--      COD custody      = Σ riders.cash_in_hand (riders are holding this cash)
-- ----------------------------------------------------------------------------
create or replace function ps_admin_money_summary()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_settle_claims bigint := 0;
  v jsonb;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  -- 202609250004 predates this file on every real database, but a partially
  -- migrated one must still get a summary instead of a hard error.
  if to_regclass('public.rider_settle_claims') is not null then
    select coalesce(sum(amount), 0) into v_settle_claims
    from rider_settle_claims where status = 'pending';
  end if;

  select jsonb_build_object(
    'commissionIncome', coalesce((select sum(commission) from shop_ledger), 0),
    'deliveryIncome', coalesce((select sum(delivery_charge) from orders where status = 'delivered'), 0),
    'tipsCollected', coalesce((select sum(tip_amount) from orders where status = 'delivered'), 0),
    'tipsToRiders', coalesce((select sum(amount) from rider_earnings where kind = 'tip'), 0),
    'riderFeesEarned', coalesce((select sum(amount) from rider_earnings
                                 where kind in ('delivery_fee', 'cod_handling', 'incentive')), 0),
    'deliveredOrders', coalesce((select count(*) from orders where status = 'delivered'), 0),
    'riderPayable', coalesce((select sum(earnings_balance) from riders), 0),
    'riderPayoutsPending', coalesce((select sum(amount) from rider_payout_requests where status = 'pending'), 0),
    'riderPayoutsPendingCount', coalesce((select count(*) from rider_payout_requests where status = 'pending'), 0),
    'riderPayoutsPaid', coalesce((select sum(amount) from rider_payout_requests where status = 'paid'), 0),
    'shopPayable', coalesce((select sum(payable) from shop_ledger), 0)
                   - coalesce((select sum(amount) from shop_payouts), 0),
    'codCustody', coalesce((select sum(cash_in_hand) from riders), 0),
    'codClaimsPending', v_settle_claims,
    'activeRiders', coalesce((select count(*) from riders where status = 'active'), 0),
    'onlineRiders', coalesce((select count(*) from riders where status = 'active' and is_online), 0),
    'baseFee', ps_setting_int('rider_base_fee_paisa', 0),
    'codHandlingFee', ps_setting_int('rider_cod_handling_fee_paisa', 0),
    'minPayout', ps_setting_int('rider_min_payout_paisa', 0)
  ) into v;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- 8. Grants — identical shape to 202609250004's settle RPCs.
-- ----------------------------------------------------------------------------
revoke all on function ps_rider_request_payout(bigint, text, text) from public, anon;
grant execute on function ps_rider_request_payout(bigint, text, text) to authenticated, service_role;
revoke all on function ps_admin_decide_rider_payout(uuid, text, text, text) from public, anon;
grant execute on function ps_admin_decide_rider_payout(uuid, text, text, text) to authenticated, service_role;
revoke all on function ps_rider_money_summary() from public, anon;
grant execute on function ps_rider_money_summary() to authenticated, service_role;
revoke all on function ps_admin_money_summary() from public, anon;
grant execute on function ps_admin_money_summary() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

