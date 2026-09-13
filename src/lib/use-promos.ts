"use client";

/**
 * Live promo state for the storefront — one shared fetch behind
 * `useSyncExternalStore`, the way the live catalog works.
 *
 * The store refreshes itself at the moments that matter: when a countdown
 * reaches zero and when the next scheduled window opens. A shopper who leaves
 * a product page open at 18:59 sees the 19:00 drop appear without reloading,
 * and one watching a drop close sees the price go back — a badge that lies
 * about a price is worse than no badge.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Product } from "./catalog";
import {
  PROMO_DEFAULTS,
  effectiveUnitPrice,
  flashState,
  promoView,
  type FlashState,
  type PromoView,
} from "./promos";

type Listener = () => void;

/** Nothing is running until the backend says otherwise. */
export const OFFLINE_PROMOS: PromoView = promoView(PROMO_DEFAULTS, 0);

let view: PromoView = OFFLINE_PROMOS;
let checked = false;
let live = false;
let promise: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const scheduleRefresh = () => {
  if (typeof setTimeout === "undefined") return;
  if (timer) clearTimeout(timer);
  const now = Date.now();
  const when: number[] = [];
  if (view.flash.active && view.flash.endsAtMs) when.push(view.flash.endsAtMs + 800);
  if (view.flash.nextStartsAtMs) when.push(view.flash.nextStartsAtMs + 400);
  if (when.length === 0) return;
  const delay = Math.max(1000, Math.min(...when) - now);
  timer = setTimeout(() => {
    promise = null; // stale by definition — force a re-read
    void load();
  }, delay);
};

const load = async (): Promise<void> => {
  if (promise) return promise;
  promise = (async () => {
    try {
      const res = await fetch("/api/promo", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { source?: string; promos?: PromoView };
      if (data.promos) {
        view = data.promos;
        live = data.source === "live";
      }
    } catch {
      // Fail closed: no badge, no flash price, catalog prices everywhere.
    } finally {
      checked = true;
      notify();
      scheduleRefresh();
    }
  })();
  return promise;
};

export const getPromoSnapshot = (): PromoView => view;
export const getPromoSnapshotServer = (): PromoView => OFFLINE_PROMOS;
export const isPromoChecked = (): boolean => checked;

export const subscribePromos = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const ensurePromos = (): Promise<void> => load();

/** The shop's flash rules as a FlashConfig (the public view is a subset). */
export const flashConfigOf = (promos: PromoView) => ({
  ...PROMO_DEFAULTS.flash,
  ...promos.flash,
});

/**
 * One shared 1s ticker for every countdown on the page: a window opening or
 * closing must move without a reload, and each component must not own its own
 * interval. The clock is read inside the effect, never during render — a
 * component that calls Date.now() while rendering cannot hydrate honestly.
 */
const tickers = new Set<() => void>();
let tickerId: ReturnType<typeof setInterval> | null = null;

const useTicker = (): number | null => {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tickers.add(tick);
    if (typeof setInterval !== "undefined" && tickerId === null) {
      tickerId = setInterval(() => {
        for (const fn of tickers) fn();
      }, 1000);
    }
    return () => {
      tickers.delete(tick);
      if (tickers.size === 0 && tickerId !== null) {
        clearInterval(tickerId);
        tickerId = null;
      }
    };
  }, []);
  return now;
};

/** Countdown numbers are wall-clock, so callers re-render themselves. */
export function usePromos() {
  const promos = useSyncExternalStore(subscribePromos, getPromoSnapshot, getPromoSnapshotServer);
  const now = useTicker();
  useEffect(() => {
    void load();
  }, []);
  const cfg = useMemo(() => flashConfigOf(promos), [promos]);
  // `null` = first paint: same "nothing is running" the server rendered. The
  // live view replaces it as soon as the promo store answers.
  const stateMs = now ?? promos.flash.asOf;
  const flash = useMemo(() => flashState(cfg, stateMs), [cfg, stateMs]);
  return { promos, cfg, ready: checked, live, flash };
}

/**
 * The price a shopper is quoted for this product right now — never higher than
 * the catalog price, and only while the window runs. The checkout recomputes
 * the same number from the same settings.
 */
export function useFlashPrice(
  product: Product,
): { price: number; was: number | null; pct: number; state: FlashState } {
  const { cfg, flash } = usePromos();
  const priced = useMemo(() => effectiveUnitPrice(product, cfg, flash), [product, cfg, flash]);
  return { ...priced, state: flash };
}

/** Test-only: drop the shared cache. */
export const __resetPromos = (): void => {
  view = OFFLINE_PROMOS;
  checked = false;
  live = false;
  promise = null;
  if (timer) clearTimeout(timer);
  timer = null;
};
