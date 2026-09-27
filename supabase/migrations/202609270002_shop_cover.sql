-- ============================================================================
-- 202609270002_shop_cover.sql
-- Shop cover image (UX plan §9, R9) — one landscape photo per shop, shown as
-- the storefront header background and as the banner on the /shops card.
-- Optional: an empty string means "no cover" and every surface falls back to
-- what it shows today. The vendor sets it from Vendor → Settings (URL; the
-- same trust model as logo_url). Safe to run twice; expect "SHOP COVER OK".
-- ============================================================================

begin;

alter table public.shops
  add column if not exists cover_url text not null default '';

do $$ begin raise notice 'SHOP COVER OK'; end $$;

commit;
