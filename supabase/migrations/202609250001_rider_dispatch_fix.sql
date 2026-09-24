-- ============================================================================
-- 202609250001 — "Rider offer paochhe na": four dispatch fixes.
-- ============================================================================
-- The owner's report: the shop taps "Ready — call rider" and NOTHING reaches
-- the rider's phone. Reproducing the dispatch chain names four separate
-- reasons, and all four are real in a small town with 1–3 riders:
--
--   1. NO PUSH TO RIDERS. `push_subscriptions` (202609210001) is staff-only
--      and `customer_push_subscriptions` (202609240001) is shopper-only. A
--      rider learns about an offer ONLY by polling `/api/rider/jobs`, and
--      `usePoll` (src/lib/use-poll.ts) STOPS while the tab is hidden — a
--      phone in a pocket polls nothing. So the offer is born and dies unseen.
--      → this migration adds `push_subscriptions.rider_id` so a device can
--        belong to a rider; the fan-out lives in src/lib/rider-push.ts.
--
--   2. 90 SECONDS IS NOT AN ANSWER WINDOW, IT IS A COIN FLIP. Every offer
--      is born with `now() + interval '90 seconds'` hardcoded in four
--      functions. A rider on a bike, in a shop, or with the screen off cannot
--      answer in 90 s — and once it lapses, `ps_next_eligible_rider`'s
--      "never re-offer to a rider who already SAW this order" check makes the
--      exclusion PERMANENT, so a one-rider zone can never receive that order
--      again. With a 5-minute window the same rider can actually answer.
--      → the window becomes `ps_setting_int('dispatch_offer_seconds', 300)`,
--        clamped to 60–3600 s. No SQL needed to change it later:
--          insert into site_settings (key, value)
--          values ('dispatch_offer_seconds', '600'::jsonb)
--          on conflict (key) do update set value = excluded.value;
--
--   3. NOBODY COULD SAY WHY. `ps_next_eligible_rider` returns NULL for six
--      different reasons (offline / off-shift / wrong zone / cash cap /
--      already carrying / already saw this order) and every caller throws
--      the same "no eligible rider". That is why the panel felt broken
--      rather than blocked.
--      → `ps_dispatch_diagnosis(p_order_id)` returns the counts per reason
--        and a one-line human answer, so Admin → Deliveries can name the
--        blocker instead of guessing.
--
--   4. AN ORDER READY WHILE EVERY RIDER WAS OFFLINE WAS NEVER RETRIED.
--      `trg_orders_auto_dispatch` fires once, on the transition into
--      ready-for-pickup. Miss it and the order waits on the awaiting board
--      until a human taps Assign — the 15-minute cron only swept EXPIRED
--      offers, it never re-offered an order that had no offer at all.
--      → `ps_redispatch_stranded()` offers every dispatchable order that has
--        no live assignment to the next rider who has not seen it yet, so the
--        rider who came online at 10:05 receives the order that went ready at
--        10:00. Wired into the cron tick as job `redispatch-stranded`.
--
-- Health: `ps_checkout_health()` gains `rider_dispatch_ok` +
-- `rider_push_column` so /api/health and the admin banner can name this file.
--
-- Safe to re-run. Nothing is dropped; `ps_checkout_health` is the
-- 202609170001 body with two keys added (every earlier key preserved).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. A push device may belong to a rider.
-- ----------------------------------------------------------------------------
-- NULL rider_id = a staff device (202609210001 behaviour, unchanged); a set
-- rider_id = that rider's phone. The staff fan-out filters rider_id IS NULL
-- so a rider never receives the owner's order notices.
alter table public.push_subscriptions
  add column if not exists rider_id uuid references public.riders (id) on delete cascade;

create index if not exists idx_push_subscriptions_rider
  on public.push_subscriptions (rider_id)
  where rider_id is not null;

-- ----------------------------------------------------------------------------
-- 2. The offer window is a shop setting, not a hardcoded 90 seconds.
-- ----------------------------------------------------------------------------
create or replace function ps_offer_window()
returns interval
language sql stable security definer set search_path = public as $$
  -- ps_setting_int already falls back to the default when the key is absent.
  -- Clamped so a typo cannot make offers immortal (3600) or unreadable (60).
  select make_interval(
    secs => least(3600, greatest(60, ps_setting_int('dispatch_offer_seconds', 300)))::int
  );
