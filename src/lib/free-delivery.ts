/**
 * Free delivery threshold (2026-09-26) — the one AOV lever the bag can show
 * as a progress bar: "add ৳150 more and delivery is free".
 *
 * Two rules, both optional:
 *   • the PLATFORM rule (Admin → Settings) — PROSANTI funds it;
 *   • the SHOP rule (Vendor → Settings, `shops.free_delivery_min`) — the shop
 *     funds it (the ledger deducts the waived amount from that order's payout).
 *
 * The shopper's target is simply the LOWEST enabled minimum; who pays is a
 * separate question answered at placement: platform first, then the shop.
 * `ps_place_order` (migration 202609260003) applies exactly these rules in
 * SQL — this module is the storefront/validator mirror, so a bar that says
 * "free" can never disagree with the bill.
 *
 * Never applies to the courier zone (z4), to store pickup, or on top of a
 * free-delivery coupon / PROSANTI+ (those already waived everything).
 */

export type FreeDeliverySource = "platform" | "shop";

export interface FreeDeliveryRule {
  enabled: boolean;
  /** Minimum item subtotal, in paisa. */
  minSubtotalPaisa: number;
}

/** ৳999 — a sensible first threshold for a ৳60 city charge; OFF until armed. */
export const FREE_DELIVERY_DEFAULTS: FreeDeliveryRule = {
  enabled: false,
  minSubtotalPaisa: 99_900,
};

/** Bounds for any threshold, in paisa: ৳100 … ৳50,000. */
export const FREE_DELIVERY_MIN_PAISA = 10_000;
export const FREE_DELIVERY_MAX_PAISA = 5_000_000;

const clampPaisa = (value: number): number =>
  Math.max(FREE_DELIVERY_MIN_PAISA, Math.min(FREE_DELIVERY_MAX_PAISA, Math.floor(value)));

/** A stored/typed platform rule → a safe one. */
export const sanitizeFreeDelivery = (raw: unknown): FreeDeliveryRule => {
  const p = (raw ?? {}) as Partial<FreeDeliveryRule>;
  const min =
    typeof p.minSubtotalPaisa === "number" && Number.isFinite(p.minSubtotalPaisa)
      ? clampPaisa(p.minSubtotalPaisa)
      : FREE_DELIVERY_DEFAULTS.minSubtotalPaisa;
  return { enabled: p.enabled === true, minSubtotalPaisa: min };
};

/**
 * A shop's own minimum from any input (vendor form, admin form, API): a
 * finite positive number is clamped into range; null / "" / 0 / garbage
 * means "no shop rule".
 */
export const parseShopFreeDeliveryMin = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === "" || raw === false) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampPaisa(n);
};

export interface FreeDeliveryOffer {
  by: FreeDeliverySource;
  minSubtotalPaisa: number;
}

/** Every armed rule for this shop, platform first. */
export const freeDeliveryOffers = (
  platform: FreeDeliveryRule | null | undefined,
  shop: { freeDeliveryMinPaisa?: number | null } | null | undefined,
): FreeDeliveryOffer[] => {
  const offers: FreeDeliveryOffer[] = [];
  if (platform?.enabled && platform.minSubtotalPaisa > 0) {
    offers.push({ by: "platform", minSubtotalPaisa: platform.minSubtotalPaisa });
  }
  const shopMin = shop?.freeDeliveryMinPaisa;
  if (typeof shopMin === "number" && Number.isFinite(shopMin) && shopMin > 0) {
    offers.push({ by: "shop", minSubtotalPaisa: shopMin });
  }
  return offers;
};

export interface FreeDeliveryContext {
  /** Courier leg (zone z4) — never free. */
  courier?: boolean;
  /** Store pickup — already free, nothing to promise. */
  pickup?: boolean;
  /** A free-delivery coupon or PROSANTI+ already waived the charge. */
  alreadyFree?: boolean;
}

/**
 * The rule that pays for THIS subtotal, or null. Platform first, then the
 * shop — the same order `ps_place_order` uses.
 */
export const freeDeliveryFor = (
  subtotal: number,
  offers: FreeDeliveryOffer[],
  ctx: FreeDeliveryContext = {},
): FreeDeliveryOffer | null => {
  if (ctx.courier || ctx.pickup || ctx.alreadyFree) return null;
  if (!(subtotal > 0)) return null;
  for (const by of ["platform", "shop"] as const) {
    const offer = offers.find((o) => o.by === by);
    if (offer && subtotal >= offer.minSubtotalPaisa) return offer;
  }
  return null;
};

/** The lowest armed minimum — what the shopper is actually aiming for. */
export const freeDeliveryTarget = (offers: FreeDeliveryOffer[]): number | null =>
  offers.length === 0 ? null : Math.min(...offers.map((o) => o.minSubtotalPaisa));

export interface FreeDeliveryProgress {
  /** The minimum in play (paisa). */
  target: number;
  /** Paisa still to add; 0 once reached. */
  remaining: number;
  reached: boolean;
  /** 0–100, for the bar. */
  pct: number;
}

/**
 * Progress towards the nearest threshold — null when no rule is armed or the
 * context rules it out (courier / pickup / already free), so callers render
 * nothing rather than an empty bar.
 */
export const freeDeliveryProgress = (
  subtotal: number,
  offers: FreeDeliveryOffer[],
  ctx: FreeDeliveryContext = {},
): FreeDeliveryProgress | null => {
  if (ctx.courier || ctx.pickup || ctx.alreadyFree) return null;
  const target = freeDeliveryTarget(offers);
  if (target === null) return null;
  const safe = Math.max(0, Math.floor(subtotal));
  const remaining = Math.max(0, target - safe);
  return {
    target,
    remaining,
    reached: remaining === 0,
    pct: Math.max(0, Math.min(100, Math.round((safe / target) * 100))),
  };
};
