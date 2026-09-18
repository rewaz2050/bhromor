/**
 * Audit L7: the bottom bar used exact-match for its active tab, so nothing
 * was highlighted on /product/…, /shops/… or /shop?category=…. `activeTab`
 * is section-aware: Home stays exact, every other tab owns its sub-routes,
 * and Shop owns the browsing surfaces.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/cart/cart-provider", () => ({ useCart: () => ({ openBag: () => {}, itemCount: 0 }) }));
vi.mock("@/components/i18n/language-provider", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("../mobile-nav", () => ({ default: () => null }));
vi.mock("@/lib/use-customer", () => ({ useCustomer: () => ({ customer: null, checked: true }) }));

import { activeTab } from "../bottom-nav";

describe("bottom nav active tab", () => {
  it("keeps Home exact", () => {
    expect(activeTab("/", "/")).toBe(true);
    expect(activeTab("/shop", "/")).toBe(false);
    expect(activeTab("/product/panjabi", "/")).toBe(false);
  });

  it("lights Shop for the whole browsing surface", () => {
    for (const path of ["/shop", "/shop/anything", "/product/forest-panjabi", "/shops/prosanti", "/style", "/campaign/eid", "/live"]) {
      expect(activeTab(path, "/shop"), path).toBe(true);
    }
    expect(activeTab("/wishlist", "/shop")).toBe(false);
    expect(activeTab("/account", "/shop")).toBe(false);
  });

  it("lights Wishlist only on its own route", () => {
    expect(activeTab("/wishlist", "/wishlist")).toBe(true);
    expect(activeTab("/wishlist/shared", "/wishlist")).toBe(true);
    expect(activeTab("/shop", "/wishlist")).toBe(false);
  });

  it("lights Orders on the tracker, the account and returns (P2 #24)", () => {
    for (const href of ["/track", "/account"]) {
      for (const path of ["/track", "/account", "/returns", "/account/orders"]) {
        expect(activeTab(path, href), `${path} ← ${href}`).toBe(true);
      }
      expect(activeTab("/shop", href)).toBe(false);
      expect(activeTab("/wishlist", href)).toBe(false);
    }
  });

  it("is quiet before the pathname is known", () => {
    expect(activeTab(null, "/")).toBe(false);
    expect(activeTab(null, "/shop")).toBe(false);
  });
});
