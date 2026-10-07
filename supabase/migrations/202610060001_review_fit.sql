-- ============================================================================
-- Fit answer on reviews (2026-10-06).
--
-- "Will it fit me?" is the question every cloth buyer has and no product
-- description answers. The plan's true-to-size bar had been waiting on data
-- nobody was collecting; this is the column that collects it — one tap on
-- the review form (ছোট / ঠিক / বড়), stored with the review.
--
-- The value rides the review's moderation state: a pending review's fit
-- answer is invisible to the public read policy, exactly like the review
-- itself, so nothing unverified reaches a product page.
--
-- The storefront tolerates a database without this column: POST /api/reviews
-- retries the insert without `fit` when Postgres/PostgREST reports the
-- column missing, so a shop that has not migrated yet keeps taking reviews.
-- Until this runs, the fit bar simply never appears (no data, no claim).
-- ============================================================================

begin;

alter table reviews
  add column if not exists fit text
  check (fit is null or fit in ('small', 'true', 'large'));

comment on column reviews.fit is
  'Buyer''s one-tap size answer: small (runs small) | true (true to size) | large (runs large). Null when the buyer skipped it.';

-- The product-page summary counts approved rows for one product.
create index if not exists reviews_product_fit_idx
  on reviews (product_id)
  where fit is not null;

commit;

-- Migration marker — `npm run seed` and the go-live checklist look for these.
-- REVIEW FIT OK
