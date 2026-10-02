-- PART 18/22 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: money audit trail (202610010006) ====
-- Money audit trail (2026-10-01, audit item T).
--
-- Every approval that moves or authorises money leaves a permanent, tamper-
-- resistant line: who, when, what, how much. It is written by DATABASE TRIGGERS
-- on the money tables — not by app code — so no route, no SQL-editor shortcut
-- through the app and no future feature can forget to log, and the log is
-- append-only (UPDATE / DELETE are refused by a trigger).
--
-- Events:
--   shop_payout            shop_payouts INSERT
--   rider_payout_paid /    rider_payout_requests pending → paid / rejected
--   rider_payout_rejected
--   rider_settle           rider_settlements INSERT (incl. the netted part)
--   settle_claim_rejected  rider_settle_claims pending → rejected
--   payment_verified /     orders.payment_status pending_verification → verified / rejected
--   payment_rejected
--   rider_adjustment       rider_earnings INSERT of kind adjustment / incentive
--   rate_change            site_settings rider pay-rate keys (old → new)
--   wallet_numbers_changed site_settings 'ops' wallets (the numbers customers pay)
-- actor_id is auth.uid(); NULL means the service role / a database session.
-- Safe to re-run.
begin;

create table if not exists money_audit_log (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  actor_id      uuid,
  actor_email   text,
  event         text not null,
  subject_type  text not null,
  subject_id    text,
  amount        bigint,
  detail        jsonb not null default '{}'::jsonb
);
create index if not exists idx_money_audit_at on money_audit_log (at desc);
create index if not exists idx_money_audit_event on money_audit_log (event, at desc);
create index if not exists idx_money_audit_subject on money_audit_log (subject_type, subject_id);

alter table money_audit_log enable row level security;
drop policy if exists "money audit admin read" on money_audit_log;
create policy "money audit admin read" on money_audit_log
  for select using (ps_is_admin());

-- Append-only, even for the service role.
create or replace function ps_money_audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'money_audit_log is append-only';
end $$;
drop trigger if exists trg_money_audit_immutable on money_audit_log;
create trigger trg_money_audit_immutable
  before update or delete on money_audit_log
  for each row execute function ps_money_audit_immutable();

revoke all on money_audit_log from public, anon, authenticated;
grant select on money_audit_log to authenticated;
grant select, insert on money_audit_log to service_role;

