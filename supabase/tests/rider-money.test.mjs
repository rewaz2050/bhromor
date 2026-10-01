/** SQL integration tests for the rider money system against embedded
 * PostgreSQL. Run: npm run test:money.
 *
 * WHY THIS FILE EXISTS (2026-10-01 audit, N1–N3): the first money tests stubbed
 * `ps_is_admin()` as `select true`, so they never noticed that the app called
 * the staff/rider RPCs with the SERVICE-ROLE client — whose `auth.uid()` is
 * NULL — and every call was answered "forbidden" in production. Here
 * `auth.uid()` is REAL: it reads the `request.jwt.claim.sub` setting exactly
 * like Supabase, `ps_is_admin()` / `ps_rider_id()` are the real definitions
 * (admin_users / riders lookups), and a session with no `sub` is the service
 * role.
 *
 * Minimal schema (only the columns the money RPCs touch); the migrations under
 * test are the real files, applied twice to prove they are repeat-safe.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
-- Real Supabase semantics: the user id comes from the JWT claim; the service
-- role key carries no sub, so auth.uid() is NULL there.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table admin_users (id uuid primary key, role text not null);
create table riders (
 id uuid primary key default gen_random_uuid(), user_id uuid, name text default 'R',
 status text default 'active', is_online boolean default true,
 cash_in_hand bigint default 0, current_load int default 0, total_deliveries int default 0
);
create type ps_order_status as enum (
 'pending', 'confirmed', 'preparing', 'ready-for-pickup',
 'courier-assigned', 'out-for-delivery', 'delivered', 'cancelled');
create table ps_order_flow (position smallint primary key, status ps_order_status unique not null);
insert into ps_order_flow values (0,'pending'),(1,'confirmed'),(2,'preparing'),(3,'ready-for-pickup'),
 (4,'courier-assigned'),(5,'out-for-delivery'),(6,'delivered');
create table shops (id uuid primary key default gen_random_uuid(), name text default 'S');
create table vendor_users (user_id uuid primary key, shop_id uuid references shops(id));
create function ps_vendor_shop() returns uuid language sql stable security definer as $$
  select shop_id from vendor_users where user_id = auth.uid() $$;
create table orders (
 id uuid primary key default gen_random_uuid(), status ps_order_status default 'confirmed',
 is_pickup boolean default false, payment_verified_at timestamptz,
 payment text default 'cod', total bigint default 0, subtotal bigint default 0,
 delivery_charge bigint default 0, tip_amount bigint default 0,
 is_return boolean default false, shop_id uuid, updated_at timestamptz,
 delivery_code text, delivery_code_attempts int default 0, delivery_code_locked_until timestamptz,
 delivery_proof_url text, delivery_proof_uploaded_at timestamptz,
 rider_id uuid, payment_status text default 'verified',
 delivery_attempts int not null default 0, delivery_failed_reason text
);
create table delivery_assignments (
 id uuid primary key default gen_random_uuid(), order_id uuid references orders(id),
 rider_id uuid references riders(id), state text default 'offered', cancelled_by text
   check (state in ('offered','accepted','picked_up','delivered','cancelled','expired'))
);
create table order_status_history(order_id uuid, status text, note text, changed_by uuid);
create table site_settings (key text primary key, value jsonb);
create table shop_ledger (order_id uuid, commission bigint default 0, payable bigint default 0);
create table shop_payouts (amount bigint default 0);

-- The REAL gates (supabase/schema.sql + 202609090005_riders.sql).
create function ps_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where id = auth.uid() and role in ('admin','super_admin','manager')) $$;
create function ps_rider_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from riders where user_id = auth.uid() $$;
-- 202609080003_place_order_rpc.sql
create function ps_setting_int(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from site_settings where key = p_key), p_default) $$;
`);

const root = new URL('../migrations/', import.meta.url);
for (const f of [
  '202609300001_rider_delivery_accounting.sql',
  '202609300002_rider_money.sql',
  '202610010001_rider_fixes_phase_a.sql',
  '202610010002_payment_verifier.sql',
]) {
  const sql = readFileSync(new URL(f, root), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // repeat-safe
}

// The REAL load-tracking trigger function (dispatch migration), so "the rider is
// released" is proven against the production definition, not a copy.
{
  const dispatch = readFileSync(new URL('202609250001_area_broadcast_dispatch.sql', root), 'utf8');
  const fn = dispatch.match(/create or replace function ps_track_rider_load\(\)[\s\S]*?end \$\$;/)[0];
  await db.exec(fn);
  await db.exec(`create trigger trg_assignments_track_load
    after insert or update or delete on delivery_assignments
    for each row execute function ps_track_rider_load();`);
}

const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await rows(sql, args))[0])[0];
/** Act as a JWT user (uuid) or, with null, as the service-role key (no sub). */
const as = (sub) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
const uuid = () => scalar('select gen_random_uuid()');

