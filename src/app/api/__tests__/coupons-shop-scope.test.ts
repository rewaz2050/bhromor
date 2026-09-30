/**
 * B3 (2026-09-28) — a shop's own promo code is that shop's marketing, paid out
 * of that shop's share of the order. So it may only discount that shop's cart:
 * letting it work elsewhere would make one shop fund another's sale.
 *
 * The rule lives in the pricing surface (validate + auto-best), closed both
 * ways: the shop's code is refused on somebody else's cart (and the refusal
 * names the shop), and it is still offered on its own shop's cart. Platform
 * coupons keep working everywhere — nothing about them changed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({
  customer: null as null | { id: string; name: string; phone: string },
}));
vi.mock("@/lib/customer-auth", () => ({
  resolveCustomer: async () => auth.customer,
}));

interface FakeProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  shopId?: string;
}

const fake = vi.hoisted(() => ({
  products: [] as FakeProduct[],
  coupons: [] as unknown[],
}));

vi.mock("@/lib/db/orders", () => ({
  loadOrderSnapshot: async () => ({
    products: fake.products,
    zones: [],
    coupons: fake.coupons,
    variants: [],
    mediaByProduct: new Map<string, string>(),
    shops: [],
    totalOrders: 0,
  }),
}));

import { POST as validateCoupon } from "@/app/api/coupons/validate/route";
import { POST as bestCouponRoute } from "@/app/api/coupons/best/route";
import { __resetRateLimits } from "@/lib/rate-limit";
import { bdt } from "@/lib/format";

const product = (over: Partial<FakeProduct> & { id: string }): FakeProduct => ({
  name: over.id,
  category: "cat1",
  price: bdt(500),
  ...over,
});

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const validate = (body: unknown) => validateCoupon(post("/api/coupons/validate", body));
const best = (body: unknown) => bestCouponRoute(post("/api/coupons/best", body));

const shopCode = (over: Record<string, unknown> = {}) => ({
  id: "c-shop",
  code: "SITARA10",
  type: "percent",
  value: 10,
  minOrder: 0,
  used: 0,
  active: true,
  usageLimit: 100,
  shopId: "s1",
  shopName: "Sitara Boutique",
  ...over,
});

const platformCode = () => ({
  id: "c-platform",
  code: "WELCOME100",
  type: "fixed",
  value: bdt(100),
  minOrder: bdt(500),
  used: 0,
  active: true,
  usageLimit: 100,
});

beforeEach(() => {
  __resetRateLimits();
  auth.customer = null;
  fake.products = [
    product({ id: "p1", shopId: "s1", price: bdt(1000) }),
    product({ id: "p2", shopId: "s2", price: bdt(1000) }),
  ];
  fake.coupons = [shopCode(), platformCode()];
});

describe("POST /api/coupons/validate — a shop's code stays in its own shop", () => {
  it("accepts the shop's code on the shop's own cart", async () => {
    const res = await validate({ code: "sitara10", items: [{ productId: "p1", qty: 1 }], zoneId: "z1" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean; code?: string; discount?: number };
    expect(body.valid).toBe(true);
    expect(body.code).toBe("SITARA10");
    expect(body.discount).toBe(bdt(100));
  });

  it("refuses the same code on another shop's cart, naming the shop", async () => {
    const res = await validate({ code: "SITARA10", items: [{ productId: "p2", qty: 1 }], zoneId: "z1" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean; reason?: string; discount?: number };
    expect(body.valid).toBe(false);
    expect(body.discount).toBeUndefined();
    expect(body.reason).toBe("This code is only for Sitara Boutique's products.");
  });

  it("refuses it on a mixed cart too — one shop per order", async () => {
    const res = await validate({
      code: "SITARA10",
      items: [
        { productId: "p1", qty: 1 },
        { productId: "p2", qty: 1 },
      ],
    });
    const body = (await res.json()) as { valid: boolean };
    expect(body.valid).toBe(false);
  });

  it("keeps platform coupons universal", async () => {
    for (const productId of ["p1", "p2"]) {
      const res = await validate({ code: "WELCOME100", items: [{ productId, qty: 2 }], zoneId: "z1" });
      const body = (await res.json()) as { valid: boolean; code?: string };
      expect(body.valid).toBe(true);
      expect(body.code).toBe("WELCOME100");
    }
  });
});

describe("POST /api/coupons/best — the auto-applied code respects the same line", () => {
  it("offers the shop's code only on that shop's cart", async () => {
    auth.customer = { id: "c1", name: "Rahim", phone: "01712345678" };
    // The shop's 10% (৳100) beats the platform's ৳100 fixed on a tie only by
    // order; give the platform a weaker code so the shop's own clearly wins.
    fake.coupons = [shopCode({ value: 20 }), platformCode()];

    const own = (await (await best({ items: [{ productId: "p1", qty: 2 }], zoneId: "z1" })).json()) as {
      code?: string;
    };
    expect(own.code).toBe("SITARA10");

    const other = (await (await best({ items: [{ productId: "p2", qty: 2 }], zoneId: "z1" })).json()) as {
      code?: string;
      none?: boolean;
    };
    expect(other.code).toBe("WELCOME100");

    // With no platform coupon left, another shop's cart simply gets nothing.
    fake.coupons = [shopCode({ value: 20 })];
    const bare = (await (await best({ items: [{ productId: "p2", qty: 2 }], zoneId: "z1" })).json()) as {
      code?: string;
      none?: boolean;
    };
    expect(bare.code).toBeUndefined();
    expect(bare.none).toBe(true);
  });
});
