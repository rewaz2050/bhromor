import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export async function verifyAtomicStaffRoles({db,as,uuid,rows}) {
 const sql=readFileSync(new URL('../migrations/202610250007_atomic_staff_roles.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 for(const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
  const checks=await rows(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const latest=checks.filter(r=>/20261025000[67]_/.test(r.migration));
  if(file==='check-migrations-all.sql')assert.equal(latest.length,0);
  else {assert.equal(latest.length,2);assert(latest.every(r=>r.status.startsWith('OK')));}
 }
 console.log('PASS: both migration checklists execute and recognize rider/ledger controls and atomic staff-role audit');
 const manager=await uuid(),admin=await uuid(),superAdmin=await uuid(),target=await uuid();
 for(const [id,role] of [[manager,'manager'],[admin,'admin'],[superAdmin,'super_admin']])await db.query('insert into admin_users(id,role) values($1,$2)',[id,role]);
 const root=async()=>{await db.exec('reset role');await as(null);};
 const service=async()=>{await root();await db.exec('set role service_role');};
 try {
  await as(admin);await db.exec('set role authenticated');
  await assert.rejects(db.query("select ps_change_staff_role($1,$2,'super_admin')",[superAdmin,target]),/permission denied/);
  await db.exec('set role anon');
  await assert.rejects(db.query("select ps_change_staff_role($1,$2,'admin')",[admin,target]),/permission denied/);
  await service();
  await assert.rejects(db.query("select ps_change_staff_role($1,$2,'admin')",[manager,target]),/forbidden/);
  await assert.rejects(db.query("select ps_change_staff_role($1,$1,'super_admin')",[admin]),/own access/);
  await assert.rejects(db.query("select ps_change_staff_role($1,$2,'super_admin')",[admin,target]),/only Super Admin/);
  await assert.rejects(db.query("select ps_change_staff_role($1,$2,'admin')",[admin,superAdmin]),/only Super Admin/);
  await db.query("select ps_change_staff_role($1,$2,'manager')",[admin,target]);
  await db.query("select ps_change_staff_role($1,$2,'admin')",[admin,target]);
  await db.query("select ps_change_staff_role($1,$2,null)",[admin,target]);
  console.log('PASS: server-only role RPC denies spoofing, Manager, self-escalation and Admin Super Admin grants/edits');
  await db.query("select ps_change_staff_role($1,$2,'super_admin')",[superAdmin,target]);
  await db.query("select ps_change_staff_role($1,$2,'manager')",[superAdmin,target]);
  await root();
  const audit=await rows('select * from staff_role_audit where target_id=$1',[target]);
  assert.equal(audit.length,5);assert(audit.some(r=>r.actor_id===admin && r.before_role==='manager' && r.after_role==='admin'));
  await assert.rejects(db.query('delete from staff_role_audit'),/financial history/);
  await assert.rejects(db.query("update staff_role_audit set after_role='super_admin'"),/financial history/);
  await assert.rejects(db.query('truncate staff_role_audit'),/financial history/);
  await db.query("update admin_users set role='manager' where id=$1",[admin]);
  await service();
  await assert.rejects(db.query("select ps_change_staff_role($1,$2,'admin')",[admin,target]),/current Admin/);
  console.log('PASS: authorized grants/revoke are actor-bound and immutable; a demoted actor cannot reuse a stale API role');
 } finally {await root();}
}
