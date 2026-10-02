-- PART 19/19 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: dispatch rules as settings (202610020003) ====
-- ============================================================================
-- J (2026-10-02) — DISPATCH RULES AS SETTINGS: cash cap, offer window, attempts.
--
-- Three numbers that shape every delivery were hardcoded in SQL and TS:
--   • the cash a rider may hold before dispatch stops (৳5,000 = 500000 paisa)
--   • how long an offer stays open (90 seconds)
--   • how many delivery attempts before a job is closed (already a setting,
--     delivery_max_attempts — this file only gives it an editor and an audit)
-- They now live in site_settings (keys rider_cash_cap_paisa, offer_ttl_seconds,
-- delivery_max_attempts), read through two helpers with a clamp, so a typo can
-- neither lock every rider out (cap) nor make offers unusable (window):
--   ps_rider_cash_cap()      default 500000, clamp 50000 .. 5000000
--   ps_offer_ttl_seconds()   default 90,     clamp 30 .. 600
-- With no row the behaviour is EXACTLY what it was. The dispatch functions
-- below are the latest definitions (202609250003 / 202609140014) with only the
-- two literals swapped for the helpers; nothing else changed. The money audit
-- trigger also logs changes of these keys as `rate_change`.
-- Safe to re-run. Run after 202610010006 (audit trigger) and the dispatch files.
-- ============================================================================
begin;

create or replace function ps_rider_cash_cap()
returns bigint language sql stable security definer set search_path = public as $$
  select least(greatest(ps_setting_int('rider_cash_cap_paisa', 500000), 50000), 5000000)
$$;

create or replace function ps_offer_ttl_seconds()
returns integer language sql stable security definer set search_path = public as $$
  select least(greatest(ps_setting_int('offer_ttl_seconds', 90), 30), 600)::integer
$$;

grant execute on function ps_rider_cash_cap() to authenticated, service_role;
grant execute on function ps_offer_ttl_seconds() to authenticated, service_role;

create or replace function ps_broadcast_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready-for-pickup'
     or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    return null;
  end if;
  if exists (select 1 from delivery_assignments where order_id = p_order_id
    and (state in ('accepted','picked_up') or (state = 'offered' and not is_broadcast))) then
    return null; -- a manual offer is exclusive until it expires/is declined
  end if;

  insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at, is_broadcast)
  select p_order_id, r.id, 'offered', now(), now() + make_interval(secs => ps_offer_ttl_seconds()), true
  from riders r
  where r.status = 'active' and r.is_online and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_order.zone_id]
    and r.cash_in_hand < ps_rider_cash_cap() and r.current_load < 2
    and not exists (select 1 from delivery_assignments a
      where a.order_id = p_order_id and a.rider_id = r.id
        and (a.state in ('offered','accepted','picked_up')
          -- A rider who declined this order is never auto re-offered it.
          or (a.state = 'cancelled' and a.cancelled_by = 'rider_decline')
          -- Withdrawn/expired invitations cool down for five minutes; rows
          -- superseded by an accept or a manual offer re-qualify at once, so
          -- broadcasting resumes to the area the moment a manual request ends.
          or (a.state in ('cancelled','expired')
            and coalesce(a.cancelled_by, 'withdrawn') <> 'superseded'
            and a.offered_at > now() - interval '5 minutes')))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;

