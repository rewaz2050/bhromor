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
