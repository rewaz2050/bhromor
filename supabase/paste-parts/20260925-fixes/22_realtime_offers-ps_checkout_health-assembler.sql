-- PASTE 22/24 · 22_realtime_offers-ps_checkout_health-assembler.sql
-- Source: supabase/migrations/202609250007_realtime_offers.sql
-- Assembler: decodes the base64 chunks and CREATEs the function.
-- Repeat-safe: re-running any part is harmless.
begin;

do $$
declare
  v_b64   text;
  v_src   text;
  v_short text;
begin
  select string_agg(body, '' order by seq) into v_b64 from _mig_paste_chunks where id = 'ps_checkout_health';
  if v_b64 is null then
    raise exception 'ps_checkout_health: paste the chunk parts first';
  end if;
  select string_agg(x.seq::text, ', ' order by x.seq) into v_short
  from (
    select e.seq, e.expected, length(regexp_replace(c.body, '[^A-Za-z0-9+/=]', '', 'g')) as got
    from unnest(array[2800,2800,2460]) with ordinality as e(expected, seq)
    left join _mig_paste_chunks c on c.id = 'ps_checkout_health' and c.seq = e.seq
  ) x
  where coalesce(x.got, -1) <> x.expected;
  if v_short is not null then
    raise exception 'ps_checkout_health: chunk % did not land intact — re-paste just that part and run this again', v_short;
  end if;

  v_b64 := regexp_replace(v_b64, '[^A-Za-z0-9+/=]', '', 'g');
  v_src := convert_from(decode(v_b64, 'base64'), 'UTF8');
  if md5(v_src) <> '4253553d050a23ba94aab9b408d95e96' then
    raise exception 'ps_checkout_health: checksum mismatch (md5 %) — a chunk was corrupted', md5(v_src);
  end if;
  if strpos(v_src, 'create or replace function ps_checkout_health') <> 1 then
    raise exception 'ps_checkout_health: decoded text does not start with the CREATE statement';
  end if;

  -- plpgsql binds late: refuse the swap if a column the function reads is missing.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_code_locked_until'
  ) then
    raise exception 'ps_checkout_health: orders.delivery_code_locked_until missing — run the delivery_pin_lockout parts first';
  end if;

  execute v_src;
  raise notice 'ps_checkout_health replaced — % characters, md5 4253553d050a23ba94aab9b408d95e96', length(v_src);
end $$;

drop table if exists _mig_paste_chunks;

commit;
