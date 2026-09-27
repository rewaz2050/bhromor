/**
 * UX plan §3 (R11) — "কোড কপি → চেকআউটে বসানো": the promo code a shopper
 * copied from the offers card travels to checkout by itself and sits in
 * the coupon field, so nobody has to remember or retype it. It is only
 * PLACED, never applied: auto-apply is an account perk (owner decision,
 * R9), and a guest still taps Apply — the server validates as always.
 * Same-device, one day.
 */

export const COUPON_CARRY_KEY = "prosanti.coupon-carry.v1";
export const COUPON_CARRY_TTL_MS = 24 * 60 * 60 * 1000;

interface Carried {
  code: string;
  at: number;
}

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const rememberCoupon = (code: string, now: number = Date.now()): void => {
  const s = storage();
  const clean = code.trim().toUpperCase();
  if (!s || !clean) return;
  try {
    s.setItem(COUPON_CARRY_KEY, JSON.stringify({ code: clean, at: now } satisfies Carried));
  } catch {
    /* storage full / private mode — the shopper still has the clipboard */
  }
};

/** The carried code while it is fresh; otherwise null (and the stale entry is dropped). */
export const carriedCoupon = (now: number = Date.now()): string | null => {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(COUPON_CARRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Carried>;
    if (typeof parsed.code !== "string" || typeof parsed.at !== "number" || now - parsed.at > COUPON_CARRY_TTL_MS) {
      s.removeItem(COUPON_CARRY_KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
};

export const forgetCoupon = (): void => {
  try {
    storage()?.removeItem(COUPON_CARRY_KEY);
  } catch {
    /* ignore */
  }
};
