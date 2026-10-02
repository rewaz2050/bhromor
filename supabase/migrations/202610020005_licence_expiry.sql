-- Item N — driving-licence expiry.
--
-- A rider on a bike/scooter needs a valid licence. The photo has always been
-- collected (riders.kyc), but nothing tracked WHEN it lapses, so an expired
-- licence was invisible until a police checkpoint. Staff now record the expiry
-- date from the licence photo; the scheduler warns before it lapses and takes
-- the rider offline after, and the database refuses to put a rider with a
-- lapsed licence back online.
--
-- Everything is additive and idempotent. A NULL date means "not recorded" and
-- never blocks anybody (existing riders keep working until staff fill it in).

begin;

alter table riders
  add column if not exists licence_expires_on date;

-- A rider's own direct write may only flip is_online (jsonb whitelist since
-- 202609160003), so this column is staff/service-only without a guard change.

-- "Today" is the Dhaka calendar day. Only motorised riders are subject to it.
create or replace function ps_block_expired_licence_online()
returns trigger language plpgsql as $$
begin
  if new.is_online
     and not coalesce(old.is_online, false)
     and new.vehicle in ('bike', 'scooter')
     and new.licence_expires_on is not null
     and new.licence_expires_on < (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'licence_expired';
  end if;
  return new;
end $$;

drop trigger if exists trg_riders_block_expired_licence on riders;
create trigger trg_riders_block_expired_licence
  before update of is_online on riders
  for each row execute function ps_block_expired_licence_online();

notify pgrst, 'reload schema';

commit;
