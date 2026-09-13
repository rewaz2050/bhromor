/**
 * P0 promo engine — flash sales, curated bundles, and the single-offer rule
 * the checkout prices with.
 *
 * Owner brief ("better than foodpanda, because clothes"):
 *   • Flash sale — two fixed daily windows (noon + evening, Asia/Dhaka) with
 *     a live countdown. Scarcity is the product, so the clock is part of the
 *     page, not a marketing afterthought.
 *   • Bundle — "Complete the Look" turned into a real one-click set (panjabi +
 *     pajama + gamcha = Eid Set) priced under the sum of its parts.
 *   • Coupons — the existing engine (see ./coupons.ts) and untouched here.
 *   • ONE automatic offer per order: the best of {flash, bundle, coupon}.
 *     Stacking invites refund arguments; the customer always keeps the bigger
 *     number, which is also the easier promise to keep.
 *
 * Money is integer paisa (§69). This module is pure and UI-free so the
 * storefront, the API validator and the unit tests share one definition of
 * "on sale right now" — a price the browser invents is not a price.
 */

import type { Product } from "./catalog";
import { completeTheLook, isDiscoverable } from "./merchandising";

/* ------------------------------------------------------------------ */
/* Bangladesh clock                                                    */
/* ------------------------------------------------------------------ */

/** Bangladesh is UTC+6 all year (no DST) — a fixed offset is correct here. */
export const DHAKA_UTC_OFFSET_SECONDS = 6 * 3600;

/** Seconds since local midnight in Dhaka. */
export const dhakaDaySeconds = (nowMs: number): number => {
  const total = Math.floor(nowMs / 1000) + DHAKA_UTC_OFFSET_SECONDS;
  return ((total % 86400) + 86400) % 86400;
};

export const parseClock = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
};

