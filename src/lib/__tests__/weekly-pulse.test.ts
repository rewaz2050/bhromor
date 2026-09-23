import { describe, expect, it } from "vitest";
import type { Order } from "../orders";
import { weeklyPulse } from "../reports";

const MIN = 60_000;

const order = (over: Partial<Order>): Order =>
  ({
    id: "PS-1",
    createdAt: 1_758_180_000_000,
    customer: { name: "Rahim", phone: "01711111111", area: "Boropara", address: "x" },
    zoneId: "z1",
    zoneName: "Sadar",
    etaLabel: "45-50 min",
    items: [],
    subtotal: 100000,
    deliveryCharge: 6000,
    total: 106000,
    payment: "cod",
    status: "confirmed",
    timeline: [],
    ...over,
  }) as Order;

describe("weeklyPulse — six numbers that run the shop", () => {
  it("counts live orders and booked money, cancelled excluded", () => {
    const pulse = weeklyPulse([
      order({ id: "PS-1" }),
      order({ id: "PS-2", total: 50000 }),
      order({ id: "PS-3", status: "cancelled" }),
    ]);
    const orders = pulse.rows[0]!;
    expect(orders.value).toBe("2");
    expect(orders.note).toContain("৳1,560");
    expect(pulse.rows[1]!.value).toBe("33%");
    expect(pulse.rows[1]!.note).toContain("1 cancelled");
  });

  it("delivery minutes average only over timed deliveries", () => {
    const pulse = weeklyPulse([
      order({ id: "PS-1", status: "delivered", deliveredMinutes: 48 }),
      order({ id: "PS-2", status: "delivered", deliveredMinutes: 62 }),
      order({ id: "PS-3", status: "delivered" }),
    ]);
    const delivered = pulse.rows[2]!;
    expect(delivered.value).toBe("3");
    expect(delivered.note).toBe("avg 55 min to the door");
  });

  it("repeat customers share by phone — one returner of two shoppers is 50%", () => {
    const pulse = weeklyPulse([
      order({ id: "PS-1", customer: { name: "a", phone: "01711111111", area: "", address: "" } as Order["customer"] }),
      order({ id: "PS-2", customer: { name: "a", phone: "+88 01711 111111", area: "", address: "" } as Order["customer"] }),
      order({ id: "PS-3", customer: { name: "b", phone: "01822222222", area: "", address: "" } as Order["customer"] }),
    ]);
    expect(pulse.rows[3]!.value).toBe("50%");
    expect(pulse.rows[3]!.note).toContain("1 came back");
  });

  it("the wallet queue counts pending and medians the verified waits", () => {
    const pulse = weeklyPulse([
      order({ id: "PS-1", payment: "bkash", paymentStatus: "pending_verification" }),
      order({
        id: "PS-2",
        payment: "bkash",
        paymentStatus: "verified",
        paymentVerifiedAt: 1_758_180_000_000 + 12 * MIN,
      }),
      order({
        id: "PS-3",
        payment: "nagad",
        paymentStatus: "verified",
        paymentVerifiedAt: 1_758_180_000_000 + 30 * MIN,
      }),
    ]);
    expect(pulse.rows[4]!.value).toBe("1 pending");
    expect(pulse.rows[4]!.note).toBe("median verify 21 min");
  });

  it("COD collected only counts delivered cash — the bag, not the promise", () => {
    const pulse = weeklyPulse([
      order({ id: "PS-1", status: "delivered" }),
      order({ id: "PS-2", status: "out-for-delivery" }),
      order({ id: "PS-3", status: "delivered", payment: "nagad", paymentStatus: "verified" }),
    ]);
    expect(pulse.rows[5]!.value).toBe("৳1,060");
    expect(pulse.rows[5]!.note).toBe("1 deliveries paid in cash");
  });

  it("an empty window is honest dashes, not zeros", () => {
    const pulse = weeklyPulse([]);
    expect(pulse.hasData).toBe(false);
    expect(pulse.rows[1]!.value).toBe("—");
    expect(pulse.rows[3]!.value).toBe("—");
    expect(pulse.rows[2]!.note).toBe("no timed deliveries yet");
  });
});
