-- 202609270003_bag_snapshots.sql — the abandoned bag (UX plan §5, R10).
--
-- A shopper who opted in to "drops & offers" push on a device
-- (customer_push_subscriptions.marketing, migration 202609270001) and then
-- left pieces in the bag gets ONE reminder about 24 hours later — never SMS,
-- never email, never a second nag for the same bag.
--
--   • one row per push device (endpoint), written by the storefront through
--     PUT /api/bag/snapshot whenever the bag changes; a bag emptied at
--     checkout writes count = 0 so nothing is sent;
--   • `touched_at` is the last change, `reminded_at` the one reminder;
--     the scheduler (/api/cron/tick → abandoned-bags) picks rows with
--     count > 0, untouched for 24–72 h, not reminded in the last 7 days;
--   • the endpoint references the subscription row, so a device that
--     unsubscribes (or dies) takes its snapshot with it;
--   • service-role only — RLS on, no policies.

begin;

create table if not exists public.bag_snapshots (
  endpoint    text primary key
              references public.customer_push_subscriptions (endpoint) on delete cascade,
  count       integer not null default 0 check (count >= 0),
  subtotal    integer not null default 0 check (subtotal >= 0),   -- paisa
  top_name    text not null default '',
  top_slug    text not null default '',
  lang        text not null default 'bn',
  touched_at  timestamptz not null default now(),
  reminded_at timestamptz
);

create index if not exists idx_bag_snapshots_due
  on public.bag_snapshots (touched_at)
  where count > 0;

alter table public.bag_snapshots enable row level security;

do $$ begin raise notice 'BAG SNAPSHOTS OK'; end $$;

commit;
