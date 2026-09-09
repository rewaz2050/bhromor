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
