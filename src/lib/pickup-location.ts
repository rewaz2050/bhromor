/**
 * Pickup location decision — owner-confirmed 2026-10-27.
 *
 * Counter pickups stay at **Traffic Point, Sunamganj Sadar** (the existing
 * fulfilment hub). They are NOT converted to the shop's own address, and the
 * shop's address must never be rendered as the customer's collection point.
 *
 * Why a single constant: the hub already feeds checkout, tracking, staff and
 * vendor copy, and a future "collect from the shop" refactor would silently
 * change where a customer goes to get their parcel. Changing this module is a
 * deliberate business decision, not a copy tweak.
 *
 * The physical handover still requires the customer's 4-digit PIN verified by
 * the server (see 202610260001_order_pin_privacy_and_pickup.sql).
 */
import { SUNAMGANJ_HUB, SUNAMGANJ_UPAZILA } from "./sunamganj";

/** Stable identifier persisted in docs/tests — not a database enum. */
export const PICKUP_LOCATION_KIND = "traffic-point" as const;

/** Customer-facing collection point. */
export const PICKUP_LOCATION_LABEL = SUNAMGANJ_HUB;

/** Bilingual line used where one short sentence is enough. */
export const PICKUP_LOCATION_LINE =
  `Pickup at ${SUNAMGANJ_HUB}, ${SUNAMGANJ_UPAZILA} / ${SUNAMGANJ_HUB}, সুনামগঞ্জ সদর থেকে সংগ্রহ`;

/** True when the configured location still is the approved hub. */
export const pickupLocationIsApprovedHub = (): boolean =>
  PICKUP_LOCATION_LABEL === SUNAMGANJ_HUB && PICKUP_LOCATION_KIND === "traffic-point";
