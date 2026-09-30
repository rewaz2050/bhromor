"use client";

/**
 * B4 (2026-09-28) — marks the page as this shop's storefront while it is on
 * screen, so the route tracker's `page_view` carries the shop id and the shop's
 * own funnel starts at "someone opened my page". Renders nothing; clears itself
 * on the way out (see `lib/page-shop.ts`).
 */

import { useEffect } from "react";
import { setPageShop } from "@/lib/page-shop";

export default function ShopAttribute({ shopId }: { shopId: string }) {
  useEffect(() => {
    setPageShop(shopId);
    return () => setPageShop(null);
  }, [shopId]);
  return null;
}
