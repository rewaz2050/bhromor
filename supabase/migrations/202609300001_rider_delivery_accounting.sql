-- ============================================================================
-- Rider delivery accounting (2026-09-30) — docs/AUDIT-RIDER-MONEY-2026-09-30.md
--
--   A. TIP → RIDER (P0 money bug). The rider app shows "💝 Tip for you",
--      the vendor earnings copy promises "tips go 100% to the rider", and
--      checkout books tip_amount as a *rider* tip — but no code path ever
--      paid it: ps_write_shop_ledger recorded tip_amount for the shop's
--      information (excluded from shop balance) and ps_rider_deliver only
--      moved COD cash. On COD the rider collected the tip inside
--      orders.total and settled every paisa to the office; the tip was
--      simply lost in the platform's hands. Now ps_rider_deliver credits
--      the tip to a new append-only rider_earnings journal and to
--      riders.earnings_balance (the platform's wallet debt to the rider).
--      Payouts stay a staff-approved flow (Phase 2); this file only makes
--      the money tracked instead of vanished. NO historical backfill —
--      crediting past tips is a real-money decision for the owner, not a
--      schema default.
--
--   B. delivered_at (P2 scoreboard accuracy). getRiderStats counted the
--      7-day window off orders.updated_at, which any later order touch
--      (proof, return, admin edit) rewrites — the number drifted. Stamp
--      the real delivery moment on the assignment and count that.
--
-- Idempotent — safe to re-run. Run after 202609250005 (PIN lockout: the
-- ps_rider_deliver body this recreates).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A1. Rider earnings: wallet balance + journal.
--     RLS on, no policies (like delivery_ratings): only the SECURITY DEFINER
--      deliver RPC and service/staff writers touch it; riders read their own
--      numbers through /api/rider/* (service client), never directly.
-- ----------------------------------------------------------------------------
alter table riders
  add column if not exists earnings_balance bigint not null default 0;

create table if not exists rider_earnings (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id) on delete cascade,
  order_id   uuid not null references orders (id) on delete cascade,
  kind       text not null default 'tip'
             check (kind in ('tip', 'delivery_fee', 'incentive')),
  amount     bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- One tip per delivered order — the belt under the deliver RPC's state
-- guard: a re-run (manual repair, double click, migration re-apply) can
-- never double-credit the wallet.
create unique index if not exists rider_earnings_one_per_order_kind
  on rider_earnings (order_id, kind);
create index if not exists idx_rider_earnings_rider
  on rider_earnings (rider_id);
alter table rider_earnings enable row level security;

-- ----------------------------------------------------------------------------
-- B1. The real delivery moment, stamped by the same function.
-- ----------------------------------------------------------------------------
alter table delivery_assignments
  add column if not exists delivered_at timestamptz;

-- One-time backfill: orders.updated_at ≈ delivery time for rows that are
-- already delivered (and the old wrong-in-a-different-way basis anyway).
update delivery_assignments a
set delivered_at = o.updated_at
from orders o
where a.order_id = o.id
  and a.state = 'delivered'
  and a.delivered_at is null;

-- ----------------------------------------------------------------------------
-- A2 + B2. ps_rider_deliver — the 202609250005 (PIN lockout) body, plus:
--   * tip credit (idempotent: insert wins once, then the wallet moves);
--   * delivered_at stamp on the picked_up → delivered transition.
-- Same signature → existing grants and the deliver_check pairing stand.
-- ----------------------------------------------------------------------------
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

  return v_assignment;
end $$;

notify pgrst, 'reload schema';

commit;
