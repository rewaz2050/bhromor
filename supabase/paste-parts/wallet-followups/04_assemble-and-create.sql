-- PASTE 4/4 · decode the base64, prove it, then create the three functions
-- Runs only if all 3 payloads landed at their exact length and decode to their
-- exact md5 — so what is installed is byte-identical to the migration files,
-- nothing rewritten. It then re-reads md5(prosrc) from the catalog and prints
-- one row per function.
--
-- Steps 21 and 22 of docs/go-live.md. Both are CREATE OR REPLACE, so re-running
-- is safe. Note that ps_rider_deliver gained a p_proof_url parameter in step 21,
-- which means PostgreSQL keeps the old 2-argument overload beside the new one —
-- that is expected, and the app always calls the 3-argument version.

begin;

do $$
declare
  v_row    record;
  v_b64    text;
  v_src    text;
  v_got    int;
begin
  if to_regclass('public._mig_paste_chunks') is null then
    raise exception 'the helper table does not exist — paste parts 01 to 03 first, one at a time';
  end if;
  select count(*) into v_got from _mig_paste_chunks;
  if v_got = 0 then
    raise exception 'the helper table is empty — paste parts 01 to 03 first';
  end if;

  for v_row in
    select * from (values
    ('ps_rider_deliver', 3104, 2323, 'b2b2cbf251af2192632e6a093af70ee9', 2117, '9eadbbb709b8a800b85171939461ed2c'),
    ('ps_advance_order', 4064, 3042, 'b529183b877014f98a72fedd26c1f00a', 2843, '63ddc0164133ef06de57dd0c35f64576'),
    ('ps_verify_payment', 3656, 2736, '2b72524d2cff36383dbe9c08be34d572', 2551, '728b7e633af09eebc038275f52a796a1')
    ) as x(fname, b64_chars, stmt_chars, stmt_md5, prosrc_chars, prosrc_md5)
  loop
    select string_agg(body, '' order by seq) into v_b64
    from _mig_paste_chunks where id = v_row.fname;

    if v_b64 is null then
      raise exception '% has no stored payload — paste that part, then run this again', v_row.fname;
    end if;

    v_b64 := regexp_replace(v_b64, '[^A-Za-z0-9+/=]', '', 'g');
    if length(v_b64) <> v_row.b64_chars then
      raise exception '% did not land intact — % base64 characters stored, % expected. Re-paste that part, it overwrites cleanly',
        v_row.fname, length(v_b64), v_row.b64_chars;
    end if;

    v_src := convert_from(decode(v_b64, 'base64'), 'UTF8');
    if length(v_src) <> v_row.stmt_chars then
      raise exception '% decoded to % characters, expected % — the payload was truncated',
        v_row.fname, length(v_src), v_row.stmt_chars;
    end if;
    if md5(v_src) <> v_row.stmt_md5 then
      raise exception '% checksum mismatch, md5 % — the decoded text is not the migration', v_row.fname, md5(v_src);
    end if;
    if position('create or replace function ' || v_row.fname in lower(v_src)) = 0 then
      raise exception '% payload does not start with its CREATE statement', v_row.fname;
    end if;

    execute v_src;
    raise notice '% replaced — % characters, body md5 %', v_row.fname, length(v_src), v_row.prosrc_md5;
  end loop;
end $$;

drop table if exists _mig_paste_chunks;

commit;

select x.fname,
       x.step,
       x.expected_body_chars,
       (select string_agg(length(p.prosrc)::text, ', ' order by length(p.prosrc))
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = x.fname)          as installed_chars,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = x.fname)           as overloads,
       case
         when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = x.fname)
           then 'MISSING'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = x.fname
                         and md5(p.prosrc) = x.expected_body_md5)
           then 'OK — latest body installed'
         else 'WRONG BODY — an older generation is still the newest one found'
       end                                                             as verdict
from (values
    ('ps_rider_deliver', 21, 2117, '9eadbbb709b8a800b85171939461ed2c'),
    ('ps_advance_order', 22, 2843, '63ddc0164133ef06de57dd0c35f64576'),
    ('ps_verify_payment', 22, 2551, '728b7e633af09eebc038275f52a796a1')
) as x(fname, step, expected_body_chars, expected_body_md5)
order by x.step, x.fname;
