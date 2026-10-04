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
