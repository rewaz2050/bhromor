import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getRiderIncentives, readIncentiveSettings, registerReferral, runIncentiveSweep, writeIncentiveSettings } from "../rider-incentives";

type Res = { data?: unknown; error?: { message?: string; code?: string } | null };

const chain = (result: Res) => {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "order", "limit"]) c[m] = () => c;
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(ok);
  return c;
};

const makeDb = (o: { tables?: Record<string, Res[]>; rpc?: Record<string, Res>; upsertError?: boolean } = {}) => {
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const upserts: unknown[] = [];
  const queues = Object.fromEntries(Object.entries(o.tables ?? {}).map(([k, v]) => [k, [...v]]));
  const db = {
    rpc: async (fn: string, args?: unknown) => {
      rpcCalls.push({ fn, args });
      const r = o.rpc?.[fn] ?? { data: null };
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from: (table: string) => {
      const next = queues[table]?.shift() ?? { data: [] };
      const c = chain(next) as Record<string, unknown>;
      c.upsert = async (rows: unknown) => {
        upserts.push(rows);
        return { error: o.upsertError ? { message: "denied" } : null };
      };
      return c;
    },
  } as never;
  return { db, rpcCalls, upserts };
};

const settingsRows = [
  { key: "incentive_daily_target", value: 8 },
  { key: "incentive_daily_bonus_paisa", value: 5000 },
  { key: "incentive_referral_bonus_paisa", value: 20000 },
  { key: "incentive_referral_after", value: 10 },
];

describe("settings", () => {
  it("reads the four keys", async () => {
    const { db } = makeDb({ tables: { site_settings: [{ data: settingsRows }] } });
    expect(await readIncentiveSettings(db)).toEqual({ dailyTarget: 8, dailyBonus: 5000, referralBonus: 20000, referralAfter: 10 });
  });
  it("answers 'off' when the read fails", async () => {
    const { db } = makeDb({ tables: { site_settings: [{ error: { message: "x" } }] } });
    expect((await readIncentiveSettings(db)).dailyTarget).toBe(0);
  });
  it("writes paisa through the caller's client and rejects bad input with 422", async () => {
    const { db, upserts } = makeDb();
    await writeIncentiveSettings(db, { dailyTarget: 8, dailyBonusTaka: 50, referralBonusTaka: 200, referralAfter: 10 });
    expect(upserts[0]).toEqual([
      { key: "incentive_daily_target", value: 8 },
      { key: "incentive_daily_bonus_paisa", value: 5000 },
      { key: "incentive_referral_bonus_paisa", value: 20000 },
      { key: "incentive_referral_after", value: 10 },
    ]);
    await expect(writeIncentiveSettings(db, { dailyTarget: 3, dailyBonusTaka: 0, referralBonusTaka: 0, referralAfter: 10 })).rejects.toMatchObject({ status: 422 });
    await expect(writeIncentiveSettings(makeDb({ upsertError: true }).db, { dailyTarget: 0, dailyBonusTaka: 0, referralBonusTaka: 0, referralAfter: 10 })).rejects.toThrow(/Could not save/);
  });
});

describe("runIncentiveSweep", () => {
  const on = { site_settings: [{ data: settingsRows }] };
  it("does not even call the database while both bonuses are off", async () => {
    const { db, rpcCalls } = makeDb({ tables: { site_settings: [{ data: [] }] } });
    const push = vi.fn();
    expect(await runIncentiveSweep(db, { pushRider: push })).toMatchObject({ status: "skipped", did: 0 });
    expect(rpcCalls).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });
  it("pays through the RPC and tells each rider", async () => {
    const { db } = makeDb({
      tables: on,
      rpc: { ps_award_incentives: { data: { daily: 1, referral: 1, total: 25000, awards: [
        { riderId: "r1", kind: "daily_target", amount: 5000 },
        { riderId: "r2", kind: "referral", amount: 20000 },
      ] } } },
    });
    const push = vi.fn(async () => 1);
    const r = await runIncentiveSweep(db, { pushRider: push });
    expect(r).toMatchObject({ status: "ran", did: 2 });
    expect(r.detail).toContain("৳250");
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[0]).toEqual(["r1", expect.stringContaining("টার্গেট"), expect.stringContaining("৳50")]);
  });
  it("a push failure never undoes or hides the payment", async () => {
    const { db } = makeDb({ tables: on, rpc: { ps_award_incentives: { data: { daily: 1, referral: 0, total: 5000, awards: [{ riderId: "r1", kind: "daily_target", amount: 5000 }] } } } });
    const r = await runIncentiveSweep(db, { pushRider: async () => { throw new Error("push down"); } });
    expect(r).toMatchObject({ status: "ran", did: 1 });
  });
  it("names the migration when the function is missing, and reports other errors as failed", async () => {
    const missing = makeDb({ tables: on, rpc: { ps_award_incentives: { error: { code: "42883", message: "function ps_award_incentives does not exist" } } } });
    expect(await runIncentiveSweep(missing.db, { pushRider: vi.fn() })).toMatchObject({ status: "skipped", detail: expect.stringContaining("202610020010") });
    const broken = makeDb({ tables: on, rpc: { ps_award_incentives: { error: { message: "boom" } } } });
    expect((await runIncentiveSweep(broken.db, { pushRider: vi.fn() })).status).toBe("failed");
  });
  it("says 'nothing due' for an empty sweep", async () => {
    const { db } = makeDb({ tables: on, rpc: { ps_award_incentives: { data: { daily: 0, referral: 0, total: 0, awards: [] } } } });
    expect(await runIncentiveSweep(db, { pushRider: vi.fn() })).toMatchObject({ status: "ran", did: 0, detail: "nothing due" });
  });
});

