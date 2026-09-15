-- ============================================================================
-- P2 #21 (2026-09-14): fabric transparency — per-product quality card.
-- ============================================================================
-- Additive and idempotent. Four optional columns on products:
--
--   fabric_gsm        declared fabric weight (g/m²) — the number behind
--                     "does this feel cheap?", 30–1000 keeps nonsense out
--   manufacturer      who wove it (mill / workshop the shop names itself)
--   test_report_url   a link to the fabric test report document, when the
--                     shop has one (hosted anywhere public — the shop owns
--                     the claim, we only store the link)
--   quality_checked   the shop's declaration for THIS piece — drives the
--                     "Quality Checked" badge; false by default, so nothing
--                     is ever claimed on the shop's behalf automatically
--
-- No defaults that fabricate a claim: absent = the card row is not rendered.
-- ============================================================================

begin;

alter table products add column if not exists fabric_gsm int
  check (fabric_gsm is null or (fabric_gsm >= 30 and fabric_gsm <= 1000));
alter table products add column if not exists manufacturer text;
alter table products add column if not exists test_report_url text;
alter table products add column if not exists quality_checked boolean not null default false;

commit;
