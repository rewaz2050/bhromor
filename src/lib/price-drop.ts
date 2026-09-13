/**
 * Price drop alerts (P0 #5) — "the gamcha in your wishlist got ৳50 cheaper".
 *
 * Wishlist + a silent price change is the whole feature; foodpanda has no
 * wishlist at all, which is exactly why this converts here: the shopper who
 * hesitated over price last week is the cheapest customer to win back.
 *
 * Two layers, deliberately:
 *   1. Device-local price memory (works for guests, no account, no email).
 *      We store the price the shopper last saw on THIS device and compare on
 *      every load, so the claim is always true and never a marketing anchor:
 *      "৳X less than the last price you saw" — not "was ৳1,999".
 *   2. An optional phone-number watch (POST /api/price-watch) so the shop can
 *      call/WhatsApp the shopper when the price moves. There is no email/SMS
 *      sender wired at launch, so we promise a person, not a robot.
 *
 * Money is integer paisa (§69).
 */

import type { Product } from "./catalog";
import { formatBdt } from "./format";
import { isPlausibleBdPhone, normalizeBdPhone } from "./phone";

export const PRICE_SNAPSHOT_KEY = "prosanti.price-snapshots.v1";
export const PRICE_ALERT_KEY = "prosanti.price-alerts.v1";

export interface PriceSnapshot {
  /** Paisa, as it stood when the shopper last saw the product. */
  price: number;
  /** Epoch ms of that reading. */
  at: number;
}

export type PriceSnapshots = Record<string, PriceSnapshot>;

export interface PriceDrop {
  productId: string;
  slug: string;
  name: string;
  was: number;
  now: number;
  /** Paisa off versus the price this device last saw. */
  down: number;
  /** 0–100 percent off. */
  pct: number;
  /** Days since the price was remembered. */
  days: number;
  sinceLabel: string;
}

/* ------------------------------------------------------------------ */
/* Pure maths                                                          */
/* ------------------------------------------------------------------ */

export const sanitizeSnapshots = (raw: unknown): PriceSnapshots => {
  if (!raw || typeof raw !== "object") return {};
  const out: PriceSnapshots = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = (value ?? {}) as Partial<PriceSnapshot>;
    const price = typeof v.price === "number" && Number.isFinite(v.price) && v.price >= 0 ? Math.floor(v.price) : null;
    const at = typeof v.at === "number" && Number.isFinite(v.at) ? Math.floor(v.at) : null;
    if (price === null || at === null || id.length > 64) continue;
    out[id.slice(0, 64)] = { price, at };
  }
  return out;
};

/**
 * A price RISE is not a drop: we keep the old memory untouched so a temporary
 * edit cannot erase the real "cheaper than before" claim.
 */
