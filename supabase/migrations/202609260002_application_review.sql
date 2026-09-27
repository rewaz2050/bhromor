-- Round 4 (2026-09-26): application review + rider KYC.
--
--   * shops / riders gain a fourth status, 'rejected', so staff can answer
--     an application with a reason instead of leaving it pending forever or
--     suspending a shop that never opened.
--   * review_note / reviewed_by / reviewed_by_email / reviewed_at record
--     every decision (approve, reject, suspend, re-open) — the applicant
--     sees the note on the login page and can fix the details and
--     re-apply with the same login, which UPDATES the rejected row back
--     to 'pending' (one login = one shop / one rider stays true).
--   * riders.kyc holds the document URLs a pending rider uploads from the
--     login page (nid_front, nid_back, selfie, license) — staff see them
--     on the Admin → Riders card before pressing Approve.
--
-- Idempotent; safe to re-run.

begin;

-- ---------------------------------------------------------------- shops
alter table shops drop constraint if exists shops_status_check;
alter table shops
  add constraint shops_status_check
  check (status in ('pending', 'active', 'suspended', 'rejected'));

alter table shops
  add column if not exists review_note       text,
  add column if not exists reviewed_by       uuid,
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_at       timestamptz;

-- ---------------------------------------------------------------- riders
alter table riders drop constraint if exists riders_status_check;
alter table riders
  add constraint riders_status_check
  check (status in ('pending', 'active', 'suspended', 'rejected'));

alter table riders
  add column if not exists review_note       text,
  add column if not exists reviewed_by       uuid,
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_at       timestamptz,
  add column if not exists kyc               jsonb not null default '{}'::jsonb,
  add column if not exists kyc_submitted_at  timestamptz;

-- No guard change needed: since 202609160003 a rider's DIRECT write to
-- their own row may only flip is_online (jsonb whitelist), so the new
-- review/KYC columns are staff- and service-role-only automatically.
-- KYC uploads go through /api/rider/kyc, which writes with the service role
-- after verifying the rider's own session.

-- Storefront reads of shops are already limited to status = 'active' by the
-- public policies; a rejected shop is as invisible as a pending one.

notify pgrst, 'reload schema';

commit;
