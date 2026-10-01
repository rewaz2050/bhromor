-- ============================================================================
-- PROSANTI — FRESH PROJECT BOOTSTRAP (single paste)
-- Generated from schema.sql + the in-order migrations through
-- 202610010001 (every file in supabase/migrations/, chronologically;
-- append-only sections after the base chain carry their own banner).
--
-- WHEN TO USE THIS FILE:
--   Only on a FRESH Supabase project (no PROSANTI tables yet).
--   Run `supabase/diagnose.sql` first. If it says "ALL PRESENT" you do NOT
--   need this file — apply individual missing migrations instead.
--   NEVER re-run this on a database that already has the base tables.
--
-- HOW TO RUN:
--   1. Supabase Dashboard -> SQL Editor
--   2. Paste this ENTIRE file, press Run
--   3. It must finish with NO red error. If one statement fails the whole
--      file rolls back (nothing is saved) and the error names the cause —
--      usually "relation X does not exist" (wrong project) or a
--      "duplicate key" (partially applied already — use diagnose.sql).
--
-- SKIPPED on purpose (superseded by flat delivery, docs/go-live.md):
--   202609100001_simple_checkout_first10_free.sql
--   202609100002_full_checkout_first10_free.sql
--   202609100003_per_user_first10_free.sql
--   202609110005_launch_offer_free.sql
-- ============================================================================


-- ============================================================================
-- BASE SCHEMA  (source: supabase/schema.sql)
-- ============================================================================

