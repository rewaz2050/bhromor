-- PART 21/21 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: shop-own-wallet settlement (202610020013) ====
-- ============================================================================
-- SHOP-OWN-WALLET settlement model (2026-10-02). OFF for every shop until staff
-- switch ONE shop to it (Admin → Shops → edit → "How this shop is paid").
--
--  Today the customer pays PROSANTI's wallet and the shop is paid its
--  `shop_ledger.payable` later (platform model — still the default and unchanged).
--  In the shop_wallet model the customer pays the SHOP's own bKash/Nagad number,
--  so the platform has already "paid" the shop that money. The ledger therefore
--  books, for a delivered, VERIFIED bKash/Nagad order of such a shop:
--
--        payable := (subtotal − commission − shop-funded promo …) − order.total
--
--  which is exactly  −(commission + delivery + tip + surcharge)  when the shop
--  funded its own promo, and gives PROSANTI-funded coupons back to the shop. A
--  negative balance means the SHOP OWES PROSANTI (every existing balance formula,
--  Σ payable − Σ payouts, keeps working unchanged).
--
--  * shops.settlement_model ('platform' default | 'shop_wallet'), wallet_bkash,
--    wallet_nagad. A shop_wallet shop is forced to payment_verifier = 'shop': the
--    money is in the shop's wallet, so only the shop can see it.
--  * shop_ledger.collected_by_shop = what the shop took directly (informational).
--  * COD is untouched (the rider's cash still goes to PROSANTI).
--  * A shop pays what it owes by a NEGATIVE shop_payouts amount ("remittance"):
--    ps_guard_payout_balance allows it only while the balance is negative and never
--    past zero. Positive payouts are still capped at the balance, as before.
--  * The daily reconciliation's "shop overpaid" check skips shop_wallet shops.
--  * ps_place_order accepts a wallet method when the shop has its own number (patched in
--    place, one line; if the anchor is not found you get a NOTICE and such shops take COD).
--
-- ps_write_shop_ledger is NOT redefined: a BEFORE trigger on shop_ledger nets the
-- collected amount, and an orders trigger re-nets when the payment is verified
-- after delivery. Safe to re-run. Run after 202609280003 and 202610010007.
-- ============================================================================
begin;

alter table shops add column if not exists settlement_model text not null default 'platform';
alter table shops drop constraint if exists shops_settlement_model_check;
alter table shops add constraint shops_settlement_model_check
  check (settlement_model in ('platform', 'shop_wallet'));
alter table shops add column if not exists wallet_bkash text;
alter table shops add column if not exists wallet_nagad text;
alter table shops drop constraint if exists shops_wallet_numbers_check;
alter table shops add constraint shops_wallet_numbers_check
  check ((wallet_bkash is null or wallet_bkash ~ '^01[0-9]{9}$')
     and (wallet_nagad is null or wallet_nagad ~ '^01[0-9]{9}$'));

create or replace function ps_shop_wallet_defaults()
returns trigger language plpgsql as $$
begin
  if new.settlement_model = 'shop_wallet' then
    -- jsonb_populate_record ignores a key the row has no column for (older databases)
    new := jsonb_populate_record(new, jsonb_build_object('payment_verifier', 'shop'));
  end if;
  return new;
end $$;

drop trigger if exists trg_shops_wallet_defaults on shops;
create trigger trg_shops_wallet_defaults
  before insert or update on shops
  for each row execute function ps_shop_wallet_defaults();

alter table shop_ledger add column if not exists collected_by_shop bigint not null default 0;

-- What the shop took straight from the customer for this order (0 unless it applies).
create or replace function ps_shop_wallet_collected(p_order_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when s.settlement_model = 'shop_wallet'
                 and o.payment::text in ('bkash', 'nagad')
                 and o.payment_status = 'verified'
                 and not coalesce(o.is_return, false)
                then greatest(coalesce(o.total, 0), 0) else 0 end
      from orders o join shops s on s.id = o.shop_id
     where o.id = p_order_id
  ), 0)::bigint
$$;
revoke all on function ps_shop_wallet_collected(uuid) from public, anon, authenticated;
grant execute on function ps_shop_wallet_collected(uuid) to service_role;

create or replace function ps_ledger_net_collected()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_collected bigint;
begin
  if coalesce(current_setting('ps.skip_collect', true), '') = '1' then
    return new;
  end if;
  -- A fresh line (or ps_write_shop_ledger rewriting the base payable): net it.
  if tg_op = 'INSERT' or new.payable is distinct from old.payable then
    v_collected := ps_shop_wallet_collected(new.order_id);
    new.collected_by_shop := v_collected;
    new.payable := new.payable - v_collected;
  end if;
  return new;
