/**
 * POST /api/orders — the unseeded-catalog dead-end regression.
 *
 * A configured-but-empty database used to answer the 503
 * "Online ordering is not set up yet — please call …" and no customer could
 * ever order. The route must instead: seed the launch catalog in place and
 * place a REAL order (bridging launch-seed ids like `p1` to live uuid rows),
 * and when the database itself refuses, answer an honest 503 — never a fake
 * success. A seeded store is untouched.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  serviceConfigured: true,
  snapshotReads: 0,
  emptySnapshot: null as Record<string, unknown> | null,
  seededSnapshot: null as Record<string, unknown> | null,
  snapshotThrows: false,
  seedCalls: 0,
  seedOk: true,
  seedThrows: false,
  validateResult: { ok: true } as Record<string, unknown>,
  lastPayload: null as Record<string, unknown> | null,
  placementError: null as Error | null,
  placedOrder: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/env", () => ({
  isServiceRoleConfigured: () => state.serviceConfigured,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFromHeaders: () => "203.0.113.7",
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({ __fake: "service-client" }),
}));

vi.mock("@/lib/db/orders", () => ({
  OrderPlacementError: class OrderPlacementError extends Error {
    status: number;
    field: string;
    constructor(field: string, message: string, status = 422) {
      super(message);
      this.field = field;
      this.status = status;
    }
  },
  countOrdersForPhone: async () => 0,
  loadOrderSnapshot: async () => {
    state.snapshotReads += 1;
    if (state.snapshotThrows) throw new Error("order snapshot read failed");
    // First read reflects the pre-seed state; later reads the seeded rows.
    return state.seedCalls > 0 ? state.seededSnapshot : state.emptySnapshot;
  },
  placeLiveOrder: async () => {
    if (state.placementError) throw state.placementError;
    return state.placedOrder;
  },
}));

vi.mock("@/lib/db/engagement", () => ({ notifyStaff: async () => undefined }));

vi.mock("@/lib/customer-auth", () => ({
  resolveCustomer: async () => null,
  loadSmartCardTarget: async () => ({ target: 10 }),
}));

vi.mock("@/lib/order-validation", () => ({
  validateOrderPayload: (payload: Record<string, unknown>) => {
    state.lastPayload = payload;
    return state.validateResult;
  },
}));

vi.mock("@/lib/db/auto-seed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/auto-seed")>();
  return {
    ...actual, // keep the real pure helpers (id→slug bridging is under test)
    ensureLaunchCatalog: async () => {
      state.seedCalls += 1;
      if (state.seedThrows) throw new Error("connection refused");
      return state.seedOk;
    },
  };
});

import { POST } from "@/app/api/orders/route";
import { PRODUCTS } from "@/lib/catalog";

const emptySnapshot = () => ({
  products: [],
  zones: [],
  coupons: [],
  variants: [],
  mediaByProduct: new Map(),
  shops: [],
  totalOrders: 0,
});

/** Live mirror of the seed catalog: same slugs, uuid ids. */
const seededSnapshot = () => ({
  ...emptySnapshot(),
  products: PRODUCTS.map((p, i) => ({ ...p, id: `u-${i + 1}` })),
});

const payload = () => ({
  name: "রহিম",
  phone: "01712345678",
  district: "সুনামগঞ্জ",
  upazila: "সুনামগঞ্জ সদর",
  para: "বড়পাড়া",
  address: "বড়পাড়া ১২",
  zoneId: "z1",
  items: [{ productId: PRODUCTS[0].id, variantLabel: "Forest Green · L", qty: 1 }],
});

const post = async (body: unknown) =>
  POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.serviceConfigured = true;
  state.snapshotReads = 0;
  state.emptySnapshot = emptySnapshot();
  state.seededSnapshot = seededSnapshot();
  state.snapshotThrows = false;
  state.seedCalls = 0;
  state.seedOk = true;
  state.seedThrows = false;
  state.validateResult = { ok: true, draft: { customer: { name: "রহিম", phone: "01712345678" } } };
  state.lastPayload = null;
  state.placementError = null;
  state.placedOrder = {
    id: "PS-1001",
    total: 149000,
    deliveryCharge: 0,
    customer: { phone: "01712345678" },
  };
});

describe("POST /api/orders — unseeded live catalog", () => {
  it("seeds in place and places a REAL order instead of the dead-end 503", async () => {
    const res = await post(payload());
    expect(res.status).toBe(201);
    expect(state.seedCalls).toBe(1);
    const body = await res.json();
    expect(body.order.id).toBe("PS-1001");
    expect(body.demoMode).toBeUndefined();
  });

  it("bridges launch-seed ids (p1…) to live uuid rows via slug", async () => {
    const res = await post(payload());
    expect(res.status).toBe(201);
    const items = (state.lastPayload as { items: { productId: string }[] }).items;
    expect(items[0].productId).toBe("u-1"); // PRODUCTS[0] slug → seeded row
  });

  it("database refuses to seed → honest 503, never a fake success", async () => {
    state.seedOk = false;
    const res = await post(payload());
    expect(res.status).toBe(503);
    expect(await res.json()).toHaveProperty("error");
  });

  it("snapshot read failure + seed failure → 503, never a fake success", async () => {
    state.snapshotThrows = true;
    state.seedThrows = true;
    const res = await post(payload());
    expect(res.status).toBe(503);
    expect(await res.json()).toHaveProperty("error");
  });

  it("freshly-seeded store whose payload still fails → 422 field errors", async () => {
    state.validateResult = {
      ok: false,
      errors: [{ field: "items", message: "That product is not available." }],
    };
    const res = await post(payload());
    expect(res.status).toBe(422);
  });

  it("placement blowing up right after auto-seed → 503 (RPC/schema gap)", async () => {
    const err = new Error("function ps_place_order does not exist");
    state.placementError = err;
    const res = await post(payload());
    expect(res.status).toBe(503);
  });
});

describe("POST /api/orders — seeded store is untouched", () => {
  it("live products present → never seeds; validation errors stay 422", async () => {
    state.emptySnapshot = seededSnapshot(); // already stocked
    state.validateResult = {
      ok: false,
      errors: [{ field: "couponCode", message: "Coupon is expired." }],
    };
    const res = await post(payload());
    expect(state.seedCalls).toBe(0);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Please fix the highlighted fields." });
  });

  it("OrderPlacementError on a seeded store keeps its status/field", async () => {
    state.emptySnapshot = seededSnapshot();
    const { OrderPlacementError } = (await import("@/lib/db/orders")) as {
      OrderPlacementError: new (f: string, m: string, s: number) => Error;
    };
    state.placementError = new OrderPlacementError("items", "Stock runs out mid-checkout", 422);
    const res = await post(payload());
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: "Stock runs out mid-checkout",
      field: "items",
    });
  });

  it("no service role → 503 early", async () => {
    state.serviceConfigured = false;
    const res = await post(payload());
    expect(res.status).toBe(503);
    expect(state.seedCalls).toBe(0);
  });
});