-- =====================================================================
-- PROSANTI — Supabase schema (blueprint §41–46, §44 tables)
-- ---------------------------------------------------------------------
-- Generic commerce model: the platform is NOT a clothing schema. Tables
-- mirror the demo stores in src/lib/* exactly, so the UI already written
-- can read/write these rows through thin adapters.
--
-- Apply:  supabase db push   (or run inside the Supabase SQL editor)
-- RLS:    enabled everywhere; anon can read the published catalog and
--         write reviews; customers touch only their own orders/rows;
--         admin_users bypass via is_admin() (role-checked helpers).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums (blueprint §16, §34, §44)
-- ---------------------------------------------------------------------
create type ps_order_status as enum (
  'pending', 'confirmed', 'preparing', 'ready-for-pickup',
  'courier-assigned', 'out-for-delivery', 'delivered', 'cancelled'
);

create type ps_media_type as enum ('image', 'youtube', 'future_3d');

create type ps_review_status as enum ('pending', 'approved', 'hidden', 'flagged');

create type ps_user_role as enum ('customer', 'manager', 'admin', 'courier', 'super_admin');

-- Order happy-path flow positions (blueprint §34). Cancelled is handled
-- explicitly by the transition function, not the position list.
create table ps_order_flow (
  position    smallint primary key check (position between 0 and 6),
  status      ps_order_status unique not null
);
insert into ps_order_flow (position, status) values
  (0, 'pending'), (1, 'confirmed'), (2, 'preparing'),
  (3, 'ready-for-pickup'), (4, 'courier-assigned'),
  (5, 'out-for-delivery'), (6, 'delivered');

-- ---------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------

-- Staff users (blueprint §46 roles). auth.users owns identity.
create table admin_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       ps_user_role not null default 'admin',
  created_at timestamptz not null default now()
);

-- Customer profiles — optional at launch; orders may be guest checkout.
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  phone      text unique,
  area       text,
  created_at timestamptz not null default now()
);

-- Data-driven categories (§5) — id is a stable slug.
create table categories (
  id            text primary key,             -- e.g. 'men' or 'accessories'
  name          text not null,
  name_bn       text not null default '',
  tagline       text not null default '',
  image         text not null default '',
  subcategories text[] not null default '{}',
  sort_order    int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table products (
  id                uuid primary key default gen_random_uuid(),
  -- public fields
  slug              text unique not null,
  name              text not null,
  name_bn           text not null default '',
  sku               text unique not null,
  category_id       text not null references categories (id),
  subcategory       text not null default '',
  short_description text not null default '',
  description       text not null default '',
  details           jsonb not null default '[]',        -- [{label,value}]
  price             bigint not null check (price >= 0), -- paisa (§69)
  compare_at_price  bigint check (compare_at_price >= 0),
  -- merchandising
  featured          boolean not null default false,
  is_new            boolean not null default false,
  -- stock flags are derived from variants in production; kept for parity
  in_stock          boolean not null default true,
  low_stock         boolean not null default false,
  -- publishing (blueprint §73–74)
  status            text not null default 'draft' check (status in ('draft', 'published')),
  active            boolean not null default true,
  seo_title         text,
  seo_description   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Variants: SKU/price/stock per colour+size (blueprint §17, §57)
create table product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  color      text not null default '',
  size       text not null default '',
  sku        text unique,
  price      bigint not null check (price >= 0),
  stock      int not null default 0 check (stock >= 0),
  reserved   int not null default 0 check (reserved >= 0),
  available  int generated always as (stock - reserved) stored,
  active     boolean not null default true,
  unique (product_id, color, size)
);

-- Media references — binaries live in Cloudinary (§13, §48–49)
create table product_media (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  type       ps_media_type not null default 'image',
  url        text not null,
  public_id  text,                                    -- Cloudinary public id
  alt_text   text not null default '',
  sort_order int not null default 0,
  metadata   jsonb not null default '{}'
);

create table delivery_zones (
  id          text primary key,             -- 'z1'…
  name        text not null,
  areas       text[] not null default '{}',
  charge      bigint not null check (charge >= 0),    -- paisa
  eta_label   text not null default '45–50 min',
  sort_order  int not null default 0,
  active      boolean not null default true
);

create table coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  type          text not null check (type in ('percent', 'fixed')),
  value         bigint not null check (value >= 0),
  min_order     bigint not null default 0,
  category_id   text references categories (id),
  valid_from    timestamptz,
  valid_until   timestamptz,
  usage_limit   int,
  used          int not null default 0,
  active        boolean not null default true
);

-- Orders: guest-friendly; customer_id nullable. Human order number is
-- generated by trigger (§70) — internal id never shown publicly.
create table orders (
  id                uuid primary key default gen_random_uuid(),
  order_no          text unique,             -- PS-YYYYMMDD-NNNN
  customer_id       uuid references profiles (id),
  -- customer snapshot at purchase (§75)
  customer_name     text not null,
  customer_phone    text not null,
  area              text not null,
  address           text not null default '',
  note              text not null default '',
  zone_id           text not null references delivery_zones (id),
  subtotal          bigint not null check (subtotal >= 0),      -- paisa
  delivery_charge   bigint not null check (delivery_charge >= 0),
  discount          bigint not null default 0 check (discount >= 0),
  coupon_id         uuid references coupons (id),
  total             bigint not null check (total >= 0),
  payment           text not null default 'cod' check (payment in ('cod')),
  status            ps_order_status not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Item snapshots — price/name fixed at purchase time (§75)
create table order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,
  product_id uuid references products (id) on delete set null,   -- keep history
  variant_id uuid references product_variants (id) on delete set null,
  name       text not null,               -- snapshot
  sku        text not null,               -- snapshot
  variant    text not null default '',
  unit_price bigint not null,             -- snapshot paisa
  qty        int not null check (qty > 0)
);

-- Status history — append-only (§34, §76 audit-friendly)
create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id) on delete cascade,
  status      ps_order_status not null,
  note        text,
  changed_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);

create table reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  customer_id uuid references profiles (id),
  author     text not null,
  rating     int not null check (rating between 1 and 5),
  title      text,
  body       text not null,
  status     ps_review_status not null default 'pending',
  verified   boolean not null default false,   -- only with matching order (§30)
  featured   boolean not null default false,
  created_at timestamptz not null default now()
);

create table wishlists (
  id         uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (customer_id, product_id)
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient   uuid not null references auth.users (id) on delete cascade,
  kind        text not null default 'system',
  title       text not null,
  body        text not null default '',
  href        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table site_settings (
  key         text primary key,
  value       jsonb not null
);

create table homepage_sections (
  id          text primary key,
  title       text not null default '',
  content     jsonb not null default '{}',
  sort_order  int not null default 0,
  visible     boolean not null default true
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
create index idx_products_category   on products (category_id) where active;
create index idx_products_slug       on products (slug);
create index idx_products_featured   on products (featured) where active and status = 'published';
create index idx_variants_product    on product_variants (product_id);
create index idx_media_product       on product_media (product_id, sort_order);
create index idx_orders_created      on orders (created_at desc);
create index idx_orders_phone        on orders (customer_phone);
create index idx_orders_status       on orders (status);
create index idx_order_items_order   on order_items (order_id);
create index idx_history_order       on order_status_history (order_id, created_at);
create index idx_reviews_product     on reviews (product_id, status);
create index idx_notifs_recipient    on notifications (recipient, read);

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function ps_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_products_touch before update on products
  for each row execute function ps_touch_updated();
create trigger trg_orders_touch before update on orders
  for each row execute function ps_touch_updated();

-- ---------------------------------------------------------------------
-- Public order numbers (§70): PS-YYYYMMDD-NNNN
-- ---------------------------------------------------------------------
create sequence ps_order_seq;

create or replace function ps_assign_order_no()
returns trigger language plpgsql as $$
declare
  day_tag text := to_char(new.created_at, 'YYYYMMDD');
  seq_no  int;
begin
  seq_no := nextval('ps_order_seq') % 10000;
  new.order_no := 'PS-' || day_tag || '-' || lpad(seq_no::text, 4, '0');
  return new;
end $$;

create trigger trg_orders_number before insert on orders
  for each row when (new.order_no is null)
  execute function ps_assign_order_no();

-- ---------------------------------------------------------------------
-- Order status state machine (§34) — enforced at the database level.
-- History row is written by the same trigger that validates the move.
-- ---------------------------------------------------------------------
create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null or v_to_pos <> v_from_pos + 1 then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  update orders set status = p_to, updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- Security helpers & RLS
-- ---------------------------------------------------------------------
create or replace function ps_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_users
    where id = auth.uid()
      and role in ('admin', 'super_admin', 'manager')
  );
$$;

create or replace function ps_public_customer()
returns uuid language sql stable as $$
  select auth.uid();
$$;

alter table admin_users         enable row level security;
alter table profiles            enable row level security;
alter table categories          enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table product_media       enable row level security;
alter table delivery_zones      enable row level security;
alter table coupons             enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_status_history enable row level security;
alter table reviews             enable row level security;
alter table wishlists           enable row level security;
alter table notifications       enable row level security;
alter table site_settings       enable row level security;
alter table homepage_sections   enable row level security;
alter table ps_order_flow       enable row level security;

-- Catalog: anyone may read the live storefront data.
create policy "catalog public read" on products
  for select using (status = 'published' and active);
create policy "catalog public read variants" on product_variants
  for select using (exists (
    select 1 from products p
    where p.id = product_variants.product_id
      and p.status = 'published' and p.active));
create policy "catalog public read media" on product_media
  for select using (exists (
    select 1 from products p
    where p.id = product_media.product_id
      and p.status = 'published' and p.active));
create policy "categories public read" on categories
  for select using (active);
create policy "zones public read" on delivery_zones
  for select using (active);
create policy "flow public read" on ps_order_flow
  for select using (true);

-- Staff role lookup: requireStaff() reads its own admin_users row through
-- the user's JWT. RLS with no policy denies everything, so without this
-- policy no staff login works at all. ps_is_admin() is security definer,
-- so this does not recurse. Writes stay service-role-only (no write
-- policy): staff grants/revokes go through the gated /api/admin/staff
-- endpoints, never direct client writes.
create policy "staff read roles" on admin_users
  for select using (ps_is_admin());

-- Admin full access (staff bypasses the restrictive policies above).
create policy "admin all products" on products
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all categories" on categories
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all zones" on delivery_zones
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all coupons" on coupons
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all orders" on orders
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all order items" on order_items
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all history" on order_status_history
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all variants/media" on product_variants
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all product media" on product_media
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all reviews" on reviews
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all notifications" on notifications
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all settings" on site_settings
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all homepage" on homepage_sections
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "admin all profiles" on profiles
  for all using (ps_is_admin()) with check (ps_is_admin());

-- Customers: their own profile + orders + wishlist + notifications.
create policy "own profile" on profiles
  for select using (id = auth.uid());
create policy "own orders" on orders
  for select using (customer_id = ps_public_customer() or customer_phone = coalesce(
    (select phone from profiles where id = auth.uid()), ''));
create policy "own order items" on order_items
  for select using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and (o.customer_id = ps_public_customer() or ps_is_admin())));
create policy "own wishlist" on wishlists
  for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "own notifications" on notifications
  for select using (recipient = auth.uid());

-- Reviews: approved are public; customers may add; staff moderate.
create policy "reviews public read" on reviews
  for select using (status = 'approved');
create policy "reviews customer insert" on reviews
  for insert with check (auth.uid() is not null or customer_id is null);

-- ---------------------------------------------------------------------
-- New-user trigger: any authenticated user gets a profile row.
-- ---------------------------------------------------------------------
create or replace function ps_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), null)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_profiles_on_signup
  after insert on auth.users
  for each row execute function ps_handle_new_user();

-- ============================================================================
-- MIGRATION 1/23 — storefront saved items  (source: supabase/migrations/202609080001_storefront_saved_items.sql)
-- ============================================================================

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

-- ============================================================================
-- MIGRATION 2/23 — order guards (4-digit delivery PIN)  (source: supabase/migrations/202609080002_order_guards.sql)
-- ============================================================================

-- Backend phase 1: order hardening on top of supabase/schema.sql.
-- The API already prices orders in TypeScript; these guards make the
-- database the second line of defence so no writer can store totals that
-- do not add up, non-COD payments, or non-pending initial states.
begin;

-- 1. Totals must reconcile: total = subtotal - discount + delivery_charge.
create or replace function ps_check_order_totals()
returns trigger language plpgsql as $$
begin
  if new.discount > new.subtotal then
    raise exception 'discount (%) exceeds subtotal (%)', new.discount, new.subtotal;
  end if;
  if new.total <> new.subtotal - new.discount + new.delivery_charge then
    raise exception 'order total does not reconcile';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_totals on orders;
create trigger trg_orders_check_totals
  before insert or update on orders
  for each row execute function ps_check_order_totals();

-- 2. Launch policy: guest checkout creates pending COD orders only (§20–21).
create or replace function ps_check_order_insert()
returns trigger language plpgsql as $$
begin
  if new.status <> 'pending' then
    raise exception 'orders must be created pending';
  end if;
  if new.payment <> 'cod' then
    raise exception 'only cash on delivery is enabled';
  end if;
  if length(trim(new.customer_name)) < 2 then
    raise exception 'customer name is required';
  end if;
  if length(trim(new.area)) < 2 then
    raise exception 'delivery area is required';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_insert on orders;
create trigger trg_orders_check_insert
  before insert on orders
  for each row execute function ps_check_order_insert();

-- 3. Atomic coupon usage with limit guard. Called by the order API with the
-- service role after the discount is snapshotted onto the order. Anonymous
-- clients have no INSERT on orders, so the only reachable path is the API.
create or replace function ps_use_coupon(p_coupon_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_used int;
  v_limit int;
begin
  select used, usage_limit into v_used, v_limit
  from coupons where id = p_coupon_id for update;
  if not found then
    raise exception 'coupon not found';
  end if;
  if v_limit is not null and v_used >= v_limit then
    raise exception 'coupon usage limit reached';
  end if;
  update coupons set used = v_used + 1 where id = p_coupon_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 3/23 — ps_place_order v1 + ps_setting_int  (source: supabase/migrations/202609080003_place_order_rpc.sql)
-- ============================================================================

-- Backend phase 2: atomic checkout + stock release on cancel.
--
-- ps_place_order() runs the whole placement inside ONE transaction: zone /
-- product / variant / coupon validation, row-locked stock reservation,
-- coupon increment, order + snapshots + history. Concurrent checkouts for
-- the last unit serialise on the variant row instead of over-selling.
-- The API still validates in TypeScript first (friendly field errors);
-- this function is the authoritative second pass that money trusts.
begin;

-- site_settings integer reader with a fallback default.
create or replace function ps_setting_int(p_key text, p_default bigint)
returns bigint language sql stable as $$
  select coalesce(
    (select (value #>> '{}')::bigint from site_settings where key = p_key),
    p_default
  );
$$;

create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line and reserve variant stock under row locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    else
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 200000);
  if v_subtotal >= v_free_threshold then
    v_charge := 0;
  else
    v_charge := v_zone.charge;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed via storefront checkout');

  return v_order_id;
end $$;

-- Cancelling releases the reserved units back to the shelf.
create or replace function ps_release_on_cancel()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update product_variants v
    set reserved = greatest(0, v.reserved - oi.qty)
    from order_items oi
    where oi.order_id = new.id
      and oi.variant_id is not null
      and oi.variant_id = v.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_release_on_cancel on orders;
create trigger trg_orders_release_on_cancel
  after update on orders
  for each row execute function ps_release_on_cancel();

commit;

-- ============================================================================
-- MIGRATION 4/23 — marketplace shops  (source: supabase/migrations/202609090004_marketplace_shops.sql)
-- ============================================================================

-- Marketplace phase 2, slice 1: shops + vendor roles + ledger skeleton.
--
-- New tables: shops, vendor_users, shop_ledger, shop_payouts.
-- Links products / orders / reviews to their shop (backfilled to shop #1,
-- the owner's own catalog) and teaches ps_place_order the single-shop rule:
-- one order = one active, open shop serving the order's zone.
-- No UI in this slice; the admin Shops queue + vendor dashboard follow.
begin;

-- ----------------------------------------------------------------
-- shops: a listed storefront tenant.
-- ----------------------------------------------------------------
create table shops (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,              -- e.g. 'prosanti-direct'; seed key + future URL
  name           text not null,
  tagline        text not null default '',
  logo_url       text not null default '',
  phone          text not null,
  contact_email  text not null default '',  -- applicant email; vendor link key at approval
  address        text not null default '',
  zone_ids       text[] not null default '{}',      -- delivery_zones served
  prep_minutes   int not null default 15,
  commission_pct numeric(5,2) not null default 15.00,
  status         text not null default 'pending'
                 check (status in ('pending','active','suspended')),
  is_open        boolean not null default false,    -- vendor toggles daily
  rating_avg     numeric(3,2) not null default 0,
  rating_count   int not null default 0,
  created_at     timestamptz not null default now()
);

-- Vendor staff. Separate from admin_users: different powers, different RLS.
create table vendor_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  shop_id    uuid not null references shops (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

-- Settlement ledger. One row per delivered order's shop share.
-- Written by the ledger writer (slice 5); vendors read, nobody edits.
create table shop_ledger (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops (id),
  order_id   uuid not null references orders (id),
  subtotal   int not null,   -- paisa, items only
  commission int not null,   -- paisa, platform cut
  payable    int not null,   -- paisa, subtotal - commission
  created_at timestamptz not null default now(),
  unique (order_id)
);

-- Manual payout batches (weekly report + bank/bKash transfer, recorded here).
create table shop_payouts (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops (id),
  amount     int not null,   -- paisa actually transferred
  method     text not null default 'bank', -- bank|bkash|cash
  reference  text not null default '',
  paid_at    timestamptz not null default now(),
  paid_by    uuid references auth.users (id)
);

-- ----------------------------------------------------------------
-- links: every product / order / review belongs to exactly one shop.
-- ----------------------------------------------------------------
alter table products add column shop_id uuid references shops (id);
alter table orders   add column shop_id uuid references shops (id);
alter table reviews  add column shop_id uuid references shops (id);

-- Shop #1: the owner's own catalog. Zone list = every seeded zone.
-- Owner renames via Admin → Shops (slice 2) once D9 is decided.
insert into shops (slug, name, phone, zone_ids, status, is_open)
select 'prosanti-direct', 'PROSANTI Direct', '',
  coalesce((select array_agg(id) from delivery_zones), '{}'),
  'active', true
where not exists (select 1 from shops where slug = 'prosanti-direct');

update products set shop_id = (select id from shops where slug = 'prosanti-direct')
where shop_id is null;
update orders set shop_id = (select id from shops where slug = 'prosanti-direct')
where shop_id is null;
update reviews r set shop_id = p.shop_id
from products p where r.product_id = p.id and r.shop_id is null;

alter table products alter column shop_id set not null;
alter table orders   alter column shop_id set not null;
alter table reviews  alter column shop_id set not null;

create index idx_products_shop on products (shop_id);
create index idx_orders_shop   on orders (shop_id);
create index idx_reviews_shop  on reviews (shop_id);

-- New reviews always inherit the product's shop (API never sets this).
create or replace function ps_reviews_set_shop()
returns trigger language plpgsql as $$
begin
  select p.shop_id into new.shop_id from products p where p.id = new.product_id;
  return new;
end $$;

drop trigger if exists trg_reviews_set_shop on reviews;
create trigger trg_reviews_set_shop
  before insert on reviews
  for each row execute function ps_reviews_set_shop();

-- Shop ratings follow APPROVED reviews only; new shops start at 0.
create or replace function ps_refresh_shop_rating()
returns trigger language plpgsql as $$
declare target uuid;
begin
  target := coalesce(new.shop_id, old.shop_id);
  update shops s
  set rating_avg = coalesce(
        (select round(avg(r.rating)::numeric, 2) from reviews r
         where r.shop_id = target and r.status = 'approved'), 0),
      rating_count = coalesce(
        (select count(*) from reviews r
         where r.shop_id = target and r.status = 'approved'), 0)
  where s.id = target;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_reviews_refresh_shop_rating on reviews;
create trigger trg_reviews_refresh_shop_rating
  after insert or update of status or delete on reviews
  for each row execute function ps_refresh_shop_rating();

-- ----------------------------------------------------------------
-- RLS: public reads active shops; staff full; vendors own-shop only.
-- ----------------------------------------------------------------
alter table shops        enable row level security;
alter table vendor_users enable row level security;
alter table shop_ledger  enable row level security;
alter table shop_payouts enable row level security;

-- Caller's shop (null when not a vendor). Security definer so the
-- vendor_users policy can't recurse into itself.
create or replace function ps_vendor_shop()
returns uuid language sql stable security definer set search_path = public as $$
  select shop_id from vendor_users where user_id = auth.uid();
$$;

-- shops: storefront reads active rows; vendors read + update their own
-- (field whitelist is enforced in the API, not here).
create policy "shops public read" on shops
  for select using (status = 'active');
create policy "shops vendor read own" on shops
  for select using (id = ps_vendor_shop());
create policy "shops vendor update own" on shops
  for update using (id = ps_vendor_shop())
  with check (id = ps_vendor_shop());
create policy "shops admin all" on shops
  for all using (ps_is_admin()) with check (ps_is_admin());

-- vendor_users: staff manage; vendors read their own row.
create policy "vendor_users self read" on vendor_users
  for select using (user_id = auth.uid());
create policy "vendor_users admin all" on vendor_users
  for all using (ps_is_admin()) with check (ps_is_admin());

-- shop_ledger: vendors read own rows; writes are service-role only
-- (no insert/update policy for anon/authenticated at all).
create policy "shop_ledger vendor read" on shop_ledger
  for select using (shop_id = ps_vendor_shop());
create policy "shop_ledger admin all" on shop_ledger
  for all using (ps_is_admin()) with check (ps_is_admin());

-- shop_payouts: same shape as the ledger.
create policy "shop_payouts vendor read" on shop_payouts
  for select using (shop_id = ps_vendor_shop());
create policy "shop_payouts admin all" on shop_payouts
  for all using (ps_is_admin()) with check (ps_is_admin());

-- ----------------------------------------------------------------
-- ps_place_order: the single-shop rule (D1, Foodpanda model).
-- Every line must resolve to ONE shop that is active, open, and serves
-- the order's zone. orders.shop_id is set from the validated lines.
-- ----------------------------------------------------------------
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line and reserve variant stock under row locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule: first line fixes the shop, the rest must match.
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    else
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 200000);
  if v_subtotal >= v_free_threshold then
    v_charge := 0;
  else
    v_charge := v_zone.charge;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed via storefront checkout');

  return v_order_id;
end $$;

commit;

-- ----------------------------------------------------------------
-- Slice 3: vendor row policies + vendor leg of ps_advance_order.
-- Vendors touch ONLY their own shop's rows; the API + a guard trigger
-- keep platform-owned shop fields (status/commission/zones) staff-only.
-- ----------------------------------------------------------------
begin;

-- products: vendors read all own rows (incl. drafts), insert/update own.
-- No delete: vendors archive via active=false, like staff.
create policy "products vendor select own" on products
  for select using (shop_id = ps_vendor_shop());
create policy "products vendor insert own" on products
  for insert with check (shop_id = ps_vendor_shop());
create policy "products vendor update own" on products
  for update using (shop_id = ps_vendor_shop())
  with check (shop_id = ps_vendor_shop());

-- variants/media: full scoped access via product ownership (the product
-- editor rebuilds these rows on save).
create policy "variants vendor all own" on product_variants
  for all using (exists (
    select 1 from products p
    where p.id = product_variants.product_id and p.shop_id = ps_vendor_shop()
  )) with check (exists (
    select 1 from products p
    where p.id = product_variants.product_id and p.shop_id = ps_vendor_shop()
  ));
create policy "media vendor all own" on product_media
  for all using (exists (
    select 1 from products p
    where p.id = product_media.product_id and p.shop_id = ps_vendor_shop()
  )) with check (exists (
    select 1 from products p
    where p.id = product_media.product_id and p.shop_id = ps_vendor_shop()
  ));

-- orders: vendors read own-shop orders; moves go through ps_advance_order.
create policy "orders vendor select own" on orders
  for select using (shop_id = ps_vendor_shop());
create policy "order items vendor select own" on order_items
  for select using (exists (
    select 1 from orders o
    where o.id = order_items.order_id and o.shop_id = ps_vendor_shop()
  ));
create policy "history vendor select own" on order_status_history
  for select using (exists (
    select 1 from orders o
    where o.id = order_status_history.order_id and o.shop_id = ps_vendor_shop()
  ));

-- reviews: vendors read reviews of their own products (platform moderates).
create policy "reviews vendor select own" on reviews
  for select using (exists (
    select 1 from products p
    where p.id = reviews.product_id and p.shop_id = ps_vendor_shop()
  ));

-- Guard: vendors may edit profile-ish fields only. A vendor calling
-- Supabase directly (anon key + JWT) hits this trigger, not just the API.
drop trigger if exists trg_shops_guard_vendor_update on shops;
create or replace function ps_guard_shop_vendor_update()
returns trigger language plpgsql as $$
begin
  if (select ps_is_admin()) then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.commission_pct is distinct from old.commission_pct
     or new.zone_ids is distinct from old.zone_ids
     or new.slug is distinct from old.slug then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

create trigger trg_shops_guard_vendor_update
  before update on shops
  for each row execute function ps_guard_shop_vendor_update();

-- ps_advance_order: vendors move their OWN orders through early states
-- only (confirm → prepare → ready-for-pickup, cancel early). Dispatch
-- states stay staff/dispatch-owned. Legality still checked below, shared.
create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
  v_is_admin boolean;
  v_shop uuid;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if p_to not in ('confirmed', 'preparing', 'ready-for-pickup', 'cancelled') then
      raise exception 'forbidden';
    end if;
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null or v_to_pos <> v_from_pos + 1 then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  update orders set status = p_to, updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  return v_order;
end $$;

commit;

-- ----------------------------------------------------------------
-- Slice 5: settlement writer + payout guard.
-- The ledger is written by the database, not the app: no code path can
-- deliver an order and forget the vendor's money. Commission follows D5
-- (% of item subtotal, delivery fee excluded), snapshotted from the
-- shop's rate at delivery time so later rate changes don't rewrite
-- history. Payouts can never exceed the earned balance (per-shop lock
-- serializes concurrent staff payouts).
-- ----------------------------------------------------------------
begin;

create or replace function ps_write_shop_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pct numeric;
  v_comm bigint;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    select commission_pct into v_pct from shops where id = new.shop_id;
    -- floor: fractions of a paisa always favour the vendor.
    v_comm := floor(new.subtotal * coalesce(v_pct, 0) / 100);
    insert into shop_ledger (shop_id, order_id, subtotal, commission, payable)
    values (new.shop_id, new.id, new.subtotal, v_comm, new.subtotal - v_comm)
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_ledger_on_delivered on orders;
create trigger trg_orders_ledger_on_delivered
  after update of status on orders
  for each row execute function ps_write_shop_ledger();

create or replace function ps_guard_payout_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_earned bigint;
  v_paid bigint;
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'payout must be positive';
  end if;
  -- Serialize payouts per shop so two staff can't overpay concurrently.
  perform 1 from shops where id = new.shop_id for update;
  select coalesce(sum(payable), 0) into v_earned
  from shop_ledger where shop_id = new.shop_id;
  select coalesce(sum(amount), 0) into v_paid
  from shop_payouts where shop_id = new.shop_id;
  if new.amount > v_earned - v_paid then
    raise exception 'payout exceeds balance';
  end if;
  return new;
end $$;

drop trigger if exists trg_payouts_check_balance on shop_payouts;
create trigger trg_payouts_check_balance
  before insert on shop_payouts
  for each row execute function ps_guard_payout_balance();

commit;

-- ============================================================================
-- MIGRATION 5/23 — riders  (source: supabase/migrations/202609090005_riders.sql)
-- ============================================================================

-- Phase 3 slice 6: rider network foundation.
-- Riders, delivery assignments, cash settlements; orders gains rider_id +
-- delivery_code. (Blueprint sketch typed order_id as text; orders.id is
-- uuid, so uuid it is.) Run after 004, in the same one-sequence launch.
-- Triggers for code generation (slice 9) and cash movement (slice 10)
-- land as appended sections with their slices.

begin;

create table riders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete cascade,
  name          text not null,
  phone         text not null unique,
  contact_email text not null default '',
  vehicle       text not null default 'bike'
                check (vehicle in ('bicycle', 'bike', 'scooter')),
  zone_ids      text[] not null default '{}',
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'suspended')),
  is_online     boolean not null default false,
  cash_in_hand  int not null default 0,
  rating_avg    numeric(3, 2) not null default 0,
  rating_count  int not null default 0,
  created_at    timestamptz not null default now()
);

create table delivery_assignments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references orders (id),
  rider_id    uuid not null references riders (id),
  state       text not null default 'offered'
              check (state in ('offered', 'accepted', 'picked_up', 'delivered', 'cancelled', 'expired')),
  offered_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '90 seconds'
);

create table rider_settlements (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id),
  amount     int not null,
  method     text not null default 'cash',
  reference  text not null default '',
  settled_at timestamptz not null default now(),
  settled_by uuid references auth.users (id)
);

alter table orders add column rider_id uuid null references riders (id);
alter table orders add column delivery_code text null;

create index idx_riders_status on riders (status);
create index idx_riders_online on riders (is_online) where status = 'active';
create index idx_assignments_rider on delivery_assignments (rider_id);
create index idx_assignments_state on delivery_assignments (state);
create index idx_settlements_rider on rider_settlements (rider_id);

-- Rider self-lookup without recursing into riders policies.
create or replace function ps_rider_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from riders where user_id = auth.uid();
$$;

alter table riders               enable row level security;
alter table delivery_assignments enable row level security;
alter table rider_settlements    enable row level security;

-- No anon policies anywhere: rider data is never public.
create policy "riders admin all" on riders
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "riders self read" on riders
  for select using (id = ps_rider_id());
create policy "riders self update own" on riders
  for update using (id = ps_rider_id())
  with check (id = ps_rider_id());

-- Riders flip their own online switch only; everything else is staff-owned.
-- (The /rider app calls the API; this stops direct Supabase writes too.)
create or replace function ps_guard_rider_self_update()
returns trigger language plpgsql as $$
begin
  if (select ps_is_admin()) then
    return new;
  end if;
  if new.is_online is not distinct from old.is_online then
    raise exception 'forbidden';
  end if;
  if new.name is distinct from old.name
     or new.phone is distinct from old.phone
     or new.contact_email is distinct from old.contact_email
     or new.vehicle is distinct from old.vehicle
     or new.zone_ids is distinct from old.zone_ids
     or new.status is distinct from old.status
     or new.user_id is distinct from old.user_id
     or new.cash_in_hand is distinct from old.cash_in_hand
     or new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

drop trigger if exists trg_riders_guard_self_update on riders;
create trigger trg_riders_guard_self_update
  before update on riders
  for each row execute function ps_guard_rider_self_update();

-- Assignments move through the dispatch RPC (slice 7, security definer):
-- riders read their own rows, never write them directly.
create policy "assignments admin all" on delivery_assignments
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "assignments rider read own" on delivery_assignments
  for select using (rider_id = ps_rider_id());

create policy "settlements admin all" on rider_settlements
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "settlements rider read own" on rider_settlements
  for select using (rider_id = ps_rider_id());

commit;

-- ============================================================================
-- MIGRATION 6/23 — engagement (contact, newsletter, media, notifications, site_settings policies)  (source: supabase/migrations/202609090006_engagement.sql)
-- ============================================================================

-- Demo-to-live engagement tables (contact inbox, newsletter, media
-- library) + the public read policy the storefront homepage needs.
--
-- `notifications` and `site_settings` already exist in schema.sql with staff
-- policies; this migration only ADDS what is missing:
--   - contact_messages / newsletter_subscribers / media_library (+ staff RLS)
--   - public SELECT on site_settings for the single 'homepage' key so the
--     storefront can render staff-published CMS copy without a session.
-- Run after 005, in the same one-sequence launch. Safe to re-run the
-- policy/table blocks independently (IF NOT EXISTS / DROP IF EXISTS).

begin;

create table if not exists contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  topic       text not null default 'Order support',
  message     text not null,
  status      text not null default 'new'
              check (status in ('new', 'read', 'replied')),
  created_at  timestamptz not null default now()
);

create table if not exists newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  status      text not null default 'subscribed'
              check (status in ('subscribed', 'unsubscribed')),
  token       uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists media_library (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  alt         text not null default '',
  label       text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_contact_status
  on contact_messages (status, created_at desc);
create index if not exists idx_newsletter_status
  on newsletter_subscribers (status);
create index if not exists idx_media_created
  on media_library (created_at desc);

alter table contact_messages      enable row level security;
alter table newsletter_subscribers enable row level security;
alter table media_library          enable row level security;

drop policy if exists "admin all contact" on contact_messages;
create policy "admin all contact" on contact_messages
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all newsletter" on newsletter_subscribers;
create policy "admin all newsletter" on newsletter_subscribers
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all media library" on media_library;
create policy "admin all media library" on media_library
  for all using (ps_is_admin()) with check (ps_is_admin());

-- The storefront homepage renders this one key for anonymous visitors.
-- Every other site_settings key stays staff-only.
drop policy if exists "homepage public read" on site_settings;
create policy "homepage public read" on site_settings
  for select using (key = 'homepage');

commit;

-- ============================================================================
-- MIGRATION 7/23 — rider dispatch  (source: supabase/migrations/202609090007_rider_dispatch.sql)
-- ============================================================================

-- Phase 3 slice 7–10 completion: live rider dispatch actions.
-- Run after 005 (riders, delivery_assignments, settlements). The app layer
-- keeps the route gate (rider-auth); these security-definer functions own
-- the state changes and never trust the client.
begin;

-- Every order gets a delivery code so live rider verification matches the
-- 4-digit code shown to the customer at checkout. Existing rows backfill
-- deterministically on the first read below; new rows are set before insert.
create or replace function ps_set_order_delivery_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_code is null or new.delivery_code !~ '^[0-9]{4}$' then
    new.delivery_code := lpad(
      (mod(hashtext(coalesce(new.order_no, new.id::text))::bigint, 9000)::int + 1000)::text,
      4,
      '0'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_set_delivery_code on orders;
create trigger trg_orders_set_delivery_code
  before insert on orders
  for each row execute function ps_set_order_delivery_code();

update orders
set delivery_code = lpad(
  (mod(hashtext(coalesce(order_no, id::text))::bigint, 9000)::int + 1000)::text,
  4,
  '0'
)
where delivery_code is null
   or delivery_code !~ '^[0-9]{4}$';

-- A rider accepts only a live offer belonging to them.
create or replace function ps_rider_accept(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'offered' then
    raise exception 'assignment already handled';
  end if;
  update delivery_assignments set state = 'accepted' where id = v_assignment.id
  returning * into v_assignment;
  -- Accepting the offer is what marks the order as rider-assigned; the
  -- pickup RPC later moves it out for delivery.
  update orders
  set status = 'courier-assigned',
      rider_id = v_assignment.rider_id,
      updated_at = now()
  where id = v_assignment.order_id and status = 'ready-for-pickup';
  insert into order_status_history (order_id, status, note, changed_by)
  select v_assignment.order_id, 'courier-assigned',
         'Rider accepted the delivery offer', auth.uid()
  where exists (
    select 1 from orders o
    where o.id = v_assignment.order_id and o.status = 'courier-assigned'
  );
  return v_assignment;
end $$;

-- Pickup: assignment becomes picked_up, order moves out for delivery.
create or replace function ps_rider_pickup(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state not in ('accepted', 'picked_up') then
    raise exception 'pickup not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if v_order.status is distinct from 'out-for-delivery' then
    if v_order.status not in ('ready-for-pickup', 'courier-assigned') then
      raise exception 'order not ready for pickup';
    end if;
    update orders
    set status = 'out-for-delivery', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'out-for-delivery', 'Rider picked up the parcel', auth.uid());
  end if;

  if v_assignment.state is distinct from 'picked_up' then
    update delivery_assignments set state = 'picked_up' where id = v_assignment.id
    returning * into v_assignment;
  end if;
  return v_assignment;
end $$;

-- Delivery proof: verify the customer's 4-digit code, close the order, and
-- add COD cash to the rider's hand balance in the same transaction.
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with the customer code · COD collected',
      auth.uid()
    );
  end if;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_order.total
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

-- Rider cash settlement: create the settlement row and zero the hand balance.
create or replace function ps_rider_settle(p_method text, p_reference text default '')
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  if v_rider.cash_in_hand <= 0 then
    raise exception 'nothing to settle';
  end if;
  insert into rider_settlements (rider_id, amount, method, reference, settled_by)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(trim(p_method), 'cash'),
    coalesce(trim(p_reference), ''),
    auth.uid()
  )
  returning * into v_settlement;
  update riders set cash_in_hand = 0 where id = v_rider.id;
  return v_settlement;
end $$;

commit;

-- ============================================================================
-- MIGRATION 8/23 — dispatch auto-offer  (source: supabase/migrations/202609090008_dispatch_auto.sql)
-- ============================================================================

-- Phase 3 slice 7: dispatch engine + admin deliveries board.
-- Run after 007. Adds the automatic offer when an order reaches
-- ready-for-pickup, plus admin-facing assign/cancel RPCs. The rider side
-- (accept/pickup/deliver/settle) stays in 007; this migration only creates
-- the offer and lets staff intervene when no rider was available.

begin;

-- Pick the next eligible rider for an order. Fairness starts simple:
-- longest-idle (oldest created_at) among active + online riders whose home
-- zones include the order zone and who are not already carrying an order.
-- GPS-based nearest-first stays a documented hardening step.
create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select r.id
  from riders r
  cross join lateral (
    select o.zone_id
    from orders o
    where o.id = p_order_id
  ) o
  where r.status = 'active'
    and r.is_online
    and r.zone_ids @> array[o.zone_id]
    and r.cash_in_hand < 500000
    and not exists (
      select 1
      from delivery_assignments a
      where a.rider_id = r.id
        and a.state in ('offered', 'accepted', 'picked_up')
    )
    -- rotate: never re-offer to a rider who already saw this order
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.created_at asc
  limit 1;
$$;

-- Automatic dispatch trigger: when an order becomes ready-for-pickup offer
-- it to exactly one eligible rider. Runs inside the same update as the
-- vendor/staff status move and is idempotent through the unique order_id.
create or replace function ps_auto_dispatch_ready_order()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rider_id uuid;
begin
  if new.status <> 'ready-for-pickup'
     or old.status = 'ready-for-pickup'
     or exists (
       select 1 from delivery_assignments where order_id = new.id
     ) then
    return new;
  end if;

  v_rider_id := ps_next_eligible_rider(new.id);
  if v_rider_id is not null then
    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (new.id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_auto_dispatch on orders;
create trigger trg_orders_auto_dispatch
  after update on orders
  for each row execute function ps_auto_dispatch_ready_order();

-- Staff intervention: create an offer for an order that has no live
-- assignment. Used by Admin → Deliveries "Assign" when auto-dispatch found
-- nobody, or to re-offer after a cancelled/expired assignment.
create or replace function ps_offer_order(p_order_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_assignment_id uuid;
  v_rider_id      uuid;
  v_order_status  text;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;

  select status into v_order_status from orders where id = p_order_id;
  if v_order_status is null then
    raise exception 'order not found';
  end if;
  if v_order_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
    raise exception 'order not ready for dispatch';
  end if;
  if exists (
    select 1 from delivery_assignments
    where order_id = p_order_id and state in ('offered', 'accepted', 'picked_up')
  ) then
    raise exception 'assignment already active';
  end if;

  v_rider_id := ps_next_eligible_rider(p_order_id);
  if v_rider_id is null then
    raise exception 'no eligible rider';
  end if;
  insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
  values (p_order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds')
  returning id into v_assignment_id;
  return v_assignment_id;
end $$;

-- Rider rejects an offer: cancel their assignment and immediately offer the
-- same order to the next eligible rider (the rejecting rider never sees it
-- again through ps_next_eligible_rider's seen check).
create or replace function ps_rider_reject(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_rider_id   uuid;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'offered' then
    raise exception 'assignment already handled';
  end if;
  update delivery_assignments set state = 'cancelled' where id = v_assignment.id
  returning * into v_assignment;

  if (
    select o.status from orders o where o.id = v_assignment.order_id
  ) in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery')
     and not exists (
       select 1 from delivery_assignments
       where order_id = v_assignment.order_id
         and state in ('offered', 'accepted', 'picked_up')
     ) then
    v_rider_id := ps_next_eligible_rider(v_assignment.order_id);
    if v_rider_id is not null then
      insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
      values (v_assignment.order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
    end if;
  end if;
  return v_assignment;
end $$;

-- Staff closes a live assignment (wrong rider, order cancelled, etc.).
create or replace function ps_expire_stale_offers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_row record;
  v_rider_id uuid;
begin
  for v_row in
    select da.id, da.order_id
    from delivery_assignments da
    join orders o on o.id = da.order_id
    where da.state = 'offered' and da.expires_at < now()
    for update of da
  loop
    update delivery_assignments
    set state = 'expired'
    where id = v_row.id;

    -- Re-offer the same order to the next eligible rider if it still needs
    -- delivery. This is the simplest round-robin retry; no-eligible-rider
    -- leaves the order on the Admin → Deliveries awaiting board.
    if (
      select o.status from orders o where o.id = v_row.order_id
    ) in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery')
       and not exists (
         select 1 from delivery_assignments
         where order_id = v_row.order_id
           and state in ('offered', 'accepted', 'picked_up')
       ) then
      v_rider_id := ps_next_eligible_rider(v_row.order_id);
      if v_rider_id is not null then
        insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
        values (v_row.order_id, v_rider_id, 'offered', now(), now() + interval '90 seconds');
      end if;
    end if;
    v_count := coalesce(v_count, 0) + 1;
  end loop;
  return coalesce(v_count, 0);
end $$;

-- Staff settles a rider's cash in hand and records the pay-in. Unlike the
-- rider self-settle, staff choose the rider and the method/reference.
create or replace function ps_admin_settle_rider(
  p_rider_id uuid,
  p_method text default 'cash',
  p_reference text default ''
)
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_rider from riders where id = p_rider_id for update;
  if not found then
    raise exception 'rider not found';
  end if;
  if v_rider.cash_in_hand <= 0 then
    raise exception 'nothing to settle';
  end if;
  insert into rider_settlements (rider_id, amount, method, reference, settled_by)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(trim(p_method), 'cash'),
    coalesce(trim(p_reference), ''),
    auth.uid()
  )
  returning * into v_settlement;
  update riders set cash_in_hand = 0 where id = v_rider.id;
  return v_settlement;
end $$;

-- Staff closes a live assignment (wrong rider, order cancelled, etc.).
create or replace function ps_cancel_assignment(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_assignment
  from delivery_assignments where id = p_assignment_id
  for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  if v_assignment.state in ('delivered') then
    raise exception 'delivered assignment cannot be cancelled';
  end if;
  update delivery_assignments
  set state = 'cancelled'
  where id = v_assignment.id
  returning * into v_assignment;
  return v_assignment;
end $$;

commit;

-- ============================================================================
-- MIGRATION 9/23 — sunamganj zones  (source: supabase/migrations/202609090009_sunamganj_zones.sql)
-- ============================================================================

-- Sunamganj Sadar delivery zones — Traffic Point centric.
-- District: Sunamganj, Upazila: Sunamganj Sadar.
-- Replaces the old Comilla-centric demo zones with real Sunamganj paras.
-- Also adds first-1000-orders FREE promo into ps_place_order.
-- Safe: upsert only, no delete (FK safe if orders already reference zones).
begin;

-- Upsert Sunamganj paras (idempotent, FK-safe)
insert into delivery_zones (id, name, areas, charge, eta_label, sort_order, active) values
  ('z1', 'Zone A — Traffic Point (0-1.5km)', array['Boropara','Shologhar','Ukilpara','Courtpara','Jail Road','Modhyabazar','Kalibari','Arambagh','Mollapara'], 6000, '30–40 min', 0, true),
  ('z2', 'Zone B — Sadar Core (1.5-2.5km)', array['Notunpara','Hasannagar','Tegharia','Nabinagar','Sahib Bari Ghat','Hospital Road','Kazir Point','Purba Bazar','Paschim Bazar'], 12000, '40–50 min', 1, true),
  ('z3', 'Zone C — Sadar Extended (2.5-4km)', array['Wayesspur','Balaka Para','Jaliapara','Palpur','Dargahpara','Uttarpara','Dakkhinpara','Shologhar Bypass'], 15000, '50–60 min', 2, true),
  ('z4', 'Zone D — Sunamganj Sadar Bahire', array['Sunamganj Sadar Other','Dolura','Gouripur','Surma River Side','Mollapara Bahire','Shantiganj Border'], 15000, '60–80 min', 3, true)
on conflict (id) do update set
  name = excluded.name,
  areas = excluded.areas,
  charge = excluded.charge,
  eta_label = excluded.eta_label,
  sort_order = excluded.sort_order,
  active = excluded.active;

-- Clean any leftover old Comilla demo zones that are not referenced by orders
-- (only delete if no orders reference them, to stay FK-safe)
delete from delivery_zones
where id not in ('z1','z2','z3','z4')
  and id in ('z-old-1','z-old-2','z-old-3','kandirpar','rampur','court-road')
  and not exists (select 1 from orders where orders.zone_id = delivery_zones.id);

-- Update ps_place_order: first 1000 orders FREE promo + 1000 taka threshold
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line and reserve variant stock under row locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    else
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- Delivery charge: first 1000 orders FREE promo, else threshold 1000 taka
  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar');

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 10/23 — min order outside (harmless upsert; flat model ignores it)  (source: supabase/migrations/202609090010_min_order_outside.sql)
-- ============================================================================

-- Enforce minimum order for Zone D (outside Sadar) — ৳500.
-- Also ensure free_delivery_threshold is 1000 taka (100000 paisa) by default.
begin;

-- Ensure site_settings has correct threshold (upsert)
-- `value` is jsonb, so the integer must be converted explicitly.
insert into site_settings (key, value) values ('free_delivery_threshold_paisa', to_jsonb(100000))
on conflict (key) do update set value = excluded.value;

-- Update ps_place_order to include Zone D minimum check
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Zone D minimum ৳500
  if v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    else
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar (real)');

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 11/23 — coupon enhancements (zone/category scope, max discount)  (source: supabase/migrations/202609090011_coupon_enhancements.sql)
-- ============================================================================

-- Coupon enhancements — Sunamganj promo codes with percent, fixed, free_delivery,
-- zone restriction, max discount cap, description.
-- Admin can create: percent discount (e.g. 15% off), fixed (৳100 off), free delivery,
-- with min order, category, zone, expiry, usage limit.

begin;

-- Allow new type 'free_delivery'
alter table coupons drop constraint if exists coupons_type_check;
alter table coupons add constraint coupons_type_check check (type in ('percent', 'fixed', 'free_delivery'));

-- Add new columns if not exists
alter table coupons add column if not exists max_discount bigint check (max_discount is null or max_discount >= 0);
alter table coupons add column if not exists zone_id text references delivery_zones (id);
alter table coupons add column if not exists description text;

-- Update ps_place_order to handle free_delivery coupons
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    -- Zone restriction
    if v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then
      raise exception 'coupon not valid for this zone';
    end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  if v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    -- Free delivery coupons don't need eligible check
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      -- free_delivery: no product discount, but delivery will be free
      v_discount := 0;
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  -- Free delivery coupon always overrides charge
  if v_has_coupon and v_coupon.type = 'free_delivery' then
    v_charge := 0;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar (coupon: ' || coalesce(v_code, 'none') || ')');

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 12/23 — geo + delivery proof (lat/lng/distance on orders)  (source: supabase/migrations/202609090012_geo_and_proof.sql)
-- ============================================================================

-- Geo pin + delivery proof via Cloudinary
-- Serial 1: Map Pin + Auto Zone

begin;

-- Add lat/lng to orders for exact delivery pin (Sunamganj)
alter table orders add column if not exists lat double precision check (lat is null or (lat between -90 and 90));
alter table orders add column if not exists lng double precision check (lng is null or (lng between -180 and 180));
alter table orders add column if not exists distance_km double precision check (distance_km is null or distance_km >= 0);
alter table orders add column if not exists delivery_proof_url text;
alter table orders add column if not exists delivery_proof_uploaded_at timestamptz;
alter table orders add column if not exists delivery_failed_reason text;
alter table orders add column if not exists delivery_attempts int not null default 0 check (delivery_attempts >= 0);

-- Update ps_place_order to accept lat/lng/distance and store them
-- Keep existing logic but add geo fields

create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
  v_lat double precision := nullif(p_order->>'lat','')::double precision;
  v_lng double precision := nullif(p_order->>'lng','')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km','')::double precision;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found then
    raise exception 'zone unavailable';
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    if v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then
      raise exception 'coupon not valid for this zone';
    end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  if v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := 0;
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then
    v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    if v_subtotal >= v_free_threshold then
      v_charge := 0;
    else
      v_charge := v_zone.charge;
    end if;
  end if;
  if v_has_coupon and v_coupon.type = 'free_delivery' then
    v_charge := 0;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed via storefront checkout — Sunamganj Sadar (coupon: ' || coalesce(v_code, 'none') || ', pin: ' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ')');

  return v_order_id;
end $$;

-- Index for geo queries
create index if not exists idx_orders_lat_lng on orders (lat, lng) where lat is not null;
create index if not exists idx_orders_proof on orders (delivery_proof_url) where delivery_proof_url is not null;

commit;

-- ============================================================================
-- MIGRATION 13/23 — delivery proof via Cloudinary  (source: supabase/migrations/202609090013_delivery_proof_cloudinary.sql)
-- ============================================================================

-- Delivery proof via Cloudinary + failed attempts + dynamic ETA prep
-- Serial 2: Delivery proof + rider proof upload

begin;

-- Extend ps_rider_deliver to accept Cloudinary proof URL
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · COD collected',
      auth.uid()
    );
  end if;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_order.total
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

-- Failed delivery attempt tracking
create or replace function ps_rider_failed_attempt(p_assignment_id uuid, p_reason text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state not in ('accepted','picked_up') then
    raise exception 'failed attempt not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  update orders
  set delivery_attempts = delivery_attempts + 1,
      delivery_failed_reason = trim(p_reason),
      updated_at = now()
  where id = v_order.id;

  insert into order_status_history (order_id, status, note, changed_by)
  values (
    v_order.id,
    v_order.status,
    'Delivery attempt failed: ' || trim(p_reason),
    auth.uid()
  );

  return v_assignment;
end $$;

-- Dynamic ETA helper: based on zone + rider queue + time of day
create or replace function ps_dynamic_eta(p_zone_id text, p_shop_prep int default 15)
returns text
language plpgsql as $$
declare
  v_base int;
  v_queue int;
  v_hour int;
  v_extra int := 0;
begin
  select case
    when p_zone_id = 'z1' then 35
    when p_zone_id = 'z2' then 45
    when p_zone_id = 'z3' then 55
    else 70
  end into v_base;

  -- Count active deliveries in this zone
  select count(*) into v_queue from orders
  where zone_id = p_zone_id and status in ('courier-assigned','out-for-delivery');

  v_hour := extract(hour from now() at time zone 'Asia/Dhaka');
  if v_hour >= 20 or v_hour < 6 then
    v_extra := 10; -- night
  elsif v_hour between 12 and 14 or v_hour between 18 and 20 then
    v_extra := 10; -- lunch/dinner rush
  end if;

  v_base := v_base + p_shop_prep + (v_queue * 5) + v_extra;
  return (v_base - 5)::text || '–' || (v_base + 5)::text || ' min';
end $$;

commit;

-- ============================================================================
-- MIGRATION 14/23 — nearest rider geo  (source: supabase/migrations/202609090014_rider_geo_nearest.sql)
-- ============================================================================

-- Rider geo tracking + nearest auto-assign + load balancing
-- Serial 3: Auto-assign nearest rider

begin;

-- Add geo + load to riders
alter table riders add column if not exists lat double precision check (lat is null or (lat between -90 and 90));
alter table riders add column if not exists lng double precision check (lng is null or (lng between -180 and 180));
alter table riders add column if not exists last_location_at timestamptz;
alter table riders add column if not exists current_load int not null default 0 check (current_load >= 0);
alter table riders add column if not exists total_deliveries int not null default 0 check (total_deliveries >= 0);
alter table riders add column if not exists avg_delivery_minutes int;

-- Function to compute haversine distance in km
create or replace function ps_haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language plpgsql immutable as $$
declare
  R double precision := 6371;
  dLat double precision;
  dLng double precision;
  a double precision;
  c double precision;
begin
  if lat1 is null or lng1 is null or lat2 is null or lng2 is null then
    return null;
  end if;
  dLat := radians(lat2 - lat1);
  dLng := radians(lng2 - lng1);
  a := sin(dLat/2) * sin(dLat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLng/2) * sin(dLng/2);
  c := 2 * asin(sqrt(a));
  return R * c;
end $$;

-- Improved nearest rider: distance + rating + load + longest idle
create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_order_lat double precision;
  v_order_lng double precision;
  v_zone_id text;
  v_rider_id uuid;
begin
  select lat, lng, zone_id into v_order_lat, v_order_lng, v_zone_id from orders where id = p_order_id;

  -- Try nearest by geo if order has pin
  if v_order_lat is not null and v_order_lng is not null then
    select r.id into v_rider_id
    from riders r
    where r.status = 'active'
      and r.is_online
      and r.zone_ids @> array[v_zone_id]
      and r.cash_in_hand < 500000
      and r.current_load < 2 -- max 2 concurrent
      and not exists (
        select 1 from delivery_assignments a
        where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
      )
      and not exists (
        select 1 from delivery_assignments seen
        where seen.order_id = p_order_id and seen.rider_id = r.id
      )
    order by
      -- distance first (if rider has location)
      case when r.lat is not null and r.lng is not null
        then ps_haversine_km(v_order_lat, v_order_lng, r.lat, r.lng)
        else 9999 end asc,
      -- then rating high to low
      r.rating_avg desc,
      -- then least load
      r.current_load asc,
      -- then longest idle
      r.created_at asc
    limit 1;
    if v_rider_id is not null then
      return v_rider_id;
    end if;
  end if;

  -- Fallback: original logic without geo
  select r.id into v_rider_id
  from riders r
  where r.status = 'active'
    and r.is_online
    and r.zone_ids @> array[v_zone_id]
    and r.cash_in_hand < 500000
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
    )
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.rating_avg desc, r.current_load asc, r.created_at asc
  limit 1;

  return v_rider_id;
end $$;

-- Rider location update function
create or replace function ps_rider_update_location(p_lat double precision, p_lng double precision)
returns riders
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  update riders
  set lat = p_lat, lng = p_lng, last_location_at = now()
  where id = v_rider.id
  returning * into v_rider;
  return v_rider;
end $$;

-- Track load on accept/pickup/deliver
create or replace function ps_track_rider_load()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' and NEW.state in ('offered','accepted','picked_up') then
    update riders set current_load = current_load + 1 where id = NEW.rider_id;
  elsif TG_OP = 'UPDATE' then
    if OLD.state in ('offered','accepted','picked_up') and NEW.state not in ('offered','accepted','picked_up') then
      update riders set current_load = greatest(0, current_load - 1), total_deliveries = case when NEW.state = 'delivered' then total_deliveries + 1 else total_deliveries end where id = NEW.rider_id;
    elsif OLD.state not in ('offered','accepted','picked_up') and NEW.state in ('offered','accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'DELETE' and OLD.state in ('offered','accepted','picked_up') then
    update riders set current_load = greatest(0, current_load - 1) where id = OLD.rider_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_assignments_track_load on delivery_assignments;
create trigger trg_assignments_track_load
  after insert or update or delete on delivery_assignments
  for each row execute function ps_track_rider_load();

-- Index for geo queries
create index if not exists idx_riders_lat_lng on riders (lat, lng) where lat is not null;
create index if not exists idx_riders_load on riders (current_load) where status = 'active' and is_online;

commit;

-- ============================================================================
-- MIGRATION 15/23 — scheduled delivery (scheduled_at/delivery_window on orders)  (source: supabase/migrations/202609090015_scheduled_delivery.sql)
-- ============================================================================

-- Scheduled delivery calendar + express + per-zone threshold
-- Serial 4: Scheduled delivery

begin;

alter table orders add column if not exists scheduled_at timestamptz;
alter table orders add column if not exists delivery_window text check (delivery_window is null or delivery_window in ('9-11','11-1','2-4','4-6','6-8','8-10','express','now','evening','tomorrow_morning','scheduled'));
alter table orders add column if not exists is_express boolean not null default false;
alter table orders add column if not exists surcharge_night bigint not null default 0;
alter table orders add column if not exists surcharge_rain bigint not null default 0;
alter table orders add column if not exists surcharge_distance bigint not null default 0;
alter table orders add column if not exists surcharge_express bigint not null default 0;

-- Update ps_place_order to accept scheduled fields
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
  v_lat double precision := nullif(p_order->>'lat','')::double precision;
  v_lng double precision := nullif(p_order->>'lng','')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km','')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at','')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_sur_night bigint := coalesce((p_order->>'surcharge_night')::bigint, 0);
  v_sur_rain bigint := coalesce((p_order->>'surcharge_rain')::bigint, 0);
  v_sur_dist bigint := coalesce((p_order->>'surcharge_distance')::bigint, 0);
  v_sur_express bigint := coalesce((p_order->>'surcharge_express')::bigint, 0);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones where id = p_order->>'zone_id' and active;
  if not found then raise exception 'zone unavailable'; end if;

  if v_code <> '' then
    select * into v_coupon from coupons where code = v_code and active;
    if not found then raise exception 'unknown coupon'; end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then raise exception 'coupon not started'; end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then raise exception 'coupon expired'; end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then raise exception 'coupon limit reached'; end if;
    if v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then raise exception 'coupon not valid for this zone'; end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then raise exception 'bad quantity'; end if;
    select * into v_product from products where id = (v_item->>'product_id')::uuid and status = 'published' and active and in_stock;
    if not found then raise exception 'product unavailable'; end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then raise exception 'shop unavailable'; end if;
      if not v_shop.is_open then raise exception 'shop closed'; end if;
      if not (v_zone.id = any (v_shop.zone_ids)) then raise exception 'shop does not deliver to zone'; end if;
    elsif v_product.shop_id <> v_shop.id then raise exception 'order mixes multiple shops'; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id) then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants where id = v_variant_id and product_id = v_product.id and active for update;
      if not found then raise exception 'variant unavailable'; end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then raise exception 'only % left of "%"', greatest(0, v_available), v_product.name; end if;
      update product_variants set reserved = reserved + v_qty where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then raise exception 'empty order'; end if;
  if v_zone.id = 'z4' and v_subtotal < 50000 then raise exception 'Zone D requires minimum ৳500 order'; end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then raise exception 'coupon minimum not met'; end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then raise exception 'coupon does not apply'; end if;
    if v_coupon.type = 'fixed' then v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then v_discount := least(v_discount, v_coupon.max_discount); end if;
    else v_discount := 0; end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  select count(*) into v_total_orders from orders;
  if v_total_orders < 1000 then v_charge := 0;
  else
    v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
    -- per-zone threshold override if setting enabled (handled in app, but keep fallback)
    if v_zone.id = 'z1' and v_subtotal >= 60000 then v_charge := 0;
    elsif v_zone.id = 'z2' and v_subtotal >= 80000 then v_charge := 0;
    elsif v_zone.id = 'z4' and v_subtotal >= 150000 then v_charge := 0;
    elsif v_subtotal >= v_free_threshold then v_charge := 0;
    else v_charge := v_zone.charge + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express;
    end if;
  end if;
  if v_has_coupon and v_coupon.type = 'free_delivery' then v_charge := 0; end if;
  -- If free delivery threshold met, zero surcharges too
  if v_charge = 0 then
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0;
  end if;
  v_total := v_subtotal - v_discount + v_charge;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window,''),
    v_is_express, v_sur_night, v_sur_rain, v_sur_dist, v_sur_express,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    insert into order_items (order_id, product_id, variant_id, name, sku, variant, unit_price, qty) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = '' then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku, coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed Sunamganj Sadar geo=' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ' scheduled=' || coalesce(v_scheduled_at::text, v_window, 'now') || ' coupon=' || coalesce(v_code,'none'));

  return v_order_id;
end $$;

create index if not exists idx_orders_scheduled on orders (scheduled_at) where scheduled_at is not null;

commit;

-- ============================================================================
-- MIGRATION 16/23 — tips + store pickup + weight surcharge on orders  (source: supabase/migrations/202609090016_tips_pickup_weight.sql)
-- ============================================================================

-- Tips for rider + store pickup + weight/bulk surcharge
-- Serial 5: Customer experience improvements

begin;

alter table orders add column if not exists tip_amount bigint not null default 0 check (tip_amount >= 0);
alter table orders add column if not exists is_pickup boolean not null default false;
alter table orders add column if not exists pickup_time timestamptz;
alter table orders add column if not exists weight_kg double precision check (weight_kg is null or weight_kg >= 0);
alter table orders add column if not exists surcharge_weight bigint not null default 0;
alter table orders add column if not exists surcharge_tip bigint not null default 0;

-- Update ps_place_order to handle tips, pickup, weight
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
  v_lat double precision := nullif(p_order->>'lat','')::double precision;
  v_lng double precision := nullif(p_order->>'lng','')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km','')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at','')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_tip bigint := coalesce((p_order->>'tip_amount')::bigint, 0);
  v_weight double precision := nullif(p_order->>'weight_kg','')::double precision;
  v_sur_night bigint := coalesce((p_order->>'surcharge_night')::bigint, 0);
  v_sur_rain bigint := coalesce((p_order->>'surcharge_rain')::bigint, 0);
  v_sur_dist bigint := coalesce((p_order->>'surcharge_distance')::bigint, 0);
  v_sur_express bigint := coalesce((p_order->>'surcharge_express')::bigint, 0);
  v_sur_weight bigint := coalesce((p_order->>'surcharge_weight')::bigint, 0);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty order'; end if;

  if not v_is_pickup then
    select * into v_zone from delivery_zones where id = p_order->>'zone_id' and active;
    if not found then raise exception 'zone unavailable'; end if;
  else
    -- For pickup, use first active zone as dummy but charge 0
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then raise exception 'zone unavailable'; end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons where code = v_code and active;
    if not found then raise exception 'unknown coupon'; end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then raise exception 'coupon not started'; end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then raise exception 'coupon expired'; end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then raise exception 'coupon limit reached'; end if;
    if not v_is_pickup and v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then raise exception 'coupon not valid for this zone'; end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then raise exception 'bad quantity'; end if;
    select * into v_product from products where id = (v_item->>'product_id')::uuid and status = 'published' and active and in_stock;
    if not found then raise exception 'product unavailable'; end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then raise exception 'shop unavailable'; end if;
      if not v_shop.is_open then raise exception 'shop closed'; end if;
      if not v_is_pickup and not (v_zone.id = any (v_shop.zone_ids)) then raise exception 'shop does not deliver to zone'; end if;
    elsif v_product.shop_id <> v_shop.id then raise exception 'order mixes multiple shops'; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id) then v_eligible := v_eligible + v_product.price * v_qty; end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants where id = v_variant_id and product_id = v_product.id and active for update;
      if not found then raise exception 'variant unavailable'; end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then raise exception 'only % left of "%"', greatest(0, v_available), v_product.name; end if;
      update product_variants set reserved = reserved + v_qty where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then raise exception 'empty order'; end if;
  if not v_is_pickup and v_zone.id = 'z4' and v_subtotal < 50000 then raise exception 'Zone D requires minimum ৳500 order'; end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then raise exception 'coupon minimum not met'; end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then raise exception 'coupon does not apply'; end if;
    if v_coupon.type = 'fixed' then v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then v_discount := least(v_discount, v_coupon.max_discount); end if;
    else v_discount := 0; end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    select count(*) into v_total_orders from orders;
    if v_total_orders < 1000 then v_charge := 0;
    else
      v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
      if v_zone.id = 'z1' and v_subtotal >= 60000 then v_charge := 0;
      elsif v_zone.id = 'z2' and v_subtotal >= 80000 then v_charge := 0;
      elsif v_zone.id = 'z4' and v_subtotal >= 150000 then v_charge := 0;
      elsif v_subtotal >= v_free_threshold then v_charge := 0;
      else v_charge := v_zone.charge + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
      end if;
    end if;
    if v_has_coupon and v_coupon.type = 'free_delivery' then v_charge := 0; end if;
    if v_charge = 0 then v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0; end if;
  end if;

  v_total := v_subtotal - v_discount + v_charge + v_tip;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express, is_pickup,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    tip_amount, weight_kg,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window,''),
    v_is_express, v_is_pickup,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_tip, v_weight,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    insert into order_items (order_id, product_id, variant_id, name, sku, variant, unit_price, qty) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = '' then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku, coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed Sunamganj Sadar pickup=' || v_is_pickup::text || ' tip=' || v_tip::text || ' weight=' || coalesce(v_weight::text,'0') || ' geo=' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ' scheduled=' || coalesce(v_scheduled_at::text, v_window, 'now'));

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 17/23 — delivery remaining  (source: supabase/migrations/202609090017_delivery_remaining.sql)
-- ============================================================================

-- Remaining delivery features: return/exchange, SLA, batch route, vendor earnings with tip/surcharge, pickup time, slot capacity
begin;

-- 1. Return / exchange pickup flow
alter table orders add column if not exists is_return boolean not null default false;
alter table orders add column if not exists return_reason text;
alter table orders add column if not exists return_parent_id uuid references orders(id);
alter table orders add column if not exists return_status text check (return_status in ('requested','approved','picked_up','refunded','rejected')) default null;
alter table orders add column if not exists return_pickup_at timestamptz;

-- 2. Pickup time for store pickup orders
alter table orders add column if not exists pickup_slot text; -- e.g. "now", "9-11", etc

-- 3. Slot capacity tracking for scheduled deliveries
create table if not exists delivery_slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  slot_window text not null check (slot_window in ('9-11','11-1','2-4','4-6','6-8','8-10','express','now','evening','scheduled','pickup')),
  max_orders int not null default 20,
  booked_orders int not null default 0,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique(slot_date, slot_window)
);
alter table delivery_slots enable row level security;
drop policy if exists "delivery_slots public read" on delivery_slots;
create policy "delivery_slots public read" on delivery_slots for select using (true);
drop policy if exists "delivery_slots admin all" on delivery_slots;
create policy "delivery_slots admin all" on delivery_slots for all using (true) with check (true);

-- Function to book slot
create or replace function ps_book_delivery_slot(p_date date, p_window text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row delivery_slots%rowtype;
begin
  insert into delivery_slots (slot_date, slot_window, max_orders, booked_orders)
  values (p_date, p_window, 20, 0)
  on conflict (slot_date, slot_window) do nothing;

  select * into v_row from delivery_slots where slot_date = p_date and slot_window = p_window for update;
  if v_row.is_blocked then return false; end if;
  if v_row.booked_orders >= v_row.max_orders then return false; end if;
  update delivery_slots set booked_orders = booked_orders + 1 where slot_date = p_date and slot_window = p_window;
  return true;
end $$;

-- 4. Vendor earnings: update ledger writer to include tip + delivery charge split
-- shop_ledger currently has subtotal, commission, payable
-- Add columns for delivery charge, tip, surcharges
alter table shop_ledger add column if not exists delivery_charge bigint not null default 0;
alter table shop_ledger add column if not exists tip_amount bigint not null default 0;
alter table shop_ledger add column if not exists surcharge_total bigint not null default 0;

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
begin
  if new.status = 'delivered' and coalesce(old.status,'') <> 'delivered' then
    select commission_pct into v_pct from shops where id = new.shop_id;
    if v_pct is null then v_pct := 15; end if;
    v_commission := floor((new.subtotal * v_pct) / 100);
    v_payable := new.subtotal - v_commission;
    v_delivery := coalesce(new.delivery_charge,0);
    v_tip := coalesce(new.tip_amount,0);
    v_sur := coalesce(new.surcharge_night,0) + coalesce(new.surcharge_rain,0) + coalesce(new.surcharge_distance,0) + coalesce(new.surcharge_express,0) + coalesce(new.surcharge_weight,0);
    -- For pickup orders, delivery charge 0, but tip still goes to rider not vendor, so vendor gets only product share
    -- For returns, payable is negative (refund)
    if coalesce(new.is_return,false) then
      v_payable := -v_payable;
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

-- Ensure unique on order_id for upsert
create unique index if not exists idx_shop_ledger_order_id on shop_ledger(order_id);

-- 5. SLA alerts view
create or replace view v_sla_breaches as
select
  o.id,
  o.order_no,
  o.shop_id,
  o.status,
  o.created_at,
  o.zone_id,
  o.scheduled_at,
  o.delivery_window,
  o.is_express,
  extract(epoch from (now() - o.created_at))/60 as age_minutes,
  case
    when o.is_express and extract(epoch from (now() - o.created_at))/60 > 60 then true
    when o.zone_id = 'z1' and extract(epoch from (now() - o.created_at))/60 > 90 then true
    when o.zone_id = 'z2' and extract(epoch from (now() - o.created_at))/60 > 120 then true
    when o.zone_id = 'z4' and extract(epoch from (now() - o.created_at))/60 > 180 then true
    else false
  end as is_breached,
  case
    when o.scheduled_at is not null and now() > o.scheduled_at + interval '1 hour' and o.status not in ('delivered','cancelled') then true
    else false
  end as is_scheduled_breached
from orders o
where o.status not in ('delivered','cancelled');

-- 6. Batch assignment: function to assign multiple orders to one rider
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_oid uuid;
  v_rider riders%rowtype;
begin
  select * into v_rider from riders where id = p_rider_id and status = 'active' and is_online;
  if not found then raise exception 'rider not available'; end if;

  foreach v_oid in array p_order_ids loop
    -- Use existing assign logic if possible, else direct
    begin
      perform ps_assign_order_to_rider(v_oid, p_rider_id);
      v_count := v_count + 1;
    exception when others then
      -- fallback: insert into rider_assignments if not exists
      insert into rider_assignments (order_id, rider_id, state)
      values (v_oid, p_rider_id, 'offered')
      on conflict (order_id, rider_id) do nothing;
      if found then v_count := v_count + 1; end if;
    end;
  end loop;
  return v_count;
end $$;

-- 7. Update ps_place_order to handle return, pickup_slot, slot booking
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_free_threshold bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_total_orders bigint;
  v_lat double precision := nullif(p_order->>'lat','')::double precision;
  v_lng double precision := nullif(p_order->>'lng','')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km','')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at','')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_is_return boolean := coalesce((p_order->>'is_return')::boolean, false);
  v_return_parent uuid := nullif(p_order->>'return_parent_id','')::uuid;
  v_return_reason text := coalesce(trim(p_order->>'return_reason'), '');
  v_pickup_slot text := coalesce(trim(p_order->>'pickup_slot'), '');
  v_tip bigint := coalesce((p_order->>'tip_amount')::bigint, 0);
  v_weight double precision := nullif(p_order->>'weight_kg','')::double precision;
  v_sur_night bigint := coalesce((p_order->>'surcharge_night')::bigint, 0);
  v_sur_rain bigint := coalesce((p_order->>'surcharge_rain')::bigint, 0);
  v_sur_dist bigint := coalesce((p_order->>'surcharge_distance')::bigint, 0);
  v_sur_express bigint := coalesce((p_order->>'surcharge_express')::bigint, 0);
  v_sur_weight bigint := coalesce((p_order->>'surcharge_weight')::bigint, 0);
  v_slot_date date;
  v_slot_booked boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty order'; end if;

  if v_is_return then
    if v_return_parent is null then raise exception 'return_parent_id required'; end if;
    -- Validate parent order exists and delivered
    if not exists (select 1 from orders where id = v_return_parent and status = 'delivered') then
      raise exception 'parent order not delivered';
    end if;
  end if;

  if not v_is_pickup then
    select * into v_zone from delivery_zones where id = p_order->>'zone_id' and active;
    if not found then raise exception 'zone unavailable'; end if;
  else
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then raise exception 'zone unavailable'; end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons where code = v_code and active;
    if not found then raise exception 'unknown coupon'; end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then raise exception 'coupon not started'; end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then raise exception 'coupon expired'; end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then raise exception 'coupon limit reached'; end if;
    if not v_is_pickup and v_coupon.zone_id is not null and v_coupon.zone_id <> v_zone.id then raise exception 'coupon not valid for this zone'; end if;
    v_has_coupon := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then raise exception 'bad quantity'; end if;
    select * into v_product from products where id = (v_item->>'product_id')::uuid and status = 'published' and active and in_stock;
    if not found then raise exception 'product unavailable'; end if;
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then raise exception 'shop unavailable'; end if;
      if not v_shop.is_open and not v_is_return then raise exception 'shop closed'; end if;
      if not v_is_pickup and not v_is_return and not (v_zone.id = any (v_shop.zone_ids)) then raise exception 'shop does not deliver to zone'; end if;
    elsif v_product.shop_id <> v_shop.id then raise exception 'order mixes multiple shops'; end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id) then v_eligible := v_eligible + v_product.price * v_qty; end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants where id = v_variant_id and product_id = v_product.id and active for update;
      if not found then raise exception 'variant unavailable'; end if;
      if not v_is_return then
        v_available := v_variant.stock - v_variant.reserved;
        if v_available < v_qty then raise exception 'only % left of "%"', greatest(0, v_available), v_product.name; end if;
        update product_variants set reserved = reserved + v_qty where id = v_variant.id;
      end if;
    end if;
  end loop;

  if v_subtotal <= 0 then raise exception 'empty order'; end if;
  if not v_is_pickup and not v_is_return and v_zone.id = 'z4' and v_subtotal < 50000 then raise exception 'Zone D requires minimum ৳500 order'; end if;

  -- Slot capacity check for scheduled
  if v_scheduled_at is not null and v_window <> '' and not v_is_pickup and not v_is_return then
    v_slot_date := (v_scheduled_at)::date;
    if v_slot_date is not null then
      select ps_book_delivery_slot(v_slot_date, v_window) into v_slot_booked;
      if not v_slot_booked then raise exception 'Delivery slot full for % % - choose another window', v_slot_date, v_window; end if;
    end if;
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then raise exception 'coupon minimum not met'; end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then raise exception 'coupon does not apply'; end if;
    if v_coupon.type = 'fixed' then v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then v_discount := least(v_discount, v_coupon.max_discount); end if;
    else v_discount := 0; end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  elsif v_is_return then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    v_discount := 0;
    v_tip := 0;
  else
    select count(*) into v_total_orders from orders;
    if v_total_orders < 1000 then v_charge := 0;
    else
      v_free_threshold := ps_setting_int('free_delivery_threshold_paisa', 100000);
      if v_zone.id = 'z1' and v_subtotal >= 60000 then v_charge := 0;
      elsif v_zone.id = 'z2' and v_subtotal >= 80000 then v_charge := 0;
      elsif v_zone.id = 'z4' and v_subtotal >= 150000 then v_charge := 0;
      elsif v_subtotal >= v_free_threshold then v_charge := 0;
      else v_charge := v_zone.charge + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
      end if;
    end if;
    if v_has_coupon and v_coupon.type = 'free_delivery' then v_charge := 0; end if;
    if v_charge = 0 then v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0; end if;
  end if;

  if v_is_return then
    v_total := 0; -- no charge for return pickup, refund handled separately
  else
    v_total := v_subtotal - v_discount + v_charge + v_tip;
  end if;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express, is_pickup, is_return,
    return_reason, return_parent_id, return_status,
    pickup_slot,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    tip_amount, weight_kg,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    trim(p_order->>'area'), coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window,''),
    v_is_express, v_is_pickup, v_is_return,
    nullif(v_return_reason,''), v_return_parent,
    case when v_is_return then 'requested' else null end,
    nullif(v_pickup_slot,''),
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_tip, v_weight,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', case when v_is_return then 'pending' else 'pending' end
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    insert into order_items (order_id, product_id, variant_id, name, sku, variant, unit_price, qty) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = '' then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku, coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (v_order_id, 'pending', 'Placed Sunamganj Sadar pickup=' || v_is_pickup::text || ' return=' || v_is_return::text || ' tip=' || v_tip::text || ' geo=' || coalesce(v_lat::text,'no') || ',' || coalesce(v_lng::text,'no') || ' scheduled=' || coalesce(v_scheduled_at::text, v_window, 'now'));

  return v_order_id;
end $$;

commit;

-- ============================================================================
-- MIGRATION 18/23 — customer accounts (phone+password smart card)  (source: supabase/migrations/202609110004_customer_accounts.sql)
-- ============================================================================

-- 202609110004 — Customer accounts (no-verification) + sessions
-- Smart Card (loyalty stamps) need a real account per customer:
-- signup is instant (no email/OTP verification), login by phone + password.
-- Self-contained for its own tables; service role bypasses RLS, so the API
-- routes are the only door in — anon/authenticated clients get nothing.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null unique check (phone ~ '^[0-9]{11}$'), -- normalized: 01XXXXXXXXX
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_sessions (
  token text primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create index if not exists idx_customer_sessions_customer
  on public.customer_sessions (customer_id);
create index if not exists idx_customer_sessions_expires
  on public.customer_sessions (expires_at);

-- Lock down: no anon/authenticated policies on purpose (service role only).
alter table public.customers enable row level security;
alter table public.customer_sessions enable row level security;

-- Housekeeping: drop expired sessions (call from pg_cron if available).
create or replace function public.ps_purge_customer_sessions()
returns void language sql as $$
  delete from public.customer_sessions where expires_at <= now();
$$;

-- ============================================================================
-- MIGRATION 19/23 — media videos  (source: supabase/migrations/202609110006_media_video.sql)
-- ============================================================================

-- Product + library videos (Cloudinary mp4, Google Drive embeds).
--
--   - product_media.type gains 'video' alongside 'image' / 'youtube'.
--     Cloudinary/direct mp4s and Drive preview embeds are stored as 'video'
--     rows; the gallery plays them, cards keep using the image cover.
--   - media_library gains media_type ('image' | 'video' | 'youtube') so the
--     admin shelf can hold reusable video links too.
--
-- IMPORTANT: ALTER TYPE … ADD VALUE cannot run inside a transaction block,
-- so this migration has NO begin/commit wrapper. In the Supabase SQL editor,
-- run the whole file at once (each statement auto-commits).
-- Safe to re-run (IF NOT EXISTS guards).

alter type ps_media_type add value if not exists 'video';

alter table media_library
  add column if not exists media_type text not null default 'image'
  check (media_type in ('image', 'video', 'youtube'));

-- ============================================================================
-- MIGRATION 20/23 — FLAT DELIVERY 60 (recreates ps_place_order)  (source: supabase/migrations/202609120007_flat_delivery.sql)
-- ============================================================================

-- ============================================================================
-- FLAT DELIVERY (2026-09-12): ৳60 everywhere, no promos.
-- ============================================================================
-- SUPERSEDES the pricing rule in 202609110005. Owner decision, 2026-09-12:
--   • Delivery is a flat ৳60 (6000 paisa) in EVERY zone — no price tiers.
--   • Night / rain / express / weight surcharges still apply (server-computed).
--   • Store pickup and free-delivery coupons ride free.
--   • NO launch offer, NO ৳1000+ always-free threshold, NO per-user
--     first-10-free.
--   • Zone rows stay for naming / ETA / the Zone-D minimum-order rule only;
--     their `charge` column is informational under the flat model.
--
-- Safe to re-run (idempotent). Run this INSTEAD of the pricing parts of
-- 202609100003 / 202609110005 (which are superseded).
-- ============================================================================

begin;

-- Flatten the zone charge column so every record agrees with the flat rule.
update delivery_zones set charge = 6000 where active;

-- Columns referenced below must exist even on partially-migrated databases.
alter table orders add column if not exists lat double precision;
alter table orders add column if not exists lng double precision;
alter table orders add column if not exists distance_km double precision;
alter table orders add column if not exists scheduled_at timestamptz;
alter table orders add column if not exists delivery_window text;
alter table orders add column if not exists is_express boolean not null default false;
alter table orders add column if not exists is_pickup boolean not null default false;
alter table orders add column if not exists pickup_slot text;
alter table orders add column if not exists tip_amount bigint not null default 0;
alter table orders add column if not exists weight_kg double precision;
alter table orders add column if not exists surcharge_night bigint not null default 0;
alter table orders add column if not exists surcharge_rain bigint not null default 0;
alter table orders add column if not exists surcharge_distance bigint not null default 0;
alter table orders add column if not exists surcharge_express bigint not null default 0;
alter table orders add column if not exists surcharge_weight bigint not null default 0;

-- ----------------------------------------------------------------------------
-- ps_place_order — flat version:
--   pickup / free-delivery coupon → charge 0 (all surcharges dropped)
--   otherwise                    → ৳60 flat + night + rain + distance + express + weight
--   total                        → subtotal - discount + charge + tip
--   (surcharge amounts arrive SERVER-COMPUTED from the API validator)
-- ----------------------------------------------------------------------------
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_lat double precision := nullif(p_order->>'lat', '')::double precision;
  v_lng double precision := nullif(p_order->>'lng', '')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km', '')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at', '')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_pickup_slot text := nullif(trim(coalesce(p_order->>'pickup_slot', '')), '');
  v_tip bigint := greatest(0, least(50000, coalesce((p_order->>'tip_amount')::bigint, 0)));
  v_weight double precision := nullif(p_order->>'weight_kg', '')::double precision;
  v_sur_night bigint := greatest(0, coalesce((p_order->>'surcharge_night')::bigint, 0));
  v_sur_rain bigint := greatest(0, coalesce((p_order->>'surcharge_rain')::bigint, 0));
  v_sur_dist bigint := greatest(0, coalesce((p_order->>'surcharge_distance')::bigint, 0));
  v_sur_express bigint := greatest(0, coalesce((p_order->>'surcharge_express')::bigint, 0));
  v_sur_weight bigint := greatest(0, coalesce((p_order->>'surcharge_weight')::bigint, 0));
  v_para text := coalesce(trim(p_order->>'para'), trim(p_order->>'area'), '');
  v_district text := coalesce(trim(p_order->>'district'), 'Sunamganj');
  v_upazila text := coalesce(trim(p_order->>'upazila'), 'Sunamganj Sadar');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found and not v_is_pickup then
    raise exception 'zone unavailable';
  end if;
  if not found and v_is_pickup then
    -- Pickup happens at the hub; record the first active zone, charge nothing.
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then
      raise exception 'zone unavailable';
    end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line, resolve the shop, reserve variant stock under locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not v_is_pickup and not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Outside Sunamganj Sadar (other upazila / other district) minimum ৳500.
  if not v_is_pickup and v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := 0; -- free_delivery coupon waives the charge below
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- ------------------------------------------------------------------
  -- FLAT RULE: pickup and free-delivery coupons ride free. Otherwise
  -- ৳60 flat + server-computed surcharges (night/rain/distance/express/weight).
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    v_charge := 6000 + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_charge + v_tip;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_subtotal, v_charge, v_discount,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  insert into order_status_history (order_id, status, note)
  values (
    v_order_id, 'pending',
    'Placed via checkout — ' || v_district || ' / ' || v_upazila || ' / '
      || nullif(v_para, '') || ' | zone=' || v_zone.id
      || ' | flat60=' || (v_charge = 6000)::text
      || ' | pickup=' || v_is_pickup::text
      || ' | coupon_free=' || (v_has_coupon and v_coupon.type = 'free_delivery')::text
      || ' | tip=' || v_tip::text
  );

  return v_order_id;
end $$;

-- Cancel release trigger: reinstall defensively (no-op if already present).
create or replace function ps_release_on_cancel()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update product_variants v
    set reserved = greatest(0, v.reserved - oi.qty)
    from order_items oi
    where oi.order_id = new.id
      and oi.variant_id is not null
      and oi.variant_id = v.id;
  end if;
  return new;
end $$;

-- Per-user counting is no longer used for pricing; keep the phone index for tracking.
create index if not exists idx_orders_customer_phone on orders (customer_phone);

drop trigger if exists trg_orders_release_on_cancel on orders;
create trigger trg_orders_release_on_cancel
  after update on orders
  for each row execute function ps_release_on_cancel();

commit;

-- ============================================================================
-- MIGRATION 21/23 — P0 GROWTH: flash, bundle, gift, referral, price watches (recreates ps_place_order — FINAL)  (source: supabase/migrations/202609130008_growth_promos_gift_referral.sql)
-- ============================================================================

-- ============================================================================
-- P0 GROWTH (2026-09-13): flash drop + bundle sets, gift mode, referral,
-- price-drop watches.
-- ============================================================================
-- Additive and idempotent. It teaches ps_place_order four new money rules and
-- creates the four tables they need:
--
--   price_watches    who wants a call when a price drops (no email/SMS sender
--                    exists, so the promise is a human call — see P0 #5)
--   referral_codes   the shareable code a CUSTOMER ACCOUNT owns
--   referral_rewards the ledger: one credit per (code, referee phone)
--   orders.*         gift mode + the automatic-offer breakdown
--
-- Money posture: the client NEVER sends a price. It sends intents (which code,
-- gift yes/no + wrap id, which bundle discount) and the RPC re-derives the
-- money from site_settings['ops'] plus live rows, clamped to what the cart can
-- actually carry. A tampered payload loses the discount; it cannot grow one.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists price_watches (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products (id) on delete cascade,
  phone               text not null check (phone ~ '^[0-9]{11}$'),
  target_paisa        bigint check (target_paisa is null or target_paisa > 0),
  last_notified_paisa bigint,
  created_at          timestamptz not null default now(),
  unique (product_id, phone)
);
create index if not exists idx_price_watches_product on price_watches (product_id);

create table if not exists referral_codes (
  code           text primary key check (code ~ '^[A-Z0-9]{6}$'),
  customer_id    uuid references customers (id) on delete set null,
  customer_phone text,
  customer_name  text not null default '',
  created_at     timestamptz not null default now()
);

create table if not exists referral_rewards (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null references referral_codes (code) on delete cascade,
  referee_phone      text not null,
  order_id           uuid references orders (id) on delete set null,
  friend_credit      bigint not null default 0 check (friend_credit >= 0),
  referrer_coupon_id uuid references coupons (id) on delete set null,
  referrer_reward    bigint not null default 0 check (referrer_reward >= 0),
  created_at         timestamptz not null default now(),
  unique (code, referee_phone)
);
create index if not exists idx_referral_rewards_code on referral_rewards (code);
create index if not exists idx_referral_rewards_order on referral_rewards (order_id);

-- Orders: gift mode + the automatic-offer breakdown.
alter table orders add column if not exists is_gift boolean not null default false;
alter table orders add column if not exists gift_wrap text
  not null default 'none' check (gift_wrap in ('none', 'standard', 'premium'));
alter table orders add column if not exists gift_fee bigint not null default 0 check (gift_fee >= 0);
alter table orders add column if not exists gift_recipient_name text;
alter table orders add column if not exists gift_recipient_phone text;
alter table orders add column if not exists gift_message text;
alter table orders add column if not exists promo_kind text
  check (promo_kind is null or promo_kind in ('flash', 'bundle'));
alter table orders add column if not exists promo_discount bigint not null default 0 check (promo_discount >= 0);
alter table orders add column if not exists referral_code text;
alter table orders add column if not exists referral_credit bigint not null default 0 check (referral_credit >= 0);
create index if not exists idx_orders_referral_code on orders (referral_code) where referral_code is not null;

-- ----------------------------------------------------------------------------
-- 2. RLS. Watches are inserted by anonymous checkout visitors and read only by
-- staff; codes/ledger are staff-only (the storefront asks the API, which uses
-- the service role — it never exposes who shared what).
-- ----------------------------------------------------------------------------
alter table price_watches   enable row level security;
alter table referral_codes  enable row level security;
alter table referral_rewards enable row level security;

drop policy if exists "price watch public insert" on price_watches;
create policy "price watch public insert" on price_watches
  for insert with check (phone ~ '^[0-9]{11}$');

drop policy if exists "admin all price watches" on price_watches;
create policy "admin all price watches" on price_watches
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all referral codes" on referral_codes;
create policy "admin all referral codes" on referral_codes
  for all using (ps_is_admin()) with check (ps_is_admin());

drop policy if exists "admin all referral rewards" on referral_rewards;
create policy "admin all referral rewards" on referral_rewards
  for all using (ps_is_admin()) with check (ps_is_admin());

-- ----------------------------------------------------------------------------
-- 3. ps_place_order — the flat-delivery rule unchanged, plus the P0 offers.
-- ----------------------------------------------------------------------------
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_lat double precision := nullif(p_order->>'lat', '')::double precision;
  v_lng double precision := nullif(p_order->>'lng', '')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km', '')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at', '')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_pickup_slot text := nullif(trim(coalesce(p_order->>'pickup_slot', '')), '');
  v_tip bigint := greatest(0, least(50000, coalesce((p_order->>'tip_amount')::bigint, 0)));
  v_weight double precision := nullif(p_order->>'weight_kg', '')::double precision;
  v_sur_night bigint := greatest(0, coalesce((p_order->>'surcharge_night')::bigint, 0));
  v_sur_rain bigint := greatest(0, coalesce((p_order->>'surcharge_rain')::bigint, 0));
  v_sur_dist bigint := greatest(0, coalesce((p_order->>'surcharge_distance')::bigint, 0));
  v_sur_express bigint := greatest(0, coalesce((p_order->>'surcharge_express')::bigint, 0));
  v_sur_weight bigint := greatest(0, coalesce((p_order->>'surcharge_weight')::bigint, 0));
  v_para text := coalesce(trim(p_order->>'para'), trim(p_order->>'area'), '');
  v_district text := coalesce(trim(p_order->>'district'), 'Sunamganj');
  v_upazila text := coalesce(trim(p_order->>'upazila'), 'Sunamganj Sadar');
  -- P0 growth (2026-09-13): everything below is re-derived from ops settings
  -- and live rows. The client sends INTENTS only, never money.
  v_ops jsonb := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb);
  v_flash jsonb := coalesce(v_ops->'flash', '{}'::jsonb);
  v_bundle jsonb := coalesce(v_ops->'bundle', '{}'::jsonb);
  v_gift jsonb := coalesce(v_ops->'gift', '{}'::jsonb);
  v_ref jsonb := coalesce(v_ops->'referral', '{}'::jsonb);
  v_scope text := coalesce(v_flash->>'scope', 'featured');
  v_ids jsonb := coalesce(v_flash->'productIds', '[]'::jsonb);
  v_now_min int := (floor(extract(epoch from (now() at time zone 'Asia/Dhaka')) / 60)::bigint % 1440)::int;
  v_slot record;
  v_s int;
  v_e int;
  v_flash_on boolean := false;
  v_flash_pct int := 0;
  v_flash_cap bigint := 0;
  v_flash_line bigint := 0;
  v_flash_total bigint := 0;
  v_flash_discount bigint := 0;
  v_bundle_pct int := 0;
  v_bundle_discount bigint := 0;
  v_promo bigint := 0;
  v_promo_kind text := '';
  v_seen uuid[] := '{}';
  v_pieces int := 0;
  v_is_gift boolean := coalesce((p_order->>'is_gift')::boolean, false);
  v_gift_wrap text := lower(trim(coalesce(p_order->>'gift_wrap', 'none')));
  v_gift_fee bigint := 0;
  v_ref_code text := upper(trim(coalesce(p_order->>'referral_code', '')));
  v_ref_credit bigint := 0;
  v_phone text := trim(p_order->>'customer_phone');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  -- Is a flash window open right now (Asia/Dhaka)? Slots wrap midnight.
  if coalesce((v_flash->>'enabled')::boolean, false) then
    v_flash_pct := least(greatest(coalesce((v_flash->>'discountPct')::int, 0), 0), 100);
    v_flash_cap := greatest(0, coalesce((v_flash->>'maxDiscountPaisa')::bigint, 0));
    if v_flash_pct > 0 then
      for v_slot in select value from jsonb_array_elements(coalesce(v_flash->'slots', '[]'::jsonb)) loop
        if coalesce(v_slot.value->>'start', '') ~ '^[0-9]{2}:[0-9]{2}$'
           and coalesce(v_slot.value->>'end', '') ~ '^[0-9]{2}:[0-9]{2}$' then
          v_s := (left(v_slot.value->>'start', 2)::int * 60 + right(v_slot.value->>'start', 2)::int);
          v_e := (left(v_slot.value->>'end', 2)::int * 60 + right(v_slot.value->>'end', 2)::int);
          if v_s <> v_e and (
               (v_s < v_e and v_now_min >= v_s and v_now_min < v_e)
               or (v_s > v_e and (v_now_min >= v_s or v_now_min < v_e))
             ) then
            v_flash_on := true;
          end if;
        end if;
      end loop;
    end if;
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found and not v_is_pickup then
    raise exception 'zone unavailable';
  end if;
  if not found and v_is_pickup then
    -- Pickup happens at the hub; record the first active zone, charge nothing.
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then
      raise exception 'zone unavailable';
    end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line, resolve the shop, reserve variant stock under locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not v_is_pickup and not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if not (v_product.id = any (v_seen)) then
      v_seen := array_append(v_seen, v_product.id);
      v_pieces := v_pieces + 1;
    end if;
    -- Flash drop: recomputed from ops settings against the live product row.
    if v_flash_on and (
         v_scope = 'all'
         or (v_scope = 'featured' and v_product.featured)
         or (v_scope = 'selected' and exists (
              select 1 from jsonb_array_elements_text(v_ids) u
              where lower(u) = lower(v_product.id::text) or lower(u) = lower(v_product.slug)))
       ) then
      -- Cap is PER PIECE (maxDiscountPaisa), exactly what the badge quotes.
      v_flash_line := (v_product.price * v_flash_pct) / 100;
      if v_flash_cap > 0 then
        v_flash_line := least(v_flash_line, v_flash_cap);
      end if;
      v_flash_total := v_flash_total + v_flash_line * v_qty;
    end if;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Outside Sunamganj Sadar (other upazila / other district) minimum ৳500.
  if not v_is_pickup and v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := 0; -- free_delivery coupon waives the charge below
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- ------------------------------------------------------------------
  -- FLAT RULE: pickup and free-delivery coupons ride free. Otherwise
  -- ৳60 flat + server-computed surcharges (night/rain/distance/express/weight).
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    v_charge := 6000 + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- P0 automatic offers — ONE per order, best wins, ties favour the flash
  -- drop (it is time-boxed and must not lose to a code the shopper forgot
  -- to remove). Flash is recomputed here; a bundle claim is only a number
  -- from the client, so it is bounded by the configured percentage of THIS
  -- order's subtotal and by the number of distinct pieces actually in it.
  -- ------------------------------------------------------------------
  -- The cap already bit per piece in the loop; nothing else to take off.
  v_flash_discount := v_flash_total;
  v_bundle_pct := least(greatest(coalesce((v_bundle->>'discountPct')::int, 0), 0), 100);
  if coalesce((v_bundle->>'enabled')::boolean, false)
     and v_bundle_pct > 0
     and v_pieces >= 1 + greatest(1, coalesce((v_bundle->>'minComplements')::int, 1))
  then
    v_bundle_discount := least(
      greatest(0, coalesce((p_order->>'bundle_discount')::bigint, 0)),
      (v_subtotal * v_bundle_pct) / 100
    );
  end if;
  if v_flash_discount > 0 and v_flash_discount >= v_bundle_discount then
    v_promo := v_flash_discount; v_promo_kind := 'flash';
  elsif v_bundle_discount > 0 then
    v_promo := v_bundle_discount; v_promo_kind := 'bundle';
  end if;

  -- Gift wrap: the fee comes from settings by wrap id, never from the client.
  if v_is_gift and coalesce((v_gift->>'enabled')::boolean, false) then
    if v_gift_wrap = 'standard' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'standardWrapFeePaisa')::bigint, 0));
    elsif v_gift_wrap = 'premium' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'premiumWrapFeePaisa')::bigint, 0));
    else
      v_gift_wrap := 'none';
    end if;
    if v_gift_fee <= 0 then v_gift_wrap := 'none'; end if;
  else
    v_is_gift := false; v_gift_wrap := 'none'; v_gift_fee := 0;
  end if;

  -- ৳50 for a friend who brings their FIRST order: the code must be issued,
  -- the buyer must be new to the shop, this code must not have credited this
  -- phone before, and the order must clear the configured minimum.
  if v_ref_code <> '' and coalesce((v_ref->>'enabled')::boolean, false) then
    if exists (select 1 from referral_codes rc where rc.code = v_ref_code)
       and not exists (select 1 from orders o where o.customer_phone = v_phone)
       and not exists (select 1 from referral_rewards rr
                        where rr.code = v_ref_code and rr.referee_phone = v_phone)
       and v_subtotal >= greatest(0, coalesce((v_ref->>'minOrderPaisa')::bigint, 0))
    then
      v_ref_credit := greatest(0, least(
        coalesce((v_ref->>'friendRewardPaisa')::bigint, 0),
        greatest(0, v_subtotal - v_discount - v_promo)
      ));
    end if;
  end if;

  -- Discounts are capped by the goods in the cart — the total can only ever be
  -- reduced to the delivery charge + tip + wrap fee.
  if v_discount + v_promo + v_ref_credit > v_subtotal then
    v_promo := least(v_promo, greatest(0, v_subtotal - v_discount));
    v_ref_credit := least(v_ref_credit, greatest(0, v_subtotal - v_discount - v_promo));
  end if;

  v_total := greatest(0, v_subtotal - v_discount - v_promo - v_ref_credit
                        + v_charge + v_tip + v_gift_fee);

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    is_gift, gift_wrap, gift_fee, gift_recipient_name, gift_recipient_phone, gift_message,
    promo_kind, promo_discount, referral_code, referral_credit,
    subtotal, delivery_charge, discount, coupon_id, total, payment, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_is_gift, nullif(v_gift_wrap, 'none'), v_gift_fee,
    nullif(left(coalesce(trim(p_order->>'gift_recipient_name'), ''), 60), ''),
    nullif(regexp_replace(coalesce(p_order->>'gift_recipient_phone', ''), '[^0-9]', '', 'g'), ''),
    nullif(left(coalesce(trim(p_order->>'gift_message'), ''), 240), ''),
    nullif(v_promo_kind, ''), v_promo,
    case when v_ref_credit > 0 then v_ref_code else null end, v_ref_credit,
    v_subtotal, v_charge, v_discount + v_promo + v_ref_credit,
    case when v_has_coupon then v_coupon.id else null end,
    v_total, 'cod', 'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  if v_ref_credit > 0 then
    insert into referral_rewards (code, referee_phone, order_id, friend_credit)
    values (v_ref_code, v_phone, v_order_id, v_ref_credit)
    on conflict (code, referee_phone) do nothing;
  end if;

  insert into order_status_history (order_id, status, note)
  values (
    v_order_id, 'pending',
    'Placed via checkout — ' || v_district || ' / ' || v_upazila || ' / '
      || nullif(v_para, '') || ' | zone=' || v_zone.id
      || ' | flat60=' || (v_charge = 6000)::text
      || ' | pickup=' || v_is_pickup::text
      || ' | coupon_free=' || (v_has_coupon and v_coupon.type = 'free_delivery')::text
      || ' | tip=' || v_tip::text
      || ' | gift=' || coalesce(v_gift_wrap, 'none') || ':' || v_gift_fee::text
      || ' | promo=' || coalesce(nullif(v_promo_kind, ''), 'none') || ':' || v_promo::text
      || ' | ref=' || case when v_ref_credit > 0 then v_ref_code || ':' || v_ref_credit::text else 'none' end
  );

  return v_order_id;
end $$;

-- ----------------------------------------------------------------------------
-- 4. The referrer's ৳50: minted as a REAL single-use coupon when the friend's
--    order is delivered (that is the moment the referral has earned it).
--    Idempotent — one credit per (code, referee) — so a re-fired advance call
--    cannot print money.
-- ----------------------------------------------------------------------------
create or replace function ps_credit_referrer(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v orders%rowtype;
  v_cfg jsonb;
  v_rc referral_codes%rowtype;
  v_grants int;
  v_reward bigint;
  v_coupon_id uuid;
  v_coupon_code text;
begin
  select * into v from orders where id = p_order_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no order');
  end if;
  if coalesce(v.referral_code, '') = '' or v.status <> 'delivered' then
    return jsonb_build_object('granted', false, 'reason', 'not eligible');
  end if;
  if exists (select 1 from referral_rewards rr
             where rr.code = v.referral_code
               and rr.referee_phone = v.customer_phone
               and rr.referrer_coupon_id is not null) then
    return jsonb_build_object('granted', false, 'reason', 'already credited');
  end if;

  v_cfg := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb)->'referral';
  if not coalesce((v_cfg->>'enabled')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason', 'disabled');
  end if;
  select * into v_rc from referral_codes where code = v.referral_code;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown code');
  end if;
  v_reward := greatest(0, coalesce((v_cfg->>'referrerRewardPaisa')::bigint, 0));
  if v_reward <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'zero reward');
  end if;

  select count(*) into v_grants from referral_rewards rr
  where rr.code = v.referral_code and rr.referrer_coupon_id is not null;
  if v_grants >= greatest(1, coalesce((v_cfg->>'maxRewardsPerReferrer')::int, 10)) then
    return jsonb_build_object('granted', false, 'reason', 'cap reached');
  end if;

  v_coupon_code := 'PSREF' || v.referral_code || '-' || (v_grants + 1)::text;
  insert into coupons (code, type, value, min_order, valid_until, usage_limit, used, active)
  values (v_coupon_code, 'fixed', v_reward, 0, now() + interval '180 days', 1, 0, true)
  returning id into v_coupon_id;

  update referral_rewards rr
  set referrer_coupon_id = v_coupon_id, referrer_reward = v_reward
  where rr.code = v.referral_code and rr.referee_phone = v.customer_phone
    and rr.referrer_coupon_id is null;

  return jsonb_build_object('granted', true, 'code', v_coupon_code,
                            'reward', v_reward, 'name', v_rc.customer_name);
end $$;

commit;


-- ============================================================================
-- MIGRATION 22/23 — customer photos on reviews  (source: supabase/migrations/202609140001_review_photos.sql)
-- ============================================================================

-- ============================================================================
-- P1 UGC (2026-09-14): customer photos on reviews.
--
-- Clothes fit is a trust problem, and a photo of the garment on a real body
-- answers it better than any description. Photos ride their review's
-- moderation state — a pending review's photos are invisible to the public
-- read policy, exactly like the review itself.
--
-- url holds either a Cloudinary URL (when the image service is configured —
-- the review API uploads there server-side) or a compressed JPEG data URL
-- (launch scale: the shop's own Postgres carries them until Cloudinary keys
-- are set; see docs/go-live.md step 6). One review, at most 3 photos.
-- ============================================================================

begin;

create table if not exists review_photos (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references reviews (id) on delete cascade,
  url        text not null check (char_length(url) between 8 and 1_500_000),
  created_at timestamptz not null default now()
);
create index if not exists idx_review_photos_review on review_photos (review_id);

-- RLS: the storefront anon client may read photos of APPROVED reviews only
-- (same posture as the reviews table); staff see everything (moderation);
-- there is no public insert — the review API writes with the service role.
alter table review_photos enable row level security;

drop policy if exists "review photos public read" on review_photos;
create policy "review photos public read" on review_photos
  for select using (
    exists (
      select 1 from reviews r
      where r.id = review_photos.review_id and r.status = 'approved'
    )
  );

drop policy if exists "admin all review photos" on review_photos;
create policy "admin all review photos" on review_photos
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;


-- ============================================================================
-- MIGRATION 23/23 — exchange at-home pickup (rider reverse-logistics leg)  (source: supabase/migrations/202609140002_return_pickups.sql)
-- ============================================================================

-- ============================================================================
-- P1 #13 (2026-09-14): exchange at-home pickup — the rider reverse-logistics
-- leg on the 7-day exchange.
--
-- The return ORDER mechanics already exist (migration 017): ps_place_order
-- accepts is_return + return_parent_id and prices the leg at zero. What was
-- missing:
--   1. customer-side eligibility + request creation (7-day window from the
--      proven 'delivered' history entry, one return per parent);
--   2. the shop's approve/reject decision on a requested return;
--   3. the reverse leg itself: an approved return moves to
--      'ready-for-pickup' so the normal dispatch (ps_offer_order → rider
--      accept → pickup from the customer's home → drop at the shop) carries
--      it; rider pickup/drop events mirror onto return_status.
--
-- Nothing here pays anyone. A return is a zero-total, zero-charge order; the
-- exchange item or the cash goes through the shop's normal offline handling,
-- which is exactly what the statuses say out loud.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Eligibility. NULL when the customer may request; otherwise a reason code
--    the app maps to an honest message. The window is measured from the
--    latest 'delivered' entry in order_status_history — the proven moment,
--    not a guess — and a parent with a live return (requested/approved/
--    picked_up) can only ever have one.
-- ---------------------------------------------------------------------------
create or replace function ps_return_eligible(p_order_id uuid)
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
    when exists (
      select 1 from orders r
      where r.return_parent_id = p_order_id
        and r.return_status in ('requested', 'approved', 'picked_up')
    ) then 'already-requested'
    when (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) is null then 'no-delivery-record'
    when now() > (
      select max(created_at) from order_status_history h
      where h.order_id = p_order_id and h.status = 'delivered'
    ) + interval '7 days' then 'window-expired'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Customer request → the zero-charge return order via ps_place_order.
--    Items, address, zone and geo come from the parent order itself, so the
--    rider's pickup leg is exactly the doorstep the order was delivered to.
--    (ps_place_order re-validates every product — a delisted item fails
--    honestly here and the shop handles it manually.)
-- ---------------------------------------------------------------------------
create or replace function ps_create_return_request(
  p_order_id uuid,
  p_reason text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent orders%rowtype;
  v_reason text;
  v_items jsonb;
begin
  select * into v_parent from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if ps_return_eligible(p_order_id) is not null then
    raise exception 'not eligible: %', ps_return_eligible(p_order_id);
  end if;

  v_reason := left(
    trim(coalesce(p_reason, '')) || ' — ' || trim(coalesce(p_details, '')),
    500
  );
  if length(v_reason) < 5 then raise exception 'reason too short'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'qty', qty,
      'variant_id', variant_id
    )
  ), '[]'::jsonb) into v_items
  from order_items where order_id = p_order_id;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'no items on parent order';
  end if;

  return ps_place_order(jsonb_build_object(
    'customer_name', v_parent.customer_name,
    'customer_phone', v_parent.customer_phone,
    'area', v_parent.area,
    'address', v_parent.address,
    'note', 'Return pickup (' || left(coalesce(p_reason, ''), 80) || ')',
    'zone_id', v_parent.zone_id,
    'lat', v_parent.lat,
    'lng', v_parent.lng,
    'is_return', true,
    'return_parent_id', p_order_id,
    'return_reason', v_reason
  ), v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Shop decision on a REQUESTED return, and manual completion. Approving
--    moves the return order to 'ready-for-pickup' — the state ps_offer_order
--    dispatches — so the existing rider leg (offer → accept → pickup from
--    the customer's home → deliver at the shop) is the reverse logistics.
-- ---------------------------------------------------------------------------
create or replace function ps_return_action(
  p_order_id uuid,
  p_action text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
begin
  select * into v from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not coalesce(v.is_return, false) then
    raise exception 'not a return order';
  end if;

  if p_action = 'approve' then
    if v.return_status <> 'requested' then
      raise exception 'only a requested return can be approved';
    end if;
    if v.status <> 'pending' then
      raise exception 'return order already moved on';
    end if;
    update orders
    set return_status = 'approved', status = 'ready-for-pickup'
    where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, 'ready-for-pickup', 'Return approved — rider pickup ready');
  elsif p_action = 'reject' then
    if v.return_status <> 'requested' then
      raise exception 'only a requested return can be rejected';
    end if;
    update orders
    set return_status = 'rejected', status = 'cancelled'
    where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, 'cancelled',
            'Return rejected: ' || left(trim(coalesce(p_note, '')), 200));
  elsif p_action = 'complete' then
    if v.return_status not in ('approved', 'picked_up') then
      raise exception 'return leg not finished';
    end if;
    update orders set return_status = 'refunded' where id = v.id;
    insert into order_status_history (order_id, status, note)
    values (v.id, v.status,
            'Return completed by shop: ' || left(trim(coalesce(p_note, '')), 200));
  else
    raise exception 'unknown action: %', p_action;
  end if;

  return v.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Mirror the rider's leg onto return_status, so the customer's tracking
--    (and the shop) see the same truth the riders act on. The order row
--    itself still moves through the normal ps_rider_* flow.
-- ---------------------------------------------------------------------------
create or replace function ps_return_leg_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v orders%rowtype;
begin
  if new.state in ('picked_up', 'delivered')
     and old.state not in ('picked_up', 'delivered') then
    select * into v from orders where id = new.order_id;
    if found and coalesce(v.is_return, false) and v.return_status is not null then
      if new.state = 'picked_up' and v.return_status = 'approved' then
        update orders set return_status = 'picked_up' where id = v.id;
        insert into order_status_history (order_id, status, note)
        values (v.id, v.status, 'Return item picked up from the customer');
      elsif new.state = 'delivered'
            and v.return_status in ('approved', 'picked_up') then
        update orders set return_status = 'refunded' where id = v.id;
        insert into order_status_history (order_id, status, note)
        values (v.id, v.status,
                'Return item received by the shop — exchange/refund handled by the shop');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_return_leg_sync on delivery_assignments;
create trigger trg_return_leg_sync
  after update of state on delivery_assignments
  for each row execute function ps_return_leg_sync();

commit;


-- ============================================================================
-- MIGRATION 24/24 — warranty claims on accessories (P1 #14)  (source: supabase/migrations/202609140003_warranty_claims.sql)
-- ===========================================================================
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


-- ============================================================================
-- MIGRATION 25/25 — bKash/Nagad wallet payments, no merchant account (P1 #8)  (source: supabase/migrations/202609140004_wallet_payments.sql)
-- ===========================================================================
begin;

-- 1. orders: payment method + wallet verification state.
--    (constraint name from the base schema: check on the payment column)
alter table orders drop constraint if exists orders_payment_check;
alter table orders alter column payment drop not null;
alter table orders add column if not exists payment_ref text;
alter table orders add column if not exists payment_status text not null default 'verified'
  check (payment_status in ('pending_verification', 'verified', 'rejected'));
alter table orders add column if not exists payment_verified_at timestamptz;
alter table orders alter column payment set not null;
alter table orders add constraint orders_payment_check
  check (payment in ('cod', 'bkash', 'nagad'));
create index if not exists idx_orders_payment_status on orders (payment_status)
  where payment_status = 'pending_verification';

-- 2. ps_place_order — the growth-promos version (FINAL as of 202609130008)
--    unchanged except for the wallet payment intake below.
-- ----------------------------------------------------------------------------
create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_lat double precision := nullif(p_order->>'lat', '')::double precision;
  v_lng double precision := nullif(p_order->>'lng', '')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km', '')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at', '')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_pickup_slot text := nullif(trim(coalesce(p_order->>'pickup_slot', '')), '');
  v_tip bigint := greatest(0, least(50000, coalesce((p_order->>'tip_amount')::bigint, 0)));
  v_weight double precision := nullif(p_order->>'weight_kg', '')::double precision;
  v_sur_night bigint := greatest(0, coalesce((p_order->>'surcharge_night')::bigint, 0));
  v_sur_rain bigint := greatest(0, coalesce((p_order->>'surcharge_rain')::bigint, 0));
  v_sur_dist bigint := greatest(0, coalesce((p_order->>'surcharge_distance')::bigint, 0));
  v_sur_express bigint := greatest(0, coalesce((p_order->>'surcharge_express')::bigint, 0));
  v_sur_weight bigint := greatest(0, coalesce((p_order->>'surcharge_weight')::bigint, 0));
  v_para text := coalesce(trim(p_order->>'para'), trim(p_order->>'area'), '');
  v_district text := coalesce(trim(p_order->>'district'), 'Sunamganj');
  v_upazila text := coalesce(trim(p_order->>'upazila'), 'Sunamganj Sadar');
  -- P0 growth (2026-09-13): everything below is re-derived from ops settings
  -- and live rows. The client sends INTENTS only, never money.
  v_ops jsonb := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb);
  v_flash jsonb := coalesce(v_ops->'flash', '{}'::jsonb);
  v_bundle jsonb := coalesce(v_ops->'bundle', '{}'::jsonb);
  v_gift jsonb := coalesce(v_ops->'gift', '{}'::jsonb);
  v_ref jsonb := coalesce(v_ops->'referral', '{}'::jsonb);
  v_scope text := coalesce(v_flash->>'scope', 'featured');
  v_ids jsonb := coalesce(v_flash->'productIds', '[]'::jsonb);
  v_now_min int := (floor(extract(epoch from (now() at time zone 'Asia/Dhaka')) / 60)::bigint % 1440)::int;
  v_slot record;
  v_s int;
  v_e int;
  v_flash_on boolean := false;
  v_flash_pct int := 0;
  v_flash_cap bigint := 0;
  v_flash_line bigint := 0;
  v_flash_total bigint := 0;
  v_flash_discount bigint := 0;
  v_bundle_pct int := 0;
  v_bundle_discount bigint := 0;
  v_promo bigint := 0;
  v_promo_kind text := '';
  v_seen uuid[] := '{}';
  v_pieces int := 0;
  v_is_gift boolean := coalesce((p_order->>'is_gift')::boolean, false);
  v_gift_wrap text := lower(trim(coalesce(p_order->>'gift_wrap', 'none')));
  v_gift_fee bigint := 0;
  v_ref_code text := upper(trim(coalesce(p_order->>'referral_code', '')));
  v_ref_credit bigint := 0;
  v_phone text := trim(p_order->>'customer_phone');
  -- P1 #8 (2026-09-14): wallet payments WITHOUT a merchant account — the
  -- customer sends the total to the shop's own bKash/Nagad number and
  -- shares the TRXID. The shop verifies it (ps_verify_payment) before the
  -- order may start fulfilment; COD stays the no-friction default.
  v_payment text := lower(trim(coalesce(p_order->>'payment_method', 'cod')));
  v_payment_ref text := upper(trim(coalesce(p_order->>'payment_ref', '')));
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  -- Is a flash window open right now (Asia/Dhaka)? Slots wrap midnight.
  if coalesce((v_flash->>'enabled')::boolean, false) then
    v_flash_pct := least(greatest(coalesce((v_flash->>'discountPct')::int, 0), 0), 100);
    v_flash_cap := greatest(0, coalesce((v_flash->>'maxDiscountPaisa')::bigint, 0));
    if v_flash_pct > 0 then
      for v_slot in select value from jsonb_array_elements(coalesce(v_flash->'slots', '[]'::jsonb)) loop
        if coalesce(v_slot.value->>'start', '') ~ '^[0-9]{2}:[0-9]{2}$'
           and coalesce(v_slot.value->>'end', '') ~ '^[0-9]{2}:[0-9]{2}$' then
          v_s := (left(v_slot.value->>'start', 2)::int * 60 + right(v_slot.value->>'start', 2)::int);
          v_e := (left(v_slot.value->>'end', 2)::int * 60 + right(v_slot.value->>'end', 2)::int);
          if v_s <> v_e and (
               (v_s < v_e and v_now_min >= v_s and v_now_min < v_e)
               or (v_s > v_e and (v_now_min >= v_s or v_now_min < v_e))
             ) then
            v_flash_on := true;
          end if;
        end if;
      end loop;
    end if;
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found and not v_is_pickup then
    raise exception 'zone unavailable';
  end if;
  if not found and v_is_pickup then
    -- Pickup happens at the hub; record the first active zone, charge nothing.
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then
      raise exception 'zone unavailable';
    end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line, resolve the shop, reserve variant stock under locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open then
        raise exception 'shop closed';
      end if;
      if not v_is_pickup and not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if not (v_product.id = any (v_seen)) then
      v_seen := array_append(v_seen, v_product.id);
      v_pieces := v_pieces + 1;
    end if;
    -- Flash drop: recomputed from ops settings against the live product row.
    if v_flash_on and (
         v_scope = 'all'
         or (v_scope = 'featured' and v_product.featured)
         or (v_scope = 'selected' and exists (
              select 1 from jsonb_array_elements_text(v_ids) u
              where lower(u) = lower(v_product.id::text) or lower(u) = lower(v_product.slug)))
       ) then
      -- Cap is PER PIECE (maxDiscountPaisa), exactly what the badge quotes.
      v_flash_line := (v_product.price * v_flash_pct) / 100;
      if v_flash_cap > 0 then
        v_flash_line := least(v_flash_line, v_flash_cap);
      end if;
      v_flash_total := v_flash_total + v_flash_line * v_qty;
    end if;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      v_available := v_variant.stock - v_variant.reserved;
      if v_available < v_qty then
        raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
      end if;
      update product_variants
      set reserved = reserved + v_qty
      where id = v_variant.id;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Outside Sunamganj Sadar (other upazila / other district) minimum ৳500.
  if not v_is_pickup and v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := 0; -- free_delivery coupon waives the charge below
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- ------------------------------------------------------------------
  -- FLAT RULE: pickup and free-delivery coupons ride free. Otherwise
  -- ৳60 flat + server-computed surcharges (night/rain/distance/express/weight).
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    v_charge := 6000 + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- P0 automatic offers — ONE per order, best wins, ties favour the flash
  -- drop (it is time-boxed and must not lose to a code the shopper forgot
  -- to remove). Flash is recomputed here; a bundle claim is only a number
  -- from the client, so it is bounded by the configured percentage of THIS
  -- order's subtotal and by the number of distinct pieces actually in it.
  -- ------------------------------------------------------------------
  -- The cap already bit per piece in the loop; nothing else to take off.
  v_flash_discount := v_flash_total;
  v_bundle_pct := least(greatest(coalesce((v_bundle->>'discountPct')::int, 0), 0), 100);
  if coalesce((v_bundle->>'enabled')::boolean, false)
     and v_bundle_pct > 0
     and v_pieces >= 1 + greatest(1, coalesce((v_bundle->>'minComplements')::int, 1))
  then
    v_bundle_discount := least(
      greatest(0, coalesce((p_order->>'bundle_discount')::bigint, 0)),
      (v_subtotal * v_bundle_pct) / 100
    );
  end if;
  if v_flash_discount > 0 and v_flash_discount >= v_bundle_discount then
    v_promo := v_flash_discount; v_promo_kind := 'flash';
  elsif v_bundle_discount > 0 then
    v_promo := v_bundle_discount; v_promo_kind := 'bundle';
  end if;

  -- Gift wrap: the fee comes from settings by wrap id, never from the client.
  if v_is_gift and coalesce((v_gift->>'enabled')::boolean, false) then
    if v_gift_wrap = 'standard' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'standardWrapFeePaisa')::bigint, 0));
    elsif v_gift_wrap = 'premium' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'premiumWrapFeePaisa')::bigint, 0));
    else
      v_gift_wrap := 'none';
    end if;
    if v_gift_fee <= 0 then v_gift_wrap := 'none'; end if;
  else
    v_is_gift := false; v_gift_wrap := 'none'; v_gift_fee := 0;
  end if;

  -- ৳50 for a friend who brings their FIRST order: the code must be issued,
  -- the buyer must be new to the shop, this code must not have credited this
  -- phone before, and the order must clear the configured minimum.
  if v_ref_code <> '' and coalesce((v_ref->>'enabled')::boolean, false) then
    if exists (select 1 from referral_codes rc where rc.code = v_ref_code)
       and not exists (select 1 from orders o where o.customer_phone = v_phone)
       and not exists (select 1 from referral_rewards rr
                        where rr.code = v_ref_code and rr.referee_phone = v_phone)
       and v_subtotal >= greatest(0, coalesce((v_ref->>'minOrderPaisa')::bigint, 0))
    then
      v_ref_credit := greatest(0, least(
        coalesce((v_ref->>'friendRewardPaisa')::bigint, 0),
        greatest(0, v_subtotal - v_discount - v_promo)
      ));
    end if;
  end if;

  -- Discounts are capped by the goods in the cart — the total can only ever be
  -- reduced to the delivery charge + tip + wrap fee.
  if v_discount + v_promo + v_ref_credit > v_subtotal then
    v_promo := least(v_promo, greatest(0, v_subtotal - v_discount));
    v_ref_credit := least(v_ref_credit, greatest(0, v_subtotal - v_discount - v_promo));
  end if;

  v_total := greatest(0, v_subtotal - v_discount - v_promo - v_ref_credit
                        + v_charge + v_tip + v_gift_fee);

  -- Wallet payment proof (P1 #8): the wallet must be configured in the ops
  -- settings, and the TRXID is what the shop matches against its own wallet
  -- history. A fake method or a missing TRXID fails the whole order here.
  if v_payment not in ('cod', 'bkash', 'nagad') then
    raise exception 'unknown payment method';
  end if;
  if v_payment in ('bkash', 'nagad') then
    if coalesce(v_ops->'wallets'->>v_payment, '') = '' then
      raise exception '% is not available right now — please use cash on delivery',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
    if v_payment_ref !~ '^[A-Za-z0-9]{6,32}$' then
      raise exception 'enter the transaction ID (TRXID) from % after sending the money',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
  end if;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    is_gift, gift_wrap, gift_fee, gift_recipient_name, gift_recipient_phone, gift_message,
    promo_kind, promo_discount, referral_code, referral_credit,
    subtotal, delivery_charge, discount, coupon_id, total,
    payment, payment_ref, payment_status, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_is_gift, nullif(v_gift_wrap, 'none'), v_gift_fee,
    nullif(left(coalesce(trim(p_order->>'gift_recipient_name'), ''), 60), ''),
    nullif(regexp_replace(coalesce(p_order->>'gift_recipient_phone', ''), '[^0-9]', '', 'g'), ''),
    nullif(left(coalesce(trim(p_order->>'gift_message'), ''), 240), ''),
    nullif(v_promo_kind, ''), v_promo,
    case when v_ref_credit > 0 then v_ref_code else null end, v_ref_credit,
    v_subtotal, v_charge, v_discount + v_promo + v_ref_credit,
    case when v_has_coupon then v_coupon.id else null end,
    v_total,
    v_payment,
    case when v_payment in ('bkash', 'nagad') then v_payment_ref else null end,
    case when v_payment in ('bkash', 'nagad') then 'pending_verification' else 'verified' end,
    'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  if v_ref_credit > 0 then
    insert into referral_rewards (code, referee_phone, order_id, friend_credit)
    values (v_ref_code, v_phone, v_order_id, v_ref_credit)
    on conflict (code, referee_phone) do nothing;
  end if;

  insert into order_status_history (order_id, status, note)
  values (
    v_order_id, 'pending',
    'Placed via checkout — ' || v_district || ' / ' || v_upazila || ' / '
      || nullif(v_para, '') || ' | zone=' || v_zone.id
      || ' | flat60=' || (v_charge = 6000)::text
      || ' | pickup=' || v_is_pickup::text
      || ' | coupon_free=' || (v_has_coupon and v_coupon.type = 'free_delivery')::text
      || ' | tip=' || v_tip::text
      || ' | gift=' || coalesce(v_gift_wrap, 'none') || ':' || v_gift_fee::text
      || ' | promo=' || coalesce(nullif(v_promo_kind, ''), 'none') || ':' || v_promo::text
      || ' | ref=' || case when v_ref_credit > 0 then v_ref_code || ':' || v_ref_credit::text else 'none' end
      || ' | pay=' || v_payment || case when v_payment in ('bkash','nagad') then ':' || v_payment_ref else '' end
  );

  return v_order_id;
end $$;

-- ----------------------------------------------------------------------------
-- 3. ps_advance_order — current state machine (marketplace_shops version)
--    plus the wallet-payment fulfilment gate.
-- ----------------------------------------------------------------------------
create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
  v_is_admin boolean;
  v_shop uuid;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if p_to not in ('confirmed', 'preparing', 'ready-for-pickup', 'cancelled') then
      raise exception 'forbidden';
    end if;
  end if;

  -- P1 #8: a bKash/Nagad order may not START FULFILMENT before the shop has
  -- verified the payment in its own wallet (ps_verify_payment flips
  -- payment_status to 'verified'). 'confirmed' and 'cancelled' stay legal —
  -- canceling releases the reservation via trg_orders_release_on_cancel.
  if v_order.payment in ('bkash', 'nagad')
     and v_order.payment_status = 'pending_verification'
     and p_to in ('preparing', 'ready-for-pickup', 'courier-assigned', 'out-for-delivery', 'delivered') then
    raise exception 'payment not verified';
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null or v_to_pos <> v_from_pos + 1 then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  update orders set status = p_to, updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  return v_order;
end $$;

-- ----------------------------------------------------------------------------
-- 4. ps_verify_payment — the shop's decision on a wallet payment.
--    'verified' unlocks fulfilment; 'rejected' cancels + releases stock.
-- ----------------------------------------------------------------------------
create or replace function ps_verify_payment(p_order_id uuid, p_action text, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_is_admin boolean;
  v_shop uuid;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Same auth model as ps_advance_order: staff or the owning shop.
  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
  end if;

  if v_order.payment = 'cod' then
    raise exception 'not a wallet payment';
  end if;
  if v_order.payment_status <> 'pending_verification' then
    raise exception 'payment already decided';
  end if;

  if p_action = 'verified' then
    -- The shop checked its own bKash/Nagad wallet: the money is in, this is
    -- the moment the order may start fulfilment.
    update orders
    set payment_status = 'verified', payment_verified_at = now(), updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, v_order.status,
      upper(left(v_order.payment, 1)) || right(v_order.payment, length(v_order.payment) - 1) || ' payment verified',
      auth.uid());
  elsif p_action = 'rejected' then
    -- No matching money in the wallet: the order is cancelled and the
    -- reservation goes back to the shelf (trg_orders_release_on_cancel).
    -- The refund to the customer's wallet is the shop's offline handling.
    update orders
    set payment_status = 'rejected', payment_verified_at = now(),
        status = 'cancelled', updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, 'cancelled',
      'Payment rejected' || coalesce(' — ' || trim(coalesce(p_note, '')), '') ||
      ' (refund from the shop wallet, offline)',
      auth.uid());
  else
    raise exception 'unknown payment action';
  end if;

  return (select * from orders where id = p_order_id);
end $$;

commit;

-- ============================================================================
-- MIGRATION 26/26 — live shopping sessions (P1 #9)  (source: supabase/migrations/202609140005_live_shopping.sql)
-- ===========================================================================
begin;

create table live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 500),
  -- The shop's live URL (YouTube Live, Facebook Live, …). May be empty for a
  -- freshly scheduled session — the link is often only known once the stream
  -- exists, and scheduled sessions are editable until they start.
  stream_url text not null default '' check (char_length(stream_url) <= 500),
  scheduled_start timestamptz not null,
  -- When the shop actually tapped start / ended — the honest timestamps.
  live_at timestamptz,
  ended_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'ended')),
  -- The one piece on air right now (null = not set / session not live).
  showing_product_id uuid references products (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- state consistency, enforced in one place
  constraint live_sessions_state check (
    case
      when status = 'scheduled' then (live_at is null and ended_at is null)
      when status = 'live'      then (live_at is not null and ended_at is null)
      when status = 'ended'     then (ended_at is not null)
    end
  )
);

create table live_session_products (
  session_id uuid not null references live_sessions (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  position int not null check (position between 1 and 30),
  primary key (session_id, product_id),
  unique (session_id, position)
);

create index idx_live_sessions_status on live_sessions (status, scheduled_start);
create index idx_live_session_products_pos on live_session_products (session_id, position);

alter table live_sessions enable row level security;
alter table live_session_products enable row level security;

-- Keep updated_at honest (the schema's own trigger helper).
drop trigger if exists trg_live_sessions_touch on live_sessions;
create trigger trg_live_sessions_touch
  before update on live_sessions
  for each row execute function ps_touch_updated();

commit;


-- ============================================================================
-- MIGRATION 27/27 — wallet-aware delivery cash (P1 #8 follow-up)  (source: supabase/migrations/202609140006_wallet_delivery_cash.sql)
-- ===========================================================================
begin;

create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- P1 #8: the rider only ever carries cash for COD orders — a wallet order
  -- was paid into the shop's own bKash/Nagad wallet at checkout.
  v_cash := case when v_order.payment = 'cod' then v_order.total else 0 end;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · '
        || case
             when v_order.payment = 'bkash' then 'paid via bKash at checkout'
             when v_order.payment = 'nagad' then 'paid via Nagad at checkout'
             else 'COD collected'
           end,
      auth.uid()
    );
  end if;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

commit;

begin;

create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
  v_is_admin boolean;
  v_shop uuid;
  v_payment_rejected boolean;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if p_to not in ('confirmed', 'preparing', 'ready-for-pickup', 'cancelled') then
      raise exception 'forbidden';
    end if;
  end if;

  -- P1 #8: a bKash/Nagad order may not START FULFILMENT before the shop has
  -- verified the payment in its own wallet (ps_verify_payment flips
  -- payment_status to 'verified'). 'confirmed' and 'cancelled' stay legal —
  -- canceling releases the reservation via trg_orders_release_on_cancel.
  if v_order.payment in ('bkash', 'nagad')
     and v_order.payment_status = 'pending_verification'
     and p_to in ('preparing', 'ready-for-pickup', 'courier-assigned', 'out-for-delivery', 'delivered') then
    raise exception 'payment not verified';
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null or v_to_pos <> v_from_pos + 1 then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  -- P1 #8 (2): a cancelled wallet order's payment is settled as REJECTED —
  -- the customer's track page says "not accepted", never "under
  -- verification" on a cancelled order.
  v_payment_rejected := p_to = 'cancelled'
    and v_order.payment in ('bkash', 'nagad')
    and v_order.payment_status = 'pending_verification';

  update orders
  set status = p_to,
      payment_status = case when v_payment_rejected then 'rejected' else payment_status end,
      payment_verified_at = case when v_payment_rejected then now() else payment_verified_at end,
      updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  if v_payment_rejected then
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, p_to,
      'Payment rejected — order cancelled (refund from the shop wallet, offline)',
      auth.uid());
  end if;
  return v_order;
end $$;

create or replace function ps_verify_payment(p_order_id uuid, p_action text, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_is_admin boolean;
  v_shop uuid;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Same auth model as ps_advance_order: staff or the owning shop.
  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
  end if;

  if v_order.payment = 'cod' then
    raise exception 'not a wallet payment';
  end if;
  if v_order.payment_status <> 'pending_verification' then
    raise exception 'payment already decided';
  end if;

  -- P1 #8 (2): a cancelled order can never be VERIFIED — the order is over,
  -- the money is not in. Rows cancelled BEFORE the auto-reject rule still
  -- need a decision, so REJECT stays legal and settles them (re-setting
  -- status='cancelled' is a no-op: the release trigger only fires on the
  -- transition into cancelled, so stock cannot be released twice).
  if v_order.status = 'cancelled' and p_action = 'verified' then
    raise exception 'order already cancelled';
  end if;

  if p_action = 'verified' then
    -- The shop checked its own bKash/Nagad wallet: the money is in, this is
    -- the moment the order may start fulfilment.
    update orders
    set payment_status = 'verified', payment_verified_at = now(), updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, v_order.status,
      upper(left(v_order.payment, 1)) || right(v_order.payment, length(v_order.payment) - 1) || ' payment verified',
      auth.uid());
  elsif p_action = 'rejected' then
    -- No matching money in the wallet: the order is cancelled and the
    -- reservation goes back to the shelf (trg_orders_release_on_cancel).
    -- The refund to the customer's wallet is the shop's offline handling.
    update orders
    set payment_status = 'rejected', payment_verified_at = now(),
        status = 'cancelled', updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, 'cancelled',
      'Payment rejected' || coalesce(' — ' || trim(coalesce(p_note, '')), '') ||
      ' (refund from the shop wallet, offline)',
      auth.uid());
  else
    raise exception 'unknown payment action';
  end if;

  return (select * from orders where id = p_order_id);
end $$;

commit;

begin;

create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_lat double precision := nullif(p_order->>'lat', '')::double precision;
  v_lng double precision := nullif(p_order->>'lng', '')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km', '')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at', '')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_pickup_slot text := nullif(trim(coalesce(p_order->>'pickup_slot', '')), '');
  v_tip bigint := greatest(0, least(50000, coalesce((p_order->>'tip_amount')::bigint, 0)));
  v_weight double precision := nullif(p_order->>'weight_kg', '')::double precision;
  v_sur_night bigint := greatest(0, coalesce((p_order->>'surcharge_night')::bigint, 0));
  v_sur_rain bigint := greatest(0, coalesce((p_order->>'surcharge_rain')::bigint, 0));
  v_sur_dist bigint := greatest(0, coalesce((p_order->>'surcharge_distance')::bigint, 0));
  v_sur_express bigint := greatest(0, coalesce((p_order->>'surcharge_express')::bigint, 0));
  v_sur_weight bigint := greatest(0, coalesce((p_order->>'surcharge_weight')::bigint, 0));
  v_para text := coalesce(trim(p_order->>'para'), trim(p_order->>'area'), '');
  v_district text := coalesce(trim(p_order->>'district'), 'Sunamganj');
  v_upazila text := coalesce(trim(p_order->>'upazila'), 'Sunamganj Sadar');
  -- P0 growth (2026-09-13): everything below is re-derived from ops settings
  -- and live rows. The client sends INTENTS only, never money.
  v_ops jsonb := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb);
  v_flash jsonb := coalesce(v_ops->'flash', '{}'::jsonb);
  v_bundle jsonb := coalesce(v_ops->'bundle', '{}'::jsonb);
  v_gift jsonb := coalesce(v_ops->'gift', '{}'::jsonb);
  v_ref jsonb := coalesce(v_ops->'referral', '{}'::jsonb);
  v_scope text := coalesce(v_flash->>'scope', 'featured');
  v_ids jsonb := coalesce(v_flash->'productIds', '[]'::jsonb);
  v_now_min int := (floor(extract(epoch from (now() at time zone 'Asia/Dhaka')) / 60)::bigint % 1440)::int;
  v_slot record;
  v_s int;
  v_e int;
  v_flash_on boolean := false;
  v_flash_pct int := 0;
  v_flash_cap bigint := 0;
  v_flash_line bigint := 0;
  v_flash_total bigint := 0;
  v_flash_discount bigint := 0;
  v_bundle_pct int := 0;
  v_bundle_discount bigint := 0;
  v_promo bigint := 0;
  v_promo_kind text := '';
  v_seen uuid[] := '{}';
  v_pieces int := 0;
  v_is_gift boolean := coalesce((p_order->>'is_gift')::boolean, false);
  v_gift_wrap text := lower(trim(coalesce(p_order->>'gift_wrap', 'none')));
  v_gift_fee bigint := 0;
  v_ref_code text := upper(trim(coalesce(p_order->>'referral_code', '')));
  v_ref_credit bigint := 0;
  v_phone text := trim(p_order->>'customer_phone');
  -- P1 #8 (2026-09-14): wallet payments WITHOUT a merchant account — the
  -- customer sends the total to the shop's own bKash/Nagad number and
  -- shares the TRXID. The shop verifies it (ps_verify_payment) before the
  -- order may start fulfilment; COD stays the no-friction default.
  v_payment text := lower(trim(coalesce(p_order->>'payment_method', 'cod')));
  v_payment_ref text := upper(trim(coalesce(p_order->>'payment_ref', '')));
  -- P1 #13 (restored in 202609140008): zero-charge return pickup orders.
  -- ps_create_return_request passes these keys; the flat/growth/wallet
  -- re-creations of this function dropped the handling, which silently turned
  -- every "return request" into a full-price COD order that could be
  -- requested without limit and never approved.
  v_is_return boolean := coalesce((p_order->>'is_return')::boolean, false);
  v_return_parent uuid := nullif(p_order->>'return_parent_id', '')::uuid;
  v_return_reason text := coalesce(trim(p_order->>'return_reason'), '');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  if v_is_return then
    if v_return_parent is null then
      raise exception 'return_parent_id required';
    end if;
    if not exists (select 1 from orders where id = v_return_parent and status = 'delivered') then
      raise exception 'parent order not delivered';
    end if;
  end if;

  -- Is a flash window open right now (Asia/Dhaka)? Slots wrap midnight.
  if coalesce((v_flash->>'enabled')::boolean, false) then
    v_flash_pct := least(greatest(coalesce((v_flash->>'discountPct')::int, 0), 0), 100);
    v_flash_cap := greatest(0, coalesce((v_flash->>'maxDiscountPaisa')::bigint, 0));
    if v_flash_pct > 0 then
      for v_slot in select value from jsonb_array_elements(coalesce(v_flash->'slots', '[]'::jsonb)) loop
        if coalesce(v_slot.value->>'start', '') ~ '^[0-9]{2}:[0-9]{2}$'
           and coalesce(v_slot.value->>'end', '') ~ '^[0-9]{2}:[0-9]{2}$' then
          v_s := (left(v_slot.value->>'start', 2)::int * 60 + right(v_slot.value->>'start', 2)::int);
          v_e := (left(v_slot.value->>'end', 2)::int * 60 + right(v_slot.value->>'end', 2)::int);
          if v_s <> v_e and (
               (v_s < v_e and v_now_min >= v_s and v_now_min < v_e)
               or (v_s > v_e and (v_now_min >= v_s or v_now_min < v_e))
             ) then
            v_flash_on := true;
          end if;
        end if;
      end loop;
    end if;
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found and not v_is_pickup then
    raise exception 'zone unavailable';
  end if;
  if not found and v_is_pickup then
    -- Pickup happens at the hub; record the first active zone, charge nothing.
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then
      raise exception 'zone unavailable';
    end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line, resolve the shop, reserve variant stock under locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open and not v_is_return then
        raise exception 'shop closed';
      end if;
      if not v_is_pickup and not v_is_return and not (v_zone.id = any (v_shop.zone_ids)) then
        raise exception 'shop does not deliver to zone';
      end if;
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if not (v_product.id = any (v_seen)) then
      v_seen := array_append(v_seen, v_product.id);
      v_pieces := v_pieces + 1;
    end if;
    -- Flash drop: recomputed from ops settings against the live product row.
    if v_flash_on and (
         v_scope = 'all'
         or (v_scope = 'featured' and v_product.featured)
         or (v_scope = 'selected' and exists (
              select 1 from jsonb_array_elements_text(v_ids) u
              where lower(u) = lower(v_product.id::text) or lower(u) = lower(v_product.slug)))
       ) then
      -- Cap is PER PIECE (maxDiscountPaisa), exactly what the badge quotes.
      v_flash_line := (v_product.price * v_flash_pct) / 100;
      if v_flash_cap > 0 then
        v_flash_line := least(v_flash_line, v_flash_cap);
      end if;
      v_flash_total := v_flash_total + v_flash_line * v_qty;
    end if;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      if not v_is_return then
        -- A return is coming back to the shelf — it must not reserve stock
        -- a second time.
        v_available := v_variant.stock - v_variant.reserved;
        if v_available < v_qty then
          raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
        end if;
        update product_variants
        set reserved = reserved + v_qty
        where id = v_variant.id;
      end if;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Outside Sunamganj Sadar (other upazila / other district) minimum ৳500.
  if not v_is_pickup and not v_is_return and v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := 0; -- free_delivery coupon waives the charge below
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- ------------------------------------------------------------------
  -- FLAT RULE: pickup and free-delivery coupons ride free. Otherwise
  -- ৳60 flat + server-computed surcharges (night/rain/distance/express/weight).
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  elsif v_is_return then
    -- Return pickup is free: the rider's leg is the shop's reverse logistics.
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    v_charge := 6000 + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- P0 automatic offers — ONE per order, best wins, ties favour the flash
  -- drop (it is time-boxed and must not lose to a code the shopper forgot
  -- to remove). Flash is recomputed here; a bundle claim is only a number
  -- from the client, so it is bounded by the configured percentage of THIS
  -- order's subtotal and by the number of distinct pieces actually in it.
  -- ------------------------------------------------------------------
  -- The cap already bit per piece in the loop; nothing else to take off.
  v_flash_discount := v_flash_total;
  v_bundle_pct := least(greatest(coalesce((v_bundle->>'discountPct')::int, 0), 0), 100);
  if coalesce((v_bundle->>'enabled')::boolean, false)
     and v_bundle_pct > 0
     and v_pieces >= 1 + greatest(1, coalesce((v_bundle->>'minComplements')::int, 1))
  then
    v_bundle_discount := least(
      greatest(0, coalesce((p_order->>'bundle_discount')::bigint, 0)),
      (v_subtotal * v_bundle_pct) / 100
    );
  end if;
  if v_flash_discount > 0 and v_flash_discount >= v_bundle_discount then
    v_promo := v_flash_discount; v_promo_kind := 'flash';
  elsif v_bundle_discount > 0 then
    v_promo := v_bundle_discount; v_promo_kind := 'bundle';
  end if;

  -- Gift wrap: the fee comes from settings by wrap id, never from the client.
  if v_is_gift and coalesce((v_gift->>'enabled')::boolean, false) then
    if v_gift_wrap = 'standard' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'standardWrapFeePaisa')::bigint, 0));
    elsif v_gift_wrap = 'premium' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'premiumWrapFeePaisa')::bigint, 0));
    else
      v_gift_wrap := 'none';
    end if;
    if v_gift_fee <= 0 then v_gift_wrap := 'none'; end if;
  else
    v_is_gift := false; v_gift_wrap := 'none'; v_gift_fee := 0;
  end if;

  -- ৳50 for a friend who brings their FIRST order: the code must be issued,
  -- the buyer must be new to the shop, this code must not have credited this
  -- phone before, and the order must clear the configured minimum.
  if v_ref_code <> '' and coalesce((v_ref->>'enabled')::boolean, false) then
    if exists (select 1 from referral_codes rc where rc.code = v_ref_code)
       and not exists (select 1 from orders o where o.customer_phone = v_phone)
       and not exists (select 1 from referral_rewards rr
                        where rr.code = v_ref_code and rr.referee_phone = v_phone)
       and v_subtotal >= greatest(0, coalesce((v_ref->>'minOrderPaisa')::bigint, 0))
    then
      v_ref_credit := greatest(0, least(
        coalesce((v_ref->>'friendRewardPaisa')::bigint, 0),
        greatest(0, v_subtotal - v_discount - v_promo)
      ));
    end if;
  end if;

  -- Discounts are capped by the goods in the cart — the total can only ever be
  -- reduced to the delivery charge + tip + wrap fee.
  if v_discount + v_promo + v_ref_credit > v_subtotal then
    v_promo := least(v_promo, greatest(0, v_subtotal - v_discount));
    v_ref_credit := least(v_ref_credit, greatest(0, v_subtotal - v_discount - v_promo));
  end if;

  if v_is_return then
    -- A return order is zero-charge by design (the refund is the shop's
    -- offline handling of the parent order): no coupon money, no promo, no
    -- referral credit, no wrap fee, no tip — and COD by definition.
    v_discount := 0; v_promo := 0; v_promo_kind := '';
    v_ref_credit := 0; v_gift_fee := 0; v_tip := 0;
    v_payment := 'cod';
  end if;

  v_total := greatest(0, v_subtotal - v_discount - v_promo - v_ref_credit
                        + v_charge + v_tip + v_gift_fee);
  if v_is_return then
    v_total := 0;
  end if;

  -- Wallet payment proof (P1 #8): the wallet must be configured in the ops
  -- settings, and the TRXID is what the shop matches against its own wallet
  -- history. A fake method or a missing TRXID fails the whole order here.
  if v_payment not in ('cod', 'bkash', 'nagad') then
    raise exception 'unknown payment method';
  end if;
  if v_payment in ('bkash', 'nagad') then
    if coalesce(v_ops->'wallets'->>v_payment, '') = '' then
      raise exception '% is not available right now — please use cash on delivery',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
    if v_payment_ref !~ '^[A-Za-z0-9]{6,32}$' then
      raise exception 'enter the transaction ID (TRXID) from % after sending the money',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
  end if;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, is_return, return_reason, return_parent_id, return_status,
    pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    is_gift, gift_wrap, gift_fee, gift_recipient_name, gift_recipient_phone, gift_message,
    promo_kind, promo_discount, referral_code, referral_credit,
    subtotal, delivery_charge, discount, coupon_id, total,
    payment, payment_ref, payment_status, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_is_return,
    nullif(v_return_reason, ''), v_return_parent,
    case when v_is_return then 'requested' else null end,
    v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_is_gift, nullif(v_gift_wrap, 'none'), v_gift_fee,
    nullif(left(coalesce(trim(p_order->>'gift_recipient_name'), ''), 60), ''),
    nullif(regexp_replace(coalesce(p_order->>'gift_recipient_phone', ''), '[^0-9]', '', 'g'), ''),
    nullif(left(coalesce(trim(p_order->>'gift_message'), ''), 240), ''),
    nullif(v_promo_kind, ''), v_promo,
    case when v_ref_credit > 0 then v_ref_code else null end, v_ref_credit,
    v_subtotal, v_charge, v_discount + v_promo + v_ref_credit,
    case when v_has_coupon then v_coupon.id else null end,
    v_total,
    v_payment,
    case when v_payment in ('bkash', 'nagad') then v_payment_ref else null end,
    case when v_payment in ('bkash', 'nagad') then 'pending_verification' else 'verified' end,
    'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  if v_ref_credit > 0 then
    insert into referral_rewards (code, referee_phone, order_id, friend_credit)
    values (v_ref_code, v_phone, v_order_id, v_ref_credit)
    on conflict (code, referee_phone) do nothing;
  end if;

  insert into order_status_history (order_id, status, note)
  values (
    v_order_id, 'pending',
    'Placed via checkout — ' || v_district || ' / ' || v_upazila || ' / '
      || nullif(v_para, '') || ' | zone=' || v_zone.id
      || ' | flat60=' || (v_charge = 6000)::text
      || ' | pickup=' || v_is_pickup::text
      || ' | coupon_free=' || (v_has_coupon and v_coupon.type = 'free_delivery')::text
      || ' | tip=' || v_tip::text
      || ' | gift=' || coalesce(v_gift_wrap, 'none') || ':' || v_gift_fee::text
      || ' | promo=' || coalesce(nullif(v_promo_kind, ''), 'none') || ':' || v_promo::text
      || ' | ref=' || case when v_ref_credit > 0 then v_ref_code || ':' || v_ref_credit::text else 'none' end
      || ' | pay=' || v_payment || case when v_payment in ('bkash','nagad') then ':' || v_payment_ref else '' end
      || ' | return=' || v_is_return::text
  );

  return v_order_id;
end $$;
commit;

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

begin;

create table if not exists stock_watches (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products (id) on delete cascade,
  phone             text not null check (phone ~ '^[0-9]{11}$'),
  -- When staff were last handed this watcher's number for a restock.
  -- Informational on the admin screen; the dedupe is the out-of-stock →
  -- in-stock transition itself (each cycle is a real event the shopper
  -- signed up for), so no value here can silently swallow a real restock.
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (product_id, phone)
);
create index if not exists idx_stock_watches_product on stock_watches (product_id);

alter table stock_watches enable row level security;

-- The storefront never writes this table directly: /api/stock-watch uses the
-- service role. The policy exists only so a hand-pasted insert from a
-- customer session is still format-checked, and nothing else can see rows.
drop policy if exists "stock watch public insert" on stock_watches;
create policy "stock watch public insert" on stock_watches
  for insert with check (phone ~ '^[0-9]{11}$');

drop policy if exists "admin all stock watches" on stock_watches;
create policy "admin all stock watches" on stock_watches
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;

begin;

-- Full recompute for one shop. Cheap: reviews per shop are small, and this
-- only runs when a review is written, changes status, or is deleted.
create or replace function ps_shop_rating_recompute(p_shop_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update shops
  set rating_avg = coalesce(
        (select round(avg(r.rating)::numeric, 2)
           from reviews r
          where r.shop_id = p_shop_id and r.status = 'approved'), 0),
      rating_count = coalesce(
        (select count(*)
           from reviews r
          where r.shop_id = p_shop_id and r.status = 'approved'), 0)
  where id = p_shop_id;
end;
$$;

create or replace function ps_reviews_shop_rating()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.shop_id, old.shop_id) is not null then
    perform ps_shop_rating_recompute(coalesce(new.shop_id, old.shop_id));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_reviews_shop_rating on reviews;
create trigger trg_reviews_shop_rating
after insert or update of status, rating, shop_id or delete
on reviews
for each row
execute function ps_reviews_shop_rating();

-- Backfill: any approved review written before the trigger existed.
do $$
declare
  s record;
begin
  for s in select id from shops loop
    perform ps_shop_rating_recompute(s.id);
  end loop;
end;
$$;

commit;

-- ==== P2 #21: fabric transparency (202609140012) ====
begin;

alter table products add column if not exists fabric_gsm int
  check (fabric_gsm is null or (fabric_gsm >= 30 and fabric_gsm <= 1000));
alter table products add column if not exists manufacturer text;
alter table products add column if not exists test_report_url text;
alter table products add column if not exists quality_checked boolean not null default false;

commit;

-- ==== P2 #20: campaign early-access tag (202609140013) ====
begin;

alter table newsletter_subscribers add column if not exists campaign text;

commit;

-- ==== P2 #22: rider availability (202609140014) ====
begin;
alter table riders add column if not exists avail_from_hour int
  check (avail_from_hour is null or (avail_from_hour >= 0 and avail_from_hour <= 23));
alter table riders add column if not exists avail_to_hour int
  check (avail_to_hour is null or (avail_to_hour >= 0 and avail_to_hour <= 24));
alter table riders add column if not exists avail_days smallint[];
create or replace function ps_rider_on_shift(r riders)
returns boolean
language sql stable set search_path = public as $$
  select (
      r.avail_days is null
      or coalesce(array_length(r.avail_days, 1), 0) = 0
      or extract(dow from (now() at time zone 'Asia/Dhaka'))::int = any (r.avail_days)
    )
    and (
      (r.avail_from_hour is null and r.avail_to_hour is null)
      or (
        -- an empty shift (18–18) never matches, by design, same as the TS rule
        coalesce(r.avail_from_hour, -1) <> coalesce(r.avail_to_hour, -1)
        and (
          case
            when r.avail_from_hour is not null and r.avail_to_hour is not null
                 and r.avail_from_hour > r.avail_to_hour then
              extract(hour from (now() at time zone 'Asia/Dhaka'))::int >= r.avail_from_hour
              or extract(hour from (now() at time zone 'Asia/Dhaka'))::int < r.avail_to_hour
            else
              extract(hour from (now() at time zone 'Asia/Dhaka'))::int >= coalesce(r.avail_from_hour, 0)
              and extract(hour from (now() at time zone 'Asia/Dhaka'))::int < coalesce(r.avail_to_hour, 24)
          end
        )
      )
    );
$$;
create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_order_lat double precision;
  v_order_lng double precision;
  v_zone_id text;
  v_rider_id uuid;
begin
  select lat, lng, zone_id into v_order_lat, v_order_lng, v_zone_id from orders where id = p_order_id;
  -- Try nearest by geo if order has pin
  if v_order_lat is not null and v_order_lng is not null then
    select r.id into v_rider_id
    from riders r
    where r.status = 'active'
      and r.is_online
      and ps_rider_on_shift(r)
      and r.zone_ids @> array[v_zone_id]
      and r.cash_in_hand < 500000
      and r.current_load < 2 -- max 2 concurrent
      and not exists (
        select 1 from delivery_assignments a
        where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
      )
      and not exists (
        select 1 from delivery_assignments seen
        where seen.order_id = p_order_id and seen.rider_id = r.id
      )
    order by
      -- distance first (if rider has location)
      case when r.lat is not null and r.lng is not null
        then ps_haversine_km(v_order_lat, v_order_lng, r.lat, r.lng)
        else 9999 end asc,
      -- then rating high to low
      r.rating_avg desc,
      -- then least load
      r.current_load asc,
      -- then longest idle
      r.created_at asc
    limit 1;
    if v_rider_id is not null then
      return v_rider_id;
    end if;
  end if;
  -- Fallback: original logic without geo
  select r.id into v_rider_id
  from riders r
  where r.status = 'active'
    and r.is_online
    and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_zone_id]
    and r.cash_in_hand < 500000
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
    )
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.rating_avg desc, r.current_load asc, r.created_at asc
  limit 1;
  return v_rider_id;
end $$;
commit;

-- ==== P2 #17: PROSANTI+ membership (202609140015) ====
-- ============================================================================
-- P2 #17 (2026-09-14): PROSANTI+ membership — ৳99/month, no PSP needed.
-- ============================================================================
-- Same trust model as the shop's whole bKash/Nagad flow (P1 #8): the member
-- sends the money to the shop's OWN wallet, shares the TRXID, and staff
-- activate. "Recurring" therefore means EXPIRING — the app says when it ends
-- and the shopper renews; no card vault and no silent charge exist here, so
-- none is pretended.
--
-- The one perk that touches money (free delivery) is enforced INSIDE
-- ps_place_order below — recomputed from this table against the order's phone,
-- never from a client claim. Orders carrying it are flagged is_plus so the
-- shop's queues can pick them first (priority is a human courtesy, correctly
-- displayed as one).
--
-- Re-creates ps_place_order on top of 202609140008; run after it.
-- ============================================================================

begin;

create table if not exists memberships (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null check (phone ~ '^01[0-9]{9}$'),
  name         text not null default '',
  status       text not null default 'pending'
               check (status in ('pending', 'active', 'rejected')),
  months       int  not null default 1 check (months between 1 and 12),
  amount_paisa bigint not null check (amount_paisa >= 0),
  pay_method   text check (pay_method in ('bkash', 'nagad')),
  trxid        text check (trxid is null or trxid ~ '^[A-Za-z0-9]{6,32}$'),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  started_at   timestamptz,
  expires_at   timestamptz
);
create index if not exists idx_memberships_phone on memberships (phone);
create index if not exists idx_memberships_status on memberships (status, created_at desc);
-- One open application per phone — a double-tap cannot queue two reviews.
create unique index if not exists memberships_pending_uq on memberships (phone)
  where status = 'pending';

alter table orders add column if not exists is_plus boolean not null default false;

-- Staff read/act through the admin role; the anon key gets nothing, matching
-- every other table that holds people's numbers.
drop policy if exists "admin all memberships" on memberships;
create policy "admin all memberships" on memberships
  for all using (ps_is_admin()) with check (ps_is_admin());


create or replace function ps_place_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_zone delivery_zones%rowtype;
  v_coupon coupons%rowtype;
  v_has_coupon boolean := false;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_shop shops%rowtype;
  v_item jsonb;
  v_qty int;
  v_variant_id uuid;
  v_subtotal bigint := 0;
  v_eligible bigint := 0;
  v_discount bigint := 0;
  v_pct int;
  v_charge bigint;
  v_total bigint;
  -- P2 #17 — PROSANTI+ membership: recomputed from the memberships table
  -- below, NEVER taken from the client payload. It waives delivery + surcharges.
  v_plus boolean := false;
  v_available int;
  v_order_id uuid;
  v_code text := upper(coalesce(p_order->>'coupon_code', ''));
  v_lat double precision := nullif(p_order->>'lat', '')::double precision;
  v_lng double precision := nullif(p_order->>'lng', '')::double precision;
  v_dist double precision := nullif(p_order->>'distance_km', '')::double precision;
  v_scheduled_at timestamptz := nullif(p_order->>'scheduled_at', '')::timestamptz;
  v_window text := coalesce(trim(p_order->>'delivery_window'), '');
  v_is_express boolean := coalesce((p_order->>'is_express')::boolean, false);
  v_is_pickup boolean := coalesce((p_order->>'is_pickup')::boolean, false);
  v_pickup_slot text := nullif(trim(coalesce(p_order->>'pickup_slot', '')), '');
  v_tip bigint := greatest(0, least(50000, coalesce((p_order->>'tip_amount')::bigint, 0)));
  v_weight double precision := nullif(p_order->>'weight_kg', '')::double precision;
  v_sur_night bigint := greatest(0, coalesce((p_order->>'surcharge_night')::bigint, 0));
  v_sur_rain bigint := greatest(0, coalesce((p_order->>'surcharge_rain')::bigint, 0));
  v_sur_dist bigint := greatest(0, coalesce((p_order->>'surcharge_distance')::bigint, 0));
  v_sur_express bigint := greatest(0, coalesce((p_order->>'surcharge_express')::bigint, 0));
  v_sur_weight bigint := greatest(0, coalesce((p_order->>'surcharge_weight')::bigint, 0));
  v_para text := coalesce(trim(p_order->>'para'), trim(p_order->>'area'), '');
  v_district text := coalesce(trim(p_order->>'district'), 'Sunamganj');
  v_upazila text := coalesce(trim(p_order->>'upazila'), 'Sunamganj Sadar');
  -- P0 growth (2026-09-13): everything below is re-derived from ops settings
  -- and live rows. The client sends INTENTS only, never money.
  v_ops jsonb := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb);
  v_flash jsonb := coalesce(v_ops->'flash', '{}'::jsonb);
  v_bundle jsonb := coalesce(v_ops->'bundle', '{}'::jsonb);
  v_gift jsonb := coalesce(v_ops->'gift', '{}'::jsonb);
  v_ref jsonb := coalesce(v_ops->'referral', '{}'::jsonb);
  v_scope text := coalesce(v_flash->>'scope', 'featured');
  v_ids jsonb := coalesce(v_flash->'productIds', '[]'::jsonb);
  v_now_min int := (floor(extract(epoch from (now() at time zone 'Asia/Dhaka')) / 60)::bigint % 1440)::int;
  v_slot record;
  v_s int;
  v_e int;
  v_flash_on boolean := false;
  v_flash_pct int := 0;
  v_flash_cap bigint := 0;
  v_flash_line bigint := 0;
  v_flash_total bigint := 0;
  v_flash_discount bigint := 0;
  v_bundle_pct int := 0;
  v_bundle_discount bigint := 0;
  v_promo bigint := 0;
  v_promo_kind text := '';
  v_seen uuid[] := '{}';
  v_pieces int := 0;
  v_is_gift boolean := coalesce((p_order->>'is_gift')::boolean, false);
  v_gift_wrap text := lower(trim(coalesce(p_order->>'gift_wrap', 'none')));
  v_gift_fee bigint := 0;
  v_ref_code text := upper(trim(coalesce(p_order->>'referral_code', '')));
  v_ref_credit bigint := 0;
  v_phone text := trim(p_order->>'customer_phone');
  -- P1 #8 (2026-09-14): wallet payments WITHOUT a merchant account — the
  -- customer sends the total to the shop's own bKash/Nagad number and
  -- shares the TRXID. The shop verifies it (ps_verify_payment) before the
  -- order may start fulfilment; COD stays the no-friction default.
  v_payment text := lower(trim(coalesce(p_order->>'payment_method', 'cod')));
  v_payment_ref text := upper(trim(coalesce(p_order->>'payment_ref', '')));
  -- P1 #13 (restored in 202609140008): zero-charge return pickup orders.
  -- ps_create_return_request passes these keys; the flat/growth/wallet
  -- re-creations of this function dropped the handling, which silently turned
  -- every "return request" into a full-price COD order that could be
  -- requested without limit and never approved.
  v_is_return boolean := coalesce((p_order->>'is_return')::boolean, false);
  v_return_parent uuid := nullif(p_order->>'return_parent_id', '')::uuid;
  v_return_reason text := coalesce(trim(p_order->>'return_reason'), '');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  if v_is_return then
    if v_return_parent is null then
      raise exception 'return_parent_id required';
    end if;
    if not exists (select 1 from orders where id = v_return_parent and status = 'delivered') then
      raise exception 'parent order not delivered';
    end if;
  end if;

  -- Is a flash window open right now (Asia/Dhaka)? Slots wrap midnight.
  if coalesce((v_flash->>'enabled')::boolean, false) then
    v_flash_pct := least(greatest(coalesce((v_flash->>'discountPct')::int, 0), 0), 100);
    v_flash_cap := greatest(0, coalesce((v_flash->>'maxDiscountPaisa')::bigint, 0));
    if v_flash_pct > 0 then
      for v_slot in select value from jsonb_array_elements(coalesce(v_flash->'slots', '[]'::jsonb)) loop
        if coalesce(v_slot.value->>'start', '') ~ '^[0-9]{2}:[0-9]{2}$'
           and coalesce(v_slot.value->>'end', '') ~ '^[0-9]{2}:[0-9]{2}$' then
          v_s := (left(v_slot.value->>'start', 2)::int * 60 + right(v_slot.value->>'start', 2)::int);
          v_e := (left(v_slot.value->>'end', 2)::int * 60 + right(v_slot.value->>'end', 2)::int);
          if v_s <> v_e and (
               (v_s < v_e and v_now_min >= v_s and v_now_min < v_e)
               or (v_s > v_e and (v_now_min >= v_s or v_now_min < v_e))
             ) then
            v_flash_on := true;
          end if;
        end if;
      end loop;
    end if;
  end if;

  select * into v_zone from delivery_zones
  where id = p_order->>'zone_id' and active;
  if not found and not v_is_pickup then
    raise exception 'zone unavailable';
  end if;
  if not found and v_is_pickup then
    -- Pickup happens at the hub; record the first active zone, charge nothing.
    select * into v_zone from delivery_zones where active order by sort_order limit 1;
    if not found then
      raise exception 'zone unavailable';
    end if;
  end if;

  if v_code <> '' then
    select * into v_coupon from coupons
    where code = v_code and active;
    if not found then
      raise exception 'unknown coupon';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'coupon not started';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'coupon expired';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used >= v_coupon.usage_limit then
      raise exception 'coupon limit reached';
    end if;
    v_has_coupon := true;
  end if;

  -- Validate every line, resolve the shop, reserve variant stock under locks.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 10 then
      raise exception 'bad quantity';
    end if;
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid
      and status = 'published' and active and in_stock;
    if not found then
      raise exception 'product unavailable';
    end if;
    -- Single-shop rule
    if v_shop.id is null then
      select * into v_shop from shops where id = v_product.shop_id;
      if not found or v_shop.status <> 'active' then
        raise exception 'shop unavailable';
      end if;
      if not v_shop.is_open and not v_is_return then
        raise exception 'shop closed';
      end if;
      -- Checkout delivery coverage is determined by the customer's address and
      -- the zone charge, not by the shop's legacy zone_ids metadata. That
      -- metadata is still useful for discovery/dispatch, but blocking here
      -- makes a shop look open in the storefront and then rejects checkout.
      -- Active shops may serve every active checkout zone.
    elsif v_product.shop_id <> v_shop.id then
      raise exception 'order mixes multiple shops';
    end if;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    if not (v_product.id = any (v_seen)) then
      v_seen := array_append(v_seen, v_product.id);
      v_pieces := v_pieces + 1;
    end if;
    -- Flash drop: recomputed from ops settings against the live product row.
    if v_flash_on and (
         v_scope = 'all'
         or (v_scope = 'featured' and v_product.featured)
         or (v_scope = 'selected' and exists (
              select 1 from jsonb_array_elements_text(v_ids) u
              where lower(u) = lower(v_product.id::text) or lower(u) = lower(v_product.slug)))
       ) then
      -- Cap is PER PIECE (maxDiscountPaisa), exactly what the badge quotes.
      v_flash_line := (v_product.price * v_flash_pct) / 100;
      if v_flash_cap > 0 then
        v_flash_line := least(v_flash_line, v_flash_cap);
      end if;
      v_flash_total := v_flash_total + v_flash_line * v_qty;
    end if;
    if v_has_coupon
       and (v_coupon.category_id is null or v_coupon.category_id = v_product.category_id)
    then
      v_eligible := v_eligible + v_product.price * v_qty;
    end if;
    if coalesce(v_item->>'variant_id', '') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select * into v_variant from product_variants
      where id = v_variant_id and product_id = v_product.id and active
      for update;
      if not found then
        raise exception 'variant unavailable';
      end if;
      if not v_is_return then
        -- A return is coming back to the shelf — it must not reserve stock
        -- a second time.
        v_available := v_variant.stock - v_variant.reserved;
        if v_available < v_qty then
          raise exception 'only % left of "%"', greatest(0, v_available), v_product.name;
        end if;
        update product_variants
        set reserved = reserved + v_qty
        where id = v_variant.id;
      end if;
    end if;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'empty order';
  end if;

  -- Outside Sunamganj Sadar (other upazila / other district) minimum ৳500.
  if not v_is_pickup and not v_is_return and v_zone.id = 'z4' and v_subtotal < 50000 then
    raise exception 'Zone D requires minimum ৳500 order';
  end if;

  if v_has_coupon then
    if v_coupon.min_order > 0 and v_subtotal < v_coupon.min_order then
      raise exception 'coupon minimum not met';
    end if;
    if v_coupon.type <> 'free_delivery' and v_eligible <= 0 then
      raise exception 'coupon does not apply';
    end if;
    if v_coupon.type = 'fixed' then
      v_discount := least(v_coupon.value, v_eligible);
    elsif v_coupon.type = 'percent' then
      v_pct := least(greatest(v_coupon.value, 0), 100);
      v_discount := least(v_eligible, (v_eligible * v_pct) / 100);
      if v_coupon.max_discount is not null and v_coupon.max_discount > 0 then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
    else
      v_discount := 0; -- free_delivery coupon waives the charge below
    end if;
    update coupons set used = used + 1 where id = v_coupon.id;
  end if;

  -- ------------------------------------------------------------------
  -- TIERED RULE: pickup and free-delivery coupons ride free. Otherwise
  -- use the address-derived zone charge + server-computed surcharges
  -- (night/rain/distance/express/weight).
  -- ------------------------------------------------------------------
  if v_is_pickup then
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  elsif v_is_return then
    -- Return pickup is free: the rider's leg is the shop's reverse logistics.
    v_charge := 0;
    v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
  else
    v_charge := coalesce(v_zone.charge, 6000) + v_sur_night + v_sur_rain + v_sur_dist + v_sur_express + v_sur_weight;
    if v_has_coupon and v_coupon.type = 'free_delivery' then
      v_charge := 0;
      v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
    else
      -- P2 #17 — PROSANTI+ membership, keyed on THIS order's phone and only
      -- while a paid term is unexpired. Same waiver the validation layer
      -- prices with, so badge and bill cannot disagree.
      select exists (
        select 1 from memberships m
         where m.phone = regexp_replace(v_phone, '[^0-9]', '', 'g')
           and m.status = 'active'
           and m.expires_at > now()
      ) into v_plus;
      if v_plus then
        v_charge := 0;
        v_sur_night := 0; v_sur_rain := 0; v_sur_dist := 0; v_sur_express := 0; v_sur_weight := 0;
      end if;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- P0 automatic offers — ONE per order, best wins, ties favour the flash
  -- drop (it is time-boxed and must not lose to a code the shopper forgot
  -- to remove). Flash is recomputed here; a bundle claim is only a number
  -- from the client, so it is bounded by the configured percentage of THIS
  -- order's subtotal and by the number of distinct pieces actually in it.
  -- ------------------------------------------------------------------
  -- The cap already bit per piece in the loop; nothing else to take off.
  v_flash_discount := v_flash_total;
  v_bundle_pct := least(greatest(coalesce((v_bundle->>'discountPct')::int, 0), 0), 100);
  if coalesce((v_bundle->>'enabled')::boolean, false)
     and v_bundle_pct > 0
     and v_pieces >= 1 + greatest(1, coalesce((v_bundle->>'minComplements')::int, 1))
  then
    v_bundle_discount := least(
      greatest(0, coalesce((p_order->>'bundle_discount')::bigint, 0)),
      (v_subtotal * v_bundle_pct) / 100
    );
  end if;
  if v_flash_discount > 0 and v_flash_discount >= v_bundle_discount then
    v_promo := v_flash_discount; v_promo_kind := 'flash';
  elsif v_bundle_discount > 0 then
    v_promo := v_bundle_discount; v_promo_kind := 'bundle';
  end if;

  -- Gift wrap: the fee comes from settings by wrap id, never from the client.
  if v_is_gift and coalesce((v_gift->>'enabled')::boolean, false) then
    if v_gift_wrap = 'standard' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'standardWrapFeePaisa')::bigint, 0));
    elsif v_gift_wrap = 'premium' then
      v_gift_fee := greatest(0, coalesce((v_gift->>'premiumWrapFeePaisa')::bigint, 0));
    else
      v_gift_wrap := 'none';
    end if;
    if v_gift_fee <= 0 then v_gift_wrap := 'none'; end if;
  else
    v_is_gift := false; v_gift_wrap := 'none'; v_gift_fee := 0;
  end if;

  -- ৳50 for a friend who brings their FIRST order: the code must be issued,
  -- the buyer must be new to the shop, this code must not have credited this
  -- phone before, and the order must clear the configured minimum.
  if v_ref_code <> '' and coalesce((v_ref->>'enabled')::boolean, false) then
    if exists (select 1 from referral_codes rc where rc.code = v_ref_code)
       and not exists (select 1 from orders o where o.customer_phone = v_phone)
       and not exists (select 1 from referral_rewards rr
                        where rr.code = v_ref_code and rr.referee_phone = v_phone)
       and v_subtotal >= greatest(0, coalesce((v_ref->>'minOrderPaisa')::bigint, 0))
    then
      v_ref_credit := greatest(0, least(
        coalesce((v_ref->>'friendRewardPaisa')::bigint, 0),
        greatest(0, v_subtotal - v_discount - v_promo)
      ));
    end if;
  end if;

  -- Discounts are capped by the goods in the cart — the total can only ever be
  -- reduced to the delivery charge + tip + wrap fee.
  if v_discount + v_promo + v_ref_credit > v_subtotal then
    v_promo := least(v_promo, greatest(0, v_subtotal - v_discount));
    v_ref_credit := least(v_ref_credit, greatest(0, v_subtotal - v_discount - v_promo));
  end if;

  if v_is_return then
    -- A return order is zero-charge by design (the refund is the shop's
    -- offline handling of the parent order): no coupon money, no promo, no
    -- referral credit, no wrap fee, no tip — and COD by definition.
    v_discount := 0; v_promo := 0; v_promo_kind := '';
    v_ref_credit := 0; v_gift_fee := 0; v_tip := 0;
    v_payment := 'cod';
  end if;

  v_total := greatest(0, v_subtotal - v_discount - v_promo - v_ref_credit
                        + v_charge + v_tip + v_gift_fee);
  if v_is_return then
    v_total := 0;
  end if;

  -- Wallet payment proof (P1 #8): the wallet must be configured in the ops
  -- settings, and the TRXID is what the shop matches against its own wallet
  -- history. A fake method or a missing TRXID fails the whole order here.
  if v_payment not in ('cod', 'bkash', 'nagad') then
    raise exception 'unknown payment method';
  end if;
  if v_payment in ('bkash', 'nagad') then
    if coalesce(v_ops->'wallets'->>v_payment, '') = '' then
      raise exception '% is not available right now — please use cash on delivery',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
    if v_payment_ref !~ '^[A-Za-z0-9]{6,32}$' then
      raise exception 'enter the transaction ID (TRXID) from % after sending the money',
        case when v_payment = 'bkash' then 'bKash' else 'Nagad' end;
    end if;
  end if;

  insert into orders (
    shop_id, customer_name, customer_phone, area, address, note, zone_id,
    lat, lng, distance_km, scheduled_at, delivery_window, is_express,
    is_pickup, is_return, return_reason, return_parent_id, return_status,
    pickup_slot, tip_amount, weight_kg,
    surcharge_night, surcharge_rain, surcharge_distance, surcharge_express, surcharge_weight,
    is_gift, gift_wrap, gift_fee, gift_recipient_name, gift_recipient_phone, gift_message,
    promo_kind, promo_discount, referral_code, referral_credit,
    subtotal, delivery_charge, discount, coupon_id, total,
    is_plus,
    payment, payment_ref, payment_status, status
  ) values (
    v_shop.id,
    trim(p_order->>'customer_name'), trim(p_order->>'customer_phone'),
    v_para, coalesce(trim(p_order->>'address'), ''),
    coalesce(trim(p_order->>'note'), ''), v_zone.id,
    v_lat, v_lng, v_dist, v_scheduled_at, nullif(v_window, ''), v_is_express,
    v_is_pickup, v_is_return,
    nullif(v_return_reason, ''), v_return_parent,
    case when v_is_return then 'requested' else null end,
    v_pickup_slot, v_tip, v_weight,
    v_sur_night, v_sur_rain, v_sur_dist, v_sur_express, v_sur_weight,
    v_is_gift, nullif(v_gift_wrap, 'none'), v_gift_fee,
    nullif(left(coalesce(trim(p_order->>'gift_recipient_name'), ''), 60), ''),
    nullif(regexp_replace(coalesce(p_order->>'gift_recipient_phone', ''), '[^0-9]', '', 'g'), ''),
    nullif(left(coalesce(trim(p_order->>'gift_message'), ''), 240), ''),
    nullif(v_promo_kind, ''), v_promo,
    case when v_ref_credit > 0 then v_ref_code else null end, v_ref_credit,
    v_subtotal, v_charge, v_discount + v_promo + v_ref_credit,
    case when v_has_coupon then v_coupon.id else null end,
    v_total,
    v_plus,
    v_payment,
    case when v_payment in ('bkash', 'nagad') then v_payment_ref else null end,
    case when v_payment in ('bkash', 'nagad') then 'pending_verification' else 'verified' end,
    'pending'
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid;
    insert into order_items (
      order_id, product_id, variant_id, name, sku, variant, unit_price, qty
    ) values (
      v_order_id, v_product.id,
      case when coalesce(v_item->>'variant_id', '') = ''
        then null else (v_item->>'variant_id')::uuid end,
      v_product.name, v_product.sku,
      coalesce(trim(v_item->>'variant_label'), ''),
      v_product.price, (v_item->>'qty')::int
    );
  end loop;

  if v_ref_credit > 0 then
    insert into referral_rewards (code, referee_phone, order_id, friend_credit)
    values (v_ref_code, v_phone, v_order_id, v_ref_credit)
    on conflict (code, referee_phone) do nothing;
  end if;

  insert into order_status_history (order_id, status, note)
  values (
    v_order_id, 'pending',
    'Placed via checkout — ' || v_district || ' / ' || v_upazila || ' / '
      || nullif(v_para, '') || ' | zone=' || v_zone.id
      || ' | zone_charge=' || coalesce(v_zone.charge, 6000)::text
      || ' | pickup=' || v_is_pickup::text
      || ' | coupon_free=' || (v_has_coupon and v_coupon.type = 'free_delivery')::text
      || ' | tip=' || v_tip::text
      || ' | gift=' || coalesce(v_gift_wrap, 'none') || ':' || v_gift_fee::text
      || ' | promo=' || coalesce(nullif(v_promo_kind, ''), 'none') || ':' || v_promo::text
      || ' | ref=' || case when v_ref_credit > 0 then v_ref_code || ':' || v_ref_credit::text else 'none' end
      || ' | pay=' || v_payment || case when v_payment in ('bkash','nagad') then ':' || v_payment_ref else '' end
      || ' | return=' || v_is_return::text
  );

  return v_order_id;
end $$;


commit;

-- ==== Checkout repair: order INSERT guards + gift_wrap NULL (202609160002) ====
-- ============================================================================
-- Checkout repair 2 (2026-09-16): every order INSERT was being rejected.
-- ============================================================================
-- Symptom on the live site: /checkout answers the generic
-- "Could not place the order — please try again" for EVERY order, plain COD
-- included. /api/health says live, the catalog loads, ps_place_order exists.
--
-- Reproduced by running supabase/bootstrap-fresh.sql end-to-end on a fresh
-- Postgres and calling ps_place_order with the exact checkout payload:
--
--   1. 23502 null value in column "gift_wrap" violates not-null constraint
--      202609130008 declared  orders.gift_wrap text NOT NULL default 'none'
--      while every ps_place_order from that file onward (growth, wallet,
--      return-restore, PROSANTI+ FINAL, the bootstrap, pending-p2-final)
--      inserts  nullif(v_gift_wrap, 'none')  — i.e. NULL for every order that
--      is not a gift. The API only maps P0001 raises to a field error, so this
--      SQLSTATE fell through to the generic 503. Nothing ever dropped the
--      NOT NULL, so no non-gift order could be stored.
--
--   2. Once that is lifted, two phase-1 triggers from 202609080002 still
--      reject legitimate orders, because they were never updated when the
--      order model grew:
--        ps_check_order_totals  demands  total = subtotal - discount + charge
--                               → any tip or gift-wrap fee fails with
--                                 "order total does not reconcile",
--                                 and zero-total return orders never passed
--        ps_check_order_insert  demands  payment = 'cod'
--                               → every bKash / Nagad order fails with
--                                 "only cash on delivery is enabled"
--
-- This file is safe on ANY generation of ps_place_order (flat, growth,
-- wallet, return, PROSANTI+) and on a database where the growth columns do
-- not exist yet. Everything is idempotent — run it again if unsure.
-- After it: run the SELECT at the bottom (it prints 3 × OK) or open
-- /api/health, which now reports checkoutRepair.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. orders.gift_wrap: NULL means "not a gift", exactly what the RPC writes.
--    The CHECK (gift_wrap in ('none','standard','premium')) stays — a CHECK
--    passes on NULL, and the default 'none' still covers plain INSERTs.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'gift_wrap'
      and is_nullable = 'NO'
  ) then
    alter table public.orders alter column gift_wrap drop not null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Totals guard, brought up to the current order model:
--      total = greatest(0, subtotal - discount + delivery_charge + tip + gift_fee)
--    (discount already holds coupon + promo + referral credit, which the RPC
--    caps at the subtotal). Return orders are the zero-charge reverse leg
--    and are not reconciled. Columns are read through to_jsonb(new) so the
--    guard also works on a database that never got tip / gift / return
--    columns (plpgsql would otherwise fail on a missing record field).
-- ----------------------------------------------------------------------------
create or replace function ps_check_order_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_row      jsonb  := to_jsonb(new);
  v_tip      bigint := coalesce((v_row->>'tip_amount')::bigint, 0);
  v_gift_fee bigint := coalesce((v_row->>'gift_fee')::bigint, 0);
  v_return   boolean := coalesce((v_row->>'is_return')::boolean, false);
  v_expected bigint;
begin
  if new.discount > new.subtotal then
    raise exception 'discount (%) exceeds subtotal (%)', new.discount, new.subtotal;
  end if;
  if v_return then
    return new;
  end if;
  v_expected := greatest(0, new.subtotal - new.discount + new.delivery_charge + v_tip + v_gift_fee);
  if new.total <> v_expected then
    raise exception 'order total does not reconcile (total % vs subtotal % - discount % + delivery % + tip % + gift wrap %)',
      new.total, new.subtotal, new.discount, new.delivery_charge, v_tip, v_gift_fee;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_totals on orders;
create trigger trg_orders_check_totals
  before insert or update on orders
  for each row execute function ps_check_order_totals();

-- ----------------------------------------------------------------------------
-- 3. Insert guard: still pending-only, still needs a name and an area, but
--    the payment rule now matches orders_payment_check (cod | bkash | nagad).
--    The RPC is what proves a wallet is configured and a TRXID was given.
-- ----------------------------------------------------------------------------
create or replace function ps_check_order_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'pending' then
    raise exception 'orders must be created pending';
  end if;
  if new.payment not in ('cod', 'bkash', 'nagad') then
    raise exception 'unknown payment method';
  end if;
  if length(trim(new.customer_name)) < 2 then
    raise exception 'customer name is required';
  end if;
  if length(trim(new.area)) < 2 then
    raise exception 'delivery area is required';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_insert on orders;
create trigger trg_orders_check_insert
  before insert on orders
  for each row execute function ps_check_order_insert();

-- ----------------------------------------------------------------------------
-- 4. A read-only probe the app can call: /api/health reports these booleans
--    as checkoutRepair, so the admin dashboard names this file when it is
--    missing instead of every checkout failing quietly. Service role only.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160002',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

-- PostgREST caches the schema — ask it to pick up the new function now so
-- /api/health flips to checkoutRepair: true immediately (no-op elsewhere).
notify pgrst, 'reload schema';

commit;

-- ==== Admin repair: order status updates, payment verify, rider guard (202609160003) ====
-- ============================================================================
-- Checkout repair 3 (2026-09-16): NO order status could be changed, no
-- bKash/Nagad payment could be verified, and riders could not deliver.
-- ============================================================================
-- Symptom in Admin → Orders: "Mark confirmed" (and Cancel, Preparing, …,
-- Delivered — every button) answers "Could not update the order." Orders
-- arrive, nothing can move.
--
-- Reproduced on a fresh bootstrap by calling ps_advance_order as a staff
-- user. Every UPDATE on orders fails with
--
--   22P02  invalid input value for enum ps_order_status: ""
--
-- The trigger ps_write_shop_ledger (202609090017_delivery_remaining.sql,
-- also inside bootstrap-fresh.sql) tests
--
--   coalesce(old.status, '') <> 'delivered'
--
-- but orders.status is the ENUM ps_order_status and '' is not one of its
-- labels, so the comparison itself raises — on EVERY update of the row,
-- delivered or not, because trg_orders_ledger_on_delivered fires on every
-- UPDATE OF status. The original 202609090004 version used
-- `old.status is distinct from 'delivered'`, which is what the enum needs.
--
-- This re-creates the ledger writer with the null-safe enum comparison and
-- keeps everything the 0017 version added (delivery/tip/surcharge split,
-- negative payable for return orders, upsert).
--
-- Found by the same audit — ps_verify_payment (202609140004 / 202609140007)
-- ends with
--
--   return (select * from orders where id = p_order_id);
--
-- which plpgsql parses as a SCALAR subquery: 42601 "subquery must return
-- only one column". The function body runs, then the RETURN raises and the
-- whole call rolls back — so Verify / Reject on a bKash or Nagad payment
-- NEVER succeeded ("Could not record the payment decision."). Re-created
-- with the identical rules and a proper `select * into v_order`.
--
-- Third finding — trg_riders_guard_self_update (202609090005) raises
-- 'forbidden' for ANY write to riders by a non-staff session that does not
-- flip is_online. It predates everything that later started writing that
-- table from inside our own RPCs and triggers: ps_track_rider_load
-- (current_load / total_deliveries, 202609090014), the cash_in_hand update
-- in ps_rider_deliver, ps_rider_update_location, the rider shift columns
-- (202609140014). Proven fallout on a fresh bootstrap:
--
--   rider "Delivered"            → forbidden   (cash + load update)
--   rider "Reject offer"         → forbidden   (load update)
--   rider GPS / shift            → forbidden
--   ps_expire_stale_offers       → forbidden   — called before EVERY rider
--                                  job list and the admin Deliveries board,
--                                  so both break once any offer is > 90 s old
--   vendor "Ready for pickup"    → forbidden   whenever an eligible rider
--                                  exists (auto-dispatch bumps the load)
--
-- Inside a SECURITY DEFINER function or trigger current_user is the owner
-- (postgres), while a direct end-user write through RLS runs as
-- 'authenticated'. The guard now restricts ONLY that direct path — and
-- restricts it harder (a rider may change nothing but is_online; before,
-- current_load / total_deliveries / lat / lng were not in its list).
--
-- Also extends ps_checkout_health() so /api/health reports all repairs.
-- Idempotent — run it again if unsure. Expect 4 × OK at the end.
-- ============================================================================

begin;

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
begin
  -- Enum-safe: old.status may be NULL only in theory (AFTER UPDATE always has
  -- OLD), but it must never be compared with '' — that is not a label.
  if new.status = 'delivered' and old.status is distinct from new.status then
    select commission_pct into v_pct from shops where id = new.shop_id;
    if v_pct is null then v_pct := 15; end if;
    v_commission := floor((new.subtotal * v_pct) / 100);
    v_payable := new.subtotal - v_commission;
    v_delivery := coalesce(new.delivery_charge, 0);
    -- Read the optional columns through jsonb so this body also works on a
    -- database that never got the tip / surcharge / return migrations.
    v_tip := coalesce((v_row->>'tip_amount')::bigint, 0);
    v_sur := coalesce((v_row->>'surcharge_night')::bigint, 0)
           + coalesce((v_row->>'surcharge_rain')::bigint, 0)
           + coalesce((v_row->>'surcharge_distance')::bigint, 0)
           + coalesce((v_row->>'surcharge_express')::bigint, 0)
           + coalesce((v_row->>'surcharge_weight')::bigint, 0);
    -- A return order is the reverse leg: the shop pays the product share back.
    if coalesce((v_row->>'is_return')::boolean, false) then
      v_payable := -v_payable;
    end if;
    if new.shop_id is null then
      -- Legacy row without a shop: nothing to settle, never block the delivery.
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

-- The ledger columns the 0017 version writes (no-op where they exist).
alter table shop_ledger add column if not exists delivery_charge bigint not null default 0;
alter table shop_ledger add column if not exists tip_amount bigint not null default 0;
alter table shop_ledger add column if not exists surcharge_total bigint not null default 0;
create unique index if not exists idx_shop_ledger_order_id on shop_ledger(order_id);

drop trigger if exists trg_orders_ledger_on_delivered on orders;
create trigger trg_orders_ledger_on_delivered
  after update of status on orders
  for each row execute function ps_write_shop_ledger();

-- ----------------------------------------------------------------------------
-- ps_verify_payment — same body as 202609140007 (wallet orders only, one
-- decision per payment, verified never on a cancelled order, reject cancels
-- + releases stock through trg_orders_release_on_cancel), minus the scalar-
-- subquery RETURN that made every call fail.
-- ----------------------------------------------------------------------------
create or replace function ps_verify_payment(p_order_id uuid, p_action text, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_is_admin boolean;
  v_shop uuid;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Same auth model as ps_advance_order: staff or the owning shop.
  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
  end if;

  if v_order.payment = 'cod' then
    raise exception 'not a wallet payment';
  end if;
  if v_order.payment_status <> 'pending_verification' then
    raise exception 'payment already decided';
  end if;

  -- P1 #8 (2): a cancelled order can never be VERIFIED — the order is over,
  -- the money is not in. Rows cancelled BEFORE the auto-reject rule still
  -- need a decision, so REJECT stays legal and settles them (re-setting
  -- status='cancelled' is a no-op: the release trigger only fires on the
  -- transition into cancelled, so stock cannot be released twice).
  if v_order.status = 'cancelled' and p_action = 'verified' then
    raise exception 'order already cancelled';
  end if;

  if p_action = 'verified' then
    -- The shop checked its own bKash/Nagad wallet: the money is in, this is
    -- the moment the order may start fulfilment.
    update orders
    set payment_status = 'verified', payment_verified_at = now(), updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, v_order.status,
      upper(left(v_order.payment, 1)) || right(v_order.payment, length(v_order.payment) - 1) || ' payment verified',
      auth.uid());
  elsif p_action = 'rejected' then
    -- No matching money in the wallet: the order is cancelled and the
    -- reservation goes back to the shelf (trg_orders_release_on_cancel).
    -- The refund to the customer's wallet is the shop's offline handling.
    update orders
    set payment_status = 'rejected', payment_verified_at = now(),
        status = 'cancelled', updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, 'cancelled',
      'Payment rejected' || coalesce(' — ' || trim(coalesce(p_note, '')), '') ||
      ' (refund from the shop wallet, offline)',
      auth.uid());
  else
    raise exception 'unknown payment action';
  end if;

  select * into v_order from orders where id = p_order_id;
  return v_order;
end $$;

-- ----------------------------------------------------------------------------
-- riders guard — only a rider's DIRECT write (RLS policy "riders self update
-- own") is restricted, and then to the online switch alone. Staff, the
-- server's service role and our own SECURITY DEFINER RPCs/triggers pass.
-- ----------------------------------------------------------------------------
create or replace function ps_guard_rider_self_update()
returns trigger language plpgsql as $$
begin
  -- Trusted writers: service role, and every SECURITY DEFINER function or
  -- trigger (they execute as their owner, never as the API roles).
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if (select ps_is_admin()) then
    return new;
  end if;
  -- A rider touching their own row directly: nothing but is_online may move.
  if (to_jsonb(new) - 'is_online') is distinct from (to_jsonb(old) - 'is_online') then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

drop trigger if exists trg_riders_guard_self_update on riders;
create trigger trg_riders_guard_self_update
  before update on riders
  for each row execute function ps_guard_rider_self_update();

-- The stale 2-argument overload from 202609090007 is never called by the app
-- (it always sends p_proof_url); keeping both makes PostgREST answer 300
-- "could not choose the best candidate function" for a 2-key payload.
drop function if exists ps_rider_deliver(uuid, text);

-- ----------------------------------------------------------------------------
-- /api/health: the probe from 202609160002, now also answering "can a status
-- change be written / a payment be verified / a rider deliver?". Same
-- signature → in-place replace. Every probe is POSITIVE (looks for the
-- repaired text in the one function it names) so it can never match itself.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160003',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Security repair: anon key locked out of service RPCs, memberships RLS, slot policy (202609160004) ====
-- ============================================================================
-- Security repair 4 (2026-09-16): lock down what the PUBLIC anon key can do.
-- ============================================================================
-- Found by the full-site audit (docs/AUDIT-2026-09-16.md, H1 / H2 / M1).
-- Nothing here changes a feature: every write below is already made by the
-- server with the service-role key. What changes is that the browser key —
-- which ships in every page — can no longer reach the same objects directly
-- through PostgREST.
--
-- H1  `memberships` was created (202609140015) with an admin policy but
--     WITHOUT `enable row level security`, so the policy never applied and
--     the anon key could read every PROSANTI+ request (phone, trxid) and
--     flip status to 'active'.
--
-- H2  Eight SECURITY DEFINER write functions carry no internal auth check
--     (they trust their caller, which is always our API) and were never
--     revoked from anon/authenticated. Supabase grants EXECUTE to both by
--     default, so any visitor could call them through /rest/v1/rpc/…:
--       ps_place_order            — orders around the API's validation/limits
--       ps_use_coupon             — burn a coupon's usage_limit
--       ps_book_delivery_slot     — fill any day's slots (20 calls = full)
--       ps_return_action          — approve/reject/complete any return
--       ps_assign_batch_to_rider  — push orders onto a rider
--       ps_credit_referrer        — mint referral coupons
--       ps_expire_stale_offers    — churn the dispatch board
--       ps_shop_rating_recompute  — (harmless, still not public API)
--     ps_create_return_request has the same shape (no guard, calls
--     ps_place_order) and is locked with them. The functions the storefront
--     legitimately calls with a USER session (ps_rider_*, ps_advance_order,
--     ps_verify_payment, ps_offer_order, …) all check ps_is_admin() /
--     ps_rider_id() / ps_vendor_shop() themselves and keep their grants.
--
-- M1  `delivery_slots` "admin all" policy (202609090017) was written as
--     `using (true) with check (true)` — i.e. everyone — so the anon key could
--     block or delete every slot. Now admin-only; public read stays.
--
-- Also: `ps_checkout_health()` gains `rpc_grants_locked` / `memberships_rls`
-- so /api/health can report this repair (checks.securityRepair).
--
-- Safe to re-run. Nothing is dropped. Takes well under a second.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- H1. memberships: turn the existing policy on.
-- ----------------------------------------------------------------------------
alter table if exists memberships enable row level security;

-- ----------------------------------------------------------------------------
-- M1. delivery_slots: admin-only writes (the public read policy is untouched).
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.delivery_slots') is not null then
    drop policy if exists "delivery_slots admin all" on delivery_slots;
    create policy "delivery_slots admin all" on delivery_slots
      for all using (ps_is_admin()) with check (ps_is_admin());
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- H2. service-role-only RPCs. `revoke … from public` also removes the
--     default EXECUTE every new function inherits; service_role (and the
--     owner, which is what SECURITY DEFINER callers run as) keep it.
-- ----------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'ps_place_order(jsonb, jsonb)',
    'ps_use_coupon(uuid)',
    'ps_book_delivery_slot(date, text)',
    'ps_return_action(uuid, text, text)',
    'ps_create_return_request(uuid, text, text)',
    'ps_assign_batch_to_rider(uuid, uuid[])',
    'ps_credit_referrer(uuid)',
    'ps_expire_stale_offers()',
    'ps_shop_rating_recompute(uuid)'
  ] loop
    if to_regprocedure('public.' || fn) is not null then
      execute format('revoke all on function public.%s from public, anon, authenticated', fn);
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Health probe: same function as 0002/0003, two more keys.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160004',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    -- 202609160004: the anon key may no longer call the service-only RPCs …
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    -- … and memberships is actually protected by its policy.
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true)
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Dispatch repair: offers can be re-issued, batch assign works (202609160005) ====
-- ============================================================================
-- Dispatch repair 5 (2026-09-16): a delivery offer can be re-offered, and
-- staff batch-assign works.
-- ============================================================================
-- Found while replaying the dispatch flow on a fresh schema (PGlite) during
-- the audit follow-up. Neither is visible until a rider lets an offer lapse
-- or rejects it — which is exactly the moment dispatch matters.
--
-- 1. `delivery_assignments.order_id` was created UNIQUE (202609090005), yet
--    every function written since assumes MANY rows per order:
--      ps_next_eligible_rider  — "never re-offer to a rider who already SAW
--                                 this order" (needs the old row to stay)
--      ps_expire_stale_offers  — marks the lapsed row 'expired' then INSERTS
--                                 a fresh offer for the next rider
--      ps_rider_reject         — marks 'cancelled' then INSERTS the next offer
--      toDomain (API)          — reads "latest by offered_at"
--    So the second INSERT fails with 23505 duplicate key:
--      * ps_expire_stale_offers raises → the rider job feed
--        (/api/rider/jobs runs the sweep first) answers 503 for EVERY rider
--        as soon as ONE offer anywhere has expired with a second eligible
--        rider online — the rider app goes blank, and the admin dispatch
--        board (before today's change) did the same.
--      * ps_rider_reject raises → a rider cannot decline an offer when
--        someone else could take it.
--    Fix: replace the UNIQUE(order_id) with a partial unique index on the
--    LIVE states only — one active offer per order (what the uniqueness was
--    protecting), unlimited history rows.
--
-- 2. `ps_assign_batch_to_rider` (202609090017) calls a function that does
--    not exist (ps_assign_order_to_rider) and, in its exception handler,
--    inserts into a table that does not exist (rider_assignments). Every
--    call fails with 42P01; Admin → Deliveries → "Batch assign" has never
--    worked. Rewritten on delivery_assignments: cancels the current live
--    offer for each order, then offers it directly to the chosen rider.
--    Requires the rider to be active + online and the order to be in a
--    dispatchable status. Stays service-only (202609160004).
--
-- Health: ps_checkout_health() gains `dispatch_reoffer_ok` so /api/health
-- and the admin banner can name this file.
--
-- Safe to re-run. Nothing is dropped except the wrong constraint. The
-- active-offer index creation fails only if the table ALREADY holds two
-- live offers for one order — impossible while the UNIQUE constraint was in
-- place.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. One LIVE offer per order; history rows may accumulate.
-- ----------------------------------------------------------------------------
alter table delivery_assignments
  drop constraint if exists delivery_assignments_order_id_key;

create unique index if not exists delivery_assignments_one_live_offer
  on delivery_assignments (order_id)
  where state in ('offered', 'accepted', 'picked_up');

-- The "latest offer" reads (toDomain, dispatch board) walk by offered_at.
create index if not exists idx_assignments_order_offered
  on delivery_assignments (order_id, offered_at desc);

-- ----------------------------------------------------------------------------
-- 2. Staff batch assign — direct offers to ONE chosen rider.
-- ----------------------------------------------------------------------------
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count  int := 0;
  v_oid    uuid;
  v_rider  riders%rowtype;
  v_status text;
begin
  select * into v_rider
  from riders
  where id = p_rider_id and status = 'active' and is_online
  for update;
  if not found then
    raise exception 'rider not available';
  end if;

  foreach v_oid in array coalesce(p_order_ids, '{}'::uuid[]) loop
    select status into v_status from orders where id = v_oid for update;
    if v_status is null
       or v_status not in ('ready-for-pickup', 'courier-assigned', 'out-for-delivery') then
      continue;  -- not dispatchable (yet): skip, do not abort the batch
    end if;

    -- Already riding with this rider? Count it and move on.
    if exists (
      select 1 from delivery_assignments
      where order_id = v_oid and rider_id = p_rider_id
        and state in ('offered', 'accepted', 'picked_up')
    ) then
      v_count := v_count + 1;
      continue;
    end if;

    -- A live offer/acceptance with another rider is withdrawn (staff
    -- decision beats round-robin). A picked-up leg is never moved.
    if exists (
      select 1 from delivery_assignments
      where order_id = v_oid and state = 'picked_up'
    ) then
      continue;
    end if;
    update delivery_assignments
    set state = 'cancelled'
    where order_id = v_oid and state in ('offered', 'accepted');

    insert into delivery_assignments (order_id, rider_id, state, offered_at, expires_at)
    values (v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke all on function ps_assign_batch_to_rider(uuid, uuid[]) from public, anon, authenticated;
grant execute on function ps_assign_batch_to_rider(uuid, uuid[]) to service_role;

-- ----------------------------------------------------------------------------
-- Health probe: same function as 0002–0004, one more key.
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609160005',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true),
    -- 202609160005: offers can be re-issued (no UNIQUE(order_id)), one live
    -- offer per order is enforced by the partial index, batch assign exists
    -- without its phantom dependencies.
    'dispatch_reoffer_ok', (
      not exists (
        select 1 from pg_constraint k
        where k.conrelid = 'public.delivery_assignments'::regclass
          and k.conname = 'delivery_assignments_order_id_key'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_live_offer'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
          and p.prosrc not like '%rider_assignments%'
      )
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;


-- ============================================================================
-- Staff Web Push devices (2026-09-21) — an order lands, the owner's phone
-- buzzes even with the admin panel closed. One row per browser
-- subscription. Service-role only (the notifyStaff fan-out and
-- /api/admin/push both run behind staff auth); RLS denies everyone else.
-- Runs in its own transaction because the bootstrap script ends above.
-- ============================================================================
begin;
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
commit;

-- ============================================================================
-- Customer (shopper) Web Push (2026-09-24) — the shopper's phone buzzes on the
-- four delivery milestones instead of the shop calling each one. Separate
-- table from the staff devices above: bound to the checkout phone number,
-- written by /api/track/push behind the track proof, read only by the
-- milestone fan-out. Service-role only; RLS denies everyone else.
-- ============================================================================
begin;
create table if not exists public.customer_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  phone        text not null,
  lang         text not null default 'bn',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_customer_push_phone
  on public.customer_push_subscriptions (phone);
alter table public.customer_push_subscriptions enable row level security;
commit;

-- ============================================================================
-- Scheduler marks (2026-09-24) — the shop's time-based work runs from outside
-- (a GitHub Action calls /api/cron/tick every 15 minutes; docs/automation.md).
-- One row per one-shot job that has already happened ("reminded order X",
-- "sent the digest for 2026-09-24"), claimed with an INSERT and released if
-- the work failed, so a tick can retry without ever nagging twice. Service
-- role only — RLS on, no policies.
-- ============================================================================
begin;
create table if not exists public.cron_marks (
  key    text primary key,
  ran_at timestamptz not null default now()
);
alter table public.cron_marks enable row level security;
commit;

-- ============================================================================
-- WhatsApp draft outbox (2026-09-24) — the FREE fallback when Web Push reached
-- nobody. The WhatsApp Business API is not needed for order messages (Meta
-- business account + pre-approved templates + ~$0.011 per utility message);
-- a `wa.me` deep link opens the shop's own WhatsApp Business app with the text
-- prefilled, and a human taps send. One draft per order per step, written when
-- the push fan-out reached no device; the admin order page shows it as "Ready
-- to send". `opened_at` records the tap that OPENED WhatsApp — never a claim
-- that a human sent it. Service role only — RLS on, no policies.
-- ============================================================================
begin;
create table if not exists public.wa_outbox (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null,
  phone         text not null,
  kind          text not null,
  lang          text not null default 'bn',
  message       text not null,
  created_at    timestamptz not null default now(),
  opened_at     timestamptz,
  superseded_at timestamptz,
  dismissed_at  timestamptz,
  unique (order_no, kind)
);
create index if not exists idx_wa_outbox_pending
  on public.wa_outbox (created_at desc)
  where opened_at is null and superseded_at is null and dismissed_at is null;
create index if not exists idx_wa_outbox_order
  on public.wa_outbox (order_no, created_at desc);
alter table public.wa_outbox enable row level security;
commit;


-- ==== Feature: two-tap order flow (202609170001) ====
-- ============================================================================
-- 202609170001 — two-tap order flow (audit #2, 2026-09-17, §2)
-- ============================================================================
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to re-run.
-- Ends with a VERIFY select — expect 2 × OK.
--
-- WHY
--   ps_advance_order enforced "exactly +1 position" on ps_order_flow, so a
--   shop had to tap three times per order — Confirm → Preparing → Ready —
--   before the auto-dispatch trigger could offer it to a rider. For a
--   45-minute hyperlocal shop the middle tap is bookkeeping, not a decision.
--
-- WHAT
--   1. ps_advance_order additionally accepts confirmed → ready-for-pickup
--      (skipping 'preparing'). Every other rule is untouched: strictly
--      forward, no other skips, cancel only from pending/confirmed/preparing,
--      wallet orders still need a verified payment before fulfilment starts,
--      vendors still limited to confirm/preparing/ready/cancel of THEIR shop.
--      The enum, ps_order_flow, dispatch trigger, ledger, returns, reports:
--      all unchanged — 'preparing' stays a legal state (Advanced tap in the
--      admin UI, and existing rows keep their history).
--   2. ps_checkout_health() gains `two_tap_flow_ok` (version 202609170001)
--      so /api/health → checks.twoTapFlow and the admin banner can name this
--      file until it has run.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. ps_advance_order — same body as 202609140007 (+ 0003's return shape),
--    plus the one extra legal move.
-- ----------------------------------------------------------------------------
create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
  v_is_admin boolean;
  v_shop uuid;
  v_payment_rejected boolean;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if p_to not in ('confirmed', 'preparing', 'ready-for-pickup', 'cancelled') then
      raise exception 'forbidden';
    end if;
  end if;

  -- P1 #8: a bKash/Nagad order may not START FULFILMENT before the shop has
  -- verified the payment in its own wallet (ps_verify_payment flips
  -- payment_status to 'verified'). 'confirmed' and 'cancelled' stay legal —
  -- canceling releases the reservation via trg_orders_release_on_cancel.
  if v_order.payment in ('bkash', 'nagad')
     and v_order.payment_status = 'pending_verification'
     and p_to in ('preparing', 'ready-for-pickup', 'courier-assigned', 'out-for-delivery', 'delivered') then
    raise exception 'payment not verified';
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
    -- 202609170001: the one allowed skip — Confirmed straight to Ready for
    -- pickup ("two-tap flow"). 'preparing' is optional bookkeeping now.
    if v_to_pos <> v_from_pos + 1
       and not (v_order.status = 'confirmed' and p_to = 'ready-for-pickup') then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  -- P1 #8 (2): a cancelled wallet order's payment is settled as REJECTED —
  -- the customer's track page says "not accepted", never "under
  -- verification" on a cancelled order.
  v_payment_rejected := p_to = 'cancelled'
    and v_order.payment in ('bkash', 'nagad')
    and v_order.payment_status = 'pending_verification';

  update orders
  set status = p_to,
      payment_status = case when v_payment_rejected then 'rejected' else payment_status end,
      payment_verified_at = case when v_payment_rejected then now() else payment_verified_at end,
      updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  if v_payment_rejected then
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, p_to,
      'Payment rejected — order cancelled (refund from the shop wallet, offline)',
      auth.uid());
  end if;
  return v_order;
end $$;

-- ----------------------------------------------------------------------------
-- 2. ps_checkout_health — 202609160005 body + two_tap_flow_ok
-- ----------------------------------------------------------------------------
create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609170001',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true),
    'dispatch_reoffer_ok', (
      not exists (
        select 1 from pg_constraint k
        where k.conrelid = 'public.delivery_assignments'::regclass
          and k.conname = 'delivery_assignments_order_id_key'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_live_offer'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
          and p.prosrc not like '%rider_assignments%'
      )
    ),
    -- 202609170001: confirmed → ready-for-pickup is a legal admin/vendor move.
    'two_tap_flow_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_advance_order'
        and p.prosrc like '%v_order.status = ''confirmed'' and p_to = ''ready-for-pickup''%'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

notify pgrst, 'reload schema';

commit;

-- ----------------------------------------------------------------------------
-- VERIFY — expect 2 × OK.
-- ----------------------------------------------------------------------------
select 'confirmed → ready-for-pickup allowed (two-tap flow)' as check_,
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_advance_order'
           and p.prosrc like '%v_order.status = ''confirmed'' and p_to = ''ready-for-pickup''%')
       then 'OK' else 'MISSING' end as state
union all
select '/api/health probe knows it',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'ps_checkout_health'
           and p.prosrc like '%two_tap_flow_ok%')
       then 'OK' else 'MISSING' end;


-- ==== Feature: area broadcast dispatch (202609250001) ====
-- Area broadcast: many invitations, exactly one winning rider.
-- Apply after 202609240003. No customer pickup orders are dispatched.
begin;

-- Keep the legacy index name for the existing health probe, but invitations
-- no longer reserve an order. Only a rider who accepts owns it.
drop index if exists delivery_assignments_one_live_offer;
create unique index delivery_assignments_one_live_offer
  on delivery_assignments(order_id) where state in ('accepted', 'picked_up');
create unique index if not exists delivery_assignments_one_rider_offer
  on delivery_assignments(order_id, rider_id)
  where state in ('offered', 'accepted', 'picked_up');
alter table delivery_assignments add column if not exists is_broadcast boolean not null default false;

-- Invitations must not count as work (or broadcasting fills every rider).
create or replace function ps_track_rider_load()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'UPDATE' then
    if OLD.state in ('accepted','picked_up') and NEW.state not in ('accepted','picked_up') then
      update riders set current_load = greatest(0, current_load - 1),
        total_deliveries = total_deliveries + case when NEW.state = 'delivered' then 1 else 0 end
      where id = OLD.rider_id;
    elsif OLD.state not in ('accepted','picked_up') and NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'DELETE' and OLD.state in ('accepted','picked_up') then
    update riders set current_load = greatest(0, current_load - 1) where id = OLD.rider_id;
  end if;
  return coalesce(NEW, OLD);
end $$;
update riders r set current_load = (
  select count(*) from delivery_assignments a
  where a.rider_id = r.id and a.state in ('accepted','picked_up')
);

-- Internal helper. Every dispatch writer locks the order before its offers.
-- "Area" means the checkout delivery zone, already maintained in zone_ids.
create or replace function ps_broadcast_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready-for-pickup'
     or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    return null;
  end if;
  if exists (select 1 from delivery_assignments where order_id = p_order_id
    and (state in ('accepted','picked_up') or (state = 'offered' and not is_broadcast))) then
    return null; -- a manual offer is exclusive until it expires/is declined
  end if;

  insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at, is_broadcast)
  select p_order_id, r.id, 'offered', now(), now() + interval '90 seconds', true
  from riders r
  where r.status = 'active' and r.is_online and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_order.zone_id]
    and r.cash_in_hand < 500000 and r.current_load < 2
    and not exists (select 1 from delivery_assignments a
      where a.order_id = p_order_id and a.rider_id = r.id
        and (a.state in ('offered','accepted','picked_up','cancelled')
          or a.offered_at > now() - interval '5 minutes'))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;
revoke all on function ps_broadcast_order(uuid) from public, anon, authenticated;
grant execute on function ps_broadcast_order(uuid) to service_role;

create or replace function ps_auto_dispatch_ready_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready-for-pickup' and old.status is distinct from new.status then
    perform ps_broadcast_order(new.id);
  end if;
  return new;
end $$;

create or replace function ps_rider_accept(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_rider riders%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  -- Different invitation IDs share this one lock: only the first can win.
  select * into v_order from orders where id = v_assignment.order_id for update;
  select * into v_rider from riders where id = v_assignment.rider_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' or v_assignment.expires_at <= now()
     or v_order.status <> 'ready-for-pickup' or v_order.rider_id is not null then
    raise exception 'offer no longer available';
  end if;
  if v_rider.status <> 'active' or not v_rider.is_online
     or v_rider.cash_in_hand >= 500000 or v_rider.current_load >= 2
     or (v_assignment.is_broadcast and (
       not ps_rider_on_shift(v_rider) or not (v_rider.zone_ids @> array[v_order.zone_id]))) then
    raise exception 'rider not available';
  end if;
  if coalesce(v_order.is_pickup, false)
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    raise exception 'order not ready for dispatch';
  end if;
  update delivery_assignments set state = 'cancelled'
    where order_id = v_order.id and id <> p_assignment_id and state = 'offered';
  update delivery_assignments set state = 'accepted' where id = p_assignment_id
    returning * into v_assignment;
  update orders set status = 'courier-assigned', rider_id = v_rider.id, updated_at = now()
    where id = v_order.id;
  insert into order_status_history(order_id, status, note, changed_by)
    values(v_order.id, 'courier-assigned', 'First rider accepted the delivery request', auth.uid());
  return v_assignment;
end $$;

create or replace function ps_rider_reject(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then raise exception 'offer no longer available'; end if;
  update delivery_assignments set state = 'cancelled' where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- Existing cron and rider polling invoke this service-only RPC. It also
-- retries waiting orders: riders coming online later need no admin action.
create or replace function ps_expire_stale_offers()
returns int language plpgsql security definer set search_path = public as $$
declare v_order record; v_count int := 0; v_changed int;
begin
  for v_order in
    select o.id from orders o
    where o.status = 'ready-for-pickup'
      or exists(select 1 from delivery_assignments a where a.order_id = o.id
        and a.state = 'offered' and a.expires_at <= now())
    order by o.id for update of o skip locked
  loop
    update delivery_assignments set state = 'expired'
      where order_id = v_order.id and state = 'offered' and expires_at <= now();
    get diagnostics v_changed = row_count;
    v_count := v_count + v_changed;
    perform ps_broadcast_order(v_order.id);
  end loop;
  return v_count;
end $$;

create or replace function ps_offer_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  v_id := ps_broadcast_order(p_order_id);
  if v_id is null then raise exception 'no eligible rider'; end if;
  return v_id;
end $$;

-- Manual fallback before acceptance, never steal an accepted/picked-up job.
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_oid uuid; v_count int := 0; v_order orders%rowtype;
begin
  for v_oid in select distinct unnest(coalesce(p_order_ids, '{}'::uuid[])) order by 1 loop
    select * into v_order from orders where id = v_oid for update;
    if not found or v_order.status <> 'ready-for-pickup'
       or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null then continue; end if;
    if not exists(select 1 from riders where id = p_rider_id and status = 'active' and is_online
      and cash_in_hand < 500000 and current_load < 2) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  from public, anon;
grant execute on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  to authenticated;
revoke all on function ps_expire_stale_offers(), ps_assign_batch_to_rider(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function ps_expire_stale_offers(), ps_assign_batch_to_rider(uuid, uuid[])
  to service_role;
notify pgrst, 'reload schema';
commit;


-- ==== Feature: dispatch cancellation guard (202609250002) ====
-- Verification repair: cancelling an accepted/picked-up assignment used to
-- leave its order assigned to nobody, and could strand a collected parcel.
-- The dispatch board withdraws pending invitations only. Changing an active
-- trip requires a separate controlled recovery flow, not this button.
begin;
create or replace function ps_cancel_assignment(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found'; end if;
  -- Same lock order as acceptance, so an accept racing withdrawal is safe.
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then
    raise exception 'only pending invitations can be withdrawn';
  end if;
  update delivery_assignments set state = 'cancelled' where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;
revoke all on function ps_cancel_assignment(uuid) from public, anon;
grant execute on function ps_cancel_assignment(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

-- ==== Feature: dispatch withdraw/resume + settle claims + PIN lockout + health (202609250003…006) ====
-- P0 audit fixes (2026-09-25): superseded riders resume instantly after manual
-- expiry, rider self-settle becomes a staff-approved claim, the delivery PIN
-- locks for 15 minutes after 5 wrong codes, and the health probe covers all four.

-- Dispatch resume repair (2026-09-25 P0 fixes: H1, M1, H6-sweep).
--
-- H1: a rider DECLINE and an admin/manual WITHDRAW both wrote state='cancelled',
-- and ps_broadcast_order permanently excluded every cancelled rider. So after a
-- manual request expired, NONE of the previously invited riders could ever be
-- re-invited — the broadcast pool was dead and only brand-new riders qualified.
-- Now cancellations carry cancelled_by:
--   rider_decline = the rider said no → never auto re-offered (unchanged rule);
--   withdrawn     = admin withdrew one invitation → 5-minute cooldown, then eligible;
--   superseded    = replaced by an accept/manual offer → immediately eligible again.
-- After a manual request lapses, broadcasting resumes to the area at once.
--
-- M1: ps_assign_batch_to_rider skipped every check except readiness, and
-- ps_offer_order answered a confusing 'no eligible rider' for wallet orders
-- whose payment was never verified. Manual dispatch now refuses unverified
-- wallet orders with a clear 'payment not verified' error.
--
-- H6: ps_expire_stale_offers ran a full-table sweep on EVERY rider poll
-- (15s per rider), admin board poll and cron tick — including long-delivered
-- orders that merely own old expired rows. Now it only looks at open orders
-- and throttles itself: at most one real sweep per 10 seconds (p_force
-- bypasses the throttle for tests and manual runs).
begin;

alter table delivery_assignments add column if not exists cancelled_by text;

create table if not exists dispatch_sweep_state(
  id int primary key,
  last_run timestamptz not null default now()
);
alter table dispatch_sweep_state enable row level security;

create or replace function ps_broadcast_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready-for-pickup'
     or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    return null;
  end if;
  if exists (select 1 from delivery_assignments where order_id = p_order_id
    and (state in ('accepted','picked_up') or (state = 'offered' and not is_broadcast))) then
    return null; -- a manual offer is exclusive until it expires/is declined
  end if;

  insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at, is_broadcast)
  select p_order_id, r.id, 'offered', now(), now() + interval '90 seconds', true
  from riders r
  where r.status = 'active' and r.is_online and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_order.zone_id]
    and r.cash_in_hand < 500000 and r.current_load < 2
    and not exists (select 1 from delivery_assignments a
      where a.order_id = p_order_id and a.rider_id = r.id
        and (a.state in ('offered','accepted','picked_up')
          -- A rider who declined this order is never auto re-offered it.
          or (a.state = 'cancelled' and a.cancelled_by = 'rider_decline')
          -- Withdrawn/expired invitations cool down for five minutes; rows
          -- superseded by an accept or a manual offer re-qualify at once, so
          -- broadcasting resumes to the area the moment a manual request ends.
          or (a.state in ('cancelled','expired')
            and coalesce(a.cancelled_by, 'withdrawn') <> 'superseded'
            and a.offered_at > now() - interval '5 minutes')))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;
revoke all on function ps_broadcast_order(uuid) from public, anon, authenticated;
grant execute on function ps_broadcast_order(uuid) to service_role;

create or replace function ps_rider_reject(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then raise exception 'offer no longer available'; end if;
  update delivery_assignments set state = 'cancelled', cancelled_by = 'rider_decline'
    where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- The accept path marks losing invitations superseded (the order is assigned
-- now, so they are moot — but the label keeps the history honest).
create or replace function ps_rider_accept(p_assignment_id uuid)
returns delivery_assignments language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_rider riders%rowtype;
begin
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  -- Different invitation IDs share this one lock: only the first can win.
  select * into v_order from orders where id = v_assignment.order_id for update;
  select * into v_rider from riders where id = v_assignment.rider_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' or v_assignment.expires_at <= now()
     or v_order.status <> 'ready-for-pickup' or v_order.rider_id is not null then
    raise exception 'offer no longer available';
  end if;
  if v_rider.status <> 'active' or not v_rider.is_online
     or v_rider.cash_in_hand >= 500000 or v_rider.current_load >= 2
     or (v_assignment.is_broadcast and (
       not ps_rider_on_shift(v_rider) or not (v_rider.zone_ids @> array[v_order.zone_id]))) then
    raise exception 'rider not available';
  end if;
  if coalesce(v_order.is_pickup, false)
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    raise exception 'order not ready for dispatch';
  end if;
  update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
    where order_id = v_order.id and id <> p_assignment_id and state = 'offered';
  update delivery_assignments set state = 'accepted' where id = p_assignment_id
    returning * into v_assignment;
  update orders set status = 'courier-assigned', rider_id = v_rider.id, updated_at = now()
    where id = v_order.id;
  insert into order_status_history(order_id, status, note, changed_by)
    values(v_order.id, 'courier-assigned', 'First rider accepted the delivery request', auth.uid());
  return v_assignment;
end $$;

create or replace function ps_offer_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_order orders%rowtype;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  select * into v_order from orders where id = p_order_id;
  if found and v_order.payment in ('bkash','nagad')
     and v_order.payment_status <> 'verified' then
    raise exception 'payment not verified';
  end if;
  v_id := ps_broadcast_order(p_order_id);
  if v_id is null then raise exception 'no eligible rider'; end if;
  return v_id;
end $$;

-- Manual fallback before acceptance, never steal an accepted/picked-up job.
-- Unverified wallet orders are skipped (verify first, then dispatch).
create or replace function ps_assign_batch_to_rider(p_rider_id uuid, p_order_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_oid uuid; v_count int := 0; v_order orders%rowtype;
begin
  for v_oid in select distinct unnest(coalesce(p_order_ids, '{}'::uuid[])) order by 1 loop
    select * into v_order from orders where id = v_oid for update;
    if not found or v_order.status <> 'ready-for-pickup'
       or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null then continue; end if;
    if v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified' then continue; end if;
    if not exists(select 1 from riders where id = p_rider_id and status = 'active' and is_online
      and cash_in_hand < 500000 and current_load < 2) then raise exception 'rider not available'; end if;
    update delivery_assignments set state = 'cancelled', cancelled_by = 'superseded'
      where order_id = v_oid and state = 'offered';
    insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at)
      values(v_oid, p_rider_id, 'offered', now(), now() + interval '90 seconds');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function ps_cancel_assignment(p_assignment_id uuid)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare v_assignment delivery_assignments%rowtype;
begin
  if not (select ps_is_admin()) then raise exception 'forbidden'; end if;
  select * into v_assignment from delivery_assignments where id = p_assignment_id;
  if not found then raise exception 'assignment not found'; end if;
  -- Same lock order as acceptance, so an accept racing withdrawal is safe.
  perform 1 from orders where id = v_assignment.order_id for update;
  select * into v_assignment from delivery_assignments where id = p_assignment_id for update;
  if v_assignment.state <> 'offered' then
    raise exception 'only pending invitations can be withdrawn';
  end if;
  update delivery_assignments set state = 'cancelled', cancelled_by = 'withdrawn'
    where id = p_assignment_id
    returning * into v_assignment;
  perform ps_broadcast_order(v_assignment.order_id);
  return v_assignment;
end $$;

-- The sweep is service-only and throttled: rider feeds poll every 15 seconds
-- each, so without the throttle N riders mean N full sweeps per 15 seconds.
-- p_force=true is for tests and deliberate manual runs only.
drop function if exists ps_expire_stale_offers();
create or replace function ps_expire_stale_offers(p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v_order record; v_count int := 0; v_changed int;
begin
  if not coalesce(p_force, false) then
    insert into dispatch_sweep_state(id, last_run) values (1, now())
    on conflict (id) do update set last_run = now()
    where dispatch_sweep_state.last_run < now() - interval '10 seconds';
    get diagnostics v_changed = row_count;
    if v_changed = 0 then return 0; end if; -- another caller swept moments ago
  end if;
  for v_order in
    select o.id from orders o
    where o.status = 'ready-for-pickup'
       or (o.status in ('courier-assigned','out-for-delivery')
        and exists(select 1 from delivery_assignments a where a.order_id = o.id
          and a.state = 'offered' and a.expires_at <= now()))
    order by o.id for update of o skip locked
  loop
    update delivery_assignments set state = 'expired'
      where order_id = v_order.id and state = 'offered' and expires_at <= now();
    get diagnostics v_changed = row_count;
    v_count := v_count + v_changed;
    perform ps_broadcast_order(v_order.id);
  end loop;
  return v_count;
end $$;

-- Rider RPCs never needed the public browser key (they 403 without a rider
-- session anyway); lock them to signed-in callers like accept/reject.
-- Conditional: pickup/deliver/failed-attempt ship in earlier migrations that
-- a partial database (or the isolated SQL test) may not have applied yet.
-- ps_rider_deliver is locked in 202609250005 right after its rewrite.
do $$ begin
  if to_regprocedure('public.ps_rider_pickup(uuid)') is not null then
    revoke all on function ps_rider_pickup(uuid) from public, anon;
    grant execute on function ps_rider_pickup(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('public.ps_rider_failed_attempt(uuid, text)') is not null then
    revoke all on function ps_rider_failed_attempt(uuid, text) from public, anon;
    grant execute on function ps_rider_failed_attempt(uuid, text) to authenticated, service_role;
  end if;
end $$;
revoke all on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  from public, anon;
grant execute on function ps_rider_accept(uuid), ps_rider_reject(uuid), ps_offer_order(uuid)
  to authenticated, service_role;
revoke all on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function ps_expire_stale_offers(boolean), ps_assign_batch_to_rider(uuid, uuid[])
  to service_role;
revoke all on function ps_cancel_assignment(uuid) from public, anon;
grant execute on function ps_cancel_assignment(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
-- Settle-claim approval (2026-09-25 P0 fix: H3).
--
-- ps_rider_settle used to zero the rider's own cash balance with no proof and
-- no review: one tap wiped up to ৳5,000 of COD debt. Now a rider files a
-- settle CLAIM (one pending per rider); the balance only moves when staff
-- settle the rider through the existing admin flow, which approves the claim.
-- Staff can also reject a claim with a note instead of settling.
begin;

create table if not exists rider_settle_claims(
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(id) on delete cascade,
  amount bigint not null check (amount > 0),
  method text not null default 'cash',
  reference text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  note text
);
create unique index if not exists rider_settle_claims_one_pending
  on rider_settle_claims(rider_id) where status = 'pending';
alter table rider_settle_claims enable row level security;

-- Return type changes rider_settlements -> rider_settle_claims, so the old
-- function must be dropped (CREATE OR REPLACE cannot change the type).
drop function if exists ps_rider_settle(text, text);
create function ps_rider_settle(p_method text, p_reference text default '')
returns rider_settle_claims
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_claim rider_settle_claims%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  if v_rider.cash_in_hand <= 0 then
    raise exception 'nothing to settle';
  end if;
  if exists (select 1 from rider_settle_claims
             where rider_id = v_rider.id and status = 'pending') then
    raise exception 'settle already pending';
  end if;
  insert into rider_settle_claims (rider_id, amount, method, reference)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(nullif(trim(p_method), ''), 'cash'),
    coalesce(trim(p_reference), '')
  )
  returning * into v_claim;
  return v_claim;
end $$;

-- Staff settle keeps settling the FULL current hand balance (the rider may
-- have delivered more since claiming) and approves the pending claim, if any.
create or replace function ps_admin_settle_rider(
  p_rider_id uuid,
  p_method text default 'cash',
  p_reference text default ''
)
returns rider_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_settlement rider_settlements%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_rider from riders where id = p_rider_id for update;
  if not found then
    raise exception 'rider not found';
  end if;
  if v_rider.cash_in_hand <= 0 then
    raise exception 'nothing to settle';
  end if;
  insert into rider_settlements (rider_id, amount, method, reference, settled_by)
  values (
    v_rider.id,
    v_rider.cash_in_hand,
    coalesce(nullif(trim(p_method), ''), 'cash'),
    coalesce(trim(p_reference), ''),
    auth.uid()
  )
  returning * into v_settlement;
  update riders set cash_in_hand = 0 where id = v_rider.id;
  update rider_settle_claims
  set status = 'approved', decided_at = now(), decided_by = auth.uid()
  where rider_id = v_rider.id and status = 'pending';
  return v_settlement;
end $$;

-- Staff reject a rider's pending claim (money never arrived). The rider's
-- balance is untouched; they can file a fresh claim after paying.
create or replace function ps_admin_reject_settle(
  p_rider_id uuid,
  p_note text default null
)
returns rider_settle_claims
language plpgsql security definer set search_path = public as $$
declare v_claim rider_settle_claims%rowtype;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_claim from rider_settle_claims
  where rider_id = p_rider_id and status = 'pending' for update;
  if not found then
    raise exception 'no pending claim';
  end if;
  update rider_settle_claims
  set status = 'rejected', decided_at = now(), decided_by = auth.uid(),
      note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_claim.id
  returning * into v_claim;
  return v_claim;
end $$;

revoke all on function ps_rider_settle(text, text) from public, anon;
grant execute on function ps_rider_settle(text, text) to authenticated, service_role;
revoke all on function ps_admin_settle_rider(uuid, text, text) from public, anon;
grant execute on function ps_admin_settle_rider(uuid, text, text) to authenticated, service_role;
revoke all on function ps_admin_reject_settle(uuid, text) from public, anon;
grant execute on function ps_admin_reject_settle(uuid, text) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
-- Delivery PIN brute-force guard (2026-09-25 P0 fix: H4).
--
-- ps_rider_deliver never counted wrong codes: the only throttle was the
-- API rate limit, so a rider holding the parcel could guess the 4-digit
-- code indefinitely. Now 5 wrong codes lock code entry for 15 minutes
-- (visible in history for staff), and a success resets the counter.
--
-- Two calls by design: a RAISE rolls the whole transaction back, so a
-- counter incremented on the failing statement could never persist.
-- ps_rider_deliver_check counts the attempt and COMMITS it (it only raises
-- for forbidden/state errors, never for a wrong code); ps_rider_deliver
-- then re-verifies read-only and completes the delivery.
begin;

alter table orders add column if not exists delivery_code_attempts int not null default 0;
alter table orders add column if not exists delivery_code_locked_until timestamptz;

-- 'ok' | 'mismatch' | 'locked'. Wrong codes are counted here and persist
-- because this function succeeds (returns) instead of raising for them.
create or replace function ps_rider_deliver_check(p_assignment_id uuid, p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_attempts int;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.delivery_code_locked_until is not null
     and v_order.delivery_code_locked_until > now() then
    return 'locked';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    update orders set delivery_code_attempts = delivery_code_attempts + 1, updated_at = now()
    where id = v_order.id
    returning delivery_code_attempts into v_attempts;
    if v_attempts >= 5 then
      update orders set delivery_code_locked_until = now() + interval '15 minutes'
      where id = v_order.id;
      insert into order_status_history (order_id, status, note, changed_by)
      values (v_order.id, v_order.status,
        'Delivery code locked after 5 wrong attempts', auth.uid());
      return 'locked';
    end if;
    return 'mismatch';
  end if;
  return 'ok';
end $$;

create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  -- Read-only re-verification: attempts are counted by
  -- ps_rider_deliver_check (a raise here would roll any count back).
  if v_order.delivery_code_locked_until is not null
     and v_order.delivery_code_locked_until > now() then
    raise exception 'delivery code locked — too many wrong attempts, try again in 15 minutes';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- P1 #8: the rider only ever carries cash for COD orders — a wallet order
  -- was paid into the shop's own bKash/Nagad wallet at checkout.
  v_cash := case when v_order.payment = 'cod' then v_order.total else 0 end;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · '
        || case
             when v_order.payment = 'bkash' then 'paid via bKash at checkout'
             when v_order.payment = 'nagad' then 'paid via Nagad at checkout'
             else 'COD collected'
           end,
      auth.uid()
    );
  end if;

  update orders
  set delivery_code_attempts = 0, delivery_code_locked_until = null, updated_at = now()
  where id = v_order.id;

  update delivery_assignments set state = 'delivered' where id = v_assignment.id
  returning * into v_assignment;
  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;
  return v_assignment;
end $$;

revoke all on function ps_rider_deliver_check(uuid, text) from public, anon;
grant execute on function ps_rider_deliver_check(uuid, text) to authenticated, service_role;
revoke all on function ps_rider_deliver(uuid, text, text) from public, anon;
grant execute on function ps_rider_deliver(uuid, text, text) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
-- Health coverage for the area-dispatch repairs (2026-09-25 P0 fix: M6).
--
-- ps_checkout_health stopped at 202609170001, so a database missing the
-- broadcast/resume/settle/lockout migrations reported "healthy" while
-- dispatch silently ran the older behaviour. Three new flags let
-- /api/health and the admin banner name the exact missing file.
begin;

create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609250006',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true),
    'dispatch_reoffer_ok', (
      not exists (
        select 1 from pg_constraint k
        where k.conrelid = 'public.delivery_assignments'::regclass
          and k.conname = 'delivery_assignments_order_id_key'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_live_offer'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
          and p.prosrc not like '%rider_assignments%'
      )
    ),
    -- 202609170001: confirmed → ready-for-pickup is a legal admin/vendor move.
    'two_tap_flow_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_advance_order'
        and p.prosrc like '%v_order.status = ''confirmed'' and p_to = ''ready-for-pickup''%'
    ),
    -- 202609250001+003: area broadcast with withdraw/decline resume.
    'broadcast_resume_ok', (
      to_regprocedure('public.ps_broadcast_order(uuid)') is not null
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'delivery_assignments'
          and c.column_name = 'cancelled_by'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_rider_offer'
      )
      and to_regprocedure('public.ps_expire_stale_offers(boolean)') is not null
    ),
    -- 202609250004: rider settle claims need staff approval.
    'settle_claims_ok', (
      exists (
        select 1 from information_schema.tables t
        where t.table_schema = 'public' and t.table_name = 'rider_settle_claims'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_admin_reject_settle'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_settle'
          and p.prosrc like '%settle already pending%'
      )
    ),
    -- 202609250005: delivery PIN locks after 5 wrong codes.
    'pin_lockout_ok', (
      exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'orders'
          and c.column_name = 'delivery_code_locked_until'
      )
      and to_regprocedure('public.ps_rider_deliver_check(uuid, text)') is not null
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_deliver'
          and p.prosrc like '%delivery_code_locked_until%'
      )
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

commit;

-- ==== Feature: instant rider offers over Realtime (202609250007) ====
-- Speed pass (2026-09-25): delivery_assignments joins the realtime
-- publication so offers push in <1s; health probe v202609250007.

-- Instant rider offers over Supabase Realtime (speed pass, 2026-09-25).
--
-- The rider job feed polls /api/rider/jobs every 15 s, so a new offer can
-- sit unseen for 15 s of its 90 s window — and every poll costs an RPC plus
-- several reads per online rider. Publishing delivery_assignments lets the
-- app subscribe to its own rows and refresh the instant an offer lands
-- (or expires under it); the 15 s poll stays as the offline backup.
--
-- postgres_changes only delivers rows the subscriber can SELECT, and policy
-- "assignments rider read own" (rider_id = ps_rider_id()) already restricts
-- riders to their own rows — no new RLS needed, no customer PII flows
-- (customer data lives on orders, which stays unpublished).
begin;

do $$ begin
  -- The publication exists on Supabase; a bare local PostgreSQL used for
  -- the workflow test creates it in the test setup.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'delivery_assignments'
     ) then
    alter publication supabase_realtime add table delivery_assignments;
  end if;
end $$;

create or replace function ps_checkout_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '202609250007',
    'gift_wrap_nullable', coalesce((
      select c.is_nullable = 'YES'
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'gift_wrap'
    ), true),
    'totals_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_totals'
        and p.prosrc like '%gift_fee%'
    ),
    'insert_guard_current', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_check_order_insert'
        and p.prosrc like '%bkash%'
    ),
    'status_update_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_write_shop_ledger'
        and p.prosrc like '%old.status is distinct from new.status%'
    ),
    'payment_verify_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_verify_payment'
        and p.prosrc like '%select * into v_order from orders where id = p_order_id;%'
    ),
    'rider_guard_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_guard_rider_self_update'
        and p.prosrc like '%current_user not in%'
    ),
    'payment_methods_widened', exists (
      select 1 from pg_constraint k
      where k.conrelid = 'public.orders'::regclass and k.conname = 'orders_payment_check'
        and pg_get_constraintdef(k.oid) like '%bkash%'
    ),
    'place_order_rpc', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_place_order'
    ),
    'rpc_grants_locked', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_place_order', 'ps_use_coupon', 'ps_book_delivery_slot',
                          'ps_return_action', 'ps_create_return_request',
                          'ps_assign_batch_to_rider', 'ps_credit_referrer',
                          'ps_expire_stale_offers', 'ps_shop_rating_recompute')
        and has_function_privilege('anon', p.oid, 'execute')
    ),
    'memberships_rls', coalesce((
      select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'memberships'
    ), true),
    'dispatch_reoffer_ok', (
      not exists (
        select 1 from pg_constraint k
        where k.conrelid = 'public.delivery_assignments'::regclass
          and k.conname = 'delivery_assignments_order_id_key'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_live_offer'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_assign_batch_to_rider'
          and p.prosrc not like '%rider_assignments%'
      )
    ),
    -- 202609170001: confirmed → ready-for-pickup is a legal admin/vendor move.
    'two_tap_flow_ok', exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ps_advance_order'
        and p.prosrc like '%v_order.status = ''confirmed'' and p_to = ''ready-for-pickup''%'
    ),
    -- 202609250001+003: area broadcast with withdraw/decline resume.
    'broadcast_resume_ok', (
      to_regprocedure('public.ps_broadcast_order(uuid)') is not null
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'delivery_assignments'
          and c.column_name = 'cancelled_by'
      )
      and exists (
        select 1 from pg_indexes i
        where i.schemaname = 'public' and i.tablename = 'delivery_assignments'
          and i.indexname = 'delivery_assignments_one_rider_offer'
      )
      and to_regprocedure('public.ps_expire_stale_offers(boolean)') is not null
    ),
    -- 202609250004: rider settle claims need staff approval.
    'settle_claims_ok', (
      exists (
        select 1 from information_schema.tables t
        where t.table_schema = 'public' and t.table_name = 'rider_settle_claims'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_admin_reject_settle'
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_settle'
          and p.prosrc like '%settle already pending%'
      )
    ),
    -- 202609250005: delivery PIN locks after 5 wrong codes.
    'pin_lockout_ok', (
      exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'orders'
          and c.column_name = 'delivery_code_locked_until'
      )
      and to_regprocedure('public.ps_rider_deliver_check(uuid, text)') is not null
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ps_rider_deliver'
          and p.prosrc like '%delivery_code_locked_until%'
      )
    ),
    -- 202609250007: delivery_assignments published for instant offers.
    'realtime_offers_ok', exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'delivery_assignments'
    )
  );
$$;

revoke all on function ps_checkout_health() from public, anon, authenticated;
grant execute on function ps_checkout_health() to service_role;

commit;

-- ============================================================================
-- Feature: delivery (rider) ratings — the customer closes the quality loop
-- (202609250008). One rating per order; service-role only (RLS, no policies).
-- ============================================================================

begin;

create table if not exists delivery_ratings (
  order_id   uuid primary key references orders (id) on delete cascade,
  rider_id   uuid not null references riders (id),
  stars      int  not null check (stars between 1 and 5),
  created_at timestamptz not null default now()
);

alter table delivery_ratings enable row level security;

commit;

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

-- ==== Feature: vendor promos (202609280003) ====
-- ============================================================================
-- B3 (2026-09-28): the shop's own promo codes.
-- ============================================================================
-- Until now only staff could create coupons (`/admin/coupons`), so a shop that
-- wanted to run "EID10 for my sarees" had to ask PROSANTI and wait.
--
-- This migration gives a shop its own codes, with the two rules that keep the
-- marketplace honest:
--
--   1. PLATFORM CAPS. A shop may not promise more than the platform allows:
--      at most `max_percent` off, a fixed discount no bigger than
--      `max_discount`, a code no longer than `max_days`, at most `max_usage`
--      redemptions, and no more than `max_active` live codes at once. Staff
--      can change every cap in `vendor_promo_limits` without a deploy.
--      A vendor calling Supabase directly (anon key + JWT) hits the same wall
--      as the API: the guard trigger below, not the route, is the authority.
--
--   2. THE DISCOUNT LEAVES THE SHOP'S OWN SHARE. A platform coupon is
--      PROSANTI's marketing spend; a shop's coupon is the shop's. So for a
--      coupon whose `shop_id` matches the order's shop, the ledger subtracts
--      the discount from that shop's payable and records it in
--      `shop_ledger.promo_discount`. Commission is untouched — the platform
--      never quietly pays for a shop's own discount. The vendor screen shows
--      this arithmetic BEFORE the code is saved ("you will get ≈ …").
--
-- Codes stay usable only on their own shop's products: a `coupons.shop_id`
-- that is set must equal the order's shop, enforced by a trigger on `orders`
-- (so it holds for every generation of ps_place_order).
--
-- Additive + idempotent. Expect "VENDOR PROMOS OK".
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns: who owns a code, and who typed it.
-- ---------------------------------------------------------------------------
alter table public.coupons
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
alter table public.coupons
  add column if not exists created_by text;

create index if not exists idx_coupons_shop on public.coupons (shop_id);

-- ---------------------------------------------------------------------------
-- 2. The caps (one row, staff-editable — no migration to change a number).
--    `max_discount` is paisa (§69): 50000 = ৳500.
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_promo_limits (
  id             text primary key default 'default',
  max_percent    int  not null default 25  check (max_percent between 1 and 100),
  max_discount   bigint not null default 50000 check (max_discount > 0),
  max_days       int  not null default 30  check (max_days between 1 and 180),
  max_usage      int  not null default 300 check (max_usage between 1 and 100000),
  max_active     int  not null default 3   check (max_active between 1 and 50),
  updated_at     timestamptz not null default now()
);

insert into public.vendor_promo_limits (id) values ('default')
  on conflict (id) do nothing;

alter table public.vendor_promo_limits enable row level security;

-- Everyone may READ the caps (the vendor form prints them, the storefront
-- needs nothing from them but reading them is harmless).
drop policy if exists "promo limits public read" on public.vendor_promo_limits;
create policy "promo limits public read" on public.vendor_promo_limits
  for select using (true);

drop policy if exists "promo limits admin write" on public.vendor_promo_limits;
create policy "promo limits admin write" on public.vendor_promo_limits
  for all using (ps_is_admin()) with check (ps_is_admin());

-- ---------------------------------------------------------------------------
-- 3. Vendors get their own codes — and only their own.
-- ---------------------------------------------------------------------------
drop policy if exists "coupons vendor read own" on public.coupons;
create policy "coupons vendor read own" on public.coupons
  for select using (shop_id = ps_vendor_shop());

drop policy if exists "coupons vendor insert own" on public.coupons;
create policy "coupons vendor insert own" on public.coupons
  for insert with check (shop_id = ps_vendor_shop() and ps_vendor_shop() is not null);

drop policy if exists "coupons vendor update own" on public.coupons;
create policy "coupons vendor update own" on public.coupons
  for update using (shop_id = ps_vendor_shop())
  with check (shop_id = ps_vendor_shop());

-- The guard: caps, ownership and immutability — for vendor sessions only.
create or replace function ps_guard_vendor_promo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limits vendor_promo_limits%rowtype;
  v_shop uuid;
  v_active int;
begin
  -- Staff keeps the whole table (this is where platform coupons are born).
  if (select ps_is_admin()) then
    return new;
  end if;

  select * into v_limits from vendor_promo_limits where id = 'default';
  if v_limits.id is null then
    v_limits.max_percent := 25; v_limits.max_discount := 50000;
    v_limits.max_days := 30;    v_limits.max_usage := 300;
    v_limits.max_active := 3;
  end if;

  v_shop := ps_vendor_shop();
  if v_shop is null then
    raise exception 'only a shop may create a promo here';
  end if;
  if new.shop_id is distinct from v_shop then
    raise exception 'a shop may only create promos for itself';
  end if;

  -- Delivery money is the platform's: a shop discounts its product, never
  -- the courier leg. (A shop that wants free delivery uses its own setting.)
  if new.type not in ('percent', 'fixed') then
    raise exception 'a shop promo must be percent or fixed';
  end if;
  if new.type = 'percent' and (new.value < 1 or new.value > v_limits.max_percent) then
    raise exception 'percent must be between 1 and % (the platform cap)', v_limits.max_percent;
  end if;
  if new.type = 'fixed' and (new.value < 1 or new.value > v_limits.max_discount) then
    raise exception 'fixed discount must be between 1 and % paisa (the platform cap)', v_limits.max_discount;
  end if;
  if new.max_discount is not null and new.type <> 'percent' then
    raise exception 'a discount cap only applies to percent promos';
  end if;
  if new.max_discount is not null and new.max_discount > v_limits.max_discount then
    raise exception 'the discount cap may not exceed % paisa', v_limits.max_discount;
  end if;
  if new.valid_until is null then
    raise exception 'a shop promo must have an end date';
  end if;
  if new.valid_until > now() + make_interval(days => v_limits.max_days) then
    raise exception 'a shop promo may run at most % days', v_limits.max_days;
  end if;
  if new.valid_from is not null and new.valid_from < now() - interval '5 minutes' then
    raise exception 'a shop promo cannot start in the past';
  end if;
  if new.usage_limit is null then
    raise exception 'a shop promo must have a usage limit';
  end if;
  if new.usage_limit < 1 or new.usage_limit > v_limits.max_usage then
    raise exception 'usage limit must be between 1 and %', v_limits.max_usage;
  end if;

  if tg_op = 'UPDATE' then
    -- The redemption counter and the owner are facts, not fields.
    if new.used is distinct from old.used then
      raise exception 'the usage counter is written by the checkout, not by the shop';
    end if;
    if new.shop_id is distinct from old.shop_id then
      raise exception 'a promo cannot change hands';
    end if;
    if new.code is distinct from old.code and old.used > 0 then
      raise exception 'a promo that has been used cannot be renamed';
    end if;
  end if;

  if coalesce(new.active, true) and (tg_op = 'INSERT' or not coalesce(old.active, false)) then
    select count(*) into v_active
      from coupons
     where shop_id = v_shop
       and active
       and (tg_op = 'INSERT' or id <> old.id);
    if v_active >= v_limits.max_active then
      raise exception 'at most % live promos per shop', v_limits.max_active;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_vendor_promo on public.coupons;
create trigger trg_guard_vendor_promo
  before insert or update on public.coupons
  for each row execute function ps_guard_vendor_promo();

-- ---------------------------------------------------------------------------
-- 4. A shop's code only works on that shop's order.
--    A trigger (not a patch of ps_place_order) so it holds on every installed
--    generation of the RPC.
-- ---------------------------------------------------------------------------
create or replace function ps_guard_order_coupon_shop()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if new.coupon_id is null then
    return new;
  end if;
  select shop_id into v_owner from coupons where id = new.coupon_id;
  -- Platform coupons (shop_id null) apply anywhere, as they always did.
  if v_owner is not null and v_owner is distinct from new.shop_id then
    raise exception 'coupon belongs to another shop';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_guard_coupon_shop on public.orders;
create trigger trg_orders_guard_coupon_shop
  before insert or update of coupon_id on public.orders
  for each row execute function ps_guard_order_coupon_shop();

-- ---------------------------------------------------------------------------
-- 5. The ledger: a shop's own discount leaves the shop's own share.
-- ---------------------------------------------------------------------------
alter table public.shop_ledger
  add column if not exists promo_discount bigint not null default 0;

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
  v_coupon_shop uuid;
  v_promo bigint := 0;
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
    -- B3: the SHOP's own promo code. The shopper's discount is real money the
    -- shop chose to give away, so it comes out of this shop's share — the
    -- platform's commission is never used to fund it. A platform coupon
    -- (shop_id null) is PROSANTI's own spend and leaves this line alone.
    if new.coupon_id is not null and new.shop_id is not null then
      select shop_id into v_coupon_shop from coupons where id = new.coupon_id;
      if v_coupon_shop = new.shop_id and coalesce(new.discount, 0) > 0 then
        v_promo := least(coalesce(new.discount, 0), greatest(0, v_payable));
        v_payable := greatest(0, v_payable - v_promo);
      end if;
    end if;
    -- A return order is the reverse leg: the shop pays the product share back.
    if coalesce((v_row->>'is_return')::boolean, false) then
      v_payable := -(new.subtotal - v_commission);
      v_promo := 0;
    end if;
    if new.shop_id is null then
      return new;
    end if;
    insert into shop_ledger (shop_id, order_id, subtotal, commission, payable, delivery_charge, tip_amount, surcharge_total, promo_discount)
    values (new.shop_id, new.id, new.subtotal, v_commission, v_payable, v_delivery, v_tip, v_sur, v_promo)
    on conflict (order_id) do update set
      subtotal = excluded.subtotal,
      commission = excluded.commission,
      payable = excluded.payable,
      delivery_charge = excluded.delivery_charge,
      tip_amount = excluded.tip_amount,
      surcharge_total = excluded.surcharge_total,
      promo_discount = excluded.promo_discount;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_ledger_on_delivered on public.orders;
create trigger trg_orders_ledger_on_delivered
  after update of status on orders
  for each row execute function ps_write_shop_ledger();

commit;

do $$
begin
  raise notice 'VENDOR PROMOS OK';
end $$;

-- ==== Feature: shop funnel (202609280004) ====
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

-- ==== Feature: shop verification (202609280005) ====
-- ============================================================================
-- Verified shop badge (2026-09-28) — B5 of the shop-service upgrade
--
-- The first question a new customer asks about an unknown shop is "can I trust
-- it?". A badge only answers that if it means something specific and cannot be
-- awarded by the shop itself. So:
--
--   * TWO DOCUMENT CHECKS, not one vague "verified" switch: the owner's NID and
--     the trade licence. Staff tick what they actually held and looked at.
--   * THE BADGE IS DERIVED FROM THE EVIDENCE. Both checks in → verified_at is
--     stamped. Remove either check → the badge, the timestamp and the officer
--     are CLEARED by the trigger below, so a badge can never outlive the
--     documents behind it (not even against a direct SQL update).
--   * A SHOP CANNOT VERIFY ITSELF. Every verification column is added to
--     ps_guard_shop_vendor_update: a vendor session (or a direct anon-key call
--     with the shop's own JWT) that tries to set them is refused.
--   * AN AUDIT TRAIL THAT SURVIVES THE NEXT EDIT. `shop_verification_events`
--     is append-only (no update/delete policy, plus a trigger that refuses
--     both), so "who verified this, when, and what did they write" stays
--     answerable even after the badge is taken away and given back.
--
-- Privacy: the shop's own note and the officer's e-mail are staff-only. The
-- storefront reads the two booleans and the date — never the note.
--
-- Idempotent — safe to re-run. Expect "SHOP VERIFICATION OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists nid_checked           boolean not null default false,
  add column if not exists trade_licence_checked boolean not null default false,
  add column if not exists verified_at           timestamptz,
  add column if not exists verified_by           uuid,
  add column if not exists verified_by_email     text,
  add column if not exists verification_note     text;

-- ---------------------------------------------------------------------------
-- 2. The audit log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_verification_events (
  id                    bigint generated always as identity primary key,
  shop_id               uuid not null references public.shops (id) on delete cascade,
  created_at            timestamptz not null default now(),
  action                text not null check (action in ('verified', 'unverified', 'note')),
  nid_checked           boolean not null,
  trade_licence_checked boolean not null,
  note                  text,
  actor_id              uuid,
  actor_email           text
);

create index if not exists shop_verification_events_shop_idx
  on public.shop_verification_events (shop_id, created_at desc);

alter table public.shop_verification_events enable row level security;

drop policy if exists "verification events admin read" on public.shop_verification_events;
create policy "verification events admin read" on public.shop_verification_events
  for select using (ps_is_admin());

drop policy if exists "verification events admin insert" on public.shop_verification_events;
create policy "verification events admin insert" on public.shop_verification_events
  for insert with check (ps_is_admin());

-- No UPDATE / DELETE policy exists on purpose; the trigger makes that explicit
-- rather than relying on "the policy was never written".
create or replace function ps_guard_verification_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'verification history cannot be rewritten';
end $$;

drop trigger if exists trg_verification_events_no_update on public.shop_verification_events;
create trigger trg_verification_events_no_update
  before update or delete on public.shop_verification_events
  for each row execute function ps_guard_verification_append_only();

-- ---------------------------------------------------------------------------
-- 3. The badge follows the evidence (and only staff may move it)
-- ---------------------------------------------------------------------------
create or replace function ps_guard_shop_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A brand-new row is never born verified, whoever inserts it (an INSERT has
  -- no OLD row to compare against, hence the separate branch).
  if tg_op = 'INSERT' then
    if not (select ps_is_admin()) then
      new.nid_checked := false;
      new.trade_licence_checked := false;
      new.verified_at := null;
      new.verified_by := null;
      new.verified_by_email := null;
      new.verification_note := null;
      return new;
    end if;
  end if;

  -- Staff keeps the whole table; this is their job to set.
  if (select ps_is_admin()) then
    -- Badge = BOTH documents checked. Anything less and the stamp goes: a
    -- badge may not outlive the evidence it stands on.
    if not (new.nid_checked and new.trade_licence_checked) then
      new.verified_at := null;
      new.verified_by := null;
      new.verified_by_email := null;
    elsif new.verified_at is null then
      -- Granted straight in SQL (no API): the time is known, the officer is
      -- not — leave verified_by null rather than inventing a name.
      new.verified_at := now();
    end if;
    return new;
  end if;

  -- Everyone else (a vendor session included): the verification columns are
  -- not theirs to touch, even by a direct Supabase call.
  if new.nid_checked is distinct from old.nid_checked
     or new.trade_licence_checked is distinct from old.trade_licence_checked
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.verified_by_email is distinct from old.verified_by_email
     or new.verification_note is distinct from old.verification_note then
    raise exception 'only staff can verify a shop';
  end if;
  return new;
end $$;

drop trigger if exists trg_shops_guard_verification on public.shops;
create trigger trg_shops_guard_verification
  before insert or update on public.shops
  for each row execute function ps_guard_shop_verification();

-- A shop row created by a vendor-side insert must never arrive pre-verified.
alter table public.shops
  drop constraint if exists shops_no_self_verification;
alter table public.shops
  add constraint shops_no_self_verification
  check (verified_at is null or (nid_checked and trade_licence_checked));

commit;

do $$ begin raise notice 'SHOP VERIFICATION OK'; end $$;

-- ==== Feature: shop vacation (202609280006) ====
-- ============================================================================
-- Shop holiday / vacation schedule (2026-09-28) — B6 of the shop-service upgrade
--
-- Until now a shop could only be closed "right now": the vendor flips `is_open`
-- and has to remember to flip it back. Eid, a family wedding, a week's stock
-- trip — all of them meant either staying open on paper (orders arrive, nobody
-- is there) or closing and hoping to remember to reopen.
--
-- This adds a DATE RANGE. The shop books 10–12 Oct in advance:
--
--   * the storefront shows it as closed for those days, with the reopening date,
--     so a shopper is told something real instead of hitting a dead checkout;
--   * an order cannot be PLACED in that window — enforced by a trigger on
--     `orders`, which every generation of ps_place_order goes through, rather
--     than by patching each copy of the RPC;
--   * when the last day passes the shop is open again ON ITS OWN — nothing to
--     run, nothing to remember. The reopening is derived from the dates, not
--     from a cron job that might not fire.
--
-- Deliberately NOT touched: `is_open`. A holiday does not overwrite the shop's
-- own daily switch — while the holiday runs the shop is closed, and the day
-- after it ends the shop is exactly as it left itself.
--
-- A vendor may set its own holiday (it only costs that shop its own sales), but
-- not an endless one: at most `ps_vacation_max_days()` (45) days, both dates
-- together or not at all, and the window cannot be backdated.
--
-- Idempotent — safe to re-run. Expect "SHOP VACATION OK" at the end.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The cap, in one place (staff can change it without a migration) — defined
--    first because the span CHECK below calls it while being created.
-- ---------------------------------------------------------------------------
create or replace function public.ps_vacation_max_days()
returns int
language sql
immutable
as $$ select 45 $$;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists vacation_start date,
  add column if not exists vacation_end   date,
  add column if not exists vacation_note  text;

-- Both dates together or neither; the window runs forward; and it is a holiday,
-- not a permanent closure.
alter table public.shops drop constraint if exists shops_vacation_pair_check;
alter table public.shops
  add constraint shops_vacation_pair_check
  check ((vacation_start is null) = (vacation_end is null));

alter table public.shops drop constraint if exists shops_vacation_order_check;
alter table public.shops
  add constraint shops_vacation_order_check
  check (vacation_start is null or vacation_end >= vacation_start);

alter table public.shops drop constraint if exists shops_vacation_span_check;
alter table public.shops
  add constraint shops_vacation_span_check
  check (
    vacation_start is null
    or (vacation_end - vacation_start) <= public.ps_vacation_max_days()
  );

-- Is this shop on holiday at `p_at` (default: now)?
create or replace function public.ps_shop_on_vacation(p_shop public.shops, p_at timestamptz default now())
returns boolean
language sql
immutable
as $$
  select p_shop.vacation_start is not null
     and p_at::date >= p_shop.vacation_start
     and p_at::date <= p_shop.vacation_end
$$;

-- ---------------------------------------------------------------------------
-- 3. No orders while the shop is away — on the orders table itself, so it
--    holds for every generation of ps_place_order and for any direct write.
-- ---------------------------------------------------------------------------
create or replace function public.ps_guard_order_shop_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop public.shops;
begin
  if new.shop_id is null then
    return new;
  end if;
  -- A return is the reverse leg of a sale already made: the shop's holiday
  -- must not block the pickup of goods going back.
  if coalesce(new.is_return, false) then
    return new;
  end if;

  select * into v_shop from public.shops where id = new.shop_id;
  if not found then
    return new; -- unknown shop: not this trigger's business
  end if;

  if v_shop.status <> 'active' then
    raise exception 'shop is not taking orders';
  end if;
  if not v_shop.is_open then
    raise exception 'shop closed';
  end if;
  if public.ps_shop_on_vacation(v_shop) then
    raise exception 'shop on holiday until %',
      to_char(v_shop.vacation_end + 1, 'DD Mon YYYY');
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_guard_shop_open on public.orders;
create trigger trg_orders_guard_shop_open
  before insert on public.orders
  for each row execute function public.ps_guard_order_shop_open();

-- ---------------------------------------------------------------------------
-- 4. A holiday that has passed stops being news: the moment the window ends the
--    row is cleared, so no screen (and no report) has to know about old dates.
--    Runs on any read or write of the shop row — cheap, and it means "is there
--    a holiday?" is always answerable without comparing dates everywhere.
-- ---------------------------------------------------------------------------
create or replace function public.ps_expire_shop_vacation()
returns trigger
language plpgsql
as $$
begin
  if new.vacation_end is not null and new.vacation_end < (now() at time zone 'UTC')::date then
    new.vacation_start := null;
    new.vacation_end := null;
    new.vacation_note := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_shops_expire_vacation on public.shops;
create trigger trg_shops_expire_vacation
  before update on public.shops
  for each row execute function public.ps_expire_shop_vacation();

-- Rows whose window has already elapsed are quietened now, so the UI does not
-- have to explain a holiday that ended weeks ago.
update public.shops
   set vacation_start = null,
       vacation_end = null,
       vacation_note = null
 where vacation_end is not null
   and vacation_end < (now() at time zone 'UTC')::date;

commit;

do $$ begin raise notice 'SHOP VACATION OK'; end $$;

-- ==== Feature: vendor staff (202609280007) ====
-- =====================================================================
-- C1 (2026-09-28) — a shop's owner hires their own staff.
--
-- A busy shop is not one person: somebody confirms orders while the owner
-- is at the market, somebody else packs. Until now only PROSANTI staff
-- could create a vendor login (Admin → Shops → Link vendor), so the
-- owner's hands were tied — and the workaround (handing over the owner's
-- own password) is worse than no login at all: that password also opens
-- payouts, the profile and the shop's own sign.
--
-- So the owner may now open STAFF logins for their shop. The rules that
-- make that safe:
--   • a staff login is a STAFF login — no path here creates or becomes an
--     owner (the API only ever writes role='staff', and the trigger below
--     makes role and shop immutable on a row that already exists);
--   • only the owner of THAT shop may add or revoke (RLS + the API, which
--     checks the session role again);
--   • there is a cap, because every staff login is a real auth account;
--   • revoking removes the shop's ACCESS, never the person's login — the
--     same account may be a customer or a rider, and deleting it would
--     take their parcels and history with it;
--   • the shop can never be left with no owner (the last owner row cannot
--     be deleted or demoted by anyone, staff panel included).
--
-- Idempotent: safe to run twice.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1. Who is on the roster: a name and the login they sign in with.
-- --------------------------------------------------------------------
alter table vendor_users add column if not exists display_name text;
alter table vendor_users add column if not exists login_email text;
alter table vendor_users add column if not exists added_by    uuid;

-- Existing rows (everyone linked by staff so far) keep their identity:
-- the login is filled from the auth account so the roster is not blank.
update vendor_users v
   set login_email = u.email
  from auth.users u
 where u.id = v.user_id
   and v.login_email is null;

-- --------------------------------------------------------------------
-- 2. Helpers. Both are SECURITY DEFINER: a policy on vendor_users may
--    not query vendor_users itself (infinite recursion).
-- --------------------------------------------------------------------

/** The caller's role in their own shop, or NULL when they are not a vendor. */
create or replace function ps_vendor_role()
returns text language sql stable security definer set search_path = public as $$
  select role from vendor_users where user_id = auth.uid();
