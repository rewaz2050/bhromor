-- Reporting is not operational dispatch access. Keep ps_is_admin unchanged.
-- Prerequisites: finance approval boundary (001), vendor delegation (003).
begin;

do $$
declare
  signature text;
  fn regprocedure;
  definition text;
  old_guard text := 'if not (select ps_is_admin()) then';
  new_guard text := 'if not (select public.ps_can_manage_finance()) then';
begin
  foreach signature in array array[
    'public.ps_admin_money_summary()',
    'public.ps_admin_money_pnl(timestamptz,timestamptz)',
    'public.ps_admin_money_daily(date)',
    'public.ps_admin_rider_overview(uuid)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then raise exception 'Finance reporting prerequisite missing: %',signature; end if;
    definition := pg_get_functiondef(fn);
    if position(old_guard in definition)>0 then
      execute replace(definition,old_guard,new_guard);
    elsif position(new_guard in definition)=0 then
      raise exception 'Unexpected finance reporting guard: %',signature;
    end if;
    execute format('revoke all on function %s from public, anon',fn);
    execute format('grant execute on function %s to authenticated, service_role',fn);
  end loop;
end $$;

-- Restrictive policies also cap any legacy permissive "staff all" policy.
-- Own-shop Owner / own-rider policies are intersected, never widened: a
-- restrictive policy alone cannot create access that was not already granted.
do $$
declare t text;
begin
  foreach t in array array['shop_ledger','shop_payouts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists finance_report_read_boundary on public.%I',t);
    execute format('create policy finance_report_read_boundary on public.%I as restrictive for select to authenticated using (public.ps_can_manage_finance() or public.ps_vendor_owns_shop(shop_id))',t);
  end loop;
  foreach t in array array['rider_earnings','rider_payout_requests','rider_settlements','rider_settle_claims'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists finance_report_read_boundary on public.%I',t);
    execute format('create policy finance_report_read_boundary on public.%I as restrictive for select to authenticated using (public.ps_can_manage_finance() or exists (select 1 from public.riders r where r.id=rider_id and r.user_id=auth.uid()))',t);
  end loop;
end $$;
alter table public.money_audit_log enable row level security;
drop policy if exists finance_report_read_boundary on public.money_audit_log;
create policy finance_report_read_boundary on public.money_audit_log
  as restrictive for select to authenticated using (public.ps_can_manage_finance());

-- Rider board / scorecards keep operational COD custody, last deposit and
-- performance. They do not expose journals. Full dossier is now finance-only.
-- This does NOT implement column-level privacy on the legacy riders table;
-- its earnings_balance column needs a separate compatibility-safe migration.
notify pgrst,'reload schema';
commit;
