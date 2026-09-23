import { describe, expect, it } from "vitest";
import type { Order } from "../orders";
import {
  applicableWaStatuses,
  statusWaMessage,
  waOrderLink,
  waStatusLink,
} from "../admin-wa";

const order = (over: Partial<Order>): Order =>
  ({
    id: "PS-20260921-0004",
    createdAt: 1_758_180_000_000,
    customer: {
      name: "রহিম",
      phone: "01711 111 111",
      area: "Boropara",
      address: "House 12",
    },
    zoneId: "z1",
    zoneName: "Sadar",
    etaLabel: "৪৫–৫০ মিনিট",
    items: [],
    subtotal: 150000,
    deliveryCharge: 6000,
    total: 156000,
    payment: "cod",
    status: "confirmed",
    timeline: [],
    ...over,
  }) as Order;

describe("admin-wa — one-tap WhatsApp status updates", () => {
  it("offers confirm early, on-the-way with the rider, delivered last", () => {
    expect(applicableWaStatuses(order({}))).toEqual(["confirmed"]);
    expect(
      applicableWaStatuses(order({ status: "ready-for-pickup" })),
    ).toEqual([]);
    expect(
      applicableWaStatuses(
        order({ status: "ready-for-pickup", isPickup: true }),
      ),
    ).toEqual(["readyPickup"]);
    expect(
      applicableWaStatuses(order({ status: "out-for-delivery", rider: undefined })),
    ).toEqual(["onTheWay"]);
    expect(
      applicableWaStatuses(order({ status: "courier-assigned", zoneId: "z4" })),
    ).toEqual(["courier"]);
    expect(applicableWaStatuses(order({ status: "delivered" }))).toEqual([
      "delivered",
    ]);
    expect(applicableWaStatuses(order({ status: "cancelled" }))).toEqual([]);
  });

  it("the confirm message carries id, ETA, payment and the customer's own track link", () => {
    const text = statusWaMessage(order({}), "confirmed");
    expect(text).toContain("রহিম");
    expect(text).toContain("PS-20260921-0004");
    expect(text).toContain("৪৫–৫০ মিনিট");
    expect(text).toContain("দরজায় ৳1,560 (COD)");
    expect(text).toContain(
      "https://prosanti.store/track?id=PS-20260921-0004&phone=01711%20111%20111",
    );
  });

  it("the on-the-way message names the rider and asks for the amount and PIN at the door", () => {
    const text = statusWaMessage(
      order({
        status: "out-for-delivery",
        rider: {
          id: "r1",
          name: "কামাল",
          phone: "01822222222",
          ratingAvg: 4.9,
          ratingCount: 41,
        },
        deliveryCode: "4821",
      }),
      "onTheWay",
    );
    expect(text).toContain("রাইডার কামাল");
    expect(text).toContain("৳1,560 (COD)");
    expect(text).toContain("PIN 4821");
  });

  it("prepaid orders say payment is taken — the rider collects nothing", () => {
    const text = statusWaMessage(
      order({ payment: "bkash", paymentStatus: "verified" }),
      "confirmed",
    );
    expect(text).toContain("পেমেন্ট (bKash) নেওয়া হয়েছে");
    expect(text).not.toContain("দরজায়");
  });

  it("delivered message asks for a one-line review via the track link", () => {
    const text = statusWaMessage(
      order({ status: "delivered" }),
      "delivered",
    );
    expect(text).toContain("ডেলিভারি সম্পন্ন");
    expect(text).toContain("/track?id=PS-20260921-0004");
  });

  it("links exist only for plausible BD mobiles — anything else answers null", () => {
    expect(waStatusLink(order({}), "confirmed")).toMatch(
      /^https:\/\/wa\.me\/8801711111111\?text=/,
    );
    expect(waStatusLink(order({ customer: { name: "x", phone: "12345", area: "", address: "" } } as Order), "confirmed")).toBeNull();
    expect(waOrderLink(order({}))).toMatch(/^https:\/\/wa\.me\/8801711111111/);
    expect(
      waOrderLink(
        order({ customer: { name: "x", phone: "not-a-phone", area: "", address: "" } } as Order),
      ),
    ).toBeNull();
  });
});
