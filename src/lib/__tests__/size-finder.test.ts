import { describe, expect, it, beforeEach } from "vitest";
import { PRODUCTS, type Product } from "../catalog";
import {
  __resetSizeProfile,
  estimateChestCm,
  estimateWaistCm,
  fitForSize,
  sanitizeProfile,
  recommendedSizeFor,
  sizeFamily,
  suggestSize,
  variantLabelFor,
} from "../size-finder";

const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
const gamcha = PRODUCTS.find((p) => p.subCategory === "Gamcha")!;
const tee = PRODUCTS.find((p) => p.subCategory === "T-Shirts")!;

const body = (heightCm: number, weightKg: number, fit = "regular") => ({
  heightCm,
  weightKg,
  fit: fit as "slim" | "regular" | "relaxed",
});

beforeEach(() => {
  __resetSizeProfile();
});

describe("Size profile", () => {
  it("accepts a plausible body and rounds it", () => {
    expect(sanitizeProfile(body(170.4, 70.26))).toEqual({
      heightCm: 170,
      weightKg: 70.3,
      fit: "regular",
    });
  });

  it("rejects impossible bodies instead of guessing", () => {
    expect(sanitizeProfile(body(90, 70))).toBeNull();
    expect(sanitizeProfile(body(230, 70))).toBeNull();
    expect(sanitizeProfile(body(170, 12))).toBeNull();
    expect(sanitizeProfile({ heightCm: "abc", weightKg: 70 })).toBeNull();
    expect(sanitizeProfile(null)).toBeNull();
  });

  it("keeps measured numbers only when they are wearable", () => {
    const withChest = sanitizeProfile({ ...body(170, 70), chestCm: 102, waistCm: 250 });
    expect(withChest).toEqual({ heightCm: 170, weightKg: 70, fit: "regular", chestCm: 102 });
  });

  it("silences an unknown fit word", () => {
    expect(sanitizeProfile(body(170, 70, "baggy"))?.fit).toBe("regular");
  });
});

describe("Body estimate", () => {
  it("anchors the reference body at 100cm chest", () => {
    expect(estimateChestCm(body(170, 70))).toBe(100);
    expect(estimateChestCm(body(170, 80))).toBe(111);
    expect(estimateChestCm(body(180, 70))).toBe(103);
  });

  it("moves with the fit preference", () => {
    const slim = estimateChestCm(body(170, 70, "slim"));
    const relaxed = estimateChestCm(body(170, 70, "relaxed"));
    expect(relaxed - slim).toBe(6);
  });

  it("prefers a real tape measure over the estimate", () => {
    expect(estimateChestCm({ ...body(170, 70), chestCm: 118 })).toBe(118);
    expect(estimateWaistCm({ ...body(170, 70), waistCm: 95 })).toBe(95);
  });
});

describe("Size suggestion", () => {
  it("recommends M for the reference body on a panjabi", () => {
    const out = suggestSize(panjabi, body(170, 70));
    expect(out.recommended).toBe("M");
    expect(out.measured).toBe("chest");
    expect(out.confidence).toBeGreaterThan(70);
    expect(out.scores.find((s) => s.size === "M")?.verdict).toBe("best");
  });

  it("moves a size down for a slim fit and up for relaxed", () => {
    expect(suggestSize(tee, body(170, 70, "slim")).recommended).toBe("S");
    expect(suggestSize(tee, body(170, 70, "regular")).recommended).toBe("M");
    expect(suggestSize(tee, body(170, 80, "relaxed")).recommended).toBe("XL");
  });

  it("measures trousers at the waist, not the chest", () => {
    const trouser: Product = {
      ...panjabi,
      subCategory: "Trouser",
      name: "Slim Cotton Trouser",
      sizes: ["S", "M", "L", "XL"],
    };
    const out = suggestSize(trouser, body(170, 70));
    expect(sizeFamily(trouser)).toBe("waist");
    expect(out.measured).toBe("waist");
    expect(out.recommended).toBe("S");
  });

  it("says one size for a gamcha and asks for nothing", () => {
    const out = suggestSize(gamcha, null);
    expect(out.family).toBe("one-size");
    expect(out.recommended).toBe("One Size");
    expect(out.confidence).toBe(100);
  });

  it("scores only the sizes the product sells", () => {
    const out = suggestSize({ ...panjabi, sizes: ["L", "XXL"] }, body(170, 70));
    expect(out.scores.map((s) => s.size)).toEqual(["L", "XXL"]);
    expect(out.recommended).toBe("L");
  });

  it("handles a shop's own size labels without dropping them", () => {
    const odd: Product = { ...panjabi, sizes: ["32", "34", "One Size"] };
    const out = suggestSize(odd, body(170, 82));
    expect(out.scores).toHaveLength(3);
    expect(out.scores.map((s) => s.size)).toContain("32");
    expect(out.scores.every((s) => Number.isFinite(s.score))).toBe(true);
  });

  it("admits when nothing in the range fits", () => {
    const tiny: Product = { ...panjabi, sizes: ["XS", "S"] };
    const out = suggestSize(tiny, body(170, 118));
    expect(out.recommended).toBeNull();
    expect(out.note).toMatch(/None of this item's sizes/);
  });

  it("tells a tall shopper and a short shopper different things", () => {
    expect(suggestSize(panjabi, body(189, 82)).note).toMatch(/tall/i);
    expect(suggestSize(panjabi, body(158, 58)).note).toMatch(/shorter side/i);
  });

  it("answers the size button badge directly", () => {
    expect(fitForSize(panjabi, body(170, 70), "M")?.verdict).toBe("best");
    // XXL is sold here, it is just wrong for this body — the badge must say so.
    expect(fitForSize(panjabi, body(170, 70), "XXL")?.verdict).toBe("skip");
    // A size the product does not sell has no badge at all.
    expect(fitForSize(panjabi, body(170, 70), "S")).toBeNull();
    expect(fitForSize(panjabi, null, "M")).toBeNull();
  });
});

describe("Variant labels", () => {
  it("writes the exact shape the cart and validator parse", () => {
    expect(variantLabelFor(panjabi, "L")).toBe("Forest Green · L");
    // One-size products keep their single label — no phantom size maths.
    expect(variantLabelFor(gamcha, "L")).toBe("Red & Cream · One Size");
    expect(variantLabelFor({ ...panjabi, colors: [], sizes: [] }, "L")).toBe("Default");
  });

  it("recommends nothing before a body is known", () => {
    expect(recommendedSizeFor(panjabi, null)).toBeNull();
    expect(recommendedSizeFor(panjabi, body(170, 70))).toBe("M");
    // A one-size item always has an answer.
    expect(recommendedSizeFor(gamcha, null)).toBe("One Size");
  });
});
