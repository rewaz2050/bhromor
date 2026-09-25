import { describe, expect, it } from "vitest";
import type { Order } from "../orders";
import { riderOrderView } from "../rider-order";

const order = {
  id: "PS-1", customer: { name: "Customer", phone: "01712345678", area: "Town", address: "House 2", note: "Private note" },
  deliveryCode: "1234", paymentRef: "PRIVATE", lat: 24, lng: 91,
  timeline: [{ note: "Private staff note" }],
  deliveryProofUrl: "https://example.com/proof.jpg",
} as Order;

describe("rider job privacy", () => {
  it.each(["offered", "cancelled", "expired", "delivered"])("redacts personal data for %s", state => {
    const view = riderOrderView(order, state);
    expect(view.customer.phone).toBe("");
    expect(view.customer.address).toBeUndefined();
    expect(view.customer.note).toBeUndefined();
    expect(view.customer.area).toBe("Town");
    expect(view.lat).toBeUndefined();
    expect(view.lng).toBeUndefined();
    expect(view.deliveryCode).toBeUndefined();
    expect(view.paymentRef).toBeUndefined();
    expect(view.timeline).toEqual([]);
  });
  it.each(["accepted", "picked_up"])("reveals contact but never proof code for %s", state => {
    const view = riderOrderView(order, state);
    expect(view.customer.phone).toBe("01712345678");
    expect(view.lat).toBe(24);
    expect(view.deliveryCode).toBeUndefined();
    expect(view.paymentRef).toBeUndefined();
    expect(view.deliveryProofUrl).toBeUndefined();
    expect(order.deliveryCode).toBe("1234");
  });
});
