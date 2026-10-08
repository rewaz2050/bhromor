/**
 * Live promo + campaign state — one shared fetch behind
 * `useSyncExternalStore`, the way the live catalog works.
 *
 * Server-seeded (flicker pass 2026-10-07). The storefront layout reads the
 * ops document on the server and hands it to this store BEFORE the first
 * render, so the flash bar, the campaign strip and — the one that really
 * matters — the flash PRICE on every product card are in the first paint.
 *
 * Before this the server painted "nothing is running" (getServerSnapshot
 * returned the offline view) and the client corrected it after /api/promo
 * answered: the page jumped down by the height of the strips, and every
 * price on a listing changed under the shopper's thumb a beat after they
 * started reading it. A price that moves on its own is worse than no
 * discount.
 *
 * The store still refreshes itself at the moments that matter: when a
 * countdown reaches zero and when the next scheduled window opens. A
 * shopper who leaves a product page open at 18:59 sees the 19:00 drop
 * appear without reloading, and one watching a drop close sees the price
 * go back — a badge that lies about a price is worse than no badge.
 *
 * NOTE: this module carries no "use client" on purpose. The storefront
 * layout is a server component and must be able to seed it; an export from
 * a "use client" file is a client reference on the server, not a value.
 */

import {
  PROMO_DEFAULTS,
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

/** The shop's flash rules as a FlashConfig (the public view is a subset). */
export const flashConfigOf = (promos: PromoView) => ({
  ...PROMO_DEFAULTS.flash,
  ...promos.flash,
});


/**
 * What the server handed us. `getServerSnapshot` must return a STABLE value
 * — React calls it during server rendering and again for every hydration
 * render, and recomputing it from the clock would make the two disagree.
 */
export interface PromoSeed {
  promos: PromoView;
  campaign: CampaignView;
  live: boolean;
}

let view: PromoView = OFFLINE_PROMOS;
let campaign: CampaignView = OFFLINE_CAMPAIGN;
let checked = false;
let live = false;
/** Seeded by the server render — see `seedPromos`. */
let seeded = false;
let promise: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

/* The frozen first-paint pair. Written once per seed, never recomputed. */
let serverView: PromoView = OFFLINE_PROMOS;
let serverCampaign: CampaignView = OFFLINE_CAMPAIGN;
let serverPhase: FlashState = flashState(flashConfigOf(OFFLINE_PROMOS), 0);

/* The live phase the ticker keeps current — see `subscribeFlashPhase`. */
let phase: FlashState = serverPhase;
const phaseListeners = new Set<Listener>();
let phaseTimer: ReturnType<typeof setInterval> | null = null;


const notify = () => {
  for (const l of listeners) l();
  syncPhase();
};

/** Wakes consumers that mounted before a seed arrived (RSC refresh). */
export const notifyPromos = (): void => notify();

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
    void load(true);
  }, delay);
};

/**
 * Kick off the refresh schedule without re-reading what the server just
 * told us. Used when the page was seeded: the answer is at most one CDN
 * minute old — the same window /api/promo itself is cached for.
 */
export const schedulePromoRefresh = (): void => {
  checked = true;
  scheduleRefresh();
};

const load = async (force = false): Promise<void> => {
  if (promise) return promise;
  // The server already answered this request; re-asking in the same breath
  // is the round trip this pass set out to remove.
  if (seeded && !force) {
    schedulePromoRefresh();
    return Promise.resolve();
  }
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

/**
 * Hand the store what the server already read. Called during render by
 * `PromoBoot`, so every consumer below it — including this render pass —
 * sees the same answer the server did.
 */
export const seedPromos = (seed: PromoSeed): void => {
  view = seed.promos;
  campaign = seed.campaign;
  serverView = seed.promos;
  serverCampaign = seed.campaign;
  serverPhase = flashState(flashConfigOf(seed.promos), seed.promos.flash.asOf);
  phase = serverPhase;
  live = seed.live;
  checked = true;
  seeded = true;
};

export const getPromoSnapshot = (): PromoView => view;
export const getPromoSnapshotServer = (): PromoView => serverView;
export const getCampaignSnapshot = (): CampaignView => campaign;
export const getCampaignSnapshotServer = (): CampaignView => serverCampaign;
export const isPromoChecked = (): boolean => checked;
export const isPromoLive = (): boolean => live;
export const isPromoSeeded = (): boolean => seeded;

/**
 * The clock the seeded view was computed at — the shop's own deadline math,
 * frozen. Countdowns seed their first frame from this so the server's
 * "01:23:45" and the client's are the same string; the ticker takes over the
 * moment the page is live.
 */
export const promoNowMs = (): number | null =>
  Number.isFinite(serverView?.flash?.asOf) && serverView.flash.asOf > 0
    ? serverView.flash.asOf
    : null;

export const subscribePromos = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** `force` re-reads even when the server already seeded this page. */
export const ensurePromos = (force = true): Promise<void> => load(force);

/**
 * The after-paint read: re-read only when the server did not seed this page.
 * A seeded page just arms the boundary timers (see `schedulePromoRefresh`).
 */
export const ensurePromosIfNeeded = (): Promise<void> => load(false);

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
const samePhase = (a: FlashState, b: FlashState): boolean =>
  a.active === b.active && a.endsAtMs === b.endsAtMs && a.nextStartsAtMs === b.nextStartsAtMs;

const syncPhase = (): void => {
  const next = flashState(flashConfigOf(view), Date.now());
  if (samePhase(phase, next)) return;
  phase = next;
  for (const l of phaseListeners) l();
};

export const getFlashPhase = (): FlashState => phase;
export const getFlashPhaseServer = (): FlashState => serverPhase;

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

/** Test-only: drop the shared cache. */
export const __resetPromos = (): void => {
  view = OFFLINE_PROMOS;
  campaign = OFFLINE_CAMPAIGN;
  serverView = OFFLINE_PROMOS;
  serverCampaign = OFFLINE_CAMPAIGN;
  serverPhase = flashState(flashConfigOf(OFFLINE_PROMOS), 0);
  phase = serverPhase;
  checked = false;
  live = false;
  seeded = false;
  promise = null;
  if (timer) clearTimeout(timer);
  timer = null;
};
