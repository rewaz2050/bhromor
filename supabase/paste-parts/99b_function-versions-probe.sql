-- PROBE B — which GENERATION of each redefined function is installed?
-- READ-ONLY, changes nothing. Run PROBE A first.
--
-- 6 functions are defined by more than one migration, so "it exists" says
-- nothing — the body does. Each row compares md5(prosrc) of what is installed
-- with the NEWEST definition in supabase/migrations:
--
--   latest     the newest body is installed, nothing to do
--   OUTDATED   an older generation is in, and it names the step it came from
--   MISSING    the function does not exist at all
--
-- ps_place_order alone has 9 generations (steps 4, 5, 10, 12, 14, 15, 19, 23, 30)
-- and only the newest is current — that is the one the paste-parts installed, and
-- its body md5 is a2ef2cc2ae969020c1f519858e168564.

with defs (fname, step, body_md5, body_chars) as (
  values
    ('ps_advance_order', 1, '2b13acf2f6c27b4542ab1717ee1d51fb', 1159),
    ('ps_advance_order', 5, '60cb2c4cafd4db1b2217cc3620576630', 1479),
    ('ps_advance_order', 19, 'b0dfa77e638fae7c2d82cec109cda73b', 2040),
    ('ps_advance_order', 22, '63ddc0164133ef06de57dd0c35f64576', 2843),
    ('ps_next_eligible_rider', 9, '5f1ee1b3f6bb2772031d51f419adc2c0', 656),
    ('ps_next_eligible_rider', 29, 'a34f95b4297ff93d7bac7b78e23ba3de', 1978),
    ('ps_place_order', 4, 'c84f52e1decf126a582d79fa1fb4e3fa', 4897),
    ('ps_place_order', 5, 'd58c37065fd9195ddbaf2ee5403f14c9', 5548),
    ('ps_place_order', 10, '002bdd7db268706fcb63011c640191e8', 9851),
    ('ps_place_order', 12, 'c4ee963b390683bfda46a0315a24be0b', 10159),
    ('ps_place_order', 14, 'd8074df2016df7c2510ea073c0d2f0f5', 9073),
    ('ps_place_order', 15, 'd45d9cd50615e42ebcc972c098202a7a', 16716),
    ('ps_place_order', 19, '27b929519f07a67b87815a053827b00e', 18328),
    ('ps_place_order', 23, '5a314bec836cdd0b713788946dfa3342', 20290),
    ('ps_place_order', 30, 'a2ef2cc2ae969020c1f519858e168564', 21090),
    ('ps_release_on_cancel', 4, '39163ab8edea0f2697bc22de5dd4b98b', 305),
    ('ps_release_on_cancel', 10, '39163ab8edea0f2697bc22de5dd4b98b', 305),
    ('ps_release_on_cancel', 12, '39163ab8edea0f2697bc22de5dd4b98b', 305),
    ('ps_release_on_cancel', 14, '39163ab8edea0f2697bc22de5dd4b98b', 305),
    ('ps_rider_deliver', 8, '6436784cb9dccf735ce6c33a996dda12', 1350),
    ('ps_rider_deliver', 21, '9eadbbb709b8a800b85171939461ed2c', 2117),
    ('ps_verify_payment', 19, 'b816e405e1886826e143f788f6b81294', 2061),
    ('ps_verify_payment', 22, '728b7e633af09eebc038275f52a796a1', 2551)
),
latest as (select fname, max(step) as step from defs group by fname),
installed as (
  select p.proname as fname, md5(p.prosrc) as body_md5, length(p.prosrc) as body_chars
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select l.fname,
       d.step                                     as newest_step,
       d.body_chars                               as expected_chars,
       i.body_chars                               as installed_chars,
       case
         when i.fname is null then 'MISSING'
         when i.body_md5 = d.body_md5 then 'latest'
         else 'OUTDATED — installed body is from step ' ||
              lpad(coalesce((select d2.step::text from defs d2
                             where d2.fname = l.fname and d2.body_md5 = i.body_md5), '?'), 2, '0')
       end                                        as verdict
from latest l
join defs d on d.fname = l.fname and d.step = l.step
left join installed i on i.fname = l.fname
order by (i.body_md5 is distinct from d.body_md5) desc, l.fname;