export const formatClock = (seconds: number): string => {
  const s = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ */
/* Flash sale                                                          */
/* ------------------------------------------------------------------ */

export interface FlashSlot {
  /** "12:00" — local Dhaka time, inclusive. */
  start: string;
  /** "13:00" — exclusive. */
  end: string;
}

export type FlashScope = "all" | "featured" | "selected";

export interface FlashConfig {
  enabled: boolean;
  title: string;
  /** Percent off the list price inside the window (1–90). */
  discountPct: number;
  slots: FlashSlot[];
  scope: FlashScope;
  /** Product ids OR slugs — ids differ between the launch seeds and live rows. */
  productIds: string[];
  /**paisa — the MOST one piece can lose (0 = no cap). Per piece, not per
   * order, because a badge quotes a single garment and must be right on its
   * own — see `unitFlashDiscount`. */
  maxDiscountPaisa: number;
}

export const FLASH_DEFAULTS: FlashConfig = {
  enabled: false,
  title: "Flash Drop",
  discountPct: 25,
  slots: [
    { start: "12:00", end: "13:00" },
    { start: "19:00", end: "21:00" },
  ],
  scope: "featured",
  productIds: [],
  maxDiscountPaisa: 50000,
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

const text = (value: unknown, fallback: string, max: number): string => {
  const s = typeof value === "string" ? value.trim() : "";
  return (s === "" ? fallback : s).slice(0, max);
};

/** Never trust a stored doc: bad clocks and wild percents are dropped. */
export const sanitizeFlash = (raw: unknown): FlashConfig => {
  const r = (raw ?? {}) as Partial<FlashConfig> & Record<string, unknown>;
  const rawSlots = Array.isArray(r.slots) ? r.slots.slice(0, 6) : null;
  const slots: FlashSlot[] = [];
  for (const entry of rawSlots ?? FLASH_DEFAULTS.slots) {
    const e = (entry ?? {}) as Partial<FlashSlot>;
    const start = typeof e.start === "string" ? e.start.trim() : "";
    const end = typeof e.end === "string" ? e.end.trim() : "";
    if (parseClock(start) === null || parseClock(end) === null) continue;
    if (start === end) continue; // a zero-length window is a bug, not a sale
    slots.push({ start: formatClock(parseClock(start) as number), end: formatClock(parseClock(end) as number) });
  }
  const scope = (["all", "featured", "selected"] as const).includes(
    r.scope as FlashScope,
  )
    ? (r.scope as FlashScope)
    : FLASH_DEFAULTS.scope;
  const productIds = Array.isArray(r.productIds)
    ? [...new Set(r.productIds.slice(0, 60).map((id) => text(id, "", 64)).filter(Boolean))]
    : [];
  return {
    enabled: r.enabled === true,
    title: text(r.title, FLASH_DEFAULTS.title, 40),
    discountPct: intIn(r.discountPct, FLASH_DEFAULTS.discountPct, 1, 90),
    slots: slots.length > 0 ? slots : FLASH_DEFAULTS.slots,
    scope,
    productIds,
    maxDiscountPaisa: intIn(r.maxDiscountPaisa, FLASH_DEFAULTS.maxDiscountPaisa, 0, 1_000_000),
  };
};

/**
 * Is `product` in this flash drop? `selected` matches id or slug so a config
 * saved against the launch seeds still lands on the live rows after seeding.
 */
export const isFlashProduct = (cfg: FlashConfig, product: Product): boolean => {
  if (!cfg.enabled) return false;
  if (cfg.scope === "all") return isDiscoverable(product);
  if (cfg.scope === "featured") return isDiscoverable(product) && product.featured;
  return (
    isDiscoverable(product) &&
    (cfg.productIds.includes(product.id) || cfg.productIds.includes(product.slug))
  );
};

export interface FlashWindow {
  /** Window start/end in seconds since Dhaka midnight. */
  startSec: number;
  endSec: number;
  /** Epoch ms when the running window closes (live) or opens (upcoming). */
  atMs: number;
}

export interface FlashState {
  active: boolean;
  /** Wall-clock end of the running window (only when active). */
  endsAtMs: number | null;
  msLeft: number;
  /** Next window to open (null when the engine is off). */
  nextStartsAtMs: number | null;
  /** 0–1 share of the running window already elapsed. */
  progress: number;
}

const windowSpan = (startSec: number, endSec: number): number =>
  endSec > startSec ? endSec - startSec : 86400 - startSec + endSec;

/**
 * Where the clock stands for a shopper: running now (with the deadline) or
 * the next window to open. Overnight windows (22:00→01:00) wrap correctly.
 */
export const flashState = (cfg: FlashConfig, nowMs: number = Date.now()): FlashState => {
  const off: FlashState = {
    active: false,
    endsAtMs: null,
    msLeft: 0,
    nextStartsAtMs: null,
    progress: 0,
  };
  if (!cfg.enabled || cfg.slots.length === 0) return off;
  const nowSec = dhakaDaySeconds(nowMs);
  let activeWindow: { startSec: number; endSec: number; endAbs: number } | null = null;
  let soonest: number | null = null;
  for (const slot of cfg.slots) {
    const startSec = parseClock(slot.start);
    const endSec = parseClock(slot.end);
    if (startSec === null || endSec === null) continue;
    const span = windowSpan(startSec, endSec);
    const inside =
      endSec > startSec
        ? nowSec >= startSec && nowSec < endSec
        : nowSec >= startSec || nowSec < endSec;
    if (inside) {
      const untilEnd = endSec > startSec ? endSec - nowSec : 86400 - nowSec + endSec;
      const candidate = {
        startSec,
        endSec,
        endAbs: nowMs + untilEnd * 1000,
      };
      // Two windows could overlap in a misconfigured doc — keep the one that
      // closes last, so the countdown never jumps backwards.
      if (!activeWindow || candidate.endAbs > activeWindow.endAbs) activeWindow = candidate;
      continue;
    }
    const startsIn = startSec >= nowSec ? startSec - nowSec : 86400 - nowSec + startSec;
    const atMs = nowMs + startsIn * 1000;
    if (soonest === null || atMs < soonest) soonest = atMs;
    void span;
  }
  if (activeWindow) {
    const msLeft = Math.max(0, activeWindow.endAbs - nowMs);
    const span = windowSpan(activeWindow.startSec, activeWindow.endSec) * 1000;
    return {
      active: true,
      endsAtMs: activeWindow.endAbs,
      msLeft,
      nextStartsAtMs: soonest,
      progress: span > 0 ? Math.min(1, Math.max(0, (span - msLeft) / span)) : 1,
    };
  }
  return { ...off, nextStartsAtMs: soonest };
};

/**
 * Unit price a customer pays right now: the flash price when it is live.
 *
 * `maxDiscountPaisa` is a PER-PIECE cap, and it is applied here as well as in
 * the cart math and `ps_place_order` — the number on the badge and the number
 * on the invoice must come from the same three lines of arithmetic, or an
 * expensive piece advertises a saving the shop never agreed to.
 */
export const unitFlashDiscount = (unitPrice: number, cfg: FlashConfig): number => {
  const raw = Math.floor((unitPrice * cfg.discountPct) / 100);
  return cfg.maxDiscountPaisa > 0 ? Math.min(raw, cfg.maxDiscountPaisa) : raw;
};

export const effectiveUnitPrice = (
  product: Product,
  cfg: FlashConfig,
  state: FlashState,
): { price: number; was: number | null; pct: number } => {
  if (!state.active || !isFlashProduct(cfg, product) || !product.inStock) {
    return { price: product.price, was: null, pct: 0 };
  }
  return {
    price: Math.max(0, product.price - unitFlashDiscount(product.price, cfg)),
    was: product.price,
    pct: cfg.discountPct,
  };
};

/** 01:04:59 — the string a countdown badge shows. */
export const countdownLabel = (msLeft: number): string => {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/* ------------------------------------------------------------------ */
/* Bundles — "Complete the Look" as a purchasable set                  */
/* ------------------------------------------------------------------ */

export interface BundleConfig {
  enabled: boolean;
  /** Merchandising name — "Eid Set", "Heritage Set"… */
  name: string;
  /** Percent off the sum of the parts (1–40; deeper eats the margin). */
  discountPct: number;
  /** Total pieces in a set, the anchor product included (2–5). */
  maxItems: number;
  /** Sets are only worth a rail when complements really exist. */
  minComplements: number;
}

export const BUNDLE_DEFAULTS: BundleConfig = {
  enabled: true,
  name: "Eid Set",
  discountPct: 10,
  maxItems: 4,
  minComplements: 1,
};

export const sanitizeBundle = (raw: unknown): BundleConfig => {
  const r = (raw ?? {}) as Partial<BundleConfig>;
  return {
    enabled:
      typeof r.enabled === "boolean" ? r.enabled : BUNDLE_DEFAULTS.enabled,
    name: text(r.name, BUNDLE_DEFAULTS.name, 40),
    discountPct: intIn(r.discountPct, BUNDLE_DEFAULTS.discountPct, 1, 40),
    maxItems: intIn(r.maxItems, BUNDLE_DEFAULTS.maxItems, 2, 5),
    minComplements: intIn(r.minComplements, BUNDLE_DEFAULTS.minComplements, 1, 3),
  };
};

export interface BundleLine {
  product: Product;
  qty: number;
  /** Flash-priced too? Bundles ride the list price — see `pickBestOffer`. */
  lineTotal: number;
}

export interface BundleOffer {
  id: string;
  name: string;
  tagline: string;
  lines: BundleLine[];
  listPrice: number;
  bundlePrice: number;
  discount: number;
  discountPct: number;
}

/**
 * The set a product belongs to: the anchor plus its complements from the
 * editorial pairing rules. Returns null when there is nothing to complete —
 * an empty "bundle" would be a discount for the same single item.
 */
export const buildBundleOffer = (
  anchor: Product,
  products: Product[],
  cfg: BundleConfig,
): BundleOffer | null => {
  if (!cfg.enabled || !isDiscoverable(anchor) || !anchor.inStock) return null;
  const complements = completeTheLook(anchor, products, Math.max(1, cfg.maxItems - 1));
  if (complements.length < cfg.minComplements) return null;
  const lines: BundleLine[] = [{ product: anchor, qty: 1, lineTotal: anchor.price }].concat(
    complements.map((p) => ({ product: p, qty: 1, lineTotal: p.price })),
  );
  const listPrice = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discount = Math.floor((listPrice * cfg.discountPct) / 100);
  if (discount <= 0) return null;
  const pieces = lines.map((l) => l.product.subCategory).join(" · ");
  return {
    id: `bundle-${anchor.id}`,
    name: `${cfg.name} — ${lines.length} pieces`,
    tagline: pieces,
    lines,
    listPrice,
    bundlePrice: listPrice - discount,
    discount,
    discountPct: cfg.discountPct,
  };
};

/** A cart line, reduced to what the bundle matcher needs. */
export interface CartLikeLine {
  product: Product;
  qty: number;
}

/**
 * Is a complete set in this bag? Any one anchor whose full complement list is
 * present counts, and the discount applies to those items only — a half-filled
 * set is just shopping, not a bundle.
 */
export const matchBundle = (
  lines: CartLikeLine[],
  products: Product[],
  cfg: BundleConfig,
): BundleOffer | null => {
  if (!cfg.enabled || lines.length === 0) return null;
  const qtyById = new Map<string, number>();
  for (const l of lines) qtyById.set(l.product.id, (qtyById.get(l.product.id) ?? 0) + l.qty);
  let best: BundleOffer | null = null;
  for (const l of lines) {
    const offer = buildBundleOffer(l.product, products, cfg);
    if (!offer) continue;
    const complete = offer.lines.every((need) => (qtyById.get(need.product.id) ?? 0) >= need.qty);
    if (!complete) continue;
    if (!best || offer.discount > best.discount) best = offer;
  }
  return best;
};

/* ------------------------------------------------------------------ */
/* One automatic offer per order                                        */
/* ------------------------------------------------------------------ */

export type OfferKind = "flash" | "bundle" | "coupon";

export interface OfferCandidate {
  kind: OfferKind;
  label: string;
  discount: number; // paisa
}

export interface PickedOffer extends OfferCandidate {
  /** Paisa lost by NOT taking the runner-up — copy for "you saved extra". */
  alternatives: OfferKind[];
}

/**
 * The best single offer wins. Ties keep the order flash → bundle → coupon:
 * flash is time-boxed and must not silently lose to a code the customer
 * forgot to remove.
 */
export const pickBestOffer = (candidates: OfferCandidate[]): PickedOffer | null => {
  const usable = candidates.filter((c) => c.discount > 0);
  if (usable.length === 0) return null;
  const order: Record<OfferKind, number> = { flash: 0, bundle: 1, coupon: 2 };
  const sorted = [...usable].sort(
    (a, b) => b.discount - a.discount || order[a.kind] - order[b.kind],
  );
  const [best, ...rest] = sorted;
  return { ...best, alternatives: rest.map((r) => r.kind) };
};

/**
 * Flash discount for a priced cart: percent off each eligible line, then one
 * order-level cap. Never exceeds the eligible subtotal.
 */
export const flashDiscountForCart = (
  cfg: FlashConfig,
  state: FlashState,
  lines: { product: Product; qty: number; lineTotal: number }[],
): { discount: number; items: number; pct: number } => {
  if (!cfg.enabled || !state.active) return { discount: 0, items: 0, pct: 0 };
  let discount = 0;
  let items = 0;
  for (const l of lines) {
    if (!isFlashProduct(cfg, l.product)) continue;
    // Per-piece cap, same helper the badge uses — cart line ≡ badge × qty.
    discount += unitFlashDiscount(l.product.price, cfg) * l.qty;
    items += l.qty;
  }
  return { discount: Math.max(0, discount), items, pct: cfg.discountPct };
};

/* ------------------------------------------------------------------ */
/* The shared doc shape (site_settings['promos'])                       */
/* ------------------------------------------------------------------ */

export interface PromoConfig {
  flash: FlashConfig;
  bundle: BundleConfig;
}

export const PROMO_DEFAULTS: PromoConfig = {
  flash: FLASH_DEFAULTS,
  bundle: BUNDLE_DEFAULTS,
};

export const sanitizePromos = (raw: unknown): PromoConfig => {
  const r = (raw ?? {}) as Partial<PromoConfig>;
  return { flash: sanitizeFlash(r.flash), bundle: sanitizeBundle(r.bundle) };
};

/** Public payload — enough for the storefront, nothing staff-only. */
export interface PromoView {
  flash: {
    enabled: boolean;
    title: string;
    discountPct: number;
    slots: FlashSlot[];
    scope: FlashScope;
    productIds: string[];
    /** Shipped so the bag can quote the same capped number the shop charges. */
    maxDiscountPaisa: number;
    active: boolean;
    msLeft: number;
    endsAtMs: number | null;
    nextStartsAtMs: number | null;
    progress: number;
    asOf: number;
  };
  bundle: { enabled: boolean; name: string; discountPct: number; maxItems: number };
}

export const promoView = (cfg: PromoConfig, nowMs: number = Date.now()): PromoView => {
  const state = flashState(cfg.flash, nowMs);
  return {
    flash: {
      enabled: cfg.flash.enabled,
      title: cfg.flash.title,
      discountPct: cfg.flash.discountPct,
      slots: cfg.flash.slots,
      scope: cfg.flash.scope,
      productIds: cfg.flash.productIds,
      maxDiscountPaisa: cfg.flash.maxDiscountPaisa,
      active: state.active,
      msLeft: state.msLeft,
      endsAtMs: state.endsAtMs,
      nextStartsAtMs: state.nextStartsAtMs,
      progress: state.progress,
      asOf: nowMs,
    },
    bundle: {
      enabled: cfg.bundle.enabled,
      name: cfg.bundle.name,
      discountPct: cfg.bundle.discountPct,
      maxItems: cfg.bundle.maxItems,
    },
  };
};

/** Products a shopper can buy in the running drop, in merchandising order. */
export const flashProducts = (products: Product[], cfg: FlashConfig): Product[] =>
  products.filter((p) => p.inStock && isFlashProduct(cfg, p));
