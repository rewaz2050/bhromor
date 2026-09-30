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
