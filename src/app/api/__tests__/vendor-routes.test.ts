import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as vendorMe } from "../vendor/me/route";
import { GET as vendorOrders } from "../vendor/orders/route";
import { POST as vendorAdvance } from "../vendor/orders/[id]/advance/route";
import {
  GET as vendorProducts,
  POST as vendorProductCreate,
} from "../vendor/products/route";
import {
  GET as vendorShop,
  PATCH as vendorShopUpdate,
} from "../vendor/shop/route";
import { GET as vendorEarnings } from "../vendor/earnings/route";
import { GET as vendorCategories } from "../vendor/categories/route";
import { POST as linkVendor } from "../admin/shops/[id]/link-vendor/route";

const get = (path: string): Request => new Request(`http://localhost${path}`);
const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("vendor routes without a session (slice 3)", () => {
  it("401s every read without Supabase keys / session", async () => {
    const ctx = { params: Promise.resolve({ id: "PS-1" }) };
    expect((await vendorMe(get("/api/vendor/me"))).status).toBe(401);
    expect((await vendorOrders(get("/api/vendor/orders"))).status).toBe(401);
    expect((await vendorProducts(get("/api/vendor/products"))).status).toBe(401);
    expect((await vendorShop(get("/api/vendor/shop"))).status).toBe(401);
    expect((await vendorEarnings(get("/api/vendor/earnings"))).status).toBe(401);
    expect((await vendorCategories(get("/api/vendor/categories"))).status).toBe(401);
    expect(
      (await vendorAdvance(post("/api/vendor/orders/x/advance", { to: "confirmed" }), ctx)).status,
    ).toBe(401);
    expect(
      (await vendorProductCreate(post("/api/vendor/products", {}))).status,
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
