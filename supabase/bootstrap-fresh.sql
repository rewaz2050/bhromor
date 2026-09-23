-- ============================================================================
-- PROSANTI — FRESH PROJECT BOOTSTRAP (single paste)
-- Generated from schema.sql + the 32 in-order migrations.
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