end $$;

drop trigger if exists trg_shop_ledger_net_collected on shop_ledger;
create trigger trg_shop_ledger_net_collected
  before insert or update on shop_ledger
  for each row execute function ps_ledger_net_collected();

-- The payment was verified AFTER the ledger line was written: re-net that line.
create or replace function ps_orders_renet_collected()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old bigint;
  v_new bigint;
begin
  select collected_by_shop into v_old from shop_ledger where order_id = new.id;
  if not found then
    return new;
  end if;
  v_new := ps_shop_wallet_collected(new.id);
  if v_new is distinct from v_old then
    perform set_config('ps.skip_collect', '1', true);
    update shop_ledger set payable = payable + collected_by_shop - v_new, collected_by_shop = v_new
     where order_id = new.id;
    perform set_config('ps.skip_collect', '0', true);
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_renet_collected on orders;
create trigger trg_orders_renet_collected
  after update of payment_status on orders
  for each row when (old.payment_status is distinct from new.payment_status)
  execute function ps_orders_renet_collected();

-- Payout guard: also lets a shop REMIT what it owes (negative amount), never past zero.
create or replace function ps_guard_payout_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_earned bigint;
  v_paid bigint;
begin
  if new.amount is null or new.amount = 0 then
    raise exception 'payout must be positive';
  end if;
  -- Serialize payouts per shop so two staff can't overpay concurrently.
  perform 1 from shops where id = new.shop_id for update;
  select coalesce(sum(payable), 0) into v_earned from shop_ledger where shop_id = new.shop_id;
  select coalesce(sum(amount), 0) into v_paid from shop_payouts where shop_id = new.shop_id;
  if new.amount > 0 then
    if new.amount > v_earned - v_paid then
      raise exception 'payout exceeds balance';
    end if;
  else
    -- remittance: the shop pays PROSANTI. Only while it owes, and not more than it owes.
    if v_earned - v_paid >= 0 or new.amount < v_earned - v_paid then
      raise exception 'remittance exceeds what the shop owes';
    end if;
  end if;
  return new;
end $$;

-- (trg_payouts_check_balance has existed since 202609090004 and calls this function by name,
-- so replacing the function is enough.)

-- Placing an order: ps_place_order insists that the PLATFORM has a number for the chosen
-- wallet ("bKash is not available right now"). A shop_wallet shop takes the payment on its
-- OWN number, so that line must also accept "this shop has one". ps_place_order is patched
-- in place (the installed text is not exactly a repository file — see 202609260003): one
-- anchor line, skipped with a NOTICE when the anchor is not found, never a failure.
create or replace function ps_shop_takes_wallet(p_shop uuid, p_method text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.settlement_model = 'shop_wallet'
           and coalesce(case lower(p_method) when 'bkash' then s.wallet_bkash when 'nagad' then s.wallet_nagad end, '') <> ''
      from shops s where s.id = p_shop
  ), false)
$$;
revoke all on function ps_shop_takes_wallet(uuid, text) from public, anon, authenticated;
grant execute on function ps_shop_takes_wallet(uuid, text) to service_role;

do $$
declare
  v_oid oid;
  v_def text;
  v_anchor text := $q$if coalesce(v_ops->'wallets'->>v_payment, '') = '' then$q$;
  v_new text := $q$if coalesce(v_ops->'wallets'->>v_payment, '') = '' and not ps_shop_takes_wallet(v_shop.id, v_payment) then$q$;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ps_place_order'
     and pg_get_function_identity_arguments(p.oid) = 'p_order jsonb, p_items jsonb';
  if v_oid is null then
    raise notice 'ps_place_order is not installed here — nothing to patch (shop wallets still need it patched later: re-run this file)';
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if position('ps_shop_takes_wallet' in v_def) > 0 then
    raise notice 'ps_place_order already accepts a shop''s own wallet';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise notice 'ps_place_order: wallet check anchor not found — a shop_wallet shop will only be able to take COD until it is patched';
    return;
  end if;
  execute replace(v_def, v_anchor, v_new);
  raise notice 'ps_place_order patched: a shop''s own wallet number is accepted';
end $$;

-- Daily reconciliation: the "shop overpaid" check skips shop_wallet shops
-- (latest definition: 202610010007, one clause added).
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
        -- a shop that sells into its OWN wallet (202610020013) runs a negative balance
        -- by design — it owes PROSANTI — so only platform-settled shops can be "overpaid"
        where not exists (select 1 from shops s where s.id = t.shop_id
                            and coalesce(to_jsonb(s)->>'settlement_model', 'platform') = 'shop_wallet')
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

