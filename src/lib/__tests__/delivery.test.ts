import { describe, expect, it } from "vitest";
import {
  FIRST_FREE_DELIVERY_LIMIT,
  FREE_DELIVERY_ZONE_ID,
  cheapestZoneCharge,
  deliveryBreakdown,
  deliveryChargeFor,
  distanceExtraCharge,
  orderTotal,
  promoFreeDelivery,
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

describe("delivery pricing — simple model", () => {
  it("charges the flat zone fee when the promo is over", () => {
    expect(deliveryChargeFor(bdt(30), bdt(500), 10, "z1")).toBe(bdt(30));
    expect(deliveryChargeFor(bdt(50), bdt(5000), 3, "z2")).toBe(bdt(50));
    expect(deliveryChargeFor(bdt(100), bdt(5000), 0, "z4")).toBe(bdt(100));
  });

  it("waives delivery for the FIRST 10 orders — Zone A only", () => {
    expect(deliveryChargeFor(bdt(30), bdt(500), 0, "z1")).toBe(0);
    expect(deliveryChargeFor(bdt(30), bdt(500), FIRST_FREE_DELIVERY_LIMIT - 1, "z1")).toBe(0);
    // 10th order placed → promo over, even in Zone A
    expect(deliveryChargeFor(bdt(30), bdt(500), FIRST_FREE_DELIVERY_LIMIT, "z1")).toBe(bdt(30));
    // Outside Zone A the charge ALWAYS applies
    expect(deliveryChargeFor(bdt(50), bdt(5000), 0, "z2")).toBe(bdt(50));
    expect(deliveryChargeFor(bdt(70), bdt(5000), 0, "z3")).toBe(bdt(70));
    expect(deliveryChargeFor(bdt(100), bdt(5000), 0, "z4")).toBe(bdt(100));
  });

  it("promoFreeDelivery guards both the counter and the zone", () => {
    expect(promoFreeDelivery(0, "z1")).toBe(true);
    expect(promoFreeDelivery(FIRST_FREE_DELIVERY_LIMIT - 1, FREE_DELIVERY_ZONE_ID)).toBe(true);
    expect(promoFreeDelivery(FIRST_FREE_DELIVERY_LIMIT, "z1")).toBe(false);
    expect(promoFreeDelivery(0, "z2")).toBe(false);
    expect(promoFreeDelivery(undefined, "z1")).toBe(false);
    expect(promoFreeDelivery(null, "z1")).toBe(false);
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

  it("breakdown: first-10 promo makes Zone A fully free (surcharges waived)", () => {
    const br = deliveryBreakdown({
      zone: zone("z1", 30),
      subtotal: bdt(500),
      totalOrders: FIRST_FREE_DELIVERY_LIMIT - 1,
      isNight: true,
      isRain: true,
      isExpress: true,
      distanceKm: 6,
      weightKg: 7,
    });
    expect(br.freeDelivery).toBe(true);
    expect(br.promoFree).toBe(true);
    expect(br.totalCharge).toBe(0);
    expect(br.surcharge.total).toBe(0);
  });

  it("breakdown: Zone B never rides the first-10 promo", () => {
    const br = deliveryBreakdown({
      zone: zone("z2", 50),
      subtotal: bdt(5000),
      totalOrders: 0,
      isNight: true,
      isRain: true,
      isExpress: true,
    });
    expect(br.freeDelivery).toBe(false);
    expect(br.surcharge.night).toBe(bdt(20));
    expect(br.surcharge.rain).toBe(bdt(15));
    expect(br.surcharge.express).toBe(bdt(40));
    expect(br.totalCharge).toBe(bdt(50 + 20 + 15 + 40));
  });

  it("breakdown: after the promo ends Zone A pays base + surcharges", () => {
    const br = deliveryBreakdown({
      zone: zone("z1", 30),
      subtotal: bdt(500),
      totalOrders: FIRST_FREE_DELIVERY_LIMIT,
      isNight: true,
    });
    expect(br.promoFree).toBe(false);
    expect(br.totalCharge).toBe(bdt(30 + 20));
  });

  it("breakdown: coupon free-delivery waives everything", () => {
    const br = deliveryBreakdown({
      zone: zone("z3", 70),
      subtotal: bdt(500),
      totalOrders: 50,
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
      totalOrders: 100,
      isPickup: true,
      tipAmount: bdt(20),
    });
    expect(br.isPickup).toBe(true);
    expect(br.totalCharge).toBe(0);
    expect(br.surcharge.tip).toBe(bdt(20));
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
