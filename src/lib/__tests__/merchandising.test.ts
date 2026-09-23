import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../catalog";
import { bdt } from "../format";
import {
  completeTheLook,
  isOnOffer,
  matchesMood,
  offerPct,
  resolveMood,
  under500,
} from "../merchandising";

describe("Editorial merchandising", () => {
  it("calls a piece 'on offer' only when the list price is really struck through", () => {
    expect(isOnOffer({ price: bdt(1490), compareAtPrice: bdt(1850) })).toBe(true);
    expect(offerPct({ price: bdt(1490), compareAtPrice: bdt(1850) })).toBe(19);
    expect(offerPct({ price: bdt(690), compareAtPrice: bdt(890) })).toBe(22);
    // equal, lower, or absent compare-at → not an offer, 0%
    expect(isOnOffer({ price: bdt(900), compareAtPrice: bdt(900) })).toBe(false);
    expect(isOnOffer({ price: bdt(900), compareAtPrice: bdt(800) })).toBe(false);
    expect(isOnOffer({ price: bdt(900) })).toBe(false);
    expect(offerPct({ price: bdt(900) })).toBe(0);
  });
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
  it("pairs by garment, not by whatever is featured", () => {
    const lungi = PRODUCTS.find((p) => p.subCategory === "Lungi")!;
    const gamcha = PRODUCTS.find((p) => p.subCategory === "Gamcha")!;
    const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
    expect(completeTheLook(lungi, PRODUCTS)).toEqual([gamcha]);
    // A gamcha is a gift for the panjabi shopper as much as a partner to a lungi.
    expect(completeTheLook(gamcha, PRODUCTS)).toEqual([panjabi, lungi]);
    // The Eid Set: a panjabi is completed by the pieces worn with it.
    expect(completeTheLook(panjabi, PRODUCTS)).toEqual([gamcha]);
    expect(
      completeTheLook(lungi, [
        { ...gamcha, inStock: false },
        { ...gamcha, active: false },
        { ...gamcha, status: "draft" },
      ]),
    ).toEqual([]);
  });
});
