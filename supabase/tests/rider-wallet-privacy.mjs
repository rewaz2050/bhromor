import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export async function verifyRiderWalletPrivacy({db,as,uuid,scalar,rows}) {
  const sql=readFileSync(new URL('../migrations/202610250005_rider_wallet_column_privacy.sql',import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  for (const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
    const checks=await rows(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    const privacy=checks.filter(r=>r.migration==='202610250005_rider_wallet_column_privacy.sql');
    if(file==='check-migrations-all.sql') assert.equal(privacy.length,0);
    else {assert.equal(privacy.length,1);assert.match(privacy[0].status,/^OK/);assert.equal(Number(privacy[0].ache),2);}
  }
  console.log('PASS: both migration checklists verify rider projection and denied authenticated wallet column privilege');
  const manager=await uuid(),admin=await uuid(),superAdmin=await uuid(),riderUser=await uuid(),stranger=await uuid();
  for(const [id,role] of [[manager,'manager'],[admin,'admin'],[superAdmin,'super_admin']]) await db.query('insert into admin_users(id,role) values($1,$2)',[id,role]);
  const rider=await scalar('insert into riders(user_id) values($1) returning id',[riderUser]);
  const ownManagerRider=await scalar('insert into riders(user_id) values($1) returning id',[manager]);
  const root=async()=>{await db.exec('reset role');await as(null);};
  const acting=async(id)=>{await db.exec('reset role');await as(id);await db.exec('set role authenticated');};
  try {
    await acting(admin);
    await db.query("select ps_admin_adjust_rider($1,1500,'Privacy seed')",[rider]);
    await db.query("select ps_admin_adjust_rider($1,200,'Own Manager rider seed')",[ownManagerRider]);
    for(const user of [manager,admin,superAdmin,riderUser,stranger]) {
      await acting(user);
      for(const q of ['select earnings_balance from riders','select * from riders','select to_jsonb(r) from riders r','select id from riders order by earnings_balance','select id from riders where earnings_balance>0']) {
        await assert.rejects(db.query(q),/permission denied/);
      }
    }
    console.log('PASS: direct private-column, SELECT *, JSON, predicate and ordering reads denied to authenticated callers');
    await acting(manager);
    assert.equal((await rows('select id,cash_in_hand,current_load from riders where id=$1',[rider])).length,1);
    assert.equal((await rows('select earnings_balance from ps_read_riders() where id=$1',[rider]))[0].earnings_balance,null);
    assert.equal(Number(await scalar('select earnings_balance from ps_read_riders() where id=$1',[ownManagerRider])),200);
    assert.equal((await rows('update riders set is_online=false where id=$1 returning id',[rider])).length,1);
    await assert.rejects(db.query('update riders set is_online=true where id=$1 returning *',[rider]),/permission denied/);
    await assert.rejects(db.query('update riders set earnings_balance=99999 where id=$1',[rider]),/finance permission/);
    assert(await scalar('select ps_admin_rider_scorecards(30)')!==null);
    console.log('PASS: Manager keeps dispatch, COD scorecard and own wallet, but receives NULL for other rider wallets');
    for(const user of [admin,superAdmin]) {
      await acting(user);
      assert.equal(Number(await scalar('select earnings_balance from ps_read_riders() where id=$1',[rider])),1500);
      assert(await scalar('select ps_admin_money_summary()')!==null);
    }
    await acting(riderUser);
    assert.deepEqual((await rows('select id from ps_read_riders()')).map(r=>r.id),[rider]);
    assert.equal(Number(await scalar('select earnings_balance from ps_read_riders()')),1500);
    assert(await scalar('select ps_rider_money_summary()')!==null);
    await db.query("select ps_rider_request_payout(100,'bkash','01700000000')");
    assert.equal(Number(await scalar('select earnings_balance from ps_read_riders()')),1400);
    console.log('PASS: Admin/Super Admin reports and Rider self profile/earnings/payout accounting survive column isolation');
    await acting(stranger);
    assert.equal((await rows('select * from ps_read_riders()')).length,0);
    await root(); await db.exec('set role anon');
    await assert.rejects(db.query('select * from ps_read_riders()'),/permission denied/);
    await assert.rejects(db.query('select earnings_balance from riders'),/permission denied/);
    console.log('PASS: stranger receives no rider projection; anonymous calls denied; migration repeat-safe');
  } finally {await root();}
}
