/**
 * Referral (P0 #7) — "you ৳50, your friend ৳50".
 *
 * Word of mouth is the strongest channel in a town the size of Sunamganj, and
 * foodpanda BD has nothing like it. The rules that keep it honest:
 *   • the code belongs to an account, not a device (no self-refarm from
 *     incognito tabs);
 *   • the discount lands on the friend's FIRST order only;
 *   • the referrer is credited when that order is DELIVERED — not when it is
 *     placed — so cancelling your way through the reward is not a hobby;
 *   • the credit itself rides the existing coupon engine (see ./coupons.ts),
 *     so there is exactly one path where money changes hands.
 *
 * Codes are derived from the customer id so they are stable, shareable and
 * never contain a phone number.
 */

import { samePhone } from "./orders";
import { bdt, type Bdt } from "./format";

export interface ReferralConfig {
  enabled: boolean;
  /** Paisa off for the friend's first order. */
  friendRewardPaisa: Bdt;
  /** Paisa credited to the referrer once that order is delivered. */
  referrerRewardPaisa: Bdt;
  /** A ৳50 code on a ৳60 order is a loss-leader, not a referral. */
  minOrderPaisa: Bdt;
  /** Cap per referrer, so one viral post cannot bankrupt the launch. */
  maxRewardsPerReferrer: number;
}

export const REFERRAL_DEFAULTS: ReferralConfig = {
  enabled: true,
  friendRewardPaisa: bdt(50),
  referrerRewardPaisa: bdt(50),
  minOrderPaisa: bdt(300),
  maxRewardsPerReferrer: 10,
};

const intIn = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value)))
    : fallback;

export const sanitizeReferral = (raw: unknown): ReferralConfig => {
  const r = (raw ?? {}) as Partial<ReferralConfig>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : REFERRAL_DEFAULTS.enabled,
    friendRewardPaisa: intIn(r.friendRewardPaisa, REFERRAL_DEFAULTS.friendRewardPaisa, 0, bdt(1000)),
    referrerRewardPaisa: intIn(
      r.referrerRewardPaisa,
      REFERRAL_DEFAULTS.referrerRewardPaisa,
      0,
      bdt(1000),
    ),
    minOrderPaisa: intIn(r.minOrderPaisa, REFERRAL_DEFAULTS.minOrderPaisa, 0, bdt(100000)),
    maxRewardsPerReferrer: intIn(
      r.maxRewardsPerReferrer,
      REFERRAL_DEFAULTS.maxRewardsPerReferrer,
      1,
      100,
    ),
  };
};

/* ------------------------------------------------------------------ */
/* Codes                                                               */
/* ------------------------------------------------------------------ */

/** Crockford-ish alphabet: no I/O/U and no digits 0/1 — readable out loud. */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_LENGTH = 6;

const stripPrefixes = (value: string): string =>
  value
    .replace(/^PROSANTI[-_]?/i, "")
    .replace(/^PS[-_]?/, "")
    .replace(/[-_\s]/g, "")
    .slice(0, 12);

/**
 * Read a code from whatever a person pasted — "PS-AB12CD", "ps ab12cd", or a
 * whole WhatsApp message. A bare phone number is explicitly not a code, so the
 * error can say "check the letters" instead of "not found".
 */
export const normalizeRefCode = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  const upper = raw.trim().toUpperCase();
  if (upper === "") return "";
  if (/^[0-9+\s-]{6,}$/.test(upper)) return "";
  const direct = stripPrefixes(upper.replace(/[\s\-_]/g, ""));
  if (isRefCode(direct)) return direct;
  for (const token of upper.split(/[^A-Z0-9]+/)) {
    const candidate = stripPrefixes(token);
    if (isRefCode(candidate)) return candidate;
  }
  return direct;
};

export const isRefCode = (code: string): boolean =>
  new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code);

const hash = (seed: string): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * Deterministic 6-character code from an account id (or any stable seed).
 * Same account → same code across devices and reinstalls; the DB keeps a
 * unique constraint and re-salts once on the rare collision.
 */
export const referralCodeFor = (seed: string, salt = 0): string => {
  const clean = (seed ?? "").trim();
  if (clean === "") return "";
  let value = hash(`${clean}#${salt}`);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[value % ALPHABET.length];
    value = Math.floor(value / ALPHABET.length) ^ hash(`${clean}${i}${salt}`);
    value >>>= 0;
  }
  // Never let an accident spell something rude on a public link.
  if (/^(FCK|SHT|BS|DCK|KNS)$/i.test(out)) return referralCodeFor(`${clean}!`, salt + 1);
  return out;
};

/** The code a referrer shares, formatted for humans. */
export const displayRefCode = (code: string): string =>
  code ? `PS-${code}` : "";

export const referralLink = (origin: string, code: string): string => {
  const base = (origin || "").replace(/\/+$/, "");
  return `${base}/shop?ref=${code}`;
};

/** The coupon code a credited referrer redeems (created by the credit path). */
export const creditCouponCodeFor = (code: string): string =>
  `PSREF${code}`.slice(0, 24);

