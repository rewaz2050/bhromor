-- ============================================================================
-- I (2026-10-02) — RIDER WEB PUSH: a new offer buzzes the rider's phone even
-- with the app closed.
--
-- Until now an offer only reached a rider whose app was OPEN (the feed polls
-- every 15 s and `use-offer-alert` vibrates). A rider with the phone in a
-- pocket missed the 90-second window and the order went to someone else.
--
--   rider_push_subscriptions   one row per rider browser/phone. Service-role
--                              only: RLS on, NO policies — /api/rider/push
--                              writes after requireRider(), and the fan-out in
--                              src/lib/rider-push.ts reads. A rider can never
--                              read another rider's endpoint. Deleting a rider
--                              deletes the devices.
--   delivery_assignments.push_notified_at
--                              "this offer has already been pushed". The
--                              sender CLAIMS rows (update … where null) so two
--                              concurrent sweeps never buzz a phone twice.
--
-- Offers are created in SQL (trigger + sweeps), so TypeScript cannot "see"
-- them being born; the sender instead looks for offered, unexpired,
-- not-yet-pushed rows right after anything that can create offers.
-- Safe to re-run. Nothing else changes.
-- ============================================================================
begin;

create table if not exists public.rider_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  rider_id     uuid not null references public.riders(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_rider_push_rider
  on public.rider_push_subscriptions (rider_id);

alter table public.rider_push_subscriptions enable row level security;
revoke all on table public.rider_push_subscriptions from anon, authenticated;
grant all on table public.rider_push_subscriptions to service_role;

alter table public.delivery_assignments
  add column if not exists push_notified_at timestamptz;

-- The sender's lookup: only offers that are still open and not yet pushed.
create index if not exists idx_assignments_unpushed
  on public.delivery_assignments (offered_at)
  where state = 'offered' and push_notified_at is null;

notify pgrst, 'reload schema';

commit;
