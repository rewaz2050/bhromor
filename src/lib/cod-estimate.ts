/**
 * "How much cash should I keep at the door?" — answered in the bag, before
 * checkout, from the SAME numbers checkout charges: the zone's delivery
 * charge (৳60 / ৳120 / ৳150), the ৳20 night surcharge (9PM–6AM Dhaka) and
 * the ৳500 minimum outside Sadar. Rain / express / weight / tips are
 * checkout choices and are not guessed here — the copy says "about".
 */

import {
  DELIVERY_CHARGE_MAX_PAISA,
  DELIVERY_CHARGE_MIN_PAISA,
  MIN_ORDER_OUTSIDE_SADAR_PAISA,
  NIGHT_SURCHARGE_PAISA,
  isCourierZone,
  isNightHour,
} from "./delivery";
import { dhakaParts } from "./delivery-slots";
import { SUNAMGANJ_ZONES } from "./sunamganj";
import type { Bdt } from "./format";

export interface CodEstimate {
  /** True when the customer's zone is known, so min === max. */
  exact: boolean;
  min: Bdt;
  max: Bdt;
  delivery: { min: Bdt; max: Bdt };
  night: Bdt;
  courier: boolean;
  /** Courier zone AND the basket is under the ৳500 floor the RPC enforces. */
  belowCourierMinimum: boolean;
}

export const codEstimate = (
  opts: { subtotal: Bdt; zoneId: string | null | undefined },
  nowMs = Date.now(),
): CodEstimate => {
  const zone = opts.zoneId ? (SUNAMGANJ_ZONES.find((z) => z.id === opts.zoneId) ?? null) : null;
  const delivery = zone
    ? { min: zone.charge, max: zone.charge }
    : { min: DELIVERY_CHARGE_MIN_PAISA, max: DELIVERY_CHARGE_MAX_PAISA };
  const night = isNightHour(dhakaParts(nowMs).hour) ? NIGHT_SURCHARGE_PAISA : 0;
  const courier = isCourierZone(opts.zoneId);
  return {
    exact: !!zone,
    min: opts.subtotal + delivery.min + night,
    max: opts.subtotal + delivery.max + night,
    delivery,
    night,
    courier,
    belowCourierMinimum: courier && opts.subtotal < MIN_ORDER_OUTSIDE_SADAR_PAISA,
  };
};
