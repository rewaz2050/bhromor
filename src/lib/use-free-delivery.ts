"use client";

/**
 * Free delivery threshold for shopper surfaces (2026-09-26).
 *
 * Combines the PLATFORM rule (public ops settings) with the SHOP rule on the
 * live shop row, through the same pure helpers the order validator and
 * `ps_place_order` mirror — the bag's bar, the PDP pill and the checkout
 * quote all agree, because none of them does its own arithmetic.
 */

import { useMemo } from "react";
import type { Shop } from "./catalog";
import {
  freeDeliveryFor,
  freeDeliveryOffers,
  freeDeliveryProgress,
  freeDeliveryTarget,
  type FreeDeliveryContext,
  type FreeDeliveryOffer,
  type FreeDeliveryProgress,
} from "./free-delivery";
import { usePublicSettings } from "./use-public-settings";
import type { Language } from "./translations";
import { bnDigits } from "./arrival";
import { formatBdt } from "./format";

export interface FreeDeliveryView {
  /** Every armed rule for this shop (platform first). Empty = nothing armed. */
  offers: FreeDeliveryOffer[];
  /** The nearest minimum, paisa, or null. */
  target: number | null;
  /** Progress of `subtotal` towards it, or null when nothing applies. */
  progress: FreeDeliveryProgress | null;
  /** The rule that pays at this subtotal, or null. */
  applies: FreeDeliveryOffer | null;
}

/**
 * @param shop   the bag's (or product's) shop — undefined while loading
 * @param subtotal item subtotal in paisa
 */
export function useFreeDelivery(
  shop: Pick<Shop, "freeDeliveryMinPaisa"> | null | undefined,
  subtotal: number,
  ctx: FreeDeliveryContext = {},
): FreeDeliveryView {
  const { settings } = usePublicSettings();
  const rule = settings.freeDelivery;
  const shopMin = shop?.freeDeliveryMinPaisa ?? null;
  const { courier, pickup, alreadyFree } = ctx;
  return useMemo(() => {
    const offers = freeDeliveryOffers(rule, { freeDeliveryMinPaisa: shopMin });
    const context = { courier, pickup, alreadyFree };
    return {
      offers,
      target: freeDeliveryTarget(offers),
      progress: freeDeliveryProgress(subtotal, offers, context),
      applies: freeDeliveryFor(subtotal, offers, context),
    };
  }, [rule, shopMin, subtotal, courier, pickup, alreadyFree]);
}

/** "৳999" in the shopper's digits. */
export const freeDeliveryAmount = (paisa: number, lang: Language): string =>
  lang === "bn" ? bnDigits(formatBdt(paisa)) : formatBdt(paisa);
