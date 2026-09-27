/**
 * UX plan §3 (R11) — "আজ রাত ১১টায় শেষ": the wall-clock end of a flash
 * window next to the countdown. A countdown says how long; the clock says
 * WHEN, which is what a shopper plans around ("after dinner, before 11").
 * Asia/Dhaka throughout — the shop's day, whatever the phone thinks.
 */
import { bnDigits } from "@/lib/arrival";

const DHAKA_OFFSET_MS = 6 * 3600 * 1000;

const dhakaParts = (ms: number) => {
  const d = new Date(ms + DHAKA_OFFSET_MS);
  return {
    day: Math.floor((ms + DHAKA_OFFSET_MS) / 86_400_000),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    date: d.getUTCDate(),
    month: d.getUTCMonth(),
  };
};

const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Bengali part-of-day word for an hour (0–23), the way people say it. */
export const bnDayPart = (hour: number): string => {
  if (hour < 4) return "রাত";
  if (hour < 6) return "ভোর";
  if (hour < 12) return "সকাল";
  if (hour < 15) return "দুপুর";
  if (hour < 18) return "বিকেল";
  if (hour < 20) return "সন্ধ্যা";
  return "রাত";
};

const twelveHour = (hour: number) => hour % 12 || 12;

/** "রাত ১১টায়" / "রাত ১১:৩০টায়" — spoken Bengali clock time. */
export const bnClock = (hour: number, minute: number): string => {
  const h = String(twelveHour(hour));
  const time = minute === 0 ? `${h}টায়` : `${h}:${String(minute).padStart(2, "0")}টায়`;
  return `${bnDayPart(hour)} ${bnDigits(time)}`;
};

/** "11 pm" / "11:30 pm". */
export const enClock = (hour: number, minute: number): string => {
  const suffix = hour >= 12 ? "pm" : "am";
  const h = String(twelveHour(hour));
  return minute === 0 ? `${h} ${suffix}` : `${h}:${String(minute).padStart(2, "0")} ${suffix}`;
};

/**
 * "আজ রাত ১১টায় শেষ" / "Ends today at 11 pm"; "আগামীকাল …" / "tomorrow …";
 * further out, the date ("৩ অক্টোবর সন্ধ্যা ৬টায় শেষ"). Empty once passed.
 */
export const endsAtLabel = (endsAtMs: number, lang: "en" | "bn", now: number = Date.now()): string => {
  if (!Number.isFinite(endsAtMs) || endsAtMs <= now) return "";
  const end = dhakaParts(endsAtMs);
  const today = dhakaParts(now).day;
  const diff = end.day - today;
  if (lang === "bn") {
    const when =
      diff === 0 ? "আজ" : diff === 1 ? "আগামীকাল" : `${bnDigits(String(end.date))} ${BN_MONTHS[end.month]}`;
    return `${when} ${bnClock(end.hour, end.minute)} শেষ`;
  }
  const when =
    diff === 0 ? "today" : diff === 1 ? "tomorrow" : `on ${end.date} ${EN_MONTHS[end.month]}`;
  return `Ends ${when} at ${enClock(end.hour, end.minute)}`;
};