$$;

/** How many staff logins one shop may have (a login is a real account). */
create or replace function ps_vendor_staff_max()
returns int language sql immutable as $$ select 5 $$;

-- --------------------------------------------------------------------
-- 3. Policies: every vendor sees their own row; only an OWNER sees the
--    shop's roster and may add or revoke staff.
-- --------------------------------------------------------------------
drop policy if exists "vendor_users self read" on vendor_users;
create policy "vendor_users self read" on vendor_users
  for select using (user_id = auth.uid());

drop policy if exists "vendor_users owner roster" on vendor_users;
create policy "vendor_users owner roster" on vendor_users
  for select using (shop_id = ps_vendor_shop() and ps_vendor_role() = 'owner');

drop policy if exists "vendor_users owner insert" on vendor_users;
create policy "vendor_users owner insert" on vendor_users
  for insert with check (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  );

drop policy if exists "vendor_users owner update" on vendor_users;
create policy "vendor_users owner update" on vendor_users
  for update using (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  ) with check (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  );

drop policy if exists "vendor_users owner delete" on vendor_users;
create policy "vendor_users owner delete" on vendor_users
  for delete using (
    shop_id = ps_vendor_shop()
    and ps_vendor_role() = 'owner'
    and role = 'staff'
  );

-- --------------------------------------------------------------------
-- 4. The guard. RLS decides WHO may write; this decides WHAT may be
--    written, and it stands for the service role too (which bypasses
--    RLS) — so a bug in a screen cannot promote a member of staff.
-- --------------------------------------------------------------------
create or replace function ps_guard_vendor_users()
returns trigger language plpgsql as $$
declare
  v_staff int;
  v_owners int;
