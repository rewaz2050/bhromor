-- ============================================================================
-- Shop balances are SUMMED IN THE DATABASE (2026-10-03).
--
-- Until now the admin payouts screen, the "record a payout" pre-check, the vendor
-- earnings page and the shop dossier all fetched ledger / payout ROWS and added
-- them up in Node — capped at 5,000, 100, 20 or a window. PostgREST also caps a
-- response at `max_rows` (1,000 by default), so once a shop (or the platform) had
-- more rows than that the "lifetime paid" and "balance due" figures were quietly
-- wrong. The database trigger `ps_guard_payout_balance` was always right; only the
-- DISPLAY and the app-side pre-check were not.
--
-- One aggregate function. SECURITY INVOKER: row-level security still decides what
-- the caller may see (staff: every shop, a vendor: their own), so it opens nothing.
-- Safe to re-run.
-- ============================================================================

begin;

create or replace function ps_shop_balance_totals(p_shop_id uuid default null)
returns table (shop_id uuid, earned bigint, paid bigint, last_payout_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with e as (
    select l.shop_id, sum(l.payable)::bigint as earned
      from shop_ledger l
     where p_shop_id is null or l.shop_id = p_shop_id
     group by l.shop_id
  ), p as (
    select s.shop_id, sum(s.amount)::bigint as paid, max(s.paid_at) as last_at
      from shop_payouts s
     where p_shop_id is null or s.shop_id = p_shop_id
     group by s.shop_id
  )
  select coalesce(e.shop_id, p.shop_id),
         coalesce(e.earned, 0)::bigint,
         coalesce(p.paid, 0)::bigint,
         p.last_at
    from e full join p on p.shop_id = e.shop_id;
$$;

revoke all on function ps_shop_balance_totals(uuid) from public, anon;
grant execute on function ps_shop_balance_totals(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
