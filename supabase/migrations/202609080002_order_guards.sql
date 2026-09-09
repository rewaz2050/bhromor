-- Backend phase 1: order hardening on top of supabase/schema.sql.
-- The API already prices orders in TypeScript; these guards make the
-- database the second line of defence so no writer can store totals that
-- do not add up, non-COD payments, or non-pending initial states.
begin;

-- 1. Totals must reconcile: total = subtotal - discount + delivery_charge.
create or replace function ps_check_order_totals()
returns trigger language plpgsql as $$
begin
  if new.discount > new.subtotal then
    raise exception 'discount (%) exceeds subtotal (%)', new.discount, new.subtotal;
  end if;
  if new.total <> new.subtotal - new.discount + new.delivery_charge then
    raise exception 'order total does not reconcile';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_totals on orders;
create trigger trg_orders_check_totals
  before insert or update on orders
  for each row execute function ps_check_order_totals();

-- 2. Launch policy: guest checkout creates pending COD orders only (§20–21).
create or replace function ps_check_order_insert()
returns trigger language plpgsql as $$
begin
  if new.status <> 'pending' then
    raise exception 'orders must be created pending';
  end if;
  if new.payment <> 'cod' then
    raise exception 'only cash on delivery is enabled';
  end if;
  if length(trim(new.customer_name)) < 2 then
    raise exception 'customer name is required';
  end if;
  if length(trim(new.area)) < 2 then
    raise exception 'delivery area is required';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_check_insert on orders;
create trigger trg_orders_check_insert
  before insert on orders
  for each row execute function ps_check_order_insert();

-- 3. Atomic coupon usage with limit guard. Called by the order API with the
-- service role after the discount is snapshotted onto the order. Anonymous
-- clients have no INSERT on orders, so the only reachable path is the API.
create or replace function ps_use_coupon(p_coupon_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_used int;
  v_limit int;
begin
  select used, usage_limit into v_used, v_limit
  from coupons where id = p_coupon_id for update;
  if not found then
    raise exception 'coupon not found';
  end if;
  if v_limit is not null and v_used >= v_limit then
    raise exception 'coupon usage limit reached';
  end if;
  update coupons set used = v_used + 1 where id = p_coupon_id;
end $$;

commit;