begin
  if tg_op = 'INSERT' then
    if new.role = 'staff' then
      select count(*) into v_staff
        from vendor_users
       where shop_id = new.shop_id and role = 'staff';
      if v_staff >= ps_vendor_staff_max() then
        raise exception 'A shop may have at most % staff logins — revoke one first.',
          ps_vendor_staff_max();
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- A row is bound to ONE person, ONE shop and ONE role, for life.
    -- Changing any of the three is how a staff login becomes an owner's,
    -- so it is refused here rather than in whatever screen forgot to check.
    if new.user_id is distinct from old.user_id then
      raise exception 'A vendor login cannot be handed to another person.';
    end if;
    if new.shop_id is distinct from old.shop_id then
      raise exception 'A vendor login cannot be moved to another shop.';
    end if;
    if new.role is distinct from old.role then
      raise exception 'A vendor login''s role cannot be changed — revoke it and grant a new one.';
    end if;
    return new;
  end if;

  -- DELETE: the shop must keep an owner. Without this, one delete leaves a
  -- shop that nobody can administer — not even PROSANTI, without SQL.
  if old.role = 'owner' then
    select count(*) into v_owners
      from vendor_users
     where shop_id = old.shop_id and role = 'owner' and user_id <> old.user_id;
    if v_owners = 0 then
      raise exception 'This is the shop''s last owner login — it cannot be removed.';
    end if;
  end if;
  return old;
