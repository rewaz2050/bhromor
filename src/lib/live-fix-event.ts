/**
 * The one string both ends of live tracking must agree on: the Supabase
 * Realtime broadcast event a rider's board publishes and a customer's
 * tracker listens for.
 *
 * Its own tiny module on purpose — the channel NAME is derived server-side
 * (`lib/live-track-channel`, node:crypto, never shipped to the browser) but
 * the event name is needed by both sides, so it cannot live in that file.
 */

/** Broadcast event carrying one position fix. */
export const LIVE_FIX_EVENT = "fix";

/** What rides on that event. `at` is epoch ms, taken on the rider's phone. */
export interface LiveFixPayload {
  lat: number;
  lng: number;
  at: number;
}
