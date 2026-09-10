/**
 * Delivery pricing rules — one source of truth (§20–21, §69).
 * Sunamganj Sadar real — now with dynamic ETA, night/rain surcharge,
 * per-zone free threshold, distance-based extra.
 */

import { bdt, type Bdt } from "./format";
import type { DeliveryZone } from "./catalog";

/**
 * Customer-facing promise (§87). Instant delivery is the headline.
 */
export const DELIVERY_ETA = "45–50 min";
export const INSTANT_DELIVERY_TITLE = "Instant delivery";
export const INSTANT_DELIVERY_NOTE = `Arrives in ${DELIVERY_ETA} inside the service area.`;

/** Orders at or above this subtotal ship free (paisa) — Sunamganj promo: ৳1000 default. */
export const FREE_DELIVERY_THRESHOLD: Bdt = bdt(1000);

/** Per-zone free thresholds — Zone D needs more */
export const FREE_THRESHOLD_BY_ZONE: Record<string, Bdt> = {
  z1: bdt(600),   // Zone A: ৳600 e free — Traffic Point close
  z2: bdt(800),   // Zone B: ৳800
  z3: bdt(1000),  // Zone C: ৳1000
  z4: bdt(1500),  // Zone D: ৳1500 (outside Sadar)
};

export const freeThresholdForZone = (zoneId: string): Bdt =>
  FREE_THRESHOLD_BY_ZONE[zoneId] ?? FREE_DELIVERY_THRESHOLD;

/** First 1000 orders overall FREE delivery (promo counter lives in DB). */
export const FIRST_1000_FREE_PROMO = true;
export const FIRST_1000_FREE_LIMIT = 1000;

/** Surcharges — Sunamganj real */
export const NIGHT_SURCHARGE_PAISA: Bdt = bdt(20); // 9PM-6AM
export const RAIN_SURCHARGE_PAISA: Bdt = bdt(15); // when admin toggles rain
export const EXPRESS_SURCHARGE_PAISA: Bdt = bdt(40); // 30min express
export const WEIGHT_SURCHARGE_PER_KG: Bdt = bdt(10); // +10 per kg beyond 5kg
export const WEIGHT_FREE_KG = 5;
export const TIP_OPTIONS: Bdt[] = [bdt(0), bdt(10), bdt(20), bdt(30), bdt(50)];

export const isNightHour = (hour: number): boolean => hour >= 21 || hour < 6;
export const isRushHour = (hour: number): boolean =>
  (hour >= 12 && hour <= 14) || (hour >= 18 && hour <= 20);

export const qualifiesForFreeDelivery = (subtotal: Bdt, zoneId?: string): boolean => {
  const threshold = zoneId ? freeThresholdForZone(zoneId) : FREE_DELIVERY_THRESHOLD;
  return subtotal >= threshold;
};

/** Charge actually payable for a zone at a given subtotal. */
export const deliveryChargeFor = (zoneCharge: Bdt, subtotal: Bdt, zoneId?: string): Bdt =>
  qualifiesForFreeDelivery(subtotal, zoneId) ? 0 : Math.max(0, zoneCharge);

/** Promotional check: if total orders < 1000, delivery is free regardless. */
export const deliveryChargeWithPromo = (
  zoneCharge: Bdt,
  subtotal: Bdt,
  totalOrders?: number,
  zoneId?: string,
): Bdt => {
  if (
    FIRST_1000_FREE_PROMO &&
    typeof totalOrders === "number" &&
    totalOrders < FIRST_1000_FREE_LIMIT
  ) {
    return 0;
  }
  return deliveryChargeFor(zoneCharge, subtotal, zoneId);
};

export interface DeliverySurcharge {
  night: Bdt;
  rain: Bdt;
  express: Bdt;
  distance: Bdt;
  weight: Bdt;
  tip: Bdt;
  total: Bdt;
}

export interface DeliveryBreakdown {
  baseCharge: Bdt;
  surcharge: DeliverySurcharge;
  freeDelivery: boolean;
  promoFree: boolean;
  couponFree: boolean;
  isPickup: boolean;
  totalCharge: Bdt;
  eta: string;
  etaMinutes: number;
}

/** Distance extra: beyond 4km, +৳10 per km */
export const distanceExtraCharge = (distanceKm?: number): Bdt => {
  if (!distanceKm || distanceKm <= 4) return 0;
  return bdt(Math.ceil((distanceKm - 4) * 10));
};

export const weightExtraCharge = (weightKg?: number): Bdt => {
  if (!weightKg || weightKg <= WEIGHT_FREE_KG) return 0;
  return bdt(Math.ceil((weightKg - WEIGHT_FREE_KG) * 10));
};

