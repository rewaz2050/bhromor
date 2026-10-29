-- Shop-first normal fulfilment; platform staff are not routine shop operators.
-- Keep return decisions, dispatch, cancellation and Traffic Point handover intact.
begin;

do $$
declare
  definition text;
  marker text := '-- Shop-first fulfilment boundary (202610250002)';
  anchor text := '  if not v_is_admin then';
  guard text := $guard$  -- Shop-first fulfilment boundary (202610250002)
  if v_is_admin and v_order.shop_id is not null
     and not coalesce(v_order.is_return, false)
     and p_to in ('confirmed', 'preparing', 'ready-for-pickup') then
    if not public.ps_can_manage_finance() then
      raise exception 'forbidden: shop fulfilment belongs to the shop';
    end if;
    if char_length(btrim(coalesce(p_note, ''))) < 10
       or char_length(btrim(coalesce(p_note, ''))) > 300 then
      raise exception 'shop fulfilment override reason required (10-300 characters)';
    end if;
    p_note := '[Shop fulfilment override] ' || btrim(p_note);
  end if;

$guard$;
begin
  if to_regprocedure('public.ps_can_manage_finance()') is null then
    raise exception 'Install finance permission boundary before shop-first fulfilment';
  end if;
  definition := pg_get_functiondef('public.ps_advance_order(uuid,ps_order_status,text)'::regprocedure);
  -- Repeat safety: 202610260001/002 later move this guard into the internal and
  -- scoped machine, and ps_advance_order becomes a thin wrapper that no longer
  -- carries the marker. Re-running this file then must be a no-op — not an
  -- "unexpected guard" exception that would make the documented order-dependent
  -- replay fail after the whole batch has been applied once.
  if position(marker in definition) = 0
     and not exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('ps_advance_order_internal', 'ps_advance_order_scoped')
         and position(marker in p.prosrc) > 0
     ) then
    if position(anchor in definition) = 0 then
      raise exception 'Unexpected ps_advance_order authorization guard';
    end if;
    -- Preserve the installed state/payment/rider/stock/accounting machine.
    execute replace(definition, anchor, guard || anchor);
  end if;
end $$;
revoke all on function public.ps_advance_order(uuid,ps_order_status,text) from public, anon;
grant execute on function public.ps_advance_order(uuid,ps_order_status,text) to authenticated, service_role;

-- A direct REST table UPDATE must not bypass actor checks, payment gating,
-- rider PIN/COD custody, or the reason-required override. INVOKER is vital:
-- trusted definer workflow functions retain their own authorization checks.
create or replace function public.ps_guard_direct_order_workflow()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.status is distinct from old.status
       or new.shop_id is distinct from old.shop_id
       or new.is_return is distinct from old.is_return
       or new.is_pickup is distinct from old.is_pickup
     ) then
    raise exception 'forbidden: order status and routing changes must use the workflow';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_order_workflow() from public, anon, authenticated;
drop trigger if exists trg_direct_order_workflow on public.orders;
create trigger trg_direct_order_workflow before update on public.orders
for each row execute function public.ps_guard_direct_order_workflow();

notify pgrst, 'reload schema';
commit;
