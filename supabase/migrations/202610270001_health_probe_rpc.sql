-- Rollout visibility for the 2026-10-25 → 27 permission batch.
--
-- /api/health can see functions, columns and tables through PostgREST, but not
-- triggers or policies — exactly what 202610250002 (a trigger) and
-- 202610250004 (restrictive policies) add. This RPC reads the catalogs once and
-- returns plain booleans, so an operator sees all ten files from the dashboard
-- instead of having to run a SQL checklist.
--
-- Read-only by construction: every value is a catalog lookup, no row data is
-- returned, no table is touched. Service role only — /api/health already uses
-- the service client, and a browser key has no business enumerating schema
-- state. Absent objects answer false instead of raising: on a half-applied
-- database the report must still render.
begin;

create or replace function public.ps_health_probes()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    -- 202610250001 — finance approvals are Admin/Super Admin only.
    'financeBoundary',
      to_regprocedure('public.ps_can_manage_finance()') is not null,
    -- 202610250002 — shop-first fulfilment plus the direct-UPDATE trigger.
    'shopFirstFulfilment',
      to_regprocedure('public.ps_guard_direct_order_workflow()') is not null
      and (select count(*) from pg_trigger t
           where t.tgrelid = to_regclass('public.orders')
             and t.tgname = 'trg_direct_order_workflow'
             and not t.tgisinternal) = 1,
    -- 202610250003 — owner-controlled staff grants, audited.
    'delegatedStaff',
      to_regprocedure('public.ps_vendor_has_permission(uuid,text)') is not null
      and to_regclass('public.vendor_permission_audit') is not null
      and (select count(*) from pg_attribute a
           where a.attrelid = to_regclass('public.vendor_users')
             and a.attname = 'permissions'
             and a.attnum > 0 and not a.attisdropped) = 1,
    -- 202610250004 — money reports and ledgers stop leaking to Manager.
    'financeReporting',
      (select count(*) from pg_policy p
       where p.polrelid = to_regclass('public.shop_ledger')
         and p.polname = 'finance_report_read_boundary') = 1
      and (select count(*) from pg_proc f
           where f.oid = to_regprocedure('public.ps_admin_money_summary()')
             and f.prosrc ilike '%ps_can_manage_finance%') = 1,
    -- 202610250005 — the wallet balance is a projection, not a readable column.
    'riderWalletPrivacy',
      to_regprocedure('public.ps_read_riders()') is not null
      and (select count(*) from pg_attribute a
           where a.attrelid = to_regclass('public.riders')
             and a.attname = 'earnings_balance'
             and a.attnum > 0 and not a.attisdropped
             and not has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')) = 1,
    -- 202610250006 — rider lifecycle audited, financial history immutable.
    'riderControlsRetention',
      to_regclass('public.rider_control_audit') is not null
      and to_regprocedure('public.ps_financial_history_no_delete()') is not null
      and (select count(distinct t.tgname) from pg_trigger t
           where t.tgrelid = to_regclass('public.rider_earnings')
             and t.tgname in ('trg_history_no_delete', 'trg_history_no_rewrite')
             and not t.tgisinternal) = 2,
    -- 202610250007 — atomic role changes with an immutable audit.
    'staffRoles',
      to_regprocedure('public.ps_change_staff_role(uuid,uuid,text)') is not null
      and to_regclass('public.staff_role_audit') is not null
      and (select count(distinct t.tgname) from pg_trigger t
           where t.tgrelid = to_regclass('public.staff_role_audit')
             and t.tgname in ('trg_staff_role_audit_immutable', 'trg_staff_role_audit_no_truncate')
             and not t.tgisinternal) = 2,
    -- 202610260001 — stored PIN unreadable, PIN-verified counter handover.
    'orderPinPrivacy',
      to_regclass('public.order_operations') is not null
      and to_regprocedure('public.ps_collect_pickup_order(uuid,text)') is not null
      and (select count(*) from pg_attribute a
           where a.attrelid = to_regclass('public.orders')
             and a.attname = 'delivery_code'
             and a.attnum > 0 and not a.attisdropped
             and not has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')) = 1
      and (select count(*) from pg_trigger t
           where t.tgrelid = to_regclass('public.orders')
             and t.tgname = 'trg_order_pin'
             and not t.tgisinternal) = 1,
    -- 202610260002 — own-shop lane, private scoped machine.
    'shopScopedFulfilment',
      to_regprocedure('public.ps_vendor_advance_order(uuid,ps_order_status,text)') is not null
      and to_regprocedure('public.ps_advance_order_scoped(uuid,ps_order_status,text,boolean)') is not null,
    -- 202610260003 — no deciding your own money, no recording your own shop's
    -- payout. The marker is injected into all five accounting bodies.
    'financeSelfDealing',
      to_regprocedure('public.ps_guard_self_finance(uuid)') is not null
      and to_regprocedure('public.ps_guard_shop_payout_self_dealing()') is not null
      and (select count(*) from pg_trigger t
           where t.tgrelid = to_regclass('public.shop_payouts')
             and t.tgname = 'trg_shop_payout_self_dealing'
             and not t.tgisinternal) = 1
      and (select count(*) from pg_proc f
           where f.pronamespace = 'public'::regnamespace
             and f.proname in ('ps_admin_settle_rider','ps_admin_reject_settle','ps_admin_adjust_rider',
                               'ps_admin_decide_rider_payout','ps_admin_resolve_dispute')
             and f.prosrc like '%Self-dealing boundary (202610260003)%') = 5
  );
$fn$;
revoke all on function public.ps_health_probes() from public, anon, authenticated;
grant execute on function public.ps_health_probes() to service_role;

notify pgrst, 'reload schema';
commit;
