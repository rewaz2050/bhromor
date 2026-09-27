-- ============================================================================
-- 202609270001_push_broadcasts.sql
-- Customer push BROADCAST (UX plan §12, R9) — "নতুন ড্রপের খবর" without SMS
-- or email: the shopper who already turned on order notifications can also
-- opt in to at most ONE shop message a week (a drop, an offer), sent from
-- Admin → Growth to every opted-in device at once.
--
--   • `customer_push_subscriptions.marketing` — the opt-in, per device,
--     default FALSE. Order milestones never look at it; only the broadcast
--     fan-out does. A device that never ticked the box is never broadcast to.
--   • `push_broadcasts` — one row per send: what was said (both languages),
--     where it pointed, how many devices accepted, who pressed the button.
--     The "one per 7 days" rule is enforced from `sent_at` of the newest row
--     server-side, so nobody can spam the list by reloading the page.
--
-- Service-role only, RLS with no policies (same posture as the parent table).
-- Safe to run twice. Expect "PUSH BROADCASTS OK" at the end.
-- ============================================================================

begin;

alter table public.customer_push_subscriptions
  add column if not exists marketing boolean not null default false;

create index if not exists idx_customer_push_marketing
  on public.customer_push_subscriptions (marketing)
  where marketing;

create table if not exists public.push_broadcasts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  title_bn   text not null default '',
  body       text not null,
  body_bn    text not null default '',
  href       text not null default '/offers',
  devices    integer not null default 0,
  accepted   integer not null default 0,
  sent_by    text,
  sent_at    timestamptz not null default now()
);

create index if not exists idx_push_broadcasts_sent_at
  on public.push_broadcasts (sent_at desc);

alter table public.push_broadcasts enable row level security;

do $$ begin raise notice 'PUSH BROADCASTS OK'; end $$;

commit;
