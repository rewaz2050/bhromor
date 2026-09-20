import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RECENTLY_VIEWED_KEY,
  RECENTLY_VIEWED_MAX,
  RECENTLY_VIEWED_TTL_MS,
  __resetRecentlyViewed,
  forgetViews,
  getViewed,
  recentlyViewedProducts,
  recordView,
  sanitizeViewed,
} from "@/lib/recently-viewed";
import { PRODUCTS } from "@/lib/catalog";

beforeEach(() => {
  localStorage.clear();
  __resetRecentlyViewed();
});
afterEach(() => __resetRecentlyViewed());

describe("recently viewed — device-local store", () => {
  it("keeps newest first, dedupes, drops stale and malformed rows, caps the list", () => {
    const now = 1_000_000_000_000;
    const raw = [
      { id: "a", at: now - 10 },
      { id: "b", at: now - 5 },
      { id: "a", at: now - 20 }, // duplicate, older
      { id: "old", at: now - RECENTLY_VIEWED_TTL_MS - 1 }, // stale
      { id: "", at: now }, // malformed
      { id: "c" }, // malformed
      "junk",
      ...Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, at: now - 100 - i })),
    ];
    const out = sanitizeViewed(raw, now);
    expect(out.length).toBe(RECENTLY_VIEWED_MAX);
    expect(out.slice(0, 2).map((e) => e.id)).toEqual(["b", "a"]);
    expect(out.some((e) => e.id === "old")).toBe(false);
    expect(sanitizeViewed(null)).toEqual([]);
  });

  it("records a view at the front and persists it", () => {
    recordView("p1", 100);
    recordView("p2", 200);
    recordView("p1", 300); // re-view moves it back to the front
    expect(getViewed().map((e) => e.id)).toEqual(["p1", "p2"]);
    const stored = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]") as { id: string }[];
    expect(stored.map((e) => e.id)).toEqual(["p1", "p2"]);
    forgetViews();
    expect(getViewed()).toEqual([]);
  });

  it("resolves ids against the serving catalog, excluding the current piece and hidden rows", () => {
    const [a, b, c] = PRODUCTS;
    const entries = [
      { id: c.id, at: 3 },
      { id: "gone", at: 2 },
      { id: b.id, at: 2 },
      { id: a.id, at: 1 },
    ];
    expect(recentlyViewedProducts(entries, PRODUCTS, { exclude: c.id }).map((p) => p.id)).toEqual([
      b.id,
      a.id,
    ]);
    const hiddenB = PRODUCTS.map((p) => (p.id === b.id ? { ...p, status: "draft" as const } : p));
    expect(recentlyViewedProducts(entries, hiddenB, { limit: 1 }).map((p) => p.id)).toEqual([c.id]);
  });
});
