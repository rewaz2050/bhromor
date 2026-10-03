/** Item M: the opt-in auto-suspend sweep and the scorecard reads. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getScorecards, readAutoSuspend, runQualitySweep, writeAutoSuspend } from "../rider-quality";

const NOW = Date.parse("2026-10-02T06:00:00.000Z");
const H = 3_600_000;

type Row = Record<string, unknown>;
const state = {
  policy: undefined as unknown,
  policyError: null as unknown,
  rpc: { data: [] as unknown, error: null as unknown },
  rpcCalls: [] as string[],
  updates: [] as { id: string; patch: Row; guardStatus: unknown }[],
  updateWins: true,
  upserts: [] as Row[],
};

const service = {
  rpc: async (name: string) => {
    state.rpcCalls.push(name);
    return state.rpc;
  },
  from: (table: string) => {
    if (table === "site_settings") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              state.policyError
                ? { data: null, error: state.policyError }
                : { data: state.policy === undefined ? null : { value: state.policy }, error: null },
          }),
        }),
        upsert: async (row: Row) => {
          state.upserts.push(row);
          return { error: null };
        },
      };
    }
    // riders: update(patch).eq("id").eq("status","active").select("id").maybeSingle()
    let patch: Row = {};
    let id = "";
    let guardStatus: unknown;
    const chain: Record<string, unknown> = {
      update: (p: Row) => {
        patch = p;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        if (col === "id") id = String(val);
        if (col === "status") guardStatus = val;
        return chain;
      },
      select: () => chain,
      maybeSingle: async () => {
        state.updates.push({ id, patch, guardStatus });
        return { data: state.updateWins ? { id } : null, error: null };
      },
    };
    return chain;
  },
} as never;

const raw = (over: Row): Row => ({
  id: "r1", name: "Rafiq", vehicle: "bike", isOnline: true, ratingAvg: 4.5, ratingCount: 10, cashInHand: 0, currentLoad: 0,
  pendingClaim: false, oldestCodAt: null, offered: 10, delivered: 10, failed: 0, declined: 0, expired: 0, ...over,
});

const notices: { title: string; body: string }[] = [];
const pushes: string[] = [];
const deps = {
  notifyStaff: async (title: string, body: string) => {
    notices.push({ title, body });
  },
  pushRider: async (riderId: string) => {
    pushes.push(riderId);
  },
};

beforeEach(() => {
  state.policy = true;
  state.policyError = null;
  state.rpc = { data: [], error: null };
  state.rpcCalls = [];
  state.updates = [];
  state.updateWins = true;
  state.upserts = [];
  notices.length = 0;
  pushes.length = 0;
});

describe("auto-suspend switch", () => {
  it("is OFF when the key is absent, false, or unreadable", async () => {
    state.policy = undefined;
    expect(await readAutoSuspend(service)).toBe(false);
    state.policy = false;
    expect(await readAutoSuspend(service)).toBe(false);
    state.policy = true;
    state.policyError = { message: "boom" };
    expect(await readAutoSuspend(service)).toBe(false);
  });
  it("writes the boolean under its key", async () => {
    await writeAutoSuspend(service, true);
    expect(state.upserts).toEqual([{ key: "rider_auto_suspend", value: true }]);
  });
});

describe("getScorecards", () => {
  it("returns null when the function is missing, throws on other errors", async () => {
    state.rpc = { data: null, error: { code: "42883", message: "function ps_admin_rider_scorecards does not exist" } };
    expect(await getScorecards(service)).toBeNull();
    state.rpc = { data: null, error: { code: "XX000", message: "boom" } };
    await expect(getScorecards(service)).rejects.toThrow();
    state.rpc = { data: [raw({})], error: null };
    expect(await getScorecards(service)).toHaveLength(1);
  });
});

describe("runQualitySweep", () => {
  it("does NOTHING while the switch is off — not even a read", async () => {
    state.policy = false;
    state.rpc = { data: [raw({ delivered: 2, failed: 8 })], error: null };
    const r = await runQualitySweep(service, NOW, deps);
    expect(r.status).toBe("skipped");
    expect(state.rpcCalls).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("suspends a rider meeting a hard rule, offline, with the reason, guarded on status=active; tells staff + rider", async () => {
    state.rpc = { data: [raw({ id: "bad", name: "Bad", delivered: 2, failed: 8 }), raw({ id: "ok", name: "Fine" })], error: null };
    const r = await runQualitySweep(service, NOW, deps);
    expect(r).toMatchObject({ status: "ran", did: 1 });
    expect(state.rpcCalls).toEqual(["ps_rider_scorecards_raw"]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ id: "bad", guardStatus: "active" });
    expect(state.updates[0].patch).toMatchObject({ status: "suspended", is_online: false });
    expect(String(state.updates[0].patch.review_note)).toContain("8 of 10");
    expect(notices).toHaveLength(1);
    expect(notices[0].body).toContain("Bad: 8 of 10");
    expect(pushes).toEqual(["bad"]);
  });

  it("never suspends a rider who is carrying a job — defers to the next tick", async () => {
    state.rpc = { data: [raw({ id: "busy", delivered: 2, failed: 8, currentLoad: 1 })], error: null };
    const r = await runQualitySweep(service, NOW, deps);
    expect(r).toMatchObject({ status: "ran", did: 0 });
    expect(r.detail).toContain("1 deferred");
    expect(state.updates).toEqual([]);
    expect(notices).toHaveLength(0);
  });

  it("does not announce a rider staff already changed (guarded update matched nothing)", async () => {
    state.updateWins = false;
    state.rpc = { data: [raw({ delivered: 2, failed: 8 })], error: null };
    const r = await runQualitySweep(service, NOW, deps);
    expect(r.did).toBe(0);
    expect(notices).toHaveLength(0);
    expect(pushes).toEqual([]);
  });

  it("suspends on COD held 4+ days, but a waiting settle claim protects the rider", async () => {
    state.rpc = {
      data: [
        raw({ id: "old", cashInHand: 300000, oldestCodAt: new Date(NOW - 100 * H).toISOString() }),
        raw({ id: "claimed", cashInHand: 300000, pendingClaim: true, oldestCodAt: new Date(NOW - 100 * H).toISOString() }),
      ],
      error: null,
    };
    await runQualitySweep(service, NOW, deps);
    expect(state.updates.map((u) => u.id)).toEqual(["old"]);
  });

  it("skips when the scorecard function is missing; fails soft on other errors", async () => {
    state.rpc = { data: null, error: { code: "42883", message: "function ps_rider_scorecards_raw does not exist" } };
    expect((await runQualitySweep(service, NOW, deps)).status).toBe("skipped");
    state.rpc = { data: null, error: { code: "XX000", message: "boom" } };
    expect((await runQualitySweep(service, NOW, deps)).status).toBe("failed");
  });
});
