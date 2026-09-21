/**
 * "Order now → at your door by about 7:40 PM" (arrival cue).
 *
 * The one urgency line the storefront allows itself, and it is derived, not
 * decorative: Dhaka clock + the same ETA maths the checkout quotes
 * (`dynamicEta`: base + prep + night/rush allowance). Never a clock time for
 * the courier zone (P1 #17 — other districts are promised days, not
 * minutes), and at night the line says so and carries the night surcharge.
 */

import {
  DEFAULT_SURCHARGE_RATES,
  dynamicEta,
  isCourierZone,
  isNightHour,
} from "./delivery";
import { dhakaParts } from "./delivery-slots";
import { formatBdt } from "./format";
import type { Language } from "./translations";

export interface ArrivalCue {
  kind: "instant" | "night";
  /** "7:40 PM" / "৭:৪০ PM" — Dhaka clock. */
  timeLabel: string;
  /** Rounded-up minutes from now. */
  minutes: number;
  /** True when the arrival falls on the next Dhaka calendar day. */
  crossesMidnight: boolean;
  night: boolean;
  /** Ready-to-print sentence in the requested language. */
  text: string;
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export const bnDigits = (s: string): string => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

/** Round up to the next 5 minutes so the promise is never optimistic. */
const ceilTo5 = (m: number) => Math.ceil(m / 5) * 5;

export const clockLabel = (ms: number, lang: Language): string => {
  const { hour, minute } = dhakaParts(ms);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, "0");
  const raw = `${h12}:${mm} ${hour < 12 ? "AM" : "PM"}`;
  return lang === "bn" ? bnDigits(raw) : raw;
};

/**
 * Null for the courier zone (no clock promise) — otherwise the cue for
 * an order placed right now.
 */
export const arrivalCue = (
  opts: {
    zoneId?: string | null;
    shopPrepMinutes?: number;
    lang?: Language;
    /** The owner's night rate, when the surface has it (default = launch ৳20). */
    nightSurchargePaisa?: number;
  },
  nowMs: number = Date.now(),
): ArrivalCue | null => {
  if (isCourierZone(opts.zoneId)) return null;
  const lang = opts.lang ?? "en";
  const { hour } = dhakaParts(nowMs);
  const eta = dynamicEta({ shopPrepMinutes: opts.shopPrepMinutes, hour });
  // The label's upper bound, rounded up: "45–55 min" → 55 → 55.
  const minutes = ceilTo5(eta.minutes + 5);
  const arriveMs = nowMs + minutes * 60_000;
  const crossesMidnight = dhakaParts(arriveMs).day !== dhakaParts(nowMs).day;
  const night = isNightHour(hour);
  const nightSurchargePaisa =
    opts.nightSurchargePaisa ?? DEFAULT_SURCHARGE_RATES.night;
  const timeLabel = clockLabel(arriveMs, lang);
  const surcharge = formatBdt(nightSurchargePaisa);
  const text =
    lang === "bn"
      ? night
        ? `এখন অর্ডার করলে আনুমানিক ${timeLabel}-এর মধ্যে পৌঁছাবে · রাতের ডেলিভারি +${surcharge}`
        : `এখন অর্ডার করলে ${crossesMidnight ? "" : "আজ "}আনুমানিক ${timeLabel}-এর মধ্যে আপনার দরজায়`
      : night
        ? `Order now — at your door by about ${timeLabel} · night delivery +${surcharge}`
        : `Order now — at your door by about ${timeLabel}${crossesMidnight ? "" : " today"}`;
  return { kind: night ? "night" : "instant", timeLabel, minutes, crossesMidnight, night, text };
};
