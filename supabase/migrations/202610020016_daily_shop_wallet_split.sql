-- ============================================================================
-- Daily money report: separate the shop-own-wallet flows (2026-10-03).
--
-- After 202610020013 the daily report still lumped everything together:
--   • "walletPaidOrders" counted EVERY non-COD order — including money that went straight
--     into a shop's own bKash/Nagad and never touched PROSANTI;
--   • "shopPayoutsPaid" summed shop_payouts including NEGATIVE rows (a shop remitting to
--     PROSANTI), so a remittance quietly reduced the "paid out" figure.
--
-- Two new keys and one corrected one, patched into ps_admin_money_daily IN PLACE (the function
-- is long and is redefined by earlier migrations; copying it again risks drift):
--   shopWalletOrders   non-COD orders delivered that day whose shop sells into its own wallet
--                      (walletPaidOrders is unchanged: all non-COD, as before)
--   shopRemittances    money shops sent to PROSANTI that day (negative payouts, shown positive)
--   shopPayoutsPaid    now POSITIVE payouts only
-- Every anchor miss is a NOTICE, never an error: the report keeps working unpatched.
-- Safe to re-run. Run after 202610020015.
-- ============================================================================
begin;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
  -- anchors: unique substrings of the current definition
  a_paid  text := $q$coalesce((select sum(amount) from shop_payouts where paid_at >= v_from and paid_at < v_to), 0)$q$;
  b_paid  text := $q$coalesce((select sum(amount) from shop_payouts where amount > 0 and paid_at >= v_from and paid_at < v_to), 0)$q$;
  a_key1  text := $q$'walletPaidOrders',$q$;
  b_key1  text := $q$'shopWalletOrders', coalesce((select sum(o2.total) from day_orders d2 join orders o2 on o2.id = d2.id join shops s2 on s2.id = o2.shop_id where d2.payment <> 'cod' and s2.settlement_model = 'shop_wallet'), 0), 'walletPaidOrders',$q$;
  a_key2  text := $q$'shopPayoutsPaid',$q$;
  b_key2  text := $q$'shopRemittances', coalesce((select -sum(amount) from shop_payouts where amount < 0 and paid_at >= v_from and paid_at < v_to), 0), 'shopPayoutsPaid',$q$;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ps_admin_money_daily'
   order by p.oid desc limit 1;
  if v_oid is null then
    raise notice 'ps_admin_money_daily is not installed here — nothing to patch (re-run this file after 202610010007)';
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if position('shopRemittances' in v_def) > 0 then
    raise notice 'ps_admin_money_daily already reports shop-wallet flows';
    return;
  end if;
  if position(a_paid in v_def) = 0 or position(a_key1 in v_def) = 0 or position(a_key2 in v_def) = 0 then
    raise notice 'ps_admin_money_daily: anchors not found — the daily report keeps its old shape until patched';
    return;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'shops' and column_name = 'settlement_model') then
    raise notice 'shops.settlement_model is missing — run 202610020013 first, then re-run this file';
    return;
  end if;
  v_new := replace(v_def, a_paid, b_paid);
  v_new := replace(v_new, a_key1, b_key1);
  v_new := replace(v_new, a_key2, b_key2);
  execute v_new;
  raise notice 'ps_admin_money_daily patched: shopWalletOrders + shopRemittances, payouts exclude remittances';
end $$;

notify pgrst, 'reload schema';

commit;
