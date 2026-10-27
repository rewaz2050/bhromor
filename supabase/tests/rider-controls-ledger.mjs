import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function verifyRiderControlsLedger({db,as,uuid,scalar,rows}) {
 const sql=readFileSync(new URL('../migrations/202610250006_rider_controls_and_ledger_retention.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 const manager=await uuid(),admin=await uuid(),superAdmin=await uuid(),user=await uuid();
 for(const [id,role] of [[manager,'manager'],[admin,'admin'],[superAdmin,'super_admin']])await db.query('insert into admin_users(id,role) values($1,$2)',[id,role]);
 const rider=await scalar('insert into riders(user_id) values($1) returning id',[user]);
 const managerRider=await scalar('insert into riders(user_id) values($1) returning id',[manager]);
 const acting=async(id)=>{await db.exec('reset role');await as(id);await db.exec('set role authenticated');};
 const root=async()=>{await db.exec('reset role');await as(null);};
 try {
  await acting(manager);
  for(const q of ["update riders set status='suspended' where id=$1",'update riders set user_id=auth.uid() where id=$1','update riders set rating_avg=5 where id=$1','update riders set current_load=0 where id=$1'])await assert.rejects(db.query(q,[rider]),/Admin permission/);
  await assert.rejects(db.query('insert into riders default values'),/Admin permission/);
  await db.query('update riders set is_online=false where id=$1',[managerRider]);
  await assert.rejects(db.query("update riders set status='suspended' where id=$1",[managerRider]),/Admin permission/);
  assert(await scalar('select ps_admin_rider_scorecards(30)')!==null);
  console.log('PASS: Manager cannot create/approve/suspend/relink/forge rider risk data; independent Rider availability survives');
  for(const actor of [admin,superAdmin]) {
   await acting(actor);
   await db.query("update riders set status='suspended' where id=$1",[rider]);
   await assert.rejects(db.query('update riders set cash_in_hand=999 where id=$1',[rider]),/audited finance workflow/);
   await assert.rejects(db.query('insert into rider_earnings(rider_id,kind,amount) values($1,\'adjustment\',100)',[rider]),/audited finance workflow/);
   await db.query("select ps_admin_adjust_rider($1,1000,'Audited authorized adjustment')",[rider]);
  }
  await root();
  const audit=await rows('select * from rider_control_audit where rider_id=$1 and actor_id=$2',[rider,admin]);
  assert(audit.length>0);assert(audit.some(r=>r.fields.includes('status')));
  assert(audit.every(r=>!JSON.stringify(r.after_state).includes('kyc')));
  await assert.rejects(db.query('update rider_earnings set amount=1 where rider_id=$1',[rider]),/financial history/);
  await assert.rejects(db.query('delete from rider_earnings where rider_id=$1',[rider]),/financial history/);
  await assert.rejects(db.query('delete from riders where id=$1',[rider]),/financial history/);
  for(const t of ['rider_earnings','shop_ledger','shop_payouts','rider_settlements','rider_payout_requests','rider_settle_claims','rider_disputes','money_audit_log','rider_control_audit','vendor_permission_audit']) {
    await assert.rejects(db.query(`truncate ${t} cascade`),/financial history/);
  }
  console.log('PASS: journal rewrite, deletion, parent cascade and TRUNCATE denied; Admin/Super Admin adjustments remain audited');
  await root();await db.query("update riders set status='active' where id=$1",[rider]);
  await acting(user);
  await db.query("select ps_rider_request_payout(100,'bkash','01700000000')");
  const payout=await scalar('select id from rider_payout_requests where rider_id=$1',[rider]);
  await acting(admin);
  await db.query("select ps_admin_decide_rider_payout($1,'paid','verified transfer','receipt')",[payout]);
  await assert.rejects(db.query('delete from rider_payout_requests where id=$1',[payout]),/financial history/);
  await root();
  assert.equal(Number(await scalar('select earnings_balance from riders where id=$1',[rider])),Number(await scalar('select sum(amount) from rider_earnings where rider_id=$1',[rider])));
  await acting(admin);
  await db.query("insert into site_settings(key,value) values('rider_auto_suspend','false') on conflict(key) do update set value=excluded.value");
  await db.query("update site_settings set value='true' where key='rider_auto_suspend'");
  await db.query("delete from site_settings where key='rider_auto_suspend'");
  await root();
  const policyAudit=await rows("select * from money_audit_log where subject_id='rider_auto_suspend' and actor_id=$1",[admin]);
  assert(policyAudit.some(r=>r.detail.operation==='update'));assert(policyAudit.some(r=>r.detail.operation==='delete'));
  console.log('PASS: auto-suspend policy update/removal is actor-bound in permanent audit');
  console.log('PASS: payout request/approval and journal-balanced wallet work after retention guards');
 } finally {await root();}
}
