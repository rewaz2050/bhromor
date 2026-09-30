-- C6 — shop-owned product subcategories. The top-level taxonomy remains
-- platform-owned (`public.categories`); this table is a shop's own list of
-- suggestions beneath one of those platform categories. Products continue to
-- store the chosen name in their existing `subcategory` text field, so a
-- vendor-defined list does not change catalog shape or public URLs.

begin;

create table if not exists public.shop_product_categories (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  category_id text not null references public.categories (id) on delete restrict,
  name        text not null check (length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);

create unique index if not exists uq_shop_product_categories_name
  on public.shop_product_categories (shop_id, category_id, lower(name));

create index if not exists idx_shop_product_categories_shop_parent
  on public.shop_product_categories (shop_id, category_id, created_at);

alter table public.shop_product_categories enable row level security;
alter table public.shop_product_categories force row level security;
revoke all on public.shop_product_categories from anon, authenticated;
grant select, insert on public.shop_product_categories to authenticated;

-- Vendors only read and add suggestions for their own shop. The API repeats
-- validation for good messages; RLS is the authority if someone calls SQL.
drop policy if exists "vendors read own product categories" on public.shop_product_categories;
create policy "vendors read own product categories"
  on public.shop_product_categories for select to authenticated
  using (shop_id = (select public.ps_vendor_shop()));

drop policy if exists "vendors add own product categories" on public.shop_product_categories;
create policy "vendors add own product categories"
  on public.shop_product_categories for insert to authenticated
  with check (
    shop_id = (select public.ps_vendor_shop())
    and exists (
      select 1 from public.categories c
       where c.id = category_id and c.active
    )
  );

commit;
