/**
 * PROSANTI+ membership (P2 #17) — ৳99/month, pure rules.
 *
 * There is no payment service provider in this stack, so membership follows
 * the SAME money model the shop already runs for orders (P1 #8): the shopper
 * sends the amount to the shop's own bKash/Nagad wallet, shares the TRXID,
 * and staff activate after checking the wallet history. No card vault, no
 * silent auto-charge — so no such thing is promised anywhere: a term is a
 * term, and it ends when it ends. The app shows the date; renewal is one tap.
 *
 * Free delivery is the perk that touches money: `plusActiveOf` decides it
 * from ONE input (a phone + the ledger rows), the checkout validator and the
 * place-order RPC apply the same answer, and the RPC answers for itself from
 * live rows — a stale client can never keep the perk past expiry, because
 * `now` is re-read on the server.
 */

import { normalizeBdPhone } from "./phone";

export interface PlusConfig {
  /** Master switch — off means /api/membership honestly refuses. */
  enabled: boolean;
  /** Monthly price in paisa. */
  pricePaisa: number;
}

export const PLUS_DEFAULTS: PlusConfig = { enabled: true, pricePaisa: 9900 };

export const PLUS_MONTHS_MIN = 1;
export const PLUS_MONTHS_MAX = 12;

/** One membership month = 30 days of expiry, flat — no calendar maths to argue with. */
export const PLUS_MONTH_MS = 30 * 86_400_000;

export const sanitizePlus = (raw: unknown): PlusConfig => {
  const r = (raw ?? {}) as Partial<PlusConfig>;
  const price =
    typeof r.pricePaisa === "number" && Number.isFinite(r.pricePaisa)
      ? Math.max(100, Math.min(100_000_00, Math.round(r.pricePaisa)))
      : PLUS_DEFAULTS.pricePaisa;
  return { enabled: r.enabled === true ? true : r.enabled === false ? false : PLUS_DEFAULTS.enabled, pricePaisa: price };
};

export const plusAmountPaisa = (cfg: PlusConfig, months: number): number => {
  const m = Math.max(PLUS_MONTHS_MIN, Math.min(PLUS_MONTHS_MAX, Math.floor(months || PLUS_MONTHS_MIN)));
  return cfg.pricePaisa * m;
};

/** A ledger row as stored (subset) — enough to derive any display state. */
export interface MembershipRow {
  phone: string;
  status: "pending" | "active" | "rejected";
  /** epoch ms, null until approved */
  expiresAt: number | null;
}

export type MembershipDisplayState = "none" | "pending" | "active" | "expired" | "rejected";

/**
 * The one truth used everywhere: ACTIVE only while approved AND unexpired.
 * "expired" is reported when a row has been allowed to lapse — the account
 * page turns that into a renewal button, not a dead status.
 */
export const membershipStateFor = (
  rows: MembershipRow[],
  nowMs: number = Date.now(),
): { state: MembershipDisplayState; expiresAt: number | null } => {
  let bestExpiry: number | null = null;
  let anyPending = false;
  let anyRejected = false;
  for (const r of rows) {
    if (r.status === "active" && r.expiresAt != null && r.expiresAt > nowMs) {
      bestExpiry = bestExpiry === null ? r.expiresAt : Math.max(bestExpiry, r.expiresAt);
    } else if (r.status === "pending") {
      anyPending = true;
    } else if (r.status === "rejected") {
      anyRejected = true;
    } else if (r.status === "active" && r.expiresAt != null) {
      bestExpiry = bestExpiry === null ? r.expiresAt : Math.max(bestExpiry, r.expiresAt);
    }
  }
  if (bestExpiry !== null && bestExpiry > nowMs) return { state: "active", expiresAt: bestExpiry };
  // a waiting application outranks a lapsed term — the renewal is IN REVIEW,
  // which is more true (and more actionable) than the old end date alone
  if (anyPending) return { state: "pending", expiresAt: bestExpiry };
  if (bestExpiry !== null) return { state: "expired", expiresAt: bestExpiry };
  if (anyRejected) return { state: "rejected", expiresAt: null };
  return { state: "none", expiresAt: null };
};

/** Server-side lookup input for checkout: is THIS phone covered right now? */
export const plusActiveOf = (
  rows: { status: string; expires_at: string | null }[],
  nowMs: number = Date.now(),
): boolean =>
  rows.some(
    (r) => r.status === "active" && r.expires_at !== null && Date.parse(r.expires_at) > nowMs,
  );

/** Normalise a submitted phone to the storage key ("01XXXXXXXXX") or null. */
export const membershipPhoneKey = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const n = normalizeBdPhone(raw);
  return /^01[3-9]\d{8}$/.test(n) ? n : null;
};
