-- ============================================================================
-- U (2026-10-01) — DAILY MONEY RECONCILIATION.
--
-- ps_admin_money_daily(p_day) answers, for one Dhaka calendar day: what moved
-- (orders delivered, COD cash riders collected, what riders handed in, what was
-- paid out to riders and shops), what the position is NOW (cash riders hold,
-- what is owed to riders and shops) and — the point of a reconciliation — a
-- list of CHECKS that must all be clean: a rider wallet that no longer equals
-- its journal, an overpaid shop, a delivered order with no shop ledger line,
-- payouts / claims / failed deliveries that have sat untouched.
--
-- Read-only, staff-only on the caller's own JWT (ps_is_admin()). Optional
-- columns / tables are read defensively so a partly migrated database still
-- answers. Order recognition date = delivery moment, as in ps_admin_money_pnl.
-- ============================================================================
begin;

create or replace function ps_admin_money_daily(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Dhaka')::date);
  v_from timestamptz := (coalesce(p_day, (now() at time zone 'Asia/Dhaka')::date))::timestamp at time zone 'Asia/Dhaka';
  v_to timestamptz;
  v_flows jsonb;
  v_position jsonb;
  v_checks jsonb := '[]'::jsonb;
  v_count bigint;
  v_sample text[];
  v_has_claims boolean := to_regclass('public.rider_settle_claims') is not null;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  v_to := v_from + interval '1 day';

  with d as (
    select o.id, o.total, o.payment, o.delivery_charge,
           coalesce(o.is_return, false) as is_return,
           coalesce(
             (select max(a.delivered_at) from delivery_assignments a
               where a.order_id = o.id and a.state = 'delivered'),
             (select min(h.created_at) from order_status_history h
               where h.order_id = o.id and h.status = 'delivered'),
             o.updated_at
           ) as at,
           exists (select 1 from delivery_assignments a
                    where a.order_id = o.id and a.state = 'delivered') as by_rider
    from orders o
    where o.status = 'delivered'
  ),
  day_orders as (select * from d where at >= v_from and at < v_to),
  earn as (
    select kind, amount from rider_earnings where created_at >= v_from and created_at < v_to
  ),
  setl as (
    select amount, coalesce((to_jsonb(s)->>'netted_amount')::bigint, 0) as netted
    from rider_settlements s where settled_at >= v_from and settled_at < v_to
  )
  select jsonb_build_object(
    'deliveredOrders',     (select count(*) from day_orders where not is_return),
    'returnLegs',          (select count(*) from day_orders where is_return),
    'orderValue',          coalesce((select sum(total) from day_orders where not is_return), 0),
    'codCollectedByRiders',coalesce((select sum(total) from day_orders where payment = 'cod' and by_rider), 0),
    'walletPaidOrders',    coalesce((select sum(total) from day_orders where payment <> 'cod'), 0),
    'commission',          coalesce((select sum(l.commission) from shop_ledger l join day_orders o on o.id = l.order_id), 0),
    'deliveryIncome',      coalesce((select sum(delivery_charge) from day_orders), 0),
    'shopPayableAccrued',  coalesce((select sum(l.payable) from shop_ledger l join day_orders o on o.id = l.order_id), 0),
    'shopPayoutsPaid',     coalesce((select sum(amount) from shop_payouts where paid_at >= v_from and paid_at < v_to), 0),
    'riderEarned',         coalesce((select sum(amount) from earn where kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')), 0),
    'riderAdjustments',    coalesce((select sum(amount) from earn where kind = 'adjustment'), 0),
    'riderPayoutsRequested', coalesce((select sum(amount) from rider_payout_requests where requested_at >= v_from and requested_at < v_to), 0),
    'riderPayoutsPaid',    coalesce((select sum(amount) from rider_payout_requests
                                      where status = 'paid' and decided_at >= v_from and decided_at < v_to), 0),
    'settlementsCount',    (select count(*) from setl),
    'settlementsTotal',    coalesce((select sum(amount) from setl), 0),
    'settlementsNetted',   coalesce((select sum(netted) from setl), 0),
    'cashHandedIn',        coalesce((select sum(amount - netted) from setl), 0)
  ) into v_flows;

  v_position := jsonb_build_object(
    'codCustody',  coalesce((select sum(cash_in_hand) from riders), 0),
    'riderPayable',coalesce((select sum(earnings_balance) from riders), 0),
    'shopPayable', coalesce((select sum(payable) from shop_ledger), 0)
                   - coalesce((select sum(amount) from shop_payouts), 0)
  );

  -- ── CHECKS ───────────────────────────────────────────────────────────────
  -- 1. every rider wallet equals the sum of its journal
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from (select r.id from riders r
        where r.earnings_balance <> coalesce((select sum(e.amount) from rider_earnings e where e.rider_id = r.id), 0)) x;
  v_checks := v_checks || jsonb_build_object('key', 'wallet_journal', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 2. no rider holds negative cash
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample from riders where cash_in_hand < 0;
  v_checks := v_checks || jsonb_build_object('key', 'negative_cash', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 3. no shop has been paid more than it earned
  select count(*), (array_agg(shop_id::text))[1:5] into v_count, v_sample
  from (select t.shop_id
        from (select l.shop_id, l.payable as earned, 0::bigint as paid from shop_ledger l
              union all
              select p.shop_id, 0, p.amount from shop_payouts p) t
        group by t.shop_id
        having sum(t.earned) < sum(t.paid)) x;
  v_checks := v_checks || jsonb_build_object('key', 'shop_overpaid', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 4. every order delivered today (with a shop) has its shop ledger line
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from (select o.id from orders o
        where o.status = 'delivered' and o.shop_id is not null
          and not coalesce(o.is_return, false)
          and o.updated_at >= v_from and o.updated_at < v_to
          and not exists (select 1 from shop_ledger l where l.order_id = o.id)) x;
  v_checks := v_checks || jsonb_build_object('key', 'delivered_no_ledger', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 5. rider payout requests waiting more than 48 hours
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from rider_payout_requests where status = 'pending' and requested_at < now() - interval '48 hours';
  v_checks := v_checks || jsonb_build_object('key', 'stale_payouts', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 6. settle claims waiting more than 48 hours
  v_count := 0; v_sample := null;
  if v_has_claims then
    execute $q$select count(*), (array_agg(id::text))[1:5] from rider_settle_claims
               where status = 'pending' and created_at < now() - interval '48 hours'$q$
      into v_count, v_sample;
  end if;
  v_checks := v_checks || jsonb_build_object('key', 'stale_claims', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 7. failed deliveries nobody has resolved (202610010001 column)
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from orders o
  where o.status = 'out-for-delivery' and nullif(to_jsonb(o)->>'delivery_failed_at', '') is not null;
  v_checks := v_checks || jsonb_build_object('key', 'open_failed_deliveries', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 8. wallet payments awaiting a decision for more than a day
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from orders o
  where o.payment <> 'cod' and o.payment_status = 'pending_verification'
    and o.status <> 'cancelled' and o.created_at < now() - interval '24 hours';
  v_checks := v_checks || jsonb_build_object('key', 'stale_payment_verification', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  return jsonb_build_object('day', v_day, 'flows', v_flows, 'position', v_position, 'checks', v_checks);
end $$;

revoke all on function ps_admin_money_daily(date) from public, anon;
grant execute on function ps_admin_money_daily(date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
