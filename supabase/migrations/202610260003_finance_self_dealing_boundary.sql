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
