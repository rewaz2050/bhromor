-- Rider geo tracking + nearest auto-assign + load balancing
-- Serial 3: Auto-assign nearest rider

begin;

-- Add geo + load to riders
alter table riders add column if not exists lat double precision check (lat is null or (lat between -90 and 90));
alter table riders add column if not exists lng double precision check (lng is null or (lng between -180 and 180));
alter table riders add column if not exists last_location_at timestamptz;
alter table riders add column if not exists current_load int not null default 0 check (current_load >= 0);
alter table riders add column if not exists total_deliveries int not null default 0 check (total_deliveries >= 0);
alter table riders add column if not exists avg_delivery_minutes int;

-- Function to compute haversine distance in km
create or replace function ps_haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language plpgsql immutable as $$
declare
  R double precision := 6371;
  dLat double precision;
  dLng double precision;
  a double precision;
  c double precision;
begin
  if lat1 is null or lng1 is null or lat2 is null or lng2 is null then
    return null;
  end if;
  dLat := radians(lat2 - lat1);
  dLng := radians(lng2 - lng1);
  a := sin(dLat/2) * sin(dLat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLng/2) * sin(dLng/2);
  c := 2 * asin(sqrt(a));
  return R * c;
end $$;

-- Improved nearest rider: distance + rating + load + longest idle
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

-- Rider location update function
create or replace function ps_rider_update_location(p_lat double precision, p_lng double precision)
returns riders
language plpgsql security definer set search_path = public as $$
declare
  v_rider riders%rowtype;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid coordinates';
  end if;
  select * into v_rider from riders where id = ps_rider_id() for update;
  if not found then
    raise exception 'forbidden';
  end if;
  update riders
  set lat = p_lat, lng = p_lng, last_location_at = now()
  where id = v_rider.id
  returning * into v_rider;
  return v_rider;
end $$;

-- Track load on accept/pickup/deliver
create or replace function ps_track_rider_load()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' and NEW.state in ('offered','accepted','picked_up') then
    update riders set current_load = current_load + 1 where id = NEW.rider_id;
  elsif TG_OP = 'UPDATE' then
    if OLD.state in ('offered','accepted','picked_up') and NEW.state not in ('offered','accepted','picked_up') then
      update riders set current_load = greatest(0, current_load - 1), total_deliveries = case when NEW.state = 'delivered' then total_deliveries + 1 else total_deliveries end where id = NEW.rider_id;
    elsif OLD.state not in ('offered','accepted','picked_up') and NEW.state in ('offered','accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'DELETE' and OLD.state in ('offered','accepted','picked_up') then
    update riders set current_load = greatest(0, current_load - 1) where id = OLD.rider_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_assignments_track_load on delivery_assignments;
create trigger trg_assignments_track_load
  after insert or update or delete on delivery_assignments
  for each row execute function ps_track_rider_load();

-- Index for geo queries
create index if not exists idx_riders_lat_lng on riders (lat, lng) where lat is not null;
create index if not exists idx_riders_load on riders (current_load) where status = 'active' and is_online;

commit;
