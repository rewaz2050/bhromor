-- PASTE 6/11 · file 04_step30a_plus-memberships-table.sql
-- go-live step 30a — 202609140015_plus_membership.sql
-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.
--
-- Lines 21–49: the memberships ledger, orders.is_plus,
-- and the admin-only RLS on memberships. Must exist BEFORE the FINAL
-- ps_place_order is created (it reads memberships and writes is_plus).

begin;

create table if not exists memberships (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null check (phone ~ '^01[0-9]{9}$'),
  name         text not null default '',
  status       text not null default 'pending'
               check (status in ('pending', 'active', 'rejected')),
  months       int  not null default 1 check (months between 1 and 12),
  amount_paisa bigint not null check (amount_paisa >= 0),
  pay_method   text check (pay_method in ('bkash', 'nagad')),
  trxid        text check (trxid is null or trxid ~ '^[A-Za-z0-9]{6,32}$'),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  started_at   timestamptz,
  expires_at   timestamptz
);
create index if not exists idx_memberships_phone on memberships (phone);
create index if not exists idx_memberships_status on memberships (status, created_at desc);
-- One open application per phone — a double-tap cannot queue two reviews.
create unique index if not exists memberships_pending_uq on memberships (phone)
  where status = 'pending';

alter table orders add column if not exists is_plus boolean not null default false;

-- Staff read/act through the admin role, the anon key gets nothing, matching
-- every other table that holds peopleʼs numbers.
drop policy if exists "admin all memberships" on memberships;
create policy "admin all memberships" on memberships
  for all using (ps_is_admin()) with check (ps_is_admin());

commit;

