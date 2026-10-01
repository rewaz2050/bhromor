-- Vendor sees who is coming for the parcel (2026-10-01, audit item H / B5).
--
-- A shop used to press "Ready — request riders" and then see NOTHING: not who
-- accepted, not a number to call when the parcel is waiting. Shops cannot read
-- riders / delivery_assignments (RLS is admin / own-rider only), so this is a
-- narrow SECURITY DEFINER read:
--   • only the OWNING shop (orders.shop_id = ps_vendor_shop()) gets an answer;
--   • only while a rider is actually on the job (accepted / picked_up) — the
--     rider's phone is not exposed for offers, finished or failed jobs;
--   • only name, phone, vehicle and the job state; nothing financial.
-- Returns NULL when there is nobody to show. Safe to re-run.
begin;

create or replace function ps_vendor_order_rider(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_shop uuid := ps_vendor_shop();
  v jsonb;
begin
  if v_shop is null then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
           'name', r.name,
           'phone', r.phone,
           'vehicle', r.vehicle,
           'state', a.state
         )
    into v
  from delivery_assignments a
  join riders r on r.id = a.rider_id
  join orders o on o.id = a.order_id
  where a.order_id = p_order_id
    and o.shop_id = v_shop
    and a.state in ('accepted', 'picked_up')
  order by a.offered_at desc
  limit 1;
  return v; -- null when the order is not this shop's or nobody is on it
end $$;

revoke all on function ps_vendor_order_rider(uuid) from public, anon;
grant execute on function ps_vendor_order_rider(uuid) to authenticated, service_role;

commit;
