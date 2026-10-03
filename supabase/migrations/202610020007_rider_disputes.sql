-- ============================================================================
-- W (2026-10-02) — RIDER DISPUTES + MANUAL WALLET ADJUSTMENTS.
--
-- The wallet journal has always had an 'adjustment' kind (and the money audit
-- trail logs it), but NOTHING could create one: when a rider said "I wasn't
-- paid for PS-1042" or "the customer short-paid COD", the only fix was editing
-- the database by hand — no record, no reason, no reply.
--
--   rider_disputes                the rider's complaint (category, message,
--                                 optional claimed amount, the trip it is
--                                 about) and staff's decision.
--   ps_rider_raise_dispute()      rider-only (auth.uid() → riders.id). Needs
--                                 an active account, a trip of THEIR OWN for
--                                 trip-bound categories, at most 5 open.
--   ps_admin_adjust_rider()       staff-only manual credit/debit with a
--                                 mandatory reason. Moves riders.earnings_balance
--                                 and the signed journal together (kind
--                                 'adjustment'; the audit trigger records the
--                                 staff actor). A debit can never push the
--                                 wallet below zero.
--   ps_admin_resolve_dispute()    staff-only: approve (optionally with an
--                                 adjustment, linked to the journal row) or
--                                 reject (reason required).
--
-- Riders read their own disputes through the service client; staff read the
-- table through RLS. Nobody writes it directly. Safe to re-run.
-- ============================================================================
begin;

create table if not exists rider_disputes (
  id                uuid primary key default gen_random_uuid(),
  rider_id          uuid not null references riders (id) on delete cascade,
  assignment_id     uuid references delivery_assignments (id) on delete set null,
  order_id          uuid references orders (id) on delete set null,
  category          text not null
                    check (category in ('missing_fee', 'wrong_cod', 'missing_tip', 'wrongly_failed', 'other')),
  message           text not null check (char_length(message) between 5 and 500),
  claimed_amount    bigint check (claimed_amount is null or claimed_amount >= 0),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  adjustment_amount bigint not null default 0,
  note              text,
  earning_id        uuid references rider_earnings (id) on delete set null,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by        uuid
);

create index if not exists idx_rider_disputes_queue on rider_disputes (status, created_at desc);
create index if not exists idx_rider_disputes_rider on rider_disputes (rider_id, created_at desc);
-- One open complaint per trip: a second tap cannot queue the same grievance twice.
create unique index if not exists rider_disputes_one_open_per_trip
  on rider_disputes (rider_id, assignment_id)
  where status = 'pending' and assignment_id is not null;

alter table rider_disputes enable row level security;
drop policy if exists "disputes admin read" on rider_disputes;
create policy "disputes admin read" on rider_disputes
  for select using (ps_is_admin());
revoke all on table rider_disputes from anon, authenticated;
grant select on table rider_disputes to authenticated;
grant all on table rider_disputes to service_role;

-- ----------------------------------------------------------------------------
-- Rider raises a dispute.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_raise_dispute(
  p_assignment_id uuid,
  p_category text,
  p_message text,
  p_claimed bigint default null
)
returns rider_disputes
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_cat text := lower(coalesce(trim(p_category), ''));
  v_msg text := coalesce(trim(p_message), '');
  v_order uuid;
  v_row rider_disputes%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  if v_rider.status <> 'active' then
    raise exception 'rider not active';
  end if;
  if v_cat not in ('missing_fee', 'wrong_cod', 'missing_tip', 'wrongly_failed', 'other') then
    raise exception 'unknown category';
  end if;
  if char_length(v_msg) < 5 then
    raise exception 'message too short';
  end if;
  if char_length(v_msg) > 500 then
    raise exception 'message too long';
  end if;
  if p_claimed is not null and (p_claimed < 0 or p_claimed > 5000000) then
    raise exception 'invalid amount';
  end if;

  if p_assignment_id is not null then
    select order_id into v_order from delivery_assignments
     where id = p_assignment_id and rider_id = v_rider.id;
    if not found then
      raise exception 'not your trip';
    end if;
  elsif v_cat <> 'other' then
    raise exception 'trip required';
  end if;

  if (select count(*) from rider_disputes where rider_id = v_rider.id and status = 'pending') >= 5 then
    raise exception 'too many open disputes';
  end if;
  if p_assignment_id is not null and exists (
      select 1 from rider_disputes
       where rider_id = v_rider.id and assignment_id = p_assignment_id and status = 'pending') then
    raise exception 'dispute already open';
  end if;

  insert into rider_disputes (rider_id, assignment_id, order_id, category, message, claimed_amount)
  values (v_rider.id, p_assignment_id, v_order, v_cat, v_msg, p_claimed)
  returning * into v_row;
  return v_row;
