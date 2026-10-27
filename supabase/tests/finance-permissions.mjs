import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Called by test:money after its existing real-migration accounting cases.
 * Same disposable PGlite DB, but actual SET ROLE authenticated + RLS here.
 * No live Supabase, network, credentials or financial data.
 */
export async function verifyFinancePermissions({ db, as, uuid, scalar, rows }) {
  // Earlier money cases extract only settlement approval from this legacy
  // migration. Load its real rider-submission/rejection functions as well.
  const claimsSql = readFileSync(new URL('../migrations/202609250004_settle_claims.sql', import.meta.url), 'utf8');
  for (const name of ['ps_rider_settle', 'ps_admin_reject_settle']) {
    const definition = claimsSql.match(new RegExp('create(?: or replace)? function ' + name + '\\([\\s\\S]*?end \\$\\$;'))?.[0];
    assert(definition, `${name}: real legacy function must exist`);
    await db.exec(definition);
    await db.exec(`revoke all on function ${name}(${name === 'ps_rider_settle' ? 'text,text' : 'uuid,text'}) from public, anon;
      grant execute on function ${name}(${name === 'ps_rider_settle' ? 'text,text' : 'uuid,text'}) to authenticated, service_role;`);
  }
  const rpcSignatures = [
    'ps_admin_settle_rider(uuid,text,text,boolean)',
    'ps_admin_reject_settle(uuid,text)',
    'ps_admin_decide_rider_payout(uuid,text,text,text)',
    'ps_admin_adjust_rider(uuid,bigint,text)',
    'ps_admin_resolve_dispute(uuid,text,bigint,text)',
  ];
  const before = new Map();
  for (const signature of rpcSignatures) {
    before.set(signature, await scalar('select pg_get_functiondef($1::regprocedure)', [signature]));
  }
  const sql = readFileSync(new URL('../migrations/202610250001_finance_permission_boundary.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  for (const signature of rpcSignatures) {
    assert.equal(await scalar('select pg_get_functiondef($1::regprocedure)', [signature]),
      before.get(signature).replaceAll('if not (select ps_is_admin()) then', 'if not (select public.ps_can_manage_finance()) then'),
      `${signature}: accounting implementation must not change`);
  }
  console.log('PASS: finance migration repeat-safe; five accounting RPC bodies change only their entry guard');

  // The money fixture deliberately omits base schema RLS/policies. Install
  // the legacy broad staff model so restrictive policies face a REAL existing
  // permissive grant, rather than "passing" because no write was possible.
  await db.exec(`
    grant usage on schema public, auth to authenticated, anon, service_role;
    alter table admin_users enable row level security;
    create policy finance_test_role_read on admin_users for select using (ps_is_admin());
    alter table riders enable row level security;
    alter table shops enable row level security;
    alter table orders enable row level security;
    alter table site_settings enable row level security;
    alter table shops add column if not exists commission_pct numeric default 10;
  `);
  const tables = ['riders', 'shops', 'orders', 'site_settings', 'shop_ledger', 'shop_payouts', 'rider_settlements', 'rider_settle_claims', 'rider_payout_requests', 'rider_earnings', 'rider_disputes'];
  for (const table of tables) {
    await db.exec(`grant select, insert, update, delete on ${table} to authenticated;
      create policy finance_test_legacy_staff on ${table} for all using (ps_is_admin()) with check (ps_is_admin());`);
  }
  await db.exec('grant select, update on admin_users to authenticated');
  const manager = await uuid(), admin = await uuid(), superAdmin = await uuid(), riderUser = await uuid(), vendorUser = await uuid();
  for (const [id, role] of [[manager, 'manager'], [admin, 'admin'], [superAdmin, 'super_admin']]) {
    await db.query('insert into admin_users(id,role) values($1,$2)', [id, role]);
  }
  const rider = await scalar('insert into riders(user_id,cash_in_hand) values($1,10000) returning id', [riderUser]);
  const shop = await scalar("insert into shops(name,payment_verifier) values('Finance permission fixture','both') returning id");
  await db.query('insert into vendor_users(user_id,shop_id) values($1,$2)', [vendorUser, shop]);
  const order = await scalar("insert into orders(shop_id,status,payment,payment_status,total) values($1,'pending','bkash','pending_verification',10000) returning id", [shop]);
  const unknown = await uuid();
  const calls = [
    ['select ps_admin_settle_rider($1,\'cash\',\'fixture\',false)', [rider]],
    ['select ps_admin_reject_settle($1,\'fixture\')', [rider]],
    ['select ps_admin_decide_rider_payout($1,\'paid\',\'fixture\',\'fixture\')', [unknown]],
    ['select ps_admin_adjust_rider($1,100,\'permission fixture\')', [rider]],
    ['select ps_admin_resolve_dispute($1,\'approve\',100,\'fixture\')', [unknown]],
  ];
  const acting = async (user) => { await db.exec('reset role'); await as(user); await db.exec('set role authenticated'); };
  const root = async () => { await db.exec('reset role'); await as(null); };
  try {
    for (const user of [manager, riderUser, vendorUser]) {
      await acting(user);
      assert.equal(await scalar('select ps_can_manage_finance()'), false);
      for (const [query, args] of calls) await assert.rejects(db.query(query, args), /forbidden/);
    }
    await root();
    assert.equal(Number(await scalar('select cash_in_hand from riders where id=$1', [rider])), 10000);
    console.log('PASS: manager/rider/vendor denied all five financial RPCs before mutation');

    await acting(manager);
    await assert.rejects(db.query("select ps_verify_payment($1,'verified',null)", [order]), /forbidden/);
    for (const query of [
      'update riders set cash_in_hand=0 where id=$1',
      'update riders set earnings_balance=100000 where id=$1',
    ]) await assert.rejects(db.query(query, [rider]), /finance permission/);
    await assert.rejects(db.query("insert into riders(cash_in_hand) values(10000)"), /finance permission/);
    await assert.rejects(db.query("insert into shops(name) values('unauthorized shop')"), /finance permission/);
    await assert.rejects(db.query('update shops set commission_pct=0 where id=$1', [shop]), /finance permission/);
    await assert.rejects(db.query("update shops set wallet_bkash='01711111111' where id=$1", [shop]), /finance permission/);
    await assert.rejects(db.query("update orders set payment_status='verified' where id=$1", [order]), /finance permission/);
    await assert.rejects(db.query('update orders set total=0 where id=$1', [order]), /finance permission/);
    await assert.rejects(db.query("insert into orders(total) values(10000)"), /placement workflow/);
    assert.equal((await rows("update admin_users set role='super_admin' where id=$1 returning id", [manager])).length, 0);
    for (const [table, id] of [['riders', rider], ['shops', shop], ['orders', order]]) {
      assert.equal((await rows(`delete from ${table} where id=$1 returning id`, [id])).length, 0);
    }
    console.log('PASS: direct balance/commission/wallet/order/payment edits denied; manager cannot self-promote');

    for (const table of ['shop_ledger', 'shop_payouts', 'rider_settlements', 'rider_settle_claims', 'rider_payout_requests', 'rider_earnings', 'rider_disputes']) {
      const policies = await rows("select polname,polpermissive from pg_policy where polrelid=$1::regclass and polname like 'finance_%_boundary'", [table]);
      assert.equal(policies.length, 3);
      assert(policies.every(policy => !policy.polpermissive));
    }
    await root();
    const guardRider = await scalar('insert into riders default values returning id');
    const directWrites = [
      ['shop_ledger', 'shop_id,order_id,payable', '$1,$2,100', [shop, order], 'payable', 'order_id', order],
      ['shop_payouts', 'shop_id,amount', '$1,100', [shop], 'amount', 'shop_id', shop],
      ['rider_settlements', 'rider_id,amount,method', "$1,100,'cash'", [guardRider], 'amount', 'rider_id', guardRider],
      ['rider_settle_claims', 'rider_id,amount', '$1,100', [guardRider], 'amount', 'rider_id', guardRider],
      ['rider_payout_requests', 'rider_id,amount', '$1,100', [guardRider], 'amount', 'rider_id', guardRider],
      ['rider_earnings', 'rider_id,kind,amount', "$1,'adjustment',100", [guardRider], 'amount', 'rider_id', guardRider],
      ['rider_disputes', 'rider_id,category,message', "$1,'other','Synthetic fixture review'", [guardRider], 'message', 'rider_id', guardRider],
    ];
    for (const [table, columns, values, args, column, key, id] of directWrites) {
      const insert = `insert into ${table}(${columns}) values(${values})`;
      await acting(manager);
      await assert.rejects(db.query(insert, args), /row.level security/i, `${table}: manager INSERT`);
      await root();
      await db.query(insert, args);
      await acting(manager);
      assert.equal((await rows(`update ${table} set ${column}=${column} where ${key}=$1 returning ${key}`, [id])).length, 0, `${table}: manager UPDATE`);
      assert.equal((await rows(`delete from ${table} where ${key}=$1 returning ${key}`, [id])).length, 0, `${table}: manager DELETE`);
      assert(Number(await scalar(`select count(*) from ${table} where ${key}=$1`, [id])) > 0, `${table}: financial history retained`);
    }
    console.log('PASS: restrictive financial table policies override the old broad staff write policy');

    await root();
    await db.exec("insert into site_settings(key,value) values('ops','{}'),('rider_cash_cap_paisa','500000'),('finance_fixture_note','0') on conflict(key) do update set value=excluded.value");
    await acting(manager);
    assert.equal((await rows("update site_settings set value='1' where key='rider_cash_cap_paisa' returning key")).length, 0);
    assert.equal((await rows("delete from site_settings where key='ops' returning key")).length, 0);
    await assert.rejects(db.query("insert into site_settings(key,value) values('rider_new_financial_setting','1')"), /row.level security/i);
    await assert.rejects(db.query("update site_settings set key='rider_hidden_key' where key='finance_fixture_note'"), /row.level security/i);
    assert.equal((await rows("update site_settings set value='1' where key='finance_fixture_note' returning key")).length, 1);
    assert.equal((await rows('update riders set is_online=false where id=$1 returning id', [rider])).length, 1);
    console.log('PASS: protected settings cannot be inserted/renamed/updated/deleted; ordinary operational writes remain');

    // Genuine rider self-service remains usable through its definer functions.
    await acting(admin);
    await db.query("select ps_admin_adjust_rider($1,10000,'permission fixture seed')", [rider]);
    await root();
    await db.exec("insert into site_settings(key,value) values('rider_min_payout_paisa','100') on conflict(key) do update set value=excluded.value");
    await acting(riderUser);
    const payout = (await rows("select * from ps_rider_request_payout(500,'bkash','01700000000')"))[0];
    const dispute = (await rows("select * from ps_rider_raise_dispute(null,'other','Synthetic missing payment review',100)"))[0];
    await db.query("select ps_rider_settle('cash','synthetic receipt')");
    await acting(manager);
    await assert.rejects(db.query("select ps_admin_decide_rider_payout($1,'paid','fixture','fixture')", [payout.id]), /forbidden/);
    await assert.rejects(db.query("select ps_admin_resolve_dispute($1,'approve',100,'fixture')", [dispute.id]), /forbidden/);
    await acting(admin);
    assert.equal(await scalar('select ps_can_manage_finance()'), true);
    await db.query("select ps_admin_decide_rider_payout($1,'paid','fixture','fixture')", [payout.id]);
    await db.query("select ps_admin_resolve_dispute($1,'approve',100,'permission fixture')", [dispute.id]);
    await db.query("select ps_admin_reject_settle($1,'fixture rejection')", [rider]);
    await db.query("select ps_admin_settle_rider($1,'cash','fixture',false)", [rider]);
    await db.query("select ps_verify_payment($1,'verified','fixture')", [order]);
    await acting(superAdmin);
    await db.query("select ps_admin_adjust_rider($1,100,'super admin fixture')", [rider]);
    await root();
    assert.equal(await scalar('select status from rider_payout_requests where id=$1', [payout.id]), 'paid');
    assert.equal(await scalar('select decided_by from rider_payout_requests where id=$1', [payout.id]), admin);
    assert.equal(await scalar('select status from rider_disputes where id=$1', [dispute.id]), 'approved');
    assert.equal(await scalar('select payment_status from orders where id=$1', [order]), 'verified');
    assert.equal(Number(await scalar('select cash_in_hand from riders where id=$1', [rider])), 0);
    assert.equal(Number(await scalar('select earnings_balance from riders where id=$1', [rider])),
      Number(await scalar('select sum(amount) from rider_earnings where rider_id=$1', [rider])));
    assert.equal(Number(await scalar('select count(*) from rider_settlements where rider_id=$1 and settled_by=$2', [rider, admin])), 1);
    console.log('PASS: rider payout/dispute/claim submission and admin/super_admin approval/accounting remain functional');

    // A real delivery RPC, called as authenticated rider, must still let the
    // trusted accounting triggers post COD/tip/fees without direct-write power.
    await root();
    const delivery = await scalar("insert into orders(status,payment,total,tip_amount,delivery_code) values('out-for-delivery','cod',10000,500,'1234') returning id");
    const assignment = await scalar("insert into delivery_assignments(order_id,rider_id,state) values($1,$2,'picked_up') returning id", [delivery, rider]);
    const balanceBefore = Number(await scalar('select earnings_balance from riders where id=$1', [rider]));
    await acting(riderUser);
    await db.query("select ps_rider_deliver($1,'1234',null)", [assignment]);
    await root();
    assert.equal(await scalar('select status from orders where id=$1', [delivery]), 'delivered');
    assert.equal(Number(await scalar('select cash_in_hand from riders where id=$1', [rider])), 10000);
    assert(Number(await scalar('select earnings_balance from riders where id=$1', [rider])) >= balanceBefore + 500);
    assert.equal(Number(await scalar('select earnings_balance from riders where id=$1', [rider])),
      Number(await scalar('select sum(amount) from rider_earnings where rider_id=$1', [rider])));
    console.log('PASS: authenticated rider delivery still posts automatic COD and journal-balanced earnings');

    // Vendor payment-verifier branch still works for its OWN order.
    await root();
    const walletOrder = await scalar("insert into orders(shop_id,status,payment,payment_status,total) values($1,'pending','bkash','pending_verification',10000) returning id", [shop]);
    await acting(vendorUser);
    await db.query("select ps_verify_payment($1,'verified','shop fixture')", [walletOrder]);
    await root();
    assert.equal(await scalar('select payment_status from orders where id=$1', [walletOrder]), 'verified');
    console.log('PASS: own-shop wallet verification remains allowed under the existing per-shop verifier policy');

    await db.exec('set role anon');
    await assert.rejects(db.query('select ps_can_manage_finance()'), /permission denied/);
    for (const [query, args] of calls) await assert.rejects(db.query(query, args), /permission denied/);
    console.log('PASS: anon cannot execute finance helper or protected financial RPCs');
  } finally {
    await root();
  }
}
