import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST as validateCoupon } from "../coupons/validate/route";
import { GET as getReviews, POST as postReview } from "../reviews/route";
import { bdt } from "@/lib/format";

const req = (body: unknown): Request =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/coupons/validate (demo fallback, no keys)", () => {
  it("accepts a valid seed code with the honest discount", async () => {
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
    // EID50 is men-only; p4 is a women three-piece... resolve honestly:
    // p1 IS men, so use a non-men seed product instead.
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

describe("reviews routes (demo fallback, no keys)", () => {
  it("GET answers { demoMode: true } so the client uses the local store", async () => {
    const res = await getReviews(
      new Request("http://localhost/api/reviews?product=p1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ demoMode: true });
  });

  it("POST answers { demoMode: true } so the client stores locally", async () => {
    const res = await postReview(
      req({ productId: "p1", author: "Test", rating: 5, body: "Lovely fabric, fits well." }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ demoMode: true });
  });
});

describe("shops routes (marketplace slice 2)", () => {
  it("GET /api/shops answers demo seeds without contact emails", async () => {
    const { GET } = await import("../shops/route");
    const res = await GET(new Request("http://localhost/api/shops"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      source: string;
      shops: { slug: string; contactEmail?: string }[];
    };
    expect(data.source).toBe("demo");
    expect(data.shops).toHaveLength(1);
    expect(data.shops[0].slug).toBe("prosanti-direct");
    expect(data.shops[0].contactEmail).toBeUndefined();
  });

  it("GET /api/shops?zone= filters by served zone", async () => {
    const { GET } = await import("../shops/route");
    const hit = (await (
      await GET(new Request("http://localhost/api/shops?zone=z1"))
    ).json()) as { shops: unknown[] };
    expect(hit.shops).toHaveLength(1);
    const miss = (await (
      await GET(new Request("http://localhost/api/shops?zone=nope"))
    ).json()) as { shops: unknown[] };
    expect(miss.shops).toHaveLength(0);
  });

  it("POST /api/shops/apply validates then answers demoMode", async () => {
    const { POST } = await import("../shops/apply/route");
    const good = req({
      name: "Karim Fabrics",
      phone: "01711111111",
      email: "karim@example.com",
      address: "Shop 5, New Market",
      zoneIds: ["z1"],
    });
    const res = await POST(good);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ demoMode: true });

    const bad = await POST(req({ name: "K", email: "nope" }));
    expect(bad.status).toBe(400);
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
      expect(res.status).toBe(200);
    }
    const limited = await POST(mk());
    expect(limited.status).toBe(429);
  });
});