end $$;

drop trigger if exists trg_vendor_users_guard on vendor_users;
create trigger trg_vendor_users_guard
  before insert or update or delete on vendor_users
  for each row execute function ps_guard_vendor_users();

-- A shop's roster should be readable at a glance and cheap to count.
create index if not exists vendor_users_shop_role_idx on vendor_users (shop_id, role);

do $$ begin raise notice 'VENDOR STAFF OK'; end $$;

-- ==== Feature: multi shop checkout (202609280008) ====
-- =====================================================================
-- C2 (2026-09-28) — one checkout, one order per shop.
--
-- One order = one shop is not a limitation to work around, it is how the
-- marketplace works: the shop packs its own parcel, the ledger pays the
-- shop its own share, and the vendor dashboard shows the shop its own
-- orders. So a bag with two shops' items becomes TWO orders — not one
-- order with an "also from" column.
--
-- The rule that makes it trustworthy is ATOMICITY: the buyer taps once and
-- either every shop's order exists or none does. A function body is one
-- transaction in Postgres, so looping over ps_place_order inside a single
-- call gives that for free — and it reuses every cent of the pricing,
-- stock, coupon and shop guards ps_place_order already enforces, instead
-- of a second copy of them that could drift.
--
-- Bounded on purpose: a checkout may cover at most ps_multi_order_max_shops()
-- shops. Two or three parcels is a family order; six is a courier contract.
-- =====================================================================

