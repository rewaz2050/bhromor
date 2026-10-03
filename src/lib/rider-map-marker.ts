/**
 * Admin live map — what a rider's pin should say about HOW OLD its position is.
 * Pure, so the rules are testable without Leaflet.
 *
 * A pin with no age looks live. After a phone loses signal, runs out of battery
 * or the tab is killed, the last fix sits on the map looking exactly like a rider
 * who is moving there right now — staff then dispatch against a location that is
 * 40 minutes old. An ONLINE rider whose last fix is older than STALE_FIX_MIN is
 * therefore drawn hollow with a "?" and the popup says how long ago it was.
 */
import type { Rider } from "./catalog";

export const STALE_FIX_MIN = 5;

/** Everything that reaches a Leaflet HTML string must be escaped: rider names are self-entered. */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Whole minutes since the last fix, or null when the rider never reported one. */
export const fixAgeMin = (lastLocationAt: number | undefined, nowMs: number): number | null =>
  typeof lastLocationAt === "number" && Number.isFinite(lastLocationAt)
    ? Math.max(0, Math.floor((nowMs - lastLocationAt) / 60_000))
    : null;

export const fixAgeLabel = (ageMin: number | null): string => {
  if (ageMin === null) return "no fix time recorded";
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${ageMin} min ago`;
  const h = Math.floor(ageMin / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
};

export interface RiderMarkerStyle {
  color: string;
  stale: boolean;
  ageLabel: string;
}

export const riderMarkerStyle = (
  r: Pick<Rider, "isOnline" | "currentLoad" | "lastLocationAt">,
  nowMs: number,
): RiderMarkerStyle => {
  const age = fixAgeMin(r.lastLocationAt, nowMs);
  // An online rider with no fix time at all (older rows) is not flagged: we cannot tell.
  const stale = Boolean(r.isOnline) && age !== null && age >= STALE_FIX_MIN;
  const color = r.isOnline ? (r.currentLoad && r.currentLoad > 0 ? "#f59e0b" : "#22c55e") : "#6b7280";
  return { color, stale, ageLabel: fixAgeLabel(age) };
};

export const riderMarkerHtml = (name: string, style: RiderMarkerStyle): string => {
  const initial = escapeHtml(name.trim()[0] ?? "?");
  const body = style.stale
    ? `background:white;color:${style.color};border:2px dashed ${style.color};opacity:0.85`
    : `background:${style.color};color:white;border:2px solid white`;
  const badge = style.stale
    ? `<span style="position:absolute;top:-6px;right:-6px;background:#dc2626;color:white;border-radius:9999px;width:14px;height:14px;font-size:10px;line-height:14px;text-align:center">?</span>`
    : "";
  return `<div style="position:relative;${body};border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${initial}${badge}</div>`;
};

export const riderPopupHtml = (
  r: Pick<Rider, "name" | "phone" | "isOnline" | "currentLoad" | "zoneIds">,
  style: RiderMarkerStyle,
): string =>
  `<b>${escapeHtml(r.name)}</b><br/>${escapeHtml(r.phone)}<br/>${r.isOnline ? "Online" : "Offline"} · Load ${r.currentLoad ?? 0}<br/>${escapeHtml(r.zoneIds.join(","))}<br/>` +
  (style.stale
    ? `<span style="color:#b91c1c;font-weight:600">Last location ${escapeHtml(style.ageLabel)} — may not be where they are now</span>`
    : `Last location ${escapeHtml(style.ageLabel)}`);
