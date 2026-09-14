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