/** How many shops one checkout may cover. */
create or replace function ps_multi_order_max_shops()
returns int language sql immutable as $$ select 3 $$;

/**
 * Place one order per shop, atomically.
 *
 *   p_orders: jsonb array of { "order": <p_order jsonb>, "items": <p_items jsonb> }
 *
 * Returns the new order ids in the same order as the input. If ANY shop's
 * order is refused — out of stock, shop closed, coupon minimum not met,
 * zone floor — the whole exception rolls back every order in the batch, so
 * the buyer never ends up holding half a checkout.
 */
create or replace function ps_place_multi_order(p_orders jsonb)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_ids        uuid[] := array[]::uuid[];
  v_entry      jsonb;
  v_id         uuid;
  v_shops      text[] := array[]::text[];
  v_shop       text;
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' then
    raise exception 'order batch must be an array';
  end if;
  if jsonb_array_length(p_orders) = 0 then
    raise exception 'empty order batch';
  end if;
  if jsonb_array_length(p_orders) > ps_multi_order_max_shops() then
    raise exception 'A single checkout can cover at most % shops — check out the rest separately.',
      ps_multi_order_max_shops();
  end if;

  for v_entry in select value from jsonb_array_elements(p_orders) loop
    if jsonb_typeof(v_entry -> 'items') <> 'array' then
      raise exception 'each order in the batch needs its items';
    end if;
    -- One shop, twice, is one shop's checkout with a typing mistake behind
    -- it: two orders for the same shop would double a rider trip for no
    -- reason the buyer asked for.
    select array_agg(distinct p.shop_id::text)
      into v_shops
      from jsonb_array_elements(v_entry -> 'items') as it
      join products p on p.id = (it ->> 'product_id')::uuid;
    if coalesce(array_length(v_shops, 1), 0) > 1 then
      raise exception 'each order in the batch must belong to one shop';
    end if;
    v_shop := v_shops[1];
    if exists (select 1 from unnest(v_ids) as placed
                 join orders o on o.id = placed
                where o.shop_id::text = v_shop) then
      raise exception 'the same shop appears twice in one checkout';
    end if;

    v_id := ps_place_order(coalesce(v_entry -> 'order', '{}'::jsonb), v_entry -> 'items');
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end $$;

