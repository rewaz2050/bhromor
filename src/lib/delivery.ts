/**
 * Delivery pricing rules — one source of truth (§20–21, §69).
 *
 * The cart used to invent a flat “sample” ৳70 fee and promise free delivery
 * over ৳2,000, while checkout charged the zone fee with no free-delivery
 * rule at all. Customers saw one total in the cart and a different one at
 * checkout. Both surfaces now call these helpers.
 */

import { bdt, type Bdt } from "./format";
import type { DeliveryZone } from "./catalog";

/**
 * Customer-facing promise (§87). Instant delivery is the headline — it is what
 * the brand actually sells; the free-delivery threshold below is a secondary
 * reassurance and is always shown as the smaller line.
 */
export const DELIVERY_ETA = "45–50 min";
export const INSTANT_DELIVERY_TITLE = "Instant delivery";
export const INSTANT_DELIVERY_NOTE = `Arrives in ${DELIVERY_ETA} inside the service area.`;

/** Orders at or above this subtotal ship free (paisa). */
export const FREE_DELIVERY_THRESHOLD: Bdt = bdt(2000);

export const qualifiesForFreeDelivery = (subtotal: Bdt): boolean =>
  subtotal >= FREE_DELIVERY_THRESHOLD;

/** Charge actually payable for a zone at a given subtotal. */
export const deliveryChargeFor = (zoneCharge: Bdt, subtotal: Bdt): Bdt =>
  qualifiesForFreeDelivery(subtotal) ? 0 : Math.max(0, zoneCharge);

/** Cheapest active zone — what the cart can honestly quote before an
 *  address is known ("from ৳X"). */
export const cheapestZoneCharge = (zones: DeliveryZone[]): Bdt => {
  const active = zones.filter((z) => z.active !== false);
  if (active.length === 0) return 0;
  return active.reduce((min, z) => Math.min(min, z.charge), active[0].charge);
};

/** Amount still needed to unlock free delivery (0 when already unlocked). */
export const amountToFreeDelivery = (subtotal: Bdt): Bdt =>
  Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);

/** Final payable total, never negative. */
export const orderTotal = (
  subtotal: Bdt,
  deliveryCharge: Bdt,
  discount: Bdt = 0,
): Bdt => Math.max(0, subtotal - discount + deliveryCharge);
