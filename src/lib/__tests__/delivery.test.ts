import { describe, expect, it } from "vitest";
import {
  FLAT_DELIVERY_CHARGE_PAISA,
  deliveryBreakdown,
  orderTotal,
  weightExtraCharge,
} from "@/lib/delivery";
import { bdt } from "@/lib/format";
import type { DeliveryZone } from "@/lib/catalog";
import { deriveZoneChoice } from "@/lib/sunamganj";

const zone = (id: string, charge: number, active = true): DeliveryZone => ({
  id,
  name: `Zone ${id}`,
  areas: [],
  charge: bdt(charge),
  etaLabel: "40–50 min",
  active,
});

describe("delivery pricing — flat model", () => {
  it("flat delivery charge is ৳60", () => {
    expect(FLAT_DELIVERY_CHARGE_PAISA).toBe(bdt(60));
  });

  it("never produces a negative total, even with an oversized coupon", () => {
    expect(orderTotal(bdt(1000), bdt(60), bdt(5000))).toBe(0);
    expect(orderTotal(bdt(1000), bdt(60), bdt(200))).toBe(bdt(860));
  });

  it("weight extra beyond 5kg", () => {
    expect(weightExtraCharge(4)).toBe(0);
    expect(weightExtraCharge(5)).toBe(0);
    expect(weightExtraCharge(7)).toBe(bdt(20));
  });

  it("breakdown: flat charge applies when no coupon", () => {
    const br = deliveryBreakdown({
      zone: zone("z1", 30),
      subtotal: bdt(500),
      isNight: true,
      isRain: true,
      isExpress: true,
      weightKg: 7,
    });
    expect(br.freeDelivery).toBe(false);
    expect(br.totalCharge).toBe(bdt(60 + 20 + 15 + 40 + 20));
  });

  it("breakdown: coupon free-delivery waives everything", () => {
    const br = deliveryBreakdown({
      zone: zone("z3", 70),
      subtotal: bdt(500),
      isNight: true,
      isRain: true,
      couponFree: true,
    });
    expect(br.freeDelivery).toBe(true);
    expect(br.couponFree).toBe(true);
    expect(br.totalCharge).toBe(0);
  });

  it("breakdown: pickup is free, tip preserved", () => {
    const br = deliveryBreakdown({
      zone: zone("z1", 30),
      subtotal: bdt(200),
      isPickup: true,
      tipAmount: bdt(20),
    });
    expect(br.isPickup).toBe(true);
    expect(br.totalCharge).toBe(0);
    expect(br.surcharge.tip).toBe(bdt(20));
  });

  it("breakdown: night surcharge applies", () => {
    const br = deliveryBreakdown({
      zone: zone("z1", 30),
      subtotal: bdt(500),
      isNight: true,
    });
    expect(br.surcharge.night).toBe(bdt(20));
    expect(br.totalCharge).toBe(bdt(60 + 20));
  });
});

describe("deriveZoneChoice — simple form picks the zone", () => {
  it("Zone A paras inside Sunamganj Sadar", () => {
    expect(deriveZoneChoice("Sunamganj", "Sunamganj Sadar", "Boropara").zoneId).toBe("z1");
    expect(deriveZoneChoice("Sunamganj", "Sunamganj Sadar", "Shologhar").zoneId).toBe("z1");
    expect(deriveZoneChoice("Sunamganj", "Sunamganj Sadar", "Kalibari").zoneId).toBe("z1");
  });

  it("Zone B / C paras inside Sadar", () => {
    expect(deriveZoneChoice("Sunamganj", "Sunamganj Sadar", "Notunpara").zoneId).toBe("z2");
    expect(deriveZoneChoice("Sunamganj", "Sunamganj Sadar", "Wayesspur").zoneId).toBe("z3");
  });

  it("unlisted para inside Sadar falls back to Zone C", () => {
    const derived = deriveZoneChoice("Sunamganj", "Sunamganj Sadar", "Naya Para");
    expect(derived.zoneId).toBe("z3");
    expect(derived.paraListed).toBe(false);
  });

  it("other upazila of Sunamganj → Zone D (outside)", () => {
    expect(deriveZoneChoice("Sunamganj", "Chhatak", "Some Village").zoneId).toBe("z4");
    expect(deriveZoneChoice("Sunamganj", "Tahirpur", "Some Village").zoneId).toBe("z4");
  });

  it("other district entirely → Zone D (courier)", () => {
    expect(deriveZoneChoice("Sylhet", "Sylhet Sadar", "Subid Bazar").zoneId).toBe("z4");
    expect(deriveZoneChoice("Dhaka", "Dhanmondi", "Road 27").zoneId).toBe("z4");
  });
});
