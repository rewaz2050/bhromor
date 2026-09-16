-- Checkout delivery pricing: city ৳60, nearby ৳120, remote ৳150.
-- Apply once to an existing Supabase project; the application also uses these
-- values as its local fallback. Zone names remain internal implementation data.
update public.delivery_zones set charge = case id
  when 'z1' then 6000
  when 'z2' then 12000
  when 'z3' then 15000
  when 'z4' then 15000
  else charge
end
where id in ('z1','z2','z3','z4');

-- Existing shop rows may still have only the Sadar zones. Make the shop
-- eligible for every checkout delivery zone; the customer address still
-- determines the delivery charge.
update public.shops
set zone_ids = array['z1','z2','z3','z4']::text[]
where status = 'active';
