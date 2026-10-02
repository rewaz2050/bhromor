/** /api/rider/stats — scoreboard + best-effort today figures (Phase C2). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  ids: [] as string[],
  todayFails: false,
}));

vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => state.ctx,
}));
vi.mock("@/lib/db/riders", () => ({
  getRiderStats: async (_s: unknown, id: string) => {
    state.ids.push(id);
    return { totalDeliveries: 10, weekDeliveries: 3, ratingAvg: 4.5, ratingCount: 2 };
  },
}));
vi.mock("@/lib/db/rider-history", () => ({
  getRiderToday: async (_s: unknown, id: string) => {
    state.ids.push(id);
    if (state.todayFails) throw new Error("boom");
    return { todayDeliveries: 2, todayEarned: 9000 };
  },
}));

import { GET } from "../rider/stats/route";

beforeEach(() => {
  state.ctx = { rider: { id: "r1" }, service: {}, db: {}, user: { id: "u1" }, email: "r@x.test" };
  state.ids = [];
  state.todayFails = false;
});

describe("GET /api/rider/stats", () => {
  it("merges today's figures into the scoreboard, scoped to the session rider", async () => {
    const res = await GET(new Request("http://localhost/api/rider/stats?riderId=x"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stats).toMatchObject({ totalDeliveries: 10, todayDeliveries: 2, todayEarned: 9000 });
    expect(state.ids).toEqual(["r1", "r1"]);
  });

  it("still answers with the scoreboard when today's figures fail", async () => {
    state.todayFails = true;
    const body = await (await GET(new Request("http://localhost/api/rider/stats"))).json();
    expect(body.stats.totalDeliveries).toBe(10);
    expect(body.stats.todayDeliveries).toBeUndefined();
  });

  it("carries the admin-set cash cap (J), and the old ৳5,000 when nothing is set", async () => {
    const withRows = (rows: unknown[] | null) => ({
      from: () => ({ select: () => ({ in: async () => (rows ? { data: rows, error: null } : { data: null, error: { message: "no table" } }) }) }),
    });
    state.ctx = { ...state.ctx, service: withRows([{ key: "rider_cash_cap_paisa", value: 300000 }]) };
    expect((await (await GET(new Request("http://localhost/api/rider/stats"))).json()).stats.cashLimit).toBe(300000);
    state.ctx = { ...state.ctx, service: withRows(null) };
    expect((await (await GET(new Request("http://localhost/api/rider/stats"))).json()).stats.cashLimit).toBe(500000);
  });
});
