"use client";

/**
 * The React face of the promo store (see `promo-store.ts` for the state
 * itself and for why it lives outside this "use client" module).
 *
 * Every hook here reads the SHARED store, so the site strip, the campaign
 * landing, the product cards and the bag all quote the same price from the
 * same window — and, since the flicker pass, they all agree from the first
 * paint, because the server seeded the store before any of them rendered.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { afterFirstPaint } from "./defer";
import type { Product } from "./catalog";
import { effectiveUnitPrice, type FlashState } from "./promos";
import {
  ensurePromosIfNeeded,
  flashConfigOf,
  getCampaignSnapshot,
  getCampaignSnapshotServer,
  getFlashPhase,
  getFlashPhaseServer,
  getPromoSnapshot,
  getPromoSnapshotServer,
  isPromoChecked,
  isPromoLive,
  subscribeFlashPhase,
  subscribePromos,
} from "./promo-store";

export * from "./promo-store";

/**
 * Promo view + the current flash phase. Re-renders when the backend view
 * changes or a window opens/closes — never on the clock alone.
 */
export function usePromos() {
  const promos = useSyncExternalStore(subscribePromos, getPromoSnapshot, getPromoSnapshotServer);
  const flash = useSyncExternalStore(subscribeFlashPhase, getFlashPhase, getFlashPhaseServer);
  // The server seeded the store on this page; when it did not (a client-side
  // navigation into a surface the layout did not seed) this is the read that
  // fills it — after the first paint, never competing with it.
  const cfg = useMemo(() => flashConfigOf(promos), [promos]);
  useEffect(() => afterFirstPaint(() => void ensurePromosIfNeeded()), []);
  return { promos, cfg, ready: isPromoChecked(), live: isPromoLive(), flash };
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
  useEffect(() => afterFirstPaint(() => void ensurePromosIfNeeded()), []);
  return { campaign: snap, ready: isPromoChecked(), live: isPromoLive() };
}
