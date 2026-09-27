/** UX plan §5 (R9) — the automatic best coupon is a signed-in perk. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ customer: null as null | { id: string; name: string; phone: string } }));
vi.mock("@/lib/customer-auth", () => ({
  resolveCustomer: async () => auth.customer,
}));
vi.mock("@/lib/db/orders", async () => {
  const { PRODUCTS, DELIVERY_ZONES } = await import("@/lib/catalog");
  const { launchCoupons } = await import("@/lib/__tests__/coupon-fixtures");
  return {
    loadOrderSnapshot: async () => ({
      products: PRODUCTS,
      zones: DELIVERY_ZONES,
      coupons: launchCoupons(),
      variants: [],
      mediaByProduct: new Map<string, string>(),
      shops: [],
      totalOrders: 0,
    }),
  };
});

import { POST as bestCoupon } from "../coupons/best/route";
import { PRODUCTS } from "@/lib/catalog";
import { __resetRateLimits } from "@/lib/rate-limit";

const req = (body: unknown): Request =>
  new Request("http://localhost/api/coupons/best", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  __resetRateLimits();
  auth.customer = null;
});

describe("POST /api/coupons/best", () => {
  it("answers 401 to a guest — no pricing work, no code leaked", async () => {
    const res = await bestCoupon(req({ items: [{ productId: PRODUCTS[0].id, qty: 1 }], zoneId: "z1" }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBeUndefined();
    expect(body.error).toMatch(/sign in/i);
  });

  it("prices the best redeemable code for a signed-in customer (or says none)", async () => {
    auth.customer = { id: "c1", name: "Rahim", phone: "01712345678" };
    const res = await bestCoupon(req({ items: [{ productId: PRODUCTS[0].id, qty: 2 }], zoneId: "z1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; none?: boolean };
    expect(Boolean(body.code) || body.none === true).toBe(true);
    const empty = await bestCoupon(req({ items: [] }));
    expect(empty.status).toBe(400);
  });
});
