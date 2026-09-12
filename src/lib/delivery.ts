/**
 * Delivery pricing rules — simplified flat charge model.
 *
 * Pricing model (owner decisions):
 *   • Flat delivery charge: ৳60 everywhere (no zones).
 *   • Free for store pickup.
 *   • Surcharges: night/rain/express/weight still apply.
 *   • No free delivery promos (launch offer, first-10, threshold all removed).
 *
 * Money is integer paisa throughout (§69).
 */

import { bdt, type Bdt } from "./format";
import type { DeliveryZone } from "./catalog";

export const DELIVERY_ETA = "45–50 min";
export const INSTANT_DELIVERY_TITLE = "Instant delivery";
export const INSTANT_DELIVERY_NOTE = `Arrives in ${DELIVERY_ETA} inside the service area.`;

/** Flat delivery charge — no zones. */
export const FLAT_DELIVERY_CHARGE_PAISA: Bdt = bdt(60); // ৳60

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

export const weightExtraCharge = (weightKg?: number): Bdt => {
  if (!weightKg || weightKg <= WEIGHT_FREE_KG) return 0;
  return bdt(Math.ceil((weightKg - WEIGHT_FREE_KG) * 10));
};

/** Dynamic ETA based on shop prep + queue + time of day */
export const dynamicEta = (opts: {
  shopPrepMinutes?: number;
  queueCount?: number;
  hour?: number;
}): { label: string; minutes: number } => {
  const { shopPrepMinutes = 15, queueCount = 0, hour } = opts;
  const nowHour = hour ?? new Date().getHours();
  const base = 35;
  let extra = 0;
  if (isNightHour(nowHour)) extra += 10;
  else if (isRushHour(nowHour)) extra += 8;
  extra += queueCount * 4;
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
  weight: Bdt;
  tip: Bdt;
  total: Bdt;
}

export interface DeliveryBreakdown {
  baseCharge: Bdt;
  surcharge: DeliverySurcharge;
  freeDelivery: boolean;
  couponFree: boolean;
  isPickup: boolean;
  totalCharge: Bdt;
  eta: string;
  etaMinutes: number;
}

export const deliveryBreakdown = (opts: {
  zone: DeliveryZone;
  subtotal: Bdt;
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

  if (isPickup) {
    return {
      baseCharge: 0,
      surcharge: { night: 0, rain: 0, express: 0, weight: 0, tip: tipAmount ?? 0, total: 0 },
      freeDelivery: true,
      couponFree: false,
      isPickup: true,
      totalCharge: 0,
      eta: "Ready in " + (shopPrepMinutes ?? 15) + " min — Pickup",
      etaMinutes: shopPrepMinutes ?? 15,
    };
  }

  const freeDelivery = !!couponFree;
  const baseCharge = FLAT_DELIVERY_CHARGE_PAISA;

  const surcharge: DeliverySurcharge = {
    night: night && !freeDelivery ? NIGHT_SURCHARGE_PAISA : 0,
    rain: isRain && !freeDelivery ? RAIN_SURCHARGE_PAISA : 0,
    express: isExpress && !freeDelivery ? EXPRESS_SURCHARGE_PAISA : 0,
    weight: !freeDelivery ? weightExtraCharge(weightKg) : 0,
    tip: tipAmount ?? 0,
    total: 0,
  };
  surcharge.total = surcharge.night + surcharge.rain + surcharge.express + surcharge.weight;

  const totalCharge = freeDelivery ? 0 : baseCharge + surcharge.total;

  const eta = dynamicEta({
    shopPrepMinutes,
    queueCount,
    hour: nowHour,
  });

  return {
    baseCharge,
    surcharge,
    freeDelivery,
    couponFree: !!couponFree,
    isPickup: false,
    totalCharge,
    eta: eta.label,
    etaMinutes: eta.minutes,
  };
};

/** Final payable total, never negative. */
export const orderTotal = (
  subtotal: Bdt,
  deliveryCharge: Bdt,
  discount: Bdt = 0,
): Bdt => Math.max(0, subtotal - discount + deliveryCharge);
