/**
 * B3 (2026-09-28) — the shop's own promo codes, and the arithmetic behind them.
 *
 * A shop running a discount is spending its own money, and the two numbers that
 * decide whether that is a good idea are:
 *
 *   1. what the code actually costs — the discount leaves the SHOP's share,
 *      the platform's commission is untouched (see `ps_write_shop_ledger`);
 *   2. how much extra volume it has to bring to pay for itself
 *      (`breakEvenUpliftPct`) — the honest counterweight to "10% off!".
 *
 * The platform sets the caps (max percent, max discount, how long a code may
 * run, how many redemptions, how many live codes at once). The server reads
 * them from `vendor_promo_limits` and the database enforces them again in
 * `ps_guard_vendor_promo`, so this module is the friendly first wall, never
 * the only one.
 *
 * Everything here is pure: money is paisa (§69), the clock is a parameter.
 */

export interface PromoLimits {
  /** Biggest percentage a shop may offer. */
  maxPercent: number;
  /** Biggest fixed discount, in paisa (50000 = ৳500). */
  maxDiscount: number;
  /** Longest a shop promo may run. */
  maxDays: number;
  /** Biggest redemption cap a shop may set. */
  maxUsage: number;
  /** How many live promos one shop may have at the same time. */
  maxActive: number;
}

/** Mirrors the column defaults in 202609280003_vendor_promos.sql. */
export const DEFAULT_PROMO_LIMITS: PromoLimits = {
  maxPercent: 25,
  maxDiscount: 50_000,
  maxDays: 30,
  maxUsage: 300,
  maxActive: 3,
};

/** A row of `vendor_promo_limits` → the numbers the form checks against. */
export const promoLimitsFrom = (row: unknown): PromoLimits => {
  const r = (row ?? {}) as Record<string, unknown>;
  const num = (key: string, fallback: number): number => {
    const v = r[key];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
  };
  return {
    maxPercent: num("max_percent", DEFAULT_PROMO_LIMITS.maxPercent),
    maxDiscount: num("max_discount", DEFAULT_PROMO_LIMITS.maxDiscount),
    maxDays: num("max_days", DEFAULT_PROMO_LIMITS.maxDays),
    maxUsage: num("max_usage", DEFAULT_PROMO_LIMITS.maxUsage),
    maxActive: num("max_active", DEFAULT_PROMO_LIMITS.maxActive),
  };
};

export type VendorPromoType = "percent" | "fixed";

export interface VendorPromoValue {
  code: string;
  type: VendorPromoType;
  /** percent (1–maxPercent) or fixed paisa. */
  value: number;
  /** Minimum order in paisa (0 = none). */
  minOrder: number;
  /** Cap for percent codes, in paisa; null = the cap alone decides. */
  maxDiscount: number | null;
  /** How many days the code runs, from `startOfDay(now)`. */
  days: number;
  /** Redemption cap — a shop promo always has one. */
  usageLimit: number;
  description: string;
}

export interface PromoValidation {
  ok: boolean;
  errors: Partial<Record<"code" | "type" | "value" | "minOrder" | "maxDiscount" | "days" | "usageLimit", string>>;
  value: VendorPromoValue;
}

export const PROMO_CODE_RE = /^[A-Z0-9]{3,24}$/;

const intOf = (raw: unknown, fallback = 0): number => {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : fallback;
};

/**
 * What the shop typed → what the database may receive. Money arrives in taka
 * from the form (a person types "50", not "5000") and is converted once, here.
 */
export const validateVendorPromo = (
  raw: unknown,
  limits: PromoLimits = DEFAULT_PROMO_LIMITS,
): PromoValidation => {
  const b = (raw ?? {}) as Record<string, unknown>;
  const errors: PromoValidation["errors"] = {};

  const code = String(b.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!PROMO_CODE_RE.test(code)) {
    errors.code = "Use 3–24 letters or digits (no spaces) — that is what shoppers type.";
  }

  const type: VendorPromoType = b.type === "fixed" ? "fixed" : b.type === "percent" ? "percent" : "percent";

  // `value` is taka for a fixed discount, a plain number for percent.
  const valueTaka = typeof b.value === "string" ? Number(b.value) : b.value;
  const rawValue =
    type === "fixed" ? Math.round((Number(valueTaka) || 0) * 100) : intOf(valueTaka, 0);
  if (type === "percent") {
    if (rawValue < 1 || rawValue > limits.maxPercent) {
      errors.value = `Pick between 1% and ${limits.maxPercent}% — the platform's cap.`;
    }
  } else if (rawValue < 100) {
    errors.value = "A fixed discount must be at least ৳1.";
  } else if (rawValue > limits.maxDiscount) {
    errors.value = `The most you can give is ৳${(limits.maxDiscount / 100).toLocaleString("en-IN")}.`;
  }

  const minOrder = Math.max(0, Math.round((Number(b.minOrder) || 0) * 100));
  const maxDiscountRaw = b.maxDiscount === null || b.maxDiscount === undefined || b.maxDiscount === ""
    ? null
    : Math.round((Number(b.maxDiscount) || 0) * 100);
  const maxDiscount =
    type === "percent" && maxDiscountRaw !== null && maxDiscountRaw > 0 ? maxDiscountRaw : null;
  if (type === "fixed" && maxDiscountRaw !== null && maxDiscountRaw > 0) {
    errors.maxDiscount = "A discount cap only applies to a percent code.";
  } else if (maxDiscount !== null && maxDiscount > limits.maxDiscount) {
    errors.maxDiscount = `The cap can be at most ৳${(limits.maxDiscount / 100).toLocaleString("en-IN")}.`;
  }

  const days = intOf(b.days, 0);
  if (days < 1 || days > limits.maxDays) {
    errors.days = `Run it 1–${limits.maxDays} days — the platform's cap.`;
  }

  const usageLimit = intOf(b.usageLimit, 0);
  if (usageLimit < 1 || usageLimit > limits.maxUsage) {
    errors.usageLimit = `Between 1 and ${limits.maxUsage} redemptions.`;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      code,
      type,
      value: rawValue,
      minOrder,
      maxDiscount,
      days: days < 1 ? 1 : days,
      usageLimit: usageLimit < 1 ? limits.maxUsage : usageLimit,
      description: String(b.description ?? "").trim().slice(0, 160),
    },
  };
};

