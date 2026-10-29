-- Operational staff cannot create/approve/impersonate riders. Financial
-- history survives even privileged application deletes and parent cascades.
begin;
create or replace function public.ps_guard_rider_controls()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user='authenticated' and public.ps_can_manage_finance() then
    if tg_op='INSERT' then
      if coalesce((to_jsonb(new)->>'cash_in_hand')::bigint,0)<>0 or coalesce((to_jsonb(new)->>'earnings_balance')::bigint,0)<>0 then
        raise exception 'forbidden: use the audited finance workflow';
      end if;
    elsif new.cash_in_hand is distinct from old.cash_in_hand or new.earnings_balance is distinct from old.earnings_balance then
      raise exception 'forbidden: use the audited finance workflow';
    end if;
  end if;
  if current_user='authenticated' and not public.ps_can_manage_finance() then
    if tg_op='UPDATE' then
      -- Independent Rider self-service remains: only availability/online.
      -- GPS and trusted accounting updates continue through definer RPCs.
      if old.user_id=auth.uid() and new.user_id=auth.uid()
        and (to_jsonb(new)-array['is_online','avail_from_hour','avail_to_hour','avail_days'])
          is not distinct from (to_jsonb(old)-array['is_online','avail_from_hour','avail_to_hour','avail_days']) then
        return new;
      end if;
    end if;
    raise exception 'forbidden: Admin permission required for rider control changes';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_rider_controls() from public,anon,authenticated;
drop trigger if exists trg_rider_controls on public.riders;
create trigger trg_rider_controls before insert or update on public.riders
for each row execute function public.ps_guard_rider_controls();

create table if not exists public.rider_control_audit (
  id uuid primary key default gen_random_uuid(), at timestamptz not null default now(),
  actor_id uuid, source_role text not null, rider_id uuid not null,
  fields text[] not null, before_state jsonb, after_state jsonb
);
alter table public.rider_control_audit enable row level security;
revoke all on public.rider_control_audit from public,anon,authenticated;
grant select on public.rider_control_audit to authenticated;
drop policy if exists rider_control_audit_read on public.rider_control_audit;
create policy rider_control_audit_read on public.rider_control_audit for select to authenticated
using(public.ps_can_manage_finance());

create or replace function public.ps_audit_rider_controls()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  before_row jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  after_row jsonb := to_jsonb(new);
  changed text[] := '{}'; f text;
begin
  foreach f in array array['status','user_id','licence_expires_on','kyc','reviewed_by','reviewed_at','rating_avg','rating_count','current_load','total_deliveries'] loop
    if before_row->f is distinct from after_row->f then changed:=array_append(changed,f); end if;
  end loop;
  if cardinality(changed)>0 then
    -- No KYC documents, coordinates, phone, wallet, PIN or proof URLs in log.
    insert into public.rider_control_audit(actor_id,source_role,rider_id,fields,before_state,after_state)
    values(auth.uid(),coalesce(nullif(current_setting('role',true),'none'),session_user),new.id,changed,
      jsonb_build_object('status',before_row->'status','userId',before_row->'user_id','licenceExpiresOn',before_row->'licence_expires_on'),
      jsonb_build_object('status',after_row->'status','userId',after_row->'user_id','licenceExpiresOn',after_row->'licence_expires_on'));
  end if;
  return new;
end $$;
revoke all on function public.ps_audit_rider_controls() from public,anon,authenticated;
drop trigger if exists trg_audit_rider_controls on public.riders;
create trigger trg_audit_rider_controls after insert or update on public.riders
for each row execute function public.ps_audit_rider_controls();

create or replace function public.ps_financial_history_no_delete()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'financial history is permanent: % forbidden on %',tg_op,tg_table_name;
end $$;
revoke all on function public.ps_financial_history_no_delete() from public,anon,authenticated;

