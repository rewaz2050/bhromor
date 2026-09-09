/**
 * Guarded add-to-bag (marketplace slice 4, D1).
 *
 * Shared by the product page and quick-add: adding from the bag's shop
 * goes straight through; adding from a second shop stages a conflict the
 * caller renders via <ShopConflictDialog>. Confirming clears the old bag
 * first — the server validator + RPC re-enforce single-shop either way.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { useLiveCatalog } from "./use-live-catalog";
import { lineShopIds, productShopId, shopById } from "./shop-utils";
import type { Product } from "./catalog";

export interface ShopConflict {
  fromShopId: string;
  fromShopName: string;
  toShopId: string;
  toShopName: string;
  productId: string;
  variantLabel: string;
  qty: number;
}

export function useGuardedAdd() {
  const { detail, addItem, clear } = useCart();
  const { shops } = useLiveCatalog();
  const [conflict, setConflict] = useState<ShopConflict | null>(null);

  const fallbackShopId = shops[0]?.id ?? "";
  const shopName = useCallback(
    (id: string): string => shopById(shops, id)?.name ?? "this shop",
    [shops],
  );

  const bagShopIds = useMemo(
    () => lineShopIds(detail, fallbackShopId),
    [detail, fallbackShopId],
  );

  /**
   * Returns true when the add went through, false when a conflict was
   * staged (render <ShopConflictDialog> from `conflict`, then confirm or
   * dismiss). Legacy/uncatalogued lines resolve nothing and never block.
   */
  const add = useCallback(
    (product: Product, variantLabel: string, qty = 1): boolean => {
      const toShopId = productShopId(product, fallbackShopId);
      const other = bagShopIds.find((id) => id !== toShopId);
      if (other !== undefined) {
        setConflict({
          fromShopId: other,
          fromShopName: shopName(other),
          toShopId,
          toShopName: shopName(toShopId),
          productId: product.id,
          variantLabel,
          qty,
        });
        return false;
      }
      addItem(product.id, variantLabel, qty);
      return true;
    },
    [addItem, bagShopIds, fallbackShopId, shopName],
  );

  const confirmConflict = useCallback((): ShopConflict | null => {
    if (!conflict) return null;
    clear();
    addItem(conflict.productId, conflict.variantLabel, conflict.qty);
    const done = conflict;
    setConflict(null);
    return done;
  }, [addItem, clear, conflict]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return { add, conflict, confirmConflict, dismissConflict, shopName };
}
