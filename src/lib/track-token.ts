/**
 * Signed track tokens (security report 2026-10-14, H3; expiry added 2026-10-27).
 *
 * Order numbers are guessable (`PS-YYYYMMDD-NNNN`) and the phone is the
 * tracker's only other gate — often public knowledge. Links the SERVER
 * builds (push, WhatsApp, receipts) therefore carry a third factor:
 *
 *   v1 (legacy): t = HMAC-SHA256(key, "prosanti-track:" + orderRef + ":" + phone)[:24]
 *   v2 (expiry): t = "2." + base36(unix seconds) + "." + base36(hours) + "." + mac24
 *                mac covers "prosanti-track-v2:ref:phone:issuedAt:hours"
 *
 * 96 bits, unguessable without the key. `/api/track*` treats a valid `t` as
 * full ownership proof (relaxed rate limit); without it the order-number +
 * phone pair still works but under the strict limit.
 *
 * Why two formats: v1 tokens have no issue time, so they can never expire.
 * They stay valid by default (existing receipts keep working), and operators
 * have two explicit switches instead of a silent behaviour change:
 *
 *   TRACK_TOKEN_TTL_HOURS    > 0  → mint v2 tokens that expire that many hours
 *                                   after they were issued. The lifetime is
 *                                   signed INTO the token, so changing the
 *                                   variable later never revives an expired
 *                                   link or extends a live one.
 *   TRACK_TOKEN_REVOKE_LEGACY = 1 → stop accepting v1 tokens entirely.
 *
 * Rotating TRACK_TOKEN_SECRET remains the nuclear option (all tokens die), and
 * is documented in docs/go-live.md with its customer-support cost.
 *
 * SERVER-ONLY: node:crypto. Client code gets tokens precomputed on the
 * `Order.trackToken` field — it never derives them.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "./orders";

const PREFIX = "prosanti-track:";
const PREFIX_V2 = "prosanti-track-v2:";
const TOKEN_CHARS = 24;
const V2_PREFIX = "2.";

const secret = (): Buffer => {
  const base =
    process.env.TRACK_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  return createHash("sha256").update(`prosanti-track-key-v1:${base}`).digest();
};

/** Canonical form of the id a track link carries (order number or uuid). */
const refKey = (ref: string): string => ref.trim().toUpperCase();

/** Configured lifetime in hours; 0 / unset / junk = tokens never expire. */
export const trackTokenTtlHours = (): number => {
  const raw = Number(process.env.TRACK_TOKEN_TTL_HOURS ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

/** Are legacy (timeless) tokens still accepted? Default yes. */
export const legacyTrackTokensAccepted = (): boolean =>
  (process.env.TRACK_TOKEN_REVOKE_LEGACY ?? "").trim() !== "1";

const macV1 = (id: string, digits: string): string =>
  createHmac("sha256", secret())
    .update(`${PREFIX}${id}:${digits}`)
    .digest("hex")
    .slice(0, TOKEN_CHARS);

const macV2 = (
  id: string,
  digits: string,
  issuedAt: number,
  hours: number,
): string =>
  createHmac("sha256", secret())
    .update(`${PREFIX_V2}${id}:${digits}:${issuedAt}:${hours}`)
    .digest("hex")
    .slice(0, TOKEN_CHARS);

/** Longest lifetime we are willing to honour from an (authenticated) token. */
const MAX_TTL_HOURS = 24 * 365 * 5;

const toBase36 = (n: number): string => Math.floor(n).toString(36);

/**
 * The `t` value for a track link to `/<ref>` proved by `phone`.
 * Empty string when there is nothing to sign (caller then omits `t`).
 *
 * v2 is minted only when a lifetime is configured — a database/app that has
 * not opted in keeps producing byte-identical v1 links.
 */
export const trackTokenFor = (
  ref: string,
  phone: string | null | undefined,
  now: number = Date.now(),
): string => {
  const id = refKey(ref ?? "");
  const digits = normalizePhone(phone ?? "");
  if (id === "" || digits === "") return "";
  const ttl = trackTokenTtlHours();
  if (ttl === 0) return macV1(id, digits);
  const hours = Math.min(Math.ceil(ttl), MAX_TTL_HOURS);
  const issuedAt = Math.floor(now / 1000);
  return `${V2_PREFIX}${toBase36(issuedAt)}.${toBase36(hours)}.${macV2(id, digits, issuedAt, hours)}`;
};

const timingSafeHex = (expected: string, given: string): boolean => {
  if (expected.length !== TOKEN_CHARS || given.length !== TOKEN_CHARS)
    return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(given, "hex"),
    );
  } catch {
    return false;
  }
};

/**
 * Timing-safe check of a presented token. Never throws.
 *
 * v2: the embedded timestamp and lifetime are authenticated by the MAC, so a
 * customer can neither move an expired token forward in time nor edit its
 * lifetime; a token dated in the future beyond a small clock skew is refused.
 * v1: accepted unless TRACK_TOKEN_REVOKE_LEGACY=1.
 */
export const verifyTrackToken = (
  ref: string,
  phone: string | null | undefined,
  token: string | null | undefined,
  now: number = Date.now(),
): boolean => {
  const given = (token ?? "").trim().toLowerCase();
  if (given === "") return false;
  const id = refKey(ref ?? "");
  const digits = normalizePhone(phone ?? "");
  if (id === "" || digits === "") return false;

  if (given.startsWith(V2_PREFIX)) {
    const parts = given.split(".");
    if (parts.length !== 4) return false;
    const [, stamp, life, mac] = parts;
    if (!/^[0-9a-z]{1,10}$/.test(stamp) || !/^[0-9a-z]{1,4}$/.test(life))
      return false;
    if (!/^[0-9a-f]{24}$/.test(mac)) return false;
    const issuedAt = Number.parseInt(stamp, 36);
    const hours = Number.parseInt(life, 36);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;
    if (!Number.isInteger(hours) || hours <= 0 || hours > MAX_TTL_HOURS)
      return false;
    if (!timingSafeHex(macV2(id, digits, issuedAt, hours), mac)) return false;
    const nowSec = Math.floor(now / 1000);
    // Small forward skew (5 min) tolerates clock drift between instances.
    if (issuedAt > nowSec + 300) return false;
    // The lifetime travels inside the MAC, so an expired link stays expired
    // even if the operator later removes or raises TRACK_TOKEN_TTL_HOURS.
    return nowSec - issuedAt <= hours * 3600;
  }

  if (!legacyTrackTokensAccepted()) return false;
  if (given.length !== TOKEN_CHARS) return false;
  return timingSafeHex(macV1(id, digits), given);
};
