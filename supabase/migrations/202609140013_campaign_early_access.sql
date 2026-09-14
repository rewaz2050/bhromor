-- ============================================================================
-- P2 #20 (2026-09-14): campaign landing (Eid mega page) — early-access list.
-- ============================================================================
-- Additive and idempotent. One optional tag column on the existing newsletter
-- table: the /campaign page's "join the early-access list" box posts through
-- the SAME subscribe endpoint as the footer, but stamps `campaign` with the
-- machine tag (lowercase a-z0-9-), so the owner can export just that list and
-- mail/call them before the drop opens. No second subscriber store, no
-- invented "notify" promise — a tag on a row is a fact, a fake email sender
-- is not.
-- ============================================================================

begin;

alter table newsletter_subscribers add column if not exists campaign text;

commit;
