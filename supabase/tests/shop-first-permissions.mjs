import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Continuation of the disposable real-migration money fixture after finance
 * boundaries. Every actor call actually runs as authenticated, not DB owner. */
export async function verifyShopFirstPermissions({ db, as, uuid, scalar, rows }) {
  const signature = 'ps_advance_order(uuid,ps_order_status,text)';
  const before = await scalar('select pg_get_functiondef($1::regprocedure)', [signature]);
  const sql = readFileSync(new URL('../migrations/202610250002_shop_first_fulfilment.sql', import.meta.url), 'utf8');
  const guard = sql.match(/guard text := \$guard\$([\s\S]*?)\$guard\$/)?.[1];
  assert(guard, 'actual migration must contain the fulfilment guard');
  await db.exec(sql);
  await db.exec(sql);
  assert.equal(await scalar('select pg_get_functiondef($1::regprocedure)', [signature]),
    before.replace('  if not v_is_admin then', guard + '  if not v_is_admin then'));
  console.log('PASS: shop-first migration repeat-safe; existing order machine unchanged apart from the entry boundary');

  const manager = await uuid(), admin = await uuid(), superAdmin = await uuid(), owner = await uuid(), stranger = await uuid();
  for (const [id, role] of [[manager, 'manager'], [admin, 'admin'], [superAdmin, 'super_admin']]) {
    await db.query('insert into admin_users(id,role) values($1,$2)', [id, role]);
  }
  const shop = await scalar("insert into shops(name) values('Shop-first fixture') returning id");
  await db.query('insert into vendor_users(user_id,shop_id) values($1,$2)', [owner, shop]);
  const root = async () => { await db.exec('reset role'); await as(null); };
  const acting = async (user) => { await root(); await as(user); await db.exec('set role authenticated'); };
  const order = async (status, paymentStatus = 'verified') => {
    await root();
    return scalar("insert into orders(shop_id,status,payment,payment_status) values($1,$2,'bkash',$3) returning id", [shop, status, paymentStatus]);
  };
  const advance = (id, to, note = null) => db.query('select ps_advance_order($1,$2,$3)', [id, to, note]);
  try {
    for (const [from, to] of [['pending', 'confirmed'], ['confirmed', 'preparing'], ['confirmed', 'ready-for-pickup']]) {
      const id = await order(from);
      await acting(manager);
      await assert.rejects(advance(id, to, 'Shop unreachable; support requested action'), /forbidden/);
      await acting(stranger);
      await assert.rejects(advance(id, to, 'Cannot access this business'), /forbidden/);
      await acting(admin);
      for (const reason of [null, '         ', 'too short', 'x'.repeat(301)]) {
        await assert.rejects(advance(id, to, reason), /shop fulfilment override reason/);
      }
      await root();
      assert.equal(await scalar('select status from orders where id=$1', [id]), from);
      await acting(owner);
      await advance(id, to); // normal shop operation needs no override reason
      await root();
      assert.equal(await scalar('select status from orders where id=$1', [id]), to);
      assert.equal(await scalar('select changed_by from order_status_history where order_id=$1 and status=$2 limit 1', [id, to]), owner);
    }
    console.log('PASS: own shop confirms/prepares/readies normally; Manager/stranger denied; empty/short/long admin override rejected');

    for (const actor of [admin, superAdmin]) {
      for (const [from, to] of [['pending', 'confirmed'], ['confirmed', 'preparing'], ['confirmed', 'ready-for-pickup']]) {
        const id = await order(from);
        await acting(actor);
        await advance(id, to, '  Shop unreachable; verified support request  ');
        await root();
        assert.equal(await scalar('select status from orders where id=$1', [id]), to);
        const [history] = await rows('select changed_by,note from order_status_history where order_id=$1 and status=$2', [id, to]);
        assert.equal(history.changed_by, actor);
        assert.equal(history.note, '[Shop fulfilment override] Shop unreachable; verified support request');
      }
    }
    console.log('PASS: Admin/Super Admin emergency transitions persist tagged reason and real actor in order history');

    const wallet = await order('confirmed', 'pending_verification');
    for (const actor of [owner, admin]) {
      await acting(actor);
      await assert.rejects(advance(wallet, 'ready-for-pickup', 'Support requested an urgent fulfilment review'), /payment not verified/);
    }
    await root();
    assert.equal(await scalar('select status from orders where id=$1', [wallet]), 'confirmed');
    console.log('PASS: even an authorized emergency override cannot skip wallet payment verification');

    const direct = await order('pending');
    for (const actor of [manager, admin, superAdmin]) {
      await acting(actor);
      for (const change of ["status='confirmed'", "status='delivered'", 'shop_id=null', 'is_return=true', 'is_pickup=true']) {
        await assert.rejects(db.query(`update orders set ${change} where id=$1`, [direct]), /must use the workflow/);
      }
    }
    await root();
    assert.equal(await scalar('select status from orders where id=$1', [direct]), 'pending');
    assert.equal(await scalar('select shop_id from orders where id=$1', [direct]), shop);
    console.log('PASS: direct authenticated status/routing/return/pickup edits cannot bypass shop or rider workflow');

    // Preserve historical platform-owned orders, operational cancellation and
    // Traffic Point collection: these are not shop fulfilment impersonation.
    const legacy = await scalar("insert into orders(status) values('pending') returning id");
    await acting(manager);
    await advance(legacy, 'confirmed');
    const cancelled = await order('pending');
    await acting(manager);
    await advance(cancelled, 'cancelled', 'Customer requested cancellation');
    const counter = await order('ready-for-pickup');
    await db.query('update orders set is_pickup=true where id=$1', [counter]);
    await acting(manager);
    for (const to of ['courier-assigned', 'out-for-delivery', 'delivered']) await advance(counter, to, 'Collected by the customer at Traffic Point');
    await root();
    assert.equal(await scalar('select status from orders where id=$1', [legacy]), 'confirmed');
    assert.equal(await scalar('select status from orders where id=$1', [cancelled]), 'cancelled');
    assert.equal(await scalar('select status from orders where id=$1', [counter]), 'delivered');
    console.log('PASS: platform-only fulfilment, operational cancellation and existing Traffic Point handover remain functional');

    // Active rider completion still owns its PIN and automatic accounting.
    const riderUser = await uuid();
    const rider = await scalar("insert into riders(user_id) values($1) returning id", [riderUser]);
    const delivery = await scalar("insert into orders(shop_id,status,total,payment,tip_amount,delivery_code) values($1,'out-for-delivery',10000,'cod',500,'4321') returning id", [shop]);
    const assignment = await scalar("insert into delivery_assignments(order_id,rider_id,state) values($1,$2,'picked_up') returning id", [delivery, rider]);
    await acting(admin);
    await assert.rejects(advance(delivery, 'delivered', 'Staff cannot impersonate a rider'), /rider delivery in progress/);
    await acting(riderUser);
    await assert.rejects(db.query("select ps_rider_deliver($1,'0000',null)", [assignment]), /code mismatch/);
    await db.query("select ps_rider_deliver($1,'4321',null)", [assignment]);
    await root();
    assert.equal(await scalar('select status from orders where id=$1', [delivery]), 'delivered');
    assert.equal(Number(await scalar('select cash_in_hand from riders where id=$1', [rider])), 10000);
    assert.equal(Number(await scalar('select earnings_balance from riders where id=$1', [rider])),
      Number(await scalar('select sum(amount) from rider_earnings where rider_id=$1', [rider])));
    console.log('PASS: active rider delivery still requires PIN and records COD/earnings; staff completion remains denied');

    await db.exec('set role anon');
    await assert.rejects(advance(direct, 'confirmed', 'Not authorized'), /permission denied/);
    console.log('PASS: anonymous callers cannot execute the shop fulfilment workflow');
  } finally { await root(); }
}
