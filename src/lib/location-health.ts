import { bnDigits } from "./arrival";

/**
 * Item Q — is the rider's phone still reporting its position?
 *
 * A web app cannot track in the background (browsers suspend GPS when the tab
 * is hidden or the screen is off), so the honest design is to keep the screen
 * awake during a trip (`use-wake-lock`), resume immediately when the app comes
 * back, and TELL people when the signal is lost — the rider (so they can fix
 * it) and the customer (so a stale pin is not shown as live). Pure, no React.
 */

export type GeoErrorKind = "denied" | "unavailable" | "timeout";

/** `GeolocationPositionError.code` → a kind (1 permission, 2 position unavailable, 3 timeout). */
export const geoErrorKind = (code: number): GeoErrorKind => (code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable");

export type TrackingState = "off" | "starting" | "ok" | "send_failed" | "stale" | "unavailable" | "denied";

/** No fix for this long ⇒ the signal is lost (the fallback ping is 30 s on a trip, 2 min idle). */
export const STALE_AFTER_TRIP_MS = 3 * 60_000;
export const STALE_AFTER_IDLE_MS = 6 * 60_000;

export interface TrackingInput {
  /** Signed in AND online — otherwise nothing is expected. */
  enabled: boolean;
  hasActiveTrip: boolean;
  /** Permissions API answer, when the browser offers one. */
  permission: "granted" | "denied" | "prompt" | null;
  lastError: GeoErrorKind | null;
  /** Epoch ms of the last position the DEVICE produced (not the last upload). */
  lastFixAt: number | null;
  /** The last upload to the server failed. */
  sendFailed: boolean;
  now: number;
}

export const trackingState = (i: TrackingInput): TrackingState => {
  if (!i.enabled) return "off";
  if (i.permission === "denied" || i.lastError === "denied") return "denied";
  if (i.lastFixAt === null) return i.lastError === "unavailable" ? "unavailable" : "starting";
  const limit = i.hasActiveTrip ? STALE_AFTER_TRIP_MS : STALE_AFTER_IDLE_MS;
  if (i.now - i.lastFixAt > limit) return i.lastError === "unavailable" ? "unavailable" : "stale";
  return i.sendFailed ? "send_failed" : "ok";
};

export interface TrackingNotice {
  tone: "warn" | "bad";
  title: string;
  hint: string;
}

/** What the rider is told. `null` for the healthy / not-applicable states. */
export const trackingNotice = (state: TrackingState, hasActiveTrip: boolean): TrackingNotice | null => {
  switch (state) {
    case "denied":
      return {
        tone: "bad",
        title: "লোকেশন বন্ধ আছে",
        hint: hasActiveTrip
          ? "কাস্টমার আপনাকে ম্যাপে দেখতে পাচ্ছেন না। ব্রাউজারের সাইট সেটিংসে লোকেশন “অনুমতি দিন” করুন।"
          : "কাছের রাইডার হিসেবে অফার পেতে লোকেশন লাগে। ব্রাউজারের সাইট সেটিংসে লোকেশন “অনুমতি দিন” করুন।",
      };
    case "unavailable":
      return { tone: "warn", title: "GPS সিগন্যাল পাওয়া যাচ্ছে না", hint: "খোলা জায়গায় যান এবং ফোনের Location/GPS চালু আছে কি না দেখুন।" };
    case "stale":
      return {
        tone: "warn",
        title: "লোকেশন আপডেট হচ্ছে না",
        hint: "অ্যাপটি খোলা রাখুন ও স্ক্রিন জাগিয়ে রাখুন — ব্যাকগ্রাউন্ডে গেলে ফোন লোকেশন পাঠানো থামিয়ে দেয়।",
      };
    case "send_failed":
      return { tone: "warn", title: "লোকেশন সার্ভারে যাচ্ছে না", hint: "ইন্টারনেট সংযোগ পরীক্ষা করুন — নিজে থেকেই আবার চেষ্টা হবে।" };
    default:
      return null;
  }
};

export type Freshness = { level: "unknown" | "live" | "recent" | "stale"; minutes: number | null };

/** A rider fix older than this is not "where the rider is" any more. */
export const FRESH_MS = 2 * 60_000;
export const STALE_MS = 5 * 60_000;

export const locationFreshness = (updatedAt: string | number | null | undefined, now: number): Freshness => {
  if (updatedAt === null || updatedAt === undefined || updatedAt === "") return { level: "unknown", minutes: null };
  const at = typeof updatedAt === "number" ? updatedAt : Date.parse(updatedAt);
  if (!Number.isFinite(at)) return { level: "unknown", minutes: null };
  const age = Math.max(0, now - at);
  const minutes = Math.floor(age / 60_000);
  return { level: age <= FRESH_MS ? "live" : age <= STALE_MS ? "recent" : "stale", minutes };
};

/** "এইমাত্র" / "৩ মিনিট আগে" — for the customer's tracker. */
export const freshnessLabel = (f: Freshness): string =>
  f.minutes === null ? "" : f.minutes < 1 ? "এইমাত্র" : `${bnDigits(String(f.minutes))} মিনিট আগে`;