-- ==== Fix: shop balance totals summed in the database (202610020014) ====
-- ============================================================================
-- Shop balances are SUMMED IN THE DATABASE (2026-10-03).
--
-- Until now the admin payouts screen, the "record a payout" pre-check, the vendor
-- earnings page and the shop dossier all fetched ledger / payout ROWS and added
-- them up in Node — capped at 5,000, 100, 20 or a window. PostgREST also caps a
-- response at `max_rows` (1,000 by default), so once a shop (or the platform) had
-- more rows than that the "lifetime paid" and "balance due" figures were quietly
-- wrong. The database trigger `ps_guard_payout_balance` was always right; only the
-- DISPLAY and the app-side pre-check were not.
--
-- One aggregate function. SECURITY INVOKER: row-level security still decides what
-- the caller may see (staff: every shop, a vendor: their own), so it opens nothing.
-- Safe to re-run.
-- ============================================================================

begin;

create or replace function ps_shop_balance_totals(p_shop_id uuid default null)
returns table (shop_id uuid, earned bigint, paid bigint, last_payout_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with e as (
    select l.shop_id, sum(l.payable)::bigint as earned
      from shop_ledger l
     where p_shop_id is null or l.shop_id = p_shop_id
     group by l.shop_id
  ), p as (
    select s.shop_id, sum(s.amount)::bigint as paid, max(s.paid_at) as last_at
      from shop_payouts s
     where p_shop_id is null or s.shop_id = p_shop_id
     group by s.shop_id
  )
  select coalesce(e.shop_id, p.shop_id),
         coalesce(e.earned, 0)::bigint,
         coalesce(p.paid, 0)::bigint,
         p.last_at
    from e full join p on p.shop_id = e.shop_id;
$$;

revoke all on function ps_shop_balance_totals(uuid) from public, anon;
grant execute on function ps_shop_balance_totals(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: peak-hour + rainy-day order bonus (202610020015) ====
-- ============================================================================
-- Peak-hour and rainy-day delivery bonus (2026-10-03) — both OFF until staff set an amount.
--
--   rider_peak_bonus_paisa   flat bonus per delivered order, for orders delivered inside the
--                            peak window (Dhaka clock). 0 = off, ≤ ৳200.
--   rider_peak_start_hour    window start, 0–23 (inclusive)         default 18
--   rider_peak_end_hour      window end,   0–23 (exclusive)         default 22
--                            start > end wraps midnight (e.g. 22 → 2); start = end = no window.
--   rider_rain_bonus_paisa   flat bonus per delivered order the CUSTOMER paid the rain
--                            surcharge on (orders.surcharge_rain > 0). 0 = off, ≤ ৳200.
--
-- Both can apply to one order (they stack). Delivery legs only (returns excluded), active
-- riders only, orders delivered in the last 48 h (so a late sweep still pays).
--
-- It is a SEPARATE function (ps_award_order_bonuses) so the daily/weekly/referral function is
-- untouched. Idempotency = rider_incentive_awards (rider, kind, order id): paid once per order
-- per kind, however often the sweep runs. The credit is an order-less `incentive` journal row
-- (ps__credit_incentive), so it can never collide with another per-order journal row.
-- Setting changes are audited. Safe to re-run. Run after 202610020014.
-- ============================================================================
begin;

do $$
declare c record;
begin
  if to_regclass('public.rider_incentive_awards') is not null then
    for c in
      select conname from pg_constraint
       where conrelid = 'public.rider_incentive_awards'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) ilike '%daily_target%'
    loop
      execute format('alter table public.rider_incentive_awards drop constraint %I', c.conname);
    end loop;
    alter table rider_incentive_awards drop constraint if exists rider_incentive_awards_kind_check;
    alter table rider_incentive_awards add constraint rider_incentive_awards_kind_check
      check (kind in ('daily_target', 'weekly_target', 'referral', 'peak_bonus', 'rain_bonus'));
  end if;
end $$;

create or replace function ps_award_order_bonuses(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_peak   bigint := least(greatest(ps_setting_int('rider_peak_bonus_paisa', 0), 0), 20000);
  v_ps     int    := least(greatest(ps_setting_int('rider_peak_start_hour', 18), 0), 23);
  v_pe     int    := least(greatest(ps_setting_int('rider_peak_end_hour', 22), 0), 23);
  v_rain   bigint := least(greatest(ps_setting_int('rider_rain_bonus_paisa', 0), 0), 20000);
  v_peaks  int := 0;
  v_rains  int := 0;
  v_total  bigint := 0;
  v_awards jsonb := '[]'::jsonb;
  v_earning uuid;
  v_note   text;
  r record;
begin
  if v_peak > 0 and v_ps <> v_pe then
    for r in
      select a.rider_id, a.order_id, o.order_no
        from delivery_assignments a
        join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
        join riders x on x.id = a.rider_id and x.status = 'active'
       where a.state = 'delivered'
         and a.delivered_at >= p_now - interval '48 hours'
         and a.delivered_at <= p_now
         and case
               when v_ps < v_pe then extract(hour from a.delivered_at at time zone 'Asia/Dhaka') >= v_ps
                                 and extract(hour from a.delivered_at at time zone 'Asia/Dhaka') <  v_pe
               else extract(hour from a.delivered_at at time zone 'Asia/Dhaka') >= v_ps
                 or extract(hour from a.delivered_at at time zone 'Asia/Dhaka') <  v_pe
             end
    loop
      insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
      values (r.rider_id, 'peak_bonus', r.order_id::text, v_peak)
      on conflict (rider_id, kind, ref_key) do nothing;
      if found then
        v_note := left('Peak-hour bonus — ' || coalesce(r.order_no, r.order_id::text), 400);
        v_earning := ps__credit_incentive(r.rider_id, v_peak, v_note);
        update rider_incentive_awards set earning_id = v_earning
         where rider_id = r.rider_id and kind = 'peak_bonus' and ref_key = r.order_id::text;
        v_peaks := v_peaks + 1;
        v_total := v_total + v_peak;
        v_awards := v_awards || jsonb_build_object('riderId', r.rider_id, 'kind', 'peak_bonus', 'amount', v_peak, 'note', v_note);
      end if;
    end loop;
  end if;

  if v_rain > 0 then
    for r in
      select a.rider_id, a.order_id, o.order_no
        from delivery_assignments a
        join orders o on o.id = a.order_id and not coalesce(o.is_return, false)
        join riders x on x.id = a.rider_id and x.status = 'active'
       where a.state = 'delivered'
         and a.delivered_at >= p_now - interval '48 hours'
         and a.delivered_at <= p_now
         and coalesce(o.surcharge_rain, 0) > 0
    loop
      insert into rider_incentive_awards (rider_id, kind, ref_key, amount)
      values (r.rider_id, 'rain_bonus', r.order_id::text, v_rain)
      on conflict (rider_id, kind, ref_key) do nothing;
      if found then
        v_note := left('Rainy-day bonus — ' || coalesce(r.order_no, r.order_id::text), 400);
        v_earning := ps__credit_incentive(r.rider_id, v_rain, v_note);
        update rider_incentive_awards set earning_id = v_earning
         where rider_id = r.rider_id and kind = 'rain_bonus' and ref_key = r.order_id::text;
        v_rains := v_rains + 1;
        v_total := v_total + v_rain;
        v_awards := v_awards || jsonb_build_object('riderId', r.rider_id, 'kind', 'rain_bonus', 'amount', v_rain, 'note', v_note);
      end if;
    end loop;
  end if;

  return jsonb_build_object('peak', v_peaks, 'rain', v_rains, 'total', v_total, 'awards', v_awards);
end $$;

revoke all on function ps_award_order_bonuses(timestamptz) from public, anon, authenticated;
grant execute on function ps_award_order_bonuses(timestamptz) to service_role;

-- Audit the new keys (the trigger's WHEN filter cannot be altered, so it is recreated).
do $$
begin
  if to_regclass('public.site_settings') is not null
     and to_regprocedure('public.ps_money_audit_write(text,text,text,bigint,jsonb,uuid)') is not null
     and to_regprocedure('public.ps_incentive_settings_audit()') is not null then
    drop trigger if exists trg_incentive_settings_audit on site_settings;
    create trigger trg_incentive_settings_audit after insert or update on site_settings
      for each row when (new.key in ('incentive_daily_target', 'incentive_daily_bonus_paisa',
                                     'incentive_referral_bonus_paisa', 'incentive_referral_after',
                                     'incentive_weekly_target', 'incentive_weekly_bonus_paisa',
                                     'incentive_weekly_target2', 'incentive_weekly_bonus2_paisa',
                                     'rider_peak_bonus_paisa', 'rider_peak_start_hour',
                                     'rider_peak_end_hour', 'rider_rain_bonus_paisa'))
      execute function ps_incentive_settings_audit();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

