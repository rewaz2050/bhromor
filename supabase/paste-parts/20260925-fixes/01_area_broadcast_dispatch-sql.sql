-- PASTE 1/24 · 01_area_broadcast_dispatch-sql.sql
-- Source: supabase/migrations/202609250001_area_broadcast_dispatch.sql
-- Paste this WHOLE file into the Supabase SQL Editor and press RUN.
-- Repeat-safe: re-running any part is harmless.
begin;

-- Keep the legacy index name for the existing health probe, but invitations
-- no longer reserve an order. Only a rider who accepts owns it.

drop index if exists delivery_assignments_one_live_offer;

create unique index delivery_assignments_one_live_offer
  on delivery_assignments(order_id) where state in ('accepted', 'picked_up');

create unique index if not exists delivery_assignments_one_rider_offer
  on delivery_assignments(order_id, rider_id)
  where state in ('offered', 'accepted', 'picked_up');

alter table delivery_assignments add column if not exists is_broadcast boolean not null default false;

-- Invitations must not count as work (or broadcasting fills every rider).

create or replace function ps_track_rider_load()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'UPDATE' then
    if OLD.state in ('accepted','picked_up') and NEW.state not in ('accepted','picked_up') then
      update riders set current_load = greatest(0, current_load - 1),
        total_deliveries = total_deliveries + case when NEW.state = 'delivered' then 1 else 0 end
      where id = OLD.rider_id;
    elsif OLD.state not in ('accepted','picked_up') and NEW.state in ('accepted','picked_up') then
      update riders set current_load = current_load + 1 where id = NEW.rider_id;
    end if;
  elsif TG_OP = 'DELETE' and OLD.state in ('accepted','picked_up') then
    update riders set current_load = greatest(0, current_load - 1) where id = OLD.rider_id;
  end if;
  return coalesce(NEW, OLD);
end $$;

update riders r set current_load = (
  select count(*) from delivery_assignments a
  where a.rider_id = r.id and a.state in ('accepted','picked_up')
);

-- Internal helper. Every dispatch writer locks the order before its offers.
-- "Area" means the checkout delivery zone, already maintained in zone_ids.

create or replace function ps_broadcast_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready-for-pickup'
     or coalesce(v_order.is_pickup, false) or v_order.rider_id is not null
     or (v_order.payment in ('bkash','nagad') and v_order.payment_status <> 'verified') then
    return null;
  end if;
  if exists (select 1 from delivery_assignments where order_id = p_order_id
    and (state in ('accepted','picked_up') or (state = 'offered' and not is_broadcast))) then
    return null; -- a manual offer is exclusive until it expires/is declined
  end if;

  insert into delivery_assignments(order_id, rider_id, state, offered_at, expires_at, is_broadcast)
  select p_order_id, r.id, 'offered', now(), now() + interval '90 seconds', true
  from riders r
  where r.status = 'active' and r.is_online and ps_rider_on_shift(r)
    and r.zone_ids @> array[v_order.zone_id]
    and r.cash_in_hand < 500000 and r.current_load < 2
    and not exists (select 1 from delivery_assignments a
      where a.order_id = p_order_id and a.rider_id = r.id
        and (a.state in ('offered','accepted','picked_up','cancelled')
          or a.offered_at > now() - interval '5 minutes'))
  on conflict do nothing;

  select id into v_id from delivery_assignments
  where order_id = p_order_id and state = 'offered' order by offered_at, id limit 1;
  return v_id;
end $$;

revoke all on function ps_broadcast_order(uuid) from public, anon, authenticated;

grant execute on function ps_broadcast_order(uuid) to service_role;


create or replace function ps_auto_dispatch_ready_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ready-for-pickup' and old.status is distinct from new.status then
    perform ps_broadcast_order(new.id);
  end if;
  return new;
end $$;

commit;
