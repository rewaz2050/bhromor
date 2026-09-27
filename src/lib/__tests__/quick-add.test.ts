/**
 * Quick add (2026-09-27, Phase 3) — the four-field screen's decisions.
 *
 * The screen exists because a product could die in the nine-section editor;
 * these tests pin the parts that used to be guesswork: the SKU can never be a
 * bare slug (the column is globally unique), a published row always carries a
 * photo, and a draft does not need one.
 */
import { describe, expect, it } from "vitest";
import { parseSizes, quickAddProduct, quickSku, vendorTakeHome } from "../quick-add";

const base = {
  name: "Cotton panjabi — ivory",
  priceTaka: "1200",
  stock: "3",
  sizes: "M, L, XL, M",
  category: "men",
  media: [{ src: "https://res.cloudinary.com/x/panjabi.jpg", alt: "panjabi" }],
  status: "published" as const,
};

describe("parseSizes", () => {
  it("splits, trims, de-duplicates and caps at 16", () => {
    expect(parseSizes(" M , L ,, XL , M ")).toEqual(["M", "L", "XL"]);
    expect(parseSizes(Array.from({ length: 20 }, (_, i) => `S${i}`).join(","))).toHaveLength(16);
    expect(parseSizes("")).toEqual([]);
  });
});

describe("quickSku", () => {
  it("mints a per-save SKU so two shops can sell the same name", () => {
    const a = quickSku("Panjabi", 12345);
    const b = quickSku("Panjabi", 67890);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^QK-PANJABI-\d{5}$/);
  });
});

describe("quickAddProduct", () => {
  it("builds the POST body with a slug, a global-safe SKU and the stock flags", () => {
    const out = quickAddProduct({ ...base, seed: 4242 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.product).toMatchObject({
      name: base.name,
      slug: "cotton-panjabi-ivory",
      sku: "QK-COTTON-PAN-04242",
      category: "men",
      sizes: ["M", "L", "XL"],
      price: 120000,
      stock: 3,
      inStock: true,
      lowStock: true,
      status: "published",
      active: true,
    });
  });

  it("refuses a published row without a photo, but lets the draft through", () => {
    const published = quickAddProduct({ ...base, media: [] });
    expect(published.ok).toBe(false);
    if (!published.ok) expect(published.error).toMatch(/photo/i);

    const draft = quickAddProduct({ ...base, media: [], status: "draft" });
    expect(draft.ok).toBe(true);
    if (draft.ok) expect(draft.product).toMatchObject({ status: "draft", media: [] });
  });

  it("asks for a name, a real price and a category", () => {
    expect(quickAddProduct({ ...base, name: "x" })).toMatchObject({ ok: false });
    expect(quickAddProduct({ ...base, priceTaka: "0" })).toMatchObject({ ok: false });
    expect(quickAddProduct({ ...base, priceTaka: "free" })).toMatchObject({ ok: false });
    expect(quickAddProduct({ ...base, category: "  " })).toMatchObject({ ok: false });
  });

  it("treats zero stock as sold out, not as an error", () => {
    const out = quickAddProduct({ ...base, stock: "0" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.product).toMatchObject({ stock: 0, inStock: false, lowStock: false });
  });
});

describe("vendorTakeHome", () => {
  it("shows what the shop keeps after the platform commission", () => {
    expect(vendorTakeHome(1000, 15)).toBe(85000);
    expect(vendorTakeHome(1000, 0)).toBe(100000);
    expect(vendorTakeHome(1000, 200)).toBe(10000); // clamped at 90%
  });
});
