-- ============================================================================
-- VERIFY — P2 batch (go-live steps 27–30). One paste, expect 6 × OK.
-- Run this AFTER supabase/pending-p2-final.sql in the same SQL editor.
-- ============================================================================
select 'fabric columns (products)'   as check_,
       case when exists (select 1 from information_schema.columns
                         where table_name='products' and column_name='fabric_gsm')
       then 'OK' else 'MISSING — run 202609140012' end as state
union all
select 'campaign tag (newsletter)',
       case when exists (select 1 from information_schema.columns
                         where table_name='newsletter_subscribers' and column_name='campaign')
       then 'OK' else 'MISSING — run 202609140013' end
union all
select 'rider shift columns',
       case when exists (select 1 from information_schema.columns
                         where table_name='riders' and column_name='avail_from_hour')
       then 'OK' else 'MISSING — run 202609140014' end
union all
select 'ps_next_eligible_rider enforces shifts',
       case when exists (select 1 from pg_proc where proname='ps_next_eligible_rider'
                         and prosrc like '%avail_from_hour%')
       then 'OK' else 'MISSING — 0014 ran but old function remains; re-run 0014' end
union all
select 'memberships table + orders.is_plus',
       case when exists (select 1 from information_schema.tables where table_name='memberships')
             and exists (select 1 from information_schema.columns
                         where table_name='orders' and column_name='is_plus')
       then 'OK' else 'MISSING — run 202609140015' end
union all
select 'ps_place_order applies the + waiver',
       case when exists (select 1 from pg_proc where proname='ps_place_order'
                         and prosrc like '%v_plus%')
       then 'OK' else 'MISSING — the RPC was not swapped; re-run 202609140015 (whole file)' end
order by 1;
