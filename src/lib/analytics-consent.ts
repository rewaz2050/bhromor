/**
 * Analytics consent (security/privacy report 2026-10-14, M3).
 *
 * Meta Pixel and GA4 are advertising/analytics trackers. The privacy page
 * promises no advertising trackers, so — until a full consent platform
 * exists — the storefront must NOT load them before the visitor says yes.
 * Choice lives in localStorage (no cookie needed for the gate itself):
 *   "accepted"  → scripts load
 *   "declined"  → scripts never load
 *   null        → ask once (banner)
 */

export const ANALYTICS_CONSENT_KEY = "prosanti.analytics-consent.v1";

export type AnalyticsConsent = "accepted" | "declined";

export const readAnalyticsConsent = (): AnalyticsConsent | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return raw === "accepted" || raw === "declined" ? raw : null;
  } catch {
    return null;
  }
};

export const writeAnalyticsConsent = (value: AnalyticsConsent): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
};

/** True when any third-party tracker is actually configured. */
export const analyticsConfigured = (pixelId: string | null, gaId: string | null): boolean =>
  Boolean(pixelId || gaId);
