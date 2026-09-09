-- Phase 3 slice 6: rider network foundation.
-- Riders, delivery assignments, cash settlements; orders gains rider_id +
-- delivery_code. (Blueprint sketch typed order_id as text; orders.id is
-- uuid, so uuid it is.) Run after 004, in the same one-sequence launch.
-- Triggers for code generation (slice 9) and cash movement (slice 10)
-- land as appended sections with their slices.

begin;

create table riders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete cascade,
  name          text not null,
  phone         text not null unique,
  contact_email text not null default '',
  vehicle       text not null default 'bike'
                check (vehicle in ('bicycle', 'bike', 'scooter')),
  zone_ids      text[] not null default '{}',
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'suspended')),
  is_online     boolean not null default false,
  cash_in_hand  int not null default 0,
  rating_avg    numeric(3, 2) not null default 0,
  rating_count  int not null default 0,
  created_at    timestamptz not null default now()
);

create table delivery_assignments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references orders (id),
  rider_id    uuid not null references riders (id),
  state       text not null default 'offered'
              check (state in ('offered', 'accepted', 'picked_up', 'delivered', 'cancelled', 'expired')),
  offered_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '90 seconds'
);

create table rider_settlements (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references riders (id),
  amount     int not null,
  method     text not null default 'cash',
  reference  text not null default '',
  settled_at timestamptz not null default now(),
  settled_by uuid references auth.users (id)
);

alter table orders add column rider_id uuid null references riders (id);
alter table orders add column delivery_code text null;

create index idx_riders_status on riders (status);
create index idx_riders_online on riders (is_online) where status = 'active';
create index idx_assignments_rider on delivery_assignments (rider_id);
create index idx_assignments_state on delivery_assignments (state);
create index idx_settlements_rider on rider_settlements (rider_id);

-- Rider self-lookup without recursing into riders policies.
create or replace function ps_rider_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from riders where user_id = auth.uid();
$$;

alter table riders               enable row level security;
alter table delivery_assignments enable row level security;
alter table rider_settlements    enable row level security;

-- No anon policies anywhere: rider data is never public.
create policy "riders admin all" on riders
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "riders self read" on riders
  for select using (id = ps_rider_id());
create policy "riders self update own" on riders
  for update using (id = ps_rider_id())
  with check (id = ps_rider_id());

-- Riders flip their own online switch only; everything else is staff-owned.
-- (The /rider app calls the API; this stops direct Supabase writes too.)
create or replace function ps_guard_rider_self_update()
returns trigger language plpgsql as $$
begin
  if (select ps_is_admin()) then
    return new;
  end if;
  if new.is_online is not distinct from old.is_online then
    raise exception 'forbidden';
  end if;
  if new.name is distinct from old.name
     or new.phone is distinct from old.phone
     or new.contact_email is distinct from old.contact_email
     or new.vehicle is distinct from old.vehicle
     or new.zone_ids is distinct from old.zone_ids
     or new.status is distinct from old.status
     or new.user_id is distinct from old.user_id
     or new.cash_in_hand is distinct from old.cash_in_hand
     or new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

drop trigger if exists trg_riders_guard_self_update on riders;
create trigger trg_riders_guard_self_update
  before update on riders
  for each row execute function ps_guard_rider_self_update();

-- Assignments move through the dispatch RPC (slice 7, security definer):
-- riders read their own rows, never write them directly.
create policy "assignments admin all" on delivery_assignments
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "assignments rider read own" on delivery_assignments
  for select using (rider_id = ps_rider_id());

create policy "settlements admin all" on rider_settlements
  for all using (ps_is_admin()) with check (ps_is_admin());
create policy "settlements rider read own" on rider_settlements
  for select using (rider_id = ps_rider_id());

commit;
