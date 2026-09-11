import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Coupon validation prices against the live snapshot — serve the launch
// catalog + launch coupons so the route can be tested end-to-end.
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

import { POST as validateCoupon } from "../coupons/validate/route";
import { GET as getReviews, POST as postReview } from "../reviews/route";
import { bdt } from "@/lib/format";
import { __resetRateLimits } from "@/lib/rate-limit";

const req = (body: unknown): Request =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => __resetRateLimits());

describe("POST /api/coupons/validate (live snapshot)", () => {
  it("accepts a valid code with the honest discount", async () => {
    const res = await validateCoupon(
      req({ code: "welcome100", items: [{ productId: "p1", qty: 1 }] }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      valid: boolean;
      code?: string;
      discount?: number;
    };
    expect(data.valid).toBe(true);
    expect(data.code).toBe("WELCOME100");
    expect(data.discount).toBe(bdt(100));
  });

  it("rejects unknown codes with a reason, not a silent drop", async () => {
    const res = await validateCoupon(
      req({ code: "NOPE123", items: [{ productId: "p1", qty: 1 }] }),
    );
    const data = (await res.json()) as { valid: boolean; reason?: string };
    expect(data.valid).toBe(false);
    expect(data.reason).toMatch(/unknown code/i);
  });

  it("rejects category-restricted codes for other categories", async () => {
    const { PRODUCTS } = await import("@/lib/catalog");
    const other = PRODUCTS.find((p) => p.category !== "men")!;
    const res = await validateCoupon(
      req({ code: "EID50", items: [{ productId: other.id, qty: 1 }] }),
    );
    const data = (await res.json()) as { valid: boolean; reason?: string };
    expect(data.valid).toBe(false);
    expect(data.reason).toMatch(/does not apply/i);
  });

  it("400s on missing code or empty cart", async () => {
    expect((await validateCoupon(req({ items: [] }))).status).toBe(400);
    expect(
      (await validateCoupon(req({ code: "WELCOME100", items: [] }))).status,
    ).toBe(400);
  });

  it("422s when the cart references unknown products", async () => {
    const res = await validateCoupon(
      req({ code: "WELCOME100", items: [{ productId: "ghost", qty: 1 }] }),
    );
    expect(res.status).toBe(422);
  });
});

describe("reviews routes (unconfigured backend)", () => {
  it("GET answers an empty list so the client shows an honest empty state", async () => {
    const res = await getReviews(
      new Request("http://localhost/api/reviews?product=p1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reviews: [] });
  });

  it("POST answers 503 — submissions never silently succeed", async () => {
    const res = await postReview(
      req({ productId: "p1", author: "Test", rating: 5, body: "Lovely fabric, fits well." }),
    );
    expect(res.status).toBe(503);
  });
});

describe("GET /api/products without a configured backend", () => {
  it("answers 503 NOT_SEEDED instead of a catalog snapshot", async () => {
    const { GET } = await import("../products/route");
    const res = await GET();
    expect(res.status).toBe(503);
  });
});

describe("shops routes (unconfigured backend)", () => {
  it("GET /api/shops answers 503 — no fake shop list", async () => {
    const { GET } = await import("../shops/route");
    const res = await GET(new Request("http://localhost/api/shops"));
    expect(res.status).toBe(503);
  });

  it("GET /api/shops?zone= answers 503 too", async () => {
    const { GET } = await import("../shops/route");
    const res = await GET(new Request("http://localhost/api/shops?zone=z1"));
    expect(res.status).toBe(503);
  });

  it("POST /api/shops/apply answers 503 when the backend is unconfigured", async () => {
    const { POST } = await import("../shops/apply/route");
    const good = req({
      name: "Karim Fabrics",
      phone: "01711111111",
      email: "karim@example.com",
      address: "Shop 5, New Market",
      zoneIds: ["z1"],
    });
    const res = await POST(good);
    expect(res.status).toBe(503);
  });

  it("POST /api/shops/apply rate-limits at 5/min per IP", async () => {
    const { POST } = await import("../shops/apply/route");
    const body = {
      name: "Rate Test",
      phone: "01711111111",
      email: "rate@example.com",
      zoneIds: ["z1"],
    };
    const mk = () =>
      new Request("http://localhost/api/shops/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.9.9.9",
        },
        body: JSON.stringify(body),
      });
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(mk());
      expect(res.status).toBe(503);
    }
    const limited = await POST(mk());
    expect(limited.status).toBe(429);
  });
});
