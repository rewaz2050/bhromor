-- ============================================================================
-- L (2026-10-02) — ADMIN RIDER PROFILE: one read for "can I trust this rider
-- with more cash?".
--
-- ps_admin_rider_overview(p_rider_id) returns, for ONE rider, staff-only:
--   rider        identity, status, online, rating, lifetime deliveries
--   money        wallet, cash in hand, lifetime earned, paid out, pending
--                payout, netted against cash, handed in so far
--   risk         the FACTS behind COD risk: cash vs the dispatch cap, COD
--                deliveries since the last settlement (count / value / oldest),
--                the pending claim, rejected claims in 30 days
--   performance  30-day offer outcomes (delivered / failed / declined /
--                expired) and 7/30-day deliveries
--   journal / payouts / settlements / claims / trips  the latest rows
-- The app turns the facts into a risk level (src/lib/rider-risk.ts) so the
-- thresholds are unit-tested, not buried in SQL.
--
-- Read-only, staff-only on the caller's JWT (ps_is_admin()). rider_earnings,
-- payouts and claims have RLS with no policies, so this SECURITY DEFINER read
-- is the ONLY way staff see them. Optional tables are read defensively.
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function ps_admin_rider_overview(p_rider_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_has_claims boolean := to_regclass('public.rider_settle_claims') is not null;
  v_has_earn boolean := to_regclass('public.rider_earnings') is not null;
  v_has_payouts boolean := to_regclass('public.rider_payout_requests') is not null;
  v_last_settled timestamptz;
  v_cod_count bigint := 0;
  v_cod_value bigint := 0;
  v_cod_oldest timestamptz;
  v_money jsonb;
  v_perf jsonb;
  v_claim jsonb := null;
  v_rejected bigint := 0;
  v_journal jsonb := '[]'::jsonb;
  v_payouts jsonb := '[]'::jsonb;
  v_claims jsonb := '[]'::jsonb;
  v_settlements jsonb;
  v_trips jsonb;
  v_earned bigint := 0;
  v_netted bigint := 0;
  v_paid bigint := 0;
  v_pending bigint := 0;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_rider from riders where id = p_rider_id;
  if not found then
    raise exception 'rider_not_found';
  end if;

  select max(settled_at) into v_last_settled from rider_settlements where rider_id = p_rider_id;

  -- COD parcels delivered since the last time the rider handed cash in. Only
  -- meaningful while the rider still holds cash.
  if coalesce(v_rider.cash_in_hand, 0) > 0 then
    select count(*), coalesce(sum(o.total), 0), min(a.delivered_at)
      into v_cod_count, v_cod_value, v_cod_oldest
      from delivery_assignments a
      join orders o on o.id = a.order_id
     where a.rider_id = p_rider_id
       and a.state = 'delivered'
       and coalesce(o.payment, 'cod') = 'cod'
       and coalesce(o.is_return, false) = false
       and a.delivered_at > coalesce(v_last_settled, '-infinity'::timestamptz);
  end if;

  if v_has_earn then
    select coalesce(sum(amount) filter (where kind in ('tip','delivery_fee','cod_handling','incentive')), 0),
           coalesce(-sum(amount) filter (where kind = 'cod_netting'), 0)
      into v_earned, v_netted
      from rider_earnings where rider_id = p_rider_id;
    select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_journal from (
      select jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', e.amount, 'note', e.note,
                                'at', e.created_at, 'orderNo', o.order_no) as j
        from rider_earnings e left join orders o on o.id = e.order_id
       where e.rider_id = p_rider_id
       order by e.created_at desc limit 30) s;
  end if;

  if v_has_payouts then
    select coalesce(sum(amount) filter (where status = 'paid'), 0),
           coalesce(sum(amount) filter (where status = 'pending'), 0)
      into v_paid, v_pending
      from rider_payout_requests where rider_id = p_rider_id;
    select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_payouts from (
      select jsonb_build_object('id', id, 'amount', amount, 'method', method, 'account', account,
                                'status', status, 'at', requested_at, 'decidedAt', decided_at,
                                'note', note, 'reference', reference) as j
        from rider_payout_requests where rider_id = p_rider_id
       order by requested_at desc limit 10) s;
  end if;

  if v_has_claims then
    select jsonb_build_object('id', id, 'amount', amount, 'method', method, 'reference', reference, 'at', created_at)
      into v_claim
      from rider_settle_claims where rider_id = p_rider_id and status = 'pending'
     order by created_at desc limit 1;
    select count(*) into v_rejected from rider_settle_claims
     where rider_id = p_rider_id and status = 'rejected' and created_at >= now() - interval '30 days';
    select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_claims from (
      select jsonb_build_object('id', id, 'amount', amount, 'method', method, 'reference', reference,
                                'status', status, 'at', created_at, 'decidedAt', decided_at, 'note', note) as j
        from rider_settle_claims where rider_id = p_rider_id
       order by created_at desc limit 10) s;
  end if;

  select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_settlements from (
    select jsonb_build_object('id', id, 'amount', amount, 'nettedAmount', coalesce(netted_amount, 0),
                              'method', method, 'reference', reference, 'at', settled_at) as j
      from rider_settlements where rider_id = p_rider_id
     order by settled_at desc limit 10) s;

  v_money := jsonb_build_object(
    'cashInHand', coalesce(v_rider.cash_in_hand, 0),
    'earningsBalance', coalesce(v_rider.earnings_balance, 0),
    'lifetimeEarned', v_earned,
    'paidOut', v_paid,
    'pendingPayout', v_pending,
    'nettedAgainstCash', v_netted,
    'handedIn', coalesce((select sum(amount) from rider_settlements where rider_id = p_rider_id), 0)
  );

  select jsonb_build_object(
    'offered30', count(*),
    'delivered30', count(*) filter (where state = 'delivered'),
    'failed30', count(*) filter (where state = 'failed'),
    'declined30', count(*) filter (where state = 'cancelled' and cancelled_by = 'rider_decline'),
    'expired30', count(*) filter (where state = 'expired'),
    'delivered7', (select count(*) from delivery_assignments d
                    where d.rider_id = p_rider_id and d.state = 'delivered'
                      and d.delivered_at >= now() - interval '7 days'),
    'avgDeliveryMinutes', v_rider.avg_delivery_minutes
  ) into v_perf
  from delivery_assignments
  where rider_id = p_rider_id and offered_at >= now() - interval '30 days';

  select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_trips from (
    select jsonb_build_object(
             'id', a.id, 'orderNo', o.order_no, 'state', a.state,
             'at', coalesce(a.delivered_at, a.offered_at), 'area', o.area, 'total', o.total,
             'payment', coalesce(o.payment, 'cod'), 'isReturn', coalesce(o.is_return, false),
             'shop', s.name, 'failedReason', a.failed_reason) as j
      from delivery_assignments a
      join orders o on o.id = a.order_id
      left join shops s on s.id = o.shop_id
     where a.rider_id = p_rider_id and a.state in ('delivered', 'failed')
     order by a.offered_at desc limit 15) t;

  return jsonb_build_object(
    'rider', jsonb_build_object(
      'id', v_rider.id, 'name', v_rider.name, 'phone', v_rider.phone, 'status', v_rider.status,
      'vehicle', v_rider.vehicle, 'isOnline', v_rider.is_online, 'zoneIds', to_jsonb(v_rider.zone_ids),
      'ratingAvg', v_rider.rating_avg, 'ratingCount', v_rider.rating_count,
      'totalDeliveries', coalesce(v_rider.total_deliveries, 0), 'createdAt', v_rider.created_at),
    'money', v_money,
    'risk', jsonb_build_object(
      'cashInHand', coalesce(v_rider.cash_in_hand, 0),
      'cashLimit', 500000,
      'codCountSinceSettle', v_cod_count,
      'codValueSinceSettle', v_cod_value,
      'oldestCodAt', v_cod_oldest,
      'lastSettledAt', v_last_settled,
      'pendingClaim', v_claim,
      'rejectedClaims30', v_rejected),
    'performance', v_perf,
    'journal', v_journal,
    'payouts', v_payouts,
    'settlements', v_settlements,
    'claims', v_claims,
    'trips', v_trips
  );
end $$;

revoke all on function ps_admin_rider_overview(uuid) from public, anon;
grant execute on function ps_admin_rider_overview(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
