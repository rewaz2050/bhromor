/**
 * Signed track tokens (security report 2026-10-14, H3).
 *
 * Order numbers are guessable (`PS-YYYYMMDD-NNNN`) and the phone is the
 * tracker's only other gate — often public knowledge. Links the SERVER
 * builds (push, WhatsApp, receipts) therefore carry a third factor:
 *
 *     t = HMAC-SHA256(key, "prosanti-track:" + orderRef + ":" + phone)[:24]
 *
 * 96 bits, unguessable without the key. `/api/track*` treats a valid `t`
 * as full ownership proof (relaxed rate limit); without it the
 * order-number + phone pair still works but under the strict limit.
 *
 * The key derives from TRACK_TOKEN_SECRET (preferred) or, failing that,
 * the service-role key — both server-only, both stable per project. If
 * neither exists the store is unconfigured anyway and tracking answers 503.
 *
 * SERVER-ONLY: node:crypto. Client code gets tokens precomputed on the
 * `Order.trackToken` field — it never derives them.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "./orders";

const PREFIX = "prosanti-track:";
const TOKEN_CHARS = 24;

const secret = (): Buffer => {
  const base =
    process.env.TRACK_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  return createHash("sha256").update(`prosanti-track-key-v1:${base}`).digest();
};

/** Canonical form of the id a track link carries (order number or uuid). */
const refKey = (ref: string): string => ref.trim().toUpperCase();

/**
 * The `t` value for a track link to `/<ref>` proved by `phone`.
 * Empty string when there is nothing to sign (caller then omits `t`).
 */
export const trackTokenFor = (ref: string, phone: string | null | undefined): string => {
  const id = refKey(ref ?? "");
  const digits = normalizePhone(phone ?? "");
  if (id === "" || digits === "") return "";
  return createHmac("sha256", secret())
    .update(`${PREFIX}${id}:${digits}`)
    .digest("hex")
    .slice(0, TOKEN_CHARS);
};

/** Timing-safe check of a presented token. Never throws. */
export const verifyTrackToken = (
  ref: string,
  phone: string | null | undefined,
  token: string | null | undefined,
): boolean => {
  const given = (token ?? "").trim().toLowerCase();
  if (given.length !== TOKEN_CHARS) return false;
  const expected = trackTokenFor(ref, phone);
  if (expected === "") return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
  } catch {
    return false;
  }
};
