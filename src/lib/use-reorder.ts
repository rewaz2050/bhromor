"use client";

/**
 * Hook behind every "Order again" button. Plans against the live catalog,
 * respects the single-shop bag (a bag holding another shop's pieces is
 * only replaced after the shopper confirms), adds the lines and opens the
 * bag so the next tap is "Checkout".
 */

import { useCallback, useState } from "react";
import { useOptionalCart } from "@/components/cart/cart-provider";
import { useLiveCatalog } from "./use-live-catalog";
import { lineShopIds, productShopId, shopById } from "./shop-utils";
import { planReorder, type ReorderLine, type ReorderPlan } from "./reorder";

export type ReorderOutcome =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "conflict"; fromShopName: string; plan: ReorderPlan }
  | { kind: "done"; added: number; skipped: ReorderPlan["skipped"] };

export function useReorder() {
  const cart = useOptionalCart();
  const { products, shops, loading } = useLiveCatalog();
  const [outcome, setOutcome] = useState<ReorderOutcome>({ kind: "idle" });
  const detail = cart?.detail ?? EMPTY_DETAIL;

  const apply = useCallback(
    (plan: ReorderPlan) => {
      if (!cart) return;
      for (const a of plan.add) cart.addItem(a.product.id, a.variantLabel, a.qty);
      if (plan.add.length > 0) cart.openBag();
      setOutcome({ kind: "done", added: plan.add.length, skipped: plan.skipped });
    },
    [cart],
  );

  const reorder = useCallback(
    (lines: ReorderLine[]) => {
      if (!cart) return;
      if (loading) {
        setOutcome({ kind: "loading" });
        return;
      }
      const plan = planReorder(lines, products);
      const fallbackShopId = shops[0]?.id ?? "";
      const targetShops = new Set(plan.add.map((a) => productShopId(a.product, fallbackShopId)));
      const other = lineShopIds(detail, fallbackShopId).find((id) => !targetShops.has(id));
      if (plan.add.length > 0 && other !== undefined) {
        setOutcome({
          kind: "conflict",
          fromShopName: shopById(shops, other)?.name ?? "another shop",
          plan,
        });
        return;
      }
      apply(plan);
    },
    [apply, cart, detail, loading, products, shops],
  );

  /** Confirm the staged conflict: empty the bag, then add the old order. */
  const replaceBag = useCallback(() => {
    if (outcome.kind !== "conflict" || !cart) return;
    cart.clear();
    apply(outcome.plan);
  }, [apply, cart, outcome]);

  const reset = useCallback(() => setOutcome({ kind: "idle" }), []);

  /** False outside a <CartProvider> — the button then renders nothing. */
  return { reorder, replaceBag, reset, outcome, catalogLoading: loading, available: cart !== null };
}

const EMPTY_DETAIL: never[] = [];
