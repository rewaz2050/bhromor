import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export async function verifyFinanceSelfDealing({db,as,uuid,scalar,rows}) {
 const root=async()=>{await db.exec('reset role');await as(null);};
 const acting=async(id)=>{await root();await as(id);await db.exec('set role authenticated');};
 const marker='-- Self-dealing boundary (202610260003)';
 const specs=[
  ['public.ps_admin_settle_rider(uuid,text,text,boolean)', '\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(p_rider_id);'],
  ['public.ps_admin_reject_settle(uuid,text)', '\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(p_rider_id);'],
  ['public.ps_admin_adjust_rider(uuid,bigint,text)', '\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(p_rider_id);'],
  ['public.ps_admin_decide_rider_payout(uuid,text,text,text)', '\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(v_payout.rider_id);'],
  ['public.ps_admin_resolve_dispute(uuid,text,bigint,text)', '\n  -- Self-dealing boundary (202610260003)\n  perform public.ps_guard_self_finance(v_row.rider_id);'],
 ];
 const before=new Map();
 for(const [sig] of specs) before.set(sig,await scalar('select pg_get_functiondef($1::regprocedure)',[sig]));
 const sql=readFileSync(new URL('../migrations/202610260003_finance_self_dealing_boundary.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 for(const [sig,guard] of specs){
  const definition=await scalar('select pg_get_functiondef($1::regprocedure)',[sig]);
  assert.equal((definition.split(marker).length-1),1,`${sig}: guard inserted exactly once`);
  assert.equal(definition.replace(guard,''),before.get(sig),`${sig}: only the self-dealing guard changed`);
 }
 console.log('PASS: self-dealing migration is repeat-safe and each finance body differs only by the inserted guard');

 await db.exec("alter table vendor_users add column if not exists role text not null default 'owner'");
 const selfAdmin=await uuid(), otherAdmin=await uuid(), plainRider=await uuid();
 await db.query("insert into admin_users(id,role) values($1,'admin'),($2,'admin')",[selfAdmin,otherAdmin]);
 const ownRider=await scalar('insert into riders(user_id,name) values($1,$2) returning id',[selfAdmin,'Staff rider']);
 const otherRider=await scalar('insert into riders(user_id,name) values($1,$2) returning id',[plainRider,'Ordinary rider']);
 const shop=await scalar("insert into shops(name) values('Self-dealing shop') returning id");
 await db.query("insert into vendor_users(user_id,shop_id,role) values($1,$2,'owner')",[selfAdmin,shop]);

 try {
  const request=async(rider,amount=1000)=>scalar("insert into rider_payout_requests(rider_id,amount,status) values($1,$2,'pending') returning id",[rider,amount]);
  const ownPayout=await request(ownRider), otherPayout=await request(otherRider);
  await acting(selfAdmin);
  await assert.rejects(db.query("select ps_admin_decide_rider_payout($1,'paid','self',null)",[ownPayout]),/cannot decide your own money/);
  await acting(otherAdmin);
  assert.equal((await rows("select ps_admin_decide_rider_payout($1,'paid','second approver','TRX-1')",[otherPayout])).length,1);
  console.log('PASS: a payout for the approver\'s own Rider account is refused; a different finance Admin can decide it');

  await root();await db.query('update riders set cash_in_hand=5000 where id=$1',[ownRider]);
  await db.query("insert into rider_settle_claims(rider_id,amount,status) values($1,5000,'pending')",[ownRider]);
  await acting(selfAdmin);
  await assert.rejects(db.query("select ps_admin_settle_rider($1,'cash','self',false)",[ownRider]),/cannot decide your own money/);
  await assert.rejects(db.query("select ps_admin_reject_settle($1,'self')",[ownRider]),/cannot decide your own money/);
  await acting(otherAdmin);
  assert.equal(Number(await scalar('select cash_in_hand from riders where id=$1',[ownRider])),5000,'failed self-settlement changed nothing');
  await db.query("select ps_admin_settle_rider($1,'cash','counter',false)",[ownRider]);
  await root();
  assert.equal(Number(await scalar('select cash_in_hand from riders where id=$1',[ownRider])),0);
  assert.equal(await scalar("select status from rider_settle_claims where rider_id=$1",[ownRider]),'approved');
  console.log('PASS: own cash custody and claim stay untouched; another Admin settles and approves them');

  await acting(selfAdmin);
  await assert.rejects(db.query("select ps_admin_adjust_rider($1,250,'self credit')",[ownRider]),/cannot decide your own money/);
  await acting(otherAdmin);
  await db.query("select ps_admin_adjust_rider($1,250,'approved correction')",[ownRider]);
  await acting(selfAdmin);
  assert.equal(Number(await scalar('select coalesce(sum(amount),0) from rider_earnings where rider_id=$1',[ownRider])),250);
  console.log('PASS: the approver cannot credit their own Rider wallet; another Admin can, and the credit is journaled once');

  await root();
  const dispute=await scalar("insert into rider_disputes(rider_id,category,message) values($1,'missing_fee','Fee was not credited') returning id",[ownRider]);
  await acting(selfAdmin);
  await assert.rejects(db.query("select ps_admin_resolve_dispute($1,'approve',100,'self')",[dispute]),/cannot decide your own money/);
  await acting(otherAdmin);
  await db.query("select ps_admin_resolve_dispute($1,'approve',100,'verified by second approver')",[dispute]);
  await root();
  assert.equal(await scalar('select status from rider_disputes where id=$1',[dispute]),'approved');
  assert.equal(Number(await scalar("select coalesce(sum(amount),0) from rider_earnings where rider_id=$1 and kind='adjustment'",[ownRider]))>=100,true);
  console.log('PASS: the approver cannot decide their own dispute; another Admin resolves it with the adjustment recorded');

  await root();
  await assert.rejects(db.query("insert into shop_payouts(shop_id,amount,paid_by) values($1,10000,$2)",[shop,selfAdmin]),/own shop/);
  assert.equal((await rows("insert into shop_payouts(shop_id,amount,paid_by) values($1,10000,$2) returning id",[shop,otherAdmin])).length,1);
  assert.equal((await rows("insert into shop_payouts(shop_id,amount,paid_by) values($1,100, null) returning id",[shop])).length,1);
  console.log('PASS: a shop Owner cannot record their own shop payout; another finance Admin or a legacy unattributed row still records');

  await root();await db.exec('set role anon');
  await assert.rejects(db.query("select ps_admin_decide_rider_payout($1,'paid',null,null)",[ownPayout]),/permission denied/);
  await assert.rejects(db.query("select ps_guard_self_finance($1)",[ownRider]),/permission denied/);
  await root();await db.exec('set role service_role');
  await assert.rejects(db.query("select ps_admin_adjust_rider($1,1,'service')",[ownRider]),/forbidden/);
  console.log('PASS: anonymous clients cannot call the finance or guard entry points; service role gains no finance authority');

  for(const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
   const checks=await rows(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
   const found=checks.filter(r=>r.migration==='202610260003_finance_self_dealing_boundary.sql');
   if(file==='check-migrations-all.sql') assert.equal(found.length,0);
   else assert(found.length===1 && found[0].status.startsWith('OK'));
  }
  console.log('PASS: both migration checklists recognize the self-dealing boundary entry points');
 } finally {await root();}
}
