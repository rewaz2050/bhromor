/** Real PostgreSQL verification on a NEW disposable LOCAL database only.
 * PG_VERIFY_URL must point at localhost; requires permission to create databases.
 * No production data or existing database is changed. Auth service is stubbed;
 * real schema, migrations, SQL role gates, RLS and workflow functions are used.
 */
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const url = new URL(process.env.PG_VERIFY_URL || 'postgres://verification@127.0.0.1:55432/postgres');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Local verification database only');
const admin = new pg.Client({connectionString:url.href}); await admin.connect();
const name = `bhromor_verify_${Date.now()}`;
const clients=[];
const connect=async(user)=>{ const u=new URL(url);u.pathname=`/${name}`;const c=new pg.Client({connectionString:u.href});await c.connect();clients.push(c);await c.query("set statement_timeout='10s'");if(user){await c.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await c.query('set role authenticated');}return c;};
const row=async(c,sql,args=[]) => (await c.query(sql,args)).rows[0];
try {
 await admin.query(`create database ${name}`);
 for(const role of ['anon','authenticated','service_role']) {
   if(!(await row(admin,'select 1 from pg_roles where rolname=$1',[role]))) await admin.query(`create role ${role}`);
 }
 const root=await connect();
 await root.query(`create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await root.query('create publication supabase_realtime'); // mirrors Supabase (007 publishes into it)
 await root.query(readFileSync(new URL('../bootstrap-fresh.sql',import.meta.url),'utf8'));
 await root.query(`grant usage on schema public,auth to authenticated;
 grant select on all tables in schema public to authenticated;`);
 console.log('PASS full fresh bootstrap with real PostgreSQL');
 const uid=async email=>(await row(root,'insert into auth.users(email) values($1) returning id',[email])).id;
 const owner=await uid('shop@verify.invalid'), stranger=await uid('other-shop@verify.invalid');
 const a=await uid('a@verify.invalid'), b=await uid('b@verify.invalid');
 const staffId=await uid('admin@verify.invalid');
 await root.query("insert into admin_users(id,role) values($1,'admin')",[staffId]);
 const staff=await connect(staffId);
 await root.query("insert into delivery_zones(id,name,charge) values('verify-zone','Verification area',0)");
 const shop=(await row(root,"insert into shops(slug,name,phone,status,is_open,zone_ids) values('verify','Test shop','01711111111','active',true,'{verify-zone}') returning id")).id;
 await root.query('insert into vendor_users(user_id,shop_id) values($1,$2)',[owner,shop]);
 const rider=async(user,phone)=>(await row(root,"insert into riders(user_id,name,phone,status,is_online,zone_ids) values($1,'Test Rider',$2,'active',true,'{verify-zone}') returning id",[user,phone])).id;
 const ra=await rider(a,'01711111112'), rb=await rider(b,'01711111113');
 const vendor=await connect(owner), other=await connect(stranger), ca=await connect(a), cb=await connect(b);
 const order=async(payment='cod')=>(await row(root,"insert into orders(customer_name,customer_phone,area,address,zone_id,subtotal,delivery_charge,total,shop_id,payment,payment_status) values('Test Customer','01711111114','Verification area','Test house','verify-zone',10000,0,10000,$1,$2,'verified') returning id,delivery_code",[shop,payment]));
 const ready=async(o)=>{await vendor.query("select ps_advance_order($1,'confirmed')",[o.id]);await vendor.query("select ps_advance_order($1,'ready-for-pickup')",[o.id]);};
 const first=await order();
 await assert.rejects(other.query("select ps_advance_order($1,'confirmed')",[first.id]),/forbidden/);
 await assert.rejects(vendor.query("select ps_advance_order($1,'delivered')",[first.id]),/forbidden/);
 await ready(first);
 const offers=(await root.query("select id,rider_id from delivery_assignments where order_id=$1 and state='offered'",[first.id])).rows;
 assert.equal(offers.length,2);
 await assert.rejects(cb.query('select ps_rider_accept($1)',[offers.find(o=>o.rider_id===ra).id]),/forbidden/);
 console.log('PASS shop permission gates, Confirm → Ready and two rider invitations');
 // Hold the shared order lock, queue both actual database sessions, release it.
 await root.query('begin'); await root.query('select id from orders where id=$1 for update',[first.id]);
 const result=Promise.allSettled([
   ca.query('select ps_rider_accept($1)',[offers.find(o=>o.rider_id===ra).id]),
   cb.query('select ps_rider_accept($1)',[offers.find(o=>o.rider_id===rb).id]),
 ]);
 await new Promise(resolve=>setTimeout(resolve,100));
 await root.query('commit');
 const outcomes=await result;
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/offer no longer available/);
 const win=await row(root,"select * from delivery_assignments where order_id=$1 and state='accepted'",[first.id]);
 const winner=win.rider_id===ra?ca:cb, loser=win.rider_id===ra?cb:ca;
 await assert.rejects(staff.query('select ps_cancel_assignment($1)',[win.id]),/only pending invitations/);
 assert.equal((await row(root,"select count(*)::int n from order_status_history where order_id=$1 and status='courier-assigned'",[first.id])).n,1);
 assert.equal((await row(root,'select rider_id from orders where id=$1',[first.id])).rider_id,win.rider_id);
 console.log('PASS two concurrent riders: one success, one rejection, one owner/history entry');
 await assert.rejects(loser.query('select ps_rider_pickup($1)',[win.id]),/forbidden/);
 await assert.rejects(winner.query("select ps_rider_deliver($1,'xxxx',null)",[win.id]),/delivery not allowed/);
 await winner.query('select ps_rider_pickup($1)',[win.id]);
 await assert.rejects(staff.query('select ps_cancel_assignment($1)',[win.id]),/only pending invitations/);
 assert.equal((await row(root,'select status from orders where id=$1',[first.id])).status,'out-for-delivery');
 await assert.rejects(winner.query("select ps_rider_deliver($1,'xxxx',null)",[win.id]),/delivery code mismatch/);
 await winner.query('select ps_rider_deliver($1,$2,null)',[win.id,first.delivery_code]);
 assert.equal((await row(root,'select status from orders where id=$1',[first.id])).status,'delivered');
 const money=await row(root,'select cash_in_hand,current_load,total_deliveries from riders where id=$1',[win.rider_id]);
 assert.equal(Number(money.cash_in_hand),10000);assert.equal(money.current_load,0);assert.equal(money.total_deliveries,1);
 assert.equal((await row(root,'select count(*)::int n from shop_ledger where order_id=$1',[first.id])).n,1);
 await assert.rejects(winner.query('select ps_rider_deliver($1,$2,null)',[win.id,first.delivery_code]),/delivery not allowed/);
 assert.equal(Number((await row(root,'select cash_in_hand from riders where id=$1',[win.rider_id])).cash_in_hand),10000);
 console.log('PASS pickup, wrong-code rejection, delivery, COD balance, shop ledger and duplicate delivery guard');
 const claim=await row(winner,"select * from ps_rider_settle('bkash','WALLET-TRX-1')");
 assert.equal(claim.status,'pending');
 assert.equal(Number((await row(root,'select cash_in_hand from riders where id=$1',[win.rider_id])).cash_in_hand),10000);
 await assert.rejects(winner.query("select ps_rider_settle('cash','')"),/settle already pending/);
 await staff.query("select ps_admin_settle_rider($1,'cash','')",[win.rider_id]);
 assert.equal(Number((await row(root,'select cash_in_hand from riders where id=$1',[win.rider_id])).cash_in_hand),0);
 assert.equal((await row(root,"select status from rider_settle_claims where rider_id=$1 order by created_at desc limit 1",[win.rider_id])).status,'approved');
 console.log('PASS rider settle files a claim; staff approval moves the cash');
 const walletOrder=await order('bkash'); await ready(walletOrder);
 await root.query("update orders set payment_status='pending_verification' where id=$1",[walletOrder.id]);
 // Batch assign is service-only (the app calls it on the service client
 // after staffRoute verifies the session), so the superuser issues it here.
 assert.equal((await row(root,'select ps_assign_batch_to_rider($1,$2)',[rb,[walletOrder.id]])).ps_assign_batch_to_rider,0);
 console.log('PASS manual dispatch skips orders whose wallet payment is unverified');
 const pin=await order(); await ready(pin);
 const pinOffer=await row(root,"select id from delivery_assignments where order_id=$1 and rider_id=$2 and state='offered'",[pin.id,win.rider_id]);
 await winner.query('select ps_rider_accept($1)',[pinOffer.id]);
 await winner.query('select ps_rider_pickup($1)',[pinOffer.id]);
 const pinCheck=async code=>(await row(winner,'select ps_rider_deliver_check($1,$2)',[pinOffer.id,code])).ps_rider_deliver_check;
 for(let i=0;i<4;i++) assert.equal(await pinCheck('xxxx'),'mismatch');
 assert.equal(await pinCheck('xxxx'),'locked');
 assert.equal(await pinCheck(pin.delivery_code),'locked');
 await root.query("update orders set delivery_code_locked_until=now()-interval '1 minute' where id=$1",[pin.id]);
 assert.equal(await pinCheck(pin.delivery_code),'ok');
 await winner.query('select ps_rider_deliver($1,$2,null)',[pinOffer.id,pin.delivery_code]);
 assert.equal((await row(root,'select status from orders where id=$1',[pin.id])).status,'delivered');
 console.log('PASS PIN check counts wrong codes, locks on the 5th, resets on success');
 const probe=(await row(root,'select ps_checkout_health() h')).h;
 assert.equal(probe.version,'202609250007');
 assert.equal(probe.broadcast_resume_ok,true);
 assert.equal(probe.settle_claims_ok,true);
 assert.equal(probe.pin_lockout_ok,true);
 assert.equal(probe.realtime_offers_ok,true);
 console.log('PASS dispatch health probe flags the new migrations');
 // Same rider races for two jobs with one remaining slot. Both invitations
 // are created while eligible; capacity is rechecked under the rider lock.
 const warm=await order();await ready(warm);
 const warmOffer=await row(root,"select id from delivery_assignments where order_id=$1 and rider_id=$2 and state='offered'",[warm.id,ra]);
 await ca.query('select ps_rider_accept($1)',[warmOffer.id]);
 const x=await order(), y=await order();await ready(x);await ready(y);
 const xOffer=await row(root,"select id from delivery_assignments where order_id=$1 and rider_id=$2 and state='offered'",[x.id,ra]);
 const yOffer=await row(root,"select id from delivery_assignments where order_id=$1 and rider_id=$2 and state='offered'",[y.id,ra]);
 const ca2=await connect(a);
 await root.query('begin');await root.query('select id from riders where id=$1 for update',[ra]);
 const capacity=Promise.allSettled([ca.query('select ps_rider_accept($1)',[xOffer.id]),ca2.query('select ps_rider_accept($1)',[yOffer.id])]);
 await new Promise(resolve=>setTimeout(resolve,100));await root.query('commit');
 const caps=await capacity;assert.equal(caps.filter(r=>r.status==='fulfilled').length,1);
 assert.match(caps.find(r=>r.status==='rejected').reason.message,/rider not available/);
 assert.equal((await row(root,'select current_load from riders where id=$1',[ra])).current_load,2);
 console.log('PASS concurrent rider capacity: cannot exceed two active trips');
 const cancelOrder=await order(); await ready(cancelOrder);
 const cancelOffer=await row(root,"select id from delivery_assignments where order_id=$1 and state='offered'",[cancelOrder.id]);
 await staff.query('select ps_cancel_assignment($1)',[cancelOffer.id]);
 assert.equal((await row(root,'select state from delivery_assignments where id=$1',[cancelOffer.id])).state,'cancelled');
 console.log('PASS admin can withdraw invitations but cannot strand accepted or picked-up trips');
} finally {
 await Promise.all(clients.map(c=>c.end()));
 await admin.query(`drop database if exists ${name}`); await admin.end();
}
