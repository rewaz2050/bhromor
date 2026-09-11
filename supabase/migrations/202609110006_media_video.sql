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
