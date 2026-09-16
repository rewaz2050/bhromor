-- PASTE 11/11 · file 09_step30b_fn-assemble-and-create.sql
-- go-live step 30b — decode the chunks and CREATE the FINAL ps_place_order
-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.
--
-- Runs only if all 4 chunks landed at their exact lengths, the decoded text
-- is 21242 characters with md5 7d407986fbf6bada85963ffd3024cc7e, and every
-- table and orders column the function touches exists. Then it EXECUTEs the
-- CREATE OR REPLACE and drops the helper table.

begin;

do $$
declare
  v_chunks  int;
  v_b64     text;
  v_src     text;
  v_short   text;
  v_missing text;
begin
  select count(*), string_agg(body, '' order by seq)
    into v_chunks, v_b64
  from _mig_paste_chunks
  where id = 'ps_place_order';

  if coalesce(v_chunks, 0) <> 4 then
    raise exception 'expected 4 chunks of ps_place_order, found % — paste parts 05 to 08 first',
      coalesce(v_chunks, 0);
  end if;

  -- name the chunk that did not land, so the fix is exactly one re-paste
  select string_agg(x.seq::text, ', ' order by x.seq) into v_short
  from (
    select e.seq, e.expected, length(regexp_replace(c.body, '[^A-Za-z0-9+/=]', '', 'g')) as got
    from unnest(array[7090, 7090, 7090, 7090])
           with ordinality as e(expected, seq)
    left join _mig_paste_chunks c on c.id = 'ps_place_order' and c.seq = e.seq
  ) x
  where coalesce(x.got, -1) <> x.expected;

  if v_short is not null then
    raise exception 'chunk % did not land intact (base64 characters, line breaks ignored) — re-paste just that part, it overwrites cleanly, then run this again',
      v_short;
  end if;

  v_b64 := regexp_replace(v_b64, '[^A-Za-z0-9+/=]', '', 'g');
  v_src := convert_from(decode(v_b64, 'base64'), 'UTF8');

  if length(v_src) <> 21242 then
    raise exception 'decoded % characters, expected 21242 — the paste was truncated',
      length(v_src);
  end if;

  if md5(v_src) <> '7d407986fbf6bada85963ffd3024cc7e' then
    raise exception 'checksum mismatch, md5 % — the decoded text is not 202609140015_plus_membership.sql', md5(v_src);
  end if;

  if strpos(v_src, 'create or replace function ps_place_order') <> 1 then
    raise exception 'the decoded text does not start with the CREATE statement';
  end if;

  -- plpgsql binds late: a missing column would NOT fail the CREATE, it would
  -- fail every checkout afterwards. So refuse the swap instead.
  select string_agg(x.need, ', ' order by x.need) into v_missing
  from (
    select 'table ' || t as need
    from unnest(array['coupons', 'delivery_zones', 'memberships', 'order_items', 'order_status_history', 'orders', 'product_variants', 'products', 'referral_codes', 'referral_rewards', 'shops', 'site_settings']) as t
    where not exists (select 1 from information_schema.tables k
                      where k.table_schema = 'public' and k.table_name = t)
    union all
    select 'orders.' || c
    from unnest(array['shop_id', 'customer_name', 'customer_phone', 'area', 'address', 'note', 'zone_id', 'lat', 'lng', 'distance_km', 'scheduled_at', 'delivery_window', 'is_express', 'is_pickup', 'is_return', 'return_reason', 'return_parent_id', 'return_status', 'pickup_slot', 'tip_amount', 'weight_kg', 'surcharge_night', 'surcharge_rain', 'surcharge_distance', 'surcharge_express', 'surcharge_weight', 'is_gift', 'gift_wrap', 'gift_fee', 'gift_recipient_name', 'gift_recipient_phone', 'gift_message', 'promo_kind', 'promo_discount', 'referral_code', 'referral_credit', 'subtotal', 'delivery_charge', 'discount', 'coupon_id', 'total', 'is_plus', 'payment', 'payment_ref', 'payment_status', 'status']) as c
    where not exists (select 1 from information_schema.columns k
                      where k.table_schema = 'public'
                        and k.table_name = 'orders' and k.column_name = c)
  ) x;

  if v_missing is not null then
    raise exception 'REFUSING to swap ps_place_order — this database is missing: %', v_missing;
  end if;

  execute v_src;
  raise notice 'ps_place_order replaced — % characters, md5 %', length(v_src), md5(v_src);
end $$;

drop table if exists _mig_paste_chunks;

commit;

-- verify: the FINAL version carries every era marker, and the stored body
-- checksums against the migration file
select 'installed body is byte-identical to the migration' as check_,
       case when exists (
              select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'ps_place_order'
                and md5(p.prosrc) = 'a2ef2cc2ae969020c1f519858e168564')
       then 'OK' else 'MISMATCH or not swapped — re-run parts 05 to 09' end as state
union all
select 'ps_place_order is the FINAL version',
       case when exists (
              select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'ps_place_order'
                and p.prosrc like '%v_plus%'                     -- step 30 (PLUS waiver)
                and p.prosrc like '%return_parent_id required%'  -- step 23 (returns)
                and p.prosrc like '%pending_verification%'       -- step 19 (wallet)
                and p.prosrc like '%v_ref_credit%'               -- step 15 (referral)
                and p.prosrc like '%v_flash_discount%')          -- step 15 (flash, bundle)
       then 'OK' else 'NOT SWAPPED — re-run parts 05 to 09' end
union all
select 'ps_credit_referrer exists',
       case when exists (select 1 from pg_proc where proname = 'ps_credit_referrer')
       then 'OK' else 'MISSING — run part 02' end
union all
select 'growth tables',
       case when exists (select 1 from information_schema.tables where table_name = 'price_watches')
             and exists (select 1 from information_schema.tables where table_name = 'referral_codes')
             and exists (select 1 from information_schema.tables where table_name = 'referral_rewards')
       then 'OK' else 'MISSING — run part 01' end
union all
select 'wallet columns on orders',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'orders' and column_name = 'payment_status')
       then 'OK' else 'MISSING — run part 03' end
union all
select 'memberships and orders.is_plus',
       case when exists (select 1 from information_schema.tables where table_name = 'memberships')
             and exists (select 1 from information_schema.columns
                         where table_name = 'orders' and column_name = 'is_plus')
       then 'OK' else 'MISSING — run part 04' end
union all
select 'helper table dropped',
       case when not exists (select 1 from information_schema.tables where table_name = '_mig_paste_chunks')
       then 'OK' else 'STILL THERE — run: drop table _mig_paste_chunks' end
order by 1;

