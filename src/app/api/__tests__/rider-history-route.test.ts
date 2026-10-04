/** /api/rider/history — self-scoped, cursor-validated trip history (Phase C). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  call: null as null | { riderId: string; opts: unknown },
}));

vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => state.ctx,
}));
vi.mock("@/lib/db/rider-history", () => ({
  listRiderHistory: async (_service: unknown, riderId: string, opts: unknown) => {
    state.call = { riderId, opts };
    return { items: [], nextCursor: null };
  },
}));

import { GET } from "../rider/history/route";

const get = (qs = "") => GET(new Request(`http://localhost/api/rider/history${qs}`));

beforeEach(() => {
  state.ctx = { rider: { id: "r1" }, service: {}, db: {}, user: { id: "u1" }, email: "r@x.test" };
  state.call = null;
});

describe("GET /api/rider/history", () => {
  it("is scoped to the signed-in rider, never an id from the URL", async () => {
    const res = await get("?riderId=someone-else");
    expect(res.status).toBe(200);
    expect(state.call?.riderId).toBe("r1");
  });

  it("passes a valid cursor and drops a junk one", async () => {
    await get("?before=2026-10-01T04:00:00Z");
    expect(state.call?.opts).toEqual({ before: "2026-10-01T04:00:00.000Z" });
    await get("?before=garbage");
    expect(state.call?.opts).toEqual({ before: null });
  });
});
