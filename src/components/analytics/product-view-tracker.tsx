"use client";

import { useEffect } from "react";
import type { Product } from "@/lib/catalog";
import { itemFromProduct, track } from "@/lib/analytics";

/** One ViewContent / view_item per product page open. Renders nothing. */
export default function ProductViewTracker({ product }: { product: Product }) {
  useEffect(() => {
    track({ type: "view_item", item: itemFromProduct(product) });
    // Only when the product itself changes — not on every price/stock refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);
  return null;
}
