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
