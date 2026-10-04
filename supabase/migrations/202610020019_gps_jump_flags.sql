-- ============================================================================
-- GPS-JUMP FLAGS (2026-10-03): a rider whose reported position "teleports" is flagged for staff.
--
-- Fake-GPS apps let a rider appear near a shop (to win offers) or near a customer (to mark a
-- delivery done). A server cannot PROVE spoofing, but one signal is hard to hide: IMPOSSIBLE
-- SPEED — the new fix is ≥ 2 km from the previous one and reaching it would need more than
-- 120 km/h given the time between the two pings. Real riders on motorbikes never do that;
-- a spoofing app flipping between two places does it constantly.
--
--   rider_gps_flags            one row per suspicious jump (from/to, distance, seconds, km/h).
--                              Staff-readable (RLS ps_is_admin), written only by the SQL below.
--   ps_rider_update_location   same signature and return type as before (202609090014); now also
--                              records a flag. At most ONE flag per rider per 5 minutes, so a
--                              spoofer flipping every ping does not flood the table. A failure
--                              while flagging can NEVER block the location update itself.
--
-- It only RECORDS and SHOWS (Admin → Rider profile → "GPS jump alerts"); nothing is suspended or
-- withheld automatically — a bad fix after a tunnel or a phone swap is a human decision.
-- Thresholds are site_settings (0 turns it off):
--   gps_jump_max_kmh  (default 120)     gps_jump_min_m  (default 2000)
--
-- Safe to re-run.
-- ============================================================================
begin;

-- Already present in production (202609090014); repeated so this file stands alone.
alter table public.riders add column if not exists lat double precision;
alter table public.riders add column if not exists lng double precision;
alter table public.riders add column if not exists last_location_at timestamptz;

create table if not exists public.rider_gps_flags (
  id          uuid primary key default gen_random_uuid(),
  rider_id    uuid not null references public.riders(id) on delete cascade,
  from_lat    double precision not null,
  from_lng    double precision not null,
  to_lat      double precision not null,
  to_lng      double precision not null,
  distance_m  integer not null check (distance_m >= 0),
  seconds     integer not null check (seconds >= 0),
  speed_kmh   integer not null check (speed_kmh >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_rider_gps_flags_rider
  on public.rider_gps_flags (rider_id, created_at desc);

alter table public.rider_gps_flags enable row level security;
drop policy if exists "gps flags admin read" on public.rider_gps_flags;
create policy "gps flags admin read" on public.rider_gps_flags
  for select using (ps_is_admin());
revoke all on table public.rider_gps_flags from anon, authenticated;
grant select on table public.rider_gps_flags to authenticated;
grant all on table public.rider_gps_flags to service_role;

create or replace function public.ps_rider_update_location(p_lat double precision, p_lng double precision)
returns riders
language plpgsql security definer set search_path = public as $$
declare
  v_rider    riders%rowtype;
  v_prev_lat double precision;
  v_prev_lng double precision;
  v_prev_at  timestamptz;
  v_max_kmh  bigint;
  v_min_m    bigint;
  v_dist_m   double precision;
  v_secs     double precision;
  v_kmh      double precision;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  v_prev_lat := v_rider.lat;
  v_prev_lng := v_rider.lng;
  v_prev_at  := v_rider.last_location_at;

  update riders
  set lat = p_lat, lng = p_lng, last_location_at = now()
  where id = v_rider.id
  returning * into v_rider;

  -- The flag is best-effort: whatever happens here, the position above is already saved.
  begin
    v_max_kmh := least(greatest(ps_setting_int('gps_jump_max_kmh', 120), 0), 1000);
    v_min_m   := least(greatest(ps_setting_int('gps_jump_min_m', 2000), 100), 100000);
    if v_max_kmh > 0 and v_prev_lat is not null and v_prev_lng is not null and v_prev_at is not null then
      -- haversine, metres
      v_dist_m := 2 * 6371000 * asin(least(1, sqrt(
        power(sin(radians(p_lat - v_prev_lat) / 2), 2)
        + cos(radians(v_prev_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_prev_lng) / 2), 2)
      )));
      v_secs := greatest(extract(epoch from (now() - v_prev_at)), 1);
      v_kmh  := v_dist_m / v_secs * 3.6;
      if v_dist_m >= v_min_m and v_kmh > v_max_kmh
         and not exists (
           select 1 from rider_gps_flags
           where rider_id = v_rider.id and created_at > now() - interval '5 minutes'
         ) then
        insert into rider_gps_flags (rider_id, from_lat, from_lng, to_lat, to_lng, distance_m, seconds, speed_kmh)
        values (
          v_rider.id, v_prev_lat, v_prev_lng, p_lat, p_lng,
          round(v_dist_m)::integer, least(round(v_secs), 2000000000)::integer, least(round(v_kmh), 2000000000)::integer
        );
      end if;
    end if;
  exception when others then
    null;
  end;
  return v_rider;
end $$;

-- Same grants as before (the function was created without an explicit grant; keep callable by riders only).
revoke all on function public.ps_rider_update_location(double precision, double precision) from public, anon;
grant execute on function public.ps_rider_update_location(double precision, double precision) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
