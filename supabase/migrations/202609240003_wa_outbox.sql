-- 202609240003_wa_outbox.sql — the free WhatsApp fallback: a draft, not a bot.
--
-- The owner asked (2026-09-24) whether the WhatsApp Business API was needed to
-- message customers at every order step. It is not: the API route needs a Meta
-- business account, pre-approved templates and a per-message fee (~$0.011 per
-- utility message to Bangladesh = ~10 taka an order), while a `wa.me` deep link
-- needs nothing at all — it opens the shop's OWN WhatsApp Business app with the
-- text already written and a human taps send.
--
-- So this table is the honest middle: when an order step happens and the free
-- Web Push reached NOBODY (shopper never opted in, or every device is dead),
-- the customer-facing message is written here as a draft. The shop's order page
-- shows it as "Ready to send" and one tap opens WhatsApp prefilled.
--
-- Why `opened_at` and not `sent_at`: the browser cannot observe what happens
-- inside the WhatsApp app. Recording "sent" when a human merely opened the
-- draft would be exactly the kind of claim this codebase refuses to make — so
-- the row records the tap that opened WhatsApp, and the docs say so out loud.
-- A draft can also be closed by a newer step (`superseded_at`) or by staff
-- deciding not to send it (`dismissed_at`).
--
-- Service-role only: nothing in the storefront reads or writes this table, and
-- RLS is enabled with no policies so an anon key sees nothing. A missing table
-- is not fatal — the queue helper reports it and the panel names this file,
-- exactly like the push tables do for their own migrations.
--
-- Safe to re-run.

begin;

create table if not exists public.wa_outbox (
  id            uuid primary key default gen_random_uuid(),
  -- The public order number (`orders.order_no`) — what every admin screen and
  -- every wa.me message already carries (see §70).
  order_no      text not null,
  -- Normalised BD mobile the draft is addressed to (the order's own phone).
  phone         text not null,
  -- The customer event kind (confirmed / preparing / picked-up / …).
  kind          text not null,
  lang          text not null default 'bn',
  message       text not null,
  created_at    timestamptz not null default now(),
  -- The tap that opened WhatsApp with this text prefilled. NOT a claim that
  -- the message was sent — see the header.
  opened_at     timestamptz,
  -- A later step for the same order arrived first; never send a stale step.
  superseded_at timestamptz,
  -- Staff looked at it and decided not to send it.
  dismissed_at  timestamptz,
  -- One draft per order per step: a status written twice (a retry, a double
  -- tap) queues once, and the second attempt is reported, not duplicated.
  unique (order_no, kind)
);

-- The queue read: newest pending drafts first.
create index if not exists idx_wa_outbox_pending
  on public.wa_outbox (created_at desc)
  where opened_at is null and superseded_at is null and dismissed_at is null;

-- "Everything waiting for this order" (the order page panel).
create index if not exists idx_wa_outbox_order
  on public.wa_outbox (order_no, created_at desc);

alter table public.wa_outbox enable row level security;

commit;
