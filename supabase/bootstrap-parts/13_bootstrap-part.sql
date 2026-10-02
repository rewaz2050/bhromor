-- PART 13/22 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
-- ==== Feature: password reset requests (202609260001) ====
-- Password reset requests without SMS or e-mail (2026-09-26).
--
-- The vendor / rider onboarding sends no e-mail and no SMS, so "I forgot my
-- password" cannot be a reset link. Instead it is a REQUEST the person files
-- from the login page (email + phone on file), which staff verify by phone
-- and approve; approval opens a 24-hour window in which the same person sets
-- a new password themselves. No secret is ever generated or transported:
-- identity = the email + phone pair, the staff phone call, and the window.
--
-- Rows are written only by the API with the service role; staff read and
-- decide through RLS. One open (pending / approved) request per login.
begin;

create table if not exists password_reset_requests(
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('vendor','rider')),
  user_id       uuid not null references auth.users(id) on delete cascade,
  subject_id    uuid not null,                       -- shops.id / riders.id
  subject_name  text not null default '',
  email         text not null,
  phone         text not null,                       -- normalized 01XXXXXXXXX
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','used','expired')),
  note          text,                                -- staff note on reject
  requested_at  timestamptz not null default now(),
  requested_ip  text,
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  expires_at    timestamptz,                         -- approval window end
  used_at       timestamptz
);

create unique index if not exists password_reset_requests_one_open
  on password_reset_requests(user_id) where status in ('pending','approved');
create index if not exists idx_password_reset_requests_queue
  on password_reset_requests(status, requested_at desc);

alter table password_reset_requests enable row level security;

-- Staff (manager / admin / super_admin) read and decide. Nobody else has a
-- policy: the login page never touches the table directly, it talks to
-- /api/auth/reset-request which uses the service role.
drop policy if exists "password_reset_requests staff all" on password_reset_requests;
create policy "password_reset_requests staff all" on password_reset_requests
  for all using (ps_is_admin()) with check (ps_is_admin());

notify pgrst, 'reload schema';
commit;

-- ==== Feature: application review (202609260002) ====
-- Round 4 (2026-09-26): application review + rider KYC.
--
--   * shops / riders gain a fourth status, 'rejected', so staff can answer
--     an application with a reason instead of leaving it pending forever or
--     suspending a shop that never opened.
--   * review_note / reviewed_by / reviewed_by_email / reviewed_at record
--     every decision (approve, reject, suspend, re-open) — the applicant
--     sees the note on the login page and can fix the details and
--     re-apply with the same login, which UPDATES the rejected row back
--     to 'pending' (one login = one shop / one rider stays true).
--   * riders.kyc holds the document URLs a pending rider uploads from the
--     login page (nid_front, nid_back, selfie, license) — staff see them
--     on the Admin → Riders card before pressing Approve.
--
-- Idempotent; safe to re-run.

begin;

-- ---------------------------------------------------------------- shops
alter table shops drop constraint if exists shops_status_check;
alter table shops
  add constraint shops_status_check
  check (status in ('pending', 'active', 'suspended', 'rejected'));

alter table shops
  add column if not exists review_note       text,
  add column if not exists reviewed_by       uuid,
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_at       timestamptz;

-- ---------------------------------------------------------------- riders
alter table riders drop constraint if exists riders_status_check;
alter table riders
  add constraint riders_status_check
  check (status in ('pending', 'active', 'suspended', 'rejected'));

alter table riders
  add column if not exists review_note       text,
  add column if not exists reviewed_by       uuid,
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_at       timestamptz,
  add column if not exists kyc               jsonb not null default '{}'::jsonb,
  add column if not exists kyc_submitted_at  timestamptz;

-- No guard change needed: since 202609160003 a rider's DIRECT write to
-- their own row may only flip is_online (jsonb whitelist), so the new
-- review/KYC columns are staff- and service-role-only automatically.
-- KYC uploads go through /api/rider/kyc, which writes with the service role
-- after verifying the rider's own session.

-- Storefront reads of shops are already limited to status = 'active' by the
-- public policies; a rejected shop is as invisible as a pending one.

notify pgrst, 'reload schema';

commit;

