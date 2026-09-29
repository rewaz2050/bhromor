"use client";

/**
 * What this bag has already earned — the flash drop or the set discount,
 * whichever is better.
 *
 * The cart, the drawer, the checkout and `validateOrderPayload` all go through
 * `useBagOffer` / the same matchers (`flashDiscountForCart`, `matchBundle`,
 * `pickBestOffer`), so the "you saved" line a shopper sees while browsing is
 * produced by the same rules that price the order. A promise checkout then
 * refuses to honour is the fastest way to lose a customer, so there is
 * deliberately no arithmetic in the components themselves to drift.
 */

import { useMemo } from "react";
import type { Product } from "@/lib/catalog";
import { BUNDLE_DEFAULTS, flashDiscountForCart, matchBundle, type BundleOffer } from "./promos";
import { useLiveCatalog } from "./use-live-catalog";
import { usePromos } from "./use-promos";

export interface OfferLine {
  product: Product;
  qty: number;
  lineTotal: number;
}

export interface BagOffer {
  kind: "flash" | "bundle";
  label: string;
  discount: number;
  /** How many pieces the drop covers (flash) — scarcity copy. */
  items: number;
  pct: number;
  /** The set itself, when a complete one is in the bag. */
  set: BundleOffer | null;
}

/**
 * The one automatic offer this bag earns, in paisa. Returns null when the bag
 * earns nothing, so callers never render an empty saving.
 */
export interface BagOfferInputs {
  products: Product[];
  cfg: ReturnType<typeof usePromos>["cfg"];
  flash: ReturnType<typeof usePromos>["flash"];
  bundleCfg: typeof BUNDLE_DEFAULTS;
}

/**
 * The one automatic offer a set of lines earns — pure, so the SAME rule prices
 * the whole bag (one shop) and each shop's parcel in a split checkout (C2).
 * That matters: a "complete set" spanning two shops is not a set any single
 * shop can honour, so it must never be quoted.
 */
export const pickBagOffer = (lines: OfferLine[], inputs: BagOfferInputs): BagOffer | null => {
  const { products, cfg, flash, bundleCfg } = inputs;
  if (lines.length === 0) return null;
  const flashOffer = flashDiscountForCart(cfg, flash, lines);
  const set = matchBundle(
    lines.map((l) => ({ product: l.product, qty: l.qty })),
    products,
    bundleCfg,
  );
  const flashWins = flashOffer.discount >= (set?.discount ?? 0);
  if (flashWins && flashOffer.discount > 0) {
    return {
      kind: "flash",
      label: cfg.title || "Flash Drop",
      discount: flashOffer.discount,
      items: flashOffer.items,
      pct: flashOffer.pct,
      set,
    };
  }
  if (set) {
    return {
      kind: "bundle",
      label: set.name,
      discount: set.discount,
      items: set.lines.length,
      pct: set.discountPct,
      set,
    };
  }
  return null;
};

export function useBagOffer(lines: OfferLine[]): BagOffer | null {
  const { products } = useLiveCatalog();
  const { cfg, promos, flash } = usePromos();
  const bundleCfg = useMemo(
    () => ({ ...BUNDLE_DEFAULTS, ...promos.bundle }),
    [promos.bundle],
  );

  return useMemo(
    () => pickBagOffer(lines, { products, cfg, flash, bundleCfg }),
    [lines, products, cfg, flash, bundleCfg],
  );
}

/**
 * C2 — the offer each shop's parcel earns, priced with the same rules the
 * server applies per order. One hook, one pass: a split checkout must not
 * promise a discount that no single shop's order can carry.
 */
export function useBagOffersByShop(
  groups: readonly { shopId: string; lines: OfferLine[] }[],
): Record<string, BagOffer | null> {
  const { products } = useLiveCatalog();
  const { cfg, promos, flash } = usePromos();
  const bundleCfg = useMemo(
    () => ({ ...BUNDLE_DEFAULTS, ...promos.bundle }),
    [promos.bundle],
  );

  return useMemo(() => {
    const out: Record<string, BagOffer | null> = {};
    for (const group of groups) {
      out[group.shopId] = pickBagOffer(group.lines, { products, cfg, flash, bundleCfg });
    }
    return out;
  }, [groups, products, cfg, flash, bundleCfg]);
}
