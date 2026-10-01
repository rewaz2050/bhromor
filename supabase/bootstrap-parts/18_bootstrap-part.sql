-- PART 18/18 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
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

