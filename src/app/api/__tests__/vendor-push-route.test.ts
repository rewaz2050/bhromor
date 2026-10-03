/** /api/vendor/push: always the session shop; honest about config and the migration. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  signedIn: true,
  saved: [] as { shopId: string; userId: string; sub: unknown }[],
  removed: [] as { shopId: string; endpoint: unknown }[],
  saveResult: { ok: true } as { ok: boolean; reason?: string },
  configured: true,
  service: true,
}));

vi.mock("@/lib/vendor-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/vendor-auth")>("@/lib/vendor-auth");
  return {
    ...actual,
    requireVendor: async () => {
      if (!state.signedIn) throw new actual.VendorAuthError("Please sign in again.", 401);
      return { user: { id: "u1", email: "s@x.test" }, shopId: "shop-1", role: "owner", db: {} };
    },
  };
});
vi.mock("@/lib/push", () => ({ isPushConfigured: () => state.configured }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => (state.service ? {} : null) }));
vi.mock("@/lib/vendor-push", () => ({
  vendorPushStatus: async (_s: unknown, shopId: string) => ({ configured: true, publicKey: "pub", tableReady: true, count: shopId === "shop-1" ? 3 : 0 }),
  saveVendorSubscription: async (_s: unknown, shopId: string, userId: string, sub: unknown) => {
    state.saved.push({ shopId, userId, sub });
    return state.saveResult;
  },
  removeVendorSubscription: async (_s: unknown, shopId: string, endpoint: unknown) => {
    state.removed.push({ shopId, endpoint });
  },
}));

import { DELETE, GET, POST } from "../vendor/push/route";

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/vendor/push?shopId=evil", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const call = (fn: unknown, r: Request) => (fn as (r: Request) => Promise<Response>)(r);

beforeEach(() => {
  state.signedIn = true;
  state.saved = [];
  state.removed = [];
  state.saveResult = { ok: true };
  state.configured = true;
  state.service = true;
});

describe("/api/vendor/push", () => {
  it("refuses a signed-out caller", async () => {
    state.signedIn = false;
    expect((await call(GET, req("GET"))).status).toBe(401);
    expect((await call(POST, req("POST", { endpoint: "https://x", keys: {} }))).status).toBe(401);
    expect(state.saved).toHaveLength(0);
  });

  it("GET answers for the session shop only", async () => {
    expect(await (await call(GET, req("GET"))).json()).toMatchObject({ publicKey: "pub", count: 3 });
  });

  it("POST registers for the SESSION shop, ignoring a shop id in the body or URL", async () => {
    const res = await call(POST, req("POST", { endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" }, shopId: "other", shop_id: "x" }));
    expect(res.status).toBe(200);
    expect(state.saved).toEqual([
      { shopId: "shop-1", userId: "u1", sub: { endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" } } },
    ]);
  });

  it("POST: 503 without VAPID keys, 503 naming the migration for a missing table, 422 for junk", async () => {
    state.configured = false;
    expect((await call(POST, req("POST", { endpoint: "https://push/1", keys: {} }))).status).toBe(503);
    state.configured = true;
    state.saveResult = { ok: false, reason: "missing_table" };
    const missing = await call(POST, req("POST", { endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" } }));
    expect(missing.status).toBe(503);
    expect((await missing.json()).error).toContain("202610020018_vendor_push.sql");
    state.saveResult = { ok: false, reason: "invalid" };
    expect((await call(POST, req("POST", { endpoint: "nope" }))).status).toBe(422);
  });

  it("DELETE removes only the session shop's device", async () => {
    const res = await call(DELETE, req("DELETE", { endpoint: "https://push/1", shopId: "other" }));
    expect(res.status).toBe(200);
    expect(state.removed).toEqual([{ shopId: "shop-1", endpoint: "https://push/1" }]);
  });

  it("says so when the service client is not configured", async () => {
    state.service = false;
    expect((await call(GET, req("GET"))).status).toBe(503);
  });
});
