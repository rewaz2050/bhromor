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
