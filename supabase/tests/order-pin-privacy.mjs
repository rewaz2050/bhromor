import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export async function verifyOrderPinPrivacy({db,as,uuid,scalar,rows}) {
 const sql=readFileSync(new URL('../migrations/202610260001_order_pin_privacy_and_pickup.sql',import.meta.url),'utf8');
 await db.exec(sql); await db.exec(sql);
 const root=async()=>{await db.exec('reset role');await as(null);};
 const acting=async(id)=>{await root();await as(id);await db.exec('set role authenticated');};
 const actors={};
 for(const role of ['manager','admin','super_admin']) {actors[role]=await uuid();await db.query('insert into admin_users(id,role) values($1,$2)',[actors[role],role]);}
 const stranger=await uuid();
 const make=async(extra='')=>{await root();return scalar(`insert into orders(status,is_pickup,delivery_code,payment,payment_status ${extra}) values('ready-for-pickup',true,'4821','cod','verified') returning id`);};
 const pickup=await make();
 try {
  for(const user of [...Object.values(actors),stranger]) {
   await acting(user);
   for(const q of ['select delivery_code from orders','select * from orders','select to_jsonb(o) from orders o',"select id from orders where delivery_code='4821'",'select id from orders order by delivery_code']) await assert.rejects(db.query(q),/permission denied/);
  }
  console.log('PASS: all authenticated ranks including Super Admin denied direct PIN, whole-row, JSON, predicate and ordering reads');
  for(const actor of Object.values(actors)) {
   await acting(actor);
   assert.equal(await scalar('select delivery_code from order_operations where id=$1',[pickup]),null);
   await assert.rejects(db.query("update orders set delivery_code='4821' where id=$1 returning id",[pickup]),/PIN verification workflow/);
   await assert.rejects(db.query('update orders set delivery_code_attempts=0 where id=$1 returning id',[pickup]),/PIN verification workflow/);
   for(const target of ['courier-assigned','out-for-delivery','delivered']) await assert.rejects(db.query('select ps_advance_order($1,$2)',[pickup,target]),/pickup PIN verification required/);
   await assert.rejects(db.query("select ps_advance_order_internal($1,'delivered',null)",[pickup]),/permission denied/);
  }
  for(const role of ['admin','super_admin']) {
   await acting(actors[role]);
   await assert.rejects(db.query("insert into orders(status,is_pickup,delivery_code) values('pending',true,'4821') returning id"),/PIN verification workflow/);
  }
  console.log('PASS: operational view has NULL PIN; direct inserts, guessed equal-value PIN writes, lockout resets and direct pickup-state bypasses denied');
  await acting(stranger);
  assert.equal((await rows('select id from order_operations')).length,0);
  await assert.rejects(db.query("select ps_collect_pickup_order($1,'4821')",[pickup]),/forbidden/);
  console.log('PASS: invoker view preserves underlying order RLS; strangers cannot collect');
  await acting(actors.manager);
  for(let i=0;i<5;i++) assert.deepEqual(await scalar("select ps_collect_pickup_order($1,'0000')",[pickup]),{ok:false,error:'code_mismatch'});
  assert.deepEqual(await scalar("select ps_collect_pickup_order($1,'4821')",[pickup]),{ok:false,error:'locked'});
  await root();assert.equal(Number(await scalar('select delivery_code_attempts from orders where id=$1',[pickup])),5);
  assert.equal(await scalar('select status from orders where id=$1',[pickup]),'ready-for-pickup');
  await db.query("update orders set delivery_code_locked_until=now()-interval '1 second' where id=$1",[pickup]);
  await acting(actors.manager);
  assert.deepEqual(await scalar("select ps_collect_pickup_order($1,'0000')",[pickup]),{ok:false,error:'code_mismatch'});
  await root();assert.equal(Number(await scalar('select delivery_code_attempts from orders where id=$1',[pickup])),1);
  console.log('PASS: wrong PIN attempts persist, five failures lock even a correct PIN, expired lock restarts the attempt budget');
  await acting(actors.manager);
  assert.deepEqual(await scalar("select ps_collect_pickup_order($1,'4821')",[pickup]),{ok:true});
  assert.deepEqual(await scalar("select ps_collect_pickup_order($1,'4821')",[pickup]),{ok:true});
  await root();
  assert.equal(await scalar('select status from orders where id=$1',[pickup]),'delivered');
  assert.equal(Number(await scalar("select count(*) from order_status_history where order_id=$1 and status='delivered'",[pickup])),1);
  assert.equal(Number(await scalar('select delivery_code_attempts from orders where id=$1',[pickup])),0);
  assert.equal(await scalar("select count(*) from order_status_history where order_id=$1 and note like '%4821%'",[pickup]),0);
  console.log('PASS: Manager verified Traffic Point handover completes once, resets attempts and records actor/history without the PIN');
  for(const role of ['admin','super_admin']) {
   const id=await make();await acting(actors[role]);
   assert.deepEqual(await scalar("select ps_collect_pickup_order($1,'4821')",[id]),{ok:true});
  }
  await root();
  const unpaid=await make();await db.query("update orders set payment='bkash',payment_status='pending_verification' where id=$1",[unpaid]);
  await acting(actors.admin);await assert.rejects(db.query("select ps_collect_pickup_order($1,'4821')",[unpaid]),/payment not verified/);
  await root();const early=await make();await db.query("update orders set status='confirmed' where id=$1",[early]);
  await acting(actors.admin);await assert.rejects(db.query("select ps_collect_pickup_order($1,'4821')",[early]),/pickup not ready/);
  await root();const home=await make();await db.query('update orders set is_pickup=false where id=$1',[home]);
  await acting(actors.admin);await assert.rejects(db.query("select ps_collect_pickup_order($1,'4821')",[home]),/not a counter pickup/);
  console.log('PASS: Admin and Super Admin verification works; unverified wallet, early and home-delivery orders cannot use the counter path');
  await root();const ordinary=await scalar("insert into orders(status,delivery_code) values('pending','4821') returning id");
  await acting(actors.admin);
  assert.equal(await scalar("select (ps_advance_order($1,'confirmed')).delivery_code",[ordinary]),null);
  assert.equal(await scalar("select (ps_advance_order($1,'confirmed')).delivery_code",[ordinary]),null);
  await root();assert.equal(await scalar('select delivery_code from orders where id=$1',[ordinary]),'4821');
  const mutations=await rows("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace and prorettype='orders'::regtype");
  assert(mutations.length>=4);assert(mutations.every(f=>f.prosrc.includes('PIN response projection 202610260001')));
  console.log('PASS: normal and idempotent mutation returns masked; stored customer PIN unchanged; every order-composite RPC has response masking');
  for(const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
   const checks=await rows(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
   const found=checks.filter(r=>r.migration==='202610260001_order_pin_privacy_and_pickup.sql');
   if(file==='check-migrations-all.sql') assert.equal(found.length,0);
   else {assert.equal(found.length,1);assert.match(found[0].status,/^OK/);}
  }
  console.log('PASS: PIN migration repeat-safe; both migration checklists recognize the new boundary');
 } finally {await root();}
}
