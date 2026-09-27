-- 202609270004_review_stamps.sql — "রিভিউ লিখুন, স্ট্যাম্প পান" (UX plan §4/§7, R10).
--
-- The Smart Card counted orders only. Now an APPROVED review of a piece the
-- shopper really bought (a delivered order on that phone containing the
-- product — the same proof the "verified purchase" badge needs) earns one
-- stamp, written to a ledger when staff approve it.
--
--   • reviews.customer_phone / reviews.order_ref — who wrote it, proven at
--     submission (never trusted from the form alone);
--   • stamp_ledger — one row per stamp that is not an order; unique
--     (kind, ref_id) so approving → hiding → approving never pays twice;
--   • the card's count = non-cancelled orders + ledger rows for the phone;
--   • service-role only (RLS on, no policies).

begin;

alter table public.reviews
  add column if not exists customer_phone text,
  add column if not exists order_ref text;

create index if not exists idx_reviews_customer_phone
  on public.reviews (customer_phone)
  where customer_phone is not null;

create table if not exists public.stamp_ledger (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  kind       text not null default 'review' check (kind in ('review')),
  ref_id     uuid not null,
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);

create index if not exists idx_stamp_ledger_phone on public.stamp_ledger (phone);

alter table public.stamp_ledger enable row level security;

do $$ begin raise notice 'REVIEW STAMPS OK'; end $$;

commit;
