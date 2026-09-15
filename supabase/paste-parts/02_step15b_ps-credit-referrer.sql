-- PASTE 4/11 · file 02_step15b_ps-credit-referrer.sql
-- go-live step 15b — 202609130008_growth_promos_gift_referral.sql
-- Run the files IN ORDER (00 → 09), one paste each, in the Supabase SQL Editor.
--
-- Lines 475–538: ps_credit_referrer(order_id) —
-- mints the referrerʼs coupon when the friendʼs order is delivered. Only defined
-- here, never re-created later, so it is NOT skippable.

begin;

-- ----------------------------------------------------------------------------
-- 4. The referrerʼs ৳50: minted as a REAL single-use coupon when the friendʼs
--    order is delivered (that is the moment the referral has earned it).
--    Idempotent — one credit per (code, referee) — so a re-fired advance call
--    cannot print money.
-- ----------------------------------------------------------------------------
create or replace function ps_credit_referrer(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v orders%rowtype;
  v_cfg jsonb;
  v_rc referral_codes%rowtype;
  v_grants int;
  v_reward bigint;
  v_coupon_id uuid;
  v_coupon_code text;
begin
  select * into v from orders where id = p_order_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no order');
  end if;
  if coalesce(v.referral_code, '') = '' or v.status <> 'delivered' then
    return jsonb_build_object('granted', false, 'reason', 'not eligible');
  end if;
  if exists (select 1 from referral_rewards rr
             where rr.code = v.referral_code
               and rr.referee_phone = v.customer_phone
               and rr.referrer_coupon_id is not null) then
    return jsonb_build_object('granted', false, 'reason', 'already credited');
  end if;

  v_cfg := coalesce((select value from site_settings where key = 'ops'), '{}'::jsonb)->'referral';
  if not coalesce((v_cfg->>'enabled')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason', 'disabled');
  end if;
  select * into v_rc from referral_codes where code = v.referral_code;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown code');
  end if;
  v_reward := greatest(0, coalesce((v_cfg->>'referrerRewardPaisa')::bigint, 0));
  if v_reward <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'zero reward');
  end if;

  select count(*) into v_grants from referral_rewards rr
  where rr.code = v.referral_code and rr.referrer_coupon_id is not null;
  if v_grants >= greatest(1, coalesce((v_cfg->>'maxRewardsPerReferrer')::int, 10)) then
    return jsonb_build_object('granted', false, 'reason', 'cap reached');
  end if;

  v_coupon_code := 'PSREF' || v.referral_code || '-' || (v_grants + 1)::text;
  insert into coupons (code, type, value, min_order, valid_until, usage_limit, used, active)
  values (v_coupon_code, 'fixed', v_reward, 0, now() + interval '180 days', 1, 0, true)
  returning id into v_coupon_id;

  update referral_rewards rr
  set referrer_coupon_id = v_coupon_id, referrer_reward = v_reward
  where rr.code = v.referral_code and rr.referee_phone = v.customer_phone
    and rr.referrer_coupon_id is null;

  return jsonb_build_object('granted', true, 'code', v_coupon_code,
                            'reward', v_reward, 'name', v_rc.customer_name);
end $$;

commit;

