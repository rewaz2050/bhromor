import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as vendorMe } from "../vendor/me/route";
import { GET as vendorOrders } from "../vendor/orders/route";
import { POST as vendorAdvance } from "../vendor/orders/[id]/advance/route";
import { POST as vendorPayment } from "../vendor/orders/[id]/payment/route";
import {
  GET as vendorProducts,
  POST as vendorProductCreate,
} from "../vendor/products/route";
import {
  GET as vendorShop,
  PATCH as vendorShopUpdate,
} from "../vendor/shop/route";
import { GET as vendorEarnings } from "../vendor/earnings/route";
import { GET as vendorFunnel } from "../vendor/funnel/route";
import {
  GET as vendorPromos,
  PATCH as vendorPromoToggle,
  POST as vendorPromoCreate,
} from "../vendor/promos/route";
import {
  GET as vendorCategories,
  POST as vendorCategoryCreate,
} from "../vendor/categories/route";
// C1: the shop's staff roster sits behind the same vendor gate.
import {
  GET as vendorStaff,
  POST as vendorStaffCreate,
} from "../vendor/staff/route";
import { DELETE as vendorStaffRevoke } from "../vendor/staff/[id]/route";
import { POST as vendorStaffPassword } from "../vendor/staff/[id]/password/route";
import { POST as linkVendor } from "../admin/shops/[id]/link-vendor/route";

const get = (path: string): Request => new Request(`http://localhost${path}`);
const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("vendor routes without a session (slice 3)", () => {
  it("rejects oversized request bodies before auth/JSON processing", async () => {
    const request = new Request("http://localhost/api/vendor/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(1_100_001) }),
    });
    expect((await vendorProductCreate(request)).status).toBe(413);
  });

  it("401s every read without Supabase keys / session", async () => {
    const ctx = { params: Promise.resolve({ id: "PS-1" }) };
    expect((await vendorMe(get("/api/vendor/me"))).status).toBe(401);
    expect((await vendorOrders(get("/api/vendor/orders"))).status).toBe(401);
    expect((await vendorProducts(get("/api/vendor/products"))).status).toBe(401);
    expect((await vendorShop(get("/api/vendor/shop"))).status).toBe(401);
    expect((await vendorEarnings(get("/api/vendor/earnings"))).status).toBe(401);
    expect((await vendorCategories(get("/api/vendor/categories"))).status).toBe(401);
    expect(
      (await vendorCategoryCreate(post("/api/vendor/categories", { categoryId: "men", name: "Eid Edit" }))).status,
    ).toBe(401);
    // B3: the shop's own promo codes sit behind the same vendor gate.
    expect((await vendorPromos(get("/api/vendor/promos"))).status).toBe(401);
    // B4: a shop's funnel is its own — behind the same vendor gate.
    expect((await vendorFunnel(get("/api/vendor/funnel?days=7"))).status).toBe(401);
    expect((await vendorPromoCreate(post("/api/vendor/promos", { code: "EID10" }))).status).toBe(401);
    expect(
      (
        await vendorPromoToggle(
          new Request("http://localhost/api/vendor/promos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: "c1", active: false }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await vendorAdvance(post("/api/vendor/orders/x/advance", { to: "confirmed" }), ctx)).status,
    ).toBe(401);
    // Batch H: the shop's own payment decision is behind the same vendor gate.
    expect(
      (await vendorPayment(post("/api/vendor/orders/x/payment", { action: "verified" }), ctx)).status,
    ).toBe(401);
    expect(
      (await vendorProductCreate(post("/api/vendor/products", {}))).status,
    ).toBe(401);
    expect((await vendorStaff(get("/api/vendor/staff"))).status).toBe(401);
    expect(
      (await vendorStaffCreate(post("/api/vendor/staff", { name: "Samina", login: "01712345678" })))
        .status,
    ).toBe(401);
    expect(
      (
        await vendorStaffRevoke(
          new Request("http://localhost/api/vendor/staff/staff-1", { method: "DELETE" }),
          ctx,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await vendorStaffPassword(
          new Request("http://localhost/api/vendor/staff/staff-1/password", { method: "POST" }),
          ctx,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await vendorShopUpdate(
          new Request("http://localhost/api/vendor/shop", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_open: true }),
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("401s the staff link-vendor route without a staff session", async () => {
    const res = await linkVendor(post("/api/admin/shops/x/link-vendor", { email: "v@x.com" }), {
      params: Promise.resolve({ id: "shop-1" }),
    });
    expect(res.status).toBe(401);
  });
});