-- ps_place_order itself is service-role-only (202609160004). The batch
-- wrapper must be no looser: it can create orders too.
do $$
begin
  execute 'revoke all on function public.ps_place_multi_order(jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.ps_place_multi_order(jsonb) to service_role';
end $$;

do $$ begin raise notice 'MULTI SHOP CHECKOUT OK'; end $$;

-- ==== Feature: commission audit (202609290001) ====
-- =====================================================================
-- C4 (2026-09-29) — the commission trail.
--
-- PROSANTI takes a cut of every order, so the number that decides it is the
-- most consequential figure in a shop's file. It is also the one a shop
-- disputes: "আমার তো ১২% ছিল" — and until now there was nothing to answer
-- with but the number sitting there today.
--
-- So the change itself now writes its own history, from a TRIGGER rather than
-- from a screen. A screen can be bypassed, forgotten, or written again later;
-- a trigger on the row cannot. Whether the rate moves from the admin panel,
-- from the Supabase dashboard, or from a psql prompt at midnight, the trail
-- appears the same way: who, when, and from how much to how much.
--
-- Append-only. There is no UPDATE or DELETE policy, and a trigger refuses
-- both outright rather than relying on a policy nobody wrote. A shop's money
-- history is not a document anybody edits.
--
-- Idempotent — safe to re-run. Expect "COMMISSION AUDIT OK" at the end.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The log
-- ---------------------------------------------------------------------------
create table if not exists public.shop_commission_history (
  id           bigint generated always as identity primary key,
  shop_id      uuid not null references public.shops (id) on delete cascade,
  created_at   timestamptz not null default now(),
  /**
   * The rate before the change. NULL means "the rate this shop joined with" —
   * a later "15 → 12" only means something if the starting point is on the
   * record too, so the insert that creates the shop writes the first line.
   */
  old_pct      numeric(5, 2),
  new_pct      numeric(5, 2) not null,
  /** Who moved it. Null when the write carried no staff session (onboarding). */
  actor_id     uuid,
  actor_email  text,
  constraint shop_commission_history_range
    check (new_pct >= 0 and new_pct <= 90 and (old_pct is null or (old_pct >= 0 and old_pct <= 90))),
  /** A line that records no movement would be noise in a money trail. */
  constraint shop_commission_history_moved
    check (old_pct is null or old_pct <> new_pct)
);

create index if not exists shop_commission_history_shop_idx
  on public.shop_commission_history (shop_id, created_at desc);

alter table public.shop_commission_history enable row level security;

-- Staff-only on purpose: the actor's e-mail is a colleague's address, and the
-- trail is the evidence in a dispute with a shop — not public reading.
drop policy if exists "commission history admin read" on public.shop_commission_history;
create policy "commission history admin read" on public.shop_commission_history
  for select using (ps_is_admin());

drop policy if exists "commission history admin insert" on public.shop_commission_history;
create policy "commission history admin insert" on public.shop_commission_history
  for insert with check (ps_is_admin());

-- Append-only: no UPDATE or DELETE policy exists, and this says so out loud
-- instead of leaving it to be inferred from a missing policy. The one DELETE
-- it allows is the cascade that removes a shop altogether — a shop leaving
-- PROSANTI takes its trail with it, which is not the same as crossing a line
-- out. (RLS already refuses a direct DELETE; this is the belt to its braces.)
create or replace function ps_guard_commission_history_append_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'commission history cannot be rewritten';
  end if;
  if exists (select 1 from public.shops where id = old.shop_id) then
    raise exception 'commission history cannot be rewritten';
  end if;
  return old; -- the shop itself is gone: let the cascade take the trail
end $$;

drop trigger if exists trg_commission_history_no_rewrite on public.shop_commission_history;
create trigger trg_commission_history_no_rewrite
  before update or delete on public.shop_commission_history
  for each row execute function ps_guard_commission_history_append_only();

-- ---------------------------------------------------------------------------
-- 2. Who did it — read from the session the write arrived with.
--
-- Every staff write in this codebase runs on the STAFF session (RLS-bound
-- client), so the request's own claims name the officer. A service-role write
-- carries no claims; the line is still written with a null actor, because
-- "somebody moved it and nobody was signed in" is exactly what an audit
-- should show rather than hide.
-- ---------------------------------------------------------------------------
create or replace function ps_actor_email()
returns text language plpgsql stable set search_path = public as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_email  text := nullif(current_setting('request.jwt.claim.email', true), '');
begin
  if v_claims is null then
    return v_email;                 -- no session: nobody to name
  end if;
  begin
    return coalesce(nullif((v_claims::jsonb ->> 'email'), ''), v_email);
  exception when others then
    -- A claims value that is not JSON (an empty string, a stray setting) must
    -- never stop a commission change from being recorded: the rate moved, and
    -- "the rate moved but we cannot say who did it" is the honest answer.
    return v_email;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The trail writes itself
-- ---------------------------------------------------------------------------
create or replace function ps_audit_shop_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- The rate the shop joined with: the baseline every later change reads
    -- against ("15% when it joined" → "15 → 12 on 12 Oct").
    insert into public.shop_commission_history (shop_id, old_pct, new_pct, actor_id, actor_email)
    values (new.id, null, new.commission_pct, auth.uid(), ps_actor_email());
    return null;
  end if;

  -- An UPDATE that leaves the rate alone writes nothing: renaming a shop is
  -- not a money event, and a trail full of those is a trail nobody reads.
  if new.commission_pct is distinct from old.commission_pct then
    insert into public.shop_commission_history (shop_id, old_pct, new_pct, actor_id, actor_email)
    values (new.id, old.commission_pct, new.commission_pct, auth.uid(), ps_actor_email());
  end if;
  return null;
end $$;

drop trigger if exists trg_shops_audit_commission on public.shops;
create trigger trg_shops_audit_commission
  after insert or update of commission_pct on public.shops
  for each row execute function ps_audit_shop_commission();

commit;

do $$ begin raise notice 'COMMISSION AUDIT OK'; end $$;

-- ==== Feature: shop scoped slugs (202609290002) ====
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

-- ==== Feature: vendor product categories (202609290003) ====
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

