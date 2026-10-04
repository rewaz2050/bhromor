import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ ctx: {} as Record<string, unknown>, id: "", summary: null as unknown }));
vi.mock("@/lib/rider-auth", () => ({ RiderAuthError: class extends Error {}, requireRider: async () => state.ctx }));
vi.mock("@/lib/db/rider-rating", () => ({
  getRiderRatingSummary: async (_s: unknown, id: string) => {
    state.id = id;
    return state.summary;
  },
}));

import { GET } from "../rider/ratings/route";

beforeEach(() => {
  state.ctx = { rider: { id: "r1" }, service: {}, db: {}, user: { id: "u1" }, email: "r@x.test" };
  state.summary = { count: 1, avg: 5 };
});

describe("GET /api/rider/ratings", () => {
  it("is scoped to the session rider", async () => {
    const body = await (await GET(new Request("http://localhost/api/rider/ratings?riderId=zzz"))).json();
    expect(state.id).toBe("r1");
    expect(body).toEqual({ ready: true, summary: { count: 1, avg: 5 } });
  });
  it("ready:false when the table is missing", async () => {
    state.summary = null;
    expect(await (await GET(new Request("http://localhost/api/rider/ratings"))).json()).toEqual({ ready: false, summary: null });
  });
});
