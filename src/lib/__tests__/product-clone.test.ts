/**
 * A3 — "make another one like this" (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 * The copy has to arrive as a draft with a FREE slug/SKU, because the server
 * refuses a same-shop clash before its own retry loop.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS, type Product } from "../catalog";
import { copyName, duplicateDraft, nextFreeSpelling } from "../product-clone";

const original: Product = {
  ...PRODUCTS[0],
  id: "p1",
  slug: "emerald-three-piece",
  sku: "EM3P",
  name: "Emerald Three-Piece",
  status: "published",
  featured: true,
  isNew: true,
  unitsSold: 42,
  rating: 4.8,
  reviewCount: 9,
  sizes: ["M", "L"],
  sizeStock: { M: 3, L: 0 },
  media: [{ src: "https://cdn/a.jpg", alt: "a" }],
  details: [{ label: "Fabric", value: "Silk" }],
};

describe("copyName", () => {
  it("adds the (copy) suffix once, never twice", () => {
    expect(copyName("Panjabi")).toBe("Panjabi (copy)");
    expect(copyName("Panjabi (copy)")).toBe("Panjabi (copy)");
  });
});

describe("nextFreeSpelling", () => {
  it("walks -2, -3 … past the spellings already taken", () => {
    expect(nextFreeSpelling("panjabi-copy", [])).toBe("panjabi-copy");
    expect(nextFreeSpelling("panjabi-copy", ["panjabi-copy"])).toBe("panjabi-copy-2");
    expect(
      nextFreeSpelling("panjabi-copy", ["panjabi-copy", "panjabi-copy-2", "panjabi-copy-3"]),
    ).toBe("panjabi-copy-4");
  });
});

describe("duplicateDraft", () => {
  it("makes a draft copy that can never clash with the original", () => {
    const copy = duplicateDraft(original, { slugs: [original.slug], skus: [original.sku] }, { id: "new-id" });
    expect(copy.id).toBe("new-id");
    expect(copy.name).toBe("Emerald Three-Piece (copy)");
    expect(copy.slug).toBe("emerald-three-piece-copy");
    expect(copy.sku).toBe("EM3P-C");
    expect(copy.status).toBe("draft");
    // Curation and sales history never travel with a copy.
    expect(copy.featured).toBe(false);
    expect(copy.isNew).toBe(false);
    expect(copy.unitsSold).toBeUndefined();
    expect(copy.rating).toBe(0);
    expect(copy.reviewCount).toBe(0);
    expect(copy.price).toBe(original.price);
    expect(copy.media).toEqual(original.media);
  });

  it("takes the next free slug/SKU when the shop already made a copy", () => {
    const copy = duplicateDraft(
      original,
      { slugs: [original.slug, "emerald-three-piece-copy"], skus: [original.sku, "EM3P-C"] },
      { id: "x" },
    );
    expect(copy.slug).toBe("emerald-three-piece-copy-2");
    expect(copy.sku).toBe("EM3P-C-2");
  });

  it("deep-copies the lists so editing the copy cannot change the original", () => {
    const copy = duplicateDraft(original, { slugs: [], skus: [] }, { id: "x" });
    copy.sizes.push("XL");
    copy.media.push({ src: "https://cdn/b.jpg", alt: "b" });
    if (copy.sizeStock) copy.sizeStock.M = 99;
    if (copy.details) copy.details[0].value = "Cotton";
    expect(original.sizes).toEqual(["M", "L"]);
    expect(original.media).toHaveLength(1);
    expect(original.sizeStock).toEqual({ M: 3, L: 0 });
    expect(original.details[0].value).toBe("Silk");
  });

  it("keeps an archived original's shelf state out of the way — the copy is a draft", () => {
    const archived = { ...original, status: "published" as const, active: false };
    const copy = duplicateDraft(archived, { slugs: [], skus: [] }, { id: "y" });
    expect(copy.status).toBe("draft");
    expect(copy.active).toBe(false);
  });
});
