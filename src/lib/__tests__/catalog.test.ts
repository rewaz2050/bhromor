import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  DELIVERY_ZONES,
  FEATURED_PRODUCTS,
  PRODUCTS,
  productsByCategory,
} from "@/lib/catalog";

describe("catalog invariants", () => {
  it("holds a curated, non-empty product list with unique slugs", () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(6);
    const slugs = new Set(PRODUCTS.map((p) => p.slug));
    expect(slugs.size).toBe(PRODUCTS.length);
  });

  it("prices are integer minor units (no floating point money)", () => {
    for (const product of PRODUCTS) {
      expect(Number.isInteger(product.price)).toBe(true);
      if (product.compareAtPrice) {
        expect(Number.isInteger(product.compareAtPrice)).toBe(true);
        expect(product.compareAtPrice).toBeGreaterThan(product.price);
      }
    }
  });

  it("every product references local media and a valid category", () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const product of PRODUCTS) {
      expect(ids.has(product.category)).toBe(true);
      expect(product.media.length).toBeGreaterThan(0);
      for (const media of product.media) {
        expect(media.src.startsWith("/images/")).toBe(true);
        expect(media.alt.length).toBeGreaterThan(4);
      }
      expect(product.sizes.length).toBeGreaterThan(0);
      expect(product.colors.length).toBeGreaterThan(0);
    }
  });

  it("only ships categories that actually contain products", () => {
    for (const category of CATEGORIES) {
      expect(productsByCategory(category.id).length).toBeGreaterThan(0);
    }
  });

  it("has featured products and delivery zones with integer charges", () => {
    expect(FEATURED_PRODUCTS.length).toBeGreaterThan(0);
    expect(DELIVERY_ZONES.length).toBeGreaterThan(0);
    for (const zone of DELIVERY_ZONES) {
      expect(Number.isInteger(zone.charge)).toBe(true);
      expect(zone.etaLabel).toMatch(/min/i);
    }
  });
});
