-- 202609240002_cron_marks.sql — "we already did this once" marks.
--
-- The shop's time-based work (a delivery reminder, the morning digest) runs
-- from outside the app: `.github/workflows/cron.yml` calls `/api/cron/tick`
-- every 15 minutes — see docs/automation.md. Two of those jobs are one-shot by
-- nature: "tell this shopper their parcel is coming in about two hours" must
-- not repeat on every tick, and "the 9am digest" must not run 96 times a day.
--
-- A mark is CLAIMED with an INSERT before the work starts — the primary key is
-- the guarantee, a second claim fails with 23505 — and RELEASED (deleted) when
-- the work fails or reached nobody, so the next tick can try again. That gives
-- at-least-once with retries and no duplicate nagging.
--
-- Service-role only: nothing in the storefront reads or writes this table, and
-- RLS is enabled with no policies so an anon key sees nothing. A missing table
-- is not fatal — /api/cron/tick skips the one-shot jobs and says so in its
-- JSON, exactly like the push tables do for their own migrations.

begin;
create table if not exists public.cron_marks (
  key    text primary key,
  ran_at timestamptz not null default now()
);
alter table public.cron_marks enable row level security;
commit;
