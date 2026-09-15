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
  it("serves NOTHING before the database answers — no demo seeds painted", () => {
    expect(getProductsSnapshot()).toEqual([]);
    expect(getCategoriesSnapshot()).toEqual([]);
    expect(getZonesSnapshot()).toEqual([]);
    expect(getShopsSnapshot()).toEqual([]);
    expect(isCatalogSettled()).toBe(false);
    expect(isZonesSettled()).toBe(false);
    // a stale demo id from an old cart resolves to nothing, quietly
    expect(resolveCatalogProduct("p1")).toBeUndefined();
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
    // Ids resolve ONLY against live rows — even a slug twin no longer
    // bridges a stale demo id into the catalog (that was the auto-seed era).
    expect(resolveCatalogProduct("p1")).toBeUndefined();
    expect(resolveCatalogProduct("p2")).toBeUndefined();
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

  it("stays empty when the backend is unreachable — an honest empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(ensureLiveCatalog()).resolves.toBe(false);
    expect(getProductsSnapshot()).toEqual([]);
    expect(isCatalogSettled()).toBe(true);
    expect(resolveCatalogProduct("p1")).toBeUndefined();
  });

  it("ignores non-live payloads without crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ source: "seeds" }) })),
    );
    await expect(ensureLiveCatalog()).resolves.toBe(false);
    expect(getProductsSnapshot()).toEqual([]);
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
