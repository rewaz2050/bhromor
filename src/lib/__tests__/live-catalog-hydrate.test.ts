import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "../catalog";
import {
  __resetLiveCatalog,
  ensureLiveCatalog,
  ensureLiveZones,
  getCategoriesSnapshot,
  getProductsSnapshot,
  getZonesSnapshot,
  hydrateLiveCatalog,
  isCatalogSettled,
  isZonesSettled,
  resolveCatalogProduct,
  subscribeLiveCatalog,
} from "../live-catalog";

/**
 * Audit 2026-09-17 P2.1 — server-rendered pages seed the client registry
 * so the bag/purchase panel/search resolve products without a second
 * /api/products round trip.
 */

const liveProduct = { ...PRODUCTS[0], id: "uuid-live-1", price: 99900 };

afterEach(() => {
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

describe("hydrateLiveCatalog", () => {
  it("seeds the registry and turns ensureLiveCatalog() into a no-op (no fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const listener = vi.fn();
    subscribeLiveCatalog(listener);

    expect(
      hydrateLiveCatalog({
        products: [liveProduct],
        categories: CATEGORIES,
        shops: [],
      }),
    ).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isCatalogSettled()).toBe(true);
    expect(getProductsSnapshot()).toEqual([liveProduct]);
    expect(getCategoriesSnapshot()).toEqual(CATEGORIES);
    expect(resolveCatalogProduct("uuid-live-1")).toEqual(liveProduct);

    await expect(ensureLiveCatalog()).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("seeds zones too when the page had them, else leaves ensureLiveZones() to fetch", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ source: "live", zones: DELIVERY_ZONES }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    hydrateLiveCatalog({ products: [liveProduct] });
    expect(isZonesSettled()).toBe(false);
    await expect(ensureLiveZones()).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    __resetLiveCatalog();
    fetchSpy.mockClear();
    hydrateLiveCatalog({ products: [liveProduct], zones: DELIVERY_ZONES });
    expect(isZonesSettled()).toBe(true);
    expect(getZonesSnapshot()).toEqual(DELIVERY_ZONES);
    await expect(ensureLiveZones()).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores an empty seed — an empty catalog is not 'live' (same rule as the fetch path)", () => {
    const listener = vi.fn();
    subscribeLiveCatalog(listener);
    expect(hydrateLiveCatalog({ products: [] })).toBe(false);
    expect(isCatalogSettled()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("a later seed (client navigation to another page) replaces the rows and notifies again", () => {
    const listener = vi.fn();
    subscribeLiveCatalog(listener);
    hydrateLiveCatalog({ products: [liveProduct] });
    const newer = { ...liveProduct, price: 89900 };
    hydrateLiveCatalog({ products: [newer] });
    expect(getProductsSnapshot()).toEqual([newer]);
    expect(resolveCatalogProduct("uuid-live-1")?.price).toBe(89900);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
