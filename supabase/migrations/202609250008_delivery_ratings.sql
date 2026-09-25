-- Delivery (rider) ratings — the customer closes the quality loop (2026-09-25).
--
-- After a parcel is delivered, the shopper can rate the delivery 1–5 stars
-- on /track (phone-verified, like the rest of the tracker). The rating rolls
-- up into riders.rating_avg / rating_count, which the rider sees on their own
-- dashboard — morale + an honest quality signal for staff.
--
-- One rating per ORDER (primary key on order_id): a second tap can never
-- skew a rider's average, and re-running this migration is harmless.
--
-- Service-role only: RLS on with NO policies (the wa_outbox pattern) —
-- customers stay anonymous to riders, and riders read only their own
-- aggregate through /api/rider/stats.
begin;

create table if not exists delivery_ratings (
  order_id   uuid primary key references orders (id) on delete cascade,
  rider_id   uuid not null references riders (id),
  stars      int  not null check (stars between 1 and 5),
  created_at timestamptz not null default now()
);

alter table delivery_ratings enable row level security;

commit;
