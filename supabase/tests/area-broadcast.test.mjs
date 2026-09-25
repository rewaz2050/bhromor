/** SQL integration tests against embedded PostgreSQL. Run: npm run test:dispatch.
 * Minimal pre-migration schema isolates dispatch; this is not a substitute
 * for the two-session race test on a staging Supabase database.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table riders (
 id uuid primary key default gen_random_uuid(), status text default 'active',
 is_online boolean default true, zone_ids text[] default '{town}',
 cash_in_hand int default 0, current_load int default 0, total_deliveries int default 0,
 on_shift boolean default true
);
create table orders (
 id uuid primary key default gen_random_uuid(), status text default 'confirmed',
 is_pickup boolean default false, rider_id uuid, zone_id text default 'town',
 payment text default 'cod', payment_status text default 'verified', updated_at timestamptz,
 total int default 0, delivery_code text,
 delivery_proof_url text, delivery_proof_uploaded_at timestamptz,
 delivery_code_attempts int default 0, delivery_code_locked_until timestamptz
);
create table delivery_assignments (
 id uuid primary key default gen_random_uuid(), order_id uuid references orders(id),
 rider_id uuid references riders(id), state text default 'offered',
 offered_at timestamptz default now(), expires_at timestamptz default now() + interval '90 seconds'
);
create table order_status_history(order_id uuid, status text, note text, changed_by uuid);
create table rider_settlements (
 id uuid primary key default gen_random_uuid(), rider_id uuid references riders(id),
 amount int default 0, method text default 'cash', reference text default '',
 settled_by uuid, settled_at timestamptz default now()
);
create function ps_rider_id() returns uuid language sql as $$
 select nullif(current_setting('test.rider', true), '')::uuid $$;
create function ps_is_admin() returns boolean language sql as $$ select true $$;
create function ps_rider_on_shift(r riders) returns boolean language sql as $$ select r.on_shift $$;
`);
const root = new URL('../migrations/', import.meta.url);
await db.exec('create publication supabase_realtime;');
for (const f of ['202609250001_area_broadcast_dispatch.sql','202609250002_dispatch_cancel_guard.sql','202609250003_dispatch_withdraw_resume.sql','202609250004_settle_claims.sql','202609250005_delivery_pin_lockout.sql','202609250006_dispatch_health.sql','202609250007_realtime_offers.sql']) {
 const sql = readFileSync(new URL(f, root), 'utf8');
 await db.exec(sql);
 await db.exec(sql); // repeat-safe
}
await db.exec(`
create trigger trg_orders_auto_dispatch after update on orders
 for each row execute function ps_auto_dispatch_ready_order();
create trigger trg_assignments_track_load after insert or update or delete on delivery_assignments
 for each row execute function ps_track_rider_load();
`);
const rows = async (sql, args=[]) => (await db.query(sql,args)).rows;
const scalar = async (sql, args=[]) => Object.values((await rows(sql,args))[0])[0];
const rider = async (values='') => scalar(`insert into riders ${values || 'default values'} returning id`);
const order = async (values='') => scalar(`insert into orders ${values || 'default values'} returning id`);
const ready = async id => db.query(`update orders set status='ready-for-pickup' where id=$1`, [id]);
const offers = id => rows(`select * from delivery_assignments where order_id=$1 and state='offered' order by rider_id`,[id]);
const login = id => db.query(`select set_config('test.rider',$1,false)`,[id]);
const accept = id => db.query('select ps_rider_accept($1)',[id]);
// Forced sweeps: the app path is throttled (one real sweep per 10s), and the
// throttle itself is covered separately below.
const sweep = () => db.query('select ps_expire_stale_offers(true)');
try {
 const a=await rider(), b=await rider();
 await rider("(status) values ('pending')");
 await rider("(status) values ('suspended')");
 await rider("(is_online) values (false)");
 await rider("(zone_ids) values ('{outside}')");
 await rider("(on_shift) values (false)");
 await rider("(cash_in_hand) values (500000)");
 await rider("(current_load) values (2)");
 const o=await order(); await ready(o);
 assert.equal((await offers(o)).length,2, 'broadcast only to eligible area riders');
 assert.equal(await scalar('select current_load from riders where id=$1',[a]),0,'invites do not occupy capacity');
 await sweep(); assert.equal((await offers(o)).length,2,'idempotent sweep');
 const invitation=(await offers(o)).find(x=>x.rider_id===a);
 await login(b); await assert.rejects(accept(invitation.id), /forbidden/);
 await login(a); await accept(invitation.id);
 await login(b);
 const loser=await scalar('select id from delivery_assignments where order_id=$1 and rider_id=$2',[o,b]);
 await assert.rejects(accept(loser),/offer no longer available/);
 assert.equal(await scalar('select rider_id from orders where id=$1',[o]),a);
 assert.equal((await offers(o)).length,0,'losing offers withdrawn');
 assert.equal(await scalar('select current_load from riders where id=$1',[a]),1);
 assert.equal(await scalar('select count(*)::int from order_status_history where order_id=$1',[o]),1);
 console.log('PASS: eligibility, broadcast, idempotence, ownership and one winner');

 const pickup=await order('(is_pickup) values (true)'); await ready(pickup);
 const wallet=await order("(payment,payment_status) values ('bkash','pending_verification')"); await ready(wallet);
 assert.equal((await offers(pickup)).length,0); assert.equal((await offers(wallet)).length,0);
 const missing=await order("(zone_id) values ('new-area')"); await ready(missing);
 assert.equal((await offers(missing)).length,0);
 const late=await rider("(zone_ids) values ('{new-area}')"); await sweep();
 assert.equal((await offers(missing))[0].rider_id,late);
 console.log('PASS: pickup/payment exclusions and late rider auto-retry');

 const expired=await order(); await ready(expired);
 const expiredOffer=(await offers(expired)).find(x=>x.rider_id===b);
 await db.query("update delivery_assignments set expires_at=now()-interval '1 second' where id=$1",[expiredOffer.id]);
 await login(b); await assert.rejects(accept(expiredOffer.id),/offer no longer available/);
 await sweep(); assert.equal(await scalar('select state from delivery_assignments where id=$1',[expiredOffer.id]),'expired');
 await db.query("update delivery_assignments set offered_at=now()-interval '6 minutes' where id=$1",[expiredOffer.id]);
 await sweep(); assert.ok((await offers(expired)).some(x=>x.rider_id===b),'expired offer retried after cooldown');
 const decline=(await offers(expired)).find(x=>x.rider_id===b);
 await db.query('select ps_rider_reject($1)',[decline.id]); await sweep();
 assert.ok(!(await offers(expired)).some(x=>x.rider_id===b),'decline persists');
 assert.ok((await offers(expired)).some(x=>x.rider_id===a),'decline does not withdraw others');
 console.log('PASS: strict expiry, cooldown retries and individual decline');

 const manual=await order(); await ready(manual);
 await db.query('select ps_assign_batch_to_rider($1,$2)',[b,[manual]]);
 await sweep(); assert.equal((await offers(manual)).length,1);
 assert.equal((await offers(manual))[0].rider_id,b);
 await login(b); await accept((await offers(manual))[0].id);
 assert.equal(await scalar('select ps_assign_batch_to_rider($1,$2)',[a,[manual]]),0,'manual cannot steal accepted work');
 const stale=await order(); await ready(stale);
 const staleOffer=(await offers(stale)).find(x=>x.rider_id===b);
 await db.query('update riders set is_online=false where id=$1',[b]);
 await assert.rejects(accept(staleOffer.id),/rider not available/);
 await db.query('update riders set is_online=true,current_load=2 where id=$1',[b]);
 await assert.rejects(accept(staleOffer.id),/rider not available/);
 console.log('PASS: exclusive manual fallback, no stealing, accept-time eligibility');

 assert.equal(await scalar("select has_function_privilege('anon','ps_broadcast_order(uuid)','execute')"),false);
 assert.equal(await scalar("select has_function_privilege('authenticated','ps_expire_stale_offers(boolean)','execute')"),false);
 assert.equal(await scalar("select has_function_privilege('authenticated','ps_rider_accept(uuid)','execute')"),true);
 assert.equal(await scalar("select has_function_privilege('anon','ps_rider_deliver(uuid,text,text)','execute')"),false);
 assert.equal(await scalar("select has_function_privilege('anon','ps_rider_settle(text,text)','execute')"),false);
 await db.query("update delivery_assignments set state='picked_up' where order_id=$1 and state='accepted'",[o]);
 await db.query("update delivery_assignments set state='delivered' where order_id=$1 and state='picked_up'",[o]);
 assert.equal(await scalar('select current_load from riders where id=$1',[a]),0);
 assert.equal(await scalar('select total_deliveries from riders where id=$1',[a]),1);
 console.log('PASS: RPC grants and delivery load bookkeeping');

 // Fresh legs for the resume/claim/lockout scenarios below.
 await db.query('update riders set current_load=0 where id=$1',[b]);

 const resume=await order(); await ready(resume);
 assert.equal((await offers(resume)).length,2,'resume setup: two invitations');
 assert.equal(await scalar('select ps_assign_batch_to_rider($1,$2)',[b,[resume]]),1);
 await sweep(); assert.equal((await offers(resume)).length,1,'manual stays exclusive');
 assert.equal((await offers(resume))[0].rider_id,b);
 await db.query("update delivery_assignments set expires_at=now()-interval '1 second' where order_id=$1 and state='offered'",[resume]);
 await sweep();
 const resumed=await offers(resume);
 assert.ok(resumed.some(x=>x.rider_id===a),'superseded rider re-invited at once after manual expiry');
 assert.ok(!resumed.some(x=>x.rider_id===b),'lapsed manual recipient cools down');
 console.log('PASS: manual expiry resumes broadcast to the area immediately');

 const drawn=await order(); await ready(drawn);
 const drawOffer=(await offers(drawn)).find(x=>x.rider_id===a);
 await db.query('select ps_cancel_assignment($1)',[drawOffer.id]);
 await sweep();
 assert.ok(!(await offers(drawn)).some(x=>x.rider_id===a),'withdrawn rider not instantly re-invited');
 assert.ok((await offers(drawn)).some(x=>x.rider_id===b),'withdraw keeps other invitations');
 await db.query("update delivery_assignments set offered_at=now()-interval '6 minutes' where id=$1",[drawOffer.id]);
 await sweep();
 assert.ok((await offers(drawn)).some(x=>x.rider_id===a),'withdrawn rider eligible again after cooldown');
 console.log('PASS: admin withdraw cools down, then resumes');

 await assert.rejects(db.query('select ps_offer_order($1)',[wallet]),/payment not verified/);
 assert.equal(await scalar('select ps_assign_batch_to_rider($1,$2)',[b,[wallet]]),0,'manual skips unverified wallet orders');
 console.log('PASS: manual dispatch refuses unverified wallet orders');

 await db.query("update riders set cash_in_hand=10000 where id=$1",[a]);
 await login(a);
 const claim=(await rows("select * from ps_rider_settle('bkash','TRX123')"))[0];
 assert.equal(claim.status,'pending');
 assert.equal(await scalar('select cash_in_hand from riders where id=$1',[a]),10000,'claim does not move cash');
 await assert.rejects(db.query("select ps_rider_settle('cash','')"),/settle already pending/);
 await db.query("select ps_admin_settle_rider($1,'cash','')",[a]);
 assert.equal(await scalar('select cash_in_hand from riders where id=$1',[a]),0);
 assert.equal(await scalar("select status from rider_settle_claims where rider_id=$1 order by created_at desc limit 1",[a]),'approved');
 assert.equal(await scalar('select count(*)::int from rider_settlements where rider_id=$1',[a]),1);
 await db.query("update riders set cash_in_hand=5000 where id=$1",[b]);
 await login(b);
 await db.query("select ps_rider_settle('cash','')");
 await db.query("select ps_admin_reject_settle($1,'money never arrived')",[b]);
 assert.equal(await scalar("select status from rider_settle_claims where rider_id=$1 order by created_at desc limit 1",[b]),'rejected');
 assert.equal(await scalar('select cash_in_hand from riders where id=$1',[b]),5000,'reject keeps the balance');
 console.log('PASS: settle claims need staff approval');

 const pin=await order(); await ready(pin);
 const pinOffer=(await offers(pin)).find(x=>x.rider_id===a);
 await login(a); await accept(pinOffer.id);
 await db.query("update delivery_assignments set state='picked_up' where id=$1",[pinOffer.id]);
 await db.query("update orders set delivery_code='1234' where id=$1",[pin]);
 const check=(code)=>scalar('select ps_rider_deliver_check($1,$2)',[pinOffer.id,code]);
 for (let i=0;i<4;i++) assert.equal(await check('0000'),'mismatch');
 assert.equal(await scalar('select delivery_code_attempts from orders where id=$1',[pin]),4,'wrong codes persist their count');
 assert.equal(await check('0000'),'locked');
 assert.equal(await check('1234'),'locked','lock covers even the right code');
 await assert.rejects(db.query("select ps_rider_deliver($1,'1234',null)",[pinOffer.id]),/delivery code locked/);
 await db.query("update orders set delivery_code_locked_until=now()-interval '1 minute' where id=$1",[pin]);
 assert.equal(await check('1234'),'ok');
 await db.query("select ps_rider_deliver($1,'1234',null)",[pinOffer.id]);
 assert.equal(await scalar('select status from orders where id=$1',[pin]),'delivered');
 assert.equal(await scalar('select delivery_code_attempts from orders where id=$1',[pin]),0);
 console.log('PASS: PIN lockout after 5 wrong codes, reset on success');

 await db.query('select ps_expire_stale_offers(false)');
 assert.equal(await scalar('select ps_expire_stale_offers(false)'),0,'back-to-back sweeps throttle to one');
 const probe=(await rows('select ps_checkout_health() as h'))[0].h;
 assert.equal(probe.version,'202609250007');
 assert.equal(probe.broadcast_resume_ok,true);
 assert.equal(probe.settle_claims_ok,true);
 assert.equal(probe.pin_lockout_ok,true);
 assert.equal(probe.realtime_offers_ok,true);
 assert.equal(await scalar("select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and tablename='delivery_assignments'"),1,'published exactly once');
 console.log('PASS: sweep throttle and dispatch health probe');
} finally { await db.close(); }
