/**
 * Delivery pricing rules — one source of truth (§20–21, §69).
 *
 * Pricing model (owner decisions):
 *   • Four flat zones around the Traffic Point hub in Sunamganj.
 *   • The FIRST 10 ORDERS overall get FREE delivery — but ONLY inside
 *     Sunamganj city Zone A. Everywhere else the zone charge applies.
 *   • No ৳1000 subtotal threshold — the old threshold tables are gone.
 *   • Delivery features kept: dynamic ETA, night/rain/express/distance/
 *     weight surcharges, rider tips and store pickup.
 *
 * Money is integer paisa throughout (§69).
 */

import { bdt, type Bdt } from "./format";
import type { DeliveryZone } from "./catalog";

/**
 * Customer-facing promise (§87). Instant delivery is the headline.
 */
export const DELIVERY_ETA = "45–50 min";
export const INSTANT_DELIVERY_TITLE = "Instant delivery";
export const INSTANT_DELIVERY_NOTE = `Arrives in ${DELIVERY_ETA} inside the service area.`;

/** The first N orders overall ride free (promo counter lives in the DB). */
export const FIRST_FREE_DELIVERY_LIMIT = 10;

/** Free-delivery promo applies ONLY inside Sunamganj city Zone A. */
export const FREE_DELIVERY_ZONE_ID = "z1";

/**
 * True when this order still qualifies for the first-10-free promo.
 * Outside Zone A (or once the counter is exhausted) the zone charge applies.
 */
export const promoFreeDelivery = (
  totalOrders: number | null | undefined,
  zoneId: string | null | undefined,
): boolean =>
  typeof totalOrders === "number" &&
  totalOrders < FIRST_FREE_DELIVERY_LIMIT &&
  zoneId === FREE_DELIVERY_ZONE_ID;

/**
 * Charge actually payable: zone fee, waived only by the first-10 promo
 * (Zone A only). `subtotal` is accepted for call-site compatibility but no
 * longer changes the outcome — there is no subtotal threshold.
 */
export const deliveryChargeFor = (
  zoneCharge: Bdt,
  _subtotal?: Bdt,
  totalOrders?: number,
  zoneId?: string,
): Bdt =>
  promoFreeDelivery(totalOrders, zoneId) ? 0 : Math.max(0, zoneCharge);

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

/** Distance extra: beyond 4km, +৳10 per km (city zones only). */
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

export const deliveryBreakdown = (opts: {
  zone: DeliveryZone;
  subtotal: Bdt;
  /** Total orders ever placed — drives the first-10-free promo. */
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
    subtotal: _subtotal,
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

  const promoFree = promoFreeDelivery(totalOrders, zone.id);
  const freeDelivery = promoFree || !!couponFree;

  let totalCharge: Bdt;
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

  if (freeDelivery) {
    totalCharge = 0;
  } else {
    totalCharge = baseCharge + surcharge.total;
  }

  const eta = dynamicEta({
    zoneId: zone.id,
    shopPrepMinutes,
    queueCount,
    hour: nowHour,
    distanceKm,
  });

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

/** Cheapest active zone — the honest "delivery from ৳X" quote. */
export const cheapestZoneCharge = (zones: DeliveryZone[]): Bdt => {
  const active = zones.filter((z) => z.active !== false);
  if (active.length === 0) return 0;
  return active.reduce((min, z) => Math.min(min, z.charge), active[0].charge);
};

/** Final payable total, never negative. */
export const orderTotal = (
  subtotal: Bdt,
  deliveryCharge: Bdt,
  discount: Bdt = 0,
): Bdt => Math.max(0, subtotal - discount + deliveryCharge);