create or replace function ps_rider_accept(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_rider riders%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  -- Different invitation IDs share this one lock: only the first can win.
  select * into v_order from orders where id = v_assignment.order_id for update;
  select * into v_rider from riders where id = v_assignment.rider_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' or v_assignment.expires_at <= now()
     or v_order.status <> 'ready-for-pickup' or v_order.rider_id is not null then
    raise exception 'offer no longer available';
  end if;
  if v_rider.status <> 'active' or not v_rider.is_online
     or v_rider.cash_in_hand >= ps_rider_cash_cap() or v_rider.current_load >= 2
     or (v_assignment.is_broadcast and (
       not ps_rider_on_shift(v_rider) or not (v_rider.zone_ids @> array[v_order.zone_id]))) then
    raise exception 'rider not available';
  end if;
  if coalesce(v_order.is_pickup, false)
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    raise exception 'order not ready for dispatch';
  end if;
  update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
    where order_id = v_order.id and id <> p_assignment_id and state = 'offered';
  update delivery_assignments set state = 'accepted' where id = p_assignment_id
    returning * into v_assignment;
  update orders set status = 'courier-assigned', rider_id = v_rider.id, updated_at = now()
    where id = v_order.id;
  insert into order_status_history(order_id, status, note, changed_by)
    values(v_order.id, 'courier-assigned', 'First rider accepted the delivery request', auth.uid());
  return v_assignment;
end $$;

create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_oid uuid; v_count int := 0; v_order orders%rowtype;
begin
  for v_oid in select distinct unnest(coalesce(p_order_ids, '{}'::uuid[])) order by 1 loop
    select * into v_order from orders where id = v_oid for update;
    if not found or v_order.status <> 'ready-for-pickup'
       or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null then continue; end if;
    if v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified' then continue; end if;
    if not exists(select 1 from riders where id = p_rider_id and status = 'active' and is_online
      and cash_in_hand < ps_rider_cash_cap() and current_load < 2) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + make_interval(secs => ps_offer_ttl_seconds()));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_order_lat double precision;
  v_order_lng double precision;
  v_zone_id text;
  v_rider_id uuid;
begin
  select lat, lng, zone_id into v_order_lat, v_order_lng, v_zone_id from orders where id = p_order_id;

  -- Try nearest by geo if order has pin
  if v_order_lat is not null and v_order_lng is not null then
    select r.id into v_rider_id
    from riders r
    where r.status = 'active'
      and r.is_online
      and ps_rider_on_shift(r)
      and r.zone_ids @> array[v_zone_id]
      and r.cash_in_hand < ps_rider_cash_cap()
      and r.current_load < 2 -- max 2 concurrent
      and not exists (
        select 1 from delivery_assignments a
        where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
      )
      and not exists (
        select 1 from delivery_assignments seen
        where seen.order_id = p_order_id and seen.rider_id = r.id
      )
    order by
      -- distance first (if rider has location)
      case when r.lat is not null and r.lng is not null
        then ps_haversine_km(v_order_lat, v_order_lng, r.lat, r.lng)
        else 9999 end asc,
      -- then rating high to low
      r.rating_avg desc,
      -- then least load
      r.current_load asc,
      -- then longest idle
      r.created_at asc
    limit 1;
    if v_rider_id is not null then
      return v_rider_id;
    end if;
  end if;

  -- Fallback: original logic without geo
  select r.id into v_rider_id
  from riders r
  where r.status = 'active'
    and r.is_online
    and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_zone_id]
    and r.cash_in_hand < ps_rider_cash_cap()
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
    )
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.rating_avg desc, r.current_load asc, r.created_at asc
  limit 1;

  return v_rider_id;
end $$;

