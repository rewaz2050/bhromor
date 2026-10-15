import "server-only";

/**
 * Live-tracking channel names — the address a rider's fix is broadcast to and
 * the one a customer's tracker listens on.
 *
 * Why a derived token and not the order id: the order number is guessable
 * (PS-YYYYMMDD-0042), and the phone is what proves ownership everywhere else
 * in the tracker (`findOwnedOrder`). A Realtime broadcast channel is public to
 * anyone who knows its name, so the name itself has to carry that proof:
 *
 *     track:hex24(HMAC-SHA256(key, "prosanti-live-track:" + orderUuid + ":" + phone))
 *
 * Hardened 2026-10-14 (round 4): the derivation is now keyed with the same
 * server secret as the track links (TRACK_TOKEN_SECRET / service-role key),
 * so even a leak of BOTH the order UUID and the phone does not yield the
 * channel name. 96 bits, server-computed only.
 *
 * Server-only on purpose. The browser never computes a channel name; it is
 * handed one by `/api/track/rider-location` (after the phone/token gate) and
 * the rider board is handed one by `/api/rider/jobs` (only for an order it
 * has accepted or picked up). Both sides derive it here, so the key change
 * is invisible to the apps.
 */
import { createHash, createHmac } from "node:crypto";
import { normalizePhone } from "./orders";

const PREFIX = "prosanti-live-track:";
const TOKEN_CHARS = 24;

const secret = (): Buffer => {
  const base =
    process.env.TRACK_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  return createHash("sha256").update(`prosanti-live-track-key-v1:${base}`).digest();
};

/**
 * `track:<token>` for an order, or null when there is nothing to derive one
 * from. Never throws: a missing phone simply means "no live channel", and the
 * tracker falls back to polling.
 */
export const liveTrackChannel = (
  orderId: string | null | undefined,
  phone: string | null | undefined,
): string | null => {
  const id = (orderId ?? "").trim();
  const digits = normalizePhone(phone ?? "");
  if (id === "" || digits === "") return null;
  const token = createHmac("sha256", secret())
    .update(`${PREFIX}${id.toUpperCase()}:${digits}`)
    .digest("hex")
    .slice(0, TOKEN_CHARS);
  return `track:${token}`;
};
