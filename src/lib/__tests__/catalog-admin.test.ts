import { describe, expect, it } from "vitest";
import {
  cloneCategory,
  cloneProduct,
  moveCategory,
  nextProductId,
  setCategoryActive,
  setProductActive,
  setProductFlag,
  slugify,
  upsertCategory,
  upsertProduct,
} from "../catalog-store";
import {
  cloneZone,
  moveZone,
  nextZoneId,
  upsertZone,
} from "../zone-store";
import { extractYoutubeId, isValidImageSrc } from "../media";
import { PRODUCTS, CATEGORIES, DELIVERY_ZONES, type Product } from "../catalog";

describe("slugify (§52)", () => {
  it("slugs English names cleanly", () => {
    expect(slugify("Heritage Green Panjabi")).toBe("heritage-green-panjabi");
    expect(slugify("  Ivory  Linen   Shirt  ")).toBe("ivory-linen-shirt");
    expect(slugify("T-Shirt — Premium")).toBe("t-shirt-premium");
  });

  it("keeps Bengali letters", () => {
    expect(slugify("স্লেট প্রিমিয়াম টি-শার্ট")).toContain("স্লেট");
  });

  it("falls back safely", () => {
    expect(slugify("")).toBe("item");
    expect(slugify("!!!")).toBe("item");
  });
});

describe("catalog store pure helpers", () => {
  it("upserts new products and replaces by id without mutating inputs", () => {
    const seed = cloneProduct(PRODUCTS[0]);
    const edited = { ...seed, price: seed.price + 1000 };
    const list = upsertProduct([seed], edited);
    expect(list).toHaveLength(1);
    expect(list[0].price).toBe(seed.price + 1000);
    expect(seed.price).not.toBe(edited.price); // original untouched
    const added = upsertProduct(list, { ...edited, id: "p99", name: "New" });
    expect(added).toHaveLength(2);
    expect(added[1].id).toBe("p99");
  });

  it("generates the next numeric product id", () => {
    const list: Product[] = PRODUCTS.map(cloneProduct);
    expect(nextProductId(list)).toBe(`p${PRODUCTS.length + 1}`);
  });

  it("toggles featured/new and active immutably", () => {
    const list = PRODUCTS.map(cloneProduct);
    const before = list.find((p) => p.id === "p1")!.featured;
    const fl = setProductFlag(list, "p1", "featured", !before);
    expect(fl.find((p) => p.id === "p1")!.featured).toBe(!before);
    expect(list.find((p) => p.id === "p1")!.featured).toBe(before);
    const arc = setProductActive(fl, "p1", false);
    expect(arc.find((p) => p.id === "p1")!.active).toBe(false);
  });

  it("upserts, hides and reorders categories (data-driven §5)", () => {
    const base = CATEGORIES.map(cloneCategory);
    const extra = upsertCategory(base, {
      id: "accessories",
      name: "Accessories",
      nameBn: "আনুষাঙ্গিক",
      tagline: "",
      image: "",
      subCategories: [],
    });
    expect(extra).toHaveLength(base.length + 1);
    const hidden = setCategoryActive(extra, "accessories", false);
    expect(hidden.find((c) => c.id === "accessories")!.active).toBe(false);

    const moved = moveCategory(base, "women", -1);
    expect(moved[0].id).toBe("women");
    expect(moveCategory(base, "men", -1)).toBe(base); // first can't go up
    expect(moveCategory(base, "traditional", 1)).toBe(base); // last can't go down
  });
});

describe("zone store pure helpers (§20–21)", () => {
  it("clones zones independently", () => {
    const z = cloneZone(DELIVERY_ZONES[0]);
    z.areas.push("New Area");
    expect(DELIVERY_ZONES[0].areas).not.toContain("New Area");
  });

  it("upserts by id and generates the next id", () => {
    const z1 = cloneZone(DELIVERY_ZONES[0]);
    const list = upsertZone([z1], { ...z1, charge: 8000 });
    expect(list[0].charge).toBe(8000);
    expect(list).toHaveLength(1);
    expect(nextZoneId(DELIVERY_ZONES.map(cloneZone))).toBe(`z${DELIVERY_ZONES.length + 1}`);
  });

  it("reorders within bounds only", () => {
    const list = DELIVERY_ZONES.map(cloneZone);
    expect(moveZone(list, "z1", 1)[1].id).toBe("z1");
    expect(moveZone(list, "z3", 1)).toBe(list);
    expect(moveZone(list, "z1", -1)).toBe(list);
  });
});

describe("media helpers (§13–15, §50–51)", () => {
  it("accepts http(s) URLs and local paths only", () => {
    expect(isValidImageSrc("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isValidImageSrc("/images/products/panjabi.jpg")).toBe(true);
    expect(isValidImageSrc("ftp://x/y")).toBe(false);
    expect(isValidImageSrc("javascript:alert(1)")).toBe(false);
    expect(isValidImageSrc("not a url")).toBe(false);
  });

  it("extracts YouTube ids from every common form", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://example.com/video")).toBeNull();
    expect(extractYoutubeId("")).toBeNull();
  });
});