-- Audit trigger: also log the dispatch-rule keys.
create or replace function ps_money_audit_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_table_name = 'shop_payouts' then
    perform ps_money_audit_write('shop_payout', 'shop', new.shop_id::text, new.amount,
      jsonb_build_object('payoutId', new.id, 'method', new.method, 'reference', new.reference),
      new.paid_by);

  elsif tg_table_name = 'rider_payout_requests' then
    if old.status = 'pending' and new.status in ('paid', 'rejected') then
      perform ps_money_audit_write('rider_payout_' || new.status, 'rider', new.rider_id::text, new.amount,
        jsonb_build_object('payoutId', new.id, 'method', new.method,
                           'reference', new.reference, 'note', new.note),
        new.decided_by);
    end if;

  elsif tg_table_name = 'rider_settlements' then
    perform ps_money_audit_write('rider_settle', 'rider', new.rider_id::text, new.amount,
      jsonb_build_object('settlementId', new.id, 'method', new.method, 'reference', new.reference,
                         'netted', coalesce(to_jsonb(new) ->> 'netted_amount', '0')::bigint),
      new.settled_by);

  elsif tg_table_name = 'rider_settle_claims' then
    if old.status = 'pending' and new.status = 'rejected' then
      perform ps_money_audit_write('settle_claim_rejected', 'rider', new.rider_id::text, new.amount,
        jsonb_build_object('claimId', new.id, 'note', to_jsonb(new) ->> 'note'),
        nullif(to_jsonb(new) ->> 'decided_by', '')::uuid);
    end if;

  elsif tg_table_name = 'orders' then
    if old.payment_status = 'pending_verification' and new.payment_status in ('verified', 'rejected') then
      perform ps_money_audit_write('payment_' || new.payment_status, 'order', new.id::text, new.total,
        jsonb_build_object('payment', new.payment, 'shopId', new.shop_id));
    end if;

  elsif tg_table_name = 'rider_earnings' then
    if new.kind in ('adjustment', 'incentive') then
      perform ps_money_audit_write('rider_adjustment', 'rider', new.rider_id::text, new.amount,
        jsonb_build_object('kind', new.kind, 'note', new.note, 'orderId', new.order_id));
    end if;

  elsif tg_table_name = 'site_settings' then
    if new.key in ('rider_base_fee_paisa', 'rider_cod_handling_fee_paisa', 'rider_min_payout_paisa',
                   'rider_cash_cap_paisa', 'offer_ttl_seconds', 'delivery_max_attempts') then
      v_old := case when tg_op = 'UPDATE' then old.value end;  -- OLD does not exist on INSERT
      if v_old is distinct from new.value then
        perform ps_money_audit_write('rate_change', 'setting', new.key, null,
          jsonb_build_object('from', v_old, 'to', new.value));
      end if;
    elsif new.key = 'ops' then
      v_old := case when tg_op = 'UPDATE' then old.value -> 'wallets' end;
      v_new := new.value -> 'wallets';
      if v_new is distinct from v_old then
        -- The numbers customers pay into: log THAT they changed and which
        -- methods, never the numbers themselves.
        perform ps_money_audit_write('wallet_numbers_changed', 'setting', 'ops', null,
          jsonb_build_object('methods', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                                         from jsonb_object_keys(coalesce(v_new, '{}'::jsonb)) k)));
      end if;
    end if;
  end if;
  return null;
end $$;
revoke all on function ps_money_audit_trg() from public, anon, authenticated;

-- The trigger's WHEN clause filters by key as well; recreate it with the new keys.
do $$
begin
  if to_regclass('public.site_settings') is not null then
    drop trigger if exists trg_money_audit on site_settings;
    create trigger trg_money_audit after insert or update on site_settings
      for each row when (new.key in ('rider_base_fee_paisa', 'rider_cod_handling_fee_paisa',
                                     'rider_min_payout_paisa', 'rider_cash_cap_paisa',
                                     'offer_ttl_seconds', 'delivery_max_attempts', 'ops'))
      execute function ps_money_audit_trg();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: rider web push (202610020004) ====
-- ============================================================================
-- I (2026-10-02) — RIDER WEB PUSH: a new offer buzzes the rider's phone even
-- with the app closed.
--
-- Until now an offer only reached a rider whose app was OPEN (the feed polls
-- every 15 s and `use-offer-alert` vibrates). A rider with the phone in a
-- pocket missed the 90-second window and the order went to someone else.
--
--   rider_push_subscriptions   one row per rider browser/phone. Service-role
--                              only: RLS on, NO policies — /api/rider/push
--                              writes after requireRider(), and the fan-out in
--                              src/lib/rider-push.ts reads. A rider can never
--                              read another rider's endpoint. Deleting a rider
--                              deletes the devices.
--   delivery_assignments.push_notified_at
--                              "this offer has already been pushed". The
--                              sender CLAIMS rows (update … where null) so two
--                              concurrent sweeps never buzz a phone twice.
--
-- Offers are created in SQL (trigger + sweeps), so TypeScript cannot "see"
-- them being born; the sender instead looks for offered, unexpired,
-- not-yet-pushed rows right after anything that can create offers.
-- Safe to re-run. Nothing else changes.
-- ============================================================================
begin;

