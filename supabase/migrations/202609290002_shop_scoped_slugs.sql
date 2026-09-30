-- C5 — a product slug belongs to the shop that sells the piece.
--
-- Two shops both sell "Premium Cotton Panjabi". Before this migration the SECOND
-- shop could not add it at all: `products.slug` was unique across every shop
-- (it comes from the single-shop schema), so the name was refused for a name
-- that shop had never used, and the create path quietly renamed it to
-- "premium-cotton-panjabi-2" — an address nobody would type or share.
--
-- Since C5 the storefront address carries the shop (`/shops/<shop>/p/<piece>`),
-- so a slug only has to be unique inside the shop that owns the piece. SKU stays
-- unique platform-wide: it is the code the warehouse, the payout report and the
-- CSV import count by.
--
-- One consequence is handled here: `storefront_saved_items` remembered a saved
-- piece by slug alone. Once two shops may share a slug, "the saved
-- cotton-panjabi" would light up the other shop's piece too — so the row now
-- also carries the product id, which is what identifies a piece everywhere
-- else (reviews, price watches, stock watches and orders all key on id).

begin;

-- 1. Drop the platform-wide unique on slug, whatever it was named when this
--    database was built (inline `unique` in the original schema, an explicit
--    constraint elsewhere), and replace it with (shop_id, slug).
do $$
declare
  v_conname text;
begin
  for v_conname in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'products'
       and con.contype = 'u'
       and array_length(con.conkey, 1) = 1
       and exists (
         select 1
           from pg_attribute att
          where att.attrelid = con.conrelid
            and att.attnum = con.conkey[1]
            and att.attname = 'slug'
       )
  loop
    execute format('alter table public.products drop constraint %I', v_conname);
  end loop;
end $$;

alter table public.products
  add constraint products_shop_id_slug_key unique (shop_id, slug);

-- 2. Saved items remember the piece itself, not only its name.
alter table public.storefront_saved_items
  add column if not exists product_id uuid
    references public.products (id) on delete cascade;

-- Backfill what is already saved: every saved slug was unique when it was
-- written, so the piece it meant is the only piece carrying that slug.
update public.storefront_saved_items s
   set product_id = p.id
  from public.products p
 where s.product_id is null
   and p.slug = s.product_slug;

create index if not exists idx_saved_items_product
  on public.storefront_saved_items (product_id);

-- Saving the same piece twice under two spellings is still one saved piece.
-- Replace the old (customer_id, product_slug) primary key: it prevented a
-- customer from saving two shops' pieces with the same name. PostgreSQL's
-- default UNIQUE semantics allow multiple NULL product_ids, which keeps legacy
-- slug-only rows valid while making every new product-id pair unique.
do $$
declare
  v_pk text;
begin
  select conname into v_pk
    from pg_constraint
   where conrelid = 'public.storefront_saved_items'::regclass
     and contype = 'p';
  if v_pk is not null then
    execute format('alter table public.storefront_saved_items drop constraint %I', v_pk);
  end if;
end $$;

alter table public.storefront_saved_items
  add constraint storefront_saved_items_customer_product_key
  unique (customer_id, product_id);

commit;
