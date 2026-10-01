-- ============================================================================
-- D (N6, 2026-10-01) — WHO VERIFIES A bKash/Nagad PAYMENT IS PROSANTI'S CHOICE.
--
-- Until now ps_verify_payment let BOTH staff and the owning shop decide, while
-- the wallet numbers customers pay are PROSANTI's own (site_settings ops
-- .wallets). So a shop could "verify" money it cannot see, or staff and shop
-- could race each other. Now each shop carries a verifier setting that admin
-- controls (Admin → Shops → edit):
--
--   platform → only PROSANTI staff decide this shop's wallet payments
--   shop     → only the owning shop decides them (staff must switch the
--              setting back to step in)
--   both     → either may decide (DEFAULT = the old behaviour; nothing changes
--              for any shop until admin picks something else)
--
-- Money accounting is unchanged: customers still pay PROSANTI's wallet and
-- shop_ledger still credits the shop's payable at delivery. The history note
-- now says WHO decided. Idempotent; same signature → grants stand.
-- ============================================================================

begin;

alter table shops add column if not exists payment_verifier text not null default 'both';
alter table shops drop constraint if exists shops_payment_verifier_check;
alter table shops add constraint shops_payment_verifier_check
  check (payment_verifier in ('platform', 'shop', 'both'));

create or replace function ps_verify_payment(p_order_id uuid, p_action text, p_note text default null)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_is_admin boolean;
  v_shop uuid;
  v_pv text := 'both';
  v_by text;
begin
  v_is_admin := (select ps_is_admin());
  v_shop := (select ps_vendor_shop());

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Who may decide is PROSANTI's choice per shop (shops.payment_verifier):
  --   'platform' → staff only, 'shop' → the owning shop only, 'both' → either
  -- (the behaviour before 202610010002, so it stays the default). An order
  -- with no shop is staff-only business.
  if v_order.shop_id is not null then
    select coalesce(payment_verifier, 'both') into v_pv
    from shops where id = v_order.shop_id;
    v_pv := coalesce(v_pv, 'both');
  end if;
  if v_is_admin then
    if v_pv = 'shop' then
      raise exception 'payment verification delegated to the shop';
    end if;
    v_by := 'PROSANTI staff';
  else
    if v_shop is null or v_order.shop_id is distinct from v_shop then
      raise exception 'forbidden';
    end if;
    if v_pv = 'platform' then
      raise exception 'payment verification reserved for the platform';
    end if;
    v_by := 'the shop';
  end if;

  if v_order.payment = 'cod' then
    raise exception 'not a wallet payment';
  end if;
  if v_order.payment_status <> 'pending_verification' then
    raise exception 'payment already decided';
  end if;

  -- P1 #8 (2): a cancelled order can never be VERIFIED — the order is over,
  -- the money is not in. Rows cancelled BEFORE the auto-reject rule still
  -- need a decision, so REJECT stays legal and settles them (re-setting
  -- status='cancelled' is a no-op: the release trigger only fires on the
  -- transition into cancelled, so stock cannot be released twice).
  if v_order.status = 'cancelled' and p_action = 'verified' then
    raise exception 'order already cancelled';
  end if;

  if p_action = 'verified' then
    -- The shop checked its own bKash/Nagad wallet: the money is in, this is
    -- the moment the order may start fulfilment.
    update orders
    set payment_status = 'verified', payment_verified_at = now(), updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, v_order.status,
      upper(left(v_order.payment, 1)) || right(v_order.payment, length(v_order.payment) - 1) || ' payment verified by ' || v_by,
      auth.uid());
  elsif p_action = 'rejected' then
    -- No matching money in the wallet: the order is cancelled and the
    -- reservation goes back to the shelf (trg_orders_release_on_cancel).
    -- The refund to the customer's wallet is the shop's offline handling.
    update orders
    set payment_status = 'rejected', payment_verified_at = now(),
        status = 'cancelled', updated_at = now()
    where id = p_order_id;
    insert into order_status_history (order_id, status, note, changed_by)
    values (p_order_id, 'cancelled',
      'Payment rejected by ' || v_by || coalesce(' — ' || trim(coalesce(p_note, '')), '') ||
      ' (refund from the shop wallet, offline)',
      auth.uid());
  else
    raise exception 'unknown payment action';
  end if;

  select * into v_order from orders where id = p_order_id;
  return v_order;
end $$;

notify pgrst, 'reload schema';

commit;
