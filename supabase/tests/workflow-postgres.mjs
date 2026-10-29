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
 // Supabase grants these explicitly via default privileges. Plain PostgreSQL
 // otherwise has only PUBLIC EXECUTE, which later hardening correctly revokes.
 await root.query('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role');
 // Simulate Supabase table defaults BEFORE the bootstrap, never re-grant
 // table SELECT afterward: that would reopen the wallet column restriction.
 await root.query('grant usage on schema public,auth to authenticated');
 await root.query('alter default privileges in schema public grant select,insert,update,delete on tables to authenticated');
 await root.query(readFileSync(new URL('../bootstrap-fresh.sql',import.meta.url),'utf8'));
 // A realistic default-grant fixture must NOT make hardened RPCs public.
 const grants=await row(root,`select bool_and(not has_function_privilege('anon',p.oid,'EXECUTE')) anon_locked
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('ps_place_order','ps_advance_order','ps_rider_accept','ps_assign_batch_to_rider')`);
 assert.equal(grants.anon_locked,true);
 const serviceOnly=await row(root,`select bool_and(not has_function_privilege('authenticated',p.oid,'EXECUTE')) locked
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('ps_place_order','ps_assign_batch_to_rider')`);
 assert.equal(serviceOnly.locked,true);
 console.log('PASS full fresh bootstrap with real PostgreSQL and hardened RPC grants');
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
 assert.equal((await row(vendor,'select count(*)::int n from orders where id=$1',[first.id])).n,1);
 assert.equal((await row(other,'select count(*)::int n from orders where id=$1',[first.id])).n,0);
 console.log('PASS shop permission gates, own-shop order RLS, Confirm → Ready and two rider invitations');
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
 // Column ACL checks on the actual full bootstrap (not a reduced schema).
 const managerId=await uid('manager@verify.invalid');
 await root.query("insert into admin_users(id,role) values($1,'manager')",[managerId]);
 const manager=await connect(managerId);
 await staff.query("select ps_admin_adjust_rider($1,1500,'Full PostgreSQL privacy fixture')",[ra]);
 for(const sql of ['select earnings_balance from riders','select * from riders','select to_jsonb(r) from riders r','select id from riders where earnings_balance>0','select id from riders order by earnings_balance']) {
   await assert.rejects(manager.query(sql),/permission denied/);
 }
 assert.equal((await row(manager,'select earnings_balance from ps_read_riders() where id=$1',[ra])).earnings_balance,null);
 assert.equal((await row(manager,'select id from riders where id=$1',[ra])).id,ra);
 const prior=Number((await row(root,'select earnings_balance from riders where id=$1',[ra])).earnings_balance);
 assert.equal(Number((await row(ca,'select earnings_balance from ps_read_riders() where id=$1',[ra])).earnings_balance),prior);
 assert.equal(Number((await row(staff,'select earnings_balance from ps_read_riders() where id=$1',[ra])).earnings_balance),prior);
 assert.equal((await row(cb,'select count(*)::int n from ps_read_riders() where id=$1',[ra])).n,0);
 await assert.rejects(manager.query('update riders set earnings_balance=999999 where id=$1',[ra]),/finance permission/);
 await assert.rejects(manager.query('update riders set is_online=false where id=$1 returning *',[ra]),/permission denied/);
 assert(await row(manager,'select ps_admin_rider_scorecards(30)')!==null);
 console.log('PASS real PostgreSQL: direct wallet/JSON/filter/sort/RETURNING blocked; Manager operational projection, Admin and own-Rider balances preserved');
 await root.query(readFileSync(new URL('../migrations/202610250005_rider_wallet_column_privacy.sql',import.meta.url),'utf8'));
 assert.equal((await row(root,"select has_column_privilege('authenticated','public.riders','earnings_balance','SELECT') allowed")).allowed,false);
 console.log('PASS real PostgreSQL: wallet-column migration is repeat-safe without re-granting table SELECT');

 await assert.rejects(manager.query("update riders set status='suspended' where id=$1",[ra]),/Admin permission/);
 await assert.rejects(manager.query('update riders set user_id=$1 where id=$2',[managerId,ra]),/Admin permission/);
 await assert.rejects(staff.query('update riders set cash_in_hand=999999 where id=$1',[ra]),/audited finance workflow/);
 await assert.rejects(root.query('update rider_earnings set amount=1 where rider_id=$1',[ra]),/financial history/);
 const retained=await rider(await uid('retained@verify.invalid'),'01711111118');
 await staff.query("select ps_admin_adjust_rider($1,100,'Retention fixture')",[retained]);
 await assert.rejects(root.query('delete from riders where id=$1',[retained]),/financial history/);
 await assert.rejects(root.query('truncate rider_earnings cascade'),/financial history/);
 console.log('PASS real PostgreSQL: rider controls, journal rewrite/deletion/cascade/TRUNCATE protection');
 // Preserve the exceptional late-verification re-netting path on old rows.
 await root.query("update shops set settlement_model='shop_wallet',wallet_bkash='01711111111' where id=$1",[shop]);
 const late=await order('bkash');
 await root.query("update orders set payment_status='pending_verification',status='delivered' where id=$1",[late.id]);
 const beforeLedger=await row(root,'select payable,collected_by_shop from shop_ledger where order_id=$1',[late.id]);
 await vendor.query("select ps_verify_payment($1,'verified','Legacy receipt checked')",[late.id]);
 const afterLedger=await row(root,'select payable,collected_by_shop from shop_ledger where order_id=$1',[late.id]);
 assert.equal(Number(afterLedger.collected_by_shop),10000);
 assert.equal(Number(afterLedger.payable),Number(beforeLedger.payable)-10000);
 await assert.rejects(staff.query('update shop_ledger set payable=0 where order_id=$1',[late.id]),/ledger rewrite/);
 console.log('PASS real PostgreSQL: legitimate shop-wallet re-netting survives; direct privileged ledger rewrite denied');
 const superA=await uid('super-a@verify.invalid'),superB=await uid('super-b@verify.invalid');
 await root.query("insert into admin_users(id,role) values($1,'super_admin'),($2,'super_admin')",[superA,superB]);
 const serviceA=await connect(),serviceB=await connect();
 await serviceA.query('set role service_role');await serviceB.query('set role service_role');
 await assert.rejects(staff.query("select ps_change_staff_role($1,$2,'admin')",[superA,managerId]),/permission denied/);
 const race=await Promise.allSettled([
   serviceA.query("select ps_change_staff_role($1,$2,'admin')",[superA,superB]),
   serviceB.query("select ps_change_staff_role($1,$2,'admin')",[superB,superA]),
 ]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await row(root,"select count(*)::int n from admin_users where role='super_admin'")).n,1);
 const accessAudit=(await root.query('select * from staff_role_audit')).rows;
 assert.equal(accessAudit.length,1);assert([superA,superB].includes(accessAudit[0].actor_id));
 await assert.rejects(root.query('delete from staff_role_audit'),/financial history/);
 console.log('PASS real PostgreSQL: concurrent cross-demotions serialize, retain Super Admin and produce immutable actor-bound audit');


 // New PIN boundary: same real schema/RLS, including enum-backed staff roles.
 const survivor=(await row(root,"select id from admin_users where role='super_admin' limit 1")).id;
 const superStaff=await connect(survivor);
 for(const c of [manager,staff,superStaff,vendor,ca,other]) {
   for(const sql of ['select delivery_code from orders','select * from orders','select to_jsonb(o) from orders o',"select id from orders where delivery_code='4821'"])
     await assert.rejects(c.query(sql),/permission denied/);
 }
 assert.equal((await row(vendor,'select delivery_code from order_operations where id=$1',[first.id])).delivery_code,null);
 assert.equal((await row(other,'select count(*)::int n from order_operations where id=$1',[first.id])).n,0);
 await assert.rejects(serviceA.query("select ps_advance_order_internal($1,'delivered',null)",[first.id]),/permission denied/);
 console.log('PASS real PostgreSQL: all ranks/Owner/Rider PIN ACL denial, invoker-view shop isolation and private-machine service EXECUTE denial');
 const shopStaffId=await uid('shop-staff@verify.invalid');
 await root.query("insert into vendor_users(user_id,shop_id,role) values($1,$2,'staff')",[shopStaffId,shop]);
 const shopStaff=await connect(shopStaffId);
 await assert.rejects(shopStaff.query('select delivery_code from orders'),/permission denied/);
 assert.equal((await row(shopStaff,'select delivery_code from order_operations where id=$1',[first.id])).delivery_code,null);
 const staffOrder=await order();
 await shopStaff.query("select ps_advance_order($1,'confirmed')",[staffOrder.id]);
 await shopStaff.query("select ps_advance_order($1,'preparing')",[staffOrder.id]);
 await assert.rejects(shopStaff.query('select ps_collect_pickup_order($1,$2)',[staffOrder.id,staffOrder.delivery_code]),/forbidden/);
 console.log('PASS real PostgreSQL: default Shop Staff retains own fulfilment and safe order reads, without stored PIN or platform-counter authority');
 // A platform role and an independent shop membership can coexist. The shop
 // lane must stay within that shop; the platform lane keeps its own guards.
 const mixedId=await uid('mixed-owner@verify.invalid');
 await root.query("insert into admin_users(id,role) values($1,'manager')",[mixedId]);
 const mixedShop=(await row(root,"insert into shops(slug,name,phone,status,is_open,zone_ids) values('mixed','Mixed shop','01711111119','active',true,'{verify-zone}') returning id")).id;
 await root.query("insert into vendor_users(user_id,shop_id,role) values($1,$2,'owner')",[mixedId,mixedShop]);
 const mixed=await connect(mixedId);
 const mixedOrder=async()=>row(root,"insert into orders(customer_name,customer_phone,area,address,zone_id,subtotal,delivery_charge,total,shop_id,payment,payment_status) values('Mixed Customer','01711111120','Verification area','Test house','verify-zone',10000,0,10000,$1,'cod','verified') returning id,delivery_code",[mixedShop]);
 const mine=await mixedOrder();
 const confirmed=await row(mixed,"select (ps_vendor_advance_order($1,'confirmed','[Shop fulfilment override] forged note')).delivery_code pin",[mine.id]);
 assert.equal(confirmed.pin,null);
 assert.equal((await row(root,"select count(*)::int n from order_status_history where order_id=$1 and coalesce(note,'') like '%forged%'",[mine.id])).n,0);
 await mixed.query("select ps_vendor_advance_order($1,'preparing',null)",[mine.id]);
 assert.equal((await row(root,'select status from orders where id=$1',[mine.id])).status,'preparing');
 await assert.rejects(mixed.query("select ps_vendor_advance_order($1,'confirmed',null)",[first.id]),/forbidden/);
 const mixedPlatform=await mixedOrder();
 await assert.rejects(mixed.query("select ps_advance_order($1,'confirmed',null)",[mixedPlatform.id]),/forbidden/);
 const mixedCancel=await mixedOrder();
 await mixed.query("select ps_vendor_advance_order($1,'confirmed',null)",[mixedCancel.id]);
 // An own-shop Owner keeps the ordinary owner entitlement (including
 // cancellation); a Staff membership still needs the explicit grant.
 await mixed.query("select ps_vendor_advance_order($1,'cancelled',null)",[mixedCancel.id]);
 assert.equal((await row(root,'select status from orders where id=$1',[mixedCancel.id])).status,'cancelled');
 await assert.rejects(mixed.query("select ps_advance_order_scoped($1,'confirmed',null,true)",[first.id]),/permission denied/);
 const serviceMixed=await connect(); await serviceMixed.query('set role service_role');
 await assert.rejects(serviceMixed.query("select ps_advance_order_scoped($1,'confirmed',null,true)",[first.id]),/permission denied/);
 console.log('PASS real PostgreSQL: Manager with own-shop membership fulfils only that shop through the scoped entry; platform/reason, cancellation, foreign and private-machine guards stay intact');
 // Same-actor finance decisions: a second Admin must do the deciding.
 const selfAdminId=await uid('self-admin@verify.invalid');
 const otherAdminId=await uid('other-admin@verify.invalid');
 await root.query("insert into admin_users(id,role) values($1,'admin'),($2,'admin')",[selfAdminId,otherAdminId]);
 const selfRider=(await row(root,"insert into riders(user_id,name,phone,status,is_online,zone_ids) values($1,'Self Admin Rider','01711111121','active',true,'{}') returning id",[selfAdminId])).id;
 const selfShop=(await row(root,"insert into shops(slug,name,phone,status,is_open,zone_ids) values('self-admin','Self owned shop','01711111122','active',true,'{verify-zone}') returning id")).id;
 await root.query("insert into vendor_users(user_id,shop_id,role) values($1,$2,'owner')",[selfAdminId,selfShop]);
 const ledgerOrder=(await row(root,"insert into orders(customer_name,customer_phone,area,address,zone_id,subtotal,delivery_charge,total,shop_id,payment,payment_status) values('Ledger Customer','01711111123','Verification area','Test house','verify-zone',10000,0,10000,$1,'cod','verified') returning id",[selfShop])).id;
 await root.query('insert into shop_ledger(shop_id,order_id,subtotal,commission,payable) values($1,$2,100000,0,100000)',[selfShop,ledgerOrder]);
 const self=await connect(selfAdminId), otherAdmin=await connect(otherAdminId);
 const payoutId=(await row(root,"insert into rider_payout_requests(rider_id,amount,account,status) values($1,1000,'01711111121','pending') returning id",[selfRider])).id;
 await assert.rejects(self.query("select ps_admin_decide_rider_payout($1,'paid','self',null)",[payoutId]),/cannot decide your own money/);
 await otherAdmin.query("select ps_admin_decide_rider_payout($1,'paid','peer approval','TRX-SELF')",[payoutId]);
 await assert.rejects(self.query("select ps_admin_adjust_rider($1,100,'self credit')",[selfRider]),/cannot decide your own money/);
 await otherAdmin.query("select ps_admin_adjust_rider($1,100,'peer correction')",[selfRider]);
 await root.query('update riders set cash_in_hand=1000 where id=$1',[selfRider]);
 await root.query("insert into rider_settle_claims(rider_id,amount,status) values($1,1000,'pending')",[selfRider]);
 await assert.rejects(self.query("select ps_admin_settle_rider($1,'cash','self',false)",[selfRider]),/cannot decide your own money/);
 await assert.rejects(self.query("select ps_admin_reject_settle($1,'self')",[selfRider]),/cannot decide your own money/);
 await otherAdmin.query("select ps_admin_settle_rider($1,'cash','counter',false)",[selfRider]);
 const disputeId=(await row(root,"insert into rider_disputes(rider_id,category,message) values($1,'missing_fee','Fee was not credited') returning id",[selfRider])).id;
 await assert.rejects(self.query("select ps_admin_resolve_dispute($1,'approve',100,'self')",[disputeId]),/cannot decide your own money/);
 await otherAdmin.query("select ps_admin_resolve_dispute($1,'reject',0,'peer reviewed')",[disputeId]);
 await assert.rejects(root.query('insert into shop_payouts(shop_id,amount,paid_by) values($1,100,$2)',[selfShop,selfAdminId]),/own shop/);
 await root.query('insert into shop_payouts(shop_id,amount,paid_by) values($1,100,$2)',[selfShop,otherAdminId]);
 assert.equal((await row(root,'select status from rider_payout_requests where id=$1',[payoutId])).status,'paid');
 assert.equal((await row(root,'select cash_in_hand from riders where id=$1',[selfRider])).cash_in_hand,0);
 assert.equal((await row(root,'select status from rider_disputes where id=$1',[disputeId])).status,'rejected');
 await root.query(readFileSync(new URL('../migrations/202610260003_finance_self_dealing_boundary.sql',import.meta.url),'utf8'));
 for(const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
   const checks=(await root.query(readFileSync(new URL('../'+file,import.meta.url),'utf8'))).rows;
   const found=checks.filter(r=>r.migration==='202610260003_finance_self_dealing_boundary.sql');
   if(file==='check-migrations-all.sql') assert.equal(found.length,0);
   else assert(found.length===1 && found[0].status.startsWith('OK'));
 }
 console.log('PASS real PostgreSQL: self payout/custody/claim/credit/dispute decisions are refused, a peer Admin completes them, and own-shop payout recording is blocked; migration repeat-safe and recognized');
 const counter=await order();
 await root.query('update orders set is_pickup=true where id=$1',[counter.id]);
 await ready(counter);
 for(const target of ['courier-assigned','out-for-delivery','delivered']) await assert.rejects(manager.query('select ps_advance_order($1,$2)',[counter.id,target]),/pickup PIN verification required/);
 await assert.rejects(manager.query('update orders set delivery_code=$1 where id=$2 returning id',[counter.delivery_code,counter.id]),/PIN verification workflow/);
 for(let i=0;i<5;i++) assert.deepEqual((await row(manager,"select ps_collect_pickup_order($1,'xxxx') result",[counter.id])).result,{ok:false,error:'code_mismatch'});
 assert.equal(Number((await row(root,'select delivery_code_attempts from orders where id=$1',[counter.id])).delivery_code_attempts),5);
 assert.deepEqual((await row(staff,'select ps_collect_pickup_order($1,$2) result',[counter.id,counter.delivery_code])).result,{ok:false,error:'locked'});
 await root.query("update orders set delivery_code_locked_until=now()-interval '1 second' where id=$1",[counter.id]);
 await root.query('begin');await root.query('select id from orders where id=$1 for update',[counter.id]);
 const handovers=Promise.all([
   manager.query('select ps_collect_pickup_order($1,$2) result',[counter.id,counter.delivery_code]),
   staff.query('select ps_collect_pickup_order($1,$2) result',[counter.id,counter.delivery_code]),
 ]);
 await new Promise(resolve=>setTimeout(resolve,50));await root.query('commit');
 assert((await handovers).every(r=>r.rows[0].result.ok));
 assert.equal((await row(root,"select count(*)::int n from order_status_history where order_id=$1 and status='delivered'",[counter.id])).n,1);
 assert.equal((await row(root,'select count(*)::int n from shop_ledger where order_id=$1',[counter.id])).n,1);
 assert.equal((await row(root,'select count(*)::int n from rider_earnings where order_id=$1',[counter.id])).n,0);
 assert.equal((await row(root,'select count(*)::int n from order_status_history where order_id=$1 and note like $2',[counter.id,'%'+counter.delivery_code+'%'])).n,0);
 console.log('PASS real PostgreSQL: persisted five-attempt lockout, concurrent verified pickup exactly one delivery/ledger, no rider earnings or PIN in history');
 const atomic=await order();await root.query('update orders set is_pickup=true where id=$1',[atomic.id]);await ready(atomic);
 const invitation=await row(root,"insert into delivery_assignments(order_id,rider_id,state) values($1,$2,'offered') returning id",[atomic.id,ra]);
 await root.query(`create function ps_verify_fixture_fail_delivery() returns trigger language plpgsql as $$begin
   if new.id='${atomic.id}'::uuid and new.status='delivered' then raise exception 'fixture handover failure'; end if; return new; end$$;
   create trigger zz_fixture_fail_delivery before update on orders for each row execute function ps_verify_fixture_fail_delivery();`);
 await assert.rejects(manager.query('select ps_collect_pickup_order($1,$2)',[atomic.id,atomic.delivery_code]),/fixture handover failure/);
 assert.equal((await row(root,'select status from orders where id=$1',[atomic.id])).status,'ready-for-pickup');
 assert.equal((await row(root,'select state from delivery_assignments where id=$1',[invitation.id])).state,'offered');
 assert.equal((await row(root,`select count(*)::int n from order_status_history where order_id=$1 and status in ('courier-assigned','out-for-delivery','delivered')`,[atomic.id])).n,0);
 await root.query('drop trigger zz_fixture_fail_delivery on orders; drop function ps_verify_fixture_fail_delivery()');
 await manager.query('select ps_collect_pickup_order($1,$2)',[atomic.id,atomic.delivery_code]);
 assert.equal((await row(root,'select state from delivery_assignments where id=$1',[invitation.id])).state,'cancelled');
 console.log('PASS real PostgreSQL: forced final-step failure rolls back every state, history and invitation withdrawal; successful retry closes offered invitation');
 // Counter handover without the receipt. The PIN stays the only normal path;
 // Admin/Super Admin get one audited exception, and nobody else gets any.
 const pickupOrder=async(payment='cod')=>{const o=await order(payment);await root.query('update orders set is_pickup=true where id=$1',[o.id]);await ready(o);return o;};
 const noReceipt=await pickupOrder();
 const overrideReason='Customer at Traffic Point; matched national ID and the bKash transaction';
 await assert.rejects(manager.query('select ps_admin_override_pickup($1,$2)',[noReceipt.id,overrideReason]),/forbidden/);
 await assert.rejects(vendor.query('select ps_admin_override_pickup($1,$2)',[noReceipt.id,overrideReason]),/forbidden/);
 await assert.rejects(ca.query('select ps_admin_override_pickup($1,$2)',[noReceipt.id,overrideReason]),/forbidden/);
 await assert.rejects(staff.query('select ps_admin_override_pickup($1,$2)',[noReceipt.id,'lost it']),/reason required/);
 await assert.rejects(staff.query('select ps_admin_override_pickup($1,$2)',[noReceipt.id,'x'.repeat(301)]),/reason required/);
 assert.equal((await row(root,'select status from orders where id=$1',[noReceipt.id])).status,'ready-for-pickup');
 const walletHeld=await pickupOrder('bkash');
 await root.query("update orders set payment_status='pending_verification' where id=$1",[walletHeld.id]);
 await assert.rejects(staff.query('select ps_admin_override_pickup($1,$2)',[walletHeld.id,overrideReason]),/payment not verified/);
 const withRider=await pickupOrder();
 await root.query("insert into delivery_assignments(order_id,rider_id,state) values($1,$2,'accepted')",[withRider.id,ra]);
 await assert.rejects(staff.query('select ps_admin_override_pickup($1,$2)',[withRider.id,overrideReason]),/rider delivery in progress/);
 const notPickup=await order();
 await assert.rejects(staff.query('select ps_admin_override_pickup($1,$2)',[notPickup.id,overrideReason]),/not a counter pickup/);
 const notReady=await order();await root.query('update orders set is_pickup=true where id=$1',[notReady.id]);
 await assert.rejects(staff.query('select ps_admin_override_pickup($1,$2)',[notReady.id,overrideReason]),/pickup not ready/);
 assert.deepEqual((await row(staff,'select ps_admin_override_pickup($1,$2) result',[noReceipt.id,overrideReason])).result,{ok:true});
 assert.equal((await row(root,'select status from orders where id=$1',[noReceipt.id])).status,'delivered');
 const delivered=(await root.query("select note,changed_by from order_status_history where order_id=$1 and status='delivered'",[noReceipt.id])).rows;
 assert.equal(delivered.length,1);
 assert.equal(delivered[0].changed_by,staffId);
 assert(delivered[0].note.startsWith('[Pickup override — PIN not verified] '));
 assert(!delivered[0].note.includes(noReceipt.delivery_code));
 assert.deepEqual((await row(superStaff,'select ps_admin_override_pickup($1,$2) result',[noReceipt.id,overrideReason])).result,{ok:true});
 assert.equal((await row(root,"select count(*)::int n from order_status_history where order_id=$1 and status='delivered'",[noReceipt.id])).n,1);
 assert.equal((await row(root,'select count(*)::int n from shop_ledger where order_id=$1',[noReceipt.id])).n,1);
 await root.query(readFileSync(new URL('../migrations/202610290001_pickup_handover_override.sql',import.meta.url),'utf8'));
 assert.equal((await row(root,"select to_regprocedure('public.ps_admin_override_pickup(uuid,text)') is not null ok")).ok,true);
 assert.equal((await row(root,"select has_function_privilege('anon','public.ps_admin_override_pickup(uuid,text)','EXECUTE') allowed")).allowed,false);
 for(const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
   const checks=(await root.query(readFileSync(new URL('../'+file,import.meta.url),'utf8'))).rows;
   const found=checks.filter(r=>r.migration==='202610290001_pickup_handover_override.sql');
   // The "all" file only prints what is missing; the from-0928 file prints every
   // row it knows, so an applied file shows up as OK.
   if(file==='check-migrations-all.sql') assert.equal(found.length,0);
   else assert(found.length===1 && found[0].status.startsWith('OK'));
 }
 console.log('PASS real PostgreSQL: PIN stays the only normal handover; a reasoned Admin/Super Admin override closes one delivery with actor+reason in history and no PIN, while Manager/Owner/Rider, unpaid, rider-held and non-pickup orders are refused; migration repeat-safe and recognized');
 await root.query('alter table wa_outbox disable trigger trg_outbox_capability');
 const draft=await row(root,"insert into wa_outbox(order_no,phone,kind,message) values('PIN-FIXTURE','01711111111','confirmed',$1) returning id",['Track /track?id=PIN-FIXTURE&phone=01711111111&t='+'a'.repeat(24)]);
 await root.query(readFileSync(new URL('../migrations/202610260001_order_pin_privacy_and_pickup.sql',import.meta.url),'utf8'));
 assert(!(await row(root,'select message from wa_outbox where id=$1',[draft.id])).message.includes('&t='));
 await root.query('update wa_outbox set message=$1 where id=$2',['Track /track?id=PIN-FIXTURE&phone=01711111111&t='+'b'.repeat(24),draft.id]);
 assert(!(await row(root,'select message from wa_outbox where id=$1',[draft.id])).message.includes('&t='));
 const maskPayment=await order('bkash');
 await root.query("update orders set payment_status='pending_verification' where id=$1",[maskPayment.id]);
 const verification=await row(vendor,"select (ps_verify_payment($1,'verified','Receipt verified')).delivery_code pin",[maskPayment.id]);
 assert.equal(verification.pin,null);
 for(const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
   const checks=(await root.query(readFileSync(new URL('../'+file,import.meta.url),'utf8'))).rows;
   const pin=checks.filter(r=>r.migration==='202610260001_order_pin_privacy_and_pickup.sql');
   if(file==='check-migrations-all.sql') {
     assert.equal(pin.length,0);
     assert.equal(checks.filter(r=>r.migration==='202609140007_wallet_cancel_payment_settle.sql').length,0);
   } else assert(pin.length===1 && pin[0].status.startsWith('OK'));
   const scoped=checks.filter(r=>r.migration==='202610260002_scoped_shop_fulfilment.sql');
   if(file==='check-migrations-all.sql') assert.equal(scoped.length,0);
   else assert(scoped.length===1 && scoped[0].status.startsWith('OK'));
 }

 // /api/health names the permission migration to run. That only works if each
 // probe's exact RPC shape resolves the way PostgREST calls it (named args)
 // and the probe itself cannot write. Anonymous/service callers hit the guard
 // first, so a null-argument probe fails closed instead of touching a row.
 const healthProbe = await connect(); await healthProbe.query('set role service_role');
 assert.equal((await row(healthProbe,'select public.ps_can_manage_finance() as ok')).ok,false);
 assert.equal((await row(healthProbe,'select count(*)::int n from public.ps_read_riders()')).n,0);
 await assert.rejects(
   healthProbe.query('select public.ps_vendor_advance_order(p_order_id => null, p_to => null, p_note => null)'),
   /forbidden: shop fulfilment targets only/);
 assert.equal((await healthProbe.query('select public.ps_guard_self_finance(p_rider_id => null)')).rows.length,1);
 for (const obj of ['public.rider_control_audit','public.staff_role_audit','public.order_operations']) {
   assert.equal((await row(healthProbe,`select to_regclass('${obj}') is not null present`)).present,true,obj);
 }
 // pg_attribute, not information_schema: the latter only lists columns the
 // current role holds a privilege on, so a service-role caller could see zero.
 assert.equal((await row(healthProbe,`select count(*)::int n from pg_attribute
   where attrelid='public.vendor_users'::regclass and attname='permissions' and attnum>0 and not attisdropped`)).n,1);
 const before=(await row(root,'select (select count(*) from rider_control_audit)::int a,(select count(*) from staff_role_audit)::int b'));
 await healthProbe.query('select public.ps_can_manage_finance()');
 await healthProbe.query('select count(*) from public.ps_read_riders()');
 await assert.rejects(healthProbe.query('select public.ps_vendor_advance_order(p_order_id => null, p_to => null, p_note => null)'),/forbidden/);
 await healthProbe.query('select public.ps_guard_self_finance(p_rider_id => null)');
 const after=(await row(root,'select (select count(*) from rider_control_audit)::int a,(select count(*) from staff_role_audit)::int b'));
 assert.deepEqual(after,before);
 assert.equal((await row(root,`select has_function_privilege('service_role','public.ps_can_manage_finance()','execute')
   and has_function_privilege('service_role','public.ps_read_riders()','execute')
   and has_function_privilege('service_role','public.ps_vendor_advance_order(uuid,ps_order_status,text)','execute')
   and has_function_privilege('service_role','public.ps_guard_self_finance(uuid)','execute')
   and has_function_privilege('service_role','public.ps_admin_override_pickup(uuid,text)','execute') as ok`)).ok,true);

 // 202610270001 — one catalog call answers all ten files, including the two
 // PostgREST cannot see (a trigger and restrictive policies). Only the service
 // role may call it, and it must never write.
 const probes=await row(healthProbe,'select public.ps_health_probes() as r');
 // Ten permission files plus 202610290001's pickup override (the wrapper keeps
 // 202610270001's body as ps_health_probes_base and adds one key).
 assert.equal(Object.keys(probes.r).length,11);
 assert.equal(Object.values(probes.r).every(v=>v===true),true,JSON.stringify(probes.r));
 assert.equal(probes.r.pickupHandoverOverride,true);
 // The renamed base keeps its old ACL: never a browser key, still the service role.
 assert.equal((await row(healthProbe,`select not has_function_privilege('anon','public.ps_health_probes_base()','execute')
   and not has_function_privilege('authenticated','public.ps_health_probes_base()','execute') as denied`)).denied,true);
 assert.equal((await row(healthProbe,`select not has_function_privilege('anon','public.ps_health_probes()','execute') anon,
   not has_function_privilege('authenticated','public.ps_health_probes()','execute') auth`)).anon,true);
 assert.equal((await row(healthProbe,`select not has_function_privilege('authenticated','public.ps_health_probes()','execute') auth`)).auth,true);
 assert.equal(probes.r.shopFirstFulfilment,true);
 assert.equal(probes.r.financeReporting,true);
 // Repeat safety: after 202610260001/002 moved the fulfilment guard into the
 // internal/scoped machine, re-running 202610250002 must be a no-op rather
 // than an "unexpected guard" exception.
 const shopFirst=readFileSync(new URL('../migrations/202610250002_shop_first_fulfilment.sql',import.meta.url),'utf8');
 await root.query(shopFirst);
 assert.equal((await row(root,'select public.ps_health_probes() as r')).r.shopFirstFulfilment,true);
 // A half-applied database answers false instead of raising.
 await root.query('drop trigger trg_direct_order_workflow on orders');
 const half=await row(root,'select public.ps_health_probes() as r');
 assert.equal(half.r.shopFirstFulfilment,false);
 assert.equal(half.r.financeBoundary,true);
 // …and the file that restores it can be re-run on its own.
 await root.query(shopFirst);
 assert.equal((await row(root,'select public.ps_health_probes() as r')).r.shopFirstFulfilment,true);
 console.log('PASS real PostgreSQL: the rollout probe RPC answers all ten files, is service-role only, never writes, fails soft and 202610250002 replays after the batch');
 console.log('PASS real PostgreSQL: every /api/health permission probe resolves with its exact named arguments, fails closed and writes nothing');
 console.log('PASS real PostgreSQL: legacy outbox capabilities removed, stale writers sanitized, payment mutation PIN masked, repeat-safe upgrade and migration checks');

} finally {
 await Promise.all(clients.map(c=>c.end()));
 await admin.query(`drop database if exists ${name}`); await admin.end();
}