-- ==== Feature: free delivery (202609260003) ====
-- ============================================================================
-- Free delivery threshold (2026-09-26)
--
-- Two rules, both optional, both server-priced:
--
--   * PLATFORM rule — Admin → Settings → "Free delivery": on/off + minimum
--     subtotal. Lives in site_settings['ops'].freeDelivery (no schema
--     change). PROSANTI funds it: the shop's payout is untouched.
--   * SHOP rule — Vendor → Settings → "ফ্রি ডেলিভারি": each shop may opt in
--     with its own minimum (shops.free_delivery_min, paisa; NULL = off).
--     The shop funds it: ps_write_shop_ledger deducts the waived delivery
--     amount from that order's payable.
--
-- Precedence at placement: platform first (if it covers the order the shop
-- pays nothing), then the shop's own rule. Rider zones only — the courier
-- leg (z4) is never free; pickup / return orders were already free; a
-- free-delivery coupon or an active PROSANTI+ term still wins (no
-- attribution, no deduction).
--
-- orders.free_delivery_by ('platform' | 'shop' | NULL) and
-- orders.free_delivery_waived (paisa) record what happened, for the ledger,
-- the admin order page and the vendor's earnings.
--
-- Idempotent — safe to re-run. Patches the installed ps_place_order in place
-- (same technique as 202609160001) instead of re-pasting the whole RPC, so it
-- works on every generation from 202609140015 (PROSANTI+) onward — including
-- a copy that was pasted with Windows line endings or re-indented (the
-- anchors are whitespace-tolerant since 2026-09-27).
-- Expect "FREE DELIVERY OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists free_delivery_min bigint;
alter table public.shops drop constraint if exists shops_free_delivery_min_check;
alter table public.shops
  add constraint shops_free_delivery_min_check
  check (free_delivery_min is null or free_delivery_min > 0);

alter table public.orders
  add column if not exists free_delivery_by text;
alter table public.orders drop constraint if exists orders_free_delivery_by_check;
alter table public.orders
  add constraint orders_free_delivery_by_check
  check (free_delivery_by is null or free_delivery_by in ('platform', 'shop'));
alter table public.orders
  add column if not exists free_delivery_waived bigint not null default 0;