export const dropFor = (
  product: Product,
  snapshots: PriceSnapshots,
  now: number = Date.now(),
): PriceDrop | null => {
  const saved = snapshots[product.id];
  if (!saved || !(product.price > 0) || product.price >= saved.price) return null;
  const down = saved.price - product.price;
  const days = Math.max(0, Math.floor((now - saved.at) / 86_400_000));
  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    was: saved.price,
    now: product.price,
    down,
    pct: Math.round((down / saved.price) * 100),
    days,
    sinceLabel:
      days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`,
  };
};

export const dropsFor = (
  products: Product[],
  snapshots: PriceSnapshots,
  now: number = Date.now(),
): Map<string, PriceDrop> => {
  const map = new Map<string, PriceDrop>();
  for (const p of products) {
    const drop = dropFor(p, snapshots, now);
    if (drop) map.set(p.id, drop);
  }
  return map;
};

export const dropLabel = (drop: PriceDrop): string =>
  `${formatBdt(drop.down)} less than the last price you saw`;

/* ------------------------------------------------------------------ */
/* Device-local storage                                                */
/* ------------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshotsCache: PriceSnapshots | null = null;
let alertsCache: string[] | null = null;

const notify = () => {
  for (const l of listeners) l();
};

const readJson = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const loadSnapshots = (): PriceSnapshots => {
  if (snapshotsCache === null) snapshotsCache = sanitizeSnapshots(readJson(PRICE_SNAPSHOT_KEY, {}));
  return snapshotsCache;
};

const loadAlerts = (): string[] => {
  if (alertsCache === null) {
    const raw = readJson(PRICE_ALERT_KEY, [] as unknown[]);
    alertsCache = Array.isArray(raw)
      ? [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length <= 64))]
      : [];
  }
  return alertsCache;
};

/**
 * Records what the shopper is looking at right now. Writing it on a rise too
 * (not only on a fall) is what keeps the promise honest: the comparison is
 * against the price THIS device last saw, which is the only number we can
 * actually stand behind.
 */
export const recordPrice = (productId: string, price: number, at: number = Date.now()): void => {
  if (!productId || !Number.isFinite(price) || price < 0) return;
  const snapshots = loadSnapshots();
  if (snapshots[productId]?.price === price) return;
  snapshotsCache = { ...snapshots, [productId]: { price: Math.floor(price), at } };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PRICE_SNAPSHOT_KEY, JSON.stringify(snapshotsCache));
    } catch {
      /* storage unavailable — comparisons continue in memory */
    }
  }
  notify();
};

/**
 * The shopper acknowledged the drop: store today's price so the notice stops.
 * Without this the line would either nag forever or vanish on the next paint —
 * both are worse than a button that says "I saw it".
 */
export const markPriceSeen = (productId: string, price: number): void => {
  recordPrice(productId, price);
};

export const forgetPrice = (productId: string): void => {
  const snapshots = loadSnapshots();
  if (!(productId in snapshots)) return;
  const next = { ...snapshots };
  delete next[productId];
  snapshotsCache = next;
  try {
    window.localStorage.setItem(PRICE_SNAPSHOT_KEY, JSON.stringify(snapshotsCache));
  } catch {
    /* ignore */
  }
  notify();
};

export const getPriceSnapshots = (): PriceSnapshots => loadSnapshots();
/** Stable empty reference for the server render (localStorage has no SSR). */
const EMPTY_SNAPSHOTS: PriceSnapshots = {};
export const getPriceSnapshotsServer = (): PriceSnapshots => EMPTY_SNAPSHOTS;

export const getAlerts = (): string[] => loadAlerts();
const EMPTY_ALERTS: string[] = [];
export const getAlertsServer = (): string[] => EMPTY_ALERTS;

export const togglePriceAlert = (productId: string): boolean => {
  const list = loadAlerts();
  const next = list.includes(productId)
    ? list.filter((id) => id !== productId)
    : [...list, productId];
  alertsCache = next;
  try {
    window.localStorage.setItem(PRICE_ALERT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  notify();
  return next.includes(productId);
};

export const subscribePriceWatch = (listener: Listener): (() => void) => {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (
        event.key !== null &&
        event.key !== PRICE_SNAPSHOT_KEY &&
        event.key !== PRICE_ALERT_KEY
      ) {
        return;
      }
      snapshotsCache = null;
      alertsCache = null;
      notify();
    });
  }
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only cache reset. */
export const __resetPriceWatch = (): void => {
  snapshotsCache = null;
  alertsCache = null;
};

/* ------------------------------------------------------------------ */
/* Server-side watch (phone-remembered, staff calls when it drops)      */
/* ------------------------------------------------------------------ */

export interface WatchInput {
  productId: string;
  phone: string;
  /** Optional maximum the shopper would pay — the shop's buying signal. */
  targetPaisa?: number;
}

export interface WatchValidation {
  ok: boolean;
  errors: Partial<Record<keyof WatchInput, string>>;
  value: WatchInput;
}

export const validateWatch = (raw: unknown): WatchValidation => {
  const b = (raw ?? {}) as Record<string, unknown>;
  const productId = typeof b.productId === "string" ? b.productId.trim().slice(0, 64) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 24) : "";
  const targetRaw =
    typeof b.targetPaisa === "number" && Number.isFinite(b.targetPaisa)
      ? Math.max(0, Math.floor(b.targetPaisa))
      : undefined;
  const errors: WatchValidation["errors"] = {};
  if (productId.length < 1) errors.productId = "Which product is this about?";
  if (!isPlausibleBdPhone(phone)) errors.phone = "Give a mobile number we can reach.";
  if (targetRaw !== undefined && (targetRaw < 100 || targetRaw > 1_000_000)) {
    errors.targetPaisa = "That target looks off — try a number between ৳1 and ৳10,000.";
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      productId,
      phone: phone === "" ? "" : normalizeBdPhone(phone),
      ...(targetRaw !== undefined ? { targetPaisa: targetRaw } : {}),
    },
  };
};

/** Staff-facing line for the notification bell when a watched price moves. */
export const watchNotice = (
  productName: string,
  watchers: number,
  was: number,
  now: number,
): string =>
  `${productName} dropped ${formatBdt(was - now)} (${formatBdt(was)} → ${formatBdt(now)}) — ${watchers} ${watchers === 1 ? "shopper wants" : "shoppers want"} a heads-up`;
