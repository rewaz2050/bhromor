-- ============================================================================
-- Security hardening (2026-10-14) — docs/SECURITY-REPORT-2026-10-14.md
-- ============================================================================
-- H2  Delivery PIN was DERIVED from the order number
--     (`mod(hashtext(order_no), 9000) + 1000`) — anyone who saw the order
--     number (receipt, screenshot, WhatsApp) could recompute the handoff
--     PIN with any Postgres. Replaced with a crypto-random code drawn from
--     gen_random_uuid() (core pg_catalog); live (not yet delivered/cancelled)
--     orders get fresh codes so old predictable ones stop working.
--
--     NOTE (2026-10-15): the first version used pgcrypto's gen_random_bytes()
--     and failed on apply with
--       42883: function gen_random_bytes(integer) does not exist
--     because pgcrypto is not on this function's path (Supabase installs it
--     into the `extensions` schema; a fresh project may not have it at all)
--     and `create function` does not resolve plpgsql bodies, so the error
--     only surfaced at RUN time, inside the UPDATE below. Everything now
--     comes from pg_catalog, which is always in scope — do NOT reintroduce
--     gen_random_bytes()/digest()/crypt() here.
--
-- H4  `reviews customer insert` (schema.sql) allowed ANY caller — including
--     the anon key — to insert a review with `status='approved',
--     verified=true, featured=true` straight through PostgREST, bypassing
--     the /api/reviews moderation entirely (fake reviews + shop-rating
--     manipulation). Inserts now require an authenticated Supabase session,
--     the review attributed to that same user, and ALWAYS start pending /
--     unverified / unfeatured. The storefront's own reviews route runs on
--     the service role and is unaffected.
--
-- L2  `price_watches`, `stock_watches`, `shop_follows` had public INSERT
--     policies ("so a hand-pasted insert is format-checked") — unused by
--     the product (the API writes through the service role) and free spam
--     capacity for anyone with the anon key. Dropped: RLS with no insert
--     policy means only the service role writes.
--
-- Safe to re-run. Nothing is dropped except the two unused policies' names.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- H2a. A real random 4-digit delivery code (1000–9999).
-- ----------------------------------------------------------------------------
create or replace function ps_random_delivery_code()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_b bytea;
  v_n integer;
begin
  -- uuid_send(gen_random_uuid()) — both pg_catalog (Postgres 13+), so this
  -- resolves no matter what the search_path is or whether pgcrypto exists.
  -- gen_random_uuid() is filled by the OS CSPRNG, so these are crypto-random
  -- bytes; the version/variant nibbles are skipped because they are fixed.
  v_b := uuid_send(gen_random_uuid());
  v_n := get_byte(v_b, 0) * 65536 + get_byte(v_b, 1) * 256 + get_byte(v_b, 2);
  return lpad(((v_n % 9000) + 1000)::text, 4, '0');
end $$;

revoke all on function ps_random_delivery_code() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- H2b. The insert trigger now delegates to the random generator. The old
--      hashtext derivation is gone — do not keep a fallback to it.
-- ----------------------------------------------------------------------------
create or replace function ps_set_order_delivery_code()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.delivery_code is null or new.delivery_code !~ '^[0-9]{4}$' then
    new.delivery_code := ps_random_delivery_code();
  end if;
  return new;
end $$;

-- Re-assert the trigger (202609090007 owns its first definition): identical,
-- and it means a project that somehow missed the trigger still gets codes.
drop trigger if exists trg_orders_set_delivery_code on orders;
create trigger trg_orders_set_delivery_code
  before insert on orders
  for each row execute function ps_set_order_delivery_code();

-- ----------------------------------------------------------------------------
-- H2c. Rotate the codes of every order still in flight: the old values are
--      publicly recomputable. Delivered/cancelled rows keep history.
--      Customers see the current code on their tracker and in new messages.
--      NULL codes are filled in the same pass (a live order with no stored
--      code is one the tracker would have to guess — the old UI fell back to
--      a client-side derivation that the rider's `ps_rider_deliver` check
--      then rejected, burning PIN attempts).
-- ----------------------------------------------------------------------------
update orders
set delivery_code = ps_random_delivery_code(), updated_at = now()
where status not in ('delivered'::ps_order_status, 'cancelled'::ps_order_status);

-- ----------------------------------------------------------------------------
-- H4. Reviews: only an authenticated session, only its own row, always
--     pending. Moderation/approval stays a staff (service-role) action.
-- ----------------------------------------------------------------------------
drop policy if exists "reviews customer insert" on reviews;
create policy "reviews customer insert" on reviews
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'pending'
    and verified = false
    and featured = false
    and rating between 1 and 5
    and char_length(body) between 1 and 4000
  );

-- ----------------------------------------------------------------------------
-- L2. Watch/follow tables: service-role writes only.
-- ----------------------------------------------------------------------------
drop policy if exists "price watch public insert" on price_watches;
drop policy if exists "stock watch public insert" on stock_watches;
drop policy if exists "shop follow public insert" on shop_follows;

commit;
