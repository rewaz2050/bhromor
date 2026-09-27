/** UX plan §2 (R11) — quick chips: the shop's own predicates, honest counts, nothing when thin. */
import { describe, expect, it } from "vitest";
import { PRODUCTS, type Product } from "@/lib/catalog";
import { bdt } from "@/lib/format";
import { isOnOffer, matchesMood } from "@/lib/merchandising";
import { MIN_CHIP_PIECES, quickChips } from "@/lib/quick-chips";

const live = PRODUCTS.filter((p) => p.inStock && p.active !== false && p.status !== "draft");

describe("quickChips", () => {
  it("counts exactly what the /shop filter will show", () => {
    const chips = quickChips(PRODUCTS);
    const byId = new Map(chips.map((c) => [c.id, c]));
    expect(byId.get("today")?.count).toBe(live.length);
    expect(byId.get("today")?.href).toBe("/shop?stock=1");
    const under500 = live.filter((p) => p.price < bdt(500)).length;
    if (under500 >= MIN_CHIP_PIECES) expect(byId.get("under500")?.count).toBe(under500);
    else expect(byId.get("under500")).toBeUndefined();
    const festive = live.filter((p) => matchesMood(p, "festive")).length;
    if (festive >= MIN_CHIP_PIECES) expect(byId.get("festive")?.href).toBe("/shop?mood=festive&stock=1");
    const sale = live.filter((p) => isOnOffer(p)).length;
    if (sale >= MIN_CHIP_PIECES) expect(byId.get("sale")?.count).toBe(sale);
    // editorial order is kept
    const order = ["under500", "festive", "gift", "today", "sale", "new"];
    expect(chips.map((c) => order.indexOf(c.id))).toEqual([...chips.map((c) => order.indexOf(c.id))].sort((a, b) => a - b));
  });

  it("drops thin chips and the whole row when fewer than two remain", () => {
    const one: Product[] = [{ ...live[0]!, price: bdt(300), isNew: false, compareAtPrice: undefined }];
    expect(quickChips(one)).toEqual([]);
    expect(quickChips([])).toEqual([]);
    const soldOut = PRODUCTS.map((p) => ({ ...p, inStock: false }));
    expect(quickChips(soldOut)).toEqual([]);
  });
});
