-- ============================================================================
-- Shop-wise funnel (2026-09-28) — B4 of the shop-service upgrade
--
-- Admin → Reports already has the whole-market funnel (202609260004). This is
-- the same idea, scoped to ONE shop, for that shop's own dashboard: how many
-- people opened its storefront, looked at a product, put one in the bag,
-- started checkout, and how many orders really happened.
--
--   * `storefront_events` already carries shop_id (the product-level events
--     sent it from day one). Two gaps closed here:
--       1. historical rows that have a product_id but no shop_id are backfilled
--          from `products` — attribution we can prove, nothing guessed;
--       2. a `page_view` of a shop's storefront now carries the shop id too
--          (client: ShopAttribute + lib/page-shop.ts), which is what makes
--          "opened my page" countable at all.
--   * `ps_shop_funnel_report(p_shop_id, p_days)` — one JSON blob per shop:
--     sessions, page views, the four step counts, real orders/revenue/AOV from
--     `orders` (cancelled and return orders excluded), where the add-to-bags
--     came from, and the shop's own top products by views → adds → orders.
--     The function is scoped to the shop id it is GIVEN; the API passes the
--     shop id of the verified vendor session, never a client-supplied one.
--
-- Privacy: nothing personal exists in storefront_events (anonymous per-tab
-- session id only) and this function adds no new exposure. RLS on the table is
-- untouched — no policies, no grants to anon/authenticated — so the report is
-- reachable only through the service role (the vendor API route, after
-- requireVendor has proved who is asking).
--
-- Idempotent — safe to re-run. Expect "SHOP FUNNEL OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Attribution backfill (provable only: product_id -> products.shop_id)
-- ---------------------------------------------------------------------------
update public.storefront_events e
   set shop_id = p.shop_id::text
  from public.products p
 where e.shop_id is null
   and e.product_id is not null
   and p.id::text = e.product_id
   and p.shop_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Index for the per-shop reads (the table keeps its 90-day retention)
-- ---------------------------------------------------------------------------
create index if not exists storefront_events_shop_idx
  on public.storefront_events (shop_id, event, created_at desc)
  where shop_id is not null;

-- ---------------------------------------------------------------------------
-- 3. The per-shop report
-- ---------------------------------------------------------------------------
create or replace function public.ps_shop_funnel_report(
  p_shop_id text,
  p_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id text := nullif(btrim(coalesce(p_shop_id, '')), '');
  v_days int := least(greatest(coalesce(p_days, 7), 1), 90);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
  v_shop_page_views bigint;
  v_sessions bigint;
  v_pdp bigint;
  v_atc bigint;
  v_checkout bigint;
  v_purchase bigint;
  v_orders bigint;
  v_revenue bigint;
  v_units bigint;
  v_atc_by_source jsonb;
  v_top_products jsonb;
begin
  -- No shop id = nothing to report (never another shop's numbers).
  if v_shop_id is null then
    return jsonb_build_object('days', v_days, 'shop_id', null, 'sessions', 0, 'page_views', 0,
      'pdp_sessions', 0, 'atc_sessions', 0, 'checkout_sessions', 0, 'purchase_sessions', 0,
      'orders', 0, 'revenue', 0, 'aov', null, 'units', 0, 'atc_by_source', '[]'::jsonb,
      'top_products', '[]'::jsonb);
  end if;

  select
    count(*) filter (where event = 'page_view'),
    count(distinct session_id),
    count(distinct session_id) filter (where event = 'view_item'),
    count(distinct session_id) filter (where event = 'add_to_cart'),
    count(distinct session_id) filter (where event = 'begin_checkout'),
    count(distinct session_id) filter (where event = 'purchase')
    into v_shop_page_views, v_sessions, v_pdp, v_atc, v_checkout, v_purchase
  from public.storefront_events
  where created_at >= v_since
    and shop_id = v_shop_id;

  -- Real money from `orders`, not the client ping (same rule as the market
  -- report): cancelled and return orders are not a sale.
  select count(*), coalesce(sum(o.total), 0)
    into v_orders, v_revenue
  from public.orders o
  where o.created_at >= v_since
    and o.shop_id::text = v_shop_id
    and o.status <> 'cancelled'
    and not coalesce(o.is_return, false);

  -- Pieces really sold (from order_items, so partial/returned lines are not
  -- counted as sales).
  select coalesce(sum(oi.qty), 0)
    into v_units
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.created_at >= v_since
    and o.shop_id::text = v_shop_id
    and o.status <> 'cancelled'
    and not coalesce(o.is_return, false);

  select coalesce(jsonb_agg(jsonb_build_object('source', source, 'count', n) order by n desc), '[]'::jsonb)
    into v_atc_by_source
  from (
    select coalesce(nullif(source, ''), 'other') as source, count(*) as n
    from public.storefront_events
    where created_at >= v_since
      and shop_id = v_shop_id
      and event = 'add_to_cart'
    group by 1
  ) s;

  -- The shop's own products: looked at, added, and actually ordered. Views and
  -- adds come from the events (text product ids), orders from order_items of
  -- this shop's orders in the window — three honest numbers per product, so
  -- "seen a lot, never bought" is visible instead of guessed.
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', product_id,
           'name', name,
           'slug', slug,
           'views', views,
           'adds', adds,
           'orders', orders)
         order by views desc, adds desc, name), '[]'::jsonb)
    into v_top_products
  from (
    select
      coalesce(p.id::text, ev.product_id) as product_id,
      coalesce(nullif(p.name_bn, ''), p.name, '(removed product)') as name,
      p.slug as slug,
      ev.views,
      ev.adds,
      coalesce(ord.orders, 0) as orders
    from (
      select product_id,
             count(*) filter (where event = 'view_item') as views,
             count(*) filter (where event = 'add_to_cart') as adds
      from public.storefront_events
      where created_at >= v_since
        and shop_id = v_shop_id
        and product_id is not null
      group by product_id
    ) ev
    left join public.products p on p.id::text = ev.product_id
    left join (
      select oi.product_id::text as product_id, count(distinct oi.order_id) as orders
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.created_at >= v_since
        and o.shop_id::text = v_shop_id
        and o.status <> 'cancelled'
        and not coalesce(o.is_return, false)
        and oi.product_id is not null
      group by 1
    ) ord on ord.product_id = ev.product_id
    order by ev.views desc, ev.adds desc
    limit 10
  ) t;

  return jsonb_build_object(
    'days', v_days,
    'shop_id', v_shop_id,
    'sessions', v_sessions,
    'page_views', v_shop_page_views,
    'pdp_sessions', v_pdp,
    'atc_sessions', v_atc,
    'checkout_sessions', v_checkout,
    'purchase_sessions', v_purchase,
    'orders', v_orders,
    'revenue', v_revenue,
    'aov', case when v_orders > 0 then (v_revenue / v_orders) else null end,
    'units', v_units,
    'atc_by_source', v_atc_by_source,
    'top_products', v_top_products
  );
end;
$$;

revoke execute on function public.ps_shop_funnel_report(text, int) from public, anon, authenticated;

commit;

do $$ begin raise notice 'SHOP FUNNEL OK'; end $$;
