import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export async function verifyFinanceReporting({ db, as, uuid, scalar, rows }) {
  const signatures = ['ps_admin_money_summary()', 'ps_admin_money_pnl(timestamptz,timestamptz)', 'ps_admin_money_daily(date)', 'ps_admin_rider_overview(uuid)'];
  const before = new Map();
  for (const s of signatures) before.set(s, await scalar('select pg_get_functiondef($1::regprocedure)', [s]));
  const sql = readFileSync(new URL('../migrations/202610250004_finance_reporting_access.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  for (const s of signatures) assert.equal(await scalar('select pg_get_functiondef($1::regprocedure)', [s]), before.get(s).replaceAll('if not (select ps_is_admin()) then', 'if not (select public.ps_can_manage_finance()) then'));
  console.log('PASS: reporting migration repeat-safe; all four report bodies change only their role guard');
  for (const file of ['check-migrations-all.sql','check-migrations-from-0928.sql']) {
    const query=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert(query.includes('202610250004_finance_reporting_access.sql'));
    const checks=await rows(query);
    const reporting=checks.filter(row=>row.migration==='202610250004_finance_reporting_access.sql');
    if (file==='check-migrations-all.sql') assert.equal(reporting.length,0,'No reporting prerequisites missing');
    else { assert.equal(reporting.length,1); assert.match(reporting[0].status,/^OK/); assert.equal(Number(reporting[0].ache),11); }
  }
  console.log('PASS: both migration checklists execute and verify all four report guards plus seven restrictive read policies');

  const manager=await uuid(), admin=await uuid(), superAdmin=await uuid(), owner=await uuid(), staff=await uuid(), riderUser=await uuid();
  for (const [id, role] of [[manager,'manager'],[admin,'admin'],[superAdmin,'super_admin']]) await db.query('insert into admin_users(id,role) values($1,$2)',[id,role]);
  const rider=await scalar('insert into riders(user_id) values($1) returning id',[riderUser]);
  const shop=await scalar("insert into shops(name,status) values('Report permissions fixture','active') returning id");
  await db.query("insert into vendor_users(user_id,shop_id,role,permissions) values($1,$2,'owner','{}'),($3,$2,'staff',ARRAY['cashier'])",[owner,shop,staff]);
  const order=await scalar("insert into orders(shop_id,status,payment_status) values($1,'pending','verified') returning id",[shop]);
  await db.query('insert into shop_ledger(shop_id,order_id,payable) values($1,$2,1000)',[shop,order]);
  await db.query('insert into shop_payouts(shop_id,amount) values($1,100)',[shop]);
  // Legacy own-rider policies are omitted by the base fixture; install them
  // alongside its broad staff policies so restrictive reads face both paths.
  const riderTables=['rider_earnings','rider_payout_requests','rider_settlements','rider_settle_claims'];
  await db.exec('grant select on money_audit_log to authenticated');
  await db.exec('create policy report_test_own_rider on riders for select to authenticated using(user_id=auth.uid())');
  for (const t of riderTables) await db.exec(`create policy report_test_own_read on ${t} for select to authenticated using(rider_id=ps_rider_id())`);
  const acting=async(id)=>{await db.exec('reset role');await as(id);await db.exec('set role authenticated');};
  const root=async()=>{await db.exec('reset role');await as(null);};
  const reports=[['select ps_admin_money_summary()',[]],['select ps_admin_money_pnl(null,null)',[]],['select ps_admin_money_daily(null)',[]],['select ps_admin_rider_overview($1)',[rider]]];
  try {
    for (const user of [manager,owner,staff,riderUser]) {
      await acting(user);
      for (const [q,args] of reports) await assert.rejects(db.query(q,args),/forbidden/);
    }
    await acting(manager);
    assert.equal(await scalar('select ps_is_admin()'),true);
    for (const t of [...riderTables,'shop_ledger','shop_payouts','money_audit_log']) assert.equal(Number(await scalar(`select count(*) from ${t}`)),0,`${t}: no platform money records for manager`);
    assert((await rows('select id,cash_in_hand,current_load from riders where id=$1',[rider])).length===1);
    assert(await scalar('select ps_admin_rider_scorecards(30)')!==null);
    console.log('PASS: manager denied report RPCs and financial tables; rider board/COD scorecard stay operational');
    for (const user of [admin,superAdmin]) {
      await acting(user);
      for (const [q,args] of reports) assert((await rows(q,args)).length===1);
      assert(Number(await scalar('select count(*) from shop_ledger where shop_id=$1',[shop]))===1);
      assert(Number(await scalar('select count(*) from money_audit_log'))>0);
    }
    console.log('PASS: Admin and Super Admin retain reports, ledgers and immutable audit reads');
    await acting(owner);
    assert.equal(Number(await scalar('select count(*) from shop_ledger where shop_id=$1',[shop])),1);
    assert.equal(Number(await scalar('select count(*) from shop_payouts where shop_id=$1',[shop])),1);
    await acting(staff);
    assert.equal(Number(await scalar('select count(*) from shop_ledger where shop_id=$1',[shop])),0);
    await acting(admin);
    await db.query("select ps_admin_adjust_rider($1,1000,'Reporting compatibility seed')",[rider]);
    await root();await db.exec("insert into site_settings(key,value) values('rider_min_payout_paisa','100') on conflict(key) do update set value=excluded.value");
    await acting(riderUser);
    assert(Number(await scalar('select count(*) from rider_earnings where rider_id=$1',[rider]))>0);
    assert(await scalar('select ps_rider_money_summary()')!==null);
    await db.query("select ps_rider_request_payout(100,'bkash','01700000000')");
    assert.equal(Number(await scalar('select count(*) from rider_payout_requests where rider_id=$1',[rider])),1);
    console.log('PASS: Owner own-shop finance, Staff denial and Rider own earnings/payout workflow survive reporting RLS');
    // A staff role is not a reason to remove that person's independent
    // own-Rider / own-shop Owner entitlement. Still no platform report access.
    await root();
    const ownRider=await scalar('insert into riders(user_id) values($1) returning id',[manager]);
    await db.query("insert into vendor_users(user_id,shop_id,role,permissions) values($1,$2,'owner','{}')",[manager,shop]);
    await acting(admin);
    await db.query("select ps_admin_adjust_rider($1,100,'Own-account entitlement seed')",[ownRider]);
    await acting(manager);
    const ownJournal=await rows('select rider_id from rider_earnings');
    assert(ownJournal.length>0 && ownJournal.every(row=>row.rider_id===ownRider));
    assert.equal(Number(await scalar('select count(*) from shop_ledger where shop_id=$1',[shop])),1);
    for (const [q,args] of reports) await assert.rejects(db.query(q,args),/forbidden/);
    console.log('PASS: Manager with independent own-Rider/Owner membership sees only own finance, never platform reports');
    await db.exec('set role anon');
    for (const [q,args] of reports) await assert.rejects(db.query(q,args),/permission denied/);
    console.log('PASS: anonymous clients cannot execute financial report RPCs');
  } finally {await root();}
}
