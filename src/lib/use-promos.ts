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

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { afterFirstPaint } from "./defer";
import type { Product } from "./catalog";
import {
  PROMO_DEFAULTS,
  effectiveUnitPrice,
  flashState,
  promoView,
  type FlashState,
  type PromoView,
} from "./promos";
import { CAMPAIGN_DEFAULTS, campaignView, type CampaignView } from "./campaign";

type Listener = () => void;

/** Nothing is running until the backend says otherwise. */
export const OFFLINE_PROMOS: PromoView = promoView(PROMO_DEFAULTS, 0);
export const OFFLINE_CAMPAIGN: CampaignView = campaignView(CAMPAIGN_DEFAULTS, 0);

let view: PromoView = OFFLINE_PROMOS;
let campaign: CampaignView = OFFLINE_CAMPAIGN;
let checked = false;
let live = false;
let promise: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
  syncPhase();
};

const scheduleRefresh = () => {
  if (typeof setTimeout === "undefined") return;
  if (timer) clearTimeout(timer);
  const now = Date.now();
  const when: number[] = [];
  if (view.flash.active && view.flash.endsAtMs) when.push(view.flash.endsAtMs + 800);
  if (view.flash.nextStartsAtMs) when.push(view.flash.nextStartsAtMs + 400);
  // P2 #20 — the campaign strip must also flip on its own, at the minute
  // the window opens (teaser→live) and the minute the last day ends.
  if (campaign.startsAtMs && campaign.startsAtMs > now) when.push(campaign.startsAtMs + 400);
  if (campaign.state === "live" && campaign.endsAtMs) when.push(campaign.endsAtMs + 800);
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
      const data = (await res.json()) as {
        source?: string;
        promos?: PromoView;
        campaign?: CampaignView;
      };
      if (data.promos) {
        view = data.promos;
        live = data.source === "live";
      }
      if (data.campaign) campaign = data.campaign;
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
export const getCampaignSnapshot = (): CampaignView => campaign;
export const getCampaignSnapshotServer = (): CampaignView => OFFLINE_CAMPAIGN;
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
 * Flash *phase* — the slice of the clock that can change a price: is a window
 * open, when does it close, when does the next one open. One module-level
 * check runs once a second (only while something is subscribed) and notifies
 * ONLY when that slice changes.
 *
 * Perf (scroll audit 2026-09-27): the previous `useTicker` put a 1 s
 * `setState(Date.now())` into EVERY component that quoted a price — with 24
 * to 100 product cards on a listing that was a React re-render of the whole
 * grid every second, a visible hitch while scrolling on phones. Now a grid
 * re-renders at 19:00:00 and at 21:00:00, not sixty times a minute. Countdown
 * digits live in `FlashTimer`/`FlashCountup`, which tick on their own.
 *
 * `msLeft`/`progress` on the snapshot are frozen at the last phase change —
 * anything that needs a live clock reads `useNow()` (see FlashProgress).
 */
const OFFLINE_FLASH: FlashState = flashState(flashConfigOf(OFFLINE_PROMOS), 0);
let phase: FlashState = OFFLINE_FLASH;
const phaseListeners = new Set<Listener>();
let phaseTimer: ReturnType<typeof setInterval> | null = null;

const samePhase = (a: FlashState, b: FlashState): boolean =>
  a.active === b.active && a.endsAtMs === b.endsAtMs && a.nextStartsAtMs === b.nextStartsAtMs;

const syncPhase = (): void => {
  const next = flashState(flashConfigOf(view), Date.now());
  if (samePhase(phase, next)) return;
  phase = next;
  for (const l of phaseListeners) l();
};

export const getFlashPhase = (): FlashState => phase;
export const getFlashPhaseServer = (): FlashState => OFFLINE_FLASH;

export const subscribeFlashPhase = (listener: Listener): (() => void) => {
  phaseListeners.add(listener);
  if (phaseTimer === null && typeof setInterval !== "undefined") {
    phaseTimer = setInterval(syncPhase, 1000);
  }
  // A component mounting after the timer went idle must not read a stale
  // window — refresh once, synchronously (notifies only on a real change).
  syncPhase();
  return () => {
    phaseListeners.delete(listener);
    if (phaseListeners.size === 0 && phaseTimer !== null) {
      clearInterval(phaseTimer);
      phaseTimer = null;
    }
  };
};

/**
 * Promo view + the current flash phase. Re-renders when the backend view
 * changes or a window opens/closes — never on the clock alone.
 */
export function usePromos() {
  const promos = useSyncExternalStore(subscribePromos, getPromoSnapshot, getPromoSnapshotServer);
  const flash = useSyncExternalStore(subscribeFlashPhase, getFlashPhase, getFlashPhaseServer);
  useEffect(() => afterFirstPaint(() => void load()), []);
  const cfg = useMemo(() => flashConfigOf(promos), [promos]);
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

/**
 * P2 #20 — the campaign landing state, shared through the same store so the
 * site strip, the /campaign page and the schedule-refresh all agree, and all
 * of them flip at the same moment the backend's clock does.
 */
export function useCampaign() {
  const snap = useSyncExternalStore(
    subscribePromos,
    getCampaignSnapshot,
    getCampaignSnapshotServer,
  );
  useEffect(() => afterFirstPaint(() => void load()), []);
  return { campaign: snap, ready: checked, live };
}

/** Test-only: drop the shared cache. */
export const __resetPromos = (): void => {
  view = OFFLINE_PROMOS;
  campaign = OFFLINE_CAMPAIGN;
  checked = false;
  live = false;
  promise = null;
  if (timer) clearTimeout(timer);
  timer = null;
  phase = OFFLINE_FLASH;
};
