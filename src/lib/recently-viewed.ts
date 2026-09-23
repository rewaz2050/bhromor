/**
 * Recently viewed (device-local) — "the shirt I looked at yesterday".
 *
 * A shopper who leaves a product page and comes back a day later should
 * find it in one tap: on the homepage and under every other product page.
 * Nothing leaves the device — a small list of product ids + timestamps in
 * localStorage (guests included, no account needed), resolved against the
 * LIVE catalog at render time so a piece that went off sale simply drops
 * out of the rail.
 */

import type { Product } from "./catalog";
import { isDiscoverable } from "./merchandising";

export const RECENTLY_VIEWED_KEY = "prosanti.recently-viewed.v1";
/** How many ids we keep; the rails show fewer. */
export const RECENTLY_VIEWED_MAX = 12;
/** Entries older than this fall out — a month-old view is not "recent". */
export const RECENTLY_VIEWED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ViewedEntry {
  id: string;
  /** Epoch ms of the last view. */
  at: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: ViewedEntry[] | null = null;
const EMPTY: ViewedEntry[] = [];

const notify = () => {
  for (const fn of listeners) fn();
};

/** Drop malformed / stale rows, dedupe, newest first, capped. */
export const sanitizeViewed = (raw: unknown, now: number = Date.now()): ViewedEntry[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ViewedEntry[] = [];
  for (const item of raw) {
    const v = (item ?? {}) as Partial<ViewedEntry>;
    if (typeof v.id !== "string" || v.id.trim() === "") continue;
    if (typeof v.at !== "number" || !Number.isFinite(v.at)) continue;
    if (now - v.at > RECENTLY_VIEWED_TTL_MS) continue;
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    out.push({ id: v.id, at: Math.floor(v.at) });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, RECENTLY_VIEWED_MAX);
};

const load = (): ViewedEntry[] => {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
    cache = raw ? sanitizeViewed(JSON.parse(raw)) : [];
  } catch {
    cache = [];
  }
  return cache;
};

const persist = (next: ViewedEntry[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — the list still works for this page's lifetime */
    }
  }
  notify();
};

/** The product page calls this once per view. */
export const recordView = (productId: string, at: number = Date.now()): void => {
  if (!productId) return;
  const rest = load().filter((e) => e.id !== productId);
  persist(sanitizeViewed([{ id: productId, at }, ...rest], at));
};

export const forgetViews = (): void => persist([]);

export const getViewed = (): ViewedEntry[] => load();
export const getViewedServer = (): ViewedEntry[] => EMPTY;

export const subscribeViewed = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Resolve the stored ids against the serving catalog: newest first, only
 * pieces that are still discoverable, never the product being looked at.
 */
export const recentlyViewedProducts = (
  entries: ViewedEntry[],
  products: Product[],
  opts: { exclude?: string; limit?: number } = {},
): Product[] => {
  const limit = opts.limit ?? 8;
  const byId = new Map(products.map((p) => [p.id, p] as const));
  const out: Product[] = [];
  for (const e of entries) {
    if (e.id === opts.exclude) continue;
    const p = byId.get(e.id);
    if (!p || !isDiscoverable(p)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
};

/** Test-only cache reset. */
export const __resetRecentlyViewed = (): void => {
  cache = null;
};