end $$;

revoke all on function ps_rider_raise_dispute(uuid, text, text, bigint) from public, anon;
grant execute on function ps_rider_raise_dispute(uuid, text, text, bigint) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- The one place the wallet is moved by hand. Internal: callers check staff.
-- ----------------------------------------------------------------------------
create or replace function ps__apply_rider_adjustment(p_rider_id uuid, p_amount bigint, p_note text)
returns rider_earnings
language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
  v_row rider_earnings%rowtype;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'amount must not be zero';
  end if;
  if abs(p_amount) > 5000000 then
    raise exception 'amount too large';
  end if;
  if char_length(coalesce(trim(p_note), '')) < 5 then
    raise exception 'reason required';
  end if;
  select earnings_balance into v_balance from riders where id = p_rider_id for update;
  if not found then
    raise exception 'rider not found';
  end if;
  if v_balance + p_amount < 0 then
    raise exception 'would make wallet negative';
  end if;
  update riders set earnings_balance = earnings_balance + p_amount where id = p_rider_id;
  insert into rider_earnings (rider_id, order_id, kind, amount, note)
  values (p_rider_id, null, 'adjustment', p_amount, left(trim(p_note), 400))
  returning * into v_row;
  return v_row;
end $$;

revoke all on function ps__apply_rider_adjustment(uuid, bigint, text) from public, anon, authenticated;

create or replace function ps_admin_adjust_rider(p_rider_id uuid, p_amount bigint, p_note text)
returns rider_earnings
language plpgsql security definer set search_path = public as $$
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  return ps__apply_rider_adjustment(p_rider_id, p_amount, p_note);
end $$;

revoke all on function ps_admin_adjust_rider(uuid, bigint, text) from public, anon;
grant execute on function ps_admin_adjust_rider(uuid, bigint, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Staff decide a dispute.
-- ----------------------------------------------------------------------------
create or replace function ps_admin_resolve_dispute(
  p_id uuid,
  p_decision text,
  p_amount bigint default 0,
  p_note text default null
)
returns rider_disputes
language plpgsql security definer set search_path = public as $$
declare
  v_row rider_disputes%rowtype;
  v_decision text := lower(coalesce(trim(p_decision), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_amount bigint := coalesce(p_amount, 0);
  v_earn rider_earnings%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_row from rider_disputes where id = p_id for update;
  if not found then
    raise exception 'dispute not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'dispute already %', v_row.status;
  end if;
  if v_decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject';
  end if;

  if v_decision = 'reject' then
    if char_length(coalesce(v_note, '')) < 3 then
      raise exception 'reason required';
    end if;
    v_amount := 0;
  elsif v_amount <> 0 then
    select * into v_earn from ps__apply_rider_adjustment(
      v_row.rider_id, v_amount, 'Dispute: ' || coalesce(v_note, v_row.category));
  end if;

  update rider_disputes
     set status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
         adjustment_amount = v_amount,
         note = v_note,
         earning_id = v_earn.id,
         decided_at = now(),
         decided_by = auth.uid()
   where id = v_row.id
   returning * into v_row;
  return v_row;
end $$;

revoke all on function ps_admin_resolve_dispute(uuid, text, bigint, text) from public, anon;
grant execute on function ps_admin_resolve_dispute(uuid, text, bigint, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
