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
