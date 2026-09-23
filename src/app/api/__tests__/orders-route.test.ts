/**
 * POST /api/orders — the catalog is whatever the shop has PUBLISHED.
 *
 * The old behaviour seeded the demo launch catalog into an empty store on
 * the first customer order. That is gone: an unseeded store answers an
 * honest 503 and NOTHING is validated, placed, or invented. A seeded store
 * is untouched; a database that refuses answers 503, never a fake success.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  serviceConfigured: true,
  snapshotReads: 0,
  snapshot: null as Record<string, unknown> | null,
  snapshotThrows: false,
  validateResult: { ok: true } as Record<string, unknown>,
  validateCalls: 0,
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
    return state.snapshot;
  },
  placeLiveOrder: async () => {
    if (state.placementError) throw state.placementError;
    return state.placedOrder;
  },
}));

vi.mock("@/lib/db/engagement", () => ({
  notifyStaff: async () => undefined,
  // The route prices surcharges from the owner's ops settings (defaults here).
  readOpsSettings: async () => ({}),
}));

vi.mock("@/lib/db/membership", () => ({ isPlusMember: async () => false }));

vi.mock("@/lib/customer-auth", () => ({
  resolveCustomer: async () => null,
  loadSmartCardTarget: async () => ({ target: 10 }),
}));

vi.mock("@/lib/order-validation", () => ({
  validateOrderPayload: () => {
    state.validateCalls += 1;
    return state.validateResult;
  },
}));

import { POST } from "@/app/api/orders/route";

const stockedSnapshot = () => ({
  products: [{ id: "u-1", slug: "real-panjabi", name: "Real Panjabi" }],
  zones: [],
  coupons: [],
  variants: [],
  mediaByProduct: new Map(),
  shops: [],
  totalOrders: 0,
});

const payload = () => ({
  name: "রহিম",
  phone: "01712345678",
  district: "সুনামগঞ্জ",
  upazila: "সুনামগঞ্জ সদর",
  para: "বড়পাড়া",
  address: "বড়পাড়া ১২",
  zoneId: "z1",
  items: [{ productId: "u-1", variantLabel: "Forest Green · L", qty: 1 }],
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
  state.snapshot = stockedSnapshot();
  state.snapshotThrows = false;
  state.validateResult = { ok: true, draft: { customer: { name: "রহিম", phone: "01712345678" } } };
  state.validateCalls = 0;
  state.placementError = null;
  state.placedOrder = {
    id: "PS-1001",
    total: 149000,
    deliveryCharge: 0,
    customer: { phone: "01712345678" },
  };
});

describe("POST /api/orders — empty catalog is honest, not seeded", () => {
  it("no published products → 503 with a truthful message; nothing validated", async () => {
    state.snapshot = { products: [], zones: [], coupons: [], variants: [], mediaByProduct: new Map(), shops: [], totalOrders: 0 };
    const res = await post(payload());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/no published products/i);
    expect(state.validateCalls).toBe(0); // no demo rows inserted, no fake success
  });

  it("snapshot read failure → honest 503, never a fake success", async () => {
    state.snapshotThrows = true;
    const res = await post(payload());
    expect(res.status).toBe(503);
    expect(await res.json()).toHaveProperty("error");
  });

  it("stocked store whose payload fails validation → 422 field errors", async () => {
    state.validateResult = {
      ok: false,
      errors: [{ field: "items", message: "That product is not available." }],
    };
    const res = await post(payload());
    expect(res.status).toBe(422);
  });

  it("placement blowing up (RPC/schema gap) → 503", async () => {
    state.placementError = new Error("function ps_place_order does not exist");
    const res = await post(payload());
    expect(res.status).toBe(503);
  });
});

describe("POST /api/orders — seeded store places real orders", () => {
  it("live products present → order placed from the RPC", async () => {
    const res = await post(payload());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order.id).toBe("PS-1001");
    expect(body.demoMode).toBeUndefined();
  });

  it("OrderPlacementError keeps its status/field", async () => {
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
  });
});