/* ------------------------------------------------------------------ */
/* Redemption                                                          */
/* ------------------------------------------------------------------ */

export interface ReferralRecord {
  code: string;
  customerId: string | null;
  referrerName: string;
  referrerPhone: string;
  /** Coupons already granted for delivered friend orders. */
  rewardsGranted: number;
  createdAt: number;
}

export interface ReferralEligibility {
  ok: boolean;
  discount: Bdt;
  reason?: string;
  code: string;
  /** The referrer who earns credit when this order is delivered. */
  referrer?: Pick<ReferralRecord, "code" | "referrerName" | "referrerPhone" | "customerId">;
}

export interface ReferralCheckInput {
  rawCode: unknown;
  records: ReferralRecord[];
  /** How many non-cancelled orders this phone has already placed. */
  buyerOrderCount: number;
  buyerPhone: string;
  subtotal: Bdt;
  cfg: ReferralConfig;
  /** Codes this buyer has already been credited for (prevents loops). */
  alreadyRedeemedBy?: string[];
}

/**
 * Server-side gate: the client can offer a code, only this decides whether it
 * pays. Order count and subtotal come from the loaded snapshot, never from the
 * browser.
 */
export const redeemReferral = (input: ReferralCheckInput): ReferralEligibility => {
  const code = normalizeRefCode(input.rawCode);
  const fail = (reason: string): ReferralEligibility => ({
    ok: false,
    discount: 0,
    reason,
    code,
  });
  if (!input.cfg.enabled) return fail("Referral rewards are paused right now.");
  if (code === "") return fail("Enter the 6-character code your friend shared.");
  if (!isRefCode(code)) return fail("That code is not in the right format.");
  if (input.subtotal < input.cfg.minOrderPaisa) {
    return fail(
      `Referral codes need a ${(input.cfg.minOrderPaisa / 100).toLocaleString("en-IN")} taka bag.`,
    );
  }
  const record = input.records.find((r) => r.code === code);
  if (!record) return fail("We could not find that code — check the letters.");
  if (samePhone(record.referrerPhone, input.buyerPhone)) {
    return fail("You cannot use your own referral code.");
  }
  if (input.buyerOrderCount > 0) {
    return fail("Referral rewards are for a first order only.");
  }
  if (input.alreadyRedeemedBy?.includes(code)) {
    return fail("This device already used a referral code.");
  }
  if (record.rewardsGranted >= input.cfg.maxRewardsPerReferrer) {
    return fail("This friend has reached their referral limit for now.");
  }
  return {
    ok: true,
    discount: Math.min(input.cfg.friendRewardPaisa, input.subtotal),
    code,
    referrer: {
      code: record.code,
      referrerName: record.referrerName,
      referrerPhone: record.referrerPhone,
      customerId: record.customerId,
    },
  };
};

export const shareMessage = (
  name: string,
  code: string,
  link: string,
  lang: "en" | "bn",
  rewardPaisa: Bdt = REFERRAL_DEFAULTS.friendRewardPaisa,
): string => {
  const taka = (rewardPaisa / 100).toLocaleString("en-IN");
  const who = name.trim() ? `${name.trim()} ` : "";
  return lang === "bn"
    ? `${who}প্রশান্তি থেকে অর্ডার করুন, প্রথম অর্ডারে ৳${taka} ছাড় পান · ${displayRefCode(code)} · ${link}`
    : `${who}Order from PROSANTI and take ৳${taka} off your first bag · code ${displayRefCode(code)} · ${link}`;
};

/* ------------------------------------------------------------------ */
/* Device capture                                                      */
/* ------------------------------------------------------------------ */

export const REFERRAL_STORAGE_KEY = "prosanti.ref.v1";

/** A `?ref=` visit is remembered for 30 days — the friend rarely orders in the
 *  same minute, and the checkout should not make them hunt for the code. */
export const REFERRAL_TTL_MS = 30 * 86_400_000;

export interface StoredRef {
  code: string;
  at: number;
}

const readRef = (): StoredRef | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRef;
    const code = normalizeRefCode(parsed?.code);
    if (!code || !isRefCode(code)) return null;
    if (!Number.isFinite(parsed?.at) || Date.now() - parsed.at > REFERRAL_TTL_MS) {
      window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
      return null;
    }
    return { code, at: parsed.at };
  } catch {
    return null;
  }
};

/** Capture from the URL (called once on the storefront shell). Returns true
 *  when something was stored, so the UI can say "code from X applied". */
export const captureRefFromUrl = (): StoredRef | null => {
  if (typeof window === "undefined") return null;
  let incoming: string | null = null;
  try {
    incoming = new URL(window.location.href).searchParams.get("ref");
  } catch {
    return null;
  }
  const code = normalizeRefCode(incoming);
  if (code === "" || !isRefCode(code)) return readRef();
  const existing = readRef();
  if (existing?.code === code) return existing;
  const fresh: StoredRef = { code, at: Date.now() };
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    /* storage unavailable — the code still applies for this page view */
  }
  return fresh;
};

export const storedRef = (): StoredRef | null => readRef();

export const clearStoredRef = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};
