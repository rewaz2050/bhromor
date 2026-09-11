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
  it("serves the launch catalog before any fetch", () => {
    expect(getProductsSnapshot()).toBe(PRODUCTS);
    expect(getCategoriesSnapshot()).toBe(CATEGORIES);
    expect(getZonesSnapshot()).toEqual([]);
    expect(getShopsSnapshot()).toEqual([]);
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
    // Post-cutover, legacy launch ids bridge through slug to the LIVE row
    // (live prices, not stale seed prices) so carts survive seeding.
    expect(resolveCatalogProduct("p1")).toBe(liveProduct);
    expect(resolveCatalogProduct("p2")).toBeUndefined(); // no live row
    expect(resolveCatalogProduct("uuid-live-1")).toEqual(liveProduct);
  });

  it("keeps shops live-only: empty until the backend answers, then swaps in live rows", async () => {
    expect(getShopsSnapshot()).toEqual([]);

    const liveShop = {
      id: "uuid-shop-1",
      slug: "prosanti-direct",
      name: "PROSANTI Direct",
      phone: "01700000000",
      zoneIds: DELIVERY_ZONES.map((z) => z.id),
      prepMinutes: 15,
      commissionPct: 15,
      status: "active" as const,
      isOpen: true,
      ratingAvg: 0,
      ratingCount: 0,
    };
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

  it("keeps the launch catalog when the backend is unreachable", async () => {
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
      vi.fn(async () => ({ ok: true, json: async () => ({ source: "seeds" }) })),
    );
    await expect(ensureLiveCatalog()).resolves.toBe(false);
    expect(getProductsSnapshot()).toBe(PRODUCTS);
  });

  it("fetches zones once", async () => {
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
