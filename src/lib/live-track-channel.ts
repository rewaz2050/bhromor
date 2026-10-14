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
 *     track:sha256("prosanti-live-track:" + orderUuid + ":" + phone)[:24]
 *
 * 96 bits — unguessable without the phone, and derived from the STORED phone
 * so the rider's board and the customer's tracker compute the same string
 * from the same row. The order's UUID is the key both sides share (the public
 * order number is guessable AND nullable in this schema). No table, no column,
 * no migration: nothing for the owner to run in the SQL Editor.
 *
 * Server-only on purpose. The browser never computes a channel name; it is
 * handed one by `/api/track/rider-location` (after the phone check) and the
 * rider board is handed one by `/api/rider/jobs` (only for an order it has
 * accepted or picked up).
 */
import { createHash } from "node:crypto";
import { normalizePhone } from "./orders";

const PREFIX = "prosanti-live-track:";
const TOKEN_CHARS = 24;

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
  const token = createHash("sha256")
    .update(`${PREFIX}${id.toUpperCase()}:${digits}`)
    .digest("hex")
    .slice(0, TOKEN_CHARS);
  return `track:${token}`;
};
