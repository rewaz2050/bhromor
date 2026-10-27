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