describe("registerReferral", () => {
  it("is 'none' for an absent or blank code and never calls the database", async () => {
    const { db, rpcCalls } = makeDb();
    expect(await registerReferral(db, "r9", undefined)).toBe("none");
    expect(await registerReferral(db, "r9", null)).toBe("none");
    expect(await registerReferral(db, "r9", "   ")).toBe("none");
    expect(rpcCalls).toHaveLength(0);
  });
  it("an unusable code is 'unknown' without a round trip", async () => {
    const { db, rpcCalls } = makeDb();
    expect(await registerReferral(db, "r9", "!!")).toBe("unknown");
    expect(rpcCalls).toHaveLength(0);
  });
  it("sends the canonical code and passes the answer through", async () => {
    const { db, rpcCalls } = makeDb({ rpc: { ps_register_rider_referral: { data: "registered" } } });
    expect(await registerReferral(db, "r9", "k7mq2x")).toBe("registered");
    expect(rpcCalls[0]).toEqual({ fn: "ps_register_rider_referral", args: { p_referee: "r9", p_code: "K7MQ2X" } });
  });
  it("never throws, whatever the database does", async () => {
    expect(await registerReferral(makeDb({ rpc: { ps_register_rider_referral: { error: { message: "x" } } } }).db, "r9", "K7MQ2X")).toBe("unknown");
    expect(await registerReferral(makeDb({ rpc: { ps_register_rider_referral: { data: "weird" } } }).db, "r9", "K7MQ2X")).toBe("unknown");
    const throwing = { rpc: async () => { throw new Error("net"); } } as never;
    expect(await registerReferral(throwing, "r9", "K7MQ2X")).toBe("unknown");
  });
});

describe("getRiderIncentives", () => {
  const NOW = Date.parse("2026-10-02T08:00:00Z"); // 14:00 Dhaka
  it("is null when the migration has not run", async () => {
    const { db } = makeDb({ tables: { site_settings: [{ data: settingsRows }] }, rpc: { ps_rider_referral_code: { error: { code: "42883", message: "does not exist" } } } });
    expect(await getRiderIncentives(db, "r1", NOW)).toBeNull();
  });
  it("builds today's progress (returns excluded), the code and the referred riders (first names only)", async () => {
    const { db } = makeDb({
      rpc: { ps_rider_referral_code: { data: "K7MQ2X" } },
      tables: {
        site_settings: [{ data: settingsRows }],
        delivery_assignments: [
          { data: [{ id: "a1", orders: { is_return: false } }, { id: "a2", orders: { is_return: true } }, { id: "a3", orders: [{ is_return: false }] }] },
          { data: [
            { rider_id: "r2", orders: { is_return: false } }, { rider_id: "r2", orders: { is_return: false } }, { rider_id: "r2", orders: { is_return: true } },
          ] },
        ],
        rider_incentive_awards: [{ data: [
          { kind: "daily_target", ref_key: "2026-10-02", amount: "5000" },
          { kind: "referral", ref_key: "x", amount: 20000 },
        ] }],
        rider_referrals: [{ data: [
          { referee_id: "r2", rewarded_at: null, riders: { name: "Karim Hossain" } },
          { referee_id: "r3", rewarded_at: "2026-10-01T00:00:00Z", riders: [{ name: "Salma Akter" }] },
        ] }],
      },
    });
    const v = await getRiderIncentives(db, "r1", NOW);
    expect(v?.today).toMatchObject({ done: 2, target: 8, left: 6 });
    expect(v?.todayPaid).toBe(true);
    expect(v?.referral.code).toBe("K7MQ2X");
    expect(v?.referral.items).toEqual([
      { name: "Karim", done: 2, rewarded: false },
      { name: "Salma", done: 0, rewarded: true },
    ]);
    expect(v?.referral.totalEarned).toBe(20000);
    expect(v?.totalEarned).toBe(25000);
  });
  it("hides the daily block when the daily bonus is off", async () => {
    const { db } = makeDb({ rpc: { ps_rider_referral_code: { data: "K7MQ2X" } }, tables: { site_settings: [{ data: [] }] } });
    expect((await getRiderIncentives(db, "r1", NOW))?.today).toBeNull();
  });
});
