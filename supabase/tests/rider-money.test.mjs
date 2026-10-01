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
create table orders (
 id uuid primary key default gen_random_uuid(), status text default 'confirmed',
 payment text default 'cod', total bigint default 0, subtotal bigint default 0,
 delivery_charge bigint default 0, tip_amount bigint default 0,
 is_return boolean default false, shop_id uuid, updated_at timestamptz,
 delivery_code text, delivery_code_attempts int default 0, delivery_code_locked_until timestamptz,
 delivery_proof_url text, delivery_proof_uploaded_at timestamptz
);
create table delivery_assignments (
 id uuid primary key default gen_random_uuid(), order_id uuid references orders(id),
 rider_id uuid references riders(id), state text default 'offered'
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
]) {
  const sql = readFileSync(new URL(f, root), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // repeat-safe
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
const stranger = await scalar(`insert into riders(user_id) values ($1) returning id`, [strangerUser]);

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
    `insert into orders(status, payment, total, tip_amount) values ('picked_up', 'cod', 100000, 5000) returning id`,
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
      `insert into orders(status, payment, total, is_return, delivery_code) values ('picked_up', $1, $2, $3, '1234') returning id`,
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
} finally {
  await db.close();
}
