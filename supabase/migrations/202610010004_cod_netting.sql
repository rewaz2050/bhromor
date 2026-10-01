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
