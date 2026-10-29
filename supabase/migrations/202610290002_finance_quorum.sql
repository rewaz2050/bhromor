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
