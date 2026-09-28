/**
 * A6 — the packing slip. The two numbers a packer must not get wrong:
 * what goes in the bag, and how much cash the rider collects.
 */
import { describe, expect, it } from "vitest";
import type { Order } from "../orders";
import { collectOnDelivery, packingSlip, slipLines, slipPackList, slipPieceCount } from "../packing-slip";

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "PS-1001",
    createdAt: Date.parse("2026-09-28T11:00:00+06:00"),
    customer: { name: "Rima Akter", phone: "01712345678", area: "Kandirpar", address: "House 7, Kandirpar" },
    zoneId: "z1",
    zoneName: "Zone A",
    etaLabel: "30 min",
    items: [
      { productId: "p1", slug: "panjabi", name: "Cotton panjabi", sku: "PNJ-1", variant: "M", qty: 2, unitPrice: 120_000, image: "" },
      { productId: "p2", slug: "stole", name: "Silk stole", sku: "STL-2", variant: "Free", qty: 1, unitPrice: 45_000, image: "" },
    ],
    subtotal: 285_000,
    deliveryCharge: 6_000,
    total: 291_000,
    payment: "cod",
    status: "confirmed",
    timeline: [],
    ...over,
  }) as Order;

describe("packingSlip", () => {
  it("lists every piece with its variant and the price that was agreed", () => {
    const slip = packingSlip(order(), "Cash on delivery");
    expect(slip.lines[0].label).toBe("Cotton panjabi — M (PNJ-1)");
    expect(slip.lines[0].amount).toBe(240_000);
    expect(slipPieceCount(slip)).toBe(3);
    expect(slipPackList(slip)).toContain("2× Cotton panjabi");
    expect(slip.customer.address).toBe("House 7, Kandirpar");
    expect(slip.paymentLabel).toBe("Cash on delivery");
  });

  it("falls back to the area when the customer left no street address", () => {
    const slip = packingSlip(
      order({ customer: { name: "Rima", phone: "01712345678", area: "Kandirpar" } }),
      "Cash on delivery",
    );
    expect(slip.customer.address).toBe("Kandirpar");
    expect(slip.customer.note).toBe("");
  });

  it("takes the coupon discount off the total lines, not off the item snapshot", () => {
    const slip = packingSlip(
      order({ coupon: { code: "EID10", discount: 28_500 }, total: 262_500 }),
      "Cash on delivery",
    );
    expect(slip.discount).toBe(28_500);
    expect(slip.subtotal).toBe(285_000);
    expect(slip.lines[0].amount).toBe(240_000);
  });
});

describe("collectOnDelivery", () => {
  it("asks for the full total on a cash order that is still coming", () => {
    expect(collectOnDelivery(order())).toBe(291_000);
  });

  it("asks for nothing once a wallet payment is cleared, the order is delivered, or cancelled", () => {
    expect(collectOnDelivery(order({ payment: "bkash", paymentStatus: "verified" }))).toBe(0);
    expect(collectOnDelivery(order({ status: "delivered" }))).toBe(291_000); // still cash due until recorded
    expect(collectOnDelivery(order({ payment: "cod", status: "cancelled" }))).toBe(0);
  });

  it("flags a return pickup so the packer does not pack anything", () => {
    const slip = packingSlip(order({ isReturn: true }), "Cash on delivery");
    expect(slip.isReturn).toBe(true);
  });
});

describe("slipLines", () => {
  it("multiplies qty by the purchase-time price", () => {
    expect(slipLines(order())[1]).toEqual({ label: "Silk stole — Free (STL-2)", qty: 1, amount: 45_000 });
  });
});
