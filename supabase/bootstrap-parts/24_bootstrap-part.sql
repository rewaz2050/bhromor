-- PART 24/24 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: shop-scoped fulfilment entry (202610260002) ====
-- A platform rank must neither erase independent shop membership nor let a
-- shop endpoint inherit global operations/exception authority.
begin;

do $$
declare definition text; scoped text; header text;
begin
  if to_regprocedure('public.ps_vendor_has_permission(uuid,text)') is null
     or to_regprocedure('public.ps_advance_order_internal(uuid,ps_order_status,text)') is null then
    raise exception 'Install vendor delegation and PIN-safe order workflow first';
  end if;
  definition := pg_get_functiondef('public.ps_advance_order_internal(uuid,ps_order_status,text)'::regprocedure);
  header := split_part(definition,E'\n',1);
  if position('CREATE OR REPLACE FUNCTION public.ps_advance_order_internal(' in header)<>1
     or position('  v_is_admin := (select ps_is_admin());' in definition)=0
     or position('-- PIN response projection 202610260001' in definition)=0 then
    raise exception 'Unexpected private order machine: scoped actor patch not applied';
  end if;
  -- Clone the installed machine, including stock/payment/rider/PIN guards and
  -- all masked return paths. No second hand-maintained accounting body.
  scoped := replace(definition,header,
    'CREATE OR REPLACE FUNCTION public.ps_advance_order_scoped(p_order_id uuid,p_to ps_order_status,p_note text,p_shop_actor boolean)');
  scoped := replace(scoped,'  v_is_admin := (select ps_is_admin());',E'  v_is_admin := (select ps_is_admin());\n  -- Explicit shop actor scope (202610260002)\n  if p_shop_actor then v_is_admin := false; end if;');
  execute scoped;