/** Dynamic ETA based on zone + shop prep + queue + time of day */
export const dynamicEta = (opts: {
  zoneId: string;
  shopPrepMinutes?: number;
  queueCount?: number;
  hour?: number;
  distanceKm?: number;
}): { label: string; minutes: number } => {
  const { zoneId, shopPrepMinutes = 15, queueCount = 0, hour, distanceKm } = opts;
  const nowHour = hour ?? new Date().getHours();
  let base: number;
  switch (zoneId) {
    case "z1": base = 35; break;
    case "z2": base = 45; break;
    case "z3": base = 55; break;
    default: base = 70; break;
  }
  let extra = 0;
  if (isNightHour(nowHour)) extra += 10;
  else if (isRushHour(nowHour)) extra += 8;
  extra += queueCount * 4;
  if (distanceKm && distanceKm > 4) extra += Math.ceil((distanceKm - 4) * 3);

  const total = base + shopPrepMinutes + extra;
  return {
    minutes: total,
    label: `${total - 5}–${total + 5} min`,
  };
};

export const deliveryBreakdown = (opts: {
  zone: DeliveryZone;
  subtotal: Bdt;
  totalOrders?: number;
  distanceKm?: number;
  weightKg?: number;
  isNight?: boolean;
  isRain?: boolean;
  isExpress?: boolean;
  isPickup?: boolean;
  tipAmount?: Bdt;
  couponFree?: boolean;
  shopPrepMinutes?: number;
  queueCount?: number;
}): DeliveryBreakdown => {
  const {
    zone,
    subtotal,
    totalOrders,
    distanceKm,
    weightKg,
    isNight,
    isRain,
    isExpress,
    isPickup,
    tipAmount,
    couponFree,
    shopPrepMinutes,
    queueCount,
  } = opts;

  const nowHour = new Date().getHours();
  const night = isNight ?? isNightHour(nowHour);
  const baseCharge = zone.charge;

  if (isPickup) {
    const eta = dynamicEta({ zoneId: zone.id, shopPrepMinutes, queueCount, hour: nowHour, distanceKm: 0 });
    return {
      baseCharge: 0,
      surcharge: { night: 0, rain: 0, express: 0, distance: 0, weight: 0, tip: tipAmount ?? 0, total: 0 },
      freeDelivery: true,
      promoFree: false,
      couponFree: false,
      isPickup: true,
      totalCharge: 0,
      eta: "Ready in " + (shopPrepMinutes ?? 15) + " min — Pickup at Traffic Point",
      etaMinutes: shopPrepMinutes ?? 15,
    };
  }

  let freeDelivery = qualifiesForFreeDelivery(subtotal, zone.id);
  let promoFree = false;

  if (FIRST_1000_FREE_PROMO && typeof totalOrders === "number" && totalOrders < FIRST_1000_FREE_LIMIT) {
    freeDelivery = true;
    promoFree = true;
  }
  if (couponFree) freeDelivery = true;

  let totalCharge: Bdt;
  if (freeDelivery) {
    totalCharge = 0;
  } else {
    totalCharge = baseCharge;
    totalCharge += distanceExtraCharge(distanceKm);
    totalCharge += weightExtraCharge(weightKg);
    if (night) totalCharge += NIGHT_SURCHARGE_PAISA;
    if (isRain) totalCharge += RAIN_SURCHARGE_PAISA;
    if (isExpress) totalCharge += EXPRESS_SURCHARGE_PAISA;
  }

  const eta = dynamicEta({
    zoneId: zone.id,
    shopPrepMinutes,
    queueCount,
    hour: nowHour,
    distanceKm,
  });

  const surcharge = {
    night: night && !freeDelivery ? NIGHT_SURCHARGE_PAISA : 0,
    rain: isRain && !freeDelivery ? RAIN_SURCHARGE_PAISA : 0,
    express: isExpress && !freeDelivery ? EXPRESS_SURCHARGE_PAISA : 0,
    distance: !freeDelivery ? distanceExtraCharge(distanceKm) : 0,
    weight: !freeDelivery ? weightExtraCharge(weightKg) : 0,
    tip: tipAmount ?? 0,
    total: 0,
  };
  surcharge.total = surcharge.night + surcharge.rain + surcharge.express + surcharge.distance + surcharge.weight;

  return {
    baseCharge,
    surcharge,
    freeDelivery,
    promoFree: promoFree && !couponFree,
    couponFree: !!couponFree,
    isPickup: false,
    totalCharge,
    eta: eta.label,
    etaMinutes: eta.minutes,
  };
};

/** Cheapest active zone — what the cart can honestly quote before an address is known */
export const cheapestZoneCharge = (zones: DeliveryZone[]): Bdt => {
  const active = zones.filter((z) => z.active !== false);
  if (active.length === 0) return 0;
  return active.reduce((min, z) => Math.min(min, z.charge), active[0].charge);
};

/** Amount still needed to unlock free delivery (0 when already unlocked). */
export const amountToFreeDelivery = (subtotal: Bdt, zoneId?: string): Bdt => {
  const threshold = zoneId ? freeThresholdForZone(zoneId) : FREE_DELIVERY_THRESHOLD;
  return Math.max(0, threshold - subtotal);
};

/** Final payable total, never negative. */
export const orderTotal = (
  subtotal: Bdt,
  deliveryCharge: Bdt,
  discount: Bdt = 0,
): Bdt => Math.max(0, subtotal - discount + deliveryCharge);
