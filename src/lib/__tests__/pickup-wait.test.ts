/**
 * The shelf clock (vendor + rider pass): a packed parcel is a promise, and
 * the counter should be able to see how long it has been kept.
 */
import { describe, expect, it } from "vitest";
import {
  PICKUP_URGENT_MS,
  PICKUP_WARN_MS,
  parcelQueue,
  parcelWait,
} from "../pickup-wait";
import type { Order } from "../orders";

const NOW = Date.parse("2026-10-07T12:00:00Z");

const parcel = (over: Partial<Order> = {}): Order => ({
  id: "PS-20261007-0003",
  createdAt: NOW - 40 * 60_000,
  customer: { name: "সালমা", phone: "01711111111", area: "হাসান নগর" },
  zoneId: "z1",
  zoneName: "Sadar",
  etaLabel: "45–60 min",
  items: [
    {
      productId: "p1",
      slug: "heritage-green-panjabi",
      name: "Panjabi",
      sku: "PS-MN-001",
      variant: "M",
      qty: 1,
      unitPrice: 120000,
      image: "",
    },
  ],
  subtotal: 120000,
  deliveryCharge: 6000,
  total: 126000,
  payment: "cod",
  status: "ready-for-pickup",
  timeline: [
    { status: "pending", at: NOW - 40 * 60_000 },
    { status: "ready-for-pickup", at: NOW - 12 * 60_000 },
  ],
  ...over,
});

describe("parcelWait", () => {
  it("starts the clock at the shop's own 'packed' tap, not at the order", () => {
    const wait = parcelWait(parcel(), NOW)!;
    expect(wait.minutes).toBe(12);
    expect(wait.area).toBe("হাসান নগর");
  });

  it("says a rider is being looked for, without inventing an arrival time", () => {
    const wait = parcelWait(parcel(), NOW)!;
    expect(wait.assigned).toBe(false);
    expect(wait.rider).toBeNull();
    expect(wait.label).toContain("রাইডার পাওয়া যায়নি");
    expect(wait.label).toContain("১২");
    expect(wait.tone).toBe("warn");
  });

  it("stays calm for a parcel that only just went on the shelf", () => {
    const p = parcel({ timeline: [{ status: "ready-for-pickup", at: NOW - 3 * 60_000 }] });
    const wait = parcelWait(p, NOW)!;
    expect(wait.tone).toBe("calm");
    expect(wait.label).toContain("খোঁজা হচ্ছে");
  });

  it("escalates to urgent when nobody has come for a long time", () => {
    const at = NOW - (PICKUP_URGENT_MS + 3 * 60_000);
    const p = parcel({ timeline: [{ status: "ready-for-pickup", at }] });
    const wait = parcelWait(p, NOW)!;
    expect(wait.tone).toBe("urgent");
    expect(wait.label).toContain("কেউ নিতে আসেনি");
  });

  it("names the rider the moment dispatch has one, with a number to call", () => {
    const p = parcel({
      status: "courier-assigned",
      rider: { id: "r1", name: "রফিক", phone: "01712345678", ratingAvg: 4.8, ratingCount: 12 },
    });
    const wait = parcelWait(p, NOW)!;
    expect(wait.assigned).toBe(true);
    expect(wait.rider?.phone).toBe("01712345678");
    expect(wait.label).toContain("রফিক");
  });

  it("says nothing about parcels that are not on the shelf", () => {
    expect(parcelWait(parcel({ status: "delivered" }), NOW)).toBeNull();
    expect(parcelWait(parcel({ status: "preparing" }), NOW)).toBeNull();
    expect(parcelWait(parcel({ status: "out-for-delivery" }), NOW)).toBeNull();
  });

  it("says nothing when the shop never marked it packed — no mark, no clock", () => {
    const p = parcel({ timeline: [{ status: "pending", at: NOW - 90 * 60_000 }] });
    expect(parcelWait(p, NOW)).toBeNull();
  });

  it("never reports a negative wait on a clock that slipped", () => {
    const p = parcel({ timeline: [{ status: "ready-for-pickup", at: NOW + 5 * 60_000 }] });
    expect(parcelWait(p, NOW)!.minutes).toBe(0);
  });

  it("writes English in English", () => {
    expect(parcelWait(parcel(), NOW, "en")!.label).toContain("No rider yet");
  });
});

describe("parcelQueue", () => {
  it("puts the longest wait first — that is the one to chase", () => {
    const queue = parcelQueue(
      [
        parcel({ id: "A", timeline: [{ status: "ready-for-pickup", at: NOW - 4 * 60_000 }] }),
        parcel({ id: "B", timeline: [{ status: "ready-for-pickup", at: NOW - 30 * 60_000 }] }),
        parcel({ id: "C", status: "delivered" }),
      ],
      NOW,
    );
    expect(queue.map((q) => q.orderId)).toEqual(["B", "A"]);
  });

  it("uses the warn mark as the line, not a round number", () => {
    expect(PICKUP_WARN_MS).toBe(600_000);
    expect(PICKUP_URGENT_MS).toBe(1_500_000);
  });
});