end $$;
-- Never expose the actor selector as an API parameter. The public vendor
-- wrapper always checks current own-shop membership and always selects true.
revoke all on function public.ps_advance_order_scoped(uuid,ps_order_status,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.ps_vendor_advance_order(p_order_id uuid,p_to ps_order_status,p_note text default null)
returns orders language plpgsql security definer set search_path=public as $$
declare v_order orders%rowtype;
begin
  if auth.uid() is null or p_to not in ('confirmed','preparing','ready-for-pickup','cancelled') then
    raise exception 'forbidden: shop fulfilment targets only';
  end if;
  select * into v_order from orders where id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.ps_vendor_has_permission(v_order.shop_id,'fulfilment') then
    raise exception 'forbidden: active own-shop membership required';
  end if;
  -- The core's non-admin lane independently checks cancellation grants,
  -- membership, target states and wallet-payment gating under this order lock.
  -- Ignore caller notes: the shop lane must not forge platform override text.
  v_order := public.ps_advance_order_scoped(p_order_id,p_to,null,true);
  -- PIN response projection 202610260001
  v_order.delivery_code := null;
  return v_order;
end $$;
revoke all on function public.ps_vendor_advance_order(uuid,ps_order_status,text) from public,anon;
grant execute on function public.ps_vendor_advance_order(uuid,ps_order_status,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- ==== Feature: same-actor finance decision boundary (202610260003) ====
-- Same-actor finance decisions: an approver may not decide money that belongs
-- to their own Rider account or record a payout for a shop they own.
-- This narrows only the exact self-decision; all other finance semantics
-- (who may approve, amounts, accounting, audit) remain unchanged.
begin;

-- One helper so every patched RPC answers identically. The target rider is
-- compared with the actor's own rider row; a staff member with no rider
-- account is unaffected.
create or replace function public.ps_guard_self_finance(p_rider_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_rider_id is not null and p_rider_id = public.ps_rider_id() then
    raise exception 'forbidden: cannot decide your own money';
  end if;
end $$;
revoke all on function public.ps_guard_self_finance(uuid) from public, anon;
grant execute on function public.ps_guard_self_finance(uuid) to authenticated, service_role;

-- Patch the installed accounting bodies by inserting one guard call each.
-- Fail closed on a missing/unexpected function; never install half a rule.
do $$
declare
  spec record;
  definition text;
  occurrences int;
begin
  for spec in
    select * from (values
      ('public.ps_admin_settle_rider(uuid,text,text,boolean)',
       E'  if not (select public.ps_can_manage_finance()) then\n    raise exception \'forbidden\';\n  end if;',
       E'\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(p_rider_id);'),
      ('public.ps_admin_reject_settle(uuid,text)',
       E'  if not (select public.ps_can_manage_finance()) then\n    raise exception \'forbidden\';\n  end if;',
       E'\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(p_rider_id);'),
      ('public.ps_admin_adjust_rider(uuid,bigint,text)',
       E'  if not (select public.ps_can_manage_finance()) then\n    raise exception \'forbidden\';\n  end if;',
       E'\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(p_rider_id);'),
      ('public.ps_admin_decide_rider_payout(uuid,text,text,text)',
       E'  if not found then\n    raise exception \'payout not found\';\n  end if;',
       E'\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(v_payout.rider_id);'),
      ('public.ps_admin_resolve_dispute(uuid,text,bigint,text)',
       E'  if not found then\n    raise exception \'dispute not found\';\n  end if;',
       E'\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(v_row.rider_id);')
    ) as t(signature, anchor, guard)
  loop
    if to_regprocedure(spec.signature) is null then
      raise exception 'Self-dealing prerequisite missing: %', spec.signature;
    end if;
    definition := pg_get_functiondef(spec.signature::regprocedure);
    if position('Self-dealing boundary (202610260003)' in definition) = 0 then
      occurrences := (length(definition) - length(replace(definition, spec.anchor, ''))) / length(spec.anchor);
      if occurrences <> 1 then
        raise exception 'Unexpected % body (anchor matches % times)', spec.signature, occurrences;
      end if;
      execute replace(definition, spec.anchor, spec.anchor || spec.guard);
    end if;
    execute format('revoke all on function %s from public, anon', spec.signature);
    execute format('grant execute on function %s to authenticated, service_role', spec.signature);
  end loop;
end $$;

-- Shop payouts are recorded by the server with an explicit paid_by. A shop's
-- own Owner must not be that recorder, even when they also hold Admin access:
-- another finance Admin records the line. SECURITY DEFINER is needed so the
-- ownership check cannot be hidden from by vendor_users RLS; it exposes no row
-- data and only raises. Legacy rows / inserts without paid_by are unaffected.
create or replace function public.ps_guard_shop_payout_self_dealing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.paid_by is not null and exists (
    select 1 from public.vendor_users v
    where v.user_id = new.paid_by
      and v.shop_id = new.shop_id
      and v.role = 'owner'
  ) then
    raise exception 'forbidden: cannot record a payout for your own shop';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_shop_payout_self_dealing() from public, anon, authenticated;
drop trigger if exists trg_shop_payout_self_dealing on public.shop_payouts;
create trigger trg_shop_payout_self_dealing before insert on public.shop_payouts
for each row execute function public.ps_guard_shop_payout_self_dealing();

notify pgrst, 'reload schema';
commit;

-- ==== Feature: rollout visibility RPC for the permission batch (202610270001) ====
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

-- ==== Feature: counter-pickup handover override (202610290001) ====
-- Counter-pickup handover without the receipt.
--
-- The PIN remains the only normal way to close a pickup: it is never re-issued
-- and never shown to staff (202610260001). But that left a real dead end —
-- `ps_advance_order` refuses to move a pickup to delivered and
-- `ps_collect_pickup_order` needs the 4 digits, so a customer who lost the
-- confirmation on another device could never collect their parcel, by anyone,
-- ever. This file adds the narrow exception the approved model allows:
-- Admin/Super Admin only, a mandatory 10–300 character reason, and both the
-- reason and the actor written into the order timeline.
--
-- Deliberately NOT here: PIN re-issue, PIN display to staff, OTP (no funded
-- gateway exists), and any shop/rider/manager path. A counter override is an
-- operational exception with a name attached, not a second handover flow.
-- Requires 202610250001–250007 and 202610260001–260003.
begin;

create or replace function public.ps_admin_override_pickup(p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_assignment record;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  -- Admin/Super Admin only. ps_is_admin() also admits Manager, who runs
  -- operations but must not open a parcel's PIN gate.
  if auth.uid() is null or not exists (
    select 1 from admin_users
    where id = auth.uid() and role in ('admin', 'super_admin')
  ) then
    raise exception 'forbidden';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 300 then
    raise exception 'override reason required (10-300 characters)';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not coalesce(v_order.is_pickup, false) or coalesce(v_order.is_return, false) then
    raise exception 'not a counter pickup';
  end if;
  -- Serialize retries exactly like the PIN path: no duplicate delivery,
  -- history or ledger accounting.
  if v_order.status = 'delivered' then return jsonb_build_object('ok', true); end if;
  if v_order.status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
    raise exception 'pickup not ready';
  end if;
  if v_order.payment in ('bkash', 'nagad') and v_order.payment_status is distinct from 'verified' then
    raise exception 'payment not verified';
  end if;
  -- A rider holding the parcel is physical custody, not a counter problem.
  if exists (
    select 1 from delivery_assignments
    where order_id = p_order_id and state in ('accepted', 'picked_up')
  ) then
    raise exception 'rider delivery in progress';
  end if;

  -- Withdraw only pending invitations, never a rider's custody.
  for v_assignment in select id from delivery_assignments where order_id = p_order_id and state = 'offered' loop
    perform public.ps_cancel_assignment(v_assignment.id);
  end loop;

  -- Same machine as the verified handover, so stock, COD, wallet and
  -- accounting stay identical; only the PIN check is replaced by the reason.
  if v_order.status = 'ready-for-pickup' then
    perform public.ps_advance_order_internal(p_order_id, 'courier-assigned', null);
  end if;
  if v_order.status in ('ready-for-pickup', 'courier-assigned') then
    perform public.ps_advance_order_internal(p_order_id, 'out-for-delivery', null);
  end if;
  perform public.ps_advance_order_internal(
    p_order_id,
    'delivered',
    '[Pickup override — PIN not verified] ' || v_reason
  );
  update orders set delivery_code_attempts = 0, delivery_code_locked_until = null
  where id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ps_admin_override_pickup(uuid, text) from public, anon;
grant execute on function public.ps_admin_override_pickup(uuid, text) to authenticated, service_role;

-- /api/health must be able to say whether THIS file landed. ps_health_probes()
-- (202610270001) already answers the ten permission files from the catalogs, so
-- keep it as the base and add one key instead of copying its body: a later
-- permission file added to the batch then only touches its own key.
do $$
begin
  if to_regprocedure('public.ps_health_probes()') is null then
    raise exception 'Install 202610270001_health_probe_rpc.sql before the pickup handover override';
  end if;
  if to_regprocedure('public.ps_health_probes_base()') is null then
    alter function public.ps_health_probes() rename to ps_health_probes_base;
  end if;
end $$;
revoke all on function public.ps_health_probes_base() from public, anon, authenticated;

create or replace function public.ps_health_probes()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select public.ps_health_probes_base() || jsonb_build_object(
    -- 202610290001 — audited Admin/Super Admin counter-pickup override.
    'pickupHandoverOverride',
      to_regprocedure('public.ps_admin_override_pickup(uuid,text)') is not null
      and (select count(*) from pg_proc f
           where f.pronamespace = 'public'::regnamespace
             and f.proname = 'ps_admin_override_pickup'
             and f.prosrc like '%Pickup override — PIN not verified%') = 1
  );
$fn$;
revoke all on function public.ps_health_probes() from public, anon, authenticated;
grant execute on function public.ps_health_probes() to service_role;

notify pgrst, 'reload schema';
commit;

-- ==== Feature: four-eyes finance quorum (202610290002) ====
-- Four-eyes finance: above a threshold, a decision needs two distinct Admins.
--
-- 202610260003 stops ONE person deciding their own money. It cannot stop two
-- people agreeing to break a rule. This file adds the missing control, and
-- ships it OFF: `finance_quorum_paisa` defaults to 0, which means "no change".
-- Set it (Admin → Money, or site_settings) and every money-moving decision at
-- or above that amount needs a second Admin's recorded confirmation first.
--
-- Why a confirmation table instead of a new approval workflow: the deciding
-- RPC keeps its shape, its audit row and its accounting. It simply refuses
-- until somebody else has confirmed the same decision and amount. The decider
-- is recorded by the RPC that already did; the confirmer is recorded here.
--
-- Requires 202610250001-250007, 202610260001-260003.
begin;

create table if not exists public.finance_quorum_confirmations (
  id                uuid primary key default gen_random_uuid(),
  decision_kind     text not null
                     check (decision_kind in ('rider_payout', 'rider_settle', 'rider_adjust', 'rider_dispute')),
  decision_ref      uuid not null,
  -- The amount the confirmer saw. A confirmation only satisfies a decision for
  -- the SAME amount: confirming ৳500 must never authorise ৳500,000 later.
  amount            bigint not null check (amount >= 0),
  confirmed_by      uuid not null,
  confirmed_by_email text,
  created_at        timestamptz not null default now(),
  unique (decision_kind, decision_ref, confirmed_by)
);
create index if not exists finance_quorum_by_ref
  on public.finance_quorum_confirmations (decision_kind, decision_ref);

-- Closed like rider_payout_requests: no policy, no browser access. The only
-- writer is the SECURITY DEFINER RPC below; the only reader is the check,
-- which runs inside another definer function.
alter table public.finance_quorum_confirmations enable row level security;
revoke all on public.finance_quorum_confirmations from public, anon, authenticated;

-- 0 (default) = quorum off, byte-identical behaviour to before this file.
create or replace function public.ps_finance_quorum_threshold()
returns bigint language sql stable security definer set search_path = public as $$
  select greatest(public.ps_setting_int('finance_quorum_paisa', 0), 0);
$$;
revoke all on function public.ps_finance_quorum_threshold() from public, anon;
grant execute on function public.ps_finance_quorum_threshold() to authenticated, service_role;

/**
 * Raise unless a DIFFERENT admin has confirmed this exact decision and amount
 * recently. No-ops below the threshold, so nothing changes until the setting
 * is turned on.
 */
create or replace function public.ps_finance_quorum_check(
  p_kind text,
  p_ref uuid,
  p_amount bigint
)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_threshold bigint := public.ps_finance_quorum_threshold();
  v_amount bigint := abs(coalesce(p_amount, 0));
begin
  if v_threshold <= 0 or v_amount < v_threshold then
    return;
  end if;
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  -- A 24h window keeps a stale confirmation from authorising next month's
  -- payout; the amount guard above keeps it from authorising a different one.
  if exists (
    select 1 from public.finance_quorum_confirmations c
    where c.decision_kind = p_kind
      and c.decision_ref = p_ref
      and c.amount = v_amount
      and c.confirmed_by <> auth.uid()
      and c.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;
  raise exception 'finance quorum required: a second Admin must confirm this decision first';
end $$;
-- No browser role may call the check directly; only the SECURITY DEFINER
-- money RPCs call it, and /api/health confirms it exists as service_role.
revoke all on function public.ps_finance_quorum_check(text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.ps_finance_quorum_check(text, uuid, bigint) to service_role;

/**
 * The second Admin's half of a four-eyes decision. Idempotent: confirming the
 * same decision twice only refreshes the timestamp of that Admin's own row.
 * It does not decide anything — the deciding RPC still does, and still records
 * the real actor.
 */
create or replace function public.ps_admin_confirm_finance(
  p_kind text,
  p_ref uuid,
  p_amount bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_kind text := lower(btrim(coalesce(p_kind, '')));
begin
  if auth.uid() is null or not public.ps_can_manage_finance() then
    raise exception 'forbidden';
  end if;
  if v_kind not in ('rider_payout', 'rider_settle', 'rider_adjust', 'rider_dispute') then
    raise exception 'unknown finance decision kind';
  end if;
  if p_ref is null then
    raise exception 'a finance decision reference is required';
  end if;
  insert into public.finance_quorum_confirmations
    (decision_kind, decision_ref, amount, confirmed_by, confirmed_by_email)
  values (v_kind, p_ref, abs(coalesce(p_amount, 0)), auth.uid(), public.ps_actor_email())
  on conflict (decision_kind, decision_ref, confirmed_by)
    do update set amount = excluded.amount, created_at = now(),
                  confirmed_by_email = excluded.confirmed_by_email;
  return jsonb_build_object('ok', true, 'threshold', public.ps_finance_quorum_threshold());
end $$;
revoke all on function public.ps_admin_confirm_finance(text, uuid, bigint) from public, anon;
grant execute on function public.ps_admin_confirm_finance(text, uuid, bigint) to authenticated, service_role;

-- Patch the four money-moving bodies. Each anchor must appear exactly once and
-- the self-dealing boundary from 202610260003 must already be installed: fail
-- closed on anything unexpected rather than half-installing a rule.
do $$
declare
  spec record;
  definition text;
  occurrences int;
  marker constant text := '-- Finance quorum (202610290002)';
begin
  for spec in
    select * from (values
      -- Payout paid: the amount and the decision are already loaded.
      ('public.ps_admin_decide_rider_payout(uuid,text,text,text)',
       E'  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(v_payout.rider_id);',
       E'\n  -- Finance quorum (202610290002)\n  if v_decision = \'paid\' then\n    perform public.ps_finance_quorum_check(\'rider_payout\', p_payout_id, v_payout.amount);\n  end if;'),
      -- Cash settlement moves the rider's whole hand balance.
      ('public.ps_admin_settle_rider(uuid,text,text,boolean)',
       E'  if v_rider.cash_in_hand <= 0 then\n    raise exception \'nothing to settle\';\n  end if;',
       E'\n  -- Finance quorum (202610290002)\n  perform public.ps_finance_quorum_check(\'rider_settle\', v_rider.id, v_rider.cash_in_hand);'),
      -- Manual wallet adjustment: the amount is a parameter, the ref is the rider.
      ('public.ps_admin_adjust_rider(uuid,bigint,text)',
       E'  if not (select public.ps_can_manage_finance()) then\n    raise exception \'forbidden\';\n  end if;',
       E'\n  -- Finance quorum (202610290002)\n  perform public.ps_finance_quorum_check(\'rider_adjust\', p_rider_id, p_amount);'),
      -- Dispute award: only the branch that credits the wallet moves money.
      ('public.ps_admin_resolve_dispute(uuid,text,bigint,text)',
       E'  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(v_row.rider_id);',
       E'\n  -- Finance quorum (202610290002)\n  if v_decision = \'approve\' then\n    perform public.ps_finance_quorum_check(\'rider_dispute\', p_id, abs(coalesce(p_amount, 0)));\n  end if;')
    ) as t(signature, anchor, insertion)
  loop
    if to_regprocedure(spec.signature) is null then
      raise exception 'Finance quorum prerequisite missing: %', spec.signature;
    end if;
    definition := pg_get_functiondef(spec.signature::regprocedure);
    if position(marker in definition) = 0 then
      occurrences := (length(definition) - length(replace(definition, spec.anchor, ''))) / length(spec.anchor);
      if occurrences <> 1 then
        raise exception 'Unexpected % body (anchor matches % times)', spec.signature, occurrences;
      end if;
      definition := replace(definition, spec.anchor, spec.anchor || spec.insertion);
      execute definition;
    end if;
    execute format('revoke all on function %s from public, anon', spec.signature);
    execute format('grant execute on function %s to authenticated, service_role', spec.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
