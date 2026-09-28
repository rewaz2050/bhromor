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
