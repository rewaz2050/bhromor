/**
 * Adaptive rider-GPS throttle: a fix only goes to the server when the rider
 * moved {@link MIN_MOVE_M} metres since the last sent fix, or the
 * {@link HEARTBEAT_MS} heartbeat is due. Standing still in the shop used to
 * PATCH on every watchPosition twitch.
 */
export const MIN_MOVE_M = 50;
export const HEARTBEAT_MS = 120_000;

export type SentFix = { lat: number; lng: number; at: number };

/** Cheap equirectangular ≈distance in metres — no library needed. */
export function fixDistanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dx = (bLng - aLng) * Math.cos((aLat * Math.PI) / 180);
  const dy = bLat - aLat;
  return Math.sqrt(dx * dx + dy * dy) * 111320;
}

export function shouldSendFix(
  last: SentFix | null,
  lat: number,
  lng: number,
  nowMs: number = Date.now(),
): boolean {
  if (!last) return true;
  if (nowMs - last.at >= HEARTBEAT_MS) return true;
  return fixDistanceM(last.lat, last.lng, lat, lng) >= MIN_MOVE_M;
}
