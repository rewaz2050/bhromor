-- Standalone migration: works with or without the legacy schema.sql catalogue.
-- Product slugs bridge the current typed catalogue and future UUID products.
-- Do not grant customer access to the demo admin authentication.
begin;
create table if not exists public.storefront_saved_items (
  customer_id uuid not null references auth.users(id) on delete cascade,
  product_slug text not null check (length(product_slug) between 1 and 160 and product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  primary key (customer_id, product_slug)
);
alter table public.storefront_saved_items enable row level security;
alter table public.storefront_saved_items force row level security;
revoke all on public.storefront_saved_items from anon, authenticated;
grant select, insert, delete on public.storefront_saved_items to authenticated;

drop policy if exists "saved items owner read" on public.storefront_saved_items;
create policy "saved items owner read" on public.storefront_saved_items for select to authenticated using ((select auth.uid()) = customer_id);
drop policy if exists "saved items owner insert" on public.storefront_saved_items;
create policy "saved items owner insert" on public.storefront_saved_items for insert to authenticated with check ((select auth.uid()) = customer_id);
drop policy if exists "saved items owner delete" on public.storefront_saved_items;
create policy "saved items owner delete" on public.storefront_saved_items for delete to authenticated using ((select auth.uid()) = customer_id);
-- No UPDATE privilege: imports use INSERT ON CONFLICT DO NOTHING.
commit;