-- Journal/paid-receipt UPDATE is never a correction workflow. Correct via
-- the existing actor-audited adjustment/reversal ledger instead.
do $$
declare t text;
begin
  foreach t in array array['rider_earnings','shop_payouts','rider_settlements','rider_control_audit'] loop
    execute format('drop trigger if exists trg_history_no_rewrite on public.%I',t);
    execute format('create trigger trg_history_no_rewrite before update on public.%I for each row execute function public.ps_financial_history_no_delete()',t);
  end loop;
  foreach t in array array['rider_earnings','shop_ledger','shop_payouts','rider_settlements','rider_payout_requests','rider_settle_claims','rider_disputes','money_audit_log','rider_control_audit','shop_commission_history','vendor_permission_audit'] loop
    -- Optional older audit tables may not exist in reduced installations.
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop trigger if exists trg_history_no_delete on public.%I',t);
    execute format('create trigger trg_history_no_delete before delete on public.%I for each row execute function public.ps_financial_history_no_delete()',t);
    execute format('drop trigger if exists trg_history_no_truncate on public.%I',t);
    execute format('create trigger trg_history_no_truncate before truncate on public.%I for each statement execute function public.ps_financial_history_no_delete()',t);
  end loop;
end $$;

-- State transitions/earnings must use their actor-checked definer workflow,
-- not a direct Admin/service table edit which could omit matching balances.
create or replace function public.ps_require_financial_workflow()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user in ('authenticated','anon','service_role') then
    raise exception 'forbidden: use the audited finance workflow';
  end if;
  return new;
end $$;
revoke all on function public.ps_require_financial_workflow() from public,anon,authenticated;
do $$
declare t text;
begin
  foreach t in array array['rider_earnings','rider_settlements','rider_payout_requests','rider_settle_claims','rider_disputes'] loop
    execute format('drop trigger if exists trg_finance_workflow on public.%I',t);
    execute format('create trigger trg_finance_workflow before insert or update on public.%I for each row execute function public.ps_require_financial_workflow()',t);
  end loop;
end $$;

-- Only the existing nested accounting trigger may re-net a shop wallet
-- receipt; do not freeze that legitimate payable/collected adjustment.
create or replace function public.ps_guard_shop_ledger_rewrite()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user in ('authenticated','anon','service_role') or pg_trigger_depth()<2
    or (to_jsonb(new)-array['payable','collected_by_shop']) is distinct from
       (to_jsonb(old)-array['payable','collected_by_shop']) then
    raise exception 'financial history is permanent: shop ledger rewrite forbidden';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_shop_ledger_rewrite() from public,anon,authenticated;
drop trigger if exists trg_shop_ledger_no_rewrite on public.shop_ledger;
create trigger trg_shop_ledger_no_rewrite before update on public.shop_ledger
for each row execute function public.ps_guard_shop_ledger_rewrite();
-- Existing money audit covers rate/risk INSERT/UPDATE, but not auto-suspend
-- or key removal/rename. Record these as the existing rate_change event.
create or replace function public.ps_audit_dispatch_policy()
returns trigger language plpgsql security definer set search_path=public as $$
declare k text; prior_value jsonb; next_value jsonb;
begin
  k:=case when tg_op='DELETE' then old.key else new.key end;
  if tg_op='UPDATE' and old.key is distinct from new.key and old.key in
    ('rider_auto_suspend','rider_load_limit','rider_cash_cap_paisa','offer_ttl_seconds','delivery_max_attempts','rider_failed_delivery_fee_paisa') then
    perform public.ps_money_audit_write('rate_change','setting',old.key,null,
      jsonb_build_object('operation','rename','from',old.value,'to',null,'toKey',new.key));
  end if;
  if k='rider_auto_suspend' or (tg_op='DELETE' and k in
    ('rider_load_limit','rider_cash_cap_paisa','offer_ttl_seconds','delivery_max_attempts','rider_failed_delivery_fee_paisa')) then
    prior_value:=case when tg_op in ('UPDATE','DELETE') then old.value else null end;
    next_value:=case when tg_op='DELETE' then null else new.value end;
    if prior_value is distinct from next_value then
      perform public.ps_money_audit_write('rate_change','setting',k,null,
        jsonb_build_object('operation',lower(tg_op),'from',prior_value,'to',next_value));
    end if;
  end if;
  return null;
end $$;
revoke all on function public.ps_audit_dispatch_policy() from public,anon,authenticated;
drop trigger if exists trg_audit_dispatch_policy on public.site_settings;
create trigger trg_audit_dispatch_policy after insert or update or delete on public.site_settings
for each row execute function public.ps_audit_dispatch_policy();

notify pgrst,'reload schema';
commit;