-- ---------------------------------------------------------------------------
-- 2. ps_place_order — patch the installed definition in place.
--
--    Whitespace-tolerant (2026-09-27): the anchors are matched with regexes
--    after the body's line endings and tabs are normalised, because a
--    function that was pasted from Windows (CR LF) or re-indented by an
--    editor is byte-different from the repository text even though it is
--    the same function — the first cut of this file failed on exactly that
--    ("could not find its anchors"). The normalised, patched body is what
--    gets stored, so later patches see plain LF.
-- ---------------------------------------------------------------------------
do $free_delivery$
declare
  v_definition text;
  v_function oid;
  v_block text;
  v_had_cr boolean;
  v_had_tab boolean;
  v_ok_declare boolean;
  v_ok_rule boolean;
  v_ok_cols boolean;
  v_ok_vals boolean;
  v_md5_installed text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_function, v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ps_place_order'
    and oidvectortypes(p.proargtypes) = 'jsonb, jsonb'
  order by p.oid desc
  limit 1;

  if v_function is null then
    raise exception 'ps_place_order(jsonb,jsonb) is missing — apply the checkout migrations first';
  end if;

  if v_definition like '%v_fd_by%' then
    raise notice 'ps_place_order already prices the free-delivery threshold — nothing to patch';
    return;
  end if;

  if v_definition not like '%is_plus,%' then
    raise exception 'ps_place_order predates 202609140015_plus_membership.sql — apply that first';
  end if;

  -- Normalise what a copy-paste may have changed: CR LF / lone CR line
  -- endings and tabs. The function has no string literal that contains
  -- either, so this cannot change its behaviour.
  v_md5_installed := md5(v_definition);
  v_had_cr  := position(E'\r' in v_definition) > 0;
  v_had_tab := position(E'\t' in v_definition) > 0;
  v_definition := replace(replace(v_definition, E'\r\n', E'\n'), E'\r', E'\n');
  v_definition := replace(v_definition, E'\t', '  ');

  -- (a) two working variables, declared next to v_zone (any indentation).
  v_definition := regexp_replace(
    v_definition,
    'declare[[:space:]]+v_zone[[:space:]]+delivery_zones%rowtype;',
    E'declare\n  v_fd_by text := null;\n  v_fd_waived bigint := 0;\n  v_zone delivery_zones%rowtype;'
  );
  v_ok_declare := v_definition like '%v_fd_by text := null;%';

  -- (b) the rule itself, evaluated after coupon / PROSANTI+ zeroed the
  --     charge (v_charge > 0 guard) and before the total is computed —
  --     i.e. right above the "P0 automatic offers" block, whatever its
  --     indentation.
  v_block := E'  -- ------------------------------------------------------------------\n'
    || E'  -- Free delivery threshold (202609260003): the platform rule first\n'
    || E'  -- (PROSANTI-funded), then the shop''s own opt-in (shop-funded — the\n'
    || E'  -- ledger deducts free_delivery_waived from the payout). Rider zones\n'
    || E'  -- only; pickup, return, coupon-free and PROSANTI+ orders skip this.\n'
    || E'  -- ------------------------------------------------------------------\n'
    || E'  if v_charge > 0 and not v_is_pickup and not v_is_return and v_zone.id <> ''z4'' then\n'
    || E'    declare\n'
    || E'      v_fd_platform bigint;\n'
    || E'      v_fd_shop bigint;\n'
    || E'    begin\n'
    || E'      select nullif(s.value->''freeDelivery''->>''minSubtotalPaisa'', '''')::bigint\n'
    || E'        into v_fd_platform\n'
    || E'        from site_settings s\n'
    || E'       where s.key = ''ops''\n'
    || E'         and coalesce((s.value->''freeDelivery''->>''enabled'')::boolean, false);\n'
    || E'      v_fd_shop := v_shop.free_delivery_min;\n'
    || E'      if v_fd_platform is not null and v_fd_platform > 0 and v_subtotal >= v_fd_platform then\n'
    || E'        v_fd_by := ''platform'';\n'
    || E'      elsif v_fd_shop is not null and v_fd_shop > 0 and v_subtotal >= v_fd_shop then\n'
    || E'        v_fd_by := ''shop'';\n'
    || E'      end if;\n'
    || E'      if v_fd_by is not null then\n'
    || E'        v_fd_waived := v_charge;\n'
    || E'        v_charge := 0;\n'
    || E'        v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;\n'
    || E'      end if;\n'
    || E'    end;\n'
    || E'  end if;\n\n';
  -- Only the first match is replaced (no 'g' flag); the comment line is
  -- kept below the inserted block.
  v_definition := regexp_replace(
    v_definition,
    E'\n[ ]*-- P0 automatic offers',
    E'\n' || v_block || E'  -- P0 automatic offers'
  );
  v_ok_rule := v_definition like '%Free delivery threshold (202609260003)%';

  -- (c) persist the attribution on the order row: the insert's column list
  --     and its values list (each anchor occurs once in the function).
  v_definition := regexp_replace(
    v_definition, E'is_plus,[ ]*\n', E'is_plus, free_delivery_by, free_delivery_waived,\n'
  );
  v_definition := regexp_replace(
    v_definition, E'v_plus,[ ]*\n', E'v_plus, v_fd_by, v_fd_waived,\n'
  );
  v_ok_cols := v_definition like '%is_plus, free_delivery_by, free_delivery_waived,%';
  v_ok_vals := v_definition like '%v_plus, v_fd_by, v_fd_waived,%';

  if not (v_ok_declare and v_ok_rule and v_ok_cols and v_ok_vals) then
    raise exception using
      message = format(
        'free-delivery patch could not find its anchors in ps_place_order — declare: %s, P0 offers: %s, insert columns: %s, insert values: %s (installed body: %s chars, CR line endings: %s, tabs: %s, md5 %s)',
        case when v_ok_declare then 'ok' else 'MISSING' end,
        case when v_ok_rule then 'ok' else 'MISSING' end,
        case when v_ok_cols then 'ok' else 'MISSING' end,
        case when v_ok_vals then 'ok' else 'MISSING' end,
        length(v_definition), v_had_cr, v_had_tab, v_md5_installed),
      hint = 'The installed ps_place_order is not the text this repository ships. Re-install it exactly: supabase/paste-parts 05 → 09 (base64 chunks of 202609140015, checksummed), then 202609160001_checkout_delivery_pricing.sql, then run this file again.';
  end if;

  execute v_definition;
  raise notice 'ps_place_order patched (had CR line endings: %, tabs: %)', v_had_cr, v_had_tab;
end
$free_delivery$;

-- ---------------------------------------------------------------------------
-- 3. Ledger: a shop-funded waiver comes out of that order's payable.
--    Same body as 202609160003 plus the deduction; jsonb reads keep it
--    working on databases that never got the optional order columns.
-- ---------------------------------------------------------------------------
create or replace function ps_write_shop_ledger()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pct numeric;
  v_commission bigint;
  v_payable bigint;
  v_delivery bigint;
  v_tip bigint;
  v_sur bigint;
  v_row jsonb := to_jsonb(new);
  v_fd_waived bigint;
begin
  if new.status = 'delivered' and old.status is distinct from new.status then
    select commission_pct into v_pct from shops where id = new.shop_id;
    if v_pct is null then v_pct := 15; end if;
    v_commission := floor((new.subtotal * v_pct) / 100);
    v_payable := new.subtotal - v_commission;
    v_delivery := coalesce(new.delivery_charge, 0);
    v_tip := coalesce((v_row->>'tip_amount')::bigint, 0);
    v_sur := coalesce((v_row->>'surcharge_night')::bigint, 0)
           + coalesce((v_row->>'surcharge_rain')::bigint, 0)
           + coalesce((v_row->>'surcharge_distance')::bigint, 0)
           + coalesce((v_row->>'surcharge_express')::bigint, 0)
           + coalesce((v_row->>'surcharge_weight')::bigint, 0);
    -- Free delivery the SHOP offered: the rider is still paid, so the waived
    -- amount leaves the shop's share (never below zero on this line).
    v_fd_waived := coalesce((v_row->>'free_delivery_waived')::bigint, 0);
    if coalesce(v_row->>'free_delivery_by', '') = 'shop' and v_fd_waived > 0 then
      v_payable := greatest(0, v_payable - v_fd_waived);
    end if;
    -- A return order is the reverse leg: the shop pays the product share back.
    if coalesce((v_row->>'is_return')::boolean, false) then
      v_payable := -(new.subtotal - v_commission);
    end if;
    if new.shop_id is null then
      return new;
    end if;
    insert into shop_ledger (shop_id, order_id, subtotal, commission, payable, delivery_charge, tip_amount, surcharge_total)
    values (new.shop_id, new.id, new.subtotal, v_commission, v_payable, v_delivery, v_tip, v_sur)
    on conflict (order_id) do update set
      subtotal = excluded.subtotal,
      commission = excluded.commission,
      payable = excluded.payable,
      delivery_charge = excluded.delivery_charge,
      tip_amount = excluded.tip_amount,
      surcharge_total = excluded.surcharge_total;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_ledger_on_delivered on orders;
create trigger trg_orders_ledger_on_delivered
  after update of status on orders
  for each row execute function ps_write_shop_ledger();

-- ---------------------------------------------------------------------------
-- 4. Proof
-- ---------------------------------------------------------------------------
do $$
declare v_ok boolean;
begin
  select pg_get_functiondef(p.oid) like '%v_fd_by%'
    into v_ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ps_place_order'
    and oidvectortypes(p.proargtypes) = 'jsonb, jsonb'
  order by p.oid desc limit 1;
  if not coalesce(v_ok, false) then
    raise exception 'ps_place_order was not patched';
  end if;
  raise notice 'FREE DELIVERY OK';
end $$;

commit;

-- ==== Feature: storefront events (202609260004) ====
-- ============================================================================
-- Storefront funnel events (2026-09-26) — UX plan §0 "measure first"
--
-- The shop's OWN, first-party funnel: the browser batches a handful of
-- anonymous events (page_view, view_item, add_to_cart, begin_checkout,
-- purchase, search, scroll_depth, view_item_list, select_item) to
-- POST /api/events, which inserts them here with the service role. No
-- vendor tag needed, no cookies, nothing personal: a per-tab session id
-- (random, sessionStorage) is the only join key.
--
--   * storefront_events — append-only; RLS on with NO policies and all
--     privileges revoked from anon/authenticated → only the service role
--     (API route) and the report function below can touch it.
--   * ps_funnel_report(p_days) — one JSON blob for Admin → Reports → "Funnel":
--     sessions, bounce, pages/session, PDP → add-to-cart → checkout → order
--     conversion, add-to-cart by source (card / pdp / bundle / live), top
--     searches with their result counts (zero = demand we don't stock), and
--     how far down the home page people scroll. Orders / AOV / repeat come
--     from `orders` itself (cancelled + return orders excluded), so the
--     "order" step is real money, not a client-side ping.
--
-- Retention: rows older than 90 days are pruned by ps_prune_storefront_events()
-- (call it from a daily cron / the API — optional, the table is small).
--
-- Idempotent — safe to re-run. Expect "STOREFRONT EVENTS OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.storefront_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  session_id  text not null check (char_length(session_id) between 8 and 64),
  event       text not null check (event in (
                'page_view', 'view_item_list', 'select_item', 'view_item',
                'add_to_cart', 'begin_checkout', 'purchase', 'search', 'scroll_depth')),
  path        text,
  product_id  text,
  shop_id     text,
  source      text,
  value       bigint,
  meta        jsonb not null default '{}'::jsonb,
  lang        text check (lang is null or lang in ('bn', 'en'))
);

create index if not exists storefront_events_created_idx
  on public.storefront_events (created_at desc);
create index if not exists storefront_events_session_idx
  on public.storefront_events (session_id, created_at);
create index if not exists storefront_events_event_created_idx
  on public.storefront_events (event, created_at desc);

alter table public.storefront_events enable row level security;
revoke all on public.storefront_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Retention helper (optional; service role / cron only)
-- ---------------------------------------------------------------------------
create or replace function public.ps_prune_storefront_events(p_keep_days int default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.storefront_events
  where created_at < now() - make_interval(days => greatest(p_keep_days, 7));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke execute on function public.ps_prune_storefront_events(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funnel report
-- ---------------------------------------------------------------------------
create or replace function public.ps_funnel_report(p_days int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
  v_sessions bigint;
  v_page_views bigint;
  v_bounced bigint;
  v_pdp bigint;
  v_atc bigint;
  v_checkout bigint;
  v_purchase bigint;
  v_orders bigint;
  v_revenue bigint;
  v_customers bigint;
  v_repeat bigint;
  v_home_sessions bigint;
  v_atc_by_source jsonb;
  v_top_searches jsonb;
  v_home_scroll jsonb;
begin
  -- Sessions = distinct tabs that produced at least one page_view.
  select count(distinct session_id), count(*)
    into v_sessions, v_page_views
  from public.storefront_events
  where created_at >= v_since and event = 'page_view';

  select count(*) into v_bounced
  from (
    select session_id
    from public.storefront_events
    where created_at >= v_since and event = 'page_view'
    group by session_id
    having count(*) = 1
  ) b;

  select
    count(distinct session_id) filter (where event = 'view_item'),
    count(distinct session_id) filter (where event = 'add_to_cart'),
    count(distinct session_id) filter (where event = 'begin_checkout'),
    count(distinct session_id) filter (where event = 'purchase'),
    count(distinct session_id) filter (where event = 'page_view' and path = '/')
    into v_pdp, v_atc, v_checkout, v_purchase, v_home_sessions
  from public.storefront_events
  where created_at >= v_since;

  -- Real orders from the orders table (not the client ping).
  select count(*), coalesce(sum(total), 0)
    into v_orders, v_revenue
  from public.orders o
  where o.created_at >= v_since
    and o.status <> 'cancelled'
    and not coalesce(o.is_return, false);

  with window_customers as (
    select distinct coalesce(o.customer_id::text, o.customer_phone) as ckey
    from public.orders o
    where o.created_at >= v_since
      and o.status <> 'cancelled'
      and not coalesce(o.is_return, false)
  )
  select
    count(*),
    count(*) filter (where exists (
      select 1 from public.orders p
      where coalesce(p.customer_id::text, p.customer_phone) = w.ckey
        and p.created_at < v_since
        and p.status <> 'cancelled'
        and not coalesce(p.is_return, false)
    ))
    into v_customers, v_repeat
  from window_customers w;

  select coalesce(jsonb_agg(jsonb_build_object('source', source, 'count', n) order by n desc), '[]'::jsonb)
    into v_atc_by_source
  from (
    select coalesce(nullif(source, ''), 'other') as source, count(*) as n
    from public.storefront_events
    where created_at >= v_since and event = 'add_to_cart'
    group by 1
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('query', q, 'count', n, 'max_results', mx) order by n desc, q), '[]'::jsonb)
    into v_top_searches
  from (
    select lower(left(meta->>'q', 80)) as q, count(*) as n, max(coalesce(value, 0)) as mx
    from public.storefront_events
    where created_at >= v_since and event = 'search' and coalesce(meta->>'q', '') <> ''
    group by 1
    order by n desc, q
    limit 12
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('depth', depth, 'sessions', n) order by depth), '[]'::jsonb)
    into v_home_scroll
  from (
    select value as depth, count(distinct session_id) as n
    from public.storefront_events
    where created_at >= v_since and event = 'scroll_depth' and path = '/'
      and value in (25, 50, 75, 100)
    group by 1
  ) d;

  return jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 7), 1), 90),
    'sessions', v_sessions,
    'page_views', v_page_views,
    'bounced_sessions', v_bounced,
    'pdp_sessions', v_pdp,
    'atc_sessions', v_atc,
    'checkout_sessions', v_checkout,
    'purchase_sessions', v_purchase,
    'orders', v_orders,
    'aov', case when v_orders > 0 then (v_revenue / v_orders) else null end,
    'customers', v_customers,
    'repeat_customers', v_repeat,
    'atc_by_source', v_atc_by_source,
    'top_searches', v_top_searches,
    'home_sessions', v_home_sessions,
    'home_scroll', v_home_scroll
  );
end;
$$;
revoke execute on function public.ps_funnel_report(int) from public, anon, authenticated;

commit;

do $$ begin raise notice 'STOREFRONT EVENTS OK'; end $$;

-- ==== Feature: push broadcasts (202609270001) ====
-- ============================================================================
-- 202609270001_push_broadcasts.sql
-- Customer push BROADCAST (UX plan §12, R9) — "নতুন ড্রপের খবর" without SMS
-- or email: the shopper who already turned on order notifications can also
-- opt in to at most ONE shop message a week (a drop, an offer), sent from
-- Admin → Growth to every opted-in device at once.
--
--   • `customer_push_subscriptions.marketing` — the opt-in, per device,
--     default FALSE. Order milestones never look at it; only the broadcast
--     fan-out does. A device that never ticked the box is never broadcast to.
--   • `push_broadcasts` — one row per send: what was said (both languages),
--     where it pointed, how many devices accepted, who pressed the button.
--     The "one per 7 days" rule is enforced from `sent_at` of the newest row
--     server-side, so nobody can spam the list by reloading the page.
--
-- Service-role only, RLS with no policies (same posture as the parent table).
-- Safe to run twice. Expect "PUSH BROADCASTS OK" at the end.
-- ============================================================================

begin;

alter table public.customer_push_subscriptions
  add column if not exists marketing boolean not null default false;

create index if not exists idx_customer_push_marketing
  on public.customer_push_subscriptions (marketing)
  where marketing;

create table if not exists public.push_broadcasts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  title_bn   text not null default '',
  body       text not null,
  body_bn    text not null default '',
  href       text not null default '/offers',
  devices    integer not null default 0,
  accepted   integer not null default 0,
  sent_by    text,
  sent_at    timestamptz not null default now()
);

create index if not exists idx_push_broadcasts_sent_at
  on public.push_broadcasts (sent_at desc);

alter table public.push_broadcasts enable row level security;

do $$ begin raise notice 'PUSH BROADCASTS OK'; end $$;

commit;

-- ==== Feature: shop cover (202609270002) ====
-- ============================================================================
-- 202609270002_shop_cover.sql
-- Shop cover image (UX plan §9, R9) — one landscape photo per shop, shown as
-- the storefront header background and as the banner on the /shops card.
-- Optional: an empty string means "no cover" and every surface falls back to
-- what it shows today. The vendor sets it from Vendor → Settings (URL; the
-- same trust model as logo_url). Safe to run twice; expect "SHOP COVER OK".
-- ============================================================================

begin;

alter table public.shops
  add column if not exists cover_url text not null default '';

do $$ begin raise notice 'SHOP COVER OK'; end $$;

commit;

-- ==== Feature: bag snapshots (202609270003) ====
-- 202609270003_bag_snapshots.sql — the abandoned bag (UX plan §5, R10).
--
-- A shopper who opted in to "drops & offers" push on a device
-- (customer_push_subscriptions.marketing, migration 202609270001) and then
-- left pieces in the bag gets ONE reminder about 24 hours later — never SMS,
-- never email, never a second nag for the same bag.
--
--   • one row per push device (endpoint), written by the storefront through
--     PUT /api/bag/snapshot whenever the bag changes; a bag emptied at
--     checkout writes count = 0 so nothing is sent;
--   • `touched_at` is the last change, `reminded_at` the one reminder;
--     the scheduler (/api/cron/tick → abandoned-bags) picks rows with
--     count > 0, untouched for 24–72 h, not reminded in the last 7 days;
--   • the endpoint references the subscription row, so a device that
--     unsubscribes (or dies) takes its snapshot with it;
--   • service-role only — RLS on, no policies.

begin;

create table if not exists public.bag_snapshots (
  endpoint    text primary key
              references public.customer_push_subscriptions (endpoint) on delete cascade,
  count       integer not null default 0 check (count >= 0),
  subtotal    integer not null default 0 check (subtotal >= 0),   -- paisa
  top_name    text not null default '',
  top_slug    text not null default '',
  lang        text not null default 'bn',
  touched_at  timestamptz not null default now(),
  reminded_at timestamptz
);

create index if not exists idx_bag_snapshots_due
  on public.bag_snapshots (touched_at)
  where count > 0;

alter table public.bag_snapshots enable row level security;

do $$ begin raise notice 'BAG SNAPSHOTS OK'; end $$;

commit;

-- ==== Feature: review stamps (202609270004) ====
-- 202609270004_review_stamps.sql — "রিভিউ লিখুন, স্ট্যাম্প পান" (UX plan §4/§7, R10).
--
-- The Smart Card counted orders only. Now an APPROVED review of a piece the
-- shopper really bought (a delivered order on that phone containing the
-- product — the same proof the "verified purchase" badge needs) earns one
-- stamp, written to a ledger when staff approve it.
--
--   • reviews.customer_phone / reviews.order_ref — who wrote it, proven at
--     submission (never trusted from the form alone);
--   • stamp_ledger — one row per stamp that is not an order; unique
--     (kind, ref_id) so approving → hiding → approving never pays twice;
--   • the card's count = non-cancelled orders + ledger rows for the phone;
--   • service-role only (RLS on, no policies).

begin;

alter table public.reviews
  add column if not exists customer_phone text,
  add column if not exists order_ref text;

create index if not exists idx_reviews_customer_phone
  on public.reviews (customer_phone)
  where customer_phone is not null;

create table if not exists public.stamp_ledger (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  kind       text not null default 'review' check (kind in ('review')),
  ref_id     uuid not null,
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);

create index if not exists idx_stamp_ledger_phone on public.stamp_ledger (phone);

alter table public.stamp_ledger enable row level security;

do $$ begin raise notice 'REVIEW STAMPS OK'; end $$;

commit;

-- ==== Feature: shop follows (202609280001) ====
-- ============================================================================
-- B1 (2026-09-28): shop follows — "tell me when this shop has something new".
-- ============================================================================
-- The storefront already had a per-product ask (stock_watches: "call me when
-- THIS is back") and a customer push pipeline. What was missing is the
-- shop-level version: a shopper who liked a shop had no way to hear about the
-- next drop, so every new product started from zero reach.
--
-- Honesty, same as the rest of the platform: there is no SMS/email sender, and
-- push only works for a phone that opted in. A follow row is therefore a
-- promise to TRY: the shop's new product pushes to every follower whose phone
-- has a device subscribed, and the rest stay on the shop's call list in
-- /vendor (a real number to dial), never a silently-dropped message.
--
-- `marketing_ok` is the shopper's own choice on the card: asked for the news
-- (true) or only order updates (false — the follow is then only useful for
-- keeping the shop's follower count honest, and the shop is told so).
--
-- Additive + idempotent.
-- ============================================================================

begin;

create table if not exists shop_follows (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references shops (id) on delete cascade,
  phone             text not null check (phone ~ '^[0-9]{11}$'),
  -- The shopper ticked "send me new-product news" on the follow card.
  marketing_ok      boolean not null default true,
  -- When this follower was last reached (push delivered or handed to staff).
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (shop_id, phone)
);

create index if not exists idx_shop_follows_shop on shop_follows (shop_id);
create index if not exists idx_shop_follows_phone on shop_follows (phone);

alter table shop_follows enable row level security;

-- The storefront never writes this table directly: /api/shop-follow uses the
-- service role. The insert policy exists so a hand-pasted insert from a
-- customer session is still format-checked.
drop policy if exists "shop follow public insert" on shop_follows;
create policy "shop follow public insert" on shop_follows
  for insert with check (phone ~ '^[0-9]{11}$');

-- A shop reads its own followers (the "N followers + who to call" list on
-- /vendor); the same `ps_vendor_shop()` helper the ledger uses. Staff read
-- everything for support. The announcement fan-out itself runs on the
-- service role, because customer_push_subscriptions has no policies.
drop policy if exists "shop follows vendor read" on shop_follows;
create policy "shop follows vendor read" on shop_follows
  for select using (shop_id = ps_vendor_shop());
drop policy if exists "shop follows admin all" on shop_follows;
create policy "shop follows admin all" on shop_follows
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;

-- ==== Feature: review replies (202609280002) ====
-- ============================================================================
-- B2 (2026-09-28): the shop's reply on a review.
-- ============================================================================
-- Until now a review was a one-way message: a shopper could say "the sleeve was
-- short", the shop could see it on its dashboard (RLS already let a vendor read
-- reviews of its own products) and had no way to answer. The public page showed
-- the complaint with no answer next to it.
--
-- Three columns, one per reply: the text, when it was last written, and which
-- account wrote it (audit — a shop with staff accounts will one day have more
-- than one person behind the counter).
--
-- Vendors may edit ONLY these columns, and only on their own reviews: the
-- `reviews vendor reply own` policy scopes the row, and the guard trigger
-- below rejects any other column change, so a vendor calling Supabase
-- directly (anon key + JWT) hits the same wall as the API.
--
-- Additive + idempotent.
-- ============================================================================

begin;

alter table reviews
  add column if not exists vendor_reply    text,
  add column if not exists vendor_reply_at timestamptz,
  add column if not exists vendor_reply_by text;

-- A reply is a sentence, not an essay; and an empty string is "no reply",
-- so it is never stored (null instead).
alter table reviews drop constraint if exists reviews_vendor_reply_len;
alter table reviews add constraint reviews_vendor_reply_len
  check (vendor_reply is null or char_length(vendor_reply) between 3 and 1200);

create index if not exists idx_reviews_unanswered
  on reviews (shop_id)
  where status = 'approved' and vendor_reply is null;

-- Vendors: update their own reviews (the policy), but see the trigger.
drop policy if exists "reviews vendor reply own" on reviews;
create policy "reviews vendor reply own" on reviews
  for update using (shop_id = ps_vendor_shop())
  with check (shop_id = ps_vendor_shop());

create or replace function ps_guard_review_vendor_update()
returns trigger language plpgsql as $$
begin
  -- Staff moderation carries on untouched (ps_is_admin() is the same helper
  -- the RLS policies use).
  if (select ps_is_admin()) then
    return new;
  end if;
  if new.id          is distinct from old.id
     or new.shop_id     is distinct from old.shop_id
     or new.product_id  is distinct from old.product_id
     or new.customer_id is distinct from old.customer_id
     or new.author      is distinct from old.author
     or new.rating      is distinct from old.rating
     or new.title       is distinct from old.title
     or new.body        is distinct from old.body
     or new.status      is distinct from old.status
     or new.verified    is distinct from old.verified
     or new.featured    is distinct from old.featured
  then
    raise exception 'a shop may only write its reply on a review (migration 202609280002)';
  end if;
  -- The timestamp is the database's, never the client's.
  if new.vendor_reply is distinct from old.vendor_reply then
    new.vendor_reply_at := now();
    if new.vendor_reply is null then
      new.vendor_reply_by := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_review_vendor_update on reviews;
create trigger trg_guard_review_vendor_update
  before update on reviews
  for each row execute function ps_guard_review_vendor_update();

commit;

