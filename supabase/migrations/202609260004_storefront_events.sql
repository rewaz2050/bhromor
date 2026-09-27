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
