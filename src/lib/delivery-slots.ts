/**
 * Delivery time slots — ONE vocabulary for checkout, the receipt, /track,
 * the admin order page and the rider app (UX audit 2026-09-18, P0 #4).
 *
 * Before this the "সন্ধ্যায়" (evening) choice only travelled as
 * `delivery_window = "evening"`; every staff surface printed the slot only
 * when `scheduled_at` was set, so an evening order looked like a normal
 * "deliver now" job. Now the evening pick also carries a concrete
 * `scheduled_at` (today 18:00 Asia/Dhaka) and every surface prints the same
 * human label through `deliverySlotSummary()`.
 *
 * Bangladesh is UTC+6 all year (no DST) — a fixed offset is correct.
 */

import type { Language } from "./translations";

export const DHAKA_OFFSET_MS = 6 * 3600 * 1000;
/** "সন্ধ্যায়" = 6–9 PM Dhaka. */
export const EVENING_START_HOUR = 18;
export const EVENING_END_HOUR = 21;

export type DeliverySlotKey =
  | "now"
  | "evening"
  | "9-11"
  | "11-1"
  | "2-4"
  | "4-6"
  | "6-8"
  | "8-10"
  | "express";

export const DELIVERY_SLOT_LABELS: Record<
  DeliverySlotKey,
  { en: string; bn: string }
> = {
  now: { en: "As soon as possible", bn: "এখনই" },
  evening: { en: "Evening (6–9 PM)", bn: "সন্ধ্যায় (৬–৯ PM)" },
  "9-11": { en: "9–11 AM", bn: "সকাল ৯–১১টা" },
  "11-1": { en: "11 AM–1 PM", bn: "সকাল ১১টা–দুপুর ১টা" },
  "2-4": { en: "2–4 PM", bn: "দুপুর ২–৪টা" },
  "4-6": { en: "4–6 PM", bn: "বিকেল ৪–৬টা" },
  "6-8": { en: "6–8 PM", bn: "সন্ধ্যা ৬–৮টা" },
  "8-10": { en: "8–10 PM", bn: "রাত ৮–১০টা" },
  express: { en: "Express (30 min)", bn: "এক্সপ্রেস (৩০ মিনিট)" },
};

/** Start hour (Dhaka) of each scheduled window — the `scheduled_at` stamp. */
export const SLOT_START_HOUR: Record<DeliverySlotKey, number> = {
  now: 0,
  evening: EVENING_START_HOUR,
  "9-11": 9,
  "11-1": 11,
  "2-4": 14,
  "4-6": 16,
  "6-8": 18,
  "8-10": 20,
  express: 9,
};

/** Human label for a stored `delivery_window`; unknown keys echo back as-is. */
export const deliverySlotLabel = (
  key: string | null | undefined,
  lang: Language = "bn",
): string | null => {
  if (!key) return null;
  const hit = (DELIVERY_SLOT_LABELS as Record<string, { en: string; bn: string }>)[key];
  return hit ? hit[lang] : key;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Dhaka wall-clock parts of an instant. */
export const dhakaParts = (ms: number) => {
  const d = new Date(ms + DHAKA_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(), // 0-based
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
};

/** YYYY-MM-DD of the Dhaka calendar day containing `ms`. */
export const dhakaDateString = (ms: number): string => {
  const p = dhakaParts(ms);
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ms of `dateStr` (YYYY-MM-DD) at `hour`:00 Asia/Dhaka — null if unparsable. */
export const dhakaDateAtHourMs = (dateStr: string, hour: number): number | null => {
  const m = DATE_RE.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return Date.UTC(y, mo - 1, d, hour) - DHAKA_OFFSET_MS;
};

/**
 * "সন্ধ্যায়" → an instant the shop and the rider can plan around.
 *   • before 18:00 Dhaka  → today 18:00
 *   • 18:00–21:00         → null (the evening is NOW; the window label still travels)
 *   • 21:00 or later      → tomorrow 18:00
 */
export const eveningScheduleIso = (nowMs: number): string | null => {
  const { hour } = dhakaParts(nowMs);
  if (hour >= EVENING_START_HOUR && hour < EVENING_END_HOUR) return null;
  const dayMs = hour >= EVENING_END_HOUR ? nowMs + 86_400_000 : nowMs;
  const at = dhakaDateAtHourMs(dhakaDateString(dayMs), EVENING_START_HOUR);
  return at === null ? null : new Date(at).toISOString();
};

/** The sub-label under the "সন্ধ্যায়" chip — says WHICH evening honestly. */
export const eveningSlotHint = (nowMs: number, lang: Language = "bn"): string => {
  const { hour } = dhakaParts(nowMs);
  if (hour >= EVENING_START_HOUR && hour < EVENING_END_HOUR) {
    return lang === "bn" ? "এখনই — সন্ধ্যা চলছে" : "Now — it is evening";
  }
  if (hour >= EVENING_END_HOUR) {
    return lang === "bn" ? "আগামীকাল ৬–৯ PM" : "Tomorrow 6–9 PM";
  }
  return lang === "bn" ? "আজ ৬–৯ PM" : "Today 6–9 PM";
};

/** "18 Sep, 6:00 pm" in Asia/Dhaka regardless of the viewer's clock. */
export const formatDhakaDateTime = (ms: number): string =>
  new Date(ms).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

/**
 * One line for every surface: "Evening (6–9 PM) · 18 Sep, 6:00 pm".
 * Returns null for a plain "deliver now" order so lists stay quiet.
 */
export const deliverySlotSummary = (
  order: {
    deliveryWindow?: string | null;
    scheduledAt?: number | null;
    isPickup?: boolean;
    pickupSlot?: string | null;
  },
  lang: Language = "en",
): string | null => {
  if (order.isPickup) {
    const slot = order.pickupSlot && order.pickupSlot !== "now"
      ? deliverySlotLabel(order.pickupSlot, lang)
      : null;
    return slot
      ? `${lang === "bn" ? "পিকআপ" : "Pickup"} · ${slot}`
      : null;
  }
  const window = order.deliveryWindow && order.deliveryWindow !== "now"
    ? deliverySlotLabel(order.deliveryWindow, lang)
    : null;
  const when = order.scheduledAt ? formatDhakaDateTime(order.scheduledAt) : null;
  if (!window && !when) return null;
  return [window, when].filter((part): part is string => !!part).join(" · ");
};
