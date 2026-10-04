/**
 * Item N — driving-licence expiry, pure rules shared by the sweep, the admin
 * card and the rider's profile banner. Dates are Dhaka calendar days
 * (`YYYY-MM-DD`); nothing here reads a clock — the caller passes "today".
 */

import { LICENCE_VEHICLES } from "./rider-kyc";

/** Warn staff and the rider this many days before the licence lapses. */
export const LICENCE_WARN_DAYS = 14;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Day number (UTC midnight / 86 400 000) for a valid YYYY-MM-DD, else null. */
export const dayNumber = (date: string): number | null => {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.floor(ms / 86_400_000);
};

/** A plausible licence expiry: a real date, not before 2000, not beyond ~20 years. */
export const isValidLicenceExpiry = (date: string, today: string): boolean => {
  const n = dayNumber(date);
  const t = dayNumber(today);
  if (n === null || t === null) return false;
  return n >= dayNumber("2000-01-01")! && n <= t + 366 * 20;
};

/** `today` + `days` as YYYY-MM-DD. */
export const addDays = (today: string, days: number): string => {
  const t = dayNumber(today);
  if (t === null) return today;
  return new Date((t + days) * 86_400_000).toISOString().slice(0, 10);
};

export type LicenceKind = "na" | "unrecorded" | "ok" | "soon" | "expired";

export interface LicenceStatus {
  kind: LicenceKind;
  /** Days until expiry (negative once lapsed); null when n/a or unrecorded. */
  daysLeft: number | null;
  /** True when the rider must not take trips (lapsed licence on a motor vehicle). */
  blocked: boolean;
}

export const licenceStatus = (
  vehicle: string,
  expiresOn: string | null | undefined,
  today: string,
): LicenceStatus => {
  if (!LICENCE_VEHICLES.has(vehicle)) return { kind: "na", daysLeft: null, blocked: false };
  const exp = expiresOn ? dayNumber(expiresOn) : null;
  const t = dayNumber(today);
  if (exp === null || t === null) return { kind: "unrecorded", daysLeft: null, blocked: false };
  const daysLeft = exp - t;
  if (daysLeft < 0) return { kind: "expired", daysLeft, blocked: true };
  if (daysLeft <= LICENCE_WARN_DAYS) return { kind: "soon", daysLeft, blocked: false };
  return { kind: "ok", daysLeft, blocked: false };
};

/** Bangla line for the rider (profile banner, push). null when nothing to say. */
export const licenceRiderMessage = (s: LicenceStatus): string | null => {
  if (s.kind === "expired") {
    return "আপনার ড্রাইভিং লাইসেন্সের মেয়াদ শেষ — নবায়ন করে অফিসে নতুন তারিখ জানান, তার আগে অনলাইন হওয়া যাবে না।";
  }
  if (s.kind === "soon") {
    return s.daysLeft === 0
      ? "আপনার ড্রাইভিং লাইসেন্সের মেয়াদ আজ শেষ — আজই নবায়নের ব্যবস্থা করুন।"
      : `আপনার ড্রাইভিং লাইসেন্সের মেয়াদ আর ${s.daysLeft} দিন বাকি — সময়মতো নবায়ন করুন, নইলে অনলাইন হওয়া বন্ধ হবে।`;
  }
  return null;
};
