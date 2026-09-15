-- ============================================================================
-- P2 #22 (2026-09-14): rider gig flexibility — per-rider availability.
-- ============================================================================
-- A Sunamganj rider is often a student or a shopkeeper after hours. They can
-- now keep a shift: two Dhaka clock hours (a range [from, to); from > to is
-- a night shift wrapping midnight) plus optional weekdays. NULL = always.
--
-- The rule is enforced WHERE OFFERS ARE BORN — inside ps_next_eligible_rider
-- — so an off-shift rider never receives a dispatch offer even with the app
-- open; manual admin assignment still works (the shop may call in a favour,
-- and that is a human decision, not an auto-queue accident).
--
-- Mirrors src/lib/rider-hours.ts `isOnShift` exactly — both must move
-- together or the rider's own screen would lie about what dispatch does.
-- ============================================================================

begin;

alter table riders add column if not exists avail_from_hour int
  check (avail_from_hour is null or (avail_from_hour >= 0 and avail_from_hour <= 23));
alter table riders add column if not exists avail_to_hour int
  check (avail_to_hour is null or (avail_to_hour >= 0 and avail_to_hour <= 24));
alter table riders add column if not exists avail_days smallint[];

create or replace function ps_rider_on_shift(r riders)
returns boolean
language sql stable set search_path = public as $$
  select (
      r.avail_days is null
      or coalesce(array_length(r.avail_days, 1), 0) = 0
      or extract(dow from (now() at time zone 'Asia/Dhaka'))::int = any (r.avail_days)
    )
    and (
      (r.avail_from_hour is null and r.avail_to_hour is null)
      or (
        -- an empty shift (18–18) never matches, by design, same as the TS rule
        coalesce(r.avail_from_hour, -1) <> coalesce(r.avail_to_hour, -1)
        and (
          case
            when r.avail_from_hour is not null and r.avail_to_hour is not null
                 and r.avail_from_hour > r.avail_to_hour then
              extract(hour from (now() at time zone 'Asia/Dhaka'))::int >= r.avail_from_hour
              or extract(hour from (now() at time zone 'Asia/Dhaka'))::int < r.avail_to_hour
            else
              extract(hour from (now() at time zone 'Asia/Dhaka'))::int >= coalesce(r.avail_from_hour, 0)
              and extract(hour from (now() at time zone 'Asia/Dhaka'))::int < coalesce(r.avail_to_hour, 24)
          end
        )
      )
    );
$$;

-- Dispatcher candidate pool, re-declared with the availability gate on BOTH
-- branches (geo-first and the plain fallback). Everything else is byte-for-
-- byte the 0014 definition so this migration composes with the chain.
create or replace function ps_next_eligible_rider(p_order_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_order_lat double precision;
  v_order_lng double precision;
  v_zone_id text;
  v_rider_id uuid;
begin
  select lat, lng, zone_id into v_order_lat, v_order_lng, v_zone_id from orders where id = p_order_id;

  -- Try nearest by geo if order has pin
  if v_order_lat is not null and v_order_lng is not null then
    select r.id into v_rider_id
    from riders r
    where r.status = 'active'
      and r.is_online
      and ps_rider_on_shift(r)
      and r.zone_ids @> array[v_zone_id]
      and r.cash_in_hand < 500000
      and r.current_load < 2 -- max 2 concurrent
      and not exists (
        select 1 from delivery_assignments a
        where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
      )
      and not exists (
        select 1 from delivery_assignments seen
        where seen.order_id = p_order_id and seen.rider_id = r.id
      )
    order by
      -- distance first (if rider has location)
      case when r.lat is not null and r.lng is not null
        then ps_haversine_km(v_order_lat, v_order_lng, r.lat, r.lng)
        else 9999 end asc,
      -- then rating high to low
      r.rating_avg desc,
      -- then least load
      r.current_load asc,
      -- then longest idle
      r.created_at asc
    limit 1;
    if v_rider_id is not null then
      return v_rider_id;
    end if;
  end if;

  -- Fallback: original logic without geo
  select r.id into v_rider_id
  from riders r
  where r.status = 'active'
    and r.is_online
    and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_zone_id]
    and r.cash_in_hand < 500000
    and not exists (
      select 1 from delivery_assignments a
      where a.rider_id = r.id and a.state in ('offered','accepted','picked_up')
    )
    and not exists (
      select 1 from delivery_assignments seen
      where seen.order_id = p_order_id and seen.rider_id = r.id
    )
  order by r.rating_avg desc, r.current_load asc, r.created_at asc
  limit 1;

  return v_rider_id;
end $$;

commit;
