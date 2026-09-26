"use client";

/**
 * UX plan §6 (R5) — "You may also like" under the order receipt.
 *
 * The order is placed and the bag is empty: the session should not end
 * here. Complements of what was just bought first (`completeTheLook`), then
 * more from the same shelves, in stock only, never the pieces just ordered.
 * Renders nothing with fewer than two candidates — an "also like" row with
 * one card is noise.
 */

import { useMemo } from "react";
import ProductRail from "@/components/home/product-rail";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Product } from "@/lib/catalog";
import { goesWith } from "@/lib/home-shelves";
import { useLiveCatalog } from "@/lib/use-live-catalog";

export const RECEIPT_RAIL_MIN = 2;

/** Kept as the receipt's name for the shared `goesWith` picker. */
export const receiptSuggestions = (ordered: Product[], products: Product[], limit = 8): Product[] =>
  goesWith(ordered, products, limit);

export default function ReceiptRail({ ordered }: { ordered: Product[] }) {
  const { t } = useLanguage();
  const { products } = useLiveCatalog();
  const items = useMemo(() => receiptSuggestions(ordered, products), [ordered, products]);
  if (items.length < RECEIPT_RAIL_MIN) return null;
  return (
    <ProductRail
      id="receipt-rail"
      testId="receipt-rail"
      eyebrow={t("checkout.railEyebrow")}
      title={t("checkout.railTitle")}
      sub={t("checkout.railSub")}
      href="/shop"
      seeAllLabel={t("checkout.continueShopping")}
      products={items}
      tone="paper"
    />
  );
}
