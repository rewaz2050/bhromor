-- PART 23/24 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ===== MIRROR: supabase/migrations/202610250003_vendor_staff_permissions.sql =====
-- Owner-controlled, explicit staff grants. Existing staff default to NONE.
-- Catalog includes prices/media/variant structure; inventory alone is stock-only.
begin;
alter table public.vendor_users add column if not exists permissions text[] not null default '{}';
alter table public.vendor_users drop constraint if exists vendor_permissions_known;
alter table public.vendor_users add constraint vendor_permissions_known check (
  permissions <@ array['catalog','inventory','cashier','cancellation']::text[]
  and array_position(permissions, null) is null and cardinality(permissions)<=4
);

create or replace function public.ps_vendor_owns_shop(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.vendor_users v join public.shops s on s.id=v.shop_id
    where v.user_id=auth.uid() and v.shop_id=p_shop and v.role='owner' and s.status='active');
$$;
create or replace function public.ps_vendor_has_permission(p_shop uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_permission in ('fulfilment','catalog','inventory','cashier','cancellation') and exists(
    select 1 from public.vendor_users v join public.shops s on s.id=v.shop_id
    where v.user_id=auth.uid() and v.shop_id=p_shop and s.status='active'
      and (v.role='owner' or (v.role='staff' and (p_permission='fulfilment' or p_permission=any(v.permissions))))
  );
$$;
revoke all on function public.ps_vendor_owns_shop(uuid), public.ps_vendor_has_permission(uuid,text) from public, anon;
grant execute on function public.ps_vendor_owns_shop(uuid), public.ps_vendor_has_permission(uuid,text) to authenticated, service_role;

-- Intersect legacy broad staff/owner policies; a staff login cannot delegate,
-- and a Manager's broad ps_is_admin membership cannot grant shop access.
alter table public.vendor_users enable row level security;
drop policy if exists vendor_team_insert_boundary on public.vendor_users;
create policy vendor_team_insert_boundary on public.vendor_users as restrictive for insert to authenticated
with check (public.ps_can_manage_finance() or (role='staff' and public.ps_vendor_owns_shop(shop_id)));
drop policy if exists vendor_team_update_boundary on public.vendor_users;
create policy vendor_team_update_boundary on public.vendor_users as restrictive for update to authenticated
using (public.ps_can_manage_finance() or (role='staff' and public.ps_vendor_owns_shop(shop_id)))
with check (public.ps_can_manage_finance() or (role='staff' and public.ps_vendor_owns_shop(shop_id)));
drop policy if exists vendor_team_delete_boundary on public.vendor_users;
create policy vendor_team_delete_boundary on public.vendor_users as restrictive for delete to authenticated
using (public.ps_can_manage_finance() or (role='staff' and public.ps_vendor_owns_shop(shop_id)));

create table if not exists public.vendor_permission_audit (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  user_id uuid not null, actor_id uuid,
  before_permissions text[] not null, after_permissions text[] not null,
  created_at timestamptz not null default now()
);
alter table public.vendor_permission_audit enable row level security;
revoke all on public.vendor_permission_audit from public, anon, authenticated, service_role;
grant select on public.vendor_permission_audit to authenticated, service_role;
drop policy if exists vendor_permission_audit_read on public.vendor_permission_audit;
create policy vendor_permission_audit_read on public.vendor_permission_audit for select to authenticated
using (public.ps_can_manage_finance() or public.ps_vendor_owns_shop(shop_id));
create or replace function public.ps_audit_vendor_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='DELETE' then
    if cardinality(old.permissions)>0 then
      insert into public.vendor_permission_audit(shop_id,user_id,actor_id,before_permissions,after_permissions)
      values(old.shop_id,old.user_id,auth.uid(),old.permissions,'{}'::text[]);
    end if;
    return old;
  end if;
  if (tg_op='INSERT' and cardinality(new.permissions)>0)
     or (tg_op='UPDATE' and new.permissions is distinct from old.permissions) then
    insert into public.vendor_permission_audit(shop_id,user_id,actor_id,before_permissions,after_permissions)
    values(new.shop_id,new.user_id,auth.uid(),case when tg_op='INSERT' then '{}'::text[] else old.permissions end,new.permissions);
  end if;
  return new;
end $$;
revoke all on function public.ps_audit_vendor_permissions() from public, anon, authenticated;
drop trigger if exists trg_audit_vendor_permissions on public.vendor_users;
create trigger trg_audit_vendor_permissions after insert or update or delete on public.vendor_users
for each row execute function public.ps_audit_vendor_permissions();

-- Existing RPC authorization, payment routing and stock machine stay intact.
do $$
declare definition text; guard text;
begin
  definition := pg_get_functiondef('public.ps_advance_order(uuid,ps_order_status,text)'::regprocedure);
  if position('-- Vendor delegated cancellation (202610250003)' in definition)=0 then
    if position('  if not v_is_admin then' in definition)=0 then raise exception 'Unexpected order authorization guard'; end if;
    guard := $guard$  -- Vendor delegated cancellation (202610250003)
  if not v_is_admin then
    if not public.ps_vendor_has_permission(v_order.shop_id, 'fulfilment') then
      raise exception 'forbidden: active shop membership required';
    end if;
    if p_to='cancelled' and not public.ps_vendor_has_permission(v_order.shop_id, 'cancellation') then
      raise exception 'forbidden: cancellation permission required';
    end if;
  end if;

$guard$;
    execute replace(definition,'  if not v_is_admin then',guard || '  if not v_is_admin then');
  end if;
  definition := pg_get_functiondef('public.ps_verify_payment(uuid,text,text)'::regprocedure);
  if position('-- Vendor delegated cashier (202610250003)' in definition)=0 then
    if position('  if v_is_admin then' in definition)=0 then raise exception 'Unexpected payment authorization guard'; end if;
    guard := $guard$  -- Vendor delegated cashier (202610250003)
  if not v_is_admin and not public.ps_vendor_has_permission(v_order.shop_id, 'cashier') then
    raise exception 'forbidden: cashier permission required';
  end if;

$guard$;
    execute replace(definition,'  if v_is_admin then',guard || '  if v_is_admin then');
  end if;
end $$;

-- Product grants never expand cross-shop visibility or existing policies.
do $$
declare t text; op text; condition text;
begin
  foreach t in array array['products','product_variants','product_media','shop_product_categories','categories','coupons','shops'] loop
    foreach op in array array['insert','update','delete'] loop
      if t='products' then
        condition := 'ps_is_admin() or ps_vendor_has_permission(shop_id,''catalog'')';
        if op='update' then condition := condition || ' or ps_vendor_has_permission(shop_id,''inventory'')'; end if;
      elsif t in ('product_variants','product_media') then
        condition := 'ps_is_admin() or exists(select 1 from public.products p where p.id=product_id and (ps_vendor_has_permission(p.shop_id,''catalog'')';
        if t='product_variants' and op='update' then condition := condition || ' or ps_vendor_has_permission(p.shop_id,''inventory'')'; end if;
        condition := condition || '))';
      elsif t='shop_product_categories' then condition := 'ps_is_admin() or ps_vendor_has_permission(shop_id,''catalog'')';
      elsif t='categories' then condition := 'ps_is_admin() or ps_vendor_has_permission(ps_vendor_shop(),''catalog'')';
      elsif t='shops' then condition := 'ps_is_admin() or ps_vendor_owns_shop(id)';
      else condition := 'ps_is_admin() or ps_vendor_owns_shop(shop_id)'; end if;
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists vendor_%s_boundary on public.%I',op,t);
      if op='insert' then
        execute format('create policy vendor_%s_boundary on public.%I as restrictive for insert to authenticated with check (%s)',op,t,condition);
      elsif op='update' then
        execute format('create policy vendor_%s_boundary on public.%I as restrictive for update to authenticated using (%s) with check (%s)',op,t,condition,condition);
      else execute format('create policy vendor_%s_boundary on public.%I as restrictive for delete to authenticated using (%s)',op,t,condition);
      end if;
    end loop;
  end loop;
end $$;

-- Field-level protection when inventory and catalog share an UPDATE policy.
-- Trusted definer reservation/accounting routines must still move reserved stock.
create or replace function public.ps_guard_vendor_product_fields()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_shop uuid;
begin
  if current_user <> 'authenticated' or (select ps_is_admin()) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    if tg_table_name='products' then raise exception 'forbidden: archive products instead'; end if;
    if old.reserved>0 then raise exception 'forbidden: reserved variant cannot be deleted'; end if;
    return old;
  end if;
  if tg_table_name='products' then
    if tg_op='INSERT' then
      if coalesce(new.featured,false) or coalesce(new.is_new,false) then raise exception 'forbidden: platform curation'; end if;
    else
      if new.shop_id is distinct from old.shop_id or new.featured is distinct from old.featured or new.is_new is distinct from old.is_new then
        raise exception 'forbidden: product ownership and curation';
      end if;
      if not ps_vendor_has_permission(old.shop_id,'catalog') and
        (to_jsonb(new)-array['in_stock','low_stock','updated_at']) is distinct from (to_jsonb(old)-array['in_stock','low_stock','updated_at']) then
        raise exception 'forbidden: catalog permission required';
      end if;
    end if;
  else
    if new.stock<new.reserved then raise exception 'forbidden: stock cannot be below reservations'; end if;
    if tg_op='INSERT' then
      if coalesce(new.reserved,0)<>0 then raise exception 'forbidden: reservation workflow required'; end if;
    else
      if new.product_id is distinct from old.product_id or new.reserved is distinct from old.reserved then
        raise exception 'forbidden: reservation and product ownership';
      end if;
      select shop_id into v_shop from public.products where id=old.product_id;
      if not ps_vendor_has_permission(v_shop,'catalog') and
        (to_jsonb(new)-array['stock','available','updated_at']) is distinct from (to_jsonb(old)-array['stock','available','updated_at']) then
        raise exception 'forbidden: catalog permission required';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_vendor_product_fields() from public, anon, authenticated;
drop trigger if exists trg_vendor_product_fields on public.products;
create trigger trg_vendor_product_fields before insert or update or delete on public.products for each row execute function public.ps_guard_vendor_product_fields();
drop trigger if exists trg_vendor_variant_fields on public.product_variants;
create trigger trg_vendor_variant_fields before insert or update or delete on public.product_variants for each row execute function public.ps_guard_vendor_product_fields();

-- Cashier is not finance/report/team access. INVOKER balance aggregates inherit RLS.
do $$
declare t text;
begin
  foreach t in array array['shop_ledger','shop_payouts'] loop
    execute format('drop policy if exists vendor_finance_read_boundary on public.%I',t);
    execute format('create policy vendor_finance_read_boundary on public.%I as restrictive for select to authenticated using (ps_is_admin() or ps_vendor_owns_shop(shop_id))',t);
  end loop;
end $$;

-- Atomic stock-only action: preserve reservations and every price/grid field.
create or replace function public.ps_vendor_set_available_stock(p_product_id uuid,p_variant_id uuid,p_available int)
returns public.product_variants language plpgsql security definer set search_path=public as $$
declare v public.product_variants%rowtype; v_shop uuid;
begin
  select shop_id into v_shop from public.products where id=p_product_id for update;
  if not ps_vendor_has_permission(v_shop,'inventory') and not ps_vendor_has_permission(v_shop,'catalog') then
    raise exception 'forbidden: inventory permission required';
  end if;
  if p_available is null or p_available<0 or p_available>100000 then raise exception 'invalid available stock'; end if;
  select * into v from public.product_variants where id=p_variant_id and product_id=p_product_id for update;
  if not found or not v.active then raise exception 'active variant not found'; end if;
  update public.product_variants set stock=reserved+p_available where id=v.id returning * into v;
  update public.products set in_stock=exists(
    select 1 from public.product_variants where product_id=p_product_id and active and stock>reserved
  ) where id=p_product_id;
  return v;
end $$;
revoke all on function public.ps_vendor_set_available_stock(uuid,uuid,int) from public, anon;
grant execute on function public.ps_vendor_set_available_stock(uuid,uuid,int) to authenticated, service_role;
notify pgrst,'reload schema';
commit;

-- ===== MIRROR: supabase/migrations/202610250004_finance_reporting_access.sql =====
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

-- ===== MIRROR: supabase/migrations/202610250005_rider_wallet_column_privacy.sql =====
-- Separate direct operational column access from private wallet reads.
-- Existing accounting/storage, row policies and service clients are unchanged.
begin;

create or replace function public.ps_read_riders()
returns setof public.riders
language sql stable security definer set search_path = public as $$
  select (jsonb_populate_record(null::public.riders,
    to_jsonb(r) || jsonb_build_object('earnings_balance',
      case when public.ps_can_manage_finance() or r.user_id=auth.uid()
        then r.earnings_balance else null end)
  )).*
  from public.riders r
  where auth.uid() is not null
    and (public.ps_is_admin() or r.user_id=auth.uid());
$$;
revoke all on function public.ps_read_riders() from public, anon;
grant execute on function public.ps_read_riders() to authenticated, service_role;

-- A table SELECT grant overrides individual column restrictions. Remove it,
-- including any explicit private-column grant, before granting operational
-- columns. Future columns are NOT automatically made readable.
revoke select on public.riders from public, anon, authenticated;
revoke select (earnings_balance) on public.riders from public, anon, authenticated;
do $$
declare columns_sql text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into columns_sql
  from pg_attribute where attrelid='public.riders'::regclass
    and attnum>0 and not attisdropped and attname<>'earnings_balance';
  if columns_sql is null then raise exception 'Rider operational columns missing'; end if;
  execute format('grant select (%s) on public.riders to authenticated',columns_sql);
end $$;

-- SELECT * / RETURNING * against the base table is intentionally denied to
-- authenticated callers, including Admin. Read through ps_read_riders instead.
-- Explicit operational projections still obey existing RLS. Own-Rider and
-- Admin wallets remain readable only through the guarded projection/RPCs.
notify pgrst,'reload schema';
commit;

-- ===== MIRROR: supabase/migrations/202610250006_rider_controls_and_ledger_retention.sql =====
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

-- ===== MIRROR: supabase/migrations/202610250007_atomic_staff_roles.sql =====
-- Auth administration remains server-only. Re-check the actor's CURRENT
-- database role under a shared transaction lock, not a cached client rank.
begin;
create table if not exists public.staff_role_audit (
 id uuid primary key default gen_random_uuid(), at timestamptz not null default now(),
 actor_id uuid not null, target_id uuid not null, before_role text, after_role text
);
alter table public.staff_role_audit enable row level security;
revoke all on public.staff_role_audit from public,anon,authenticated;
grant select on public.staff_role_audit to authenticated;
drop policy if exists staff_role_audit_read on public.staff_role_audit;
create policy staff_role_audit_read on public.staff_role_audit for select to authenticated
using(public.ps_can_manage_finance());
drop trigger if exists trg_staff_role_audit_immutable on public.staff_role_audit;
create trigger trg_staff_role_audit_immutable before update or delete on public.staff_role_audit
for each row execute function public.ps_financial_history_no_delete();
drop trigger if exists trg_staff_role_audit_no_truncate on public.staff_role_audit;
create trigger trg_staff_role_audit_no_truncate before truncate on public.staff_role_audit
for each statement execute function public.ps_financial_history_no_delete();

create or replace function public.ps_change_staff_role(p_actor_id uuid,p_target_id uuid,p_role text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; prior_role text; result public.admin_users%rowtype; next_role public.admin_users.role%type;
begin
 perform pg_advisory_xact_lock(78203,1);
 select role into actor_role from public.admin_users where id=p_actor_id;
 if actor_role is null or actor_role not in ('admin','super_admin') then raise exception 'forbidden: current Admin access required'; end if;
 if p_actor_id=p_target_id then raise exception 'forbidden: cannot change your own access'; end if;
 if p_role is not null and p_role not in ('manager','admin','super_admin') then raise exception 'invalid staff role'; end if;
 select role into prior_role from public.admin_users where id=p_target_id;
 if actor_role<>'super_admin' and (prior_role='super_admin' or p_role='super_admin') then
   raise exception 'forbidden: only Super Admin may change Super Admin access';
 end if;
 if prior_role='super_admin' and p_role is distinct from 'super_admin'
   and (select count(*) from public.admin_users where role='super_admin')<=1 then
   raise exception 'forbidden: last Super Admin must be retained';
 end if;
 if p_role is null then
   if prior_role is null then raise exception 'not staff'; end if;
   delete from public.admin_users where id=p_target_id returning * into result;
 else
   next_role:=p_role;
   insert into public.admin_users(id,role) values(p_target_id,next_role)
   on conflict(id) do update set role=excluded.role returning * into result;
 end if;
 if prior_role is distinct from p_role then
   insert into public.staff_role_audit(actor_id,target_id,before_role,after_role)
   values(p_actor_id,p_target_id,prior_role,p_role);
 end if;
 return to_jsonb(result);
end $$;
-- Never let an authenticated user spoof p_actor_id. Only the already-gated
-- server service client may invoke this narrow administration workflow.
revoke all on function public.ps_change_staff_role(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ps_change_staff_role(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;

-- ==== Feature: operational PIN privacy and verified Traffic Point pickup (202610260001) ====
-- Operational actors verify a customer PIN; they never read it.
-- Requires permission migrations 001-007 and the installed order machine.
begin;

-- A column revoke cannot override an existing table-wide SELECT grant.
revoke select on public.orders from public, anon, authenticated;
revoke select (delivery_code) on public.orders from public, anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
  from pg_attribute where attrelid='public.orders'::regclass
    and attnum>0 and not attisdropped and attname <> 'delivery_code';
  execute format('grant select (%s) on public.orders to authenticated', cols);
  -- Invoker view retains every existing base-table RLS policy. NULL preserves
  -- the row shape without requiring permission to read the secret column.
  execute format('create or replace view public.order_operations with (security_invoker=true) as select %s, null::text as delivery_code from public.orders', cols);
end $$;
revoke all on public.order_operations from public, anon;
grant select on public.order_operations to authenticated, service_role;

-- Protect the stored secret and lockout against direct REST writes as well.
create or replace function public.ps_guard_order_pin()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_user='authenticated' then
    raise exception 'forbidden: use the PIN verification workflow';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_order_pin() from public,anon,authenticated;
drop trigger if exists trg_order_pin on public.orders;
create trigger trg_order_pin before insert or update of delivery_code,delivery_code_attempts,delivery_code_locked_until on public.orders
for each row execute function public.ps_guard_order_pin();

-- Keep the exact installed state/payment/stock/accounting machine privately.
-- Neither authenticated nor the service API can call this implementation.
do $$
begin
  if to_regprocedure('public.ps_advance_order_internal(uuid,ps_order_status,text)') is null then
    alter function public.ps_advance_order(uuid,ps_order_status,text) rename to ps_advance_order_internal;
  end if;
end $$;
revoke all on function public.ps_advance_order_internal(uuid,ps_order_status,text) from public,anon,authenticated,service_role;

create or replace function public.ps_advance_order(p_order_id uuid,p_to ps_order_status,p_note text default null)
returns orders language plpgsql security definer set search_path=public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id=p_order_id for update;
  if coalesce(v_order.is_pickup,false) and p_to in ('courier-assigned','out-for-delivery','delivered') then
    raise exception 'pickup PIN verification required';
  end if;
  v_order := public.ps_advance_order_internal(p_order_id,p_to,p_note);
  v_order.delivery_code := null;
  return v_order;
end $$;
revoke all on function public.ps_advance_order(uuid,ps_order_status,text) from public,anon;
grant execute on function public.ps_advance_order(uuid,ps_order_status,text) to authenticated,service_role;

create or replace function public.ps_collect_pickup_order(p_order_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order orders%rowtype; v_assignment record;
begin
  if auth.uid() is null or not public.ps_is_admin() then raise exception 'forbidden'; end if;
  select * into v_order from orders where id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not coalesce(v_order.is_pickup,false) or coalesce(v_order.is_return,false) then
    raise exception 'not a counter pickup';
  end if;
  -- Serialize retries: no duplicate delivery, history or ledger accounting.
  if v_order.status='delivered' then return jsonb_build_object('ok',true); end if;
  if v_order.status not in ('ready-for-pickup','courier-assigned','out-for-delivery') then
    raise exception 'pickup not ready';
  end if;
  if v_order.payment in ('bkash','nagad') and v_order.payment_status is distinct from 'verified' then
    raise exception 'payment not verified';
  end if;
  if exists(select 1 from delivery_assignments where order_id=p_order_id and state in ('accepted','picked_up')) then
    raise exception 'rider delivery in progress';
  end if;
  if v_order.delivery_code_locked_until > now() then
    return jsonb_build_object('ok',false,'error','locked');
  end if;
  -- Return, do NOT raise: a raised error would roll back the failure counter.
  if coalesce(p_code,'') !~ '^[0-9]{4}$' or p_code is distinct from v_order.delivery_code then
    update orders set delivery_code_attempts=case when delivery_code_locked_until <= now() then 1 else delivery_code_attempts+1 end,
      delivery_code_locked_until=case when delivery_code_locked_until <= now() then null else delivery_code_locked_until end
      where id=p_order_id returning * into v_order;
    if v_order.delivery_code_attempts>=5 then
      update orders set delivery_code_locked_until=now()+interval '15 minutes' where id=p_order_id;
    end if;
    return jsonb_build_object('ok',false,'error','code_mismatch');
  end if;
  -- Withdraw only pending invitations. Never release a rider's physical custody.
  for v_assignment in select id from delivery_assignments where order_id=p_order_id and state='offered' loop
    perform public.ps_cancel_assignment(v_assignment.id);
  end loop;
  -- All existing machine steps now share ONE transaction and order lock.
  if v_order.status='ready-for-pickup' then
    perform public.ps_advance_order_internal(p_order_id,'courier-assigned',null);
  end if;
  if v_order.status in ('ready-for-pickup','courier-assigned') then
    perform public.ps_advance_order_internal(p_order_id,'out-for-delivery',null);
  end if;
  perform public.ps_advance_order_internal(p_order_id,'delivered','Customer PIN verified at Traffic Point');
  update orders set delivery_code_attempts=0,delivery_code_locked_until=null where id=p_order_id;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ps_collect_pickup_order(uuid,text) from public,anon;
grant execute on function public.ps_collect_pickup_order(uuid,text) to authenticated,service_role;

-- Mutation RPCs must not bypass the read-column boundary with composite rows.
-- Fail closed on an unexpected installed body, rather than silently missing it.
do $$
declare f record; definition text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prorettype='public.orders'::regtype loop
    definition := pg_get_functiondef(f.oid);
    if position('-- PIN response projection 202610260001' in definition)=0 then
      if position('return v_order;' in definition)=0 then
        raise exception 'Unexpected order-returning RPC: %',f.oid::regprocedure;
      end if;
      execute replace(definition,'return v_order;',E'-- PIN response projection 202610260001\n  v_order.delivery_code := null;\n  return v_order;');
    end if;
  end loop;
end $$;

-- Existing staff-readable drafts must not retain old customer capabilities.
create or replace function public.ps_strip_outbox_capability()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  new.message := regexp_replace(new.message,'&t=[0-9a-fA-F]{24}','','g');
  return new;
end $$;
revoke all on function public.ps_strip_outbox_capability() from public,anon,authenticated;
do $$
begin
  if to_regclass('public.wa_outbox') is not null then
    update public.wa_outbox set message=regexp_replace(message,'&t=[0-9a-fA-F]{24}','','g')
      where message ~ '&t=[0-9a-fA-F]{24}';
    drop trigger if exists trg_outbox_capability on public.wa_outbox;
    create trigger trg_outbox_capability before insert or update of message on public.wa_outbox
      for each row execute function public.ps_strip_outbox_capability();
  end if;
end $$;

notify pgrst,'reload schema';
commit;