const staffId = await uuid();
const riderUser = await uuid();
const strangerUser = await uuid();
await db.query(`insert into admin_users(id, role) values ($1, 'admin')`, [staffId]);
const rider = await scalar(`insert into riders(user_id) values ($1) returning id`, [riderUser]);
await db.query(`insert into riders(user_id) values ($1)`, [strangerUser]);

try {
  // ---------------------------------------------------------------- N1–N3 --
  // Service role (no JWT sub): all three RPCs must refuse. This is the exact
  // call shape the app used before the fix — keep it failing so nobody
  // "fixes" the app back to the service client.
  await as(null);
  await assert.rejects(db.query('select ps_admin_money_summary()'), /forbidden/);
  await assert.rejects(db.query('select ps_rider_money_summary()'), /forbidden/);
  console.log('PASS: service-role (no auth.uid) is refused by both summary RPCs');

  // Staff JWT: the admin summary and the payout decision work.
  await as(staffId);
  const admin = await scalar('select ps_admin_money_summary()');
  assert.equal(admin.riderPayable, 0);
  assert.equal(admin.activeRiders, 2);
  await assert.rejects(db.query('select ps_rider_money_summary()'), /forbidden/, 'staff is not a rider');
  console.log('PASS: staff JWT reads the admin money summary');

  // Rider JWT: own summary works; admin summary does not.
  await as(riderUser);
  const mine = await scalar('select ps_rider_money_summary()');
  assert.equal(mine.balance, 0);
  await assert.rejects(db.query('select ps_admin_money_summary()'), /forbidden/, 'rider is not staff');
  console.log('PASS: rider JWT reads only their own statement');

  // End-to-end payout: a tip credit, a request by the rider, a decision by staff.
  await as(null);
  const o = await scalar(
    `insert into orders(status, payment, total, tip_amount) values ('out-for-delivery', 'cod', 100000, 5000) returning id`,
  );
  // delivery code + assignment in picked_up state
  await db.query(`update orders set delivery_code = '1234' where id = $1`, [o]);
  const asg = await scalar(
    `insert into delivery_assignments(order_id, rider_id, state) values ($1, $2, 'picked_up') returning id`,
    [o, rider],
  );
  await as(riderUser);
  await db.query(`select ps_rider_deliver($1, '1234', null)`, [asg]);
  assert.equal(await scalar('select earnings_balance from riders where id = $1', [rider]), 5000);

  const [req] = await rows(`select * from ps_rider_request_payout(5000, 'bkash', '01700000000')`);
  assert.equal(req.status, 'pending');

  // The service role cannot decide it …
  await as(null);
  await assert.rejects(
    db.query(`select ps_admin_decide_rider_payout($1, 'paid', null, 'TRX1')`, [req.id]),
    /forbidden/,
  );
  // … a non-staff rider cannot either …
  await as(strangerUser);
  await assert.rejects(
    db.query(`select ps_admin_decide_rider_payout($1, 'paid', null, 'TRX1')`, [req.id]),
    /forbidden/,
  );
  // … staff can.
  await as(staffId);
  const [decided] = await rows(`select * from ps_admin_decide_rider_payout($1, 'paid', null, 'TRX1')`, [req.id]);
  assert.equal(decided.status, 'paid');
  assert.equal(decided.decided_by, staffId, 'the staff uid is what gets audited');
  assert.equal(await scalar('select earnings_balance from riders where id = $1', [rider]), 0);
  const after = await scalar('select ps_admin_money_summary()');
  assert.equal(after.riderPayoutsPaid, 5000);
  console.log('PASS: payout request → staff decision only works with the staff JWT');

  // Wallet ≡ journal, always.
  const drift = await scalar(
    `select count(*)::int from riders r
     where r.earnings_balance <> coalesce((select sum(amount) from rider_earnings e where e.rider_id = r.id), 0)`,
  );
  assert.equal(drift, 0, 'earnings_balance equals the journal sum');
  console.log('PASS: wallet equals journal');

  // ------------------------------------------------------------------- B --
  // N4: a return leg (zero-total order, payment defaulting to 'cod') must not
  // pay a COD handling fee for cash that never existed. The base fee still
  // applies — the rider drove the leg.
  await as(null);
  await db.query(`insert into site_settings(key, value) values
    ('rider_base_fee_paisa', '4000'), ('rider_cod_handling_fee_paisa', '1000')
    on conflict (key) do update set value = excluded.value`);
  const leg = async ({ total, payment = 'cod', isReturn = false }) => {
    const ord = await scalar(
      `insert into orders(status, payment, total, is_return, delivery_code) values ('out-for-delivery', $1, $2, $3, '1234') returning id`,
      [payment, total, isReturn],
    );
    const a = await scalar(
      `insert into delivery_assignments(order_id, rider_id, state) values ($1, $2, 'picked_up') returning id`,
      [ord, rider],
    );
    await as(riderUser);
    await db.query(`select ps_rider_deliver($1, '1234', null)`, [a]);
    await as(null);
    return rows(`select kind, amount from rider_earnings where order_id = $1 order by kind`, [ord]);
  };
  const kinds = (r) => r.map((x) => `${x.kind}:${x.amount}`).join(',');
  assert.equal(kinds(await leg({ total: 50000 })), 'cod_handling:1000,delivery_fee:4000', 'real COD: both fees');
  assert.equal(kinds(await leg({ total: 0, isReturn: true })), 'delivery_fee:4000', 'return leg: base fee only');
  assert.equal(kinds(await leg({ total: 0 })), 'delivery_fee:4000', 'fully discounted COD: no cash → no handling fee');
  assert.equal(kinds(await leg({ total: 50000, payment: 'bkash' })), 'delivery_fee:4000', 'prepaid: no handling fee');
  const cash = await scalar('select cash_in_hand from riders where id = $1', [rider]);
  assert.equal(Number(cash), 150000, 'custody: the earlier ৳1000 + only the one real ৳500 COD leg');
  console.log('PASS: COD handling fee only when cash was collected; return legs get the base fee');

  // ------------------------------------------------------------------- C --
  // N5: failed delivery flow.
  const fresh = async (state = 'picked_up') => {
    await as(null);
    const ord = await scalar(
      `insert into orders(status, payment, total, delivery_code, rider_id)
       values ('out-for-delivery', 'cod', 80000, '1234', $1) returning id`, [rider]);
    const a = await scalar(
      `insert into delivery_assignments(order_id, rider_id, state) values ($1, $2, $3) returning id`,
      [ord, rider, state]);
    return { ord, a };
  };
  const load = async () => Number(await scalar('select current_load from riders where id = $1', [rider]));
  const fail = (a, reason = 'customer not answering') =>
    db.query('select * from ps_rider_failed_attempt($1, $2)', [a, reason]);
  const baseLoad = await load();

  // Only the assigned rider, only with a parcel in hand, only with a reason.
  const f1 = await fresh('accepted');
  await as(riderUser);
  await assert.rejects(fail(f1.a), /not allowed from accepted/, 'parcel not picked up yet');
  await db.query(`update delivery_assignments set state = 'picked_up' where id = $1`, [f1.a]);
  await as(strangerUser);
  await assert.rejects(fail(f1.a), /forbidden/, 'someone else\'s job');
  await as(riderUser);
  await assert.rejects(fail(f1.a, 'no'), /reason is required/);

  // Attempt 1 of 2: recorded, but the rider keeps the parcel and the job.
  const first = (await fail(f1.a, 'customer not answering')).rows[0];
  assert.equal(first.state, 'picked_up');
  assert.equal(await scalar('select delivery_attempts from orders where id = $1', [f1.ord]), 1);
  assert.equal(await scalar('select delivery_failed_at from orders where id = $1', [f1.ord]), null);
  assert.equal(await load(), baseLoad + 1, 'still carrying it');

  // Attempt 2 of 2 (default max): job ends as failed, rider freed, staff flagged.
  const last = (await fail(f1.a, 'address does not exist')).rows[0];
  assert.equal(last.state, 'failed');
  assert.equal(last.failed_reason, 'address does not exist');
  assert.equal(await load(), baseLoad, 'load slot released');
  assert.equal(await scalar('select rider_id from orders where id = $1', [f1.ord]), null, 'rider GPS no longer attached');
  assert.notEqual(await scalar('select delivery_failed_at from orders where id = $1', [f1.ord]), null);
  assert.equal(await scalar('select status from orders where id = $1', [f1.ord]), 'out-for-delivery', 'order awaits staff');
  assert.equal(Number(await scalar('select cash_in_hand from riders where id = $1', [rider])), 150000, 'no cash moved');
  await assert.rejects(fail(f1.a), /not allowed from failed/, 'a closed job cannot fail again');
  console.log('PASS: failed attempt 1 keeps the job; the final one releases the rider and flags staff');

  // The cap is a setting: 1 attempt means the first failure is final.
  await as(null);
  await db.query(`insert into site_settings(key, value) values ('delivery_max_attempts', '1')
    on conflict (key) do update set value = excluded.value`);
  const f2 = await fresh();
  await as(riderUser);
  assert.equal((await fail(f2.a)).rows[0].state, 'failed');
  await as(null);
  await db.query(`insert into site_settings(key, value) values ('delivery_max_attempts', '99')
    on conflict (key) do update set value = excluded.value`);
  const f3 = await fresh();
  await as(riderUser);
  for (let i = 0; i < 4; i += 1) assert.equal((await fail(f3.a)).rows[0].state, 'picked_up');
  assert.equal((await fail(f3.a)).rows[0].state, 'failed', 'clamped to 5');
  console.log('PASS: delivery_max_attempts is a setting, clamped to 1..5');

  // Staff resolution: staff only, only for a flagged order.
  await as(riderUser);
  await assert.rejects(db.query(`select * from ps_admin_resolve_failed_delivery($1, 'redispatch')`, [f2.ord]), /forbidden/);
  await as(null);
  await assert.rejects(db.query(`select * from ps_admin_resolve_failed_delivery($1, 'redispatch')`, [f2.ord]), /forbidden/);
  await as(staffId);
  await assert.rejects(db.query(`select * from ps_admin_resolve_failed_delivery($1, 'explode')`, [f2.ord]), /redispatch or cancel/);
  const ok = await scalar(`insert into orders(status) values ('out-for-delivery') returning id`);
  await assert.rejects(db.query(`select * from ps_admin_resolve_failed_delivery($1, 'cancel')`, [ok]), /no failed delivery/);

  const [re] = (await db.query(`select * from ps_admin_resolve_failed_delivery($1, 'redispatch', 'shop has the parcel')`, [f2.ord])).rows;
  assert.equal(re.status, 'ready-for-pickup');
  assert.equal(re.delivery_attempts, 0);
  assert.equal(re.delivery_failed_at, null);
  await assert.rejects(db.query(`select * from ps_admin_resolve_failed_delivery($1, 'cancel')`, [f2.ord]), /no failed delivery/, 'resolved once');

  const [ca] = (await db.query(`select * from ps_admin_resolve_failed_delivery($1, 'cancel', 'customer gone')`, [f3.ord])).rows;
  assert.equal(ca.status, 'cancelled');
  assert.equal(ca.delivery_failed_at, null);
  assert.match(await scalar(`select note from order_status_history where order_id = $1 and status = 'cancelled'`, [f3.ord]), /customer gone/);

  // A prepaid (verified wallet) order is flagged for refund when cancelled.
  await as(null);
  const wallet = await scalar(
    `insert into orders(status, payment, payment_status, delivery_failed_at) values ('out-for-delivery', 'bkash', 'verified', now()) returning id`);
  await as(staffId);
  await db.query(`select * from ps_admin_resolve_failed_delivery($1, 'cancel')`, [wallet]);
  assert.match(await scalar(`select note from order_status_history where order_id = $1 and status = 'cancelled'`, [wallet]), /refund the customer offline/);
  console.log('PASS: staff redispatch / cancel (prepaid cancel flags a refund)');

  // ------------------------------------------------------------------- E --
  // N8: admin cannot hand-deliver an order a rider is carrying.
  const mk = async (state, { pickup = false } = {}) => {
    await as(null);
    const ord = await scalar(
      `insert into orders(status, payment, total, is_pickup, rider_id, delivery_code)
       values ('out-for-delivery', 'cod', 60000, $1, $2, '1234') returning id`, [pickup, rider]);
    const a = await scalar(
      `insert into delivery_assignments(order_id, rider_id, state) values ($1, $2, $3) returning id`,
      [ord, rider, state]);
    return { ord, a };
  };
  const cashNow = async () => Number(await scalar('select cash_in_hand from riders where id = $1', [rider]));
  const advance = (ord, to = 'delivered') => db.query(`select ps_advance_order($1, $2::ps_order_status)`, [ord, to]);

  for (const state of ['accepted', 'picked_up']) {
    const m = await mk(state);
    await as(staffId);
    await assert.rejects(advance(m.ord), /rider delivery in progress/, `staff cannot deliver a ${state} job by hand`);
    assert.equal(await scalar('select status from orders where id = $1', [m.ord]), 'out-for-delivery');
  }
  // A counter pickup has no rider: staff may hand it over.
  const pick = await mk('cancelled', { pickup: true });
  await as(staffId);
  await advance(pick.ord);
  assert.equal(await scalar('select status from orders where id = $1', [pick.ord]), 'delivered');
  // No assignment at all (the shop's/admin's own run): allowed.
  await as(null);
  const own = await scalar(`insert into orders(status) values ('out-for-delivery') returning id`);
  await as(staffId);
  await advance(own);
  assert.equal(await scalar('select status from orders where id = $1', [own]), 'delivered');
  // The rider's own delivery path is untouched and still books the cash.
  const own2 = await mk('picked_up');
  const cashBefore = await cashNow();
  await as(riderUser);
  await db.query(`select ps_rider_deliver($1, '1234', null)`, [own2.a]);
  assert.equal(await cashNow(), cashBefore + 60000);
  assert.equal(await scalar('select status from orders where id = $1', [own2.ord]), 'delivered');
  // Staff re-sending 'delivered' on a finished order stays idempotent.
  await as(staffId);
  await advance(own2.ord);
  console.log('PASS: staff cannot hand-deliver a rider-carried order; counters, own runs and riders unaffected');

  // Release: the sanctioned override.
  const acc = await mk('accepted');
  const pk = await mk('picked_up');
  const loadBefore = await load();
  await as(riderUser);
  await assert.rejects(db.query(`select * from ps_admin_release_assignment($1, 'rider unreachable')`, [acc.a]), /forbidden/);
  await as(staffId);
  await assert.rejects(db.query(`select * from ps_admin_release_assignment($1, 'no')`, [acc.a]), /reason is required/);
  const [relA] = (await db.query(`select * from ps_admin_release_assignment($1, 'rider unreachable')`, [acc.a])).rows;
  assert.equal(relA.state, 'cancelled');
  assert.equal(relA.cancelled_by, 'withdrawn');
  const ordA = (await rows('select status, rider_id from orders where id = $1', [acc.ord]))[0];
  assert.equal(ordA.status, 'ready-for-pickup', 'never collected → back in the area queue');
  assert.equal(ordA.rider_id, null);
  const [relP] = (await db.query(`select * from ps_admin_release_assignment($1, 'bike broke down')`, [pk.a])).rows;
  assert.equal(relP.state, 'failed');
  const ordP = (await rows('select status, rider_id, delivery_failed_at from orders where id = $1', [pk.ord]))[0];
  assert.equal(ordP.status, 'out-for-delivery', 'parcel is with the rider');
  assert.equal(ordP.rider_id, null);
  assert.notEqual(ordP.delivery_failed_at, null, 'lands on the failed-delivery list');
  assert.equal(await load(), loadBefore - 2, 'both load slots freed');
  await assert.rejects(db.query(`select * from ps_admin_release_assignment($1, 'again please')`, [acc.a]), /not active/);
  // Once released nobody is carrying it, so staff may close it by hand.
  await advance(pk.ord);
  assert.equal(await scalar('select status from orders where id = $1', [pk.ord]), 'delivered');
  console.log('PASS: staff release — never-collected goes back to the queue, carried parcel lands on the failed list');

  // ------------------------------------------------------------------- D --
  // N6: who may verify a wallet payment is admin's per-shop choice.
  const shopA = await scalar(`insert into shops default values returning id`);
  const shopB = await scalar(`insert into shops default values returning id`);
  const vendorA = await uuid();
  const vendorB = await uuid();
  await db.query(`insert into vendor_users(user_id, shop_id) values ($1, $2), ($3, $4)`, [vendorA, shopA, vendorB, shopB]);
  const pending = async (shop) => {
    await as(null);
    return scalar(
      `insert into orders(status, payment, payment_status, shop_id, total)
       values ('confirmed', 'bkash', 'pending_verification', $1, 50000) returning id`, [shop]);
  };
  const setMode = async (shop, mode) => { await as(null); await db.query('update shops set payment_verifier = $2 where id = $1', [shop, mode]); };
  const verify = (id, action = 'verified') => db.query(`select * from ps_verify_payment($1, $2, 'ok')`, [id, action]);
  const payStatus = (id) => scalar('select payment_status from orders where id = $1', [id]);
  const lastNote = (id) => scalar(`select note from order_status_history where order_id = $1 order by ctid desc limit 1`, [id]);

  // default 'both' = the old behaviour: staff AND the shop may decide.
  assert.equal(await scalar('select payment_verifier from shops where id = $1', [shopA]), 'both');
  let po = await pending(shopA);
  await as(vendorA); await verify(po);
  assert.equal(await payStatus(po), 'verified');
  assert.match(await lastNote(po), /verified by the shop/);
  po = await pending(shopA);
  await as(staffId); await verify(po);
  assert.match(await lastNote(po), /verified by PROSANTI staff/);

  // platform → the shop is shut out, staff decide.
  await setMode(shopA, 'platform');
  po = await pending(shopA);
  await as(vendorA);
  await assert.rejects(verify(po), /reserved for the platform/);
  await assert.rejects(verify(po, 'rejected'), /reserved for the platform/);
  assert.equal(await payStatus(po), 'pending_verification');
  await as(staffId); await verify(po, 'rejected');
  assert.equal(await payStatus(po), 'rejected');
  assert.match(await lastNote(po), /rejected by PROSANTI staff/);

  // shop → staff are shut out, only the OWNING shop decides.
  await setMode(shopA, 'shop');
  po = await pending(shopA);
  await as(staffId);
  await assert.rejects(verify(po), /delegated to the shop/);
  await as(vendorB);
  await assert.rejects(verify(po), /forbidden/, 'another shop can never decide it');
  await as(vendorA); await verify(po);
  assert.equal(await payStatus(po), 'verified');

  // the setting is per shop: shop B is still 'both'.
  const ob = await pending(shopB);
  await as(staffId); await verify(ob);
  assert.equal(await payStatus(ob), 'verified');

  // a shop-less order is staff business; a stranger is refused; junk is rejected.
  await as(null);
  const noShop = await scalar(`insert into orders(status, payment, payment_status) values ('confirmed','nagad','pending_verification') returning id`);
  await as(staffId); await verify(noShop);
  await as(null);
  await assert.rejects(db.query(`update shops set payment_verifier = 'nobody' where id = $1`, [shopA]), /check/);
  console.log('PASS: payment verifier — platform / shop / both, per shop, default unchanged');
} finally {
  await db.close();
}
