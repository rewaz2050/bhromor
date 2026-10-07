/**
 * The 7-day exchange window, said in days the shopper can count
 * (post-purchase pass, 2026-10-06).
 *
 * "Within 7 days" is a policy; "আর ৫ দিন" is information. The panel used to
 * print the closing date and nothing else, so on day six the shopper had to
 * do the arithmetic themselves — or assume they had missed it.
 *
 * Pure — `nowMs` is injected (unit-tested).
 */

import { bnDigits } from "./arrival";
import type { Language } from "./translations";

export const EXCHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface ExchangeCountdown {
  days: number;
  hours: number;
  /** "৫ দিন" / "৫ দিন ৩ ঘণ্টা" / "৩ ঘণ্টা" / "২০ মিনিট" — Bengali digits in bn. */
  label: string;
  /** Under an hour: the window is closing, not merely open. */
  closing: boolean;
  closed: boolean;
}

export const exchangeCountdown = (
  deliveredAt: number | null | undefined,
  nowMs: number,
  lang: Language = "bn",
): ExchangeCountdown | null => {
  if (deliveredAt === null || deliveredAt === undefined || !Number.isFinite(deliveredAt)) {
    return null;
  }
  const left = deliveredAt + EXCHANGE_WINDOW_MS - nowMs;
  if (left <= 0) return { days: 0, hours: 0, label: "", closing: true, closed: true };

  const minutes = Math.floor(left / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;

  let raw: string;
  if (days > 0) {
    raw =
      lang === "bn"
        ? `${days} দিন${restHours > 0 ? ` ${restHours} ঘণ্টা` : ""}`
        : `${days} day${days === 1 ? "" : "s"}${restHours > 0 ? ` ${restHours} h` : ""}`;
  } else if (hours > 0) {
    raw = lang === "bn" ? `${hours} ঘণ্টা` : `${hours} h`;
  } else {
    raw =
      lang === "bn"
        ? `${Math.max(1, minutes)} মিনিট`
        : `${Math.max(1, minutes)} min`;
  }

  return {
    days,
    hours,
    label: lang === "bn" ? bnDigits(raw) : raw,
    closing: left < 24 * 60 * 60 * 1000,
    closed: false,
  };
};
