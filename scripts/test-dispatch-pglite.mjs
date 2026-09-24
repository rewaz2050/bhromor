/**
 * Applies supabase/schema.sql + every migration in order to an in-memory
 * PGlite (a real PostgreSQL 18 in WASM), then replays the RIDER DISPATCH
 * chain and asserts the behaviour the owner reported as broken:
 * "shop Ready chape, rider kintu offer pay na".
 *
 * Run: node scripts/test-dispatch-pglite.mjs
 *
 * This is the check for migration 202609250001 — it executes the shipped SQL,
 * it does not re-implement any of it.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ADMIN = "11111111-1111-1111-1111-111111111111";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let failures = 0;
const ok = (name) => console.log(`  \x1b[32m✓\x1b[0m ${name}`);
const bad = (name, detail) => {
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`);
};
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(`${name} — ${a}`);
  else bad(name, `expected ${e}, got ${a}`);
};

/** Minimal Supabase auth stub — the schema references auth.users/auth.uid(). */
const AUTH_STUB = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  -- schema.sql's signup trigger reads this off new rows
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid
language sql stable as $q$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), ''), '')::uuid
$q$;
do $q$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $q$;
`;

const run = async (db, sql, label) => {
  try {
    // Migrations run as the staff identity: several of them execute DML on
    // guarded tables whose trigger calls ps_is_admin().
    await db.exec(`select set_config('request.jwt.claim.sub', '${ADMIN}', false)`);
    await db.exec(sql);
  } catch (err) {
    throw new Error(`${label}: ${err.message}`);
  }
};

/* ------------------------------------------------------------------ */
/* Apply the shipped schema + every migration                          */
/* ------------------------------------------------------------------ */

// bypassrls = the service-role client the API routes use in production, so
// this replays the app's own access path. Grant scoping is asserted at the end.
const db = await new PGlite({ initialUser: { user: "postgres", superuser: true } });
await run(db, AUTH_STUB, "auth stub");

// PGlite ships PostgreSQL 18, where gen_random_uuid() is core; pgcrypto has no
// WASM build and the schema needs nothing else from it.
const schema = readFileSync(join(ROOT, "supabase/schema.sql"), "utf8").replace(
  /create extension if not exists pgcrypto;/i,
  "-- pgcrypto skipped: gen_random_uuid() is core on PG13+",
);
await run(db, schema, "schema.sql");

// Staff identity, created BEFORE the migrations: some of them run DML on
// guarded tables (shops), whose BEFORE UPDATE trigger calls ps_is_admin() and
// raises 'forbidden' for an anonymous session.
await run(
  db,
  `insert into auth.users (id) values ('${ADMIN}');
   insert into admin_users (id, role) values ('${ADMIN}', 'super_admin');`,
  "staff identity",
);

const migrations = readdirSync(join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of migrations) {
  await run(db, readFileSync(join(ROOT, "supabase/migrations", file), "utf8"), file);
}
ok(`applied schema.sql + ${migrations.length} migrations`);

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

// Act as staff (ps_is_admin) or as a rider (ps_rider_id) — the same switch
// PostgREST makes from the caller's JWT. Every query re-asserts it because
// `set_config(..., false)` is transaction-scoped and each query is its own.
let currentSub = ADMIN;
const actAs = async (sub) => {
  currentSub = sub;
};
const q = async (sql, params = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${currentSub}', false)`);
  try {
    return (await db.query(sql, params)).rows;
  } catch (err) {
    throw new Error(
      `${err.message}\n      sql: ${sql.trim().split("\n").join(" ").slice(0, 200)}`,
    );
  }
};
const one = async (sql, params = []) => (await q(sql, params))[0];

await q(`
  insert into delivery_zones (id, name, eta_label, charge)
  values ('Z1', 'Sunamganj Sadar', '45-50 min', 6000)
  on conflict (id) do nothing
`);
const shop = await one(`
  insert into shops (slug, name, phone, zone_ids, status)
  values ('test-shop', 'Test Shop', '01800000000', '{Z1}', 'active')
  returning id
`);

let riderSeq = 0;
const newRider = async (name) => {
  riderSeq += 1;
  const row = await one(
    `insert into riders (name, phone, zone_ids, status, is_online)
     values ($1, $2, '{Z1}', 'active', true)
     returning id`,
    [name, `0170000${String(riderSeq).padStart(4, "0")}`],
  );
  return row.id;
};

/** A real order: placed pending (the guard refuses anything else), then
 *  moved to ready-for-pickup by the staff path. */
const placeOrder = async (orderNo, phone) => {
  const row = await one(
    `insert into orders
       (customer_name, customer_phone, area, zone_id, shop_id, subtotal, delivery_charge, total, order_no)
     values ('Test Customer', $1, 'Sadar', 'Z1', $3, 100000, 6000, 106000, $2)
     returning id, delivery_code`,
    [phone, orderNo, shop.id],
  );
  return row;
};

