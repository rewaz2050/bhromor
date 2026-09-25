-- PASTE 9/23 · 09_settle_claims-sql.sql
-- Source: supabase/migrations/202609250004_settle_claims.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
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

commit;
