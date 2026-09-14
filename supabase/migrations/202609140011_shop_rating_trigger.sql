-- ============================================================================
-- P2 #3 (2026-09-14): shop ratings from approved reviews.
-- ============================================================================
-- The storefront already renders shop ratings (shop card, shop page hero,
-- PDP chip) and the Shop mapper already carries ratingAvg/ratingCount — but
-- nothing ever wrote those columns, so every shop was stuck at 0 forever.
-- This migration is the missing half of marketplace §2: a trigger that
-- maintains shops.rating_avg/rating_count from the reviews that count.
--
-- Only APPROVED reviews count. pending/hidden/flagged never move the number;
-- a shop with zero approved reviews stays at 0, and the storefront shows
-- no stars at all (never a seed, never a 5.0 with 0 reviews).
--
-- Additive and idempotent.
-- ============================================================================

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
