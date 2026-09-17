/**
 * Audit 2026-09-17 P1.1 — the public catalog answers are CDN-cacheable, the
 * per-user answers are not. These tests pin the header contract so a future
 * "small cleanup" cannot silently make /api/products uncacheable again (or,
 * worse, make an order response cacheable).
 */
import { describe, expect, it, vi } from "vitest";

const revalidated: unknown[][] = [];
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => {
    revalidated.push(args);
    if (args[0] === "boom") throw new Error("Invariant: static generation store missing");
  },
}));

import {
  CACHE_TAG_CATALOG,
  CACHE_TAG_ZONES,
  PUBLIC_CACHE_CONTROL,
  PUBLIC_CACHE_SECONDS,
  PUBLIC_STALE_SECONDS,
  publicJson,
  revalidateCatalogCaches,
} from "../public-cache";
import { apiError, apiJson } from "../api-response";

describe("publicJson (CDN-cacheable public reads)", () => {
  it("sends s-maxage + stale-while-revalidate on both Cache-Control and CDN-Cache-Control", async () => {
    const res = publicJson({ ok: true });
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("public");
    expect(cc).toContain(`s-maxage=${PUBLIC_CACHE_SECONDS}`);
    expect(cc).toContain(`stale-while-revalidate=${PUBLIC_STALE_SECONDS}`);
    // the browser itself must still revalidate — admin edits show on reload
    expect(cc).toMatch(/max-age=0/);
    expect(cc).not.toContain("no-store");
    expect(res.headers.get("CDN-Cache-Control")).toBe(PUBLIC_CACHE_CONTROL);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("never varies on cookies (a Vary: Cookie answer is uncacheable at the CDN)", () => {
    const vary = publicJson({ a: 1 }).headers.get("Vary") ?? "";
    expect(vary.toLowerCase()).not.toContain("cookie");
    expect(vary).not.toBe("*");
  });

  it("the private helpers stay no-store — orders/account/admin must never be shared", () => {
    expect(apiJson({ order: 1 }).headers.get("Cache-Control")).toContain("no-store");
    expect(apiError("nope", 503).headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("revalidateCatalogCaches", () => {
  it("defaults to the catalog tag and uses the Next 16 expire-now profile", () => {
    revalidated.length = 0;
    revalidateCatalogCaches();
    expect(revalidated).toEqual([[CACHE_TAG_CATALOG, { expire: 0 }]]);
  });

  it("invalidates every tag it is given", () => {
    revalidated.length = 0;
    revalidateCatalogCaches(CACHE_TAG_ZONES, CACHE_TAG_CATALOG);
    expect(revalidated.map((c) => c[0])).toEqual([CACHE_TAG_ZONES, CACHE_TAG_CATALOG]);
  });

  it("swallows a missing cache store — invalidation is never a correctness dependency", () => {
    expect(() => revalidateCatalogCaches("boom" as never)).not.toThrow();
  });
});
