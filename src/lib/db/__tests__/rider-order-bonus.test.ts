import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readOrderBonusSettings, runOrderBonusSweep, writeOrderBonusSettings } from "../rider-order-bonus";

type Res = { data?: unknown; error?: { message?: string; code?: string } | null };

const makeDb = (o: { settings?: Res; rpc?: Res; upsertError?: boolean } = {}) => {
  const rpcCalls: string[] = [];
  const upserts: unknown[] = [];
  const db = {
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      return { data: o.rpc?.data ?? null, error: o.rpc?.error ?? null };
    },
    from: () => ({
      select: () => ({ in: async () => ({ data: o.settings?.data ?? null, error: o.settings?.error ?? null }) }),
      upsert: async (rows: unknown) => {
        upserts.push(rows);
        return { error: o.upsertError ? { message: "denied" } : null };
      },
    }),
  } as never;
  return { db, rpcCalls, upserts };
};

const on = { data: [{ key: "rider_peak_bonus_paisa", value: 3000 }, { key: "rider_rain_bonus_paisa", value: 2000 }] };

describe("order-bonus settings", () => {
  it("reads the four keys, defaults for the rest", async () => {
    expect(await readOrderBonusSettings(makeDb({ settings: on }).db)).toEqual({ peakBonus: 3000, peakStartHour: 18, peakEndHour: 22, rainBonus: 2000, streakWeeks: 0, streakBonus: 0 });
  });
  it("answers 'off' when the read fails", async () => {
    expect((await readOrderBonusSettings(makeDb({ settings: { error: { message: "x" } } }).db)).peakBonus).toBe(0);
  });
  it("writes paisa through the caller's client; bad input is a 422 and writes nothing", async () => {
    const { db, upserts } = makeDb();
    await writeOrderBonusSettings(db, { peakBonusTaka: 30, peakStartHour: 18, peakEndHour: 22, rainBonusTaka: 20, streakWeeks: 3, streakBonusTaka: 500 });
    expect(upserts[0]).toEqual([
      { key: "rider_peak_bonus_paisa", value: 3000 },
      { key: "rider_peak_start_hour", value: 18 },
      { key: "rider_peak_end_hour", value: 22 },
      { key: "rider_rain_bonus_paisa", value: 2000 },
      { key: "rider_streak_weeks", value: 3 },
      { key: "rider_streak_bonus_paisa", value: 50000 },
    ]);
    await expect(writeOrderBonusSettings(db, { peakBonusTaka: 999 })).rejects.toMatchObject({ status: 422 });
    expect(upserts).toHaveLength(1);
  });
  it("a failed write is an error", async () => {
    await expect(writeOrderBonusSettings(makeDb({ upsertError: true }).db, {})).rejects.toThrow(/Could not save/);
  });
});

describe("runOrderBonusSweep", () => {
  it("does nothing at all while both bonuses are off", async () => {
    const { db, rpcCalls } = makeDb();
    const push = vi.fn();
    expect(await runOrderBonusSweep(db, { pushRider: push })).toMatchObject({ status: "skipped" });
    expect(rpcCalls).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("pays via the database and sends ONE push per rider per kind", async () => {
    const awards = [
      { riderId: "a", kind: "peak_bonus", amount: 3000, note: "n" },
      { riderId: "a", kind: "peak_bonus", amount: 3000, note: "n" },
      { riderId: "a", kind: "rain_bonus", amount: 2000, note: "n" },
      { riderId: "b", kind: "peak_bonus", amount: 3000, note: "n" },
      { riderId: "b", kind: "streak_bonus", amount: 50000, note: "n" },
    ];
    const { db } = makeDb({ settings: on, rpc: { data: { peak: 3, rain: 1, streak: 1, total: 61000, awards } } });
    const push = vi.fn(async () => undefined);
    const r = await runOrderBonusSweep(db, { pushRider: push });
    expect(r).toEqual({ status: "ran", did: 5, detail: "3 peak + 1 rain + 1 streak bonus(es), ৳610 paid" });
    expect(push).toHaveBeenCalledTimes(4);
    expect(push).toHaveBeenCalledWith("b", expect.stringContaining("স্ট্রিক"), expect.any(String));
    expect(push).toHaveBeenCalledWith("a", expect.stringContaining("পিক"), expect.stringContaining("2টি"));
  });

  it("says 'nothing due' and survives a failing push", async () => {
    const quiet = makeDb({ settings: on, rpc: { data: { peak: 0, rain: 0, total: 0, awards: [] } } });
    expect((await runOrderBonusSweep(quiet.db, { pushRider: vi.fn() })).detail).toBe("nothing due");
    const loud = makeDb({ settings: on, rpc: { data: { peak: 1, rain: 0, total: 3000, awards: [{ riderId: "a", kind: "peak_bonus", amount: 3000, note: "" }] } } });
    expect((await runOrderBonusSweep(loud.db, { pushRider: async () => { throw new Error("push down"); } })).status).toBe("ran");
  });

  it("skips (not fails) on a database without the migration, fails on any other error", async () => {
    const missing = makeDb({ settings: on, rpc: { error: { code: "PGRST202", message: "Could not find the function public.ps_award_order_bonuses" } } });
    expect(await runOrderBonusSweep(missing.db, { pushRider: vi.fn() })).toMatchObject({ status: "skipped", detail: expect.stringContaining("202610020015") });
    const broken = makeDb({ settings: on, rpc: { error: { message: "boom" } } });
    expect(await runOrderBonusSweep(broken.db, { pushRider: vi.fn() })).toMatchObject({ status: "failed" });
  });
});