/* ------------------------------------------------------------------ */
/* 1. Health probe knows this migration                                */
/* ------------------------------------------------------------------ */
console.log("\n1. health probe");
const health = (await one(`select ps_checkout_health() as h`)).h;
check("checks.rider_dispatch_ok", health.rider_dispatch_ok, true);
check("checks.rider_push_column", health.rider_push_column, true);
check("two_tap_flow_ok preserved (202609170001)", health.two_tap_flow_ok, true);
check("dispatch_reoffer_ok preserved (202609160005)", health.dispatch_reoffer_ok, true);
check("health version", health.version, "202609250001");

/* ------------------------------------------------------------------ */
/* 2. The offer window is a setting, not a hardcoded 90 s              */
/* ------------------------------------------------------------------ */
console.log("\n2. offer window");
check(
  "default window is 5 minutes (was 90 s)",
  (await one(`select extract(epoch from ps_offer_window())::int as s`)).s,
  300,
);
const setWindow = async (secs) => {
  await q(
    `insert into site_settings (key, value) values ('dispatch_offer_seconds', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [String(secs)],
  );
  return (await one(`select extract(epoch from ps_offer_window())::int as s`)).s;
};
check("setting 600 → 10 minutes", await setWindow(600), 600);
check("a typo of 20 s is clamped to the 60 s floor", await setWindow(20), 60);
check("99999 is clamped to the 3600 s ceiling", await setWindow(99999), 3600);
await setWindow(300);

/* ------------------------------------------------------------------ */
/* 3. Nobody eligible → the diagnosis names the blocker                */
/* ------------------------------------------------------------------ */
console.log("\n3. diagnosis (why no rider)");
const order = await placeOrder("PS-TEST01", "01700000001");
const orderId = order.id;

// Move it to the dispatchable state through the staff path first; the buckets
// below are then read while no offer exists yet.
await q(`select ps_advance_order($1, 'confirmed')`, [orderId]);
await q(`select ps_advance_order($1, 'ready-for-pickup')`, [orderId]);
check(
  "the order is dispatchable",
  (await one(`select status from orders where id = $1`, [orderId])).status,
  "ready-for-pickup",
);

const diagnose = async () => (await one(`select ps_dispatch_diagnosis($1) as d`, [orderId])).d;
check("no riders at all → reason", (await diagnose()).reason, "no-active-rider");

await newRider("Offline Rider");
await q(`update riders set is_online = false where name = 'Offline Rider'`);
check("a rider exists but is offline → reason", (await diagnose()).reason, "no-one-online");

const zoneRider = await newRider("Zone Rider");
check("online + on shift + in zone → reason", (await diagnose()).reason, "eligible");
check("one rider has not seen it", (await diagnose()).riders_not_seen, 1);

await q(`update riders set cash_in_hand = 500000 where id = $1`, [zoneRider]);
check("at the ৳5,000 cash cap → reason", (await diagnose()).reason, "cash-cap");
await q(`update riders set cash_in_hand = 0 where id = $1`, [zoneRider]);

await q(`update riders set zone_ids = '{Z9}' where id = $1`, [zoneRider]);
check("wrong zone → reason", (await diagnose()).reason, "zone-mismatch");
await q(`update riders set zone_ids = '{Z1}' where id = $1`, [zoneRider]);

const dhakaHour = Number(
  (await one(`select extract(hour from (now() at time zone 'Asia/Dhaka'))::int as h`)).h,
);
if (dhakaHour !== 3) {
  await q(`update riders set avail_from_hour = 3, avail_to_hour = 4 where id = $1`, [zoneRider]);
  check("off-shift at this hour → reason", (await diagnose()).reason, "off-shift");
  await q(`update riders set avail_from_hour = null, avail_to_hour = null where id = $1`, [zoneRider]);
} else {
  ok("off-shift check skipped (it is exactly 3am in Dhaka)");
}

/* ------------------------------------------------------------------ */
/* 4. The shop's "Ready — call rider" reaches a rider, with the window  */
/* ------------------------------------------------------------------ */
console.log("\n4. staff advance → auto-dispatch");
// Re-arm the trigger: back to confirmed (via the cancel path the guards allow),
// then the two-tap move (202609170001) that must summon a rider.
await actAs(ADMIN);
await q(`update orders set status = 'confirmed' where id = $1`, [orderId]);
await q(`delete from delivery_assignments where order_id = $1`, [orderId]);
await q(`select ps_advance_order($1, 'ready-for-pickup')`, [orderId]);
check(
  "ready-for-pickup",
  (await one(`select status from orders where id = $1`, [orderId])).status,
  "ready-for-pickup",
);

const offers = await q(
  `select state, rider_id, extract(epoch from (expires_at - offered_at))::int as window_s
     from delivery_assignments where order_id = $1`,
  [orderId],
);
check("one offer was born", offers.length, 1);
check("offer state", offers[0].state, "offered");
check("it went to the zone rider", offers[0].rider_id === zoneRider, true);
check("window came from the setting, not 90 s", offers[0].window_s, 300);
check("with a live offer → reason", (await diagnose()).reason, "already-offered");

/* ------------------------------------------------------------------ */
/* 5. Expiry re-offers to the NEXT rider                               */
/* ------------------------------------------------------------------ */
console.log("\n5. expiry + re-offer");
await q(
  `update delivery_assignments set expires_at = now() - interval '1 second'
    where order_id = $1 and state = 'offered'`,
  [orderId],
);
const secondRider = await newRider("Second Rider");
await actAs(ADMIN);
check("sweep expired 1 offer", (await one(`select ps_expire_stale_offers() as n`)).n, 1);
const afterExpire = await q(
  `select rider_id, state from delivery_assignments where order_id = $1 order by offered_at`,
  [orderId],
);
check("history kept + a fresh offer", afterExpire.map((r) => r.state), ["expired", "offered"]);
check("re-offered to the OTHER rider", afterExpire[1].rider_id === secondRider, true);

/* ------------------------------------------------------------------ */
/* 6. Stranded orders self-heal on the clock                           */
/* ------------------------------------------------------------------ */
console.log("\n6. stranded self-heal");
// Both riders have now seen this order; expire it with no third rider, which
// leaves the order with NO live offer — the stranded state nobody retried.
await q(
  `update delivery_assignments set expires_at = now() - interval '1 second'
    where order_id = $1 and state = 'offered'`,
  [orderId],
);
await actAs(ADMIN);
await q(`select ps_expire_stale_offers()`);
const stranded = await one(`select ps_stranded_orders() as s`);
check("the order shows up as stranded", stranded.s.length, 1);
check("and carries its diagnosis", stranded.s[0].diagnosis.reason, "all-have-seen");
check("redispatch finds nobody yet", (await one(`select ps_redispatch_stranded() as n`)).n, 0);

// A fresh rider comes online later — the next tick must pick the order up.
const lateRider = await newRider("Late Rider");
check("the late rider gets the stranded order", (await one(`select ps_redispatch_stranded() as n`)).n, 1);
check("no longer stranded", (await one(`select ps_stranded_orders() as s`)).s.length, 0);

/* ------------------------------------------------------------------ */
/* 7. The rider leg still completes end to end                         */
/* ------------------------------------------------------------------ */
console.log("\n7. rider accept → pickup → deliver");
const assignment = await one(
  `select id from delivery_assignments where order_id = $1 and state = 'offered'`,
  [orderId],
);
const linkRiderUser = async (riderId) => {
  const u = (await one(`insert into auth.users default values returning id`)).id;
  await q(`update riders set user_id = $1 where id = $2`, [u, riderId]);
  return u;
};
const riderUser = await linkRiderUser(lateRider);
await actAs(riderUser);
await q(`select ps_rider_accept($1)`, [assignment.id]);
check(
  "accept → courier-assigned",
  (await one(`select status from orders where id = $1`, [orderId])).status,
  "courier-assigned",
);
await q(`select ps_rider_pickup($1)`, [assignment.id]);
check(
  "pickup → out-for-delivery",
  (await one(`select status from orders where id = $1`, [orderId])).status,
  "out-for-delivery",
);
await q(`select ps_rider_deliver($1, $2)`, [assignment.id, order.delivery_code]);
check(
  "deliver with the 4-digit code → delivered",
  (await one(`select status from orders where id = $1`, [orderId])).status,
  "delivered",
);

// A wrong code must never deliver.
const order2 = await placeOrder("PS-TEST02", "01700000002");
await newRider("Fresh Rider");
await actAs(ADMIN);
await q(`select ps_advance_order($1, 'confirmed')`, [order2.id]);
await q(`select ps_advance_order($1, 'ready-for-pickup')`, [order2.id]);
const offer2 = await one(
  `select id, rider_id from delivery_assignments where order_id = $1 and state = 'offered'`,
  [order2.id],
);
const riderUser2 = await linkRiderUser(offer2.rider_id);
await actAs(riderUser2);
await q(`select ps_rider_accept($1)`, [offer2.id]);
await q(`select ps_rider_pickup($1)`, [offer2.id]);
const wrongCode = order2.delivery_code === "1234" ? "4321" : "1234";
let refused = false;
try {
  await q(`select ps_rider_deliver($1, $2)`, [offer2.id, wrongCode]);
} catch {
  refused = true;
}
check("a wrong code is refused", refused, true);
check(
  "the order is still not delivered",
  (await one(`select status from orders where id = $1`, [order2.id])).status,
  "out-for-delivery",
);

/* ------------------------------------------------------------------ */
/* 8. Security — anon may not call the new RPCs                        */
/* ------------------------------------------------------------------ */
console.log("\n8. grants");
check(
  "anon can call none of the new RPCs",
  (
    await one(`
      select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('ps_dispatch_diagnosis', 'ps_redispatch_stranded',
                          'ps_stranded_orders', 'ps_offer_window')
        and has_function_privilege('anon', p.oid, 'execute')`)
  ).n,
  0,
);
check(
  "the rider push table has no anon read policy",
  (await one(`select relrowsecurity as rls from pg_class where relname = 'push_subscriptions'`)).rls,
  true,
);

/* ------------------------------------------------------------------ */
console.log(
  failures === 0
    ? `\n\x1b[32mAll rider-dispatch checks passed.\x1b[0m`
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m`,
);
process.exit(failures === 0 ? 0 : 1);
