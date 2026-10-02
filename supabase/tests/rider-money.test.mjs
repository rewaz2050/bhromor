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
 id uuid primary key default gen_random_uuid(), user_id uuid, name text default 'R', phone text default '01700000000', vehicle text default 'bike',
 status text default 'active', is_online boolean default true,
 cash_in_hand bigint default 0, current_load int default 0, total_deliveries int default 0,
 zone_ids text[] default '{}', rating_avg numeric default 0, rating_count int default 0, avg_delivery_minutes int, created_at timestamptz default now()
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
 is_pickup boolean default false, payment_verified_at timestamptz, discount bigint default 0,
 payment text default 'cod', total bigint default 0, subtotal bigint default 0,
 delivery_charge bigint default 0, tip_amount bigint default 0,
 is_return boolean default false, shop_id uuid, updated_at timestamptz,
 delivery_code text, delivery_code_attempts int default 0, delivery_code_locked_until timestamptz,
 delivery_proof_url text, delivery_proof_uploaded_at timestamptz,
 rider_id uuid, payment_status text default 'verified',
 delivery_attempts int not null default 0, delivery_failed_reason text, order_no text, area text,
 created_at timestamptz default now()
);
create table delivery_assignments (
 id uuid primary key default gen_random_uuid(), order_id uuid references orders(id),
 rider_id uuid references riders(id), state text default 'offered', cancelled_by text, offered_at timestamptz default now()
   check (state in ('offered','accepted','picked_up','delivered','cancelled','expired'))
);
create table order_status_history(order_id uuid, status text, note text, changed_by uuid, created_at timestamptz default now());
create table site_settings (key text primary key, value jsonb);
create table shop_ledger (shop_id uuid, order_id uuid, commission bigint default 0, payable bigint default 0);
create table shop_payouts (id uuid primary key default gen_random_uuid(), shop_id uuid, amount bigint default 0, method text default 'bank', reference text default '', paid_by uuid, paid_at timestamptz default now());
-- 202609090005 + 202609250004 (settlement tables; ps_admin_settle_rider writes both).
create table rider_settlements (
 id uuid primary key default gen_random_uuid(), rider_id uuid not null references riders(id),
 amount int not null, method text not null default 'cash', reference text not null default '',
 settled_at timestamptz not null default now(), settled_by uuid
);
create table rider_settle_claims (
 id uuid primary key default gen_random_uuid(), rider_id uuid not null references riders(id),
 amount bigint not null, method text not null default 'cash', reference text not null default '', note text,
 status text not null default 'pending', decided_at timestamptz, decided_by uuid, created_at timestamptz not null default now()
);

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
// The REAL pre-netting settle function (202609250004), so 202610010004's drop +
// re-create is exercised exactly like production.
{
  const settle = readFileSync(new URL('202609250004_settle_claims.sql', root), 'utf8');
  const fn = settle.match(/create or replace function ps_admin_settle_rider\([\s\S]*?end \$\$;/)[0];
  await db.exec(fn);
}
for (const f of [
  '202609300001_rider_delivery_accounting.sql',
  '202609300002_rider_money.sql',
  '202610010001_rider_fixes_phase_a.sql',
  '202610010002_payment_verifier.sql',
  '202610010003_money_pnl.sql',
  '202610010004_cod_netting.sql',
  '202610010005_vendor_rider_view.sql',
  '202610010006_money_audit.sql',
  '202610010007_money_daily.sql',
  '202610020001_rider_inbox.sql',
  '202610020002_admin_rider_overview.sql',
  '202610020003_dispatch_settings.sql',
  '202610020004_rider_push.sql',
  '202610020005_licence_expiry.sql',
  '202610020006_rider_scorecards.sql',
  '202610020007_rider_disputes.sql',
  '202610020008_rate_limit.sql',
  '202609250008_delivery_ratings.sql',
  '202610020009_delivery_feedback.sql',
  '202610020010_rider_incentives.sql',
  '202610020011_dispatch_followups.sql',
  '202610020012_failed_fee_weekly_bonus.sql',
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

  // ------------------------------------------------------------------- G --
  // N7: net P&L from the ledgers.
  const pnl = async (from = null, to = null) => {
    const r = await db.query('select ps_admin_money_pnl($1, $2) as j', [from, to]);
    return typeof r.rows[0].j === 'string' ? JSON.parse(r.rows[0].j) : r.rows[0].j;
  };
  await as(null);
  await assert.rejects(pnl(), /forbidden/, 'service role (no uid) is refused');
  await as(riderUser);
  await assert.rejects(pnl(), /forbidden/, 'a rider is refused');

  await as(null);
  // wipe what earlier sections left, so the figures below are exact.
  await db.exec(`delete from rider_earnings; delete from shop_ledger; delete from delivery_assignments where order_id in (select id from orders where status = 'delivered'); delete from orders where status = 'delivered'`);
  const mkDelivered = async (o) => {
    const id = await scalar(
      `insert into orders(status, delivery_charge, discount, tip_amount, is_return, updated_at, payment)
       values ('delivered', $1, $2, $3, $4, $5::timestamptz, 'cod') returning id`,
      [o.delivery, o.discount ?? 0, o.tip ?? 0, o.ret ?? false, o.at]);
    // delivery moment: from the history line (like orders delivered by staff)
    await db.query(`insert into order_status_history(order_id, status, note) values ($1, 'delivered', null)`, [id]);
    await db.query(`update order_status_history set created_at = $2::timestamptz where order_id = $1`, [id, o.at]);
    await db.query('insert into shop_ledger(order_id, commission, payable) values ($1, $2, 0)', [id, o.commission ?? 0]);
    return id;
  };
  const recent = new Date(Date.now() - 2 * 86400000).toISOString();
  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  const d1 = await mkDelivered({ delivery: 6000, discount: 1000, tip: 2000, commission: 5000, at: recent });
  const d2 = await mkDelivered({ delivery: 6000, commission: 3000, at: recent });
  const dOld = await mkDelivered({ delivery: 9999, commission: 7777, at: old });
  await db.query(`insert into rider_earnings(rider_id, order_id, kind, amount) values
    ($1, $2, 'delivery_fee', 4000), ($1, $2, 'tip', 2000), ($1, $3, 'delivery_fee', 4000)`, [rider, d1, d2]);
  await db.query(`insert into rider_earnings(rider_id, order_id, kind, amount, created_at)
    values ($1, $2, 'delivery_fee', 4000, $3)`, [rider, dOld, old]);
  await db.query(`insert into rider_earnings(rider_id, order_id, kind, amount) values ($1, null, 'adjustment', -500)`, [rider]);

  await as(staffId);
  const week = await pnl(new Date(Date.now() - 7 * 86400000).toISOString());
  assert.deepEqual(
    { n: week.deliveredOrders, c: week.commission, d: week.deliveryIncome, f: week.riderFees, a: week.riderAdjustments,
      disc: week.discountsGiven, shop: week.shopFundedDiscounts, tc: week.tipsCollected, tr: week.tipsToRiders },
    { n: 2, c: 8000, d: 12000, f: 8000, a: -500, disc: 1000, shop: 0, tc: 2000, tr: 2000 },
    'the window excludes the 60-day-old order and its fee',
  );
  const all = await pnl();
  assert.equal(all.deliveredOrders, 3);
  assert.equal(all.commission, 15777);
  assert.equal(all.riderFees, 12000);

  // shop-funded promo (202609280003 column present): only the platform's part counts.
  await as(null);
  await db.query('alter table shop_ledger add column promo_discount bigint not null default 0');
  await db.query('update shop_ledger set promo_discount = 400 where order_id = $1', [d1]);
  await as(staffId);
  const withPromo = await pnl(new Date(Date.now() - 7 * 86400000).toISOString());
  assert.equal(withPromo.shopFundedDiscounts, 400);

  // a return leg is counted separately, not as a delivered order
  await as(null);
  await mkDelivered({ delivery: 0, ret: true, at: recent });
  await as(staffId);
  const withReturn = await pnl(new Date(Date.now() - 7 * 86400000).toISOString());
  assert.equal(withReturn.deliveredOrders, 2);
  assert.equal(withReturn.returnLegs, 1);
  console.log('PASS: net P&L — windows, shop-funded promo, adjustments, return legs, staff-only');

  // K: COD netting against the rider wallet on settle.
  await as(null);
  const kRider = await scalar(`insert into riders(user_id, cash_in_hand) values ($1, 300000) returning id`, [await uuid()]);
  const kBal = async () => Number(await scalar('select earnings_balance from riders where id = $1', [kRider]));
  const kCash = async () => Number(await scalar('select cash_in_hand from riders where id = $1', [kRider]));
  await db.query(`update riders set earnings_balance = 120000 where id = $1`, [kRider]);
  await db.query(`insert into rider_earnings(rider_id, kind, amount, note) values ($1, 'adjustment', 120000, 'seed')`, [kRider]);

  // service role / a rider cannot settle at all
  await assert.rejects(db.query(`select * from ps_admin_settle_rider($1, 'cash', '', true)`, [kRider]), /forbidden/);

  await as(staffId);
  // default (no netting) keeps the old behaviour: wallet untouched
  const kPlain = await scalar(`insert into riders(user_id, cash_in_hand, earnings_balance) values ($1, 1000, 500) returning id`, [await uuid()]);
  await db.query(`select * from ps_admin_settle_rider($1, 'cash', 'plain')`, [kPlain]);
  assert.equal(Number(await scalar('select earnings_balance from riders where id = $1', [kPlain])), 500, 'no netting by default');
  assert.equal(Number(await scalar('select netted_amount from rider_settlements where rider_id = $1', [kPlain])), 0);

  // netting: cash 300000 vs wallet 120000 -> net 120000, rider hands over 180000
  const [st] = await rows(`select * from ps_admin_settle_rider($1, 'cash', 'visit', true)`, [kRider]);
  assert.equal(Number(st.amount), 300000, 'the whole cash debt is cleared');
  assert.equal(Number(st.netted_amount), 120000);
  assert.equal(st.reference, 'visit');
  assert.equal(await kCash(), 0);
  assert.equal(await kBal(), 0, 'wallet debited by the netted part');
  const journal = Number(await scalar(`select coalesce(sum(amount),0) from rider_earnings where rider_id = $1`, [kRider]));
  assert.equal(journal, 0, 'earnings_balance still equals the journal');
  assert.equal(Number(await scalar(`select count(*) from rider_earnings where rider_id = $1 and kind = 'cod_netting' and settlement_id = $2`, [kRider, st.id])), 1);

  // wallet bigger than cash: net only the cash, the rest stays payable
  await as(null);
  const kBig = await scalar(`insert into riders(user_id, cash_in_hand, earnings_balance) values ($1, 50000, 200000) returning id`, [await uuid()]);
  await db.query(`insert into rider_earnings(rider_id, kind, amount) values ($1, 'adjustment', 200000)`, [kBig]);
  await as(staffId);
  const [st2] = await rows(`select * from ps_admin_settle_rider($1, 'cash', '', true)`, [kBig]);
  assert.equal(Number(st2.netted_amount), 50000);
  assert.equal(Number(await scalar('select earnings_balance from riders where id = $1', [kBig])), 150000);

  // empty wallet: netting requested but nothing to net -> a normal settle
  await as(null);
  const kEmpty = await scalar(`insert into riders(user_id, cash_in_hand) values ($1, 7000) returning id`, [await uuid()]);
  await as(staffId);
  const [st3] = await rows(`select * from ps_admin_settle_rider($1, 'cash', '', true)`, [kEmpty]);
  assert.equal(Number(st3.netted_amount), 0);
  assert.equal(Number(await scalar(`select count(*) from rider_earnings where rider_id = $1`, [kEmpty])), 0);

  // netting is not income, and cannot be forged by hand
  await as(null);
  await assert.rejects(db.query(`insert into rider_earnings(rider_id, kind, amount) values ($1, 'cod_netting', -5)`, [kRider]), /netting_check|violates/);
  console.log('PASS: COD netting — opt-in, capped at the wallet, journal-balanced, staff-only');

  // H: the owning shop sees the rider on its order — and nobody else does.
  await as(null);
  const hShopA = await scalar(`insert into shops(name) values ('A') returning id`);
  const hShopB = await scalar(`insert into shops(name) values ('B') returning id`);
  const hVendorA = await uuid();
  const hVendorB = await uuid();
  await db.query(`insert into vendor_users(user_id, shop_id) values ($1, $2), ($3, $4)`, [hVendorA, hShopA, hVendorB, hShopB]);
  const hRider = await scalar(`insert into riders(user_id, name, phone, vehicle) values ($1, 'Rahim', '01711111111', 'scooter') returning id`, [await uuid()]);
  const hOrder = await scalar(`insert into orders(status, shop_id) values ('ready-for-pickup', $1) returning id`, [hShopA]);
  const hAsg = await scalar(`insert into delivery_assignments(order_id, rider_id, state) values ($1, $2, 'offered') returning id`, [hOrder, hRider]);
  const seen = async (sub) => { await as(sub); return (await rows('select ps_vendor_order_rider($1) as r', [hOrder]))[0].r; };

  assert.equal(await seen(hVendorA), null, 'an unaccepted offer is not shown');
  await as(null);
  await db.query(`update delivery_assignments set state = 'accepted' where id = $1`, [hAsg]);
  assert.deepEqual(await seen(hVendorA), { name: 'Rahim', phone: '01711111111', vehicle: 'scooter', state: 'accepted' });
  assert.equal(await seen(hVendorB), null, 'another shop sees nothing about this order');
  await as(null);
  await db.query(`update delivery_assignments set state = 'picked_up' where id = $1`, [hAsg]);
  assert.equal((await seen(hVendorA)).state, 'picked_up');
  await as(null);
  await db.query(`update delivery_assignments set state = 'delivered' where id = $1`, [hAsg]);
  assert.equal(await seen(hVendorA), null, 'a finished job no longer exposes the rider phone');
  // service role / rider / customer (no vendor row) are refused
  await as(null);
  await assert.rejects(db.query('select ps_vendor_order_rider($1)', [hOrder]), /forbidden/);
  await as(riderUser);
  await assert.rejects(db.query('select ps_vendor_order_rider($1)', [hOrder]), /forbidden/);
  console.log('PASS: vendor rider view — own shop only, active jobs only');

  // T: every money approval leaves an append-only line, written by triggers.
  const audit = (event) => rows(`select * from money_audit_log where event = $1 order by at, id`, [event]);

  // earlier blocks (A–K) already moved money as staff: payout paid, settle with netting
  const paid = (await audit('rider_payout_paid'))[0];
  assert.ok(paid, 'the staff payout decision was logged');
  assert.equal(paid.actor_id, staffId);
  assert.equal(paid.detail.reference, 'TRX1');
  const netted = (await audit('rider_settle')).find((r) => Number(r.detail.netted) === 120000);
  assert.ok(netted, 'the netted settlement is logged with its netted part');
  assert.equal(netted.actor_id, staffId);
  assert.equal(Number(netted.amount), 300000);

  // shop payout, payment decision, rate + wallet changes — each as staff
  await as(staffId);
  const tShop = await scalar(`insert into shops(name) values ('T') returning id`);
  await db.query(`insert into shop_payouts(shop_id, amount, method, reference) values ($1, 90000, 'bkash', 'SP-1')`, [tShop]);
  const sp = (await audit('shop_payout'))[0];
  assert.equal(Number(sp.amount), 90000);
  assert.equal(sp.subject_id, tShop);
  assert.equal(sp.actor_id, staffId);

  await as(null);
  const tOrder = await scalar(`insert into orders(payment, payment_status, total) values ('bkash', 'pending_verification', 55000) returning id`);
  await as(staffId);
  await db.query(`update orders set payment_status = 'verified' where id = $1`, [tOrder]);
  const pv = (await audit('payment_verified')).find((r) => r.subject_id === tOrder);
  assert.ok(pv && Number(pv.amount) === 55000 && pv.actor_id === staffId);
  // a verified COD order that never was pending leaves no payment line
  await db.query(`update orders set payment_status = 'verified' where id = $1`, [tOrder]);
  assert.equal((await audit('payment_verified')).filter((r) => r.subject_id === tOrder).length, 1, 'no change, no line');

  await db.query(`insert into site_settings(key, value) values ('rider_base_fee_paisa', '4000'::jsonb)
                  on conflict (key) do update set value = excluded.value`);
  await db.query(`update site_settings set value = '5000'::jsonb where key = 'rider_base_fee_paisa'`);
  const rc = (await audit('rate_change')).filter((r) => r.subject_id === 'rider_base_fee_paisa');
  const lastRate = rc[rc.length - 1];
  assert.deepEqual([lastRate.detail.from, lastRate.detail.to], [4000, 5000]);

  // J: the dispatch-rule keys are audited like the pay rates
  for (const [k, a, b] of [['rider_cash_cap_paisa', 500000, 300000], ['offer_ttl_seconds', 90, 60], ['delivery_max_attempts', 2, 3]]) {
    await db.query(`insert into site_settings(key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value`, [k, String(a)]);
    await db.query(`update site_settings set value = $2::jsonb where key = $1`, [k, String(b)]);
    const jr = (await audit('rate_change')).filter((r) => r.subject_id === k);
    // (rows written in the same millisecond tie on `at`, so match the pair, not "the last row")
    assert.ok(jr.some((r) => r.detail.from === a && r.detail.to === b), k + ' change is logged');
  }

  await db.query(`insert into site_settings(key, value) values ('ops', '{"wallets":{"bkash":"01711111111"}}'::jsonb)
                  on conflict (key) do update set value = excluded.value`);
  await db.query(`update site_settings set value = '{"wallets":{"bkash":"01799999999","nagad":"01788888888"}}'::jsonb where key = 'ops'`);
  const wc = await audit('wallet_numbers_changed');
  assert.ok(wc.length >= 2);
  assert.deepEqual(wc[wc.length - 1].detail.methods, ['bkash', 'nagad']);
  assert.ok(!JSON.stringify(wc).includes('0179'), 'the wallet numbers themselves are never logged');
  await db.query(`update site_settings set value = jsonb_set(value, '{promo}', 'true') where key = 'ops'`);
  assert.equal((await audit('wallet_numbers_changed')).length, wc.length, 'unrelated ops edits are not logged');

  // a service-role insert is still attributed to the person the row names
  await as(null);
  await db.query(`insert into shop_payouts(shop_id, amount, reference, paid_by) values ($1, 1000, 'SP-2', $2)`, [tShop, staffId]);
  const viaService = (await audit('shop_payout')).find((r) => r.detail.reference === 'SP-2');
  assert.equal(viaService.actor_id, staffId, 'paid_by attributes a service-role write');

  // append-only, for every role
  await as(null);
  await assert.rejects(db.query(`update money_audit_log set amount = 1`), /append-only/);
  await assert.rejects(db.query(`delete from money_audit_log`), /append-only/);
  console.log('PASS: money audit trail — triggers log approvals, never wallet numbers, append-only');

  // U: the daily reconciliation — one Dhaka day's flows + checks that must be clean.
  await as(null);
  const uDay = '2026-01-15';
  const uAt = '2026-01-15T10:00:00+06:00';
  const uPrev = '2026-01-14T22:00:00+06:00';
  const uShop = await scalar(`insert into shops(name) values ('U') returning id`);
  const uRider = await scalar(`insert into riders(user_id, name) values ($1, 'U') returning id`, [await uuid()]);
  const uOrder = async (o) => {
    const id = await scalar(
      `insert into orders(status, total, delivery_charge, payment, is_return, shop_id, updated_at)
       values ('delivered', $1, $2, $3, $4, $5, $6::timestamptz) returning id`,
      [o.total, o.delivery ?? 0, o.payment ?? 'cod', o.ret ?? false, uShop, o.at ?? uAt]);
    await db.query(`insert into order_status_history(order_id, status) values ($1, 'delivered')`, [id]);
    await db.query(`update order_status_history set created_at = $2::timestamptz where order_id = $1`, [id, o.at ?? uAt]);
    if (o.byRider) {
      await db.query(`insert into delivery_assignments(order_id, rider_id, state, delivered_at) values ($1, $2, 'delivered', $3::timestamptz)`, [id, uRider, o.at ?? uAt]);
    }
    if (!o.noLedger) await db.query('insert into shop_ledger(shop_id, order_id, commission, payable) values ($4, $1, $2, $3)', [id, o.commission ?? 0, o.payable ?? 0, uShop]);
    return id;
  };
  await uOrder({ total: 50000, delivery: 5000, commission: 4000, payable: 40000, byRider: true });
  await uOrder({ total: 30000, delivery: 3000, payment: 'bkash', commission: 2000, payable: 25000 });
  await uOrder({ total: 0, ret: true });
  await uOrder({ total: 99999, delivery: 9999, commission: 9999, payable: 1, at: uPrev, byRider: true }); // the day before
  await db.query(`insert into rider_earnings(rider_id, order_id, kind, amount, created_at) values
    ($1, null, 'incentive', 4000, $2::timestamptz), ($1, null, 'adjustment', -200, $2::timestamptz)`, [uRider, uAt]);
  await db.query(`insert into rider_payout_requests(rider_id, amount, status, requested_at, decided_at) values
    ($1, 2000, 'paid', $2::timestamptz, $2::timestamptz)`, [uRider, uAt]);
  await db.query(`insert into rider_settlements(rider_id, amount, netted_amount, settled_at) values ($1, 30000, 5000, $2::timestamptz)`, [uRider, uAt]);
  await db.query(`insert into shop_payouts(shop_id, amount, paid_at) values ($1, 10000, $2::timestamptz)`, [uShop, uAt]);

  const daily = async (day) => (await rows('select ps_admin_money_daily($1::date) as r', [day]))[0].r;
  await as(staffId);
  const rep = await daily(uDay);
  assert.equal(rep.day, uDay);
  assert.deepEqual(
    { n: rep.flows.deliveredOrders, ret: rep.flows.returnLegs, v: rep.flows.orderValue, cod: rep.flows.codCollectedByRiders,
      w: rep.flows.walletPaidOrders, c: rep.flows.commission, d: rep.flows.deliveryIncome, acc: rep.flows.shopPayableAccrued,
      sp: rep.flows.shopPayoutsPaid, e: rep.flows.riderEarned, a: rep.flows.riderAdjustments, rq: rep.flows.riderPayoutsRequested,
      rp: rep.flows.riderPayoutsPaid, sc: rep.flows.settlementsCount, st: rep.flows.settlementsTotal,
      sn: rep.flows.settlementsNetted, ch: rep.flows.cashHandedIn },
    { n: 2, ret: 1, v: 80000, cod: 50000, w: 30000, c: 6000, d: 8000, acc: 65000, sp: 10000, e: 4000, a: -200, rq: 2000,
      rp: 2000, sc: 1, st: 30000, sn: 5000, ch: 25000 },
    'the day shows exactly its own flows (the day before is excluded)',
  );
  const check = (r, key) => r.checks.find((c) => c.key === key);
  assert.equal(rep.checks.length, 8);

  // data left by earlier sections trips the checks — that is the point of them
  assert.ok(check(rep, 'wallet_journal').count > 0 && !check(rep, 'wallet_journal').ok, 'a wallet that is not its journal is caught');
  assert.ok(!check(rep, 'shop_overpaid').ok, 'a shop paid more than it earned is caught');
  // …and once the data is repaired every check is clean
  await as(null);
  await db.query(`update riders set earnings_balance = coalesce((select sum(amount) from rider_earnings e where e.rider_id = riders.id), 0)`);
  await db.exec(`delete from shop_payouts where shop_id <> '${uShop}'; delete from rider_settle_claims; delete from rider_payout_requests where status = 'pending'; update orders set delivery_failed_at = null`);
  await as(staffId);
  const clean = await daily(uDay);
  assert.deepEqual(clean.checks.filter((c) => !c.ok).map((c) => c.key), [], 'all checks clean after repair');

  // each check flips on its own fault
  await as(null);
  await db.query(`update riders set cash_in_hand = -5 where id = $1`, [uRider]);
  const noLedger = await uOrder({ total: 100, noLedger: true, at: new Date().toISOString() });
  await db.query(`insert into rider_payout_requests(rider_id, amount, status, requested_at) values ($1, 100, 'pending', now() - interval '3 days')`, [uRider]);
  await db.query(`insert into rider_settle_claims(rider_id, amount, status) values ($1, 100, 'pending')`, [uRider]);
  await db.query(`update rider_settle_claims set created_at = now() - interval '3 days'`);
  await db.query(`insert into orders(status, delivery_failed_at) values ('out-for-delivery', now())`);
  await db.query(`insert into orders(status, payment, payment_status, created_at) values ('pending', 'bkash', 'pending_verification', now() - interval '2 days')`);
  await as(staffId);
  const bad = await daily(null);
  const failing = bad.checks.filter((c) => !c.ok).map((c) => c.key).sort();
  assert.deepEqual(failing, ['delivered_no_ledger', 'negative_cash', 'open_failed_deliveries', 'stale_claims', 'stale_payment_verification', 'stale_payouts']);
  assert.deepEqual(check(bad, 'delivered_no_ledger').sample, [noLedger]);

  // only staff may read it
  await as(null);
  await assert.rejects(db.query('select ps_admin_money_daily(null)'), /forbidden/);
  await as(riderUser);
  await assert.rejects(db.query('select ps_admin_money_daily(null)'), /forbidden/);
  console.log('PASS: daily reconciliation — day flows, 8 checks catch real faults, staff-only');

  // ---- C4 / O: rider inbox — staff-only writes through the RPCs, never raw table access
  await as(null);
  await assert.rejects(db.query(`select ps_admin_post_announcement('x')`), /forbidden/);
  await as(riderUser);
  await assert.rejects(db.query(`select ps_admin_post_announcement('x')`), /forbidden/);
  await assert.rejects(db.query(`select ps_admin_delete_announcement(gen_random_uuid())`), /forbidden/);
  await as(staffId);
  const wAll = await scalar(`select ps_admin_post_announcement('  Road closed  ', 'Zindabazar', 'important', null, 24)`);
  const wOne = await scalar(`select ps_admin_post_announcement('Blurry KYC', '', 'bogus', $1, null)`, [rider]);
  const wRows = await rows(`select id, title, severity, rider_id, created_by, expires_at from rider_announcements order by created_at, title`);
  const wA = wRows.find((r) => r.id === wAll);
  assert.equal(wA.title, 'Road closed', 'title trimmed');
  assert.equal(wA.severity, 'important');
  assert.equal(wA.rider_id, null);
  assert.equal(wA.created_by, staffId, 'author recorded from the real auth.uid()');
  assert.ok(wA.expires_at, '24h expiry set');
  const wB = wRows.find((r) => r.id === wOne);
  assert.equal(wB.severity, 'info', 'an unknown severity falls back to info');
  assert.equal(wB.expires_at, null);
  await assert.rejects(db.query(`select ps_admin_post_announcement('', 'b')`), /invalid_title/);
  await assert.rejects(db.query(`select ps_admin_post_announcement('t', 'b', 'info', gen_random_uuid(), null)`), /rider_not_found/);
  await db.query(`select ps_admin_delete_announcement($1)`, [wOne]);
  assert.equal(Number(await scalar(`select count(*) from rider_announcements where id = $1`, [wOne])), 0);
  // a deleted rider takes their personal messages with them
  const wGone = await scalar(`insert into riders(user_id, name) values ($1, 'W') returning id`, [await uuid()]);
  await db.query(`select ps_admin_post_announcement('personal', '', 'info', $1, null)`, [wGone]);
  await as(null);
  await db.query(`delete from riders where id = $1`, [wGone]);
  assert.equal(Number(await scalar(`select count(*) from rider_announcements where title = 'personal'`)), 0);
  console.log('PASS: rider inbox — staff-only post/delete, author from auth.uid(), cascade on rider delete');

  // ---- L: admin rider overview — facts for COD risk, staff-only
  await as(null);
  const xRider = await scalar(`insert into riders(user_id, name, cash_in_hand) values ($1, 'X', 0) returning id`, [await uuid()]);
  const xShop = await scalar(`insert into shops(name) values ('X Shop') returning id`);
  const xOrder = async (payment, total, isReturn = false) =>
    scalar(`insert into orders(status, payment, total, is_return, shop_id, order_no, area) values ('delivered', $1, $2, $3, $4, 'PS-X' || floor(random()*100000)::int, 'Kandirpar') returning id`, [payment, total, isReturn, xShop]);
  const xDeliver = async (order, at) =>
    db.query(`insert into delivery_assignments(order_id, rider_id, state, delivered_at, offered_at) values ($1, $2, 'delivered', $3::timestamptz, $3::timestamptz)`, [order, xRider, at]);
  const xOld = await xOrder('cod', 40000);
  await xDeliver(xOld, new Date(Date.now() - 5 * 86400000).toISOString());        // before the settlement
  await db.query(`insert into rider_settlements(rider_id, amount, netted_amount, settled_at) values ($1, 40000, 10000, now() - interval '3 days')`, [xRider]);
  const xA = await xOrder('cod', 70000);
  await xDeliver(xA, new Date(Date.now() - 2 * 86400000).toISOString());          // unsettled COD, the oldest
  const xB = await xOrder('cod', 30000);
  await xDeliver(xB, new Date(Date.now() - 3600000).toISOString());               // unsettled COD
  await xDeliver(await xOrder('bkash', 90000), new Date(Date.now() - 3600000).toISOString()); // prepaid: not cash
  await xDeliver(await xOrder('cod', 12000, true), new Date(Date.now() - 3600000).toISOString()); // return leg: not cash
  const xF = await xOrder('cod', 5000);
  await db.query(`insert into delivery_assignments(order_id, rider_id, state, failed_reason, offered_at) values ($1, $2, 'failed', 'no answer', now() - interval '1 day')`, [xF, xRider]);
  await db.query(`insert into delivery_assignments(order_id, rider_id, state, cancelled_by, offered_at) values ($1, $2, 'cancelled', 'rider_decline', now())`, [xF, xRider]);
  await db.query(`insert into delivery_assignments(order_id, rider_id, state, offered_at) values ($1, $2, 'expired', now())`, [xF, xRider]);
  await db.query(`insert into rider_settle_claims(rider_id, amount, status, note) values ($1, 100, 'rejected', 'TRX mismatch')`, [xRider]);
  await db.query(`insert into rider_settle_claims(rider_id, amount, method, reference) values ($1, 500, 'bkash', 'TX1')`, [xRider]);
  await db.query(`update riders set cash_in_hand = 100000 where id = $1`, [xRider]);
  await db.query(`insert into rider_earnings(rider_id, order_id, kind, amount, note) values ($1, $2, 'delivery_fee', 4000, '')`, [xRider, xA]);
  await db.query(`insert into rider_earnings(rider_id, order_id, kind, amount, note) values ($1, $2, 'tip', 1000, '')`, [xRider, xA]);
  await db.query(`insert into rider_earnings(rider_id, order_id, kind, amount, note, settlement_id) values ($1, null, 'cod_netting', -2500, 'netted', (select id from rider_settlements where rider_id = $1 limit 1))`, [xRider]);

  await as(riderUser);
  await assert.rejects(db.query(`select ps_admin_rider_overview($1)`, [xRider]), /forbidden/);
  await as(null);
  await assert.rejects(db.query(`select ps_admin_rider_overview($1)`, [xRider]), /forbidden/);
  await as(staffId);
  await assert.rejects(db.query(`select ps_admin_rider_overview(gen_random_uuid())`), /rider_not_found/);
  const xo = JSON.parse(JSON.stringify(await scalar(`select ps_admin_rider_overview($1)`, [xRider])));
  assert.equal(xo.rider.name, 'X');
  assert.equal(xo.risk.cashInHand, 100000);
  assert.equal(xo.risk.cashLimit, 500000);
  assert.equal(xo.risk.codCountSinceSettle, 2, 'only COD deliveries after the last settlement; no prepaid, no return leg, none before');
  assert.equal(xo.risk.codValueSinceSettle, 100000);
  const xHours = (Date.now() - Date.parse(xo.risk.oldestCodAt)) / 3600000;
  assert.ok(xHours > 46 && xHours < 50, `oldest unsettled COD is about 2 days old, got ${xHours}h`);
  assert.equal(xo.risk.pendingClaim.amount, 500);
  assert.equal(xo.risk.rejectedClaims30, 1);
  assert.deepEqual([xo.money.lifetimeEarned, xo.money.nettedAgainstCash, xo.money.handedIn], [5000, 2500, 40000]);
  assert.equal(xo.performance.delivered30, 5);
  assert.equal(xo.performance.failed30, 1);
  assert.equal(xo.performance.declined30, 1);
  assert.equal(xo.performance.expired30, 1);
  assert.equal(xo.journal.length, 3);
  assert.equal(xo.settlements[0].nettedAmount, 10000);
  assert.ok(xo.claims.length === 2 && xo.trips.length === 6);
  assert.ok(xo.trips.find((t) => t.state === 'failed').failedReason === 'no answer');
  // a rider with no cash in hand has no cash-risk facts
  await as(null);
  await db.query(`update riders set cash_in_hand = 0 where id = $1`, [xRider]);
  await as(staffId);
  const xz = JSON.parse(JSON.stringify(await scalar(`select ps_admin_rider_overview($1)`, [xRider])));
  assert.equal(xz.risk.codCountSinceSettle, 0);
  assert.equal(xz.risk.oldestCodAt, null);
  console.log('PASS: admin rider overview — COD-since-settlement facts, performance, ledgers, staff-only');

  // ---- M: rider scorecards — facts for the board and the auto-suspend sweep
  await as(null);
  await db.query(`update riders set cash_in_hand = 100000 where id = $1`, [xRider]);
  assert.equal(await scalar(`select has_function_privilege('authenticated','ps_rider_scorecards_raw(int)','execute')`), false, 'raw reader is service-role only');
  assert.equal(await scalar(`select has_function_privilege('anon','ps_rider_scorecards_raw(int)','execute')`), false);
  assert.equal(await scalar(`select has_function_privilege('service_role','ps_rider_scorecards_raw(int)','execute')`), true);
  await as(riderUser);
  await assert.rejects(db.query(`select ps_admin_rider_scorecards(30)`), /forbidden/);
  await as(null);
  await assert.rejects(db.query(`select ps_admin_rider_scorecards(30)`), /forbidden/, 'no staff JWT → refused (the sweep uses the raw reader)');
  const mRaw = JSON.parse(JSON.stringify(await scalar(`select ps_rider_scorecards_raw(30)`)));
  const mCard = mRaw.find((c) => c.id === xRider);
  assert.ok(mCard, 'the active rider is listed');
  assert.deepEqual([mCard.delivered, mCard.failed, mCard.declined, mCard.expired], [5, 1, 1, 1]);
  assert.equal(mCard.pendingClaim, true, 'a waiting settle claim is visible (protects from auto-suspend)');
  assert.equal(mCard.cashInHand, 100000);
  const mHours = (Date.now() - Date.parse(mCard.oldestCodAt)) / 3600000;
  assert.ok(mHours > 46 && mHours < 50, `oldest unsettled COD about 2 days, got ${mHours}h`);
  // a suspended rider drops off the board; a rider with no cash has no cash facts
  await db.query(`update riders set status = 'suspended' where id = $1`, [xRider]);
  assert.equal(JSON.parse(JSON.stringify(await scalar(`select ps_rider_scorecards_raw(30)`))).some((c) => c.id === xRider), false);
  await db.query(`update riders set status = 'active', cash_in_hand = 0 where id = $1`, [xRider]);
  const mClean = JSON.parse(JSON.stringify(await scalar(`select ps_rider_scorecards_raw(30)`))).find((c) => c.id === xRider);
  assert.equal(mClean.oldestCodAt, null);
  await as(staffId);
  const mStaff = JSON.parse(JSON.stringify(await scalar(`select ps_admin_rider_scorecards(30)`)));
  assert.ok(Array.isArray(mStaff) && mStaff.some((c) => c.id === xRider), 'staff wrapper returns the same list');
  console.log('PASS: rider scorecards — service-only raw reader, staff wrapper, claim + COD facts, active riders only');

  // ---- W: rider disputes + manual wallet adjustments
  const wUser = await uuid();
  const wRider = await scalar(`insert into riders(user_id, name, phone, status) values ($1,'Dispute Rider','01710000881','active') returning id`, [wUser]);
  const wOther = await scalar(`insert into riders(name, phone, status) values ('Other Rider','01710000882','active') returning id`);
  const wOrder = await scalar(`insert into orders(status) values ('delivered') returning id`);
  const wAsg = await scalar(`insert into delivery_assignments(order_id, rider_id, state) values ($1,$2,'delivered') returning id`, [wOrder, wRider]);
  const wOtherAsg = await scalar(`insert into delivery_assignments(order_id, rider_id, state) values ($1,$2,'delivered') returning id`, [await scalar(`insert into orders(status) values ('delivered') returning id`), wOther]);
  const raise = (asg, cat, msg, claimed = null) => db.query(`select * from ps_rider_raise_dispute($1, $2, $3, $4)`, [asg, cat, msg, claimed]);

  await as(staffId);
  await assert.rejects(raise(wAsg, 'missing_fee', 'fee not paid'), /forbidden/, 'staff are not riders');
  await as(wUser);
  await assert.rejects(raise(wOtherAsg, 'missing_fee', 'fee not paid'), /not your trip/, "cannot dispute another rider's trip");
  await assert.rejects(raise(null, 'missing_fee', 'fee not paid'), /trip required/);
  await assert.rejects(raise(wAsg, 'bogus', 'fee not paid'), /unknown category/);
  await assert.rejects(raise(wAsg, 'missing_fee', 'no'), /too short/);
  await assert.rejects(raise(wAsg, 'missing_fee', 'x'.repeat(501)), /too long/);
  await assert.rejects(raise(wAsg, 'missing_fee', 'fee not paid', -5), /invalid amount/);
  const wD = (await raise(wAsg, 'missing_fee', ' Delivery fee not credited ', 4000)).rows[0];
  assert.deepEqual([wD.status, wD.message, String(wD.claimed_amount), wD.order_id], ['pending', 'Delivery fee not credited', '4000', wOrder]);
  await assert.rejects(raise(wAsg, 'wrong_cod', 'customer paid less'), /already open/, 'one open dispute per trip');
  for (let i = 0; i < 4; i++) await raise(null, 'other', `general question ${i}`);
  await assert.rejects(raise(null, 'other', 'one more question'), /too many open/, 'at most 5 open');
  // staff decisions
  await as(wUser);
  await assert.rejects(db.query(`select * from ps_admin_resolve_dispute($1,'approve',4000,'ok')`, [wD.id]), /forbidden/);
  await assert.rejects(db.query(`select * from ps_admin_adjust_rider($1, 1000, 'because reasons')`, [wRider]), /forbidden/);
  await as(staffId);
  await assert.rejects(db.query(`select * from ps_admin_resolve_dispute($1,'reject',0,'')`, [wD.id]), /reason required/, 'a rejection needs a reason');
  await assert.rejects(db.query(`select * from ps_admin_resolve_dispute($1,'maybe',0,'x')`, [wD.id]), /approve or reject/);
  const wR = (await db.query(`select * from ps_admin_resolve_dispute($1,'approve',4000,'Fee missed by the system')`, [wD.id])).rows[0];
  assert.deepEqual([wR.status, String(wR.adjustment_amount)], ['approved', '4000']);
  assert.ok(wR.earning_id && wR.decided_at && wR.decided_by === staffId);
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [wRider])), 4000);
  assert.equal(await scalar(`select kind from rider_earnings where id = $1`, [wR.earning_id]), 'adjustment');
  await assert.rejects(db.query(`select * from ps_admin_resolve_dispute($1,'reject',0,'late')`, [wD.id]), /already approved/);
  // the audit trail names the staff member and the amount, not the rider's wallet
  const wAudit = (await db.query(`select * from money_audit_log where event = 'rider_adjustment' and subject_id = $1`, [wRider])).rows;
  assert.equal(wAudit.length, 1);
  assert.equal(String(wAudit[0].amount), '4000');
  assert.equal(wAudit[0].actor_id, staffId);
  // a rejected dispute moves no money
  const wD2 = (await (async () => { await as(wUser); return raise(null, 'other', 'something else entirely'); })()).rows;
  await as(staffId);
  assert.ok(wD2.length === 1);
  const wOpen = (await db.query(`select id from rider_disputes where rider_id = $1 and status = 'pending' limit 1`, [wRider])).rows[0].id;
  const wRej = (await db.query(`select * from ps_admin_resolve_dispute($1,'reject',9999,'Not our error')`, [wOpen])).rows[0];
  assert.deepEqual([wRej.status, String(wRej.adjustment_amount), wRej.earning_id], ['rejected', '0', null], 'reject ignores any amount');
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [wRider])), 4000);
  // manual adjustment: guards, debit, wallet == journal
  await assert.rejects(db.query(`select * from ps_admin_adjust_rider($1, 0, 'nothing happens')`, [wRider]), /must not be zero/);
  await assert.rejects(db.query(`select * from ps_admin_adjust_rider($1, 100, 'no')`, [wRider]), /reason required/);
  await assert.rejects(db.query(`select * from ps_admin_adjust_rider($1, 99999999, 'way too much')`, [wRider]), /too large/);
  await assert.rejects(db.query(`select * from ps_admin_adjust_rider($1, -4001, 'more than the wallet')`, [wRider]), /negative/, 'a debit cannot overdraw the wallet');
  await db.query(`select * from ps_admin_adjust_rider($1, -1500, 'Damaged parcel penalty')`, [wRider]);
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [wRider])), 2500);
  assert.equal(Number(await scalar(`select coalesce(sum(amount),0) from rider_earnings where rider_id = $1`, [wRider])), 2500, 'wallet == journal');
  await assert.rejects(db.query(`select * from ps_admin_adjust_rider(gen_random_uuid(), 100, 'ghost rider here')`), /rider not found/);
  // RLS: staff can read disputes, a rider cannot read the table directly; internal helper is not callable
  assert.equal(await scalar(`select has_function_privilege('authenticated','ps__apply_rider_adjustment(uuid,bigint,text)','execute')`), false, 'the raw wallet mover is not exposed');
  assert.equal(await scalar(`select has_function_privilege('anon','ps_admin_adjust_rider(uuid,bigint,text)','execute')`), false);
  console.log('PASS: rider disputes — own trips only, one open per trip, staff-only decisions, adjustments journal-balanced, no overdraw, audited');

  // ---- I: rider push — devices are private, die with the rider, offers are claimable once
  const jPush = await scalar(`insert into riders(name, phone, status) values ('Push Rider','01710000999','active') returning id`);
  await db.query(`insert into rider_push_subscriptions(rider_id, endpoint, p256dh, auth) values ($1,'https://push.example/a','k','a')`, [jPush]);
  await assert.rejects(
    db.query(`insert into rider_push_subscriptions(rider_id, endpoint, p256dh, auth) values ($1,'https://push.example/a','k2','a2')`, [jPush]),
    /unique|duplicate/i, 'an endpoint is stored once');
  assert.equal(await scalar(`select relrowsecurity from pg_class where relname='rider_push_subscriptions'`), true, 'RLS on, no policies');
  assert.equal(await scalar(`select count(*)::int from pg_policies where tablename='rider_push_subscriptions'`), 0);
  assert.equal(await scalar(`select has_table_privilege('authenticated','rider_push_subscriptions','select')`), false, 'a rider cannot read device endpoints');
  assert.equal(await scalar(`select has_table_privilege('anon','rider_push_subscriptions','select')`), false);
  assert.equal(await scalar(`select has_table_privilege('service_role','rider_push_subscriptions','select')`), true);
  // the sender's claim: update … where push_notified_at is null → exactly one winner
  const jOrder = await scalar(`insert into orders(status) values ('ready-for-pickup') returning id`);
  const jAsg = await scalar(`insert into delivery_assignments(order_id, rider_id, state) values ($1,$2,'offered') returning id`, [jOrder, jPush]);
  const jClaim1 = (await db.query(`update delivery_assignments set push_notified_at = now() where id = $1 and push_notified_at is null returning id`, [jAsg])).rows.length;
  const jClaim2 = (await db.query(`update delivery_assignments set push_notified_at = now() where id = $1 and push_notified_at is null returning id`, [jAsg])).rows.length;
  assert.deepEqual([jClaim1, jClaim2], [1, 0], 'a second sweep gets nothing back');
  // devices go with the rider (assignments reference the rider, so clear them first)
  await db.query(`delete from delivery_assignments where rider_id = $1`, [jPush]);
  await db.query(`delete from rider_push_subscriptions where rider_id = $1`, [jPush]);
  await db.query(`insert into rider_push_subscriptions(rider_id, endpoint, p256dh, auth) values ($1,'https://push.example/b','k','a')`, [jPush]);
  await db.query(`delete from riders where id = $1`, [jPush]);
  assert.equal(await scalar(`select count(*)::int from rider_push_subscriptions where endpoint='https://push.example/b'`), 0, 'cascade on rider delete');
  console.log('PASS: rider push — private device table, one claim per offer, cascade on rider delete');
  // ---- N: licence expiry — a lapsed licence cannot go (back) online; unrecorded/valid/bicycle can
  const nBike = await scalar(`insert into riders(name, phone, status, vehicle, is_online, licence_expires_on) values ('Lapsed','01710000771','active','bike', false, (now() at time zone 'Asia/Dhaka')::date - 1) returning id`);
  await assert.rejects(db.query(`update riders set is_online = true where id = $1`, [nBike]), /licence_expired/, 'lapsed licence → cannot go online');
  assert.equal(await scalar(`select is_online from riders where id = $1`, [nBike]), false);
  // expiring today is still valid (Dhaka calendar day)
  await db.query(`update riders set licence_expires_on = (now() at time zone 'Asia/Dhaka')::date where id = $1`, [nBike]);
  await db.query(`update riders set is_online = true where id = $1`, [nBike]);
  assert.equal(await scalar(`select is_online from riders where id = $1`, [nBike]), true, 'today is the last valid day');
  // already-online rider is NOT blocked by an unrelated edit, and may always go offline
  await db.query(`update riders set licence_expires_on = (now() at time zone 'Asia/Dhaka')::date - 5 where id = $1`, [nBike]);
  await db.query(`update riders set is_online = false where id = $1`, [nBike]);
  // unrecorded date and bicycles never blocked
  const nNull = await scalar(`insert into riders(name, phone, status, vehicle, is_online) values ('Unrecorded','01710000772','active','bike', false) returning id`);
  await db.query(`update riders set is_online = true where id = $1`, [nNull]);
  const nCycle = await scalar(`insert into riders(name, phone, status, vehicle, is_online, licence_expires_on) values ('Cycle','01710000773','active','bicycle', false, '2020-01-01') returning id`);
  await db.query(`update riders set is_online = true where id = $1`, [nCycle]);
  // renewing the date re-opens the door
  await db.query(`update riders set licence_expires_on = (now() at time zone 'Asia/Dhaka')::date + 365 where id = $1`, [nBike]);
  await db.query(`update riders set is_online = true where id = $1`, [nBike]);
  assert.equal(await scalar(`select is_online from riders where id = $1`, [nBike]), true);
  await db.query(`delete from riders where id = any($1::uuid[])`, [[nBike, nNull, nCycle]]);
  console.log('PASS: licence expiry — lapsed motor rider blocked from going online; unrecorded/bicycle/valid unaffected');
  // ---- P: durable rate limit — shared counter, atomic window, service-role only
  assert.equal(await scalar(`select has_function_privilege('authenticated','ps_rate_limit_hit(text,int,int)','execute')`), false);
  assert.equal(await scalar(`select has_function_privilege('anon','ps_rate_limit_hit(text,int,int)','execute')`), false);
  assert.equal(await scalar(`select has_function_privilege('service_role','ps_rate_limit_hit(text,int,int)','execute')`), true);
  const pHit = async (k, limit = 3, ms = 60000) => (await rows(`select * from ps_rate_limit_hit($1, $2, $3)`, [k, limit, ms]))[0];
  assert.deepEqual([(await pHit('p:a')).allowed, (await pHit('p:a')).allowed, (await pHit('p:a')).allowed], [true, true, true], 'first three pass');
  const pBlocked = await pHit('p:a');
  assert.equal(pBlocked.allowed, false, 'fourth is refused');
  assert.ok(pBlocked.retry_after_sec >= 1 && pBlocked.retry_after_sec <= 60, 'retry-after inside the window');
  assert.equal((await pHit('p:b')).allowed, true, 'a different key has its own bucket');
  await db.query(`update rate_limit_hits set reset_at = now() - interval '1 second' where key = 'p:a'`);
  assert.equal((await pHit('p:a')).allowed, true, 'a new window starts after reset');
  assert.equal(await scalar(`select hits::int from rate_limit_hits where key = 'p:a'`), 1, 'counter restarted');
  await assert.rejects(db.query(`select * from ps_rate_limit_hit('', 3, 60000)`), /bad key/);
  await assert.rejects(db.query(`select * from ps_rate_limit_hit('k', 0, 60000)`), /bad limit/);
  await assert.rejects(db.query(`select * from ps_rate_limit_hit('k', 3, 10)`), /bad window/);
  console.log('PASS: durable rate limit — shared atomic counter, per-key windows, service-role only, bad input refused');
  // ---- X: delivery feedback columns — known tags only, bounded comment, defaults
  const fbOrder = await scalar(`insert into orders(order_no, status) values ('PS-X-1', 'delivered') returning id`);
  {
    const fbRider = await scalar(`insert into riders(name, phone, status, vehicle) values ('Fb','01710000881','active','bicycle') returning id`);
    await db.query(`insert into delivery_ratings(order_id, rider_id, stars) values ($1,$2,2)`, [fbOrder, fbRider]);
    const fbRow = (await rows(`select tags, comment, feedback_at, hidden_from_rider from delivery_ratings where order_id = $1`, [fbOrder]))[0];
    assert.deepEqual([fbRow.tags, fbRow.comment, fbRow.feedback_at, fbRow.hidden_from_rider], [[], null, null, false], 'old rows get empty feedback');
    await db.query(`update delivery_ratings set tags = array['late','rude'], comment = 'came late', feedback_at = now() where order_id = $1`, [fbOrder]);
    await assert.rejects(db.query(`update delivery_ratings set tags = array['hacker'] where order_id = $1`, [fbOrder]), /tags_known/, 'unknown tag refused');
    await assert.rejects(db.query(`update delivery_ratings set comment = repeat('x', 501) where order_id = $1`, [fbOrder]), /comment_len/, 'long comment refused');
    await db.query(`delete from orders where id = $1`, [fbOrder]);
    await db.query(`delete from riders where id = $1`, [fbRider]);
    console.log('PASS: delivery feedback — empty defaults, known tags only, 500-char comment cap, migration repeat-safe');
  }
  // ---- V: rider incentives — daily target + referral, idempotent, journal-balanced, service-only
  for (const fn of ['ps_rider_referral_code(uuid)', 'ps_register_rider_referral(uuid,text)', 'ps_award_incentives(timestamptz)']) {
    assert.equal(await scalar(`select has_function_privilege('authenticated','${fn}','execute')`), false, `${fn} not for authenticated`);
    assert.equal(await scalar(`select has_function_privilege('anon','${fn}','execute')`), false, `${fn} not for anon`);
    assert.equal(await scalar(`select has_function_privilege('service_role','${fn}','execute')`), true, `${fn} for service`);
  }
  assert.equal(await scalar(`select has_function_privilege('service_role','ps__credit_incentive(uuid,bigint,text)','execute')`), false, 'raw credit is internal');
  const vRef = await scalar(`insert into riders(name, phone, status, vehicle) values ('Referrer','01710000891','active','bike') returning id`);
  const vNew = await scalar(`insert into riders(name, phone, status, vehicle) values ('Newbie','01710000892','pending','bike') returning id`);
  const vDay = await scalar(`insert into riders(name, phone, status, vehicle) values ('Runner','01710000893','active','bike') returning id`);
  const vCode = await scalar(`select ps_rider_referral_code($1)`, [vRef]);
  assert.match(vCode, /^[A-HJ-NP-Z2-9]{6}$/, 'six unambiguous characters');
  assert.equal(await scalar(`select ps_rider_referral_code($1)`, [vRef]), vCode, 'stable per rider');
  assert.equal(await scalar(`select ps_register_rider_referral($1, 'zzzzzz')`, [vNew]), 'unknown');
  assert.equal(await scalar(`select ps_register_rider_referral($1, $2)`, [vRef, vCode]), 'self');
  assert.equal(await scalar(`select ps_register_rider_referral($1, $2)`, [vDay, vCode]), 'not_new', 'an active rider cannot be "referred"');
  assert.equal(await scalar(`select ps_register_rider_referral($1, lower($2))`, [vNew, vCode]), 'registered', 'case-insensitive');
  assert.equal(await scalar(`select ps_register_rider_referral($1, $2)`, [vNew, vCode]), 'already');
  // everything is OFF until staff set amounts
  await db.query(`delete from site_settings where key like 'incentive_%'`);
  assert.equal((await scalar(`select ps_award_incentives()`)).total, 0, 'switched off by default');
  // helper: n delivered legs for a rider today (Dhaka), plus one return leg that must not count
  const vDeliver = async (rider, n, ret = 0) => {
    for (let i = 0; i < n + ret; i++) {
      const o = await scalar(`insert into orders(status, is_return) values ('delivered', $1) returning id`, [i >= n]);
      await db.query(`insert into delivery_assignments(order_id, rider_id, state, delivered_at) values ($1,$2,'delivered', now())`, [o, rider]);
    }
  };
  await db.query(`insert into site_settings(key, value) values ('incentive_daily_target','3'),('incentive_daily_bonus_paisa','5000'),('incentive_referral_bonus_paisa','10000'),('incentive_referral_after','2')`);
  assert.equal(await scalar(`select count(*)::int from money_audit_log where event = 'rate_change' and subject_id = 'incentive_daily_bonus_paisa'`), 1, 'incentive amount change is audited');
  await db.query(`update site_settings set value = '6000' where key = 'incentive_daily_bonus_paisa'`);
  assert.equal(await scalar(`select count(*)::int from money_audit_log where event = 'rate_change' and subject_id = 'incentive_daily_bonus_paisa'`), 2, 'an edit is audited too');
  await db.query(`update site_settings set value = '5000' where key = 'incentive_daily_bonus_paisa'`);
  await vDeliver(vDay, 2, 3);
  assert.equal((await scalar(`select ps_award_incentives()`)).daily, 0, '2 deliveries + 3 returns is below a target of 3');
  await vDeliver(vDay, 1);
  const vBefore = Number(await scalar(`select earnings_balance from riders where id = $1`, [vDay]));
  const vFirst = await scalar(`select ps_award_incentives()`);
  assert.equal(vFirst.daily, 1);
  assert.equal(vFirst.awards[0].amount, 5000);
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [vDay])), vBefore + 5000, 'wallet credited once');
  const vAgain = await scalar(`select ps_award_incentives()`);
  assert.equal(vAgain.daily + vAgain.referral, 0, 'a second tick pays nothing (idempotent)');
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [vDay])), vBefore + 5000);
  // referral: referee has 0 deliveries → nothing; after 2 → referrer paid once
  assert.equal((await scalar(`select ps_award_incentives()`)).referral, 0);
  await db.query(`update riders set status = 'active' where id = $1`, [vNew]);
  await vDeliver(vNew, 1);
  assert.equal((await scalar(`select ps_award_incentives()`)).referral, 0, '1 of 2 deliveries is not enough');
  await vDeliver(vNew, 1);
  const vRefBefore = Number(await scalar(`select earnings_balance from riders where id = $1`, [vRef]));
  const vRefPay = await scalar(`select ps_award_incentives()`);
  assert.equal(vRefPay.referral, 1);
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [vRef])), vRefBefore + 10000);
  assert.notEqual(await scalar(`select rewarded_at from rider_referrals where referee_id = $1`, [vNew]), null);
  await vDeliver(vNew, 3);
  assert.equal((await scalar(`select ps_award_incentives()`)).referral, 0, 'the referrer is paid once per referee');
  // wallet == journal for every rider touched, journal rows are `incentive`
  for (const id of [vRef, vNew, vDay]) {
    assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [id])), Number(await scalar(`select coalesce(sum(amount),0) from rider_earnings where rider_id = $1`, [id])), 'wallet equals journal');
  }
  assert.equal(await scalar(`select count(*)::int from rider_earnings where rider_id = $1 and kind = 'incentive'`, [vDay]), 1);
  // a suspended referrer is not paid (the referral stays open for when they are back)
  const vRef2 = await scalar(`insert into riders(name, phone, status, vehicle) values ('R2','01710000894','active','bike') returning id`);
  const vNew2 = await scalar(`insert into riders(name, phone, status, vehicle) values ('N2','01710000895','pending','bike') returning id`);
  const vCode2 = await scalar(`select ps_rider_referral_code($1)`, [vRef2]);
  await db.query(`select ps_register_rider_referral($1, $2)`, [vNew2, vCode2]);
  await db.query(`update riders set status = 'active' where id = $1`, [vNew2]);
  await vDeliver(vNew2, 2);
  await db.query(`update riders set status = 'suspended' where id = $1`, [vRef2]);
  assert.equal((await scalar(`select ps_award_incentives()`)).referral, 0, 'suspended referrer is not paid');
  assert.equal(await scalar(`select rewarded_at from rider_referrals where referee_id = $1`, [vNew2]), null, 'still open');
  await db.query(`update riders set status = 'active' where id = $1`, [vRef2]);
  assert.equal((await scalar(`select ps_award_incentives()`)).referral, 1, 'paid once they are active again');
  await db.query(`delete from site_settings where key like 'incentive_%'`);
  console.log('PASS: rider incentives — off by default, daily target + referral paid once, returns excluded, journal-balanced, service-only');

  // ---- failed-delivery fee: staff-chosen, once per order, off by default, journal-balanced
  await as(null);
  await db.query(`delete from site_settings where key = 'rider_failed_delivery_fee_paisa'`);
  const ffRider = await scalar(`insert into riders(name, phone, status, vehicle) values ('FeeRider','01710000901','active','bike') returning id`);
  const ffFailed = async () => {
    const o = await scalar(`insert into orders(status, delivery_failed_at) values ('out-for-delivery', now()) returning id`);
    await db.query(`insert into delivery_assignments(order_id, rider_id, state) values ($1,$2,'failed')`, [o, ffRider]);
    return o;
  };
  const ffRows = (o) => rows(`select * from rider_earnings where order_id = $1 and kind = 'incentive'`, [o]);
  const ffBal = async () => Number(await scalar(`select earnings_balance from riders where id = $1`, [ffRider]));
  assert.equal(await scalar(`select ps_failed_delivery_fee()`), 0, 'off by default');

  const ff0 = await ffFailed();
  await as(staffId);
  await db.query(`select * from ps_admin_resolve_failed_delivery($1, 'redispatch', null, true)`, [ff0]);
  assert.equal((await ffRows(ff0)).length, 0, 'fee setting 0 = nothing paid even when asked');

  await as(null);
  await db.query(`insert into site_settings(key, value) values ('rider_failed_delivery_fee_paisa', '20000')`);
  assert.equal(await scalar(`select count(*)::int from money_audit_log where event = 'rate_change' and subject_id = 'rider_failed_delivery_fee_paisa'`), 1, 'fee change is audited');
  await db.query(`update site_settings set value = '999999' where key = 'rider_failed_delivery_fee_paisa'`);
  assert.equal(await scalar(`select ps_failed_delivery_fee()`), 50000, 'capped at ৳500');
  await db.query(`update site_settings set value = '20000' where key = 'rider_failed_delivery_fee_paisa'`);

  const ff1 = await ffFailed();
  const ffBefore = await ffBal();
  await as(riderUser);
  await assert.rejects(db.query(`select * from ps_admin_resolve_failed_delivery($1, 'redispatch', null, true)`, [ff1]), /forbidden/, 'a rider cannot pay themselves');
  await as(staffId);
  await db.query(`select * from ps_admin_resolve_failed_delivery($1, 'redispatch')`, [ff1]);
  assert.equal((await ffRows(ff1)).length, 0, 'not paid unless staff choose to');
  assert.equal(await ffBal(), ffBefore);

  await as(null);
  const ff2 = await ffFailed();
  await as(staffId);
  await db.query(`select * from ps_admin_resolve_failed_delivery($1, 'cancel', 'customer gone', true)`, [ff2]);
  const ffPaid = await ffRows(ff2);
  assert.equal(ffPaid.length, 1);
  assert.equal(Number(ffPaid[0].amount), 20000);
  assert.equal(ffPaid[0].rider_id, ffRider);
  assert.match(ffPaid[0].note, /Failed delivery fee/);
  assert.equal(await ffBal(), ffBefore + 20000, 'wallet credited');
  assert.equal(Number(await scalar(`select coalesce(sum(amount),0) from rider_earnings where rider_id = $1`, [ffRider])), await ffBal(), 'wallet = journal');
  assert.match(await scalar(`select string_agg(note, '|') from order_status_history where order_id = $1`, [ff2]), /Rider paid 200\.00 Tk/);
  assert.equal(await scalar(`select count(*)::int from money_audit_log where event = 'rider_adjustment' and subject_id = $1`, [ffRider]) >= 1, true, 'the credit reaches the money audit');
  await assert.rejects(db.query(`select * from ps_admin_resolve_failed_delivery($1, 'cancel', 'again', true)`, [ff2]), /no failed delivery/, 'cannot be paid twice');

  // flagged order whose assignment never failed (no rider to pay): resolves, pays nobody, no error
  await as(null);
  const ffNone = await scalar(`insert into orders(status, delivery_failed_at) values ('out-for-delivery', now()) returning id`);
  await as(staffId);
  await db.query(`select * from ps_admin_resolve_failed_delivery($1, 'redispatch', null, true)`, [ffNone]);
  assert.equal((await ffRows(ffNone)).length, 0);
  await as(null);
  await db.query(`delete from site_settings where key = 'rider_failed_delivery_fee_paisa'`);
  console.log('PASS: failed-delivery fee — off by default, staff-chosen, once per order, capped, audited, wallet = journal');

  // ---- weekly + tiered bonus
  await db.query(`delete from site_settings where key like 'incentive_%'`);
  await db.query(`update riders set status = 'suspended'`); // earlier tests' riders have deliveries today; only the riders below are in play
  const wk = async (name, phone) => scalar(`insert into riders(name, phone, status, vehicle) values ($1,$2,'active','bike') returning id`, [name, phone]);
  const wkLegs = async (rider, n, ago = '0 days', ret = 0) => {
    for (let i = 0; i < n + ret; i++) {
      const o = await scalar(`insert into orders(status, is_return) values ('delivered', $1) returning id`, [i >= n]);
      await db.query(`insert into delivery_assignments(order_id, rider_id, state, delivered_at) values ($1,$2,'delivered', now() - $3::interval)`, [o, rider, ago]);
    }
  };
  const wkA = await wk('WeekA', '01710000911');
  const wkB = await wk('WeekB', '01710000912');
  await wkLegs(wkA, 3);
  await wkLegs(wkB, 2, '0 days', 4);
  assert.equal((await scalar(`select ps_award_incentives()`)).weekly, 0, 'weekly bonus is off by default');
  await db.query(`insert into site_settings(key, value) values ('incentive_weekly_target','3'),('incentive_weekly_bonus_paisa','5000'),('incentive_weekly_target2','5'),('incentive_weekly_bonus2_paisa','7000')`);
  assert.equal(await scalar(`select count(*)::int from money_audit_log where event = 'rate_change' and subject_id = 'incentive_weekly_bonus2_paisa'`), 1, 'weekly amounts are audited');
  const wk_wBefore = Number(await scalar(`select earnings_balance from riders where id = $1`, [wkA]));
  const wk_w1 = await scalar(`select ps_award_incentives()`);
  assert.equal(wk_w1.weekly, 1, 'rider A reached tier 1 (B has 2 real deliveries + 4 returns)');
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [wkA])), wk_wBefore + 5000);
  assert.equal(wk_w1.awards.find((a) => a.riderId === wkA).tier, 1);
  assert.equal((await scalar(`select ps_award_incentives()`)).weekly, 0, 'once per tier per week');
  await wkLegs(wkA, 2);
  const wk_w2 = await scalar(`select ps_award_incentives()`);
  assert.equal(wk_w2.weekly, 1, 'tier 2 is an extra on top of tier 1');
  assert.equal(Number(await scalar(`select earnings_balance from riders where id = $1`, [wkA])), wk_wBefore + 5000 + 7000);
  assert.equal((await scalar(`select ps_award_incentives()`)).weekly, 0);
  assert.equal(Number(await scalar(`select coalesce(sum(amount),0) from rider_earnings where rider_id = $1`, [wkA])), await scalar(`select earnings_balance from riders where id = $1`, [wkA]) * 1, 'wallet = journal');
  // last week is still honoured (a run that straddled Sunday midnight)
  const wkC = await wk('WeekC', '01710000913');
  await wkLegs(wkC, 3, '7 days');
  assert.equal((await scalar(`select ps_award_incentives()`)).weekly, 1, 'last week paid');
  // tier 2 at or below tier 1 is ignored (a mistyped config cannot double-pay)
  await db.query(`update site_settings set value = '3' where key = 'incentive_weekly_target2'`);
  const wkD = await wk('WeekD', '01710000914');
  await wkLegs(wkD, 3);
  const wk_wd = await scalar(`select ps_award_incentives()`);
  assert.equal(wk_wd.weekly, 1, 'only tier 1 paid; tier 2 (≤ tier 1) ignored');
  assert.equal(wk_wd.awards[0].tier, 1);
  // the awards table accepts only the known kinds
  await assert.rejects(db.query(`insert into rider_incentive_awards(rider_id, kind, ref_key, amount) values ($1,'mystery','x',1)`, [wkA]));
  await db.query(`delete from site_settings where key like 'incentive_%'`);
  console.log('PASS: weekly tiered bonus — off by default, tier 1 + extra tier 2, once each, last week honoured, bad tier ignored, audited');
} finally {
  await db.close();
}
