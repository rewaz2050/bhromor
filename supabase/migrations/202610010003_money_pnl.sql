-- ============================================================================
-- G (N7, 2026-10-01) — A NET PROFIT & LOSS FOR THE PLATFORM.
--
-- Admin → Money showed "Platform income" as four gross cards: commission,
-- delivery charge, TIPS (which belong to the riders, not the platform) and
-- "rider pay" (tips + fees mixed). Nothing told the owner whether the platform
-- actually makes money per delivery once riders are paid and discounts are
-- absorbed.
--
-- ps_admin_money_pnl(p_from, p_to) answers that from the ledgers, for any
-- window (null = open end). Recognition date of an order = its delivery moment.
--
--   + commission                     shop_ledger.commission (delivered orders)
--   + delivery & surcharge income    orders.delivery_charge
--   + shop-funded free delivery      the waived charge the shop pays back out of
--                                    its payable (202609260003)
--   − rider pay                      rider_earnings delivery_fee + cod_handling
--                                    + incentive (+ signed adjustments)
--   − platform-funded discounts      orders.discount − the part the SHOP funds
--                                    (shop_ledger.promo_discount): the shop's
--                                    payable ignores platform coupons, so the
--                                    platform eats them
--   = net operating result
--
-- Tips are pass-through and reported OUTSIDE the result (collected vs credited
-- to riders). Staff-only on the caller's own JWT (ps_is_admin()). Read-only,
-- idempotent.
-- ============================================================================

begin;

create or replace function ps_admin_money_pnl(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not (select ps_is_admin()) then
    raise exception 'forbidden';
  end if;

  with base as (
    select o.id,
           -- orders has no delivered_at: the rider's stamp, else the moment the
           -- 'delivered' history line was written, else the last touch.
           coalesce(
             (select max(a.delivered_at) from delivery_assignments a
               where a.order_id = o.id and a.state = 'delivered'),
             (select min(h.created_at) from order_status_history h
               where h.order_id = o.id and h.status = 'delivered'),
             o.updated_at
           ) as at,
           coalesce(o.delivery_charge, 0) as delivery_charge,
           coalesce(o.discount, 0) as discount,
           coalesce(o.tip_amount, 0) as tip_amount,
           coalesce(o.is_return, false) as is_return,
           case when coalesce(to_jsonb(o)->>'free_delivery_by', '') = 'shop'
                then coalesce((to_jsonb(o)->>'free_delivery_waived')::bigint, 0)
                else 0 end as shop_free_delivery
    from orders o
    where o.status = 'delivered'
  ),
  win as (
    select * from base
    where (p_from is null or at >= p_from)
      and (p_to is null or at < p_to)
  ),
  led as (
    select l.order_id,
           coalesce(l.commission, 0) as commission,
           -- promo_discount exists only after 202609280003 → read via jsonb.
           coalesce((to_jsonb(l)->>'promo_discount')::bigint, 0) as promo_discount
    from shop_ledger l
    join win on win.id = l.order_id
  ),
  earn as (
    select kind, amount
    from rider_earnings
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at < p_to)
  )
  select jsonb_build_object(
    'deliveredOrders', (select count(*) from win where not is_return),
    'returnLegs', (select count(*) from win where is_return),
    'commission', coalesce((select sum(commission) from led), 0),
    'deliveryIncome', coalesce((select sum(delivery_charge) from win), 0),
    'shopFundedFreeDelivery', coalesce((select sum(shop_free_delivery) from win), 0),
    'riderFees', coalesce((select sum(amount) from earn
                           where kind in ('delivery_fee', 'cod_handling', 'incentive')), 0),
    'riderAdjustments', coalesce((select sum(amount) from earn where kind = 'adjustment'), 0),
    'discountsGiven', coalesce((select sum(discount) from win), 0),
    'shopFundedDiscounts', coalesce((select sum(promo_discount) from led), 0),
    'tipsCollected', coalesce((select sum(tip_amount) from win), 0),
    'tipsToRiders', coalesce((select sum(amount) from earn where kind = 'tip'), 0)
  ) into v;
  return v;
end $$;

revoke all on function ps_admin_money_pnl(timestamptz, timestamptz) from public, anon;
grant execute on function ps_admin_money_pnl(timestamptz, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