create table if not exists public.rider_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  rider_id     uuid not null references public.riders(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_rider_push_rider
  on public.rider_push_subscriptions (rider_id);

alter table public.rider_push_subscriptions enable row level security;
revoke all on table public.rider_push_subscriptions from anon, authenticated;
grant all on table public.rider_push_subscriptions to service_role;

alter table public.delivery_assignments
  add column if not exists push_notified_at timestamptz;

-- The sender's lookup: only offers that are still open and not yet pushed.
create index if not exists idx_assignments_unpushed
  on public.delivery_assignments (offered_at)
  where state = 'offered' and push_notified_at is null;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: licence expiry (202610020005) ====
-- Item N — driving-licence expiry.
--
-- A rider on a bike/scooter needs a valid licence. The photo has always been
-- collected (riders.kyc), but nothing tracked WHEN it lapses, so an expired
-- licence was invisible until a police checkpoint. Staff now record the expiry
-- date from the licence photo; the scheduler warns before it lapses and takes
-- the rider offline after, and the database refuses to put a rider with a
-- lapsed licence back online.
--
-- Everything is additive and idempotent. A NULL date means "not recorded" and
-- never blocks anybody (existing riders keep working until staff fill it in).

begin;

alter table riders
  add column if not exists licence_expires_on date;

-- A rider's own direct write may only flip is_online (jsonb whitelist since
-- 202609160003), so this column is staff/service-only without a guard change.

