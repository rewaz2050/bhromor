-- ============================================================================
-- P2 #1 (2026-09-14): real sales per product — the Best Sellers data source.
--
-- docs/storefront-phase-two.md deferred the sales ranking on purpose:
-- "Connect a server-side aggregate of eligible sales by product ID,
-- excluding cancelled/refunded units, before displaying a sales ranking."
-- This is that aggregate. No app code can display a ranking it cannot
-- prove from the orders table.
--
-- Definition of "eligible units" (the honest one):
--   + units on every NON-CANCELLED order (any stage: pending…delivered —
--     a placed order is a real order; a cancelled one never was),
--   − units on return orders the shop has actually completed
--     (return_status = 'refunded') — the item came back to the shelf.
-- A return that is still in flight (requested/approved/picked_up) does not
-- subtract yet: the item has not been proven back, so the sale still stands.
-- A rejected (cancelled) return subtracts nothing — correct, the item
-- stayed with the customer.
-- ============================================================================

begin;

create or replace view v_product_sales as
select oi.product_id,
       greatest(
         0,
         coalesce(sum(oi.qty) filter (where o.is_return is distinct from true), 0)
           - coalesce(sum(oi.qty) filter (where o.is_return = true
                                          and o.return_status = 'refunded'), 0)
       ) as units_sold
from order_items oi
join orders o on o.id = oi.order_id
where o.status <> 'cancelled'
group by oi.product_id;

comment on view v_product_sales is
  'Eligible units sold per product: non-cancelled order units minus refunded return units. P2 #1 best-sellers source.';

-- The storefront reads it through the service-role API only; there is no
-- public read policy (same convention as every other table in this schema).
grant select on v_product_sales to service_role;

commit;
