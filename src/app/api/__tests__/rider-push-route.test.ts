/** /api/rider/push (item I): always the session rider; honest about config and the migration. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  saved: [] as { riderId: string; sub: unknown }[],
  removed: [] as { riderId: string; endpoint: unknown }[],
  saveResult: { ok: true } as { ok: boolean; reason?: string },
  configured: true,
}));

vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => state.ctx,
}));
vi.mock("@/lib/push", () => ({ isPushConfigured: () => state.configured }));
vi.mock("@/lib/rider-push", () => ({
  riderPushStatus: async (_s: unknown, riderId: string) => ({ configured: true, publicKey: "pub", tableReady: true, count: riderId === "r1" ? 2 : 0 }),
  saveRiderSubscription: async (_s: unknown, riderId: string, sub: unknown) => {
    state.saved.push({ riderId, sub });
    return state.saveResult;
  },
  removeRiderSubscription: async (_s: unknown, riderId: string, endpoint: unknown) => {
    state.removed.push({ riderId, endpoint });
  },
}));

import { DELETE, GET, POST } from "../rider/push/route";

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/rider/push?riderId=evil", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const call = (fn: unknown, r: Request) => (fn as (r: Request) => Promise<Response>)(r);

beforeEach(() => {
  state.ctx = { rider: { id: "r1" }, service: {}, db: {}, user: { id: "u1" }, email: "r@x.test" };
  state.saved = [];
  state.removed = [];
  state.saveResult = { ok: true };
  state.configured = true;
});

describe("/api/rider/push", () => {
  it("GET answers for the session rider only", async () => {
    const body = await (await call(GET, req("GET"))).json();
    expect(body).toMatchObject({ configured: true, publicKey: "pub", count: 2 });
  });

  it("POST registers the device for the SESSION rider, ignoring a rider id in the body", async () => {
    const sub = { endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" }, riderId: "someone-else", rider_id: "x" };
    const res = await call(POST, req("POST", sub));
    expect(res.status).toBe(200);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].riderId).toBe("r1");
    expect(state.saved[0].sub).toEqual({ endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" } });
  });

  it("POST says so when the server has no VAPID keys (503) and does not store anything", async () => {
    state.configured = false;
    expect((await call(POST, req("POST", { endpoint: "https://push/1", keys: {} }))).status).toBe(503);
    expect(state.saved).toHaveLength(0);
  });

  it("POST maps a missing table to a 503 that names the migration, a bad subscription to 422", async () => {
    state.saveResult = { ok: false, reason: "missing_table" };
    const missing = await call(POST, req("POST", { endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" } }));
    expect(missing.status).toBe(503);
    expect((await missing.json()).error).toContain("202610020004_rider_push.sql");
    state.saveResult = { ok: false, reason: "invalid" };
    expect((await call(POST, req("POST", { endpoint: "nope" }))).status).toBe(422);
  });

  it("DELETE removes only the session rider's device", async () => {
    const res = await call(DELETE, req("DELETE", { endpoint: "https://push/1", riderId: "other" }));
    expect(res.status).toBe(200);
    expect(state.removed).toEqual([{ riderId: "r1", endpoint: "https://push/1" }]);
  });
});
