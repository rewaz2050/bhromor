import { describe, expect, it } from "vitest";
import {
  FREE_DELIVERY_THRESHOLD,
  amountToFreeDelivery,
  cheapestZoneCharge,
  deliveryChargeFor,
  orderTotal,
  qualifiesForFreeDelivery,
} from "@/lib/delivery";
import { bdt } from "@/lib/format";
import type { DeliveryZone } from "@/lib/catalog";

const zone = (id: string, charge: number, active = true): DeliveryZone => ({
  id,
  name: `Zone ${id}`,
  areas: [],
  charge: bdt(charge),
  etaLabel: "40–50 min",
  active,
});

describe("delivery pricing (shared by cart + checkout)", () => {
  it("charges the zone fee below the free-delivery threshold", () => {
    expect(deliveryChargeFor(bdt(70), bdt(500))).toBe(bdt(70));
    expect(qualifiesForFreeDelivery(bdt(999))).toBe(false);
  });

  it("waives delivery at and above the threshold", () => {
    expect(deliveryChargeFor(bdt(70), FREE_DELIVERY_THRESHOLD)).toBe(0);
    expect(deliveryChargeFor(bdt(130), bdt(5000))).toBe(0);
  });

  it("reports how much more unlocks free delivery", () => {
    expect(amountToFreeDelivery(bdt(500))).toBe(bdt(500));
    expect(amountToFreeDelivery(bdt(1500))).toBe(0);
  });

  it("quotes from the cheapest ACTIVE zone", () => {
    const zones = [zone("a", 100), zone("b", 50, false), zone("c", 70)];
    expect(cheapestZoneCharge(zones)).toBe(bdt(70));
    expect(cheapestZoneCharge([])).toBe(0);
  });

  it("never produces a negative total, even with an oversized coupon", () => {
    expect(orderTotal(bdt(1000), bdt(70), bdt(5000))).toBe(0);
    expect(orderTotal(bdt(1000), bdt(70), bdt(200))).toBe(bdt(870));
  });
});
