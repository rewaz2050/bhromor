import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "../catalog";
import {
  __resetLiveCatalog,
  ensureLiveCatalog,
  ensureLiveZones,
  getCategoriesSnapshot,
  getProductsSnapshot,
  getShopsSnapshot,
  getZonesSnapshot,
  isCatalogSettled,
  isZonesSettled,
  resolveCatalogProduct,
} from "../live-catalog";

const liveProduct = { ...PRODUCTS[0], id: "uuid-live-1", price: 99900 };

afterEach(() => {
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

describe("live-catalog registry", () => {
  it("serves seeds before any fetch", () => {
    expect(getProductsSnapshot()).toBe(PRODUCTS);
    expect(getCategoriesSnapshot()).toBe(CATEGORIES);
    expect(getZonesSnapshot()).toBeNull();
    expect(isCatalogSettled()).toBe(false);
    expect(isZonesSettled()).toBe(false);
    expect(resolveCatalogProduct("p1")).toBe(PRODUCTS[0]);
    expect(resolveCatalogProduct("nope")).toBeUndefined();
  });

  it("swaps in live rows once /api/products answers live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          source: "live",
          products: [liveProduct],
          categories: CATEGORIES,
        }),
      })),
    );
    await expect(ensureLiveCatalog()).resolves.toBe(true);
    expect(getProductsSnapshot()).toEqual([liveProduct]);
    expect(isCatalogSettled()).toBe(true);
    // Post-cutover, legacy demo ids bridge through slug to the LIVE row
    // (live prices, not stale seed prices) so carts survive seeding.
    expect(resolveCatalogProduct("p1")).toBe(liveProduct);
    expect(resolveCatalogProduct("p2")).toBeUndefined(); // no live row
    expect(resolveCatalogProduct("uuid-live-1")).toEqual(liveProduct);
  });

  it("serves stripped demo shops, then live shops on cutover (slice 4)", async () => {
    const demo = getShopsSnapshot();
    expect(demo.length).toBeGreaterThan(0);
    for (const s of demo) expect(s.contactEmail).toBeUndefined();

    const liveShop = { ...demo[0], id: "uuid-shop-1" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          source: "live",
          products: [liveProduct],
          categories: CATEGORIES,
          shops: [liveShop],
        }),
      })),
    );
    await expect(ensureLiveCatalog()).resolves.toBe(true);
    expect(getShopsSnapshot()).toEqual([liveShop]);
  });

  it("keeps seeds when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(ensureLiveCatalog()).resolves.toBe(false);
    expect(getProductsSnapshot()).toBe(PRODUCTS);
    expect(isCatalogSettled()).toBe(true);
    expect(resolveCatalogProduct("p1")).toBe(PRODUCTS[0]);
  });

  it("ignores non-live payloads without crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ source: "demo" }) })),
    );
    await expect(ensureLiveCatalog()).resolves.toBe(false);
    expect(getProductsSnapshot()).toBe(PRODUCTS);
  });

  it("fetches zones once and falls back to seed zones", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ source: "live", zones: [DELIVERY_ZONES[0]] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensureLiveZones()).resolves.toBe(true);
    await expect(ensureLiveZones()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getZonesSnapshot()).toEqual([DELIVERY_ZONES[0]]);
    expect(isZonesSettled()).toBe(true);
  });
});