/** The platform's caps as lines a shop can read — shown above the form. */
export const promoCapsLines = (limits: PromoLimits): string[] => [
  `Enough to give away: ${limits.maxPercent}% or ৳${(limits.maxDiscount / 100).toLocaleString("en-IN")}`,
  `Run time: ${limits.maxDays} days at the most`,
  `Redemptions: ${limits.maxUsage} at the most`,
  `Live codes at once: ${limits.maxActive}`,
];

export interface PromoShareMath {
  /** The sample order's product subtotal (paisa). */
  subtotal: number;
  /** What the shopper saves on it with this code. */
  discount: number;
  /** The platform's commission — the same before and after the code. */
  commission: number;
  /** The shop's share without the code. */
  vendorWithout: number;
  /** The shop's share when the code is used. */
  vendorWith: number;
  /** Extra orders (percent) needed just to stand still — see the docstring. */
  breakEvenUpliftPct: number;
}

/** The example order the vendor screen does the arithmetic on. */
export const SAMPLE_ORDER_PAISA = 120_000;

/**
 * The honest picture for one sample order. `commissionPct` is the shop's real
 * rate (the same number the ledger uses), so the numbers on the screen are the
 * numbers in the bank — not a marketing estimate.
 */
export const promoShareMath = (
  promo: Pick<VendorPromoValue, "type" | "value" | "maxDiscount">,
  options: { subtotal?: number; commissionPct?: number } = {},
): PromoShareMath => {
  const subtotal = Math.max(0, Math.round(options.subtotal ?? SAMPLE_ORDER_PAISA));
  const commissionPct = Math.max(0, Math.min(100, options.commissionPct ?? 15));
  const commission = Math.floor((subtotal * commissionPct) / 100);
  const vendorWithout = Math.max(0, subtotal - commission);

  let discount =
    promo.type === "fixed"
      ? Math.min(promo.value, subtotal)
      : Math.floor((subtotal * Math.max(0, Math.min(100, promo.value))) / 100);
  if (promo.type === "percent" && promo.maxDiscount && promo.maxDiscount > 0) {
    discount = Math.min(discount, promo.maxDiscount);
  }
  discount = Math.max(0, Math.min(discount, vendorWithout));

  const vendorWith = Math.max(0, vendorWithout - discount);
  return {
    subtotal,
    discount,
    commission,
    vendorWithout,
    vendorWith,
    // Each order now earns less, so the SHORTFALL (the discount) has to be won
    // back out of the smaller per-order margin: discount / vendorWith.
    breakEvenUpliftPct: vendorWith <= 0 || discount <= 0 ? 0 : Math.round((discount / vendorWith) * 1000) / 10,
  };
};

/** "৳1,200 order · you get ৳900 instead of ৳1,020 · 13.3% more orders to break even" */
export const promoShareSummary = (math: PromoShareMath): string => {
  const taka = (p: number) => `৳${(p / 100).toLocaleString("en-IN")}`;
  if (math.discount <= 0) {
    return `${taka(math.subtotal)} order · you get ${taka(math.vendorWith)} — this code gives nothing away yet.`;
  }
  return `${taka(math.subtotal)} order · you get ${taka(math.vendorWith)} instead of ${taka(
    math.vendorWithout,
  )} · ${math.breakEvenUpliftPct}% more orders and you are even.`;
};

export interface PromoLike {
  active: boolean;
  used: number;
  usageLimit?: number;
  validFrom?: number;
  validUntil?: number;
}

export type PromoState = "live" | "scheduled" | "paused" | "used-up" | "expired";

export const promoState = (promo: PromoLike, now: number = Date.now()): PromoState => {
  if (promo.validUntil !== undefined && now > promo.validUntil) return "expired";
  if (promo.usageLimit !== undefined && promo.used >= promo.usageLimit) return "used-up";
  if (!promo.active) return "paused";
  if (promo.validFrom !== undefined && now < promo.validFrom) return "scheduled";
  return "live";
};

export const PROMO_STATE_LABEL: Record<PromoState, string> = {
  live: "Live",
  scheduled: "Starts later",
  paused: "Paused",
  "used-up": "Fully used",
  expired: "Ended",
};

/** Orders left on the code — null when the code has no redemption cap. */
export const promoRemaining = (promo: PromoLike): number | null =>
  promo.usageLimit === undefined ? null : Math.max(0, promo.usageLimit - promo.used);
