-- ============================================================================
-- P1 #14 (2026-09-14): warranty claims on accessory products.
--
-- Warranty is a shop-managed PRODUCT attribute (products.warranty_days), set
-- on the items the shop actually warrants — accessories today (caps, shawls,
-- bags as the catalog grows). Nothing is warranted by default: a product
-- without warranty_days has no claim path, and the UI says nothing about it.
--
-- A claim is order-bound (warranty covers what you bought, from the proven
-- delivery moment) and one per order+product while live. The shop decides
-- (review → approve/reject with a note the customer sees); what happens
-- after approval — a replacement or a refund — is the shop's offline
-- handling, which the claim's resolution note records.
-- ============================================================================

begin;

-- Warranty period per product (days). Null = no warranty on this item.
alter table products
  add column if not exists warranty_days int
  check (warranty_days is null or warranty_days between 1 and 365);

create table if not exists warranty_claims (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders (id) on delete cascade,
  product_id     uuid not null references products (id) on delete cascade,
  customer_name  text not null,
  customer_phone text not null,
  problem        text not null check (char_length(problem) between 5 and 2000),
  status         text not null default 'submitted'
                 check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  resolution     text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
create index if not exists idx_warranty_claims_order on warranty_claims (order_id);
create index if not exists idx_warranty_claims_product on warranty_claims (product_id);

-- At most ONE live claim per order+item (a later claim is only possible
-- after a rejection). The app checks ps_warranty_eligible first; this index
-- makes the one-live-claim rule true at the database level too, even under
-- double-taps (the API maps the conflict back to "already claimed").
create unique index if not exists uq_warranty_claims_live
  on warranty_claims (order_id, product_id)
  where status in ('submitted', 'under_review', 'approved');

-- The claim flows through the service-role APIs; staff read/write in the
-- admin surface. No public read — customers see their claim from the track
-- page, which reads through the same service-role lookup (order + phone).
alter table warranty_claims enable row level security;
drop policy if exists "admin all warranty claims" on warranty_claims;
create policy "admin all warranty claims" on warranty_claims
  for all using (ps_is_admin()) with check (ps_is_admin());

-- ---------------------------------------------------------------------------
-- Eligibility. NULL when the customer may claim; otherwise a reason code the
-- app maps to an honest message. The window runs warranty_days from the
-- proven 'delivered' history entry — the same source of truth as the
-- 7-day exchange window (P1 #13).
-- ---------------------------------------------------------------------------
create or replace function ps_warranty_eligible(p_order_id uuid, p_product_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from orders o where o.id = p_order_id and o.status = 'delivered'
    ) then 'not-delivered'
    when not exists (
      select 1 from order_items oi
      where oi.order_id = p_order_id and oi.product_id = p_product_id
    ) then 'not-in-order'
    when not exists (
      select 1 from products p where p.id = p_product_id and p.warranty_days is not null
    ) then 'no-warranty'
    when (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) is null then 'no-delivery-record'
    when now() > (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) + make_interval(days => (
      select warranty_days from products where id = p_product_id
    )) then 'window-expired'
    when exists (
      select 1 from warranty_claims c
      where c.order_id = p_order_id and c.product_id = p_product_id
        and c.status in ('submitted', 'under_review', 'approved')
    ) then 'already-claimed'
    else null
  end;
$$;

commit;
