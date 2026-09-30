"use client";

import { useCallback } from "react";
import { productHref } from "./product-url";
import { useLiveCatalog } from "./use-live-catalog";

/**
 * C5 — the storefront link for a piece, for components that hold a product
 * but not the shop list (a rail row, a share button, a chat suggestion).
 *
 * Falls back to `/product/<slug>` while the catalog is still loading or when
 * the piece's shop is not published: that address still answers (it sends the
 * visitor on to the shop-scoped one), which beats a dead link.
 */
export function useProductHref(): (
  product: Parameters<typeof productHref>[0],
) => string {
  const { shops } = useLiveCatalog();
  return useCallback(
    (product: Parameters<typeof productHref>[0]) => productHref(product, shops),
    [shops],
  );
}
