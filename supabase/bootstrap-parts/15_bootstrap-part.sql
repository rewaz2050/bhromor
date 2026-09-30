-- PART 15/16 of supabase/bootstrap-fresh.sql — run the parts IN ORDER, top to bottom.
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