$$;

-- The column default is left as the literal 90 s on purpose: a default that
-- calls a function creates a dependency that makes the function undroppable,
-- and every INSERT in this chain states the window explicitly anyway. The
-- setting is read where the offer is BORN, which is the only place it matters.

-- 2a. Auto-dispatch on the transition into ready-for-pickup.
create or replace function ps_auto_dispatch_ready_order()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rider_id uuid;
begin
  if new.status <> 'ready-for-pickup'
     or old.status = 'ready-for-pickup'
     or exists (
       select 1 from delivery_assignments where order_id = new.id
     ) then
    return new;
  end if;

  v_rider_id := ps_next_eligible_rider(new.id);
  if v_rider_id is not null then
    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (new.id, v_rider_id, 'offered', now(), now() + ps_offer_window());
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_auto_dispatch on orders;
create trigger trg_orders_auto_dispatch
  after update on orders
  for each row execute function ps_auto_dispatch_ready_order();

-- 2b. Staff re-offer (Admin → Deliveries → Assign).
create or replace function ps_offer_order(p_order_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_assignment_id uuid;
  v_rider_id      uuid;
  v_order_status  text;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;

  select status into v_order_status from orders where id = p_order_id;
  if v_order_status is null then
    raise exception 'order not found';
  end if;
  if v_order_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
    raise exception 'order not ready for dispatch';
  end if;
  if exists (
    select 1 from delivery_assignments
    where order_id = p_order_id and state in ('offered', 'accepted', 'picked_up')
  ) then
    raise exception 'assignment already active';
  end if;

  v_rider_id := ps_next_eligible_rider(p_order_id);
  if v_rider_id is null then
    -- Name the blocker instead of a bare "no eligible rider" — the caller
    -- turns `detail` into the sentence the panel shows.
    raise exception 'no eligible rider: %',
      coalesce((select ps_dispatch_diagnosis(p_order_id) ->> 'answer'), 'no rider matched');
  end if;
  insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
  values (p_order_id, v_rider_id, 'offered', now(), now() + ps_offer_window())
  returning id into v_assignment_id;
  return v_assignment_id;
end $$;

-- 2c. Expired offers re-offer to the next rider, with the same window.
create or replace function ps_expire_stale_offers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_row record;
  v_rider_id uuid;
begin
  for v_row in
    select da.id, da.order_id
    from delivery_assignments da
    join orders o on o.id = da.order_id
    where da.state = 'offered' and da.expires_at < now()
    for update of da
  loop
    update delivery_assignments
    set state = 'expired'
    where id = v_row.id;

    if (
      select o.status from orders o where o.id = v_row.order_id
    ) in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery')
       and not exists (
         select 1 from delivery_assignments
         where order_id = v_row.order_id
           and state in ('offered', 'accepted', 'picked_up')
       ) then
      v_rider_id := ps_next_eligible_rider(v_row.order_id);
      if v_rider_id is not null then
        insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
        values (v_row.order_id, v_rider_id, 'offered', now(), now() + ps_offer_window());
      end if;
    end if;
    v_count := coalesce(v_count, 0) + 1;
  end loop;
  return coalesce(v_count, 0);
end $$;

-- ----------------------------------------------------------------------------
-- 3. Diagnosis — why this order has no rider.
-- ----------------------------------------------------------------------------
-- Counts the riders in each bucket so the panel can print the actual
-- blocker. `answer` is the one line a human should read; `reason` is a stable
-- machine key for tests and for the UI's ordering.
create or replace function ps_dispatch_diagnosis(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_zone_id  text;
  v_status   text;
  v_order    orders%rowtype;
  v_active   int;
  v_online   int;
  v_on_shift int;
  v_zone_ok  int;
  v_cash_ok  int;
  v_free     int;
  v_unseen   int;
  v_live     int;
  v_answer   text;
  v_reason   text;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;
  v_zone_id := v_order.zone_id;
  v_status  := v_order.status;

  select count(*) into v_live from delivery_assignments
  where order_id = p_order_id and state in ('offered', 'accepted', 'picked_up');

  if v_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
    return jsonb_build_object(
      'dispatchable', false,
      'reason', 'order-not-ready',
      'answer', format('Order %s ei muhurte dispatchable na (status: %s) — age "Ready — call rider" chapte hobe.', v_order.order_no, v_status),
      'riders_active', 0, 'riders_online', 0, 'riders_on_shift', 0,
      'riders_in_zone', 0, 'riders_under_cash_cap', 0,
      'riders_free', 0, 'riders_not_seen', 0, 'live_offers', v_live
    );
  end if;

  -- Each bucket is cumulative: the next count is taken INSIDE the previous
  -- one, so the first bucket that drops to zero is the blocker.
  select count(*) into v_active from riders where status = 'active';

  select count(*) into v_online from riders
  where status = 'active' and is_online;

  select count(*) into v_on_shift from riders
  where status = 'active' and is_online and ps_rider_on_shift(riders);

  select count(*) into v_zone_ok from riders
  where status = 'active' and is_online and ps_rider_on_shift(riders)
    and zone_ids @> array[v_zone_id];

  select count(*) into v_cash_ok from riders
  where status = 'active' and is_online and ps_rider_on_shift(riders)
    and zone_ids @> array[v_zone_id]
    and cash_in_hand < 500000;

  select count(*) into v_free from riders
  where status = 'active' and is_online and ps_rider_on_shift(riders)
    and zone_ids @> array[v_zone_id]
    and cash_in_hand < 500000
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = riders.id and a.state in ('offered', 'accepted', 'picked_up')
    );

  select count(*) into v_unseen from riders
  where status = 'active' and is_online and ps_rider_on_shift(riders)
    and zone_ids @> array[v_zone_id]
    and cash_in_hand < 500000
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = riders.id and a.state in ('offered', 'accepted', 'picked_up')
    )
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = riders.id
    );

  if v_live > 0 then
    v_reason := 'already-offered';
    v_answer := format('Ei order-e already %s ta live offer ache — rider-er phone-e dekha uchit.', v_live);
  elsif v_active = 0 then
    v_reason := 'no-active-rider';
    v_answer := 'Kono active rider-i nei — Admin → Riders-e apply approve korun.';
  elsif v_online = 0 then
    v_reason := 'no-one-online';
    v_answer := 'Kono rider Online nei — rider /rider-e Online toggle ON na korle offer jay na.';
  elsif v_on_shift = 0 then
    v_reason := 'off-shift';
    v_answer := 'Je rider online ache take ekhon shift-er baire dhora hochhe (availability settings).';
  elsif v_zone_ok = 0 then
    v_reason := 'zone-mismatch';
    v_answer := format('"%s" zone-e kono online rider nei — Admin → Riders-e rider-er zone thik korun.', v_zone_id);
  elsif v_cash_ok = 0 then
    v_reason := 'cash-cap';
    v_answer := 'Zone-er rider-er cash-in-hand ৳5,000 cap-এ pouche geche — Admin → Riders → settle korun.';
  elsif v_free = 0 then
    v_reason := 'all-busy';
    v_answer := 'Zone-er prottek rider-er hate already arekta order ache — settle/pickup sesh hole abar cheshta hobe.';
  elsif v_unseen = 0 then
    v_reason := 'all-have-seen';
    v_answer := 'Ei order ta zone-er sob rider already dekheche (offer lapse/reject koreche) — Admin → Deliveries-e "Force re-offer" diye abar pathan.';
  else
    v_reason := 'eligible';
    v_answer := format('%s jon rider eligible — offer pathano jabe.', v_unseen);
  end if;

  return jsonb_build_object(
    'dispatchable', true,
    'reason', v_reason,
    'answer', v_answer,
    'zone_id', v_zone_id,
    'riders_active', v_active,
    'riders_online', v_online,
    'riders_on_shift', v_on_shift,
    'riders_in_zone', v_zone_ok,
    'riders_under_cash_cap', v_cash_ok,
    'riders_free', v_free,
    'riders_not_seen', v_unseen,
    'live_offers', v_live
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. Stranded orders — ready, dispatchable, no live offer.
-- ----------------------------------------------------------------------------
create or replace function ps_stranded_orders(p_limit int default 20)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select o.order_no,
           o.status,
           o.zone_id,
           o.created_at,
           o.updated_at,
           ps_dispatch_diagnosis(o.id) as diagnosis
    from orders o
    where o.status in ('ready-for-pickup', 'courier-assigned')
      and not exists (
        select 1 from delivery_assignments a
        where a.order_id = o.id and a.state in ('offered', 'accepted', 'picked_up')
      )
    order by o.created_at asc
    limit greatest(1, least(50, coalesce(p_limit, 20)))
  ) t;
