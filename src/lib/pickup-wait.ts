/**
 * "কে নেবে, আর কবে?" — the parcel that is sitting on the shelf
 * (vendor + rider pass, 2026-10-07).
 *
 * A shop packs an order, taps "Ready — request riders", and then hears
 * nothing: the counter phone shows a count ("Ready for rider: 3") but never
 * says whether anybody is coming, or that the parcel has been sitting there
 * for half an hour. The rider cannot be named before one accepts — the
 * assignment is what moves the order to `courier-assigned` — so the honest
 * answer is the wait itself, escalating as it grows, and the rider's name
 * the moment there is one.
 *
 * Rules:
 *  • only parcels that are still on the shelf count (ready-for-pickup, and
 *    courier-assigned until the rider collects it);
 *  • the clock starts at the FIRST dispatch mark in the timeline — the shop's
 *    own "it is packed" tap, not the order's birth;
 *  • no rider yet is not the same as no problem: 10 minutes is a wait,
 *    25 minutes is somebody's dinner getting cold;
 *  • nothing is invented — no rider, no promise about when one arrives.
 *
 * Pure (unit-tested).
 */

import { bnDigits } from "./arrival";
import type { Order } from "./orders";
import { shopDispatchAt } from "./vendor-dashboard";
import type { Language } from "./translations";

/** The two marks, in ms. */
export const PICKUP_WARN_MS = 10 * 60_000;
export const PICKUP_URGENT_MS = 25 * 60_000;

/** Statuses that mean "packed, still in the shop". */
export const ON_SHELF_STATUSES: readonly Order["status"][] = [
  "ready-for-pickup",
  "courier-assigned",
];

export type ParcelTone = "calm" | "warn" | "urgent";

export interface ParcelWait {
  orderId: string;
  /** The customer's area — the counter recognises an order by where it goes. */
  area: string;
  /** Whole minutes since the shop said "packed". */
  minutes: number;
  /** A rider has accepted and is on the way to the shop. */
  assigned: boolean;
  tone: ParcelTone;
  /** Present only when dispatch has named somebody. */
  rider: { name: string; phone: string } | null;
  /** The one line the counter reads. */
  label: string;
}

const min = (n: number, lang: Language): string =>
  lang === "bn" ? bnDigits(String(n)) : String(n);

const label = (
  rider: { name: string; phone: string } | null,
  minutes: number,
  tone: ParcelTone,
  lang: Language,
): string => {
  const m = min(minutes, lang);
  if (rider) {
    if (tone === "urgent") {
      return lang === "bn"
        ? `${rider.name}কে ${m} মিনিট হলো — এখনো তুলে নেননি, কল করুন`
        : `${rider.name} has not collected it in ${m} min — call them`;
    }
    if (tone === "warn") {
      return lang === "bn"
        ? `${rider.name} নিচ্ছেন — ${m} মিনিট পার হলো, তুলে নেননি`
        : `${rider.name} accepted ${m} min ago, not collected yet`;
    }
    return lang === "bn"
      ? `${rider.name} নিচ্ছেন · ${m} মিনিট আগে পার্সেল তৈরি`
      : `${rider.name} is coming · packed ${m} min ago`;
  }
  if (tone === "urgent") {
    return lang === "bn"
      ? `${m} মিনিট — কেউ নিতে আসেনি`
      : `${m} min and nobody has come`;
  }
  if (tone === "warn") {
    return lang === "bn"
      ? `রাইডার পাওয়া যায়নি — ${m} মিনিট ধরে পার্সেল বসে আছে`
      : `No rider yet — the parcel has waited ${m} min`;
  }
  return lang === "bn"
    ? `রাইডার খোঁজা হচ্ছে · ${m} মিনিট`
    : `Looking for a rider · ${m} min`;
};

/**
 * One parcel's wait, or null when it is not on the shelf (or the shop has
 * not marked it packed — no mark, no clock, no accusation).
 */
export const parcelWait = (
  order: Order,
  now: number = Date.now(),
  lang: Language = "bn",
): ParcelWait | null => {
  if (!ON_SHELF_STATUSES.includes(order.status)) return null;
  const at = shopDispatchAt(order);
  if (at === null) return null;

  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  const rider = order.rider
    ? { name: order.rider.name, phone: order.rider.phone }
    : null;
  const tone: ParcelTone =
    minutes >= PICKUP_URGENT_MS / 60_000
      ? "urgent"
      : minutes >= PICKUP_WARN_MS / 60_000
        ? "warn"
        : "calm";

  return {
    orderId: order.id,
    area: order.customer.area,
    minutes,
    assigned: rider !== null,
    tone,
    rider,
    label: label(rider, minutes, tone, lang),
  };
};

/** Every parcel still on the shelf, the longest wait first. */
export const parcelQueue = (
  orders: readonly Order[],
  now: number = Date.now(),
  lang: Language = "bn",
): ParcelWait[] =>
  orders
    .map((order) => parcelWait(order, now, lang))
    .filter((wait): wait is ParcelWait => wait !== null)
    .sort((a, b) => b.minutes - a.minutes);
