import { describe, expect, it } from "vitest";
import { getZonesServer } from "@/lib/zone-store";
import { getNotifsServer } from "@/lib/notifications-store";
import { getMedia, getMediaServer } from "@/lib/media-store";
import { getCatalog, saveProductInStore } from "@/lib/catalog-store";
import { getCouponsServer } from "@/lib/coupons-store";
import { getReviewsServer } from "@/lib/reviews-store";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";

/**
 * useSyncExternalStore compares snapshots by identity. A getSnapshot /
 * getServerSnapshot that builds a fresh object every call makes React
 * re-render forever ("The result of getServerSnapshot should be cached").
 * These stores all used to do exactly that.
 */
describe("external store snapshots are stable", () => {
  it("returns the same delivery-zone server snapshot every call", () => {
    expect(getZonesServer()).toBe(getZonesServer());
  });

  it("returns the same notification server snapshot every call", () => {
    const a = getNotifsServer();
    const b = getNotifsServer();
    expect(a).toBe(b);
    // …and therefore stable timestamps (it used to re-seed with Date.now()).
    expect(a[0].at).toBe(b[0].at);
  });

  it("returns the same media snapshot for an unchanged catalog", () => {
    expect(getMediaServer()).toBe(getMediaServer());
    const first = getMedia(PRODUCTS, CATEGORIES);
    const second = getMedia(PRODUCTS, CATEGORIES);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("rebuilds the media snapshot when the catalog actually changes", () => {
    const before = getMedia(PRODUCTS, CATEGORIES);
    const extended = [
      ...PRODUCTS,
      {
        ...PRODUCTS[0],
        id: "test-product",
        media: [{ src: "/images/test-only.jpg", alt: "test" }],
      },
    ];
    const after = getMedia(extended, CATEGORIES);
    expect(after).not.toBe(before);
    expect(after.some((m) => m.url === "/images/test-only.jpg")).toBe(true);
  });

  it("returns the same admin catalog snapshot every call", () => {
    expect(getCatalog()).toBe(getCatalog());
  });

  it("rebuilds the admin catalog snapshot when a product changes", () => {
    const before = getCatalog();
    saveProductInStore({ ...PRODUCTS[0], id: "snap-test-product" });
    const after = getCatalog();
    expect(after).not.toBe(before);
    expect(after.products.some((p) => p.id === "snap-test-product")).toBe(true);
  });

  it("returns the same coupon server snapshot every call", () => {
    expect(getCouponsServer()).toBe(getCouponsServer());
  });

  it("returns the same review server snapshot every call", () => {
    expect(getReviewsServer()).toBe(getReviewsServer());
  });
});
