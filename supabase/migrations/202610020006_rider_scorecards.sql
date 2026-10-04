-- ============================================================================
-- M (2026-10-02) — RIDER SCORECARDS: every active rider's reliability facts in
-- one read, for a ranked board and for the (opt-in) auto-suspend sweep.
--
--   ps_rider_scorecards_raw(p_days)   SERVICE ROLE ONLY — no admin check, so
--                                     the scheduler (which has no staff JWT)
--                                     can use it. Not callable by anon /
--                                     authenticated.
--   ps_admin_rider_scorecards(p_days) staff-only wrapper for the board.
--
-- Both return a jsonb ARRAY (one object per ACTIVE rider): identity, rating,
-- cash position, the oldest unsettled COD parcel, whether a settle claim is
-- pending, and the p_days-day offer outcomes. The app turns facts into scores
-- (src/lib/rider-quality.ts) so thresholds stay unit-tested, not buried here.
-- Read-only; safe to re-run.
-- ============================================================================
begin;

create or replace function ps_rider_scorecards_raw(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_pending uuid[] := '{}';
  v_out jsonb;
begin
  if to_regclass('public.rider_settle_claims') is not null then
    execute $q$select coalesce(array_agg(distinct rider_id), '{}') from rider_settle_claims where status = 'pending'$q$
      into v_pending;
  end if;

  select coalesce(jsonb_agg(c order by (c->>'name')), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'id', r.id, 'name', r.name, 'vehicle', r.vehicle, 'isOnline', r.is_online,
      'ratingAvg', r.rating_avg, 'ratingCount', r.rating_count,
      'cashInHand', coalesce(r.cash_in_hand, 0), 'currentLoad', coalesce(r.current_load, 0),
      'createdAt', r.created_at,
      'pendingClaim', r.id = any (v_pending),
      'lastSettledAt', (select max(settled_at) from rider_settlements s where s.rider_id = r.id),
      'oldestCodAt', case when coalesce(r.cash_in_hand, 0) > 0 then (
          select min(a.delivered_at)
            from delivery_assignments a
            join orders o on o.id = a.order_id
           where a.rider_id = r.id and a.state = 'delivered'
             and coalesce(o.payment, 'cod') = 'cod'
             and coalesce(o.is_return, false) = false
             and a.delivered_at > coalesce((select max(settled_at) from rider_settlements s where s.rider_id = r.id), '-infinity'::timestamptz)
        ) end,
      'offered', coalesce(p.offered, 0), 'delivered', coalesce(p.delivered, 0),
      'failed', coalesce(p.failed, 0), 'declined', coalesce(p.declined, 0),
      'expired', coalesce(p.expired, 0),
      'avgDeliveryMinutes', r.avg_delivery_minutes
    ) as c
    from riders r
    left join (
      select a.rider_id,
             count(*) as offered,
             count(*) filter (where a.state = 'delivered') as delivered,
             count(*) filter (where a.state = 'failed') as failed,
             count(*) filter (where a.state = 'cancelled' and a.cancelled_by = 'rider_decline') as declined,
             count(*) filter (where a.state = 'expired') as expired
        from delivery_assignments a
       where a.offered_at >= now() - make_interval(days => v_days)
       group by a.rider_id
    ) p on p.rider_id = r.id
    where r.status = 'active'
  ) s;
  return v_out;
end $$;

revoke all on function ps_rider_scorecards_raw(int) from public, anon, authenticated;
grant execute on function ps_rider_scorecards_raw(int) to service_role;

create or replace function ps_admin_rider_scorecards(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  return ps_rider_scorecards_raw(p_days);
end $$;

revoke all on function ps_admin_rider_scorecards(int) from public, anon;
grant execute on function ps_admin_rider_scorecards(int) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
