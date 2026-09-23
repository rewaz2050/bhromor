-- ============================================================================
-- 202609240001_customer_push.sql
-- Customer (shopper) Web Push — the shopper's own phone buzzes on the four
-- delivery milestones instead of the shop having to call each one.
--
-- Sibling of 202609210001_push_subscriptions (staff devices), deliberately a
-- SEPARATE table: the two audiences carry different promises and different
-- retention. A shopper's subscription is bound to the phone number they used
-- at checkout — the only identity this store has — and is never visible to
-- another customer.
--
--   • one row per browser subscription (endpoint is the push service's
--     identity inside a browser profile);
--   • `phone` is the checkout number (normalised BD mobile, `normalizePhone`);
--     at most a handful of rows per number (phone + tablet), so the fan-out
--     for one order is a single indexed lookup;
--   • `lang` remembers the storefront language the shopper was reading, so a
--     Bangla shopper is not pushed English (default 'bn' — this shop is in
--     Sunamganj, not a demo);
--   • service-role only: /api/track/push writes through the service client
--     AFTER the track lookup has proved the caller knows the order number and
--     that number's phone. RLS with no policies denies anon/authenticated, so
--     nobody can read another shopper's endpoint.
--
-- Runs in its own transaction (the bootstrap script ends its main block
-- above); safe to run twice.
-- ============================================================================

begin;

create table if not exists public.customer_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  phone        text not null,
  lang         text not null default 'bn',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Fan-out for one order is `where phone = <checkout number>`.
create index if not exists idx_customer_push_phone
  on public.customer_push_subscriptions (phone);

alter table public.customer_push_subscriptions enable row level security;

-- No policies on purpose: anon/authenticated get nothing. The only writer is
-- /api/track/push (service role, after the track proof) and the only reader is
-- the milestone fan-out in src/lib/customer-push.ts (service role).

commit;