-- "Today" is the Dhaka calendar day. Only motorised riders are subject to it.
create or replace function ps_block_expired_licence_online()
returns trigger language plpgsql as $$
begin
  if new.is_online
     and not coalesce(old.is_online, false)
     and new.vehicle in ('bike', 'scooter')
     and new.licence_expires_on is not null
     and new.licence_expires_on < (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'licence_expired';
  end if;
  return new;
end $$;

drop trigger if exists trg_riders_block_expired_licence on riders;
create trigger trg_riders_block_expired_licence
  before update of is_online on riders
  for each row execute function ps_block_expired_licence_online();

notify pgrst, 'reload schema';

commit;

-- ==== Feature: rider scorecards (202610020006) ====
-- ============================================================================
-- M (2026-10-02) — RIDER SCORECARDS: every active rider's reliability facts in
-- one read, for a ranked board and for the (opt-in) auto-suspend sweep.
--
--   ps_rider_scorecards_raw(p_days)   SERVICE ROLE ONLY — no admin check, so
--                                     the scheduler (which has no staff JWT)
--                                     can use it. Not callable by anon /
--                                     authenticated.
--   ps_admin_rider_scorecards(p_days) staff-only wrapper for the board.
--
-- Both return a jsonb ARRAY (one object per ACTIVE rider): identity, rating,
-- cash position, the oldest unsettled COD parcel, whether a settle claim is
-- pending, and the p_days-day offer outcomes. The app turns facts into scores
-- (src/lib/rider-quality.ts) so thresholds stay unit-tested, not buried here.
-- Read-only; safe to re-run.
-- ============================================================================
begin;

create or replace function ps_rider_scorecards_raw(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_pending uuid[] := '{}';
  v_out jsonb;
begin
  if to_regclass('public.rider_settle_claims') is not null then
    execute $q$select coalesce(array_agg(distinct rider_id), '{}') from rider_settle_claims where status = 'pending'$q$
      into v_pending;
  end if;

  select coalesce(jsonb_agg(c order by (c->>'name')), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'id', r.id, 'name', r.name, 'vehicle', r.vehicle, 'isOnline', r.is_online,
      'ratingAvg', r.rating_avg, 'ratingCount', r.rating_count,
      'cashInHand', coalesce(r.cash_in_hand, 0), 'currentLoad', coalesce(r.current_load, 0),
      'createdAt', r.created_at,
      'pendingClaim', r.id = any (v_pending),
      'lastSettledAt', (select max(settled_at) from rider_settlements s where s.rider_id = r.id),
      'oldestCodAt', case when coalesce(r.cash_in_hand, 0) > 0 then (
          select min(a.delivered_at)
            from delivery_assignments a
            join orders o on o.id = a.order_id
           where a.rider_id = r.id and a.state = 'delivered'
             and coalesce(o.payment, 'cod') = 'cod'
             and coalesce(o.is_return, false) = false
             and a.delivered_at > coalesce((select max(settled_at) from rider_settlements s where s.rider_id = r.id), '-infinity'::timestamptz)
        ) end,
      'offered', coalesce(p.offered, 0), 'delivered', coalesce(p.delivered, 0),
      'failed', coalesce(p.failed, 0), 'declined', coalesce(p.declined, 0),
      'expired', coalesce(p.expired, 0),
      'avgDeliveryMinutes', r.avg_delivery_minutes
    ) as c
    from riders r
    left join (
      select a.rider_id,
             count(*) as offered,
             count(*) filter (where a.state = 'delivered') as delivered,
             count(*) filter (where a.state = 'failed') as failed,
             count(*) filter (where a.state = 'cancelled' and a.cancelled_by = 'rider_decline') as declined,
             count(*) filter (where a.state = 'expired') as expired
        from delivery_assignments a
       where a.offered_at >= now() - make_interval(days => v_days)
       group by a.rider_id
    ) p on p.rider_id = r.id
    where r.status = 'active'
  ) s;
  return v_out;
end $$;

revoke all on function ps_rider_scorecards_raw(int) from public, anon, authenticated;
grant execute on function ps_rider_scorecards_raw(int) to service_role;

create or replace function ps_admin_rider_scorecards(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  return ps_rider_scorecards_raw(p_days);
end $$;

revoke all on function ps_admin_rider_scorecards(int) from public, anon;
grant execute on function ps_admin_rider_scorecards(int) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: rider disputes + manual wallet adjustments (202610020007) ====
-- ============================================================================
-- W (2026-10-02) — RIDER DISPUTES + MANUAL WALLET ADJUSTMENTS.
--
-- The wallet journal has always had an 'adjustment' kind (and the money audit
-- trail logs it), but NOTHING could create one: when a rider said "I wasn't
-- paid for PS-1042" or "the customer short-paid COD", the only fix was editing
-- the database by hand — no record, no reason, no reply.
--
--   rider_disputes                the rider's complaint (category, message,
--                                 optional claimed amount, the trip it is
--                                 about) and staff's decision.
--   ps_rider_raise_dispute()      rider-only (auth.uid() → riders.id). Needs
--                                 an active account, a trip of THEIR OWN for
--                                 trip-bound categories, at most 5 open.
--   ps_admin_adjust_rider()       staff-only manual credit/debit with a
--                                 mandatory reason. Moves riders.earnings_balance
--                                 and the signed journal together (kind
--                                 'adjustment'; the audit trigger records the
--                                 staff actor). A debit can never push the
--                                 wallet below zero.
--   ps_admin_resolve_dispute()    staff-only: approve (optionally with an
--                                 adjustment, linked to the journal row) or
--                                 reject (reason required).
--
-- Riders read their own disputes through the service client; staff read the
-- table through RLS. Nobody writes it directly. Safe to re-run.
-- ============================================================================
begin;

create table if not exists rider_disputes (
  id                uuid primary key default gen_random_uuid(),
  rider_id          uuid not null references riders (id) on delete cascade,
  assignment_id     uuid references delivery_assignments (id) on delete set null,
  order_id          uuid references orders (id) on delete set null,
  category          text not null
                    check (category in ('missing_fee', 'wrong_cod', 'missing_tip', 'wrongly_failed', 'other')),
  message           text not null check (char_length(message) between 5 and 500),
  claimed_amount    bigint check (claimed_amount is null or claimed_amount >= 0),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  adjustment_amount bigint not null default 0,
  note              text,
  earning_id        uuid references rider_earnings (id) on delete set null,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by        uuid
);

create index if not exists idx_rider_disputes_queue on rider_disputes (status, created_at desc);
create index if not exists idx_rider_disputes_rider on rider_disputes (rider_id, created_at desc);
-- One open complaint per trip: a second tap cannot queue the same grievance twice.
create unique index if not exists rider_disputes_one_open_per_trip
  on rider_disputes (rider_id, assignment_id)
  where status = 'pending' and assignment_id is not null;

alter table rider_disputes enable row level security;
drop policy if exists "disputes admin read" on rider_disputes;
create policy "disputes admin read" on rider_disputes
  for select using (ps_is_admin());
revoke all on table rider_disputes from anon, authenticated;
grant select on table rider_disputes to authenticated;
grant all on table rider_disputes to service_role;

-- ----------------------------------------------------------------------------
-- Rider raises a dispute.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_raise_dispute(
  p_assignment_id uuid,
  p_category text,
  p_message text,
  p_claimed bigint default null
)
returns rider_disputes
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_cat text := lower(coalesce(trim(p_category), ''));
  v_msg text := coalesce(trim(p_message), '');
  v_order uuid;
  v_row rider_disputes%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  if v_rider.status <> 'active' then
    raise exception 'rider not active';
  end if;
  if v_cat not in ('missing_fee', 'wrong_cod', 'missing_tip', 'wrongly_failed', 'other') then
    raise exception 'unknown category';
  end if;
  if char_length(v_msg) < 5 then
    raise exception 'message too short';
  end if;
  if char_length(v_msg) > 500 then
    raise exception 'message too long';
  end if;
  if p_claimed is not null and (p_claimed < 0 or p_claimed > 5000000) then
    raise exception 'invalid amount';
  end if;

  if p_assignment_id is not null then
    select order_id into v_order from delivery_assignments
     where id = p_assignment_id and rider_id = v_rider.id;
    if not found then
      raise exception 'not your trip';
    end if;
  elsif v_cat <> 'other' then
    raise exception 'trip required';
  end if;

  if (select count(*) from rider_disputes where rider_id = v_rider.id and status = 'pending') >= 5 then
    raise exception 'too many open disputes';
  end if;
  if p_assignment_id is not null and exists (
      select 1 from rider_disputes
       where rider_id = v_rider.id and assignment_id = p_assignment_id and status = 'pending') then
    raise exception 'dispute already open';
  end if;

  insert into rider_disputes (rider_id, assignment_id, order_id, category, message, claimed_amount)
  values (v_rider.id, p_assignment_id, v_order, v_cat, v_msg, p_claimed)
  returning * into v_row;
  return v_row;
end $$;

revoke all on function ps_rider_raise_dispute(uuid, text, text, bigint) from public, anon;
grant execute on function ps_rider_raise_dispute(uuid, text, text, bigint) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- The one place the wallet is moved by hand. Internal: callers check staff.
-- ----------------------------------------------------------------------------
create or replace function ps__apply_rider_adjustment(p_rider_id uuid, p_amount bigint, p_note text)
returns rider_earnings
language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
  v_row rider_earnings%rowtype;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'amount must not be zero';
  end if;
  if abs(p_amount) > 5000000 then
    raise exception 'amount too large';
  end if;
  if char_length(coalesce(trim(p_note), '')) < 5 then
    raise exception 'reason required';
  end if;
  select earnings_balance into v_balance from riders where id = p_rider_id for update;
  if not found then
    raise exception 'rider not found';
  end if;
  if v_balance + p_amount < 0 then
    raise exception 'would make wallet negative';
  end if;
  update riders set earnings_balance = earnings_balance + p_amount where id = p_rider_id;
  insert into rider_earnings (rider_id, order_id, kind, amount, note)
  values (p_rider_id, null, 'adjustment', p_amount, left(trim(p_note), 400))
  returning * into v_row;
  return v_row;
end $$;

revoke all on function ps__apply_rider_adjustment(uuid, bigint, text) from public, anon, authenticated;

create or replace function ps_admin_adjust_rider(p_rider_id uuid, p_amount bigint, p_note text)
returns rider_earnings
language plpgsql security definer set search_path = public as $$
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  return ps__apply_rider_adjustment(p_rider_id, p_amount, p_note);
end $$;

revoke all on function ps_admin_adjust_rider(uuid, bigint, text) from public, anon;
grant execute on function ps_admin_adjust_rider(uuid, bigint, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Staff decide a dispute.
-- ----------------------------------------------------------------------------
create or replace function ps_admin_resolve_dispute(
  p_id uuid,
  p_decision text,
  p_amount bigint default 0,
  p_note text default null
)
returns rider_disputes
language plpgsql security definer set search_path = public as $$
declare
  v_row rider_disputes%rowtype;
  v_decision text := lower(coalesce(trim(p_decision), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_amount bigint := coalesce(p_amount, 0);
  v_earn rider_earnings%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_row from rider_disputes where id = p_id for update;
  if not found then
    raise exception 'dispute not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'dispute already %', v_row.status;
  end if;
  if v_decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject';
  end if;

  if v_decision = 'reject' then
    if char_length(coalesce(v_note, '')) < 3 then
      raise exception 'reason required';
    end if;
    v_amount := 0;
  elsif v_amount <> 0 then
    select * into v_earn from ps__apply_rider_adjustment(
      v_row.rider_id, v_amount, 'Dispute: ' || coalesce(v_note, v_row.category));
  end if;

  update rider_disputes
     set status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
         adjustment_amount = v_amount,
         note = v_note,
         earning_id = v_earn.id,
         decided_at = now(),
         decided_by = auth.uid()
   where id = v_row.id
   returning * into v_row;
  return v_row;
end $$;

revoke all on function ps_admin_resolve_dispute(uuid, text, bigint, text) from public, anon;
grant execute on function ps_admin_resolve_dispute(uuid, text, bigint, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: durable rate limit (202610020008) ====
-- ============================================================================
-- P (2026-10-02) — DURABLE RATE LIMIT for the public write routes.
--
-- The in-memory limiter keeps one bucket per serverless instance, so an
-- attacker who is routed across instances (or waits for a cold start) gets
-- many times the intended allowance. This is the shared counter: one row per
-- key, one atomic upsert per hit, so every instance sees the same number.
--
--   rate_limit_hits        RLS on, NO policies → only the service role touches it.
--   ps_rate_limit_hit(...) SERVICE ROLE ONLY. Fixed window, atomic:
--                          returns (allowed, retry_after_sec).
--
-- The app treats this as a SECOND opinion: it never makes a request fail when
-- this file has not been run or the database hiccups (the in-memory limiter
-- still applies), so running it is an upgrade, not a prerequisite.
-- ============================================================================

begin;

create table if not exists rate_limit_hits (
  key      text primary key,
  hits     integer     not null,
  reset_at timestamptz not null
);

alter table rate_limit_hits enable row level security;

create index if not exists idx_rate_limit_hits_reset on rate_limit_hits (reset_at);

create or replace function ps_rate_limit_hit(p_key text, p_limit int, p_window_ms int)
returns table (allowed boolean, retry_after_sec int)
language plpgsql security definer set search_path = public as $$
declare
  v_window interval;
  v_hits   int;
  v_reset  timestamptz;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'bad key';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'bad limit';
  end if;
  if p_window_ms is null or p_window_ms < 1000 or p_window_ms > 86400000 then
    raise exception 'bad window';
  end if;
  v_window := make_interval(secs => p_window_ms / 1000.0);

  -- Housekeeping, ~2% of calls: forget buckets that ended more than an hour ago.
  if random() < 0.02 then
    delete from rate_limit_hits where reset_at < now() - interval '1 hour';
  end if;

  insert into rate_limit_hits as t (key, hits, reset_at)
  values (p_key, 1, now() + v_window)
  on conflict (key) do update
    set hits     = case when t.reset_at <= now() then 1 else t.hits + 1 end,
        reset_at = case when t.reset_at <= now() then now() + v_window else t.reset_at end
  returning t.hits, t.reset_at into v_hits, v_reset;

  allowed := v_hits <= p_limit;
  retry_after_sec := greatest(1, ceil(extract(epoch from (v_reset - now())))::int);
  return next;
end $$;

revoke all on function ps_rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function ps_rate_limit_hit(text, int, int) to service_role;

notify pgrst, 'reload schema';

commit;