$$;

-- Offer every stranded order to the next rider who has not seen it. Runs on
-- the 15-minute clock (src/lib/cron.ts → job `redispatch-stranded`), which is
-- what makes "the rider came online after the order went ready" self-heal.
create or replace function ps_redispatch_stranded()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row      record;
  v_rider_id uuid;
  v_count    int := 0;
begin
  for v_row in
    select o.id
    from orders o
    where o.status in ('ready-for-pickup', 'courier-assigned')
      and not exists (
        select 1 from delivery_assignments a
        where a.order_id = o.id and a.state in ('offered', 'accepted', 'picked_up')
      )
    order by o.created_at asc
    limit 20
    for update of o
  loop
    v_rider_id := ps_next_eligible_rider(v_row.id);
    if v_rider_id is null then
      continue;  -- still nobody: the next tick tries again
    end if;
    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (v_row.id, v_rider_id, 'offered', now(), now() + ps_offer_window());
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Grants — service-role only, like every other dispatch RPC (202609160004).
-- ----------------------------------------------------------------------------
revoke all on function ps_offer_window() from public, anon, authenticated;
grant execute on function ps_offer_window() to service_role;

revoke all on function ps_dispatch_diagnosis(uuid) from public, anon, authenticated;
grant execute on function ps_dispatch_diagnosis(uuid) to service_role;

