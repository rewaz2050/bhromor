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
 payment text default 'cod', payment_status text default 'verified', updated_at timestamptz
);
create table delivery_assignments (
 id uuid primary key default gen_random_uuid(), order_id uuid references orders(id),
 rider_id uuid references riders(id), state text default 'offered',
 offered_at timestamptz default now(), expires_at timestamptz default now() + interval '90 seconds'
);
create table order_status_history(order_id uuid, status text, note text, changed_by uuid);
create function ps_rider_id() returns uuid language sql as $$
 select nullif(current_setting('test.rider', true), '')::uuid $$;
create function ps_is_admin() returns boolean language sql as $$ select true $$;
create function ps_rider_on_shift(r riders) returns boolean language sql as $$ select r.on_shift $$;
`);
const migration = readFileSync(new URL('../migrations/202609250001_area_broadcast_dispatch.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration); // repeat-safe
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
const sweep = () => db.query('select ps_expire_stale_offers()');
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
 assert.equal(await scalar("select has_function_privilege('authenticated','ps_expire_stale_offers()','execute')"),false);
 assert.equal(await scalar("select has_function_privilege('authenticated','ps_rider_accept(uuid)','execute')"),true);
 await db.query("update delivery_assignments set state='picked_up' where order_id=$1 and state='accepted'",[o]);
 await db.query("update delivery_assignments set state='delivered' where order_id=$1 and state='picked_up'",[o]);
 assert.equal(await scalar('select current_load from riders where id=$1',[a]),0);
 assert.equal(await scalar('select total_deliveries from riders where id=$1',[a]),1);
 console.log('PASS: RPC grants and delivery load bookkeeping');
} finally { await db.close(); }