-- One writer for every event.
drop function if exists ps_money_audit_write(text, text, text, bigint, jsonb);
create or replace function ps_money_audit_write(
  p_event text, p_type text, p_subject text, p_amount bigint, p_detail jsonb,
  p_actor uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  -- the JWT user; else the actor the row itself names (paid_by / decided_by /
  -- settled_by) so a service-role write is still attributed to a person.
  v_actor uuid := coalesce(auth.uid(), p_actor);
  v_email text;
begin
  if v_actor is not null then
    begin
      execute 'select email from auth.users where id = $1' into v_email using v_actor;
    exception when others then
      v_email := null;
    end;
  end if;
  insert into money_audit_log (actor_id, actor_email, event, subject_type, subject_id, amount, detail)
  values (v_actor, v_email, p_event, p_type, p_subject, p_amount, coalesce(p_detail, '{}'::jsonb));
end $$;
revoke all on function ps_money_audit_write(text, text, text, bigint, jsonb, uuid) from public, anon, authenticated;

-- The trigger body: dispatches on the table.
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
    if new.key in ('rider_base_fee_paisa', 'rider_cod_handling_fee_paisa', 'rider_min_payout_paisa') then
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

-- Triggers — only on tables that exist on this database (partial migrations).
do $$
begin
  if to_regclass('public.shop_payouts') is not null then
    drop trigger if exists trg_money_audit on shop_payouts;
    create trigger trg_money_audit after insert on shop_payouts
      for each row execute function ps_money_audit_trg();
  end if;
  if to_regclass('public.rider_payout_requests') is not null then
    drop trigger if exists trg_money_audit on rider_payout_requests;
    create trigger trg_money_audit after update on rider_payout_requests
      for each row execute function ps_money_audit_trg();
  end if;
  if to_regclass('public.rider_settlements') is not null then
    drop trigger if exists trg_money_audit on rider_settlements;
    create trigger trg_money_audit after insert on rider_settlements
      for each row execute function ps_money_audit_trg();
  end if;
  if to_regclass('public.rider_settle_claims') is not null then
    drop trigger if exists trg_money_audit on rider_settle_claims;
    create trigger trg_money_audit after update on rider_settle_claims
      for each row execute function ps_money_audit_trg();
  end if;
  if to_regclass('public.orders') is not null then
    drop trigger if exists trg_money_audit on orders;
    create trigger trg_money_audit after update of payment_status on orders
      for each row when (old.payment_status is distinct from new.payment_status)
      execute function ps_money_audit_trg();
  end if;
  if to_regclass('public.rider_earnings') is not null then
    drop trigger if exists trg_money_audit on rider_earnings;
    create trigger trg_money_audit after insert on rider_earnings
      for each row when (new.kind in ('adjustment', 'incentive'))
      execute function ps_money_audit_trg();
  end if;
  if to_regclass('public.site_settings') is not null then
    drop trigger if exists trg_money_audit on site_settings;
    create trigger trg_money_audit after insert or update on site_settings
      for each row when (new.key in ('rider_base_fee_paisa', 'rider_cod_handling_fee_paisa',
                                     'rider_min_payout_paisa', 'ops'))
      execute function ps_money_audit_trg();
  end if;
end $$;

commit;

-- ==== Feature: daily money reconciliation (202610010007) ====
-- ============================================================================
-- U (2026-10-01) — DAILY MONEY RECONCILIATION.
--
-- ps_admin_money_daily(p_day) answers, for one Dhaka calendar day: what moved
-- (orders delivered, COD cash riders collected, what riders handed in, what was
-- paid out to riders and shops), what the position is NOW (cash riders hold,
-- what is owed to riders and shops) and — the point of a reconciliation — a
-- list of CHECKS that must all be clean: a rider wallet that no longer equals
-- its journal, an overpaid shop, a delivered order with no shop ledger line,
-- payouts / claims / failed deliveries that have sat untouched.
--
-- Read-only, staff-only on the caller's own JWT (ps_is_admin()). Optional
-- columns / tables are read defensively so a partly migrated database still
-- answers. Order recognition date = delivery moment, as in ps_admin_money_pnl.
-- ============================================================================
begin;

create or replace function ps_admin_money_daily(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Dhaka')::date);
  v_from timestamptz := (coalesce(p_day, (now() at time zone 'Asia/Dhaka')::date))::timestamp at time zone 'Asia/Dhaka';
  v_to timestamptz;
  v_flows jsonb;
  v_position jsonb;
  v_checks jsonb := '[]'::jsonb;
  v_count bigint;
  v_sample text[];
  v_has_claims boolean := to_regclass('public.rider_settle_claims') is not null;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  v_to := v_from + interval '1 day';

  with d as (
    select o.id, o.total, o.payment, o.delivery_charge,
           coalesce(o.is_return, false) as is_return,
           coalesce(
             (select max(a.delivered_at) from delivery_assignments a
               where a.order_id = o.id and a.state = 'delivered'),
             (select min(h.created_at) from order_status_history h
               where h.order_id = o.id and h.status = 'delivered'),
             o.updated_at
           ) as at,
           exists (select 1 from delivery_assignments a
                    where a.order_id = o.id and a.state = 'delivered') as by_rider
    from orders o
    where o.status = 'delivered'
  ),
  day_orders as (select * from d where at >= v_from and at < v_to),
  earn as (
    select kind, amount from rider_earnings where created_at >= v_from and created_at < v_to
  ),
  setl as (
    select amount, coalesce((to_jsonb(s)->>'netted_amount')::bigint, 0) as netted
    from rider_settlements s where settled_at >= v_from and settled_at < v_to
  )
  select jsonb_build_object(
    'deliveredOrders',     (select count(*) from day_orders where not is_return),
    'returnLegs',          (select count(*) from day_orders where is_return),
    'orderValue',          coalesce((select sum(total) from day_orders where not is_return), 0),
    'codCollectedByRiders',coalesce((select sum(total) from day_orders where payment = 'cod' and by_rider), 0),
    'walletPaidOrders',    coalesce((select sum(total) from day_orders where payment <> 'cod'), 0),
    'commission',          coalesce((select sum(l.commission) from shop_ledger l join day_orders o on o.id = l.order_id), 0),
    'deliveryIncome',      coalesce((select sum(delivery_charge) from day_orders), 0),
    'shopPayableAccrued',  coalesce((select sum(l.payable) from shop_ledger l join day_orders o on o.id = l.order_id), 0),
    'shopPayoutsPaid',     coalesce((select sum(amount) from shop_payouts where paid_at >= v_from and paid_at < v_to), 0),
    'riderEarned',         coalesce((select sum(amount) from earn where kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')), 0),
    'riderAdjustments',    coalesce((select sum(amount) from earn where kind = 'adjustment'), 0),
    'riderPayoutsRequested', coalesce((select sum(amount) from rider_payout_requests where requested_at >= v_from and requested_at < v_to), 0),
    'riderPayoutsPaid',    coalesce((select sum(amount) from rider_payout_requests
                                      where status = 'paid' and decided_at >= v_from and decided_at < v_to), 0),
    'settlementsCount',    (select count(*) from setl),
    'settlementsTotal',    coalesce((select sum(amount) from setl), 0),
    'settlementsNetted',   coalesce((select sum(netted) from setl), 0),
    'cashHandedIn',        coalesce((select sum(amount - netted) from setl), 0)
  ) into v_flows;

  v_position := jsonb_build_object(
    'codCustody',  coalesce((select sum(cash_in_hand) from riders), 0),
    'riderPayable',coalesce((select sum(earnings_balance) from riders), 0),
    'shopPayable', coalesce((select sum(payable) from shop_ledger), 0)
                   - coalesce((select sum(amount) from shop_payouts), 0)
  );

  -- ── CHECKS ───────────────────────────────────────────────────────────────
  -- 1. every rider wallet equals the sum of its journal
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from (select r.id from riders r
        where r.earnings_balance <> coalesce((select sum(e.amount) from rider_earnings e where e.rider_id = r.id), 0)) x;
  v_checks := v_checks || jsonb_build_object('key', 'wallet_journal', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 2. no rider holds negative cash
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample from riders where cash_in_hand < 0;
  v_checks := v_checks || jsonb_build_object('key', 'negative_cash', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 3. no shop has been paid more than it earned
  select count(*), (array_agg(shop_id::text))[1:5] into v_count, v_sample
  from (select t.shop_id
        from (select l.shop_id, l.payable as earned, 0::bigint as paid from shop_ledger l
              union all
              select p.shop_id, 0, p.amount from shop_payouts p) t
        group by t.shop_id
        having sum(t.earned) < sum(t.paid)) x;
  v_checks := v_checks || jsonb_build_object('key', 'shop_overpaid', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 4. every order delivered today (with a shop) has its shop ledger line
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from (select o.id from orders o
        where o.status = 'delivered' and o.shop_id is not null
          and not coalesce(o.is_return, false)
          and o.updated_at >= v_from and o.updated_at < v_to
          and not exists (select 1 from shop_ledger l where l.order_id = o.id)) x;
  v_checks := v_checks || jsonb_build_object('key', 'delivered_no_ledger', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 5. rider payout requests waiting more than 48 hours
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from rider_payout_requests where status = 'pending' and requested_at < now() - interval '48 hours';
  v_checks := v_checks || jsonb_build_object('key', 'stale_payouts', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 6. settle claims waiting more than 48 hours
  v_count := 0; v_sample := null;
  if v_has_claims then
    execute $q$select count(*), (array_agg(id::text))[1:5] from rider_settle_claims
               where status = 'pending' and created_at < now() - interval '48 hours'$q$
      into v_count, v_sample;
  end if;
  v_checks := v_checks || jsonb_build_object('key', 'stale_claims', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 7. failed deliveries nobody has resolved (202610010001 column)
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from orders o
  where o.status = 'out-for-delivery' and nullif(to_jsonb(o)->>'delivery_failed_at', '') is not null;
  v_checks := v_checks || jsonb_build_object('key', 'open_failed_deliveries', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  -- 8. wallet payments awaiting a decision for more than a day
  select count(*), (array_agg(id::text))[1:5] into v_count, v_sample
  from orders o
  where o.payment <> 'cod' and o.payment_status = 'pending_verification'
    and o.status <> 'cancelled' and o.created_at < now() - interval '24 hours';
  v_checks := v_checks || jsonb_build_object('key', 'stale_payment_verification', 'ok', v_count = 0, 'count', v_count,
                                             'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb));

  return jsonb_build_object('day', v_day, 'flows', v_flows, 'position', v_position, 'checks', v_checks);
end $$;

revoke all on function ps_admin_money_daily(date) from public, anon;
grant execute on function ps_admin_money_daily(date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: rider inbox / announcements (202610020001) ====
-- ============================================================================
-- C4 / O (2026-10-02) — RIDER INBOX: office announcements to riders.
--
-- Until now the office had no way to tell riders anything inside the app
-- ("settle by 8pm", "Zindabazar road closed", "your KYC photo is blurry").
-- rider_announcements holds a message either for EVERY rider (rider_id null)
-- or for ONE rider, optionally expiring. rider_inbox_state remembers when
-- each rider last opened the inbox so the app can show an unread badge.
--
-- Writes go through two staff-only SECURITY DEFINER RPCs (ps_is_admin()), so
-- no table grant is needed for staff. Riders read through the app's rider
-- API (service role, scoped to the session rider) — they get no direct table
-- access. Safe to re-run.
-- ============================================================================
begin;

create table if not exists rider_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 1000),
  severity    text not null default 'info' check (severity in ('info', 'important')),
  rider_id    uuid references riders (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  expires_at  timestamptz
);
create index if not exists idx_rider_announcements_recent on rider_announcements (created_at desc);
create index if not exists idx_rider_announcements_rider on rider_announcements (rider_id, created_at desc);

create table if not exists rider_inbox_state (
  rider_id      uuid primary key references riders (id) on delete cascade,
  last_read_at  timestamptz not null default now()
);

alter table rider_announcements enable row level security;
alter table rider_inbox_state enable row level security;

drop policy if exists "rider announcements admin read" on rider_announcements;
create policy "rider announcements admin read" on rider_announcements
  for select using (ps_is_admin());

revoke all on rider_announcements from public, anon, authenticated;
revoke all on rider_inbox_state from public, anon, authenticated;
grant select on rider_announcements to authenticated;
grant select, insert, update, delete on rider_announcements to service_role;
grant select, insert, update, delete on rider_inbox_state to service_role;

-- Staff posts a message. p_rider_id null = everyone. p_expires_hours null/0 = never.
drop function if exists ps_admin_post_announcement(text, text, text, uuid, integer);
create or replace function ps_admin_post_announcement(
  p_title text,
  p_body text default '',
  p_severity text default 'info',
  p_rider_id uuid default null,
  p_expires_hours integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  if char_length(v_title) = 0 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;
  if char_length(coalesce(p_body, '')) > 1000 then
    raise exception 'invalid_body';
  end if;
  if p_rider_id is not null and not exists (select 1 from riders where id = p_rider_id) then
    raise exception 'rider_not_found';
  end if;
  insert into rider_announcements (title, body, severity, rider_id, created_by, expires_at)
  values (
    v_title,
    coalesce(p_body, ''),
    case when p_severity = 'important' then 'important' else 'info' end,
    p_rider_id,
    auth.uid(),
    case when coalesce(p_expires_hours, 0) > 0 then now() + make_interval(hours => least(p_expires_hours, 24 * 90)) end
  )
  returning id into v_id;
  return v_id;
end $$;

drop function if exists ps_admin_delete_announcement(uuid);
create or replace function ps_admin_delete_announcement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  delete from rider_announcements where id = p_id;
end $$;

revoke all on function ps_admin_post_announcement(text, text, text, uuid, integer) from public, anon;
revoke all on function ps_admin_delete_announcement(uuid) from public, anon;
grant execute on function ps_admin_post_announcement(text, text, text, uuid, integer) to authenticated, service_role;
grant execute on function ps_admin_delete_announcement(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: admin rider profile / COD risk (202610020002) ====
-- ============================================================================
-- L (2026-10-02) — ADMIN RIDER PROFILE: one read for "can I trust this rider
-- with more cash?".
--
-- ps_admin_rider_overview(p_rider_id) returns, for ONE rider, staff-only:
--   rider        identity, status, online, rating, lifetime deliveries
--   money        wallet, cash in hand, lifetime earned, paid out, pending
--                payout, netted against cash, handed in so far
--   risk         the FACTS behind COD risk: cash vs the dispatch cap, COD
--                deliveries since the last settlement (count / value / oldest),
--                the pending claim, rejected claims in 30 days
--   performance  30-day offer outcomes (delivered / failed / declined /
--                expired) and 7/30-day deliveries
--   journal / payouts / settlements / claims / trips  the latest rows
-- The app turns the facts into a risk level (src/lib/rider-risk.ts) so the
-- thresholds are unit-tested, not buried in SQL.
--
-- Read-only, staff-only on the caller's JWT (ps_is_admin()). rider_earnings,
-- payouts and claims have RLS with no policies, so this SECURITY DEFINER read
-- is the ONLY way staff see them. Optional tables are read defensively.
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function ps_admin_rider_overview(p_rider_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_has_claims boolean := to_regclass('public.rider_settle_claims') is not null;
  v_has_earn boolean := to_regclass('public.rider_earnings') is not null;
  v_has_payouts boolean := to_regclass('public.rider_payout_requests') is not null;
  v_last_settled timestamptz;
  v_cod_count bigint := 0;
  v_cod_value bigint := 0;
  v_cod_oldest timestamptz;
  v_money jsonb;
  v_perf jsonb;
  v_claim jsonb := null;
  v_rejected bigint := 0;
  v_journal jsonb := '[]'::jsonb;
  v_payouts jsonb := '[]'::jsonb;
  v_claims jsonb := '[]'::jsonb;
  v_settlements jsonb;
  v_trips jsonb;
  v_earned bigint := 0;
  v_netted bigint := 0;
  v_paid bigint := 0;
  v_pending bigint := 0;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_rider from riders where id = p_rider_id;
  if not found then
    raise exception 'rider_not_found';
  end if;

  select max(settled_at) into v_last_settled from rider_settlements where rider_id = p_rider_id;

  -- COD parcels delivered since the last time the rider handed cash in. Only
  -- meaningful while the rider still holds cash.
  if coalesce(v_rider.cash_in_hand, 0) > 0 then
    select count(*), coalesce(sum(o.total), 0), min(a.delivered_at)
      into v_cod_count, v_cod_value, v_cod_oldest
      from delivery_assignments a
      join orders o on o.id = a.order_id
     where a.rider_id = p_rider_id
       and a.state = 'delivered'
       and coalesce(o.payment, 'cod') = 'cod'
       and coalesce(o.is_return, false) = false
       and a.delivered_at > coalesce(v_last_settled, '-infinity'::timestamptz);
  end if;

  if v_has_earn then
    select coalesce(sum(amount) filter (where kind in ('tip','delivery_fee','cod_handling','incentive')), 0),
           coalesce(-sum(amount) filter (where kind = 'cod_netting'), 0)
      into v_earned, v_netted
      from rider_earnings where rider_id = p_rider_id;
    select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_journal from (
      select jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', e.amount, 'note', e.note,
                                'at', e.created_at, 'orderNo', o.order_no) as j
        from rider_earnings e left join orders o on o.id = e.order_id
       where e.rider_id = p_rider_id
       order by e.created_at desc limit 30) s;
  end if;

  if v_has_payouts then
    select coalesce(sum(amount) filter (where status = 'paid'), 0),
           coalesce(sum(amount) filter (where status = 'pending'), 0)
      into v_paid, v_pending
      from rider_payout_requests where rider_id = p_rider_id;
    select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_payouts from (
      select jsonb_build_object('id', id, 'amount', amount, 'method', method, 'account', account,
                                'status', status, 'at', requested_at, 'decidedAt', decided_at,
                                'note', note, 'reference', reference) as j
        from rider_payout_requests where rider_id = p_rider_id
       order by requested_at desc limit 10) s;
  end if;

  if v_has_claims then
    select jsonb_build_object('id', id, 'amount', amount, 'method', method, 'reference', reference, 'at', created_at)
      into v_claim
      from rider_settle_claims where rider_id = p_rider_id and status = 'pending'
     order by created_at desc limit 1;
    select count(*) into v_rejected from rider_settle_claims
     where rider_id = p_rider_id and status = 'rejected' and created_at >= now() - interval '30 days';
    select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_claims from (
      select jsonb_build_object('id', id, 'amount', amount, 'method', method, 'reference', reference,
                                'status', status, 'at', created_at, 'decidedAt', decided_at, 'note', note) as j
        from rider_settle_claims where rider_id = p_rider_id
       order by created_at desc limit 10) s;
  end if;

  select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_settlements from (
    select jsonb_build_object('id', id, 'amount', amount, 'nettedAmount', coalesce(netted_amount, 0),
                              'method', method, 'reference', reference, 'at', settled_at) as j
      from rider_settlements where rider_id = p_rider_id
     order by settled_at desc limit 10) s;

  v_money := jsonb_build_object(
    'cashInHand', coalesce(v_rider.cash_in_hand, 0),
    'earningsBalance', coalesce(v_rider.earnings_balance, 0),
    'lifetimeEarned', v_earned,
    'paidOut', v_paid,
    'pendingPayout', v_pending,
    'nettedAgainstCash', v_netted,
    'handedIn', coalesce((select sum(amount) from rider_settlements where rider_id = p_rider_id), 0)
  );

  select jsonb_build_object(
    'offered30', count(*),
    'delivered30', count(*) filter (where state = 'delivered'),
    'failed30', count(*) filter (where state = 'failed'),
    'declined30', count(*) filter (where state = 'cancelled' and cancelled_by = 'rider_decline'),
    'expired30', count(*) filter (where state = 'expired'),
    'delivered7', (select count(*) from delivery_assignments d
                    where d.rider_id = p_rider_id and d.state = 'delivered'
                      and d.delivered_at >= now() - interval '7 days'),
    'avgDeliveryMinutes', v_rider.avg_delivery_minutes
  ) into v_perf
  from delivery_assignments
  where rider_id = p_rider_id and offered_at >= now() - interval '30 days';

  select coalesce(jsonb_agg(j order by (j->>'at') desc), '[]'::jsonb) into v_trips from (
    select jsonb_build_object(
             'id', a.id, 'orderNo', o.order_no, 'state', a.state,
             'at', coalesce(a.delivered_at, a.offered_at), 'area', o.area, 'total', o.total,
             'payment', coalesce(o.payment, 'cod'), 'isReturn', coalesce(o.is_return, false),
             'shop', s.name, 'failedReason', a.failed_reason) as j
      from delivery_assignments a
      join orders o on o.id = a.order_id
      left join shops s on s.id = o.shop_id
     where a.rider_id = p_rider_id and a.state in ('delivered', 'failed')
     order by a.offered_at desc limit 15) t;

  return jsonb_build_object(
    'rider', jsonb_build_object(
      'id', v_rider.id, 'name', v_rider.name, 'phone', v_rider.phone, 'status', v_rider.status,
      'vehicle', v_rider.vehicle, 'isOnline', v_rider.is_online, 'zoneIds', to_jsonb(v_rider.zone_ids),
      'ratingAvg', v_rider.rating_avg, 'ratingCount', v_rider.rating_count,
      'totalDeliveries', coalesce(v_rider.total_deliveries, 0), 'createdAt', v_rider.created_at),
    'money', v_money,
    'risk', jsonb_build_object(
      'cashInHand', coalesce(v_rider.cash_in_hand, 0),
      'cashLimit', 500000,
      'codCountSinceSettle', v_cod_count,
      'codValueSinceSettle', v_cod_value,
      'oldestCodAt', v_cod_oldest,
      'lastSettledAt', v_last_settled,
      'pendingClaim', v_claim,
      'rejectedClaims30', v_rejected),
    'performance', v_perf,
    'journal', v_journal,
    'payouts', v_payouts,
    'settlements', v_settlements,
    'claims', v_claims,
    'trips', v_trips
  );
end $$;

revoke all on function ps_admin_rider_overview(uuid) from public, anon;
grant execute on function ps_admin_rider_overview(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

