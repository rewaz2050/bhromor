import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../catalog";
import { bdt } from "../format";
import {
  completeTheLook,
  matchesMood,
  resolveMood,
  under500,
} from "../merchandising";

describe("Editorial merchandising", () => {
  it("validates URL moods without accepting arbitrary strings or arrays", () => {
    expect(resolveMood("festive")).toBe("festive");
    expect(resolveMood("sale")).toBe("");
    expect(resolveMood(["festive"])).toBe("");
    expect(resolveMood(undefined)).toBe("");
  });
  it("maps mood edits to actual product types", () => {
    const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
    expect(matchesMood(panjabi, "festive")).toBe(true);
    expect(matchesMood(panjabi, "everyday")).toBe(false);
    expect(matchesMood(panjabi, "")).toBe(true);
  });
  it("uses a strict ৳500 threshold and excludes unpurchasable listings", () => {
    const product = PRODUCTS[0];
    const cheap = { ...product, price: bdt(499) };
    expect(
      under500([
        cheap,
        { ...product, price: bdt(500) },
        { ...cheap, active: false },
        { ...cheap, status: "draft" },
        { ...cheap, inStock: false },
      ]),
    ).toEqual([cheap]);
  });
  it("pairs lungi and gamcha, not arbitrary featured products", () => {
    const lungi = PRODUCTS.find((p) => p.subCategory === "Lungi")!;
    const gamcha = PRODUCTS.find((p) => p.subCategory === "Gamcha")!;
    expect(completeTheLook(lungi, PRODUCTS)).toEqual([gamcha]);
    expect(completeTheLook(gamcha, PRODUCTS)).toEqual([lungi]);
    expect(
      completeTheLook(
        PRODUCTS.find((p) => p.subCategory === "Panjabi")!,
        PRODUCTS,
      ),
    ).toEqual([]);
    expect(
      completeTheLook(lungi, [
        { ...gamcha, inStock: false },
        { ...gamcha, active: false },
        { ...gamcha, status: "draft" },
      ]),
    ).toEqual([]);
  });
});