revoke all on function ps_stranded_orders(int) from public, anon, authenticated;
grant execute on function ps_stranded_orders(int) to service_role;

revoke all on function ps_redispatch_stranded() from public, anon, authenticated;
grant execute on function ps_redispatch_stranded() to service_role;

revoke all on function ps_offer_order(uuid) from public, anon, authenticated;
grant execute on function ps_offer_order(uuid) to service_role;

revoke all on function ps_expire_stale_offers() from public, anon, authenticated;
grant execute on function ps_expire_stale_offers() to service_role;

-- ----------------------------------------------------------------------------
-- 6. Health probe — 202609170001's body plus these two keys.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609250001',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute',
                          'ps_offer_order', 'ps_redispatch_stranded',
                          'ps_dispatch_diagnosis', 'ps_stranded_orders')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true),
    'dispatch_reoffer_ok', (
      not exists (
        select 1 from pg_constraint k
        where k.conrelid = 'public.delivery_assignments'::regclass
          and k.conname = 'delivery_assignments_order_id_key'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_live_offer'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
          and p.prosrc not like '%rider_assignments%'
      )
    ),
    'two_tap_flow_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_advance_order'
        and p.prosrc like '%v_order.status = ''confirmed'' and p_to = ''ready-for-pickup''%'
    ),
    -- 202609250001: the offer window is a setting, and the self-heal job exists.
    'rider_dispatch_ok', (
      exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_offer_window'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_redispatch_stranded'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_auto_dispatch_ready_order'
          and p.prosrc like '%ps_offer_window()%'
          and p.prosrc not like '%interval ''90 seconds''%'
      )
    ),
    -- 202609250001: riders can register a push device.
    'rider_push_column', exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'push_subscriptions'
        and c.column_name = 'rider_id'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- VERIFY — expect 6 × OK.
-- ----------------------------------------------------------------------------
select 'rider push column' as check_,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'push_subscriptions'
           and column_name = 'rider_id')
       then 'OK' else 'MISSING' end as state
union all
select 'offer window is a setting',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_offer_window')
       then 'OK' else 'MISSING' end
union all
select 'auto-dispatch uses the setting (no hardcoded 90s)',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_auto_dispatch_ready_order'
           and p.prosrc like '%ps_offer_window()%'
           and p.prosrc not like '%interval ''90 seconds''%')
       then 'OK' else 'MISSING' end
union all
select 'diagnosis function',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_dispatch_diagnosis')
       then 'OK' else 'MISSING' end
union all
select 'stranded self-heal job',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_redispatch_stranded')
       then 'OK' else 'MISSING' end
union all
select 'anon cannot call the new RPCs',
       case when not exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('ps_dispatch_diagnosis', 'ps_redispatch_stranded',
                             'ps_stranded_orders', 'ps_offer_window')
           and has_function_privilege('anon', p.oid, 'execute'))
       then 'OK' else 'MISSING' end;
