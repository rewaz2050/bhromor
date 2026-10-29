-- Finance approval is NOT ordinary operational staff access.
-- Keep ps_is_admin() unchanged for dispatch/reads. Enforce the narrower
-- boundary in actual RPC bodies and direct table writes, not only Next APIs.
-- Apply after the existing migrations; repeat-safe and transactional.
begin;

create or replace function public.ps_can_manage_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;
revoke all on function public.ps_can_manage_finance() from public, anon;
grant execute on function public.ps_can_manage_finance() to authenticated, service_role;

-- Preserve the installed accounting implementation (including fixes), changing
-- ONLY its explicit entry guard. Fail closed on an unexpected/missing body;
-- do not silently report a partially protected migration as successful.
do $$
declare
  signature text;
  fn regprocedure;
  definition text;
  old_guard text := 'if not (select ps_is_admin()) then';
  new_guard text := 'if not (select public.ps_can_manage_finance()) then';
begin
  foreach signature in array array[
    'public.ps_admin_settle_rider(uuid,text,text,boolean)',
    'public.ps_admin_reject_settle(uuid,text)',
    'public.ps_admin_decide_rider_payout(uuid,text,text,text)',
    'public.ps_admin_adjust_rider(uuid,bigint,text)',
    'public.ps_admin_resolve_dispute(uuid,text,bigint,text)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then
      raise exception 'Finance permission prerequisite missing: %', signature;
    end if;
    definition := pg_get_functiondef(fn);
    if position(old_guard in definition) > 0 then
      definition := replace(definition, old_guard, new_guard);
      execute definition;
    elsif position(new_guard in definition) = 0 then
      raise exception 'Unexpected finance RPC guard: %', signature;
    end if;
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

-- Platform wallet verification is financial authority. The existing shop
-- verifier branch and per-shop receiver policy remain intact.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.ps_verify_payment(uuid,text,text)'::regprocedure);
  if position('v_is_admin := (select ps_is_admin());' in definition) > 0 then
    execute replace(definition, 'v_is_admin := (select ps_is_admin());',
      'v_is_admin := (select public.ps_can_manage_finance());');
  elsif position('v_is_admin := (select public.ps_can_manage_finance());' in definition) = 0 then
    raise exception 'Unexpected payment verifier guard';
  end if;
end $$;

-- Restrictive write policies intersect existing permissive policies; an old
-- "admin all" policy can no longer let managers write these tables directly.
-- Existing SELECT/own-rider/own-shop policies and definer accounting triggers
-- remain unchanged. Tables with no permissive write policy remain RPC-only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'shop_ledger', 'shop_payouts', 'rider_settlements',
    'rider_settle_claims', 'rider_payout_requests', 'rider_earnings', 'rider_disputes'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists finance_insert_boundary on public.%I', table_name);
    execute format('create policy finance_insert_boundary on public.%I as restrictive for insert to authenticated with check (public.ps_can_manage_finance())', table_name);
    execute format('drop policy if exists finance_update_boundary on public.%I', table_name);
    execute format('create policy finance_update_boundary on public.%I as restrictive for update to authenticated using (public.ps_can_manage_finance()) with check (public.ps_can_manage_finance())', table_name);
    execute format('drop policy if exists finance_delete_boundary on public.%I', table_name);
    execute format('create policy finance_delete_boundary on public.%I as restrictive for delete to authenticated using (public.ps_can_manage_finance())', table_name);
  end loop;
end $$;

-- Parent deletion must not cascade-delete financial history for an operator.
-- Existing permissive policies are retained, but manager deletes are narrowed.
do $$
declare table_name text;
begin
  foreach table_name in array array['riders', 'shops', 'orders'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists finance_parent_delete_boundary on public.%I', table_name);
    execute format('create policy finance_parent_delete_boundary on public.%I as restrictive for delete to authenticated using (public.ps_can_manage_finance())', table_name);
  end loop;
end $$;

-- Guard existing balance columns from direct authenticated table updates.
-- INVOKER is essential: genuine SECURITY DEFINER delivery/accounting routines
-- run as their trusted owner, and must still post automatic COD/earnings.
create or replace function public.ps_guard_direct_rider_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.ps_can_manage_finance()
     and ((tg_op = 'INSERT' and (coalesce(new.cash_in_hand, 0) <> 0 or coalesce(new.earnings_balance, 0) <> 0))
       or (tg_op = 'UPDATE' and (new.cash_in_hand is distinct from old.cash_in_hand
         or new.earnings_balance is distinct from old.earnings_balance))) then
    raise exception 'forbidden: finance permission required';
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_rider_finance() from public, anon, authenticated;
drop trigger if exists trg_direct_rider_finance on public.riders;
create trigger trg_direct_rider_finance before insert or update on public.riders
for each row execute function public.ps_guard_direct_rider_finance();

-- Commission/payment routing is platform-owned, not a manager or shop edit.
-- JSON comparison tolerates optional columns on rolling-upgrade databases.
create or replace function public.ps_guard_direct_shop_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
declare field text;
begin
  if current_user = 'authenticated' and not public.ps_can_manage_finance() then
    if tg_op = 'INSERT' then
      raise exception 'forbidden: finance permission required to create shops';
    end if;
    foreach field in array array['commission_pct', 'settlement_model', 'payment_verifier', 'wallet_bkash', 'wallet_nagad'] loop
      if (to_jsonb(new) -> field) is distinct from (to_jsonb(old) -> field) then
        raise exception 'forbidden: finance permission required';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_shop_finance() from public, anon, authenticated;
drop trigger if exists trg_direct_shop_finance on public.shops;
create trigger trg_direct_shop_finance before insert or update on public.shops
for each row execute function public.ps_guard_direct_shop_finance();

-- Protect rider pay/risk settings and the ops wallet destination record.
-- Other settings retain their existing policies. USING + WITH CHECK prevents
-- renaming an ordinary key into a protected key (or a protected key out).
create or replace function public.ps_finance_setting_allowed(p_key text)
returns boolean language sql stable security invoker set search_path = public as $$
  select public.ps_can_manage_finance() or not (
    p_key = 'ops' or p_key like 'rider\_%' escape '\'
    or p_key in ('offer_ttl_seconds', 'delivery_max_attempts')
  );
$$;
revoke all on function public.ps_finance_setting_allowed(text) from public, anon;
grant execute on function public.ps_finance_setting_allowed(text) to authenticated, service_role;
alter table public.site_settings enable row level security;
drop policy if exists finance_settings_insert on public.site_settings;
create policy finance_settings_insert on public.site_settings as restrictive
for insert to authenticated with check (public.ps_finance_setting_allowed(key));
drop policy if exists finance_settings_update on public.site_settings;
create policy finance_settings_update on public.site_settings as restrictive
for update to authenticated using (public.ps_finance_setting_allowed(key)) with check (public.ps_finance_setting_allowed(key));
drop policy if exists finance_settings_delete on public.site_settings;
create policy finance_settings_delete on public.site_settings as restrictive
for delete to authenticated using (public.ps_finance_setting_allowed(key));

-- Direct orders table access must not bypass payment verification or rewrite
-- totals. Existing SECURITY DEFINER placement/cancellation/refund routines
-- retain their actor validation and authoritative accounting behavior.
create or replace function public.ps_guard_direct_order_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
declare field text;
begin
  if current_user = 'authenticated' and not public.ps_can_manage_finance() then
    if tg_op = 'INSERT' then
      raise exception 'forbidden: orders must use the placement workflow';
    end if;
    foreach field in array array['subtotal', 'total', 'delivery_charge', 'discount', 'tip_amount', 'surcharge_total', 'payment', 'payment_status', 'payment_verified_at', 'payment_verified_by'] loop
      if (to_jsonb(new) -> field) is distinct from (to_jsonb(old) -> field) then
        raise exception 'forbidden: finance permission required';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.ps_guard_direct_order_finance() from public, anon, authenticated;
drop trigger if exists trg_direct_order_finance on public.orders;
create trigger trg_direct_order_finance before insert or update on public.orders
for each row execute function public.ps_guard_direct_order_finance();

notify pgrst, 'reload schema';
commit;