-- ==== Feature: rider delivery accounting (202609300001) ====
-- ============================================================================
-- Rider delivery accounting (2026-09-30) — docs/AUDIT-RIDER-MONEY-2026-09-30.md
--
--   A. TIP → RIDER (P0 money bug). The rider app shows "💝 Tip for you",
--      the vendor earnings copy promises "tips go 100% to the rider", and
--      checkout books tip_amount as a *rider* tip — but no code path ever
--      paid it: ps_write_shop_ledger recorded tip_amount for the shop's
--      information (excluded from shop balance) and ps_rider_deliver only
--      moved COD cash. On COD the rider collected the tip inside
--      orders.total and settled every paisa to the office; the tip was
--      simply lost in the platform's hands. Now ps_rider_deliver credits
--      the tip to a new append-only rider_earnings journal and to
--      riders.earnings_balance (the platform's wallet debt to the rider).
--      Payouts stay a staff-approved flow (Phase 2); this file only makes
--      the money tracked instead of vanished. NO historical backfill —
--      crediting past tips is a real-money decision for the owner, not a
--      schema default.
--
--   B. delivered_at (P2 scoreboard accuracy). getRiderStats counted the
--      7-day window off orders.updated_at, which any later order touch
--      (proof, return, admin edit) rewrites — the number drifted. Stamp
--      the real delivery moment on the assignment and count that.
--
-- Idempotent — safe to re-run. Run after 202609250005 (PIN lockout: the
-- ps_rider_deliver body this recreates).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A1. Rider earnings: wallet balance + journal.
--     RLS on, no policies (like delivery_ratings): only the SECURITY DEFINER
--      deliver RPC and service/staff writers touch it; riders read their own
--      numbers through /api/rider/* (service client), never directly.
-- ----------------------------------------------------------------------------
alter table riders
  add column if not exists earnings_balance bigint not null default 0;

create table if not exists rider_earnings (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id) on delete cascade,
  order_id   uuid not null references orders (id) on delete cascade,
  kind       text not null default 'tip'
             check (kind in ('tip', 'delivery_fee', 'incentive')),
  amount     bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- One tip per delivered order — the belt under the deliver RPC's state
-- guard: a re-run (manual repair, double click, migration re-apply) can
-- never double-credit the wallet.
create unique index if not exists rider_earnings_one_per_order_kind
  on rider_earnings (order_id, kind);
create index if not exists idx_rider_earnings_rider
  on rider_earnings (rider_id);
alter table rider_earnings enable row level security;

-- ----------------------------------------------------------------------------
-- B1. The real delivery moment, stamped by the same function.
-- ----------------------------------------------------------------------------
alter table delivery_assignments
  add column if not exists delivered_at timestamptz;

-- One-time backfill: orders.updated_at ≈ delivery time for rows that are
-- already delivered (and the old wrong-in-a-different-way basis anyway).
update delivery_assignments a
set delivered_at = o.updated_at
from orders o
where a.order_id = o.id
  and a.state = 'delivered'
  and a.delivered_at is null;

-- ----------------------------------------------------------------------------
-- A2 + B2. ps_rider_deliver — the 202609250005 (PIN lockout) body, plus:
--   * tip credit (idempotent: insert wins once, then the wallet moves);
--   * delivered_at stamp on the picked_up → delivered transition.
-- Same signature → existing grants and the deliver_check pairing stand.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  -- Read-only re-verification: attempts are counted by
  -- ps_rider_deliver_check (a raise here would roll any count back).
  if v_order.delivery_code_locked_until is not null
     and v_order.delivery_code_locked_until > now() then
    raise exception 'delivery code locked — too many wrong attempts, try again in 15 minutes';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- P1 #8: the rider only ever carries cash for COD orders — a wallet order
  -- was paid into the shop's own bKash/Nagad wallet at checkout.
  v_cash := case when v_order.payment = 'cod' then v_order.total else 0 end;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · '
        || case
             when v_order.payment = 'bkash' then 'paid via bKash at checkout'
             when v_order.payment = 'nagad' then 'paid via Nagad at checkout'
             else 'COD collected'
           end,
      auth.uid()
    );
  end if;

  update orders
  set delivery_code_attempts = 0, delivery_code_locked_until = null, updated_at = now()
  where id = v_order.id;

  update delivery_assignments
  set state = 'delivered',
      -- coalesce: keep the first stamp if this is ever re-run under a repair.
      delivered_at = coalesce(delivered_at, now())
  where id = v_assignment.id
  returning * into v_assignment;

  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;

  -- 202609300001 (A): the tip is the RIDER's — 100%, exactly as both UIs
  -- promise. The unique index makes the journal insert the once-only gate;
  -- FOUND is false when the row was already there, so the wallet never
  -- double-moves even under a repaired re-run.
  if coalesce(v_order.tip_amount, 0) > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'tip', v_order.tip_amount)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_order.tip_amount
      where id = v_assignment.rider_id;
    end if;
  end if;

  return v_assignment;
end $$;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: perf indexes (202609170002) ====
-- ============================================================================
-- 202609170002_perf_indexes.sql
-- Audit 2026-09-17 P1.5 — composite indexes for the hot order/dispatch reads.
--
-- Every list the staff, rider and vendor screens poll today is served by a
-- single-column index followed by a sort or a second filter in memory:
--
--   orders                (status)             → admin list filters by status
--                                                 AND orders by created_at desc
--   delivery_assignments  (rider_id)           → rider board filters by rider
--                                                 AND state
--   orders                (shop_id)            → vendor list filters by shop
--                                                 AND orders by created_at desc
--   orders.rider_id       (no index at all)    → rider "my deliveries" scan
--
-- With a few hundred orders the difference is milliseconds; at a few tens of
-- thousands it is the difference between an index range scan and a sort of
-- the whole status bucket on every poll. Cheap to add now, painful later.
--
-- SAFE TO RE-RUN: every statement is `create index if not exists`. No table
-- rewrite, no lock beyond a normal `create index` (small tables — seconds).
-- ============================================================================

-- Admin → Orders: `where status = $1 order by created_at desc, id desc`
-- (keyset pagination, see listOrders).
create index if not exists idx_orders_status_created
  on orders (status, created_at desc, id desc);

-- Vendor → Orders: `where shop_id = $1 order by created_at desc limit 100`.
create index if not exists idx_orders_shop_created
  on orders (shop_id, created_at desc);

-- Rider → my deliveries / tracking: `where rider_id = $1`. Most orders never
-- have a rider, so a partial index stays tiny.
create index if not exists idx_orders_rider
  on orders (rider_id)
  where rider_id is not null;

-- Rider board: `where rider_id = $1 and state in (…) order by offered_at desc`.
create index if not exists idx_assignments_rider_state
  on delivery_assignments (rider_id, state, offered_at desc);

-- Dispatch board "awaiting" filter: `where state in ('offered','accepted',
-- 'picked_up')` → the live rows only (a partial index over the unique-offer
-- predicate, so it stays as small as the active board).
create index if not exists idx_assignments_live_state
  on delivery_assignments (state, order_id)
  where state in ('offered', 'accepted', 'picked_up');

-- Return/exchange pickups link to their parent; toDomainMany reads
-- `where return_parent_id in (…) order by created_at desc`.
create index if not exists idx_orders_return_parent
  on orders (return_parent_id, created_at desc)
  where return_parent_id is not null;

-- Referral first-order proof + rewards (P1.4 scoped reads).
create index if not exists idx_referral_rewards_referee
  on referral_rewards (referee_phone);

analyze orders;
analyze delivery_assignments;
analyze referral_rewards;

-- ----------------------------------------------------------------------------
-- VERIFY — expect 7 rows, every one "OK"
-- ----------------------------------------------------------------------------
select name,
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and indexname = name)
            then 'OK' else 'MISSING' end as result
from unnest(array[
  'idx_orders_status_created',
  'idx_orders_shop_created',
  'idx_orders_rider',
  'idx_assignments_rider_state',
  'idx_assignments_live_state',
  'idx_orders_return_parent',
  'idx_referral_rewards_referee'
]) as t(name)
order by name;

-- ==== Feature: rider money (202609300002) ====
-- ============================================================================
-- Rider money Phase 2 (2026-09-30) — docs/AUDIT-RIDER-MONEY-2026-09-30.md
--
-- Phase 1 (202609300001) made the TIP reach the rider. This file builds the
-- rest of the money system around that wallet.
--
--   C. PER-DELIVERY EARNINGS. ps_rider_deliver credits, besides the 100% tip,
--      the configured base delivery fee and — for COD orders — the COD
--      handling fee. Both are read from site_settings on every delivery, so a
--      rate change applies from the NEXT delivery on, never retroactively.
--      The default is 0 (৳0) ON PURPOSE: the owner sets real rates in
--      Admin → Money; until then nothing is credited and the money dashboard
--      says "not configured yet". Crediting invented amounts into riders'
--      wallets would be a money decision no schema should make.
--
--   D. RIDER PAYOUTS. rider_payout_requests: a rider asks to withdraw from
--      their earnings_balance (one pending request at a time). The amount is
--      debited IMMEDIATELY (held), so it can never be spent twice; staff
--      approve (paid) or reject (wallet refunded). Every movement lands in
--      the rider_earnings journal, which is signed from here on:
--         tip | delivery_fee | cod_handling | incentive   → + credit
--         payout                                         → − hold
--         payout_refund                                  → + release
--      riders.earnings_balance therefore ALWAYS equals
--      sum(rider_earnings.amount) for that rider — reconcilable any time.
--
--   M. ps_admin_money_summary(): the platform's money position in one call —
--      income (commission + delivery charge + tips collected), what is owed
--      to riders and shops, and how much COD cash riders are carrying.
--
-- Idempotent — safe to re-run. 202609300001 is the tip half; this file also
-- (re)creates the wallet column + table it needs, so it may be run alone.
-- All amounts are PAISA (bigint), like every other money column in the schema.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Payout requests (D). RLS on, no policies — like rider_settle_claims:
--    riders never read this table directly (the service client does), and the
--    only writer is the SECURITY DEFINER RPC below.
-- ----------------------------------------------------------------------------
create table if not exists rider_payout_requests (
  id               uuid primary key default gen_random_uuid(),
  rider_id         uuid not null references riders (id) on delete cascade,
  amount           bigint not null check (amount > 0),
  method           text not null default 'bkash'
                   check (method in ('bkash', 'nagad', 'bank', 'cash')),
  account          text not null default '',
  status           text not null default 'pending'
                   check (status in ('pending', 'paid', 'rejected')),
  requested_at     timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid,
  decided_by_email text,
  note             text,
  reference        text not null default ''
);

-- One open request per rider: the amount is held the moment it is filed, so a
-- second pending row could only double-hold the same money.
create unique index if not exists rider_payout_requests_one_pending
  on rider_payout_requests (rider_id) where status = 'pending';
create index if not exists idx_rider_payout_requests_queue
  on rider_payout_requests (status, requested_at desc);
alter table rider_payout_requests enable row level security;

-- ----------------------------------------------------------------------------
-- 2. The wallet journal grows up: signed amounts + payout linkage + notes.
--    (Phase 1 wrote the tip-only shape: order_id NOT NULL, amount > 0.)
-- ----------------------------------------------------------------------------
alter table riders
  add column if not exists earnings_balance bigint not null default 0;

alter table delivery_assignments
  add column if not exists delivered_at timestamptz;

create table if not exists rider_earnings (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id) on delete cascade,
  order_id   uuid references orders (id) on delete cascade,
  kind       text not null default 'tip',
  amount     bigint not null,
  payout_id  uuid references rider_payout_requests (id) on delete set null,
  note       text not null default '',
  created_at timestamptz not null default now()
);

alter table rider_earnings add column if not exists payout_id uuid
  references rider_payout_requests (id) on delete set null;
alter table rider_earnings add column if not exists note text not null default '';
-- Payout rows carry no order (order_id NULL); the uniqueness of order-bound
-- credits is kept by the partial index below, so NULLs never collide.
alter table rider_earnings alter column order_id drop not null;

-- One credit per (order, kind): tips / fees can never be double-credited,
-- whatever re-run or manual repair happens. NULL order_id rows (payouts,
-- adjustments) are exempt — NULLs are distinct in a unique index.
create unique index if not exists rider_earnings_one_per_order_kind
  on rider_earnings (order_id, kind);
create index if not exists idx_rider_earnings_rider
  on rider_earnings (rider_id, created_at desc);
create index if not exists idx_rider_earnings_payout
  on rider_earnings (payout_id) where payout_id is not null;
alter table rider_earnings enable row level security;

-- The old inline checks (amount > 0, kind in tip/fee/incentive) are dropped by
-- DEFINITION, not by guessed name, then re-added with the Phase-2 rules.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.rider_earnings'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%kind%' or pg_get_constraintdef(oid) like '%amount%')
  loop
    execute format('alter table public.rider_earnings drop constraint %I', c.conname);
  end loop;
end $$;

alter table rider_earnings
  add constraint rider_earnings_kind_check
  check (kind in (
    'tip', 'delivery_fee', 'cod_handling', 'incentive',
    'payout', 'payout_refund', 'adjustment'
  ));
-- A payout is the one negative movement; every other kind is a credit.
alter table rider_earnings
  add constraint rider_earnings_amount_check
  check ((kind = 'payout' and amount < 0) or (kind <> 'payout' and amount <> 0));
-- Credits for a delivery must name their order; payouts never do.
alter table rider_earnings
  add constraint rider_earnings_order_kind_check
  check (order_id is not null
         or kind in ('payout', 'payout_refund', 'adjustment', 'incentive'));
-- Both directions of the payout ↔ journal link.
alter table rider_earnings
  add constraint rider_earnings_payout_link_check
  check ((kind in ('payout', 'payout_refund')) = (payout_id is not null));

-- ----------------------------------------------------------------------------
-- 3. ps_rider_deliver — the 202609300001 body, plus per-delivery earnings (C).
--    Same signature → existing grants and the deliver_check pairing stand.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
  v_base_fee bigint;
  v_cod_fee bigint;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  -- Read-only re-verification: attempts are counted by
  -- ps_rider_deliver_check (a raise here would roll any count back).
  if v_order.delivery_code_locked_until is not null
     and v_order.delivery_code_locked_until > now() then
    raise exception 'delivery code locked — too many wrong attempts, try again in 15 minutes';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- P1 #8: the rider only ever carries cash for COD orders — a wallet order
  -- was paid into the shop's own bKash/Nagad wallet at checkout.
  v_cash := case when v_order.payment = 'cod' then v_order.total else 0 end;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · '
        || case
             when v_order.payment = 'bkash' then 'paid via bKash at checkout'
             when v_order.payment = 'nagad' then 'paid via Nagad at checkout'
             else 'COD collected'
           end,
      auth.uid()
    );
  end if;

  update orders
  set delivery_code_attempts = 0, delivery_code_locked_until = null, updated_at = now()
  where id = v_order.id;

  update delivery_assignments
  set state = 'delivered',
      -- coalesce: keep the first stamp if this is ever re-run under a repair.
      delivered_at = coalesce(delivered_at, now())
  where id = v_assignment.id
  returning * into v_assignment;

  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;

  -- 202609300001 (A): the tip is the RIDER's — 100%, exactly as both UIs
  -- promise. The unique index makes the journal insert the once-only gate;
  -- FOUND is false when the row was already there, so the wallet never
  -- double-moves even under a repaired re-run.
  if coalesce(v_order.tip_amount, 0) > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'tip', v_order.tip_amount)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_order.tip_amount
      where id = v_assignment.rider_id;
    end if;
  end if;

  -- Phase 2 (C): the configured per-delivery pay. Defaults are 0 → a delivery
  -- credits nothing until the owner sets rates in Admin → Money; the journal
  -- then keeps the two halves separate so the rider's statement can show
  -- "delivery fee" and "COD handling" as their own lines.
  v_base_fee := greatest(ps_setting_int('rider_base_fee_paisa', 0), 0);
  if v_base_fee > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'delivery_fee', v_base_fee)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_base_fee
      where id = v_assignment.rider_id;
    end if;
  end if;

  v_cod_fee := greatest(ps_setting_int('rider_cod_handling_fee_paisa', 0), 0);
  if v_cod_fee > 0 and v_order.payment = 'cod' then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'cod_handling', v_cod_fee)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_cod_fee
      where id = v_assignment.rider_id;
    end if;
  end if;

  return v_assignment;
end $$;

-- ----------------------------------------------------------------------------
-- 4. ps_rider_request_payout (D). The rider's own RPC: files a withdrawal and
--    HOLDS the money (debit now, refund only if staff reject). Filing a
--    request while one is pending is refused — the sole guard needed, since
--    the rider can never hold more than one open request.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_request_payout(
  p_amount bigint,
  p_method text default 'bkash',
  p_account text default ''
)
returns rider_payout_requests
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
  v_method text := lower(coalesce(nullif(trim(p_method), ''), 'bkash'));
  v_account text := coalesce(trim(p_account), '');
  v_min bigint := greatest(ps_setting_int('rider_min_payout_paisa', 0), 0);
  v_payout rider_payout_requests%rowtype;
begin
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  if v_rider.status <> 'active' then
    raise exception 'rider not active';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payout amount must be positive';
  end if;
  if v_method not in ('bkash', 'nagad', 'bank', 'cash') then
    raise exception 'unsupported payout method';
  end if;
  if v_method <> 'cash' and length(v_account) < 5 then
    raise exception 'account number required';
  end if;
  if exists (select 1 from rider_payout_requests
             where rider_id = v_rider.id and status = 'pending') then
    raise exception 'payout already pending';
  end if;
  if p_amount < v_min then
    raise exception 'below minimum payout';
  end if;
  if p_amount > v_rider.earnings_balance then
    raise exception 'insufficient earnings balance';
  end if;

  insert into rider_payout_requests (rider_id, amount, method, account)
  values (v_rider.id, p_amount, v_method, v_account)
  returning * into v_payout;

  update riders
  set earnings_balance = earnings_balance - p_amount
  where id = v_rider.id;

  insert into rider_earnings (rider_id, order_id, kind, amount, payout_id, note)
  values (v_rider.id, null, 'payout', -p_amount, v_payout.id, 'payout request');

  return v_payout;
end $$;

-- ----------------------------------------------------------------------------
-- 5. ps_admin_decide_rider_payout (D) — staff approval queue.
--    paid     → nothing to move (the money was held at request time).
--    rejected → refund to the wallet, journaled as payout_refund.
-- ----------------------------------------------------------------------------
create or replace function ps_admin_decide_rider_payout(
  p_payout_id uuid,
  p_decision text,
  p_note text default null,
  p_reference text default ''
)
returns rider_payout_requests
language plpgsql security definer set search_path = public as $$
declare
  v_payout rider_payout_requests%rowtype;
  v_decision text := lower(coalesce(trim(p_decision), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  select * into v_payout from rider_payout_requests
  where id = p_payout_id
  for update;
  if not found then
    raise exception 'payout not found';
  end if;
  if v_payout.status <> 'pending' then
    raise exception 'payout already %', v_payout.status;
  end if;
  if v_decision not in ('paid', 'rejected') then
    raise exception 'decision must be paid or rejected';
  end if;

  update rider_payout_requests
  set status = v_decision,
      decided_at = now(),
      decided_by = auth.uid(),
      note = v_note,
      reference = coalesce(trim(p_reference), '')
  where id = v_payout.id
  returning * into v_payout;

  if v_decision = 'rejected' then
    update riders
    set earnings_balance = earnings_balance + v_payout.amount
    where id = v_payout.rider_id;
    insert into rider_earnings (rider_id, order_id, kind, amount, payout_id, note)
    values (v_payout.rider_id, null, 'payout_refund', v_payout.amount, v_payout.id,
            coalesce(v_note, 'payout rejected'));
  end if;

  return v_payout;
end $$;

-- ----------------------------------------------------------------------------
-- 6. ps_rider_money_summary (N) — the rider's own statement header, one call:
--    wallet balance, today / 7-day / lifetime credits, the per-kind split,
--    what is already paid out or pending, and the live pay rates.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_money_summary()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rider uuid := ps_rider_id();
  v jsonb;
begin
  if v_rider is null then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'balance', coalesce((select earnings_balance from riders where id = v_rider), 0),
    'cashInHand', coalesce((select cash_in_hand from riders where id = v_rider), 0),
    -- EARNED money only. A payout hold is a transfer, and a payout_refund
    -- merely returns a hold — counting either as income would inflate the
    -- statement (the refund would be double-counted with the original credit).
    'today', coalesce((select sum(amount) from rider_earnings
                       where rider_id = v_rider
                         and kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')
                         and created_at >= date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka'), 0),
    'week', coalesce((select sum(amount) from rider_earnings
                      where rider_id = v_rider
                        and kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')
                        and created_at >= now() - interval '7 days'), 0),
    'lifetime', coalesce((select sum(amount) from rider_earnings
                          where rider_id = v_rider
                            and kind in ('tip', 'delivery_fee', 'cod_handling', 'incentive')), 0),
    'tips', coalesce((select sum(amount) from rider_earnings
                      where rider_id = v_rider and kind = 'tip'), 0),
    'deliveryFees', coalesce((select sum(amount) from rider_earnings
                              where rider_id = v_rider and kind = 'delivery_fee'), 0),
    'codHandling', coalesce((select sum(amount) from rider_earnings
                             where rider_id = v_rider and kind = 'cod_handling'), 0),
    'incentives', coalesce((select sum(amount) from rider_earnings
                            where rider_id = v_rider and kind = 'incentive'), 0),
    'paidOut', coalesce((select sum(amount) from rider_payout_requests
                         where rider_id = v_rider and status = 'paid'), 0),
    'pendingPayout', coalesce((select sum(amount) from rider_payout_requests
                               where rider_id = v_rider and status = 'pending'), 0),
    'deliveriesToday', coalesce((select count(*) from delivery_assignments
                                 where rider_id = v_rider and state = 'delivered'
                                   and delivered_at >= date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka'), 0),
    'baseFee', ps_setting_int('rider_base_fee_paisa', 0),
    'codHandlingFee', ps_setting_int('rider_cod_handling_fee_paisa', 0),
    'minPayout', ps_setting_int('rider_min_payout_paisa', 0)
  ) into v;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- 7. ps_admin_money_summary (M) — the platform money position, staff-only.
--    Everything is derived from the ledgers (not from counters), so it can be
--    reconciled at any time:
--      platform income  = commission + delivery charge + collected tips
--      rider payable    = Σ riders.earnings_balance (wallet debt)
--      shop payable     = Σ shop_ledger.payable − Σ shop_payouts.amount
--      COD custody      = Σ riders.cash_in_hand (riders are holding this cash)
-- ----------------------------------------------------------------------------
create or replace function ps_admin_money_summary()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_settle_claims bigint := 0;
  v jsonb;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  -- 202609250004 predates this file on every real database, but a partially
  -- migrated one must still get a summary instead of a hard error.
  if to_regclass('public.rider_settle_claims') is not null then
    select coalesce(sum(amount), 0) into v_settle_claims
    from rider_settle_claims where status = 'pending';
  end if;

  select jsonb_build_object(
    'commissionIncome', coalesce((select sum(commission) from shop_ledger), 0),
    'deliveryIncome', coalesce((select sum(delivery_charge) from orders where status = 'delivered'), 0),
    'tipsCollected', coalesce((select sum(tip_amount) from orders where status = 'delivered'), 0),
    'tipsToRiders', coalesce((select sum(amount) from rider_earnings where kind = 'tip'), 0),
    'riderFeesEarned', coalesce((select sum(amount) from rider_earnings
                                 where kind in ('delivery_fee', 'cod_handling', 'incentive')), 0),
    'deliveredOrders', coalesce((select count(*) from orders where status = 'delivered'), 0),
    'riderPayable', coalesce((select sum(earnings_balance) from riders), 0),
    'riderPayoutsPending', coalesce((select sum(amount) from rider_payout_requests where status = 'pending'), 0),
    'riderPayoutsPendingCount', coalesce((select count(*) from rider_payout_requests where status = 'pending'), 0),
    'riderPayoutsPaid', coalesce((select sum(amount) from rider_payout_requests where status = 'paid'), 0),
    'shopPayable', coalesce((select sum(payable) from shop_ledger), 0)
                   - coalesce((select sum(amount) from shop_payouts), 0),
    'codCustody', coalesce((select sum(cash_in_hand) from riders), 0),
    'codClaimsPending', v_settle_claims,
    'activeRiders', coalesce((select count(*) from riders where status = 'active'), 0),
    'onlineRiders', coalesce((select count(*) from riders where status = 'active' and is_online), 0),
    'baseFee', ps_setting_int('rider_base_fee_paisa', 0),
    'codHandlingFee', ps_setting_int('rider_cod_handling_fee_paisa', 0),
    'minPayout', ps_setting_int('rider_min_payout_paisa', 0)
  ) into v;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- 8. Grants — identical shape to 202609250004's settle RPCs.
-- ----------------------------------------------------------------------------
revoke all on function ps_rider_request_payout(bigint, text, text) from public, anon;
grant execute on function ps_rider_request_payout(bigint, text, text) to authenticated, service_role;
revoke all on function ps_admin_decide_rider_payout(uuid, text, text, text) from public, anon;
grant execute on function ps_admin_decide_rider_payout(uuid, text, text, text) to authenticated, service_role;
revoke all on function ps_rider_money_summary() from public, anon;
grant execute on function ps_rider_money_summary() to authenticated, service_role;
revoke all on function ps_admin_money_summary() from public, anon;
grant execute on function ps_admin_money_summary() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ==== Feature: rider fixes Phase A (202610010001) ====
-- ============================================================================
-- Rider fixes, phase A (2026-10-01) — docs/AUDIT-RIDER-MONEY-2026-10-01.md
--
--   B (N4). RETURN LEGS PAID A COD HANDLING FEE FOR COLLECTING NO CASH.
--      A return pickup is a zero-total order whose `payment` column simply
--      defaults to 'cod'. ps_rider_deliver credited `cod_handling` for every
--      order with payment = 'cod', so each return leg paid the rider a fee for
--      handling cash that never existed. The fee now requires v_cash > 0
--      (cash actually collected). The base fee still applies: the rider did
--      drive the leg.
--
--   C (N5). A FAILED DELIVERY ATTEMPT LEFT EVERYTHING HANGING.
--      ps_rider_failed_attempt only bumped a counter and wrote a history line.
--      The assignment stayed live (the rider kept the load slot forever), the
--      order stayed out-for-delivery with the rider's live GPS still visible to
--      the customer, there was no limit on attempts, and staff had no way out:
--      "Awaiting dispatch" listed the order, but ps_offer_order needs
--      ready-for-pickup, so "Send area requests" always answered
--      "no eligible rider". Now:
--        * a rider can only report a failure for a parcel in hand (picked_up);
--        * delivery_max_attempts (site_settings, default 2, clamp 1..5) caps it;
--        * on the final attempt the assignment ends as 'failed' (rider freed,
--          load released), orders.rider_id is cleared (tracking stops) and
--          orders.delivery_failed_at flags the order for staff;
--        * ps_admin_resolve_failed_delivery lets staff REDISPATCH (back to
--          ready-for-pickup → area broadcast) or CANCEL (stock released by the
--          existing cancel trigger; a prepaid order is flagged for refund).
--      No cash is ever collected on a failed attempt, so COD custody is untouched.
--
--   E (N8). ADMIN COULD HAND-DELIVER AN ORDER A RIDER WAS CARRYING.
--      Marking an order delivered from the admin panel skipped the customer PIN,
--      the proof, the rider's COD custody and the rider's earnings, left the
--      assignment open forever, yet still wrote the shop ledger. ps_advance_order
--      now refuses 'delivered' while a rider assignment is accepted/picked_up
--      (counter pickups are unaffected). ps_admin_release_assignment is the
--      sanctioned override: it takes the job from an unresponsive rider — back
--      to the area queue if the parcel was never collected, or into the
--      failed-delivery list if the rider has it.
--
-- Idempotent — safe to re-run. Same signature as 202609300002 → grants stand.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- B. ps_rider_deliver — the 202609300002 body, COD handling gated on cash.
-- ----------------------------------------------------------------------------
create or replace function ps_rider_deliver(p_assignment_id uuid, p_code text, p_proof_url text default null)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_cash bigint;
  v_base_fee bigint;
  v_cod_fee bigint;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  if v_assignment.state <> 'picked_up' then
    raise exception 'delivery not allowed from %', v_assignment.state;
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  -- Read-only re-verification: attempts are counted by
  -- ps_rider_deliver_check (a raise here would roll any count back).
  if v_order.delivery_code_locked_until is not null
     and v_order.delivery_code_locked_until > now() then
    raise exception 'delivery code locked — too many wrong attempts, try again in 15 minutes';
  end if;
  if coalesce(v_order.delivery_code, '') is distinct from upper(trim(coalesce(p_code, ''))) then
    raise exception 'delivery code mismatch';
  end if;

  -- Store proof URL if provided (Cloudinary)
  if p_proof_url is not null and trim(p_proof_url) <> '' then
    update orders
    set delivery_proof_url = trim(p_proof_url),
        delivery_proof_uploaded_at = now(),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- P1 #8: the rider only ever carries cash for COD orders — a wallet order
  -- was paid into the shop's own bKash/Nagad wallet at checkout.
  v_cash := case when v_order.payment = 'cod' then v_order.total else 0 end;

  if v_order.status is distinct from 'delivered' then
    update orders
    set status = 'delivered', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      'delivered',
      'Delivery confirmed with code + proof ' || coalesce(trim(p_proof_url), 'no-photo') || ' · '
        || case
             when v_order.payment = 'bkash' then 'paid via bKash at checkout'
             when v_order.payment = 'nagad' then 'paid via Nagad at checkout'
             else 'COD collected'
           end,
      auth.uid()
    );
  end if;

  update orders
  set delivery_code_attempts = 0, delivery_code_locked_until = null, updated_at = now()
  where id = v_order.id;

  update delivery_assignments
  set state = 'delivered',
      -- coalesce: keep the first stamp if this is ever re-run under a repair.
      delivered_at = coalesce(delivered_at, now())
  where id = v_assignment.id
  returning * into v_assignment;

  update riders
  set cash_in_hand = cash_in_hand + v_cash
  where id = v_assignment.rider_id;

  -- 202609300001 (A): the tip is the RIDER's — 100%, exactly as both UIs
  -- promise. The unique index makes the journal insert the once-only gate;
  -- FOUND is false when the row was already there, so the wallet never
  -- double-moves even under a repaired re-run.
  if coalesce(v_order.tip_amount, 0) > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'tip', v_order.tip_amount)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_order.tip_amount
      where id = v_assignment.rider_id;
    end if;
  end if;

  -- Phase 2 (C): the configured per-delivery pay. Defaults are 0 → a delivery
  -- credits nothing until the owner sets rates in Admin → Money; the journal
  -- then keeps the two halves separate so the rider's statement can show
  -- "delivery fee" and "COD handling" as their own lines.
  v_base_fee := greatest(ps_setting_int('rider_base_fee_paisa', 0), 0);
  if v_base_fee > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'delivery_fee', v_base_fee)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_base_fee
      where id = v_assignment.rider_id;
    end if;
  end if;

  v_cod_fee := greatest(ps_setting_int('rider_cod_handling_fee_paisa', 0), 0);
  -- Only when cash was actually collected: a return leg (a zero-total order
  -- whose payment column merely defaults to 'cod') or a fully discounted COD
  -- order moves no money, so there is nothing to "handle".
  if v_cod_fee > 0 and v_order.payment = 'cod' and v_cash > 0 then
    insert into rider_earnings (rider_id, order_id, kind, amount)
    values (v_assignment.rider_id, v_order.id, 'cod_handling', v_cod_fee)
    on conflict (order_id, kind) do nothing;
    if found then
      update riders
      set earnings_balance = earnings_balance + v_cod_fee
      where id = v_assignment.rider_id;
    end if;
  end if;

  return v_assignment;
end $$;
-- ----------------------------------------------------------------------------
-- C. Failed delivery flow.
-- ----------------------------------------------------------------------------
alter table orders add column if not exists delivery_failed_at timestamptz;
alter table delivery_assignments add column if not exists failed_reason text;

-- Widen the assignment state check to include 'failed'. The old inline check is
-- dropped by DEFINITION (it is auto-named), then re-added.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.delivery_assignments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%offered%'
  loop
    execute format('alter table public.delivery_assignments drop constraint %I', c.conname);
  end loop;
end $$;
alter table delivery_assignments
  add constraint delivery_assignments_state_check
  check (state in ('offered', 'accepted', 'picked_up', 'delivered', 'cancelled', 'expired', 'failed'));

create or replace function ps_rider_failed_attempt(p_assignment_id uuid, p_reason text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_max int := least(greatest(ps_setting_int('delivery_max_attempts', 2), 1), 5);
  v_attempts int;
begin
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found or v_assignment.rider_id is distinct from ps_rider_id() then
    raise exception 'forbidden';
  end if;
  -- A customer-side failure only exists once the parcel is in the rider's hands.
  if v_assignment.state <> 'picked_up' then
    raise exception 'failed attempt not allowed from %', v_assignment.state;
  end if;
  if length(v_reason) < 5 then
    raise exception 'a reason is required';
  end if;

  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  v_attempts := coalesce(v_order.delivery_attempts, 0) + 1;
  update orders
  set delivery_attempts = v_attempts,
      delivery_failed_reason = v_reason,
      updated_at = now()
  where id = v_order.id;

  insert into order_status_history (order_id, status, note, changed_by)
  values (
    v_order.id,
    v_order.status,
    'Delivery attempt ' || v_attempts || '/' || v_max || ' failed: ' || v_reason,
    auth.uid()
  );

  if v_attempts >= v_max then
    -- Final attempt: the rider is released (the load trigger frees the slot),
    -- the customer stops seeing the rider's GPS, and staff get an action item.
    update delivery_assignments
    set state = 'failed', failed_reason = v_reason
    where id = v_assignment.id
    returning * into v_assignment;
    update orders
    set rider_id = null, delivery_failed_at = now(), updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (
      v_order.id,
      v_order.status,
      'Final failed attempt — rider must return the parcel to the shop. Staff: redispatch or cancel.',
      auth.uid()
    );
  end if;

  return v_assignment;
end $$;

create or replace function ps_admin_resolve_failed_delivery(
  p_order_id uuid,
  p_action text,
  p_note text default null
)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_action text := lower(coalesce(trim(p_action), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  if v_action not in ('redispatch', 'cancel') then
    raise exception 'action must be redispatch or cancel';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.delivery_failed_at is null or v_order.status in ('delivered', 'cancelled') then
    raise exception 'no failed delivery to resolve';
  end if;

  if v_action = 'redispatch' then
    -- Back to the area queue: the status change fires the broadcast trigger.
    update orders
    set status = 'ready-for-pickup', rider_id = null, delivery_attempts = 0,
        delivery_failed_at = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'ready-for-pickup',
            'Failed delivery — redispatched to the area' || coalesce(': ' || v_note, ''), auth.uid());
  else
    update orders
    set status = 'cancelled', rider_id = null, delivery_failed_at = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'cancelled',
            'Failed delivery — order cancelled' || coalesce(': ' || v_note, '')
              || case when v_order.payment in ('bkash', 'nagad')
                       and coalesce(to_jsonb(v_order)->>'payment_status', '') = 'verified'
                      then ' · PREPAID: refund the customer offline' else '' end,
            auth.uid());
  end if;
  return v_order;
end $$;

revoke all on function ps_rider_failed_attempt(uuid, text) from public, anon;
grant execute on function ps_rider_failed_attempt(uuid, text) to authenticated, service_role;
revoke all on function ps_admin_resolve_failed_delivery(uuid, text, text) from public, anon;
grant execute on function ps_admin_resolve_failed_delivery(uuid, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- E. Admin cannot hand-deliver an order a rider is carrying.
--    ps_advance_order = the 202609170001 body + the guard below (same
--    signature → grants stand). ps_admin_release_assignment is the sanctioned
--    way to take a job away from an unresponsive rider.
-- ----------------------------------------------------------------------------
create or replace function ps_advance_order(
  p_order_id uuid,
  p_to ps_order_status,
  p_note text default null
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_from_pos int;
  v_to_pos   int;
  v_is_admin boolean;
  v_shop uuid;
  v_payment_rejected boolean;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if not v_is_admin then
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if p_to not in ('confirmed', 'preparing', 'ready-for-pickup', 'cancelled') then
      raise exception 'forbidden';
    end if;
  end if;

  -- P1 #8: a bKash/Nagad order may not START FULFILMENT before the shop has
  -- verified the payment in its own wallet (ps_verify_payment flips
  -- payment_status to 'verified'). 'confirmed' and 'cancelled' stay legal —
  -- canceling releases the reservation via trg_orders_release_on_cancel.
  if v_order.payment in ('bkash', 'nagad')
     and v_order.payment_status = 'pending_verification'
     and p_to in ('preparing', 'ready-for-pickup', 'courier-assigned', 'out-for-delivery', 'delivered') then
    raise exception 'payment not verified';
  end if;

  -- legal moves
  if v_order.status = p_to then
    return v_order;                          -- idempotent
  end if;

  -- 202610010001 (N8): a home-delivery order with a rider on it is closed ONLY
  -- by that rider (ps_rider_deliver: customer PIN + proof + COD custody + the
  -- rider's earnings). A manual "delivered" here skipped all four, left the
  -- assignment open forever and wrote the shop ledger while no cash was on any
  -- rider's books. Staff who need to override first release the rider
  -- (ps_admin_release_assignment). Counter pickups never have a rider.
  if p_to = 'delivered'
     and not coalesce(v_order.is_pickup, false)
     and exists (
       select 1 from delivery_assignments
       where order_id = p_order_id and state in ('accepted', 'picked_up')
     ) then
    raise exception 'rider delivery in progress';
  end if;
  if p_to = 'cancelled' then
    if v_order.status not in ('pending', 'confirmed', 'preparing') then
      raise exception 'cannot cancel from %', v_order.status;
    end if;
  else
    select position into v_from_pos from ps_order_flow where status = v_order.status;
    select position into v_to_pos   from ps_order_flow where status = p_to;
    if v_to_pos is null or v_from_pos is null then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
    -- 202609170001: the one allowed skip — Confirmed straight to Ready for
    -- pickup ("two-tap flow"). 'preparing' is optional bookkeeping now.
    if v_to_pos <> v_from_pos + 1
       and not (v_order.status = 'confirmed' and p_to = 'ready-for-pickup') then
      raise exception 'illegal transition % -> %', v_order.status, p_to;
    end if;
  end if;

  -- P1 #8 (2): a cancelled wallet order's payment is settled as REJECTED —
  -- the customer's track page says "not accepted", never "under
  -- verification" on a cancelled order.
  v_payment_rejected := p_to = 'cancelled'
    and v_order.payment in ('bkash', 'nagad')
    and v_order.payment_status = 'pending_verification';

  update orders
  set status = p_to,
      payment_status = case when v_payment_rejected then 'rejected' else payment_status end,
      payment_verified_at = case when v_payment_rejected then now() else payment_verified_at end,
      updated_at = now()
  where id = p_order_id;
  insert into order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_to, p_note, auth.uid());
  if v_payment_rejected then
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, p_to,
      'Payment rejected — order cancelled (refund from the shop wallet, offline)',
      auth.uid());
  end if;
  return v_order;
end $$;

create or replace function ps_admin_release_assignment(p_assignment_id uuid, p_reason text)
returns delivery_assignments
language plpgsql security definer set search_path = public as $$
declare
  v_assignment delivery_assignments%rowtype;
  v_order orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;
  if length(v_reason) < 5 then
    raise exception 'a reason is required';
  end if;
  select * into v_assignment from delivery_assignments
  where id = p_assignment_id
  for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  if v_assignment.state not in ('accepted', 'picked_up') then
    raise exception 'assignment not active';
  end if;
  select * into v_order from orders where id = v_assignment.order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  if v_assignment.state = 'accepted' then
    -- The parcel never left the shop: free the rider (5-minute cooldown, like
    -- any withdrawal) and put the order back in the area queue.
    update delivery_assignments
    set state = 'cancelled', cancelled_by = 'withdrawn'
    where id = v_assignment.id
    returning * into v_assignment;
    update orders
    set rider_id = null, status = 'ready-for-pickup', updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, 'ready-for-pickup', 'Rider released by staff: ' || v_reason, auth.uid());
  else
    -- The parcel is with the rider: it is a failed delivery for staff to
    -- resolve (redispatch once the shop has it back, or cancel).
    update delivery_assignments
    set state = 'failed', failed_reason = 'Released by staff: ' || v_reason
    where id = v_assignment.id
    returning * into v_assignment;
    update orders
    set rider_id = null, delivery_failed_at = now(), updated_at = now()
    where id = v_order.id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (v_order.id, v_order.status,
            'Rider released by staff with the parcel in hand: ' || v_reason
              || ' — redispatch or cancel from Deliveries.', auth.uid());
  end if;
  return v_assignment;
end $$;

revoke all on function ps_admin_release_assignment(uuid, text) from public, anon;
grant execute on function ps_admin_release_assignment(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
