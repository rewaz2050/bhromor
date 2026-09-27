/**
 * Menubar redesign (2026-09-26): the category menu lists only categories
 * that have pieces, in catalog order, with counts and the garment types
 * inside each — declared order first, then anything else by count — and
 * links the shop browser already understands.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES, PRODUCTS, type Category, type Product } from "@/lib/catalog";
import {
  categoryHref,
  categoryMenuEntries,
  subCategoryHref,
} from "@/lib/category-menu";

const product = (over: Partial<Product>): Product =>
  ({ ...PRODUCTS[0], id: `p-${Math.random()}`, ...over }) as Product;

describe("categoryMenuEntries", () => {
  it("lists every seeded category with its piece count and shop link", () => {
    const entries = categoryMenuEntries(PRODUCTS, CATEGORIES);
    expect(entries.map((e) => e.category.id)).toEqual(
      CATEGORIES.map((c) => c.id),
    );
    for (const entry of entries) {
      expect(entry.count).toBe(
        PRODUCTS.filter((p) => p.category === entry.category.id).length,
      );
      expect(entry.href).toBe(`/shop?category=${entry.category.id}`);
    }
  });

  it("skips categories without discoverable pieces and inactive ones", () => {
    const ghost: Category = {
      id: "ghost",
      name: "Ghost",
      nameBn: "ঘোস্ট",
      tagline: "",
      image: "",
      subCategories: [],
    };
    const off: Category = { ...CATEGORIES[0], id: "off", active: false };
    const draft = product({ category: "ghost", status: "draft" });
    const archived = product({ category: "ghost", active: false });
    const offPiece = product({ category: "off" });
    const entries = categoryMenuEntries(
      [...PRODUCTS, draft, archived, offPiece],
      [...CATEGORIES, ghost, off],
    );
    expect(entries.map((e) => e.category.id)).not.toContain("ghost");
    expect(entries.map((e) => e.category.id)).not.toContain("off");
  });

  it("orders garment types by the shop's declared order, then by count", () => {
    const cat: Category = {
      id: "men",
      name: "Men",
      nameBn: "পুরুষ",
      tagline: "",
      image: "",
      subCategories: ["Panjabi", "Shirts"],
    };
    const rows = [
      product({ category: "men", subCategory: "Shirts" }),
      product({ category: "men", subCategory: "Kurta" }),
      product({ category: "men", subCategory: "Kurta" }),
      product({ category: "men", subCategory: "Panjabi" }),
      product({ category: "men", subCategory: "Belt" }),
    ];
    const [entry] = categoryMenuEntries(rows, [cat]);
    expect(entry.subCategories.map((s) => s.name)).toEqual([
      "Panjabi",
      "Shirts",
      "Kurta",
      "Belt",
    ]);
    expect(entry.subCategories[2].count).toBe(2);
    expect(entry.subCategories[0].href).toBe(
      "/shop?category=men&sub=Panjabi",
    );
  });

  it("caps the garment types per category and never lists blanks", () => {
    const cat: Category = {
      id: "men",
      name: "Men",
      nameBn: "পুরুষ",
      tagline: "",
      image: "",
      subCategories: [],
    };
    const rows = ["A", "B", "C", "  ", "D"].map((sub) =>
      product({ category: "men", subCategory: sub }),
    );
    const [entry] = categoryMenuEntries(rows, [cat], 3);
    expect(entry.count).toBe(5);
    expect(entry.subCategories).toHaveLength(3);
    expect(entry.subCategories.map((s) => s.name)).not.toContain("  ");
  });

  it("builds URL-safe hrefs", () => {
    expect(categoryHref("kids & baby")).toBe("/shop?category=kids%20%26%20baby");
    expect(subCategoryHref("men", "Three-Piece")).toBe(
      "/shop?category=men&sub=Three-Piece",
    );
  });
});
