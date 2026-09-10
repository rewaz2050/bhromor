import { describe, expect, it } from "vitest";
import {
  FREE_DELIVERY_THRESHOLD,
  amountToFreeDelivery,
  cheapestZoneCharge,
  deliveryBreakdown,
  deliveryChargeFor,
  distanceExtraCharge,
  orderTotal,
  qualifiesForFreeDelivery,
  weightExtraCharge,
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

  it("distance extra beyond 4km", () => {
    expect(distanceExtraCharge(3)).toBe(0);
    expect(distanceExtraCharge(4)).toBe(0);
    expect(distanceExtraCharge(6)).toBe(bdt(20));
  });

  it("weight extra beyond 5kg", () => {
    expect(weightExtraCharge(4)).toBe(0);
    expect(weightExtraCharge(5)).toBe(0);
    expect(weightExtraCharge(7)).toBe(bdt(20));
  });

  it("breakdown pickup is free", () => {
    const br = deliveryBreakdown({ zone: zone("z1", 40), subtotal: bdt(200), isPickup: true, tipAmount: bdt(20) });
    expect(br.isPickup).toBe(true);
    expect(br.totalCharge).toBe(0);
    expect(br.surcharge.tip).toBe(bdt(20));
  });

  it("breakdown includes surcharges", () => {
    const br = deliveryBreakdown({
      zone: zone("z1", 40),
      subtotal: bdt(200),
      distanceKm: 6,
      weightKg: 7,
      isNight: true,
      isRain: true,
      isExpress: true,
      tipAmount: bdt(10),
    });
    expect(br.surcharge.distance).toBe(bdt(20));
    expect(br.surcharge.weight).toBe(bdt(20));
    expect(br.surcharge.night).toBe(bdt(20));
    expect(br.surcharge.rain).toBe(bdt(15));
    expect(br.surcharge.express).toBe(bdt(40));
    expect(br.totalCharge).toBe(bdt(40 + 20 + 20 + 20 + 15 + 40));
  });
});
