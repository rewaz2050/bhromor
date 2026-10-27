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
