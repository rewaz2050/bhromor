# 2026-09-25 rider/dispatch fixes — safe pastes

The SQL Editor cuts big pastes; a cut inside a function body then runs as
top-level SQL and reports `ERROR: 42P01: relation "v_order" does not exist`
(v_order is a plpgsql **variable**, not a table — that error always means a
paste got truncated, never that a migration is wrong).

Paste the 23 files here **in order** (01 → 23), one whole
file per paste, RUN after each. Parts marked **base64 chunk** must land whole
(the assembler refuses to run until every chunk checks out). Every part is
repeat-safe: not sure how far a previous attempt got? Start again from 01.

After the last part, run `supabase/diagnose.sql` — rows **37…37i must all
show `present = true`**.

| # | paste file | source migration | what |
|---|---|---|---|
| 01 | 01_area_broadcast_dispatch-sql.sql | 202609250001_area_broadcast_dispatch.sql | readable SQL |
| 02 | 02_area_broadcast_dispatch-sql.sql | 202609250001_area_broadcast_dispatch.sql | readable SQL |
| 03 | 03_area_broadcast_dispatch-sql.sql | 202609250001_area_broadcast_dispatch.sql | readable SQL |
| 04 | 04_dispatch_cancel_guard-sql.sql | 202609250002_dispatch_cancel_guard.sql | readable SQL |
| 05 | 05_dispatch_withdraw_resume-sql.sql | 202609250003_dispatch_withdraw_resume.sql | readable SQL |
| 06 | 06_dispatch_withdraw_resume-sql.sql | 202609250003_dispatch_withdraw_resume.sql | readable SQL |
| 07 | 07_dispatch_withdraw_resume-sql.sql | 202609250003_dispatch_withdraw_resume.sql | readable SQL |
| 08 | 08_dispatch_withdraw_resume-sql.sql | 202609250003_dispatch_withdraw_resume.sql | readable SQL |
| 09 | 09_settle_claims-sql.sql | 202609250004_settle_claims.sql | readable SQL |
| 10 | 10_settle_claims-sql.sql | 202609250004_settle_claims.sql | readable SQL |
| 11 | 11_delivery_pin_lockout-sql.sql | 202609250005_delivery_pin_lockout.sql | readable SQL |
| 12 | 12_delivery_pin_lockout-sql.sql | 202609250005_delivery_pin_lockout.sql | readable SQL |
| 13 | 13_dispatch_health-ps_checkout_health-chunk-1-3.sql | 202609250006_dispatch_health.sql | ps_checkout_health chunk 1/3 |
| 14 | 14_dispatch_health-ps_checkout_health-chunk-2-3.sql | 202609250006_dispatch_health.sql | ps_checkout_health chunk 2/3 |
| 15 | 15_dispatch_health-ps_checkout_health-chunk-3-3.sql | 202609250006_dispatch_health.sql | ps_checkout_health chunk 3/3 |
| 16 | 16_dispatch_health-ps_checkout_health-assembler.sql | 202609250006_dispatch_health.sql | ps_checkout_health assembler |
| 17 | 17_dispatch_health-sql.sql | 202609250006_dispatch_health.sql | readable SQL |
| 18 | 18_realtime_offers-sql.sql | 202609250007_realtime_offers.sql | readable SQL |
| 19 | 19_realtime_offers-ps_checkout_health-chunk-1-3.sql | 202609250007_realtime_offers.sql | ps_checkout_health chunk 1/3 |
| 20 | 20_realtime_offers-ps_checkout_health-chunk-2-3.sql | 202609250007_realtime_offers.sql | ps_checkout_health chunk 2/3 |
| 21 | 21_realtime_offers-ps_checkout_health-chunk-3-3.sql | 202609250007_realtime_offers.sql | ps_checkout_health chunk 3/3 |
| 22 | 22_realtime_offers-ps_checkout_health-assembler.sql | 202609250007_realtime_offers.sql | ps_checkout_health assembler |
| 23 | 23_realtime_offers-sql.sql | 202609250007_realtime_offers.sql | readable SQL |
