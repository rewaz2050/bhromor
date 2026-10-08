import { describe, expect, it } from "vitest";
import { makePlacedOrder, type Order, type OrderStatus } from "../orders";
import { PROMISE_BUFFER_MINUTES, promisedAt, trackEta } from "../track-eta";
import { dynamicEta } from "../delivery";
import { dhakaParts } from "../delivery-slots";

const NOW = Date.now();

const order = (
  status: OrderStatus,
  minutesAgo: number,
  over: Partial<Order> = {},
): Order => ({
  ...makePlacedOrder({
    id: "PS-1",
    createdAt: NOW - minutesAgo * 60_000,
    customer: { name: "Rahat", phone: "01711111111", area: "Boropara" },
    zone: { id: "z1", name: "Zone A", etaLabel: "45–50 min", charge: 6000 },
    items: [
      {
        product: { id: "p1", slug: "panjabi", sku: "SKU-1", name: "Panjabi", price: 250000 },
        image: "/img.jpg",
        variant: "M",
        qty: 1,
      },
    ],
  }),
  status,
  ...over,
});

/** The promise the checkout would have quoted for an order placed at `ms`. */
const promiseMinutes = (ms: number): number =>
  dynamicEta({ hour: dhakaParts(ms).hour }).minutes + PROMISE_BUFFER_MINUTES;

describe("promisedAt", () => {
  it("promises the same clock the checkout quoted, from the placement hour", () => {
    const o = order("out-for-delivery", 10);
    expect(promisedAt(o)).toBe(o.createdAt + promiseMinutes(o.createdAt) * 60_000);
  });

  it("makes no promise where the storefront never promised a clock", () => {
    // Courier zone: promised in days. Pickup: the customer collects it.
    expect(promisedAt(order("out-for-delivery", 10, { zoneId: "z4" }))).toBeNull();
    expect(promisedAt(order("out-for-delivery", 10, { isPickup: true }))).toBeNull();
  });

  it("stops promising once the parcel has landed — late is not a state", () => {
    expect(promisedAt(order("delivered", 80))).toBeNull();
    expect(promisedAt(order("cancelled", 80))).toBeNull();
  });

  it("moves the promise to the chosen slot for a scheduled order", () => {
    const scheduledAt = NOW + 3 * 60 * 60_000;
    const o = order("confirmed", 5, { scheduledAt });
    expect(promisedAt(o)).toBe(scheduledAt + promiseMinutes(scheduledAt) * 60_000);
  });
});

describe("trackEta", () => {
  it("counts the minutes left while the promise is still alive", () => {
    const eta = trackEta(order("preparing", 5), NOW);
    expect(eta.late).toBe(false);
    expect(eta.minutesLeft).toBeGreaterThan(0);
    expect(eta.lateMinutes).toBe(0);
    expect(eta.expectedAt).not.toBeNull();
  });

  it("names the delay in whole minutes once the window has passed", () => {
    const o = order("out-for-delivery", 10);
    const lateBy = 25 * 60_000;
    const eta = trackEta(o, (o.createdAt + promiseMinutes(o.createdAt) * 60_000) + lateBy);
    expect(eta.late).toBe(true);
    expect(eta.lateMinutes).toBe(25);
    expect(eta.minutesLeft).toBe(0);
  });

  it("never reports a delay where no clock was promised", () => {
    const eta = trackEta(order("out-for-delivery", 300, { zoneId: "z4" }), NOW);
    expect(eta).toMatchObject({ expectedAt: null, late: false, lateMinutes: 0 });
  });
});
